import { Router } from 'express'
import prisma      from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { autoResolveSplitterPort, claimSplitterPort, releaseSplitterPort, syncOdpUsedPorts, assertPortAvailable } from './customers.js'
import { createDriver, driverInfo }  from '../drivers/registry.js'
import { withDriver }                from '../drivers/BaseDriver.js'
import { getSnapshot, setSnapshot, invalidateSnapshot, cacheStats } from '../lib/snapshotCache.js'
import { matchCustomerForDevice }   from '../lib/customerSync.js'

const router = Router()
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch device with decryptable credential fields */
async function getDeviceWithCreds(id) {
  return prisma.device.findUnique({
    where:  { id },
    select: {
      id: true, name: true, ip: true, type: true,
      vendor: true, model: true,
      mgmtProtocol: true, mgmtPort: true, mgmtUsername: true,
      ponCount: true,
      mgmtPassword: true,   // encrypted — driver will decrypt
      snmpCommunity: true,  // encrypted — driver will decrypt
      snmpVersion: true,
    },
  })
}

export function normalizeCustomerComment(comment) {
  const value = String(comment || '').trim()
  const explicitId = value.match(/^(.+?)\s*-\s*(\d{6,})$/)
  const suffixId = value.match(/^([A-Za-z][A-Za-z\s]*?)(\d{6,})$/)
  const atFormat = value.match(/^(.+?)@([^\s]+)$/)
  const namePart = explicitId?.[1] || suffixId?.[1] || atFormat?.[1] || value
  const customerId = explicitId?.[2] || suffixId?.[2] || null
  const normalizedName = namePart
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const name = /^[A-Z\s]+$/.test(normalizedName)
    ? normalizedName
    : normalizedName
        .replace(/^Arief\b/i, 'Arie')
        .replace(/\b\w/g, char => char.toUpperCase())

  return { name: name || null, customerId }
}

