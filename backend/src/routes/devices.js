import { Router } from 'express'
import { body, validationResult } from 'express-validator'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { encrypt, decrypt } from '../lib/crypto.js'
import { probeDevice }      from '../lib/probe.js'

const router = Router()
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map any status representation → valid NodeStatus enum value.
 * Accepts: 'online'→ACTIVE, 'offline'→INACTIVE, 'warning'→MAINTENANCE
 *          or raw enum values ACTIVE/INACTIVE/MAINTENANCE (any case).
 */
function toNodeStatus(s) {
  if (!s) return null
  switch (s.toUpperCase()) {
    case 'ACTIVE':
    case 'ONLINE':      return 'ACTIVE'
    case 'INACTIVE':
    case 'OFFLINE':     return 'INACTIVE'
    case 'MAINTENANCE':
    case 'WARNING':     return 'MAINTENANCE'
    default:            return null
  }
}

/** Strip encrypted credential fields from outgoing response */
function sanitize(device) {
  if (!device) return device
  const { mgmtPassword, snmpCommunity, ...rest } = device
  return {
    ...rest,
    hasPassword:     !!mgmtPassword,
    hasSnmpCommunity: !!snmpCommunity,
  }
}

/** Build Prisma data object for credential fields (encrypt sensitive) */
function buildMgmtData(body) {
  const d = {}
  const fields = [
    'mgmtProtocol', 'mgmtPort', 'mgmtUsername',
    'snmpVersion', 'ponCount', 'ponCapacity',
  ]
  for (const f of fields) {
    if (body[f] !== undefined) {
      if (f === 'mgmtProtocol' && body[f]) d[f] = body[f].toUpperCase()
      else d[f] = body[f] === '' ? null : body[f]
    }
  }
  // Encrypt secrets — only update if a new value is provided (non-empty string)
  if (body.mgmtPassword  !== undefined && body.mgmtPassword  !== '')
    d.mgmtPassword  = encrypt(body.mgmtPassword)
  if (body.snmpCommunity !== undefined && body.snmpCommunity !== '')
    d.snmpCommunity = encrypt(body.snmpCommunity)
  return d
}

const DEVICE_INCLUDE = {
  interfaces: true,
  alerts:     { orderBy: { createdAt: 'desc' }, take: 20 },
  uplinks: {
    include: {
      toDevice: { select: { id: true, name: true, type: true, ip: true } },
    },
  },
  downlinks: {
    include: {
      fromDevice: { select: { id: true, name: true, type: true, ip: true } },
    },
  },
}

// ── Device CRUD ───────────────────────────────────────────────────────────────

// GET /api/devices?type=&status=&q=
router.get('/', async (req, res, next) => {
  try {
    const { type, status, q } = req.query
    const where = {}
    if (type)   where.type   = type.toUpperCase()
    if (status) where.status = status.toUpperCase()
    if (q)      where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { ip:   { contains: q, mode: 'insensitive' } },
    ]
    const devices = await prisma.device.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { interfaces: true, alerts: true } } },
    })
    res.json(devices.map(sanitize))
  } catch (e) { next(e) }
})

// GET /api/devices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const device = await prisma.device.findUnique({
      where:   { id: req.params.id },
      include: DEVICE_INCLUDE,
    })
    if (!device) return res.status(404).json({ error: 'Device not found' })
    res.json(sanitize(device))
  } catch (e) { next(e) }
})

// POST /api/devices
router.post('/',
  requireRole('ADMIN', 'TECHNICIAN'),
  body('name').trim().notEmpty(),
  body('ip').isIP(),
  body('type').notEmpty(),
  async (req, res, next) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() })
    try {
      const { name, ip, type, vendor, model, location, status, notes, lat, lng } = req.body
      const device = await prisma.device.create({
        data: {
          name, ip,
          type:   type.toUpperCase(),
          vendor, model, location,
          status: toNodeStatus(status) || 'ACTIVE',
          notes,
          lat:    lat  != null ? Number(lat)  : null,
          lng:    lng  != null ? Number(lng)  : null,
          ...buildMgmtData(req.body),
        },
      })
      res.status(201).json(sanitize(device))
    } catch (e) {
      if (e.code === 'P2002') return res.status(409).json({ error: 'IP already exists' })
      next(e)
    }
  }
)

