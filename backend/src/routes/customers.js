import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { triggerCustomerSync } from '../lib/customerSync.js'
import { createRemoteSession, closeRemoteSession, getRemoteSession } from '../lib/remoteProxy.js'
import { createNatRemoteSession, closeNatRemoteSession, getNatRemoteSession } from '../lib/remoteProxyNatV2.js'
import { findCustomerInterface, getDirectCustomerTraffic } from '../lib/directTraffic.js'
import { createDriver } from '../drivers/registry.js'
import { withDriver } from '../drivers/BaseDriver.js'

const router = Router()
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function syncOdpUsedPorts(odpId, tx = prisma) {
  if (!odpId) return
  const count = await tx.customer.count({ where: { odpId } })
  await tx.odp.update({ where: { id: odpId }, data: { usedPorts: count } })
}

/**
 * Resolve splitterPortId ke SplitterPort.id yang valid.
 * Frontend bisa mengirim format "splitterInstanceId:portNum" (dari OdpPortSelector)
 * atau langsung UUID SplitterPort. Return null jika tidak ditemukan.
 */
async function resolvePortId(raw) {
  if (!raw) return null
  if (raw.includes(':')) {
    const [instanceId, portNumStr] = raw.split(':')
    const port = await prisma.splitterPort.findFirst({
      where: { splitterInstanceId: instanceId, portNumber: parseInt(portNumStr) },
      select: { id: true },
    })
    return port?.id ?? null
  }
  // Cek apakah sudah UUID valid
  const port = await prisma.splitterPort.findUnique({
    where: { id: raw },
    select: { id: true },
  })
  return port?.id ?? null
}

/**
 * Claim sebuah SplitterPort untuk customer tertentu.
 * Set connectionStatus=CONNECTED, connectedToType='CUSTOMER', connectedToId=customerId
 */
async function claimSplitterPort(splitterPortId, customerId, tx = prisma) {
  if (!splitterPortId) return
  await tx.splitterPort.update({
    where: { id: splitterPortId },
    data: {
      connectionStatus: 'CONNECTED',
      connectedToType:  'CUSTOMER',
      connectedToId:    customerId,
    },
  })
}

/**
 * Lepas SplitterPort — reset ke AVAILABLE jika masih terhubung ke customer ini.
 * Pakai customerId sebagai guard agar tidak melepas port milik customer lain.
 */
async function releaseSplitterPort(splitterPortId, customerId, tx = prisma) {
  if (!splitterPortId) return
  await tx.splitterPort.updateMany({
    where: {
      id:              splitterPortId,
      connectedToId:   customerId,   // hanya lepas jika memang milik customer ini
      connectedToType: 'CUSTOMER',
    },
    data: {
      connectionStatus: 'AVAILABLE',
      connectedToType:  null,
      connectedToId:    null,
    },
  })
}

// ── GET /api/customers ────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    void triggerCustomerSync().catch(error => {
      console.error(`[customer-sync] ${error.message}`)
    })
    const { q, status, connectionStatus, odpId, page = '1', limit = '50' } = req.query
    const take = Math.min(parseInt(limit) || 50, 200)
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take

    const where = {}
    if (status) where.serviceStatus = status.toUpperCase()
    if (connectionStatus) where.connectionStatus = connectionStatus.toUpperCase()
    if (odpId)  where.odpId = odpId
    if (q) {
      where.OR = [
        { name:          { contains: q, mode: 'insensitive' } },
        { customerId:    { contains: q, mode: 'insensitive' } },
        { address:       { contains: q, mode: 'insensitive' } },
        { pppoeUsername: { contains: q, mode: 'insensitive' } },
        { onuSn:         { contains: q, mode: 'insensitive' } },
      ]
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        include: {
          odp: { select: { id: true, name: true } },
          sourceDevice: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
        take,
        skip,
      }),
    ])

    res.json({ data: customers, total, page: parseInt(page), limit: take })
  } catch (e) { next(e) }
})