async function generateCustomerId(usedIds = new Set()) {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(-2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const prefix = `${yy}${mm}${dd}`
  const existing = await prisma.customer.findMany({
    where: { customerId: { startsWith: prefix } },
    select: { customerId: true },
  })
  const taken = new Set([...existing.map(row => row.customerId), ...usedIds])
  let sequence = 1
  while (taken.has(`${prefix}${String(sequence).padStart(3, '0')}`)) sequence += 1
  const id = `${prefix}${String(sequence).padStart(3, '0')}`
  usedIds.add(id)
  return id
}

async function resolveCustomerIdentity(comment, usedIds, existingCustomerId = null) {
  const normalized = normalizeCustomerComment(comment)
  if (normalized.customerId) {
    const conflict = await prisma.customer.findUnique({ where: { customerId: normalized.customerId }, select: { id: true } })
    if (!conflict || conflict.id === existingCustomerId) {
      usedIds.add(normalized.customerId)
      return normalized
    }
  }
  return {
    name: normalized.name,
    customerId: await generateCustomerId(usedIds),
  }
}

// ── GET /api/driver/:deviceId/info
// Returns driver name + capabilities (no connection required)
router.get('/:deviceId/info', async (req, res, next) => {
  try {
    const device = await prisma.device.findUnique({
      where:  { id: req.params.deviceId },
      select: { id: true, type: true, vendor: true, model: true, mgmtProtocol: true },
    })
    if (!device) return res.status(404).json({ error: 'Device not found' })

    res.json({ deviceId: device.id, ...driverInfo(device) })
  } catch (e) { next(e) }
})

// ── GET /api/driver/:deviceId/status
// Connect to device, fetch live status, disconnect
router.get('/:deviceId/status', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    const status = await withDriver(driver, d => d.getStatus())
    res.json(status)
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/:deviceId/interfaces
router.get('/:deviceId/interfaces', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    const ifaces = await withDriver(driver, d => d.getInterfaces())
    res.json(ifaces || [])
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/:deviceId/ip-addresses
router.get('/:deviceId/ip-addresses', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    const result = await withDriver(driver, d => d.getIpAddresses())
    if (result === null) return res.status(501).json({ error: 'Not supported by this driver' })
    res.json(result)
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/:deviceId/routes
router.get('/:deviceId/routes', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    const result = await withDriver(driver, d => d.getRoutes())
    if (result === null) return res.status(501).json({ error: 'Not supported by this driver' })
    res.json(result)
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/:deviceId/neighbors
router.get('/:deviceId/neighbors', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    const result = await withDriver(driver, d => d.getNeighbors())
    if (result === null) return res.status(501).json({ error: 'Not supported by this driver' })
    res.json(result)
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/:deviceId/resource
router.get('/:deviceId/resource', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    const result = await withDriver(driver, d => d.getResource())
    if (result === null) return res.status(501).json({ error: 'Not supported by this driver' })
    res.json(result)
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── POST /api/driver/:deviceId/exec
// Body: { command: string, params?: object }
// ADMIN only — arbitrary command execution is privileged
router.post('/:deviceId/exec', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { command, params } = req.body
    if (!command) return res.status(422).json({ error: 'command is required' })

    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    const result = await withDriver(driver, d => d.exec(command, params || {}))
    if (result === null) return res.status(501).json({ error: 'exec not supported by this driver' })
    res.json({ command, result })
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/cache-stats  (ADMIN only — debug)
router.get('/cache-stats', requireRole('ADMIN'), (req, res) => {
  res.json(cacheStats())
})

// ── GET /api/driver/:deviceId/snapshot
// One call that returns all available data (respects capabilities).
// Results are cached per device (OLT=60s, others=30s).
// Pass ?refresh=1 to force a live fetch and bust the cache.
router.get('/:deviceId/snapshot', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const forceRefresh = req.query.refresh === '1'

    // Serve from cache if fresh
    if (!forceRefresh) {
      const cached = getSnapshot(device.id)
      if (cached) {
        return res.json({ ...cached, fromCache: true })
      }
    }

    const driver = createDriver(device)
    const { capabilities } = driver.constructor
    const isOlt = device.type === 'OLT'

    const snapshot = await withDriver(driver, async d => {
      if (isOlt) {
        // SNMP drivers support concurrent requests; Telnet must be sequential
        const isSnmp = driver.constructor.driverName?.toLowerCase().includes('snmp')

        let status, ponResult, resource
        if (isSnmp) {
          // Parallel fetch for SNMP-based OLT drivers
          ;[status, ponResult, resource] = await Promise.all([
            d.getStatus().catch(() => null),
            capabilities.ponPorts ? d.getPonPorts().catch(() => null) : null,
            capabilities.resource ? d.getResource().catch(() => null) : null,
          ])
        } else {
          // Sequential execution — Telnet cannot handle concurrent commands
          status = await d.getStatus().catch(() => null)
          const isOnline = status?.alive || status?.online || true
          // Skip heavy getPonPorts if device is unreachable — saves 45s timeout
          ponResult = (capabilities.ponPorts && isOnline !== false)
            ? await d.getPonPorts().catch(() => null)
            : null
          resource = capabilities.resource
            ? await d.getResource().catch(() => null)
            : null
        }
        let ethernetInterfaces = null
        let ethernetInterfacesError = null
        if (capabilities.ethernetInterfaces) {
          try {
            ethernetInterfaces = await d.getEthernetInterfaces()
          } catch (error) {
            ethernetInterfacesError = error.message
          }
        }
        // getPonPorts returns { ports, globalOnline, globalTotal }
        let ponPorts      = ponResult?.ports    || (Array.isArray(ponResult) ? ponResult : null)
        const globalOnline = ponResult?.globalOnline || null
        const globalTotal  = ponResult?.globalTotal  || null

        // Fill in missing PON ports (those with 0 ONUs don't appear in CLI output)
        if (ponPorts && device.ponCount) {
          const existingPorts = new Set(ponPorts.map(p => p.port))
          for (let i = 1; i <= device.ponCount; i++) {
            // Detect slot format from existing ports (e.g. "1/1/1" → slot "1/1/")
            const samplePort = ponPorts[0]?.port ?? `1/1/${i}`
            const slotPrefix = samplePort.replace(/\d+$/, '')  // "1/1/" from "1/1/1"
            const portKey = `${slotPrefix}${i}`
            if (!existingPorts.has(portKey)) {
              ponPorts.push({
                id:         `gpon-olt_${portKey}`,
                port:       portKey,
                totalOnu:   0,
                onlineOnu:  0,
                offlineOnu: 0,
                running:    false,
              })
            }
          }
          // Re-sort by port number
          ponPorts.sort((a, b) => a.port.localeCompare(b.port, undefined, { numeric: true }))
        }

        return {
          status, interfaces: ponPorts, ponPorts,
          ethernetInterfaces, ethernetInterfacesError,
          globalOnline, globalTotal,
          ipAddresses: null, routes: null, neighbors: null,
          resource: resource ?? null,
        }
      }

      // Non-OLT: concurrent fetch (SSH/API drivers support it)
      const [status, interfaces, ipAddresses, routes, neighbors, pppoeSessions, pppSecrets, resource] = await Promise.allSettled([
        d.getStatus(),
        capabilities.interfaces  ? d.getInterfaces()  : null,
        capabilities.ipAddresses ? d.getIpAddresses() : null,
        capabilities.routes      ? d.getRoutes()      : null,
        capabilities.neighbors   ? d.getNeighbors()   : null,
        capabilities.pppoeSessions ? d.getPppoeSessions() : null,
        capabilities.pppSecrets ? d.getPppSecrets() : null,
        capabilities.resource    ? d.getResource()    : null,
      ])
      const sourceResults = { status, interfaces, ipAddresses, routes, neighbors, pppoeSessions, pppSecrets, resource }
      const sourceErrors = Object.fromEntries(
        Object.entries(sourceResults)
          .filter(([, result]) => result.status === 'rejected')
          .map(([name, result]) => [name, result.reason?.message || 'Driver request failed'])
      )
      const publicPppSecrets = pppSecrets?.value?.map(({ password, ...secret }) => secret) || null
      return {
        status:      status.value       || null,
        interfaces:  interfaces?.value  || null,
        ipAddresses: ipAddresses?.value || null,
        routes:      routes?.value      || null,
        neighbors:   neighbors?.value   || null,
        pppoeSessions: pppoeSessions?.value || null,
        pppSecrets: publicPppSecrets,
        resource:    resource?.value    || null,
        sourceErrors,
      }
    })

    const payload = {
      deviceId:   device.id,
      driverName: driver.constructor.driverName,
      capabilities,
      snapshot,
      fetchedAt:  new Date(),
    }

    setSnapshot(device.id, payload, device.type)
    res.json({ ...payload, fromCache: false })

    // Fire-and-forget: sync live interfaces → DB (non-OLT only)
    if (!isOlt && Array.isArray(snapshot.interfaces) && snapshot.interfaces.length > 0) {
      const ifaceRows = snapshot.interfaces
      Promise.allSettled(
        ifaceRows.map(iface => {
          const statusVal = iface.running === true || iface.running === 'true' ? 'UP' : 'DOWN'
          return prisma.interface.upsert({
            where:  { deviceId_name: { deviceId: device.id, name: iface.name } },
            update: {
              ifType:      iface.type        || undefined,
              vid:         iface.vlanId      != null ? Number(iface.vlanId) : undefined,
              description: iface.comment    || iface.description || undefined,
              macAddress:  iface.macAddress || iface.mac        || undefined,
              speed:       iface.speed      != null ? Number(iface.speed) : undefined,
              status:      statusVal,
              inBps:       iface.rxBytes    != null ? BigInt(iface.rxBytes)  : undefined,
              outBps:      iface.txBytes    != null ? BigInt(iface.txBytes)  : undefined,
            },
            create: {
              deviceId:    device.id,
              name:        iface.name,
              ifType:      iface.type        || null,
              vid:         iface.vlanId      != null ? Number(iface.vlanId) : null,
              description: iface.comment    || iface.description || null,
              macAddress:  iface.macAddress || iface.mac        || null,
              speed:       iface.speed      != null ? Number(iface.speed) : null,
              status:      statusVal,
              inBps:       iface.rxBytes    != null ? BigInt(iface.rxBytes)  : null,
              outBps:      iface.txBytes    != null ? BigInt(iface.txBytes)  : null,
            },
          })
        })
      ).catch(() => {})
    }
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/:deviceId/customer-import-preview
// Build a read-only mapping from active RouterOS sessions to Customer records.
router.get('/:deviceId/customer-import-preview', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    if (typeof driver.getPppoeSessions !== 'function') {
      return res.status(501).json({ error: 'Driver does not support active sessions' })
    }

    const { sessions, secrets } = await withDriver(driver, async d => {
      const [activeSessions, pppSecrets] = await Promise.all([
        d.getPppoeSessions(),
        typeof d.getPppSecrets === 'function' ? d.getPppSecrets() : [],
      ])
      return { sessions: activeSessions, secrets: pppSecrets }
    })

    const usernames = [...new Set(sessions.map(session => session.username).filter(Boolean))]
    const existingCustomers = usernames.length > 0
      ? await prisma.customer.findMany({
          where: { OR: usernames.map(username => ({ pppoeUsername: { equals: username, mode: 'insensitive' } })) },
          select: { id: true, customerId: true, name: true, pppoeUsername: true, serviceStatus: true, connectionSourceDeviceId: true },
        })
      : []
    const existingByUsername = new Map(usernames.map(username => [
      username.toLowerCase(),
      matchCustomerForDevice(existingCustomers, username, device.id),
    ]))
    const secretByUsername = new Map(secrets.filter(secret => secret.username).map(secret => [secret.username.toLowerCase(), secret]))

    const usedIds = new Set(existingCustomers.map(customer => customer.customerId))
    const rows = await Promise.all(sessions.map(async session => {
      const secret = secretByUsername.get(session.username?.toLowerCase())
      const match = existingByUsername.get(session.username?.toLowerCase())
      const existing = match.customer
      if (match.ambiguous) {
        return {
          username: session.username,
          service: session.service,
          address: session.address,
          callerId: session.callerId,
          uptime: session.uptime,
          profile: secret?.profile ?? null,
          rateLimit: secret?.rateLimit ?? null,
          comment: session.comment || secret?.comment || null,
          normalizedName: null,
          suggestedCustomerId: null,
          existing: null,
          action: 'AMBIGUOUS',
          error: 'Ada beberapa data pelanggan dengan username PPPoE ini; perlu pemeriksaan manual.',
        }
      }
      const comment = session.comment || secret?.comment
      const identity = await resolveCustomerIdentity(comment, usedIds, existing?.id)
      return {
        username: session.username,
        service: session.service,
        address: session.address,
        callerId: session.callerId,
        uptime: session.uptime,
        profile: secret?.profile ?? null,
        rateLimit: secret?.rateLimit ?? null,
        comment: session.comment || secret?.comment || null,
        normalizedName: identity.name,
        suggestedCustomerId: existing?.customerId || identity.customerId,
        existing,
        action: existing ? 'UPDATE' : 'CREATE',
      }
    }))

    res.json({
      deviceId: device.id,
      deviceName: device.name,
      total: rows.length,
      create: rows.filter(row => row.action === 'CREATE').length,
      update: rows.filter(row => row.action === 'UPDATE').length,
      ambiguous: rows.filter(row => row.action === 'AMBIGUOUS').length,
      rows,
      fetchedAt: new Date(),
    })
  } catch (e) {
    res.status(502).json({ error: 'Customer import preview failed', detail: e.message })
  }
})

// ── POST /api/driver/:deviceId/customer-import
// Import selected active sessions. Existing customers are matched by PPPoE username.
router.post('/:deviceId/customer-import', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const usernames = Array.isArray(req.body?.usernames)
      ? [...new Set(req.body.usernames.map(value => String(value).trim()).filter(Boolean))]
      : null
    if (usernames && usernames.length === 0) return res.status(400).json({ error: 'Pilih minimal satu username' })

    const driver = createDriver(device)
    if (typeof driver.getPppoeSessions !== 'function') {
      return res.status(501).json({ error: 'Driver does not support active sessions' })
    }
    const imported = await withDriver(driver, async d => {
      const [activeSessions, secrets] = await Promise.all([
        d.getPppoeSessions(),
        typeof d.getPppSecrets === 'function' ? d.getPppSecrets() : [],
      ])
      return { activeSessions, secrets }
    })

    const selected = imported.activeSessions.filter(session => !usernames || usernames.includes(session.username))
    if (selected.length === 0) return res.status(400).json({ error: 'Tidak ada active session yang cocok' })

    const selectedNames = selected.map(session => session.username)
    const [existingCustomers, deviceRow] = await Promise.all([
      prisma.customer.findMany({ where: { OR: selectedNames.map(username => ({ pppoeUsername: { equals: username, mode: 'insensitive' } })) } }),
      prisma.device.findUnique({ where: { id: device.id }, select: { name: true } }),
    ])
    const existingByUsername = new Map(selectedNames.map(username => [
      username.toLowerCase(),
      matchCustomerForDevice(existingCustomers, username, device.id),
    ]))
    const secretByUsername = new Map(imported.secrets.filter(secret => secret.username).map(secret => [secret.username.toLowerCase(), secret]))
    const results = []
    const usedIds = new Set(existingCustomers.map(customer => customer.customerId))

    for (const session of selected) {
      const secret = secretByUsername.get(session.username.toLowerCase())
      const match = existingByUsername.get(session.username.toLowerCase())
      const existing = match.customer
      if (match.ambiguous) {
        results.push({
          username: session.username,
          action: 'ERROR',
          error: 'Ada beberapa data pelanggan dengan username PPPoE ini; perlu pemeriksaan manual.',
        })
        continue
      }
      const comment = session.comment || secret?.comment
      const normalized = normalizeCustomerComment(comment)
      const identity = await resolveCustomerIdentity(comment, usedIds, existing?.id)
      const packageSpeed = parseRateLimitSpeed(secret?.rateLimit)
      const checkedAt = new Date()
      await prisma.PppoeSession.upsert({
        where: { deviceId_username: { deviceId: device.id, username: session.username } },
        create: {
          deviceId: device.id,
          username: session.username,
          sessionId: session.sessionId,
          service: session.service,
          ipAddress: session.address,
          callerId: session.callerId,
          uptime: session.uptime,
          profile: secret?.profile || null,
          rateLimit: secret?.rateLimit || null,
          comment,
          isActive: true,
          firstSeenAt: checkedAt,
          lastSeenAt: checkedAt,
          lastCheckedAt: checkedAt,
        },
        update: {
          sessionId: session.sessionId,
          service: session.service,
          ipAddress: session.address,
          callerId: session.callerId,
          uptime: session.uptime,
          profile: secret?.profile || null,
          rateLimit: secret?.rateLimit || null,
          comment,
          isActive: true,
          lastSeenAt: checkedAt,
          lastCheckedAt: checkedAt,
        },
      })
      const data = {
        name: identity.name || session.username,
        pppoeUsername: session.username,
        pppoePassword: secret?.password || undefined,
        serviceStatus: 'ACTIVE',
        connectionStatus: 'ONLINE',
        connectionSourceDeviceId: device.id,
        connectionLastSeen: checkedAt,
        connectionLastChecked: checkedAt,
      }
      if (session.address) data.ipAddress = session.address
      if (secret?.profile) data.packageName = secret.profile
      if (packageSpeed != null) data.packageSpeed = packageSpeed
      if (!existing || (normalized.customerId && identity.customerId !== existing.customerId)) data.customerId = identity.customerId

      try {
        const customer = existing
          ? await prisma.customer.update({ where: { id: existing.id }, data })
          : await prisma.customer.create({
              data: {
                customerId: identity.customerId,
                notes: `Imported from MikroTik ${deviceRow?.name || device.name}`,
                ...data,
              },
            })
        results.push({ username: session.username, action: existing ? 'UPDATE' : 'CREATE', customer })
      } catch (error) {
        results.push({ username: session.username, action: 'ERROR', error: error.code === 'P2002' ? 'Customer ID sudah digunakan' : error.message })
      }
    }

    res.json({
      total: results.length,
      created: results.filter(result => result.action === 'CREATE').length,
      updated: results.filter(result => result.action === 'UPDATE').length,
      failed: results.filter(result => result.action === 'ERROR').length,
      results,
    })
  } catch (e) {
    res.status(502).json({ error: 'Customer import failed', detail: e.message })
  }
})

function parseRateLimitSpeed(rateLimit) {
  const value = String(rateLimit || '').split('/')[0].trim().toUpperCase()
  const match = value.match(/^(\d+(?:\.\d+)?)([KMG]?)B?$/)
  if (!match) return null
  const multiplier = { '': 1, K: 1 / 1000, M: 1, G: 1000 }[match[2]]
  return Math.round(Number(match[1]) * multiplier)
}

// ── GET /api/driver/:deviceId/olt/onus?port=1/1/1
// List all ONUs on a PON port (state + SN merged). OLT devices only.
router.get('/:deviceId/olt/onus', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })
    if (device.type !== 'OLT') return res.status(400).json({ error: 'Device is not an OLT' })

    const ponPort = req.query.port || '1/1/1'
    const driver  = createDriver(device)

    if (typeof driver.getOnuList !== 'function') {
      return res.status(501).json({ error: 'Driver does not support getOnuList' })
    }

    const onus = await withDriver(driver, d => d.getOnuList(ponPort))
    res.json({ ponPort, onus, fetchedAt: new Date() })
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/:deviceId/olt/pon-power?port=1/1/1
// SFP Transceiver Tx Power for a specific PON port.
// If port=all, returns power for ALL PON ports.
router.get('/:deviceId/olt/pon-power', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })
    if (device.type !== 'OLT') return res.status(400).json({ error: 'Device is not an OLT' })

    const driver = createDriver(device)
    if (typeof driver.getPonPower !== 'function') {
      return res.status(501).json({ error: 'Driver does not support getPonPower' })
    }

    const portParam = req.query.port || 'all'

    if (portParam === 'all') {
      if (typeof driver.getAllPonPower !== 'function') {
        return res.status(501).json({ error: 'Driver does not support getAllPonPower' })
      }
      const results = await withDriver(driver, d => d.getAllPonPower())
      return res.json({ ports: results, fetchedAt: new Date() })
    }

    const result = await withDriver(driver, d => d.getPonPower(portParam))
    res.json({ ...result, fetchedAt: new Date() })
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/:deviceId/olt/onu/:index
// Full detail + optical power for one ONU. index format: "1/1/1:5"
router.get('/:deviceId/olt/onu/:index', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })
    if (device.type !== 'OLT') return res.status(400).json({ error: 'Device is not an OLT' })

    const onuIndex = req.params.index   // e.g. "1/1/1:5" or "0/1:1"
    if (!/^\d+(\/\d+)+:\d+$/.test(onuIndex)) {
      return res.status(422).json({ error: 'Invalid ONU index format. Expected S/C/P:ID e.g. 1/1/1:5 or 0/1:1' })
    }

    const driver = createDriver(device)
    if (typeof driver.getOnuDetail !== 'function') {
      return res.status(501).json({ error: 'Driver does not support getOnuDetail' })
    }

    const result = await withDriver(driver, async d => {
      const detail = await d.getOnuDetail(onuIndex)
      const power  = typeof d.getOnuPower === 'function'
        ? await d.getOnuPower(onuIndex).catch(() => null)
        : null
      const macs = typeof d.getOnuMac === 'function'
        ? await d.getOnuMac(onuIndex).catch(() => null)
        : null
      return { detail, power, macs }
    })

    res.json({ onuIndex, ...result, fetchedAt: new Date() })
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})