// PATCH /api/devices/:id
router.patch('/:id',
  requireRole('ADMIN', 'TECHNICIAN'),
  async (req, res, next) => {
    try {
      const { name, ip, type, vendor, model, location, status, notes,
              cpuPct, memPct, uptimeSeconds, lat, lng } = req.body
      const data = {}
      if (name          !== undefined) data.name          = name
      if (type          !== undefined) data.type          = type.toUpperCase()
      if (vendor        !== undefined) data.vendor        = vendor
      if (model         !== undefined) data.model         = model
      if (location      !== undefined) data.location      = location
      if (status        !== undefined) data.status        = toNodeStatus(status) || 'ACTIVE'
      if (notes         !== undefined) data.notes         = notes
      if (cpuPct        !== undefined) data.cpuPct        = cpuPct
      if (memPct        !== undefined) data.memPct        = memPct
      if (uptimeSeconds !== undefined) data.uptimeSeconds = uptimeSeconds
      if (lat           !== undefined) data.lat           = lat != null ? Number(lat) : null
      if (lng           !== undefined) data.lng           = lng != null ? Number(lng) : null
      if (ip            !== undefined) data.ip            = ip.trim()
      Object.assign(data, buildMgmtData(req.body))

      // If IP is changing, sync IPAM Host record (best-effort, no hard failure)
      if (ip !== undefined) {
        const current = await prisma.device.findUnique({
          where: { id: req.params.id }, select: { ip: true },
        })
        if (current && current.ip !== ip.trim()) {
          await prisma.host.updateMany({
            where: { ip: current.ip },
            data:  { ip: ip.trim() },
          }).catch(() => {}) // IPAM record may not exist — ignore
        }
      }

      const device = await prisma.device.update({
        where: { id: req.params.id },
        data,
        include: DEVICE_INCLUDE,
      })
      res.json(sanitize(device))
    } catch (e) {
      if (e.code === 'P2025') return res.status(404).json({ error: 'Device not found' })
      if (e.code === 'P2002') return res.status(409).json({ error: 'IP already in use' })
      next(e)
    }
  }
)

// DELETE /api/devices/:id
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.device.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Device not found' })
    next(e)
  }
})

// ── Connectivity probing ──────────────────────────────────────────────────────

// POST /api/devices/probe-all  — probe all devices concurrently (max 20 at a time)
// NOTE: must be declared BEFORE /:id/probe to avoid route collision
router.post('/probe-all', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const devices = await prisma.device.findMany({
      select: { id: true, ip: true, mgmtPort: true, mgmtProtocol: true },
    })

    // Process in batches of 20 to avoid overwhelming the network
    const BATCH = 20
    const results = []
    for (let i = 0; i < devices.length; i += BATCH) {
      const batch = devices.slice(i, i + BATCH)
      const batchResults = await Promise.all(
        batch.map(async d => {
          const r   = await probeDevice({ ip: d.ip, mgmtPort: d.mgmtPort, mgmtProtocol: d.mgmtProtocol })
          const now = new Date()
          await prisma.device.update({
            where: { id: d.id },
            data: {
              status:       r.alive ? 'ACTIVE' : 'INACTIVE',
              lastProbeAt:  now,
              lastSeen:     r.alive ? now : undefined,
              probeLatency: r.latencyMs || undefined,
            },
          })
          return { id: d.id, ip: d.ip, alive: r.alive, latencyMs: r.latencyMs, method: r.method }
        })
      )
      results.push(...batchResults)
    }

    res.json({
      total:   results.length,
      online:  results.filter(r => r.alive).length,
      offline: results.filter(r => !r.alive).length,
      results,
    })
  } catch (e) { next(e) }
})