// ── GET /api/customers/stats ──────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    void triggerCustomerSync().catch(error => {
      console.error(`[customer-sync] ${error.message}`)
    })
    const groups = await prisma.customer.groupBy({
      by: ['serviceStatus'],
      _count: { _all: true },
    })
    const stats = { ACTIVE: 0, SUSPENDED: 0, TERMINATED: 0, ONLINE: 0, OFFLINE: 0, UNKNOWN: 0, total: 0 }
    groups.forEach(g => {
      stats[g.serviceStatus] = g._count._all
      stats.total += g._count._all
    })
    const connectionGroups = await prisma.customer.groupBy({
      by: ['connectionStatus'],
      _count: { _all: true },
    })
    connectionGroups.forEach(g => { stats[g.connectionStatus] = g._count._all })
    const [activeOnline, activeOffline] = await Promise.all([
      prisma.customer.count({ where: { serviceStatus: 'ACTIVE', connectionStatus: 'ONLINE' } }),
      prisma.customer.count({ where: { serviceStatus: 'ACTIVE', connectionStatus: 'OFFLINE' } }),
    ])
    stats.ONLINE = activeOnline
    stats.OFFLINE = activeOffline
    const syncDevices = await prisma.device.findMany({
      where: { type: 'ROUTER', vendor: { not: null } },
      select: { id: true, name: true, vendor: true, customerSyncAt: true, customerSyncStatus: true, customerSyncError: true },
    })
    res.json({
      ...stats,
      customerSync: syncDevices
        .filter(device => /mikrotik|routeros/i.test(device.vendor || ''))
        .map(({ id, name, vendor, customerSyncAt, customerSyncStatus, customerSyncError }) => ({
          deviceId: id,
          deviceName: name,
          vendor,
          lastSyncAt: customerSyncAt,
          status: customerSyncStatus || 'PENDING',
          error: customerSyncError,
        })),
    })
  } catch (e) { next(e) }
})

// ── GET /api/customers/:id ────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        odp: {
          include: {
            olt: { select: { id: true, name: true } },
          },
        },
        splitterPort: {
          include: {
            splitterInstance: {
              include: { splitterType: true },
            },
          },
        },
        sourceDevice: { select: { id: true, name: true, ip: true, mgmtPort: true, snmpCommunity: true, snmpVersion: true } },
      },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    res.json(customer)
  } catch (e) { next(e) }
})

// ── GET /api/customers/:id/traffic ───────────────────────────────────────────

router.get('/:id/traffic', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        pppoeUsername: true,
        sourceDevice: { select: { id: true, name: true, ip: true, mgmtPort: true, snmpCommunity: true, snmpVersion: true } },
      },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (!customer.pppoeUsername || !customer.sourceDevice) {
      return res.json({ configured: false, reason: 'PPPoE session atau perangkat sumber belum tersedia' })
    }

    const port = await findCustomerInterface({ username: customer.pppoeUsername, device: customer.sourceDevice })
    res.json({
      configured: Boolean(port),
      username: customer.pppoeUsername,
      device: { id: customer.sourceDevice.id, hostname: customer.sourceDevice.name },
      port: port ? {
        id: port.ifIndex,
        name: port.name,
        description: port.description,
        alias: port.alias,
        status: port.operStatus,
      } : null,
    })
  } catch (e) {
    res.status(502).json({ error: 'SNMP error', detail: e.message })
  }
})

// ── GET /api/customers/:id/traffic/series ────────────────────────────────────

