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

export async function syncOdpUsedPorts(odpId, tx = prisma) {
  if (!odpId) return
  const splitterCount = await tx.splitterInstance.count({ where: { odpId } })
  let count = 0
  if (splitterCount > 0) {
    count = await tx.splitterPort.count({
      where: {
        splitterInstance: { odpId },
        connectionStatus: 'CONNECTED',
        connectedToType: { in: ['CUSTOMER', 'ODP'] }
      }
    })
  } else {
    const custCount = await tx.customer.count({ where: { odpId } })
    const dlCount = await tx.odp.count({ where: { uplinkOdpId: odpId } })
    count = custCount + dlCount
  }
  await tx.odp.update({ where: { id: odpId }, data: { usedPorts: count } })
}

/**
 * Resolve splitterPortId ke SplitterPort.id yang valid.
 * Frontend bisa mengirim format "splitterInstanceId:portNum" (dari OdpPortSelector)
 * atau langsung UUID SplitterPort. Return null jika tidak ditemukan.
 */
export async function resolvePortId(raw) {
  if (!raw) return null
  const str = String(raw).trim()
  if (str.includes(':')) {
    const [instanceId, portNumStr] = str.split(':')
    const port = await prisma.splitterPort.findFirst({
      where: { splitterInstanceId: instanceId, portNumber: parseInt(portNumStr, 10) },
      select: { id: true, portNumber: true },
    })
    return port?.id ?? null
  }
  try {
    const port = await prisma.splitterPort.findUnique({
      where: { id: str },
      select: { id: true, portNumber: true },
    })
    return port?.id ?? null
  } catch {
    return null
  }
}

/**
 * Auto-resolve splitterPortId jika hanya odpId dan odpPort yang diberikan.
 */
export async function autoResolveSplitterPort(odpId, odpPort, splitterPortId) {
  if (splitterPortId) {
    const resolved = await resolvePortId(splitterPortId)
    if (resolved) return resolved
  }
  if (odpId && odpPort) {
    // Prioritaskan splitter simetris (PLC drop pelanggan) jika ada
    const portSym = await prisma.splitterPort.findFirst({
      where: {
        splitterInstance: { 
          odpId,
          splitterType: { category: 'SYMMETRIC' }
        },
        portNumber: parseInt(odpPort, 10),
        portType: { not: 'PASS_THROUGH' },
      },
      select: { id: true }
    })
    if (portSym) return portSym.id

    const port = await prisma.splitterPort.findFirst({
      where: {
        splitterInstance: { odpId },
        portNumber: parseInt(odpPort, 10),
        portType: { not: 'PASS_THROUGH' },
      },
      orderBy: { splitterInstance: { sequenceOrder: 'desc' } },
      select: { id: true }
    })
    return port?.id ?? null
  }
  return null
}

/**
 * Claim sebuah SplitterPort untuk customer tertentu.
 * Set connectionStatus=CONNECTED, connectedToType='CUSTOMER', connectedToId=customerId
 */