// POST /api/devices/:id/probe  — probe a single device, update status
router.post('/:id/probe', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const device = await prisma.device.findUnique({
      where: { id: req.params.id },
      select: { id: true, ip: true, mgmtPort: true, mgmtProtocol: true, status: true },
    })
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const result = await probeDevice({
      ip:           device.ip,
      mgmtPort:     device.mgmtPort,
      mgmtProtocol: device.mgmtProtocol,
    })

    const now       = new Date()
    const newStatus = result.alive ? 'ACTIVE' : 'INACTIVE'
    const updated   = await prisma.device.update({
      where: { id: device.id },
      data: {
        status:       newStatus,
        lastProbeAt:  now,
        lastSeen:     result.alive ? now : undefined,
        probeLatency: result.latencyMs || undefined,
      },
    })

    res.json({
      id:          device.id,
      ip:          device.ip,
      alive:       result.alive,
      latencyMs:   result.latencyMs,
      method:      result.method,
      status:      newStatus,
      lastSeen:    updated.lastSeen,
      lastProbeAt: updated.lastProbeAt,
    })
  } catch (e) { next(e) }
})

// ── DeviceLink sub-routes ─────────────────────────────────────────────────────

// GET /api/devices/:id/links — get uplinks of a device
router.get('/:id/links', async (req, res, next) => {
  try {
    const links = await prisma.deviceLink.findMany({
      where: { fromDeviceId: req.params.id },
      include: {
        toDevice: { select: { id: true, name: true, type: true, ip: true } },
      },
      orderBy: { fromPort: 'asc' },
    })
    res.json(links)
  } catch (e) { next(e) }
})

// POST /api/devices/:id/links — add an uplink
router.post('/:id/links',
  requireRole('ADMIN', 'TECHNICIAN'),
  body('fromPort').trim().notEmpty(),
  body('toDeviceId').trim().notEmpty(),
  body('toPort').trim().notEmpty(),
  async (req, res, next) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() })
    try {
      const { fromPort, toDeviceId, toPort, linkType, description } = req.body
      const link = await prisma.deviceLink.create({
        data: {
          fromDeviceId: req.params.id,
          fromPort:     fromPort.trim(),
          toDeviceId:   toDeviceId.trim(),
          toPort:       toPort.trim(),
          linkType:     linkType || null,
          description:  description || null,
        },
        include: {
          toDevice: { select: { id: true, name: true, type: true, ip: true } },
        },
      })
      res.status(201).json(link)
    } catch (e) {
      if (e.code === 'P2002')
        return res.status(409).json({ error: 'Port already has an uplink' })
      if (e.code === 'P2003')
        return res.status(404).json({ error: 'Target device not found' })
      next(e)
    }
  }
)

// PATCH /api/devices/:id/links/:linkId
router.patch('/:id/links/:linkId',
  requireRole('ADMIN', 'TECHNICIAN'),
  async (req, res, next) => {
    try {
      const { fromPort, toDeviceId, toPort, linkType, description } = req.body
      const data = {}
      if (fromPort    !== undefined) data.fromPort    = fromPort.trim()
      if (toDeviceId  !== undefined) data.toDeviceId  = toDeviceId.trim()
      if (toPort      !== undefined) data.toPort      = toPort.trim()
      if (linkType    !== undefined) data.linkType    = linkType
      if (description !== undefined) data.description = description

      const link = await prisma.deviceLink.update({
        where: { id: req.params.linkId },
        data,
        include: {
          toDevice: { select: { id: true, name: true, type: true, ip: true } },
        },
      })
      res.json(link)
    } catch (e) {
      if (e.code === 'P2025') return res.status(404).json({ error: 'Link not found' })
      if (e.code === 'P2002') return res.status(409).json({ error: 'Port already has an uplink' })
      next(e)
    }
  }
)

// DELETE /api/devices/:id/links/:linkId
router.delete('/:id/links/:linkId',
  requireRole('ADMIN', 'TECHNICIAN'),
  async (req, res, next) => {
    try {
      await prisma.deviceLink.delete({ where: { id: req.params.linkId } })
      res.status(204).end()
    } catch (e) {
      if (e.code === 'P2025') return res.status(404).json({ error: 'Link not found' })
      next(e)
    }
  }
)

export default router