router.get('/:id/traffic/series', async (req, res, next) => {
  try {
    const rangeHours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 }[req.query.range] || 24
    const samples = await prisma.customerTrafficSample.findMany({
      where: { customerId: req.params.id, sampledAt: { gte: new Date(Date.now() - rangeHours * 60 * 60 * 1000) } },
      orderBy: { sampledAt: 'asc' },
      select: { sampledAt: true, inBps: true, outBps: true },
    })
    res.json({ intervalSeconds: 300, samples: samples.map(sample => ({ timestamp: sample.sampledAt, inBps: sample.inBps, outBps: sample.outBps })) })
  } catch (e) { next(e) }
})

// ── GET /api/customers/:id/traffic/live ──────────────────────────────────────

router.get('/:id/traffic/live', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        pppoeUsername: true,
        sourceDevice: true,
      },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (!customer.pppoeUsername || !customer.sourceDevice) {
      return res.status(422).json({ error: 'PPPoE session atau perangkat sumber belum tersedia' })
    }

    const device = customer.sourceDevice
    const isMikrotik = /mikrotik|routeros/i.test(device.vendor || '') || device.mgmtProtocol === 'API'

    // 1. MikroTik instant monitor-traffic via RouterOS API (30-40ms response)
    if (isMikrotik) {
      try {
        const driver = createDriver(device)
        const rate = await withDriver(driver, async d => {
          const cleanUser = customer.pppoeUsername.trim()
          const candidateNames = [
            `<pppoe-${cleanUser}>`,
            `pppoe-${cleanUser}`,
            cleanUser,
          ]

          for (const ifaceName of candidateNames) {
            try {
              const mon = await d._cmd('/interface/monitor-traffic', [
                `=interface=${ifaceName}`,
                '=once='
              ])
              if (mon && mon[0]) {
                const rxBps = Number(mon[0]['rx-bits-per-second'] || 0)
                const txBps = Number(mon[0]['tx-bits-per-second'] || 0)
                return {
                  timestamp: new Date().toISOString(),
                  inBps: rxBps,
                  outBps: txBps,
                  source: 'mikrotik-api',
                }
              }
            } catch (_) {}
          }
          return null
        })

        if (rate) {
          res.set('Cache-Control', 'private, max-age=1')
          return res.json(rate)
        }
      } catch (err) {
        console.warn(`[traffic/live:${customer.pppoeUsername}] RouterOS API fallback to SNMP: ${err.message}`)
      }
    }

    // 2. Fallback to SNMP
    const mapping = await findCustomerInterface({ username: customer.pppoeUsername, device })
    const directRate = await getDirectCustomerTraffic({
      username: customer.pppoeUsername,
      device,
      ifIndex: mapping?.ifIndex,
    })
    const rate = directRate?.unavailable ? null : directRate
    if (!rate) return res.status(425).json({ error: 'Menunggu pembacaan SNMP berikutnya' })
    res.set('Cache-Control', 'private, max-age=1')
    res.json({ ...rate, source: 'snmp-realtime' })
  } catch (e) {
    res.status(502).json({ error: 'Traffic error', detail: e.message })
  }
})

// ── GET /api/customers/:id/traffic/graph ─────────────────────────────────────

router.get('/:id/traffic/graph', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { pppoeUsername: true, sourceDevice: { select: { name: true, ip: true } } },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (!customer.pppoeUsername || !customer.sourceDevice) {
      return res.status(422).json({ error: 'PPPoE session atau perangkat sumber belum tersedia' })
    }

    const rangeHours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 }[req.query.range] || 24
    const samples = await prisma.customerTrafficSample.findMany({
      where: { customerId: req.params.id, sampledAt: { gte: new Date(Date.now() - rangeHours * 60 * 60 * 1000) } },
      orderBy: { sampledAt: 'asc' },
      select: { sampledAt: true, inBps: true, outBps: true },
    })
    res.set('Cache-Control', 'private, max-age=60')
    res.json({ intervalSeconds: 300, samples: samples.map(sample => ({ timestamp: sample.sampledAt, inBps: sample.inBps, outBps: sample.outBps })) })
  } catch (e) {
    res.status(502).json({ error: 'Traffic error', detail: e.message })
  }
})