// ── GET /api/driver/:deviceId/olt/onu-by-sn/:sn
// Find ONU index by serial number
router.get('/:deviceId/olt/onu-by-sn/:sn', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })
    if (device.type !== 'OLT') return res.status(400).json({ error: 'Device is not an OLT' })

    const driver = createDriver(device)
    if (typeof driver.findOnuBySn !== 'function') {
      return res.status(501).json({ error: 'Driver does not support findOnuBySn' })
    }

    const onuIndex = await withDriver(driver, d => d.findOnuBySn(req.params.sn))
    if (!onuIndex) return res.status(404).json({ error: 'ONU not found', sn: req.params.sn })
    res.json({ sn: req.params.sn, onuIndex })
  } catch (e) {
    res.status(502).json({ error: 'Driver error', detail: e.message })
  }
})


// ?? OUI Vendors & Optical Evaluation ??????????????????????????????????????????

const OUI_VENDORS = [
  { prefix: 'b4:e4:6b', vendor: 'VSOL / C-Data' },
  { prefix: '00:11:46', vendor: 'FiberHome' },
  { prefix: '00:11:41', vendor: 'FiberHome' },
  { prefix: '14:00:7d', vendor: 'ZTE / OEM' },
  { prefix: 'e0:67:b3', vendor: 'Huawei' },
  { prefix: '00:25:9e', vendor: 'Huawei' },
  { prefix: '48:8a:d2', vendor: 'ZTE' },
  { prefix: 'a0:c5:89', vendor: 'FiberHome' },
  { prefix: '70:a8:e3', vendor: 'VSOL' },
  { prefix: '00:1a:2b', vendor: 'BDCOM' },
]