export async function claimSplitterPort(splitterPortId, customerId, tx = prisma) {
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
export async function releaseSplitterPort(splitterPortId, customerId, tx = prisma) {
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

/**
 * Memastikan sebuah port ODP / SplitterPort belum digunakan oleh pelanggan lain atau ODP downlink.
 * Melempar error dengan status 409 jika port konflik.
 */
export async function assertPortAvailable({ odpId, odpPort, splitterPortId, excludeCustomerId = null, tx = prisma }) {
  if (!odpId && !splitterPortId) return { available: true, resolvedPortId: null }

  let targetPortId = null
  if (splitterPortId) {
    targetPortId = await resolvePortId(splitterPortId)
  }
  if (!targetPortId && odpId && odpPort) {
    targetPortId = await autoResolveSplitterPort(odpId, odpPort, null)
  }

  // 1. Validasi di tabel SplitterPort
  if (targetPortId) {
    const port = await tx.splitterPort.findUnique({
      where: { id: targetPortId },
      include: {
        splitterInstance: { include: { odp: { select: { id: true, name: true } } } }
      }
    })

    if (port) {
      const odpName = port.splitterInstance?.odp?.name || 'ODP'

      if (port.connectedToType === 'SPLITTER') {
        const err = new Error(`Port ${port.portNumber} pada ODP "${odpName}" adalah internal feeder yang disambung ke Splitter berikutnya dan tidak dapat digunakan untuk pelanggan.`)
        err.status = 409
        throw err
      }

      if (port.portType === 'PASS_THROUGH') {
        const err = new Error(`Port ${port.portNumber} pada ODP "${odpName}" adalah port PASS-THROUGH (feeder) dan tidak dapat digunakan untuk pelanggan.`)
        err.status = 409
        throw err
      }

      if (port.connectionStatus === 'CONNECTED' && port.connectedToType === 'ODP') {
        let childName = 'ODP Lain'
        if (port.connectedToId) {
          const childOdp = await tx.odp.findUnique({ where: { id: port.connectedToId }, select: { name: true } })
          if (childOdp) childName = childOdp.name
        }
        const err = new Error(`Port ${port.portNumber} pada ODP "${odpName}" sudah digunakan sebagai feeder uplink untuk ODP "${childName}".`)
        err.status = 409
        throw err
      }

      if (port.connectionStatus === 'CONNECTED' && port.connectedToType === 'CUSTOMER') {
        if (!excludeCustomerId || port.connectedToId !== excludeCustomerId) {
          let occupantName = 'pelanggan lain'
          if (port.connectedToId) {
            const occCust = await tx.customer.findUnique({ where: { id: port.connectedToId }, select: { name: true, customerId: true } })
            if (occCust) occupantName = `pelanggan ${occCust.name} (${occCust.customerId})`
          }
          const err = new Error(`Port ${port.portNumber} pada ODP "${odpName}" sudah digunakan oleh ${occupantName}. Satu port tidak boleh digunakan oleh lebih dari 1 pelanggan.`)
          err.status = 409
          throw err
        }
      }
    }
  }

  // 2. Validasi numerik di tabel Customer (mencegah duplikasi odpId + odpPort)
  if (odpId && odpPort) {
    const pNum = parseInt(odpPort, 10)
    const existing = await tx.customer.findFirst({
      where: {
        odpId,
        odpPort: pNum,
        ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {})
      },
      select: { id: true, name: true, customerId: true, odp: { select: { name: true } } }
    })

    if (existing) {
      const odpName = existing.odp?.name || 'ODP'
      const err = new Error(`Port ${pNum} pada ODP "${odpName}" sudah digunakan oleh pelanggan ${existing.name} (${existing.customerId}). Satu port tidak boleh digunakan oleh lebih dari 1 pelanggan.`)
      err.status = 409
      throw err
    }
  }

  return { available: true, resolvedPortId: targetPortId }
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
          htbBox: { select: { id: true, name: true, modelType: true } },
          htbPort: { select: { id: true, portType: true, portIndex: true, label: true, wavelength: true } },
          hostedHtbBoxes: { select: { id: true, name: true } },
          bridgedHtbBoxes: { select: { id: true, name: true } },
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
        htbBox: {
          include: {
            ports: true,
            uplinkHtb: { select: { id: true, name: true } },
          },
        },
        htbPort: true,
        hostedHtbBoxes: { select: { id: true, name: true, modelType: true, address: true } },
        bridgedHtbBoxes: { select: { id: true, name: true, modelType: true, address: true } },
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
      distributionType, htbBoxId, htbPortId, cpeType,
      onuSn, onuIndex, rxPower, txPower,
      packageName, packageSpeed, vlan, ipAddress, pppoeUsername, pppoePassword,
      installerName, installDate, contractExpiry,
      serviceStatus, notes,
    } = req.body

    if (!customerId) return res.status(400).json({ error: 'customerId wajib diisi' })
    if (!name)       return res.status(400).json({ error: 'name wajib diisi' })

    // Resolve format "instanceId:portNum" → SplitterPort UUID
    // Validasi defensif: pastikan port tidak sedang dipakai pelanggan lain / ODP lain
    let resolvedPortId = null
    try {
      if (distributionType !== 'HTB') {
        const check = await assertPortAvailable({
          odpId: odpId || null,
          odpPort: odpPort ? parseInt(odpPort, 10) : null,
          splitterPortId: splitterPortId || null,
          excludeCustomerId: null,
        })
        resolvedPortId = check.resolvedPortId
      }
      if (distributionType === 'HTB' && htbPortId) {
        await assertHtbPortAvailable({ htbBoxId, htbPortId, excludeCustomerId: null })
      }
    } catch (err) {
      if (err.status === 409) return res.status(409).json({ error: err.message })
      throw err
    }

    const customer = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.create({
        data: {
          customerId, name, phone: phone || null, address,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          distributionType: distributionType || 'ODP',
          odpId:          distributionType === 'HTB' ? null : (odpId || null),
          odpPort:        distributionType === 'HTB' ? null : (odpPort ? parseInt(odpPort) : null),
          splitterPortId: distributionType === 'HTB' ? null : (resolvedPortId || null),
          htbBoxId:       distributionType === 'HTB' ? (htbBoxId || null) : null,
          htbPortId:      distributionType === 'HTB' ? (htbPortId || null) : null,
          cpeType:        cpeType || null,
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
      if (distributionType !== 'HTB') {
        await claimSplitterPort(resolvedPortId || null, c.id, tx)
        await syncOdpUsedPorts(odpId || null, tx)
      } else if (htbPortId) {
        await claimHtbPort(htbPortId, c.id, tx)
      }
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
      distributionType, htbBoxId, htbPortId, cpeType,
      onuSn, onuIndex, rxPower, txPower,
      packageName, packageSpeed, vlan, ipAddress, pppoeUsername, pppoePassword,
      installerName, installDate, contractExpiry,
      serviceStatus, notes,
    } = req.body

    const oldSplitterPortId = existing.splitterPortId
    const targetOdpId = odpId !== undefined ? odpId : existing.odpId
    const targetOdpPort = odpPort !== undefined ? odpPort : existing.odpPort

    let resolvedNewPortId = null
    if (splitterPortId !== undefined) {
      resolvedNewPortId = await resolvePortId(splitterPortId)
    } else if (existing.splitterPortId && (odpId !== undefined || odpPort !== undefined)) {
      resolvedNewPortId = null
    } else {
      resolvedNewPortId = existing.splitterPortId
    }

    if (!resolvedNewPortId && targetOdpId && targetOdpPort) {
      resolvedNewPortId = await autoResolveSplitterPort(targetOdpId, targetOdpPort, null)
    }
    const newSplitterPortId = resolvedNewPortId

    const data = {}
    if (customerId    !== undefined) data.customerId    = customerId
    if (name          !== undefined) data.name          = name
    if (phone         !== undefined) data.phone         = phone || null
    if (address       !== undefined) data.address       = address
    if (lat           !== undefined) data.lat           = lat ? parseFloat(lat) : null
    if (lng           !== undefined) data.lng           = lng ? parseFloat(lng) : null
    if (distributionType !== undefined) data.distributionType = distributionType
    if (htbBoxId      !== undefined) data.htbBoxId      = htbBoxId || null
    if (htbPortId     !== undefined) data.htbPortId     = htbPortId || null
    if (cpeType       !== undefined) data.cpeType       = cpeType || null
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
    // Validasi defensif: pastikan port baru tidak sedang dipakai pelanggan lain / ODP lain
    const portNeedsCheck = odpId !== undefined || odpPort !== undefined || splitterPortId !== undefined
    if (portNeedsCheck && (targetOdpId || newSplitterPortId) && distributionType !== 'HTB') {
      try {
        await assertPortAvailable({
          odpId: targetOdpId || null,
          odpPort: targetOdpPort ? parseInt(targetOdpPort, 10) : null,
          splitterPortId: newSplitterPortId || null,
          excludeCustomerId: req.params.id,
        })
      } catch (err) {
        if (err.status === 409) return res.status(409).json({ error: err.message })
        throw err
      }
    }

    if (htbPortId !== undefined && htbPortId && htbPortId !== existing.htbPortId) {
      try {
        await assertHtbPortAvailable({
          htbBoxId: htbBoxId || existing.htbBoxId,
          htbPortId,
          excludeCustomerId: req.params.id,
        })
      } catch (err) {
        if (err.status === 409) return res.status(409).json({ error: err.message })
        throw err
      }
    }

    const customer = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.update({ where: { id: req.params.id }, data })

      // Lepas port ODP lama jika berbeda
      if (portChanged && oldSplitterPortId) {
        await releaseSplitterPort(oldSplitterPortId, req.params.id, tx)
      }
      // Claim port ODP baru
      if (portChanged && newSplitterPortId) {
        await claimSplitterPort(newSplitterPortId, req.params.id, tx)
      }

      // Handle HTB port change
      if (htbPortId !== undefined && htbPortId !== existing.htbPortId) {
        if (existing.htbPortId) {
          await releaseHtbPort(existing.htbPortId, tx)
        }
        if (htbPortId) {
          await claimHtbPort(htbPortId, req.params.id, tx)
        }
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
      select: { odpId: true, splitterPortId: true, htbPortId: true, name: true },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    // Safeguard: Check if this customer is a Bridge Gateway for an HTB Box
    const bridgeBox = await prisma.htbBox.findFirst({
      where: { uplinkCustomerId: req.params.id },
      select: { name: true },
    })
    if (bridgeBox) {
      return res.status(409).json({
        error: `Tidak dapat menghapus pelanggan "${customer.name}" karena ONU-nya saat ini menjadi Bridge Uplink untuk Box HTB "${bridgeBox.name}". Pindahkan sumber uplink Box HTB tersebut terlebih dahulu.`
      })
    }

    await prisma.$transaction(async (tx) => {
      // 1. Release SplitterPort jika ada
      if (customer.splitterPortId) {
        await releaseSplitterPort(customer.splitterPortId, req.params.id, tx)
      }
      await tx.splitterPort.updateMany({
        where: { connectedToId: req.params.id },
        data: { connectionStatus: "AVAILABLE", connectedToType: null, connectedToId: null }
      })

      // 2. Release HTB port jika ada
      if (customer.htbPortId) {
        await releaseHtbPort(customer.htbPortId, tx)
      }

      // 3. Delete customer
      await tx.customer.delete({ where: { id: req.params.id } })

      // 4. Sync ODP usedPorts
      if (customer.odpId) {
        await syncOdpUsedPorts(customer.odpId, tx)
      }
    })

    res.status(204).end()
  } catch (e) { next(e) }
})

export default router
