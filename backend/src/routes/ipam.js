import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

function ipToLong(ip) {
  const parts = ip.split('.').map(Number)
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]
}

function parseCidr(cidr) {
  const [ip, prefix] = cidr.split('/')
  const p = parseInt(prefix, 10)
  const mask = p === 0 ? 0 : (-1 << (32 - p)) >>> 0
  const network = (ipToLong(ip) & mask) >>> 0
  const broadcast = network | (~mask >>> 0)
  return { network, broadcast, prefix: p }
}

function cidrsOverlap(cidr1, cidr2) {
  const p1 = parseCidr(cidr1)
  const p2 = parseCidr(cidr2)
  const net1InNet2 = p1.network >= p2.network && p1.network <= p2.broadcast
  const net2InNet1 = p2.network >= p1.network && p2.network <= p1.broadcast
  return net1InNet2 || net2InNet1
}

// ── Subnets ───────────────────────────────────────────────────────────────────

// GET /api/ipam/subnets
router.get('/subnets', async (req, res, next) => {
  try {
    const subnets = await prisma.subnet.findMany({
      orderBy: { cidr: 'asc' },
      include: {
        vlan:     { select: { id: true, vid: true, name: true, color: true } },
        _count:   { select: { hosts: true, children: true } },
      },
    })
    // Fetch interfaces for each VLAN
    const vlanIds = subnets.filter(s => s.vlanId).map(s => s.vlanId)
    const interfaces = await prisma.interface.findMany({
      where: { vlanId: { in: vlanIds } },
      select: {
        id: true, name: true, vlanId: true,
        device: { select: { id: true, name: true, ip: true } }
      }
    })
    const ifacesByVlan = Object.fromEntries(
      vlanIds.map(vid => [vid, interfaces.filter(i => i.vlanId === vid)])
    )
    const enriched = subnets.map(s => ({
      ...s,
      vlanInterfaces: ifacesByVlan[s.vlanId] || []
    }))
    res.json(enriched)
  } catch (e) { next(e) }
})

// GET /api/ipam/subnets/:id
router.get('/subnets/:id', async (req, res, next) => {
  try {
    const subnet = await prisma.subnet.findUnique({
      where:   { id: req.params.id },
      include: { hosts: true, children: true, vlan: true },
    })
    if (!subnet) return res.status(404).json({ error: 'Subnet not found' })
    res.json(subnet)
  } catch (e) { next(e) }
})

// POST /api/ipam/subnets
router.post('/subnets', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { cidr, description, vlanId, parentId } = req.body
    if (!cidr) return res.status(422).json({ error: 'cidr required' })
    
    // Check for overlapping CIDR
    const existing = await prisma.subnet.findMany({ select: { cidr: true } })
    const overlap = existing.find(s => cidrsOverlap(cidr, s.cidr))
    if (overlap) return res.status(409).json({ error: `CIDR overlaps with ${overlap.cidr}` })
    
    const subnet = await prisma.subnet.create({ data: { cidr, description, vlanId, parentId } })
    res.status(201).json(subnet)
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'CIDR already exists' })
    next(e)
  }
})

// PATCH /api/ipam/subnets/:id
router.patch('/subnets/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { description, vlanId, parentId } = req.body
    const data = {}
    if (description !== undefined) data.description = description
    if (vlanId      !== undefined) data.vlanId      = vlanId
    if (parentId    !== undefined) data.parentId    = parentId
    const subnet = await prisma.subnet.update({ where: { id: req.params.id }, data })
    res.json(subnet)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Subnet not found' })
    next(e)
  }
})

// DELETE /api/ipam/subnets/:id
router.delete('/subnets/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.subnet.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Subnet not found' })
    next(e)
  }
})

// ── Hosts ─────────────────────────────────────────────────────────────────────

// GET /api/ipam/hosts?subnetId=&q=
router.get('/hosts', async (req, res, next) => {
  try {
    const { subnetId, q } = req.query
    const where = {}
    if (subnetId) where.subnetId = subnetId
    if (q) where.OR = [
      { ip:       { contains: q, mode: 'insensitive' } },
      { hostname: { contains: q, mode: 'insensitive' } },
    ]
    const hosts = await prisma.host.findMany({
      where,
      orderBy: { ip: 'asc' },
      include: {
        subnet: { select: { id: true, cidr: true } },
        vlan:   { select: { id: true, vid: true, name: true, color: true } },
      },
    })
    res.json(hosts)
  } catch (e) { next(e) }
})

// POST /api/ipam/hosts
router.post('/hosts', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { ip, hostname, mac, subnetId, status, notes, cvid, vlanId } = req.body
    if (!ip || !subnetId) return res.status(422).json({ error: 'ip and subnetId required' })
    const host = await prisma.host.create({
      data: { ip, hostname, mac, subnetId, status: status?.toUpperCase() || 'ACTIVE', notes,
              cvid: cvid != null ? Number(cvid) : null,
              vlanId: vlanId || null },
      include: { vlan: { select: { id: true, vid: true, name: true, color: true } } },
    })
    res.status(201).json(host)
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'IP already exists' })
    next(e)
  }
})

// PATCH /api/ipam/hosts/:id
router.patch('/hosts/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { hostname, mac, status, notes, cvid, vlanId } = req.body
    const data = {}
    if (hostname !== undefined) data.hostname = hostname
    if (mac      !== undefined) data.mac      = mac
    if (status   !== undefined) data.status   = status.toUpperCase()
    if (notes    !== undefined) data.notes    = notes
    if (cvid     !== undefined) data.cvid     = cvid != null ? Number(cvid) : null
    if (vlanId   !== undefined) data.vlanId   = vlanId || null
    const host = await prisma.host.update({
      where: { id: req.params.id }, data,
      include: { vlan: { select: { id: true, vid: true, name: true, color: true } } },
    })
    res.json(host)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Host not found' })
    next(e)
  }
})

// DELETE /api/ipam/hosts/:id
router.delete('/hosts/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.host.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Host not found' })
    next(e)
  }
})

export default router