function detectVendorFromMac(mac) {
  if (!mac) return 'Unknown'
  const clean = mac.toLowerCase().replace(/[^a-f0-9]/g, '')
  if (clean.length < 6) return 'Unknown'
  const prefix = `${clean.slice(0, 2)}:${clean.slice(2, 4)}:${clean.slice(4, 6)}`
  const match = OUI_VENDORS.find(v => v.prefix === prefix)
  return match ? match.vendor : 'Generic ONU'
}

function evaluateRxPower(rx) {
  if (rx == null || isNaN(rx)) return { level: 'unknown', label: 'Belum Ada Data', color: 'muted' }
  const val = Number(rx)
  if (val >= -24.0) return { level: 'good', label: 'Bagus', color: 'emerald' }
  if (val >= -27.0) return { level: 'warning', label: 'Perlu Perhatian', color: 'amber' }
  return { level: 'critical', label: 'Kritis (LOS Risk)', color: 'rose' }
}

// ?? GET /api/driver/:deviceId/olt/autofind
// Scan OLT for all connected ONUs, cross-reference with DB Customer records,
// classify into unprovisioned (new) vs provisioned.
router.get('/:deviceId/olt/autofind', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })
    if (device.type !== 'OLT') return res.status(400).json({ error: 'Device is not an OLT' })

    const driver = createDriver(device)
    let rawOnus = []
    if (typeof driver.getAutofindOnus === 'function') {
      rawOnus = await withDriver(driver, d => d.getAutofindOnus())
    } else if (typeof driver.getOnuList === 'function') {
      const ponCount = device.ponCount || 4
      for (let i = 1; i <= ponCount; i++) {
        const port = `0/${i}`
        const list = await withDriver(driver, d => d.getOnuList(port)).catch(() => [])
        rawOnus.push(...list)
      }
    } else {
      return res.status(501).json({ error: 'Driver does not support autofind' })
    }

    const [allCustomers, odps] = await Promise.all([
      prisma.customer.findMany({
        select: {
          id: true,
          customerId: true,
          name: true,
          pppoeUsername: true,
          onuSn: true,
          onuIndex: true,
          rxPower: true,
          txPower: true,
          odpId: true,
          odpPort: true,
          packageName: true,
          address: true,
          odp: { select: { id: true, name: true } },
        },
      }),
      prisma.odp.findMany({
        select: { id: true, name: true, ponPort: true, splitterRatio: true, usedPorts: true },
        orderBy: { name: 'asc' },
      }),
    ])

    const customerByMac = new Map()
    const customerByIndex = new Map()
    const customerByName = new Map()
    const customerByUsername = new Map()

    for (const c of allCustomers) {
      if (c.onuSn) customerByMac.set(c.onuSn.toLowerCase(), c)
      if (c.onuIndex) customerByIndex.set(c.onuIndex, c)
      if (c.name) customerByName.set(c.name.trim().toLowerCase(), c)
      if (c.pppoeUsername) customerByUsername.set(c.pppoeUsername.trim().toLowerCase(), c)
    }

    const unassignedCustomers = allCustomers
      .filter(c => !c.onuSn && !c.onuIndex)
      .map(c => ({
        id: c.id,
        customerId: c.customerId,
        name: c.name,
        pppoeUsername: c.pppoeUsername,
        packageName: c.packageName,
        address: c.address,
      }))

    const provisioned = []
    const unprovisioned = []

    for (const onu of rawOnus) {
      const macClean = onu.mac ? onu.mac.toLowerCase() : null
      const onuIndex = onu.index
      const onuName = (onu.name && onu.name !== 'N/A') ? onu.name.trim() : null

      let matchedCustomer = null
      let matchSource = null

      if (macClean && customerByMac.has(macClean)) {
        matchedCustomer = customerByMac.get(macClean)
        matchSource = 'mac'
      } else if (onuIndex && customerByIndex.has(onuIndex)) {
        matchedCustomer = customerByIndex.get(onuIndex)
        matchSource = 'index'
      } else if (onuName && customerByName.has(onuName.toLowerCase())) {
        matchedCustomer = customerByName.get(onuName.toLowerCase())
        matchSource = 'name'
      } else if (onuName && customerByUsername.has(onuName.toLowerCase())) {
        matchedCustomer = customerByUsername.get(onuName.toLowerCase())
        matchSource = 'pppoeUsername'
      }

      const health = evaluateRxPower(onu.rxPower)
      const vendor = detectVendorFromMac(onu.mac)

      const enriched = {
        ...onu,
        vendor,
        health,
        matchedCustomer: matchedCustomer ? {
          id: matchedCustomer.id,
          customerId: matchedCustomer.customerId,
          name: matchedCustomer.name,
          pppoeUsername: matchedCustomer.pppoeUsername,
          packageName: matchedCustomer.packageName,
          odp: matchedCustomer.odp,
          odpPort: matchedCustomer.odpPort,
        } : null,
        matchSource,
      }

      if (matchedCustomer && (matchedCustomer.onuSn || matchedCustomer.onuIndex)) {
        provisioned.push(enriched)
      } else {
        enriched.suggestedCustomer = matchedCustomer ? {
          id: matchedCustomer.id,
          customerId: matchedCustomer.customerId,
          name: matchedCustomer.name,
          pppoeUsername: matchedCustomer.pppoeUsername,
        } : null
        unprovisioned.push(enriched)
      }
    }

    res.json({
      deviceId: device.id,
      deviceName: device.name,
      totalOnus: rawOnus.length,
      unprovisionedCount: unprovisioned.length,
      provisionedCount: provisioned.length,
      unprovisioned,
      provisioned,
      unassignedCustomers,
      odps,
      fetchedAt: new Date(),
    })
  } catch (e) {
    res.status(502).json({ error: 'Autofind failed', detail: e.message })
  }
})

