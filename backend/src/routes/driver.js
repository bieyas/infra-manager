import { Router } from 'express'
import prisma      from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { createDriver, driverInfo }  from '../drivers/registry.js'
import { withDriver }                from '../drivers/BaseDriver.js'
import { getSnapshot, setSnapshot, invalidateSnapshot, cacheStats } from '../lib/snapshotCache.js'
import { selectCustomerForDevice }   from '../lib/customerSync.js'

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
      select: { id: true, type: true, vendor: true, model: true },
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
      selectCustomerForDevice(existingCustomers, username, device.id),
    ]))
    const secretByUsername = new Map(secrets.filter(secret => secret.username).map(secret => [secret.username.toLowerCase(), secret]))

    const usedIds = new Set(existingCustomers.map(customer => customer.customerId))
    const rows = await Promise.all(sessions.map(async session => {
      const secret = secretByUsername.get(session.username?.toLowerCase())
      const existing = existingByUsername.get(session.username?.toLowerCase()) ?? null
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
      selectCustomerForDevice(existingCustomers, username, device.id),
    ]))
    const secretByUsername = new Map(imported.secrets.filter(secret => secret.username).map(secret => [secret.username.toLowerCase(), secret]))
    const results = []
    const usedIds = new Set(existingCustomers.map(customer => customer.customerId))

    for (const session of selected) {
      const secret = secretByUsername.get(session.username.toLowerCase())
      const existing = existingByUsername.get(session.username.toLowerCase())
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

export default router