// ── Temporary remote ONU access ──────────────────────────────────────────────

router.post('/:id/remote-session', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  let usingNatV2 = false
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        ipAddress: true,
        onuSn: true,
        onuIndex: true,
        odp: { select: { olt: { select: { vendor: true, model: true } } } },
      },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (!customer.ipAddress) return res.status(422).json({ error: 'IP ONU belum tersedia' })

    const publicUrl = process.env.REMOTE_PROXY_PUBLIC_URL || `${req.protocol}://${req.hostname}`
    const targetPort = Number(process.env.REMOTE_PROXY_TARGET_PORT || 80)
    const proxySettings = await prisma.remoteOnuSetting.findUnique({ where: { id: 'remote-onu' } })
    if (proxySettings?.version === 'v2') {
      usingNatV2 = true
      const session = await createNatRemoteSession({
        targetHost: customer.ipAddress,
        targetPort,
        ownerId: req.user.id,
        customerId: req.params.id,
        publicUrl,
        sourceCidr: proxySettings.natSourceCidr,
        ingressInterface: proxySettings.natIngressInterface,
      })
      if (process.env.REMOTE_PROXY_DIAGNOSTICS !== 'false') {
        const userAgent = String(req.headers['user-agent'] || '')
        console.info('[remote-diag]', JSON.stringify({
          event: 'session-created',
          session: session.id.slice(0, 8),
          version: 'v2',
          platform: /android|iphone|ipad|ipod|mobile/i.test(userAgent) ? 'mobile' : /windows|macintosh|linux|x11/i.test(userAgent) ? 'desktop' : 'unknown',
          userAgent: userAgent.slice(0, 240),
          onuIp: customer.ipAddress,
          onuModel: 'unknown (not stored)',
          onuSerialSuffix: customer.onuSn ? customer.onuSn.slice(-4) : null,
          onuIndex: customer.onuIndex,
          oltVendor: customer.odp?.olt?.vendor || null,
          oltModel: customer.odp?.olt?.model || null,
        }))
      }
      return res.status(201).json(session)
    }

    const session = await createRemoteSession({
      targetHost: customer.ipAddress,
      targetPort,
      ownerId: req.user.id,
      customerId: req.params.id,
      publicUrl,
      onuSerial: customer.onuSn,
      onuIndex: customer.onuIndex,
      oltVendor: customer.odp?.olt?.vendor,
      oltModel: customer.odp?.olt?.model,
      clientUserAgent: req.headers['user-agent'],
    })
    res.status(201).json(session)
  } catch (e) {
    if (usingNatV2) {
      const validationError = /^(IP ONU|NAT v2 hanya mendukung|Port ONU|Interface ingress|Allowlist|Port NAT|REMOTE_PROXY_PUBLIC_URL)/i.test(e.message)
      return res.status(validationError ? 422 : 503).json({ error: e.message })
    }
    if (/IP ONU|Port ONU|port range|Jumlah sesi|Gagal membuka|PUBLIC_URL/.test(e.message)) {
      return res.status(422).json({ error: e.message })
    }
    next(e)
  }
})

router.get('/:id/remote-session/:sessionId', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  const session = getNatRemoteSession(req.params.sessionId, req.user.id, req.params.id)
    || getRemoteSession(req.params.sessionId, req.user.id, req.params.id)
  if (!session) return res.status(404).json({ error: 'Remote session expired or not found' })
  res.json(session)
})