// ?? POST /api/driver/:deviceId/olt/provision
// Provision an ONU: configure description & profile on OLT, link to Customer & ODP in DB
router.post('/:deviceId/olt/provision', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { ponPort, onuId, mac, description, srvProfileId, customerId, odpId, odpPort, splitterPortId } = req.body
    if (!ponPort || onuId == null) {
      return res.status(400).json({ error: 'ponPort dan onuId wajib diisi' })
    }

    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })
    if (device.type !== 'OLT') return res.status(400).json({ error: 'Device is not an OLT' })

    const driver = createDriver(device)
    let oltResult = null
    if (typeof driver.provisionOnu === 'function') {
      oltResult = await withDriver(driver, d => d.provisionOnu({
        ponPort,
        onuId,
        mac,
        description,
        srvProfileId: srvProfileId || 609,
      }))
    }

    let customer = null
    const onuIndex = `${String(ponPort).replace(/^epon/i, '')}:${onuId}`

    if (customerId) {
      let liveRxPower = null
      let liveTxPower = null
      if (typeof driver.getOnuPower === 'function') {
        const p = await withDriver(driver, d => d.getOnuPower(onuIndex)).catch(() => null)
        liveRxPower = p?.onuRxPower ?? p?.oltRxPower ?? null
        liveTxPower = p?.onuTxPower ?? null
      }

      const existingCust = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { odpId: true, odpPort: true, splitterPortId: true }
      })

      // Resolve splitter port if ODP and port are specified
      let targetSplitterPortId = null
      if (odpId || splitterPortId) {
        try {
          const check = await assertPortAvailable({
            odpId: odpId || null,
            odpPort: odpPort ? Number(odpPort) : null,
            splitterPortId: splitterPortId || null,
            excludeCustomerId: customerId,
          })
          targetSplitterPortId = check.resolvedPortId
        } catch (err) {
          if (err.status === 409) return res.status(409).json({ error: err.message })
          throw err
        }
      }

      customer = await prisma.$transaction(async (tx) => {
        // Release old port if customer was previously connected to another port
        if (existingCust?.splitterPortId && existingCust.splitterPortId !== targetSplitterPortId) {
          await releaseSplitterPort(existingCust.splitterPortId, customerId, tx)
        }

        // Claim new port
        if (targetSplitterPortId) {
          await claimSplitterPort(targetSplitterPortId, customerId, tx)
        }

        const updated = await tx.customer.update({
          where: { id: customerId },
          data: {
            onuSn: mac ? mac.toLowerCase() : undefined,
            onuIndex,
            rxPower: liveRxPower ?? undefined,
            txPower: liveTxPower ?? undefined,
            odpId: odpId || undefined,
            odpPort: odpPort ? Number(odpPort) : undefined,
            splitterPortId: targetSplitterPortId || undefined,
            serviceStatus: 'ACTIVE',
            connectionStatus: 'ONLINE',
            connectionLastSeen: new Date(),
            connectionLastChecked: new Date(),
          },
        })

        if (odpId) await syncOdpUsedPorts(odpId, tx)
        if (existingCust?.odpId && existingCust.odpId !== odpId) {
          await syncOdpUsedPorts(existingCust.odpId, tx)
        }

        return updated
      })

      if (liveRxPower != null) {
        await prisma.powerReading.create({
          data: {
            nodeType: 'CUSTOMER',
            nodeId: customerId,
            pointType: 'CUSTOMER_RX',
            measuredPower: liveRxPower,
            referencePower: -20.0,
            deviation: Number((liveRxPower - (-20.0)).toFixed(2)),
            measuredBy: req.user?.username || 'system',
            notes: `Aktivasi ZTP OLT port ${onuIndex} (MAC: ${mac || '?'})`,
          },
        }).catch(() => {})
      }
    }

    res.json({
      success: true,
      message: `ONU ${onuIndex} berhasil di-provisioning`,
      onuIndex,
      oltResult,
      customer,
    })
  } catch (e) {
    res.status(502).json({ error: 'Provisioning failed', detail: e.message })
  }
})

// ?? POST /api/driver/:deviceId/olt/onu/:index/reboot
router.post('/:deviceId/olt/onu/:index/reboot', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const onuIndex = req.params.index
    const m = onuIndex.match(/^(?:epon)?(\d+\/\d+):(\d+)$/i)
    if (!m) return res.status(400).json({ error: 'Format ONU index tidak valid. Contoh: 0/1:1' })

    const ponPort = m[1]
    const onuId = parseInt(m[2], 10)

    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    if (typeof driver.rebootOnu !== 'function') {
      return res.status(501).json({ error: 'Driver does not support rebootOnu' })
    }

    const result = await withDriver(driver, d => d.rebootOnu({ ponPort, onuId }))
    res.json({ success: true, message: `Perintah reboot berhasil dikirim ke ONU ${onuIndex}`, result })
  } catch (e) {
    res.status(502).json({ error: 'Reboot failed', detail: e.message })
  }
})

// ?? DELETE /api/driver/:deviceId/olt/onu/:index
router.delete('/:deviceId/olt/onu/:index', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const onuIndex = req.params.index
    const m = onuIndex.match(/^(?:epon)?(\d+\/\d+):(\d+)$/i)
    if (!m) return res.status(400).json({ error: 'Format ONU index tidak valid. Contoh: 0/1:1' })

    const ponPort = m[1]
    const onuId = parseInt(m[2], 10)
    const mac = req.query.mac || null
    const unbindCustomer = req.query.unbindCustomer === '1'

    const device = await getDeviceWithCreds(req.params.deviceId)
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const driver = createDriver(device)
    let result = null
    if (typeof driver.deregisterOnu === 'function') {
      result = await withDriver(driver, d => d.deregisterOnu({ ponPort, onuId, mac }))
    }

    if (unbindCustomer) {
      await prisma.customer.updateMany({
        where: {
          OR: [
            { onuIndex },
            ...(mac ? [{ onuSn: { equals: mac, mode: 'insensitive' } }] : [])
          ]
        },
        data: {
          onuSn: null,
          onuIndex: null,
        }
      })
    }

    res.json({ success: true, message: `ONU ${onuIndex} berhasil di-deregister`, result })
  } catch (e) {
    res.status(502).json({ error: 'Deregister failed', detail: e.message })
  }
})

export default router