router.delete('/:id/remote-session/:sessionId', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const closedNat = await closeNatRemoteSession(req.params.sessionId, req.user.id, req.params.id)
    if (!closedNat) closeRemoteSession(req.params.sessionId, req.user.id, req.params.id)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

// ── POST /api/customers ───────────────────────────────────────────────────────

router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const {
      customerId, name, phone, address, lat, lng,
      odpId, odpPort, splitterPortId,
      onuSn, onuIndex, rxPower, txPower,
      packageName, packageSpeed, vlan, ipAddress, pppoeUsername, pppoePassword,
      installerName, installDate, contractExpiry,
      serviceStatus, notes,
    } = req.body

    if (!customerId) return res.status(400).json({ error: 'customerId wajib diisi' })
    if (!name)       return res.status(400).json({ error: 'name wajib diisi' })

    // Resolve format "instanceId:portNum" → SplitterPort UUID
    const resolvedPortId = await resolvePortId(splitterPortId)

    // Validasi: pastikan SplitterPort tidak sedang dipakai customer lain
    if (resolvedPortId) {
      const port = await prisma.splitterPort.findUnique({
        where: { id: resolvedPortId },
        select: { connectionStatus: true, connectedToId: true },
      })
      if (port && port.connectionStatus === 'CONNECTED' && port.connectedToId) {
        return res.status(409).json({ error: 'Port splitter sudah digunakan oleh pelanggan lain' })
      }
    }

    const customer = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.create({
        data: {
          customerId, name, phone: phone || null, address,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          odpId:          odpId || null,
          odpPort:        odpPort ? parseInt(odpPort) : null,
          splitterPortId: resolvedPortId || null,
          onuSn:          onuSn || null,
          onuIndex:       onuIndex || null,
          rxPower:        rxPower != null ? parseFloat(rxPower) : null,
          txPower:        txPower != null ? parseFloat(txPower) : null,
          packageName:    packageName || null,
          packageSpeed:   packageSpeed ? parseInt(packageSpeed) : null,
          vlan:           vlan ? parseInt(vlan) : null,
          ipAddress:      ipAddress || null,
          pppoeUsername:  pppoeUsername || null,
          pppoePassword:  pppoePassword || null,
          installerName:  installerName || null,
          installDate:    installDate ? new Date(installDate) : null,
          contractExpiry: contractExpiry ? new Date(contractExpiry) : null,
          serviceStatus:  serviceStatus || 'ACTIVE',
          notes:          notes || null,
        },
      })
      await claimSplitterPort(resolvedPortId || null, c.id, tx)
      await syncOdpUsedPorts(odpId || null, tx)
      return c
    })

    res.status(201).json(customer)
  } catch (e) {
    if (e.code === 'P2002') {
      const field = e.meta?.target?.[0] ?? 'field'
      return res.status(409).json({ error: `Nilai ${field} sudah digunakan` })
    }
    next(e)
  }
})

// ── PATCH /api/customers/:id ──────────────────────────────────────────────────

router.patch('/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { odpId: true, splitterPortId: true },
    })
    if (!existing) return res.status(404).json({ error: 'Customer not found' })

    const {
      customerId, name, phone, address, lat, lng,
      odpId, odpPort, splitterPortId,
      onuSn, onuIndex, rxPower, txPower,
      packageName, packageSpeed, vlan, ipAddress, pppoeUsername, pppoePassword,
      installerName, installDate, contractExpiry,
      serviceStatus, notes,
    } = req.body

    const oldSplitterPortId = existing.splitterPortId
    // Resolve format "instanceId:portNum" → SplitterPort UUID
    const resolvedNewPortId = splitterPortId !== undefined
      ? await resolvePortId(splitterPortId)
      : existing.splitterPortId
    const newSplitterPortId = resolvedNewPortId

    const data = {}
    if (customerId    !== undefined) data.customerId    = customerId
    if (name          !== undefined) data.name          = name
    if (phone         !== undefined) data.phone         = phone || null
    if (address       !== undefined) data.address       = address
    if (lat           !== undefined) data.lat           = lat ? parseFloat(lat) : null
    if (lng           !== undefined) data.lng           = lng ? parseFloat(lng) : null
    if (odpId         !== undefined) data.odpId         = odpId || null
    if (odpPort       !== undefined) data.odpPort       = odpPort ? parseInt(odpPort) : null
    if (splitterPortId !== undefined) data.splitterPortId = resolvedNewPortId || null
    if (onuSn         !== undefined) data.onuSn         = onuSn || null
    if (onuIndex      !== undefined) data.onuIndex      = onuIndex || null
    if (rxPower       !== undefined) data.rxPower       = rxPower != null ? parseFloat(rxPower) : null
    if (txPower       !== undefined) data.txPower       = txPower != null ? parseFloat(txPower) : null
    if (packageName   !== undefined) data.packageName   = packageName || null
    if (packageSpeed  !== undefined) data.packageSpeed  = packageSpeed ? parseInt(packageSpeed) : null
    if (vlan          !== undefined) data.vlan          = vlan ? parseInt(vlan) : null
    if (ipAddress     !== undefined) data.ipAddress     = ipAddress || null
    if (pppoeUsername !== undefined) data.pppoeUsername = pppoeUsername || null
    if (pppoePassword !== undefined) data.pppoePassword = pppoePassword || null
    if (installerName !== undefined) data.installerName = installerName || null
    if (installDate   !== undefined) data.installDate   = installDate ? new Date(installDate) : null
    if (contractExpiry !== undefined) data.contractExpiry = contractExpiry ? new Date(contractExpiry) : null
    if (serviceStatus !== undefined) data.serviceStatus = serviceStatus
    if (notes         !== undefined) data.notes         = notes || null
    const portChanged = newSplitterPortId !== oldSplitterPortId

    // Validasi port baru tidak sedang dipakai customer lain
    if (portChanged && newSplitterPortId) {
      const port = await prisma.splitterPort.findUnique({
        where: { id: newSplitterPortId },
        select: { connectionStatus: true, connectedToId: true },
      })
      if (port && port.connectionStatus === 'CONNECTED' && port.connectedToId !== req.params.id) {
        return res.status(409).json({ error: 'Port splitter sudah digunakan oleh pelanggan lain' })
      }
    }

    const customer = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.update({ where: { id: req.params.id }, data })

      // Lepas port lama jika berbeda
      if (portChanged && oldSplitterPortId) {
        await releaseSplitterPort(oldSplitterPortId, req.params.id, tx)
      }
      // Claim port baru
      if (portChanged && newSplitterPortId) {
        await claimSplitterPort(newSplitterPortId, req.params.id, tx)
      }

      // Sync usedPorts ODP lama dan baru
      const oldOdp = existing.odpId
      const newOdp = data.odpId !== undefined ? (data.odpId || null) : existing.odpId
      if (oldOdp && oldOdp !== newOdp) await syncOdpUsedPorts(oldOdp, tx)
      if (newOdp) await syncOdpUsedPorts(newOdp, tx)

      return c
    })

    res.json(customer)
  } catch (e) {
    if (e.code === 'P2002') {
      const field = e.meta?.target?.[0] ?? 'field'
      return res.status(409).json({ error: `Nilai ${field} sudah digunakan` })
    }
    next(e)
  }
})

// ── DELETE /api/customers/:id ─────────────────────────────────────────────────

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { odpId: true, splitterPortId: true, name: true },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    await prisma.$transaction(async (tx) => {
      // 1. Release SplitterPort dulu — connectedToId masih terisi id ini
      if (customer.splitterPortId) {
        await releaseSplitterPort(customer.splitterPortId, req.params.id, tx)
      }
      // 2. Delete customer (Prisma akan null-kan FK splitterPortId otomatis via onDelete:SetNull tidak ada —
      //    tapi karena kita sudah null connectedToId di SplitterPort, aman)
      await tx.customer.delete({ where: { id: req.params.id } })
      // 3. Sync ODP usedPorts
      await syncOdpUsedPorts(customer.odpId, tx)
    })

    res.status(204).end()
  } catch (e) { next(e) }
})

export default router
