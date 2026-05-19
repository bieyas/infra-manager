import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function ipToLong(ip) {
  const parts = ip.split('.').map(Number)
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]
}

function longToIp(long) {
  return [
    (long >>> 24) & 0xff,
    (long >>> 16) & 0xff,
    (long >>> 8) & 0xff,
    long & 0xff
  ].join('.')
}

function parseCidr(cidr) {
  const [ip, prefix] = cidr.split('/')
  const p = parseInt(prefix, 10)
  if (p < 0 || p > 32) return null
  const mask = p === 0 ? 0 : (-1 << (32 - p)) >>> 0
  const network = (ipToLong(ip) & mask) >>> 0
  const broadcast = network | (~mask >>> 0)
  const usable = Math.max(0, (1 << (32 - p)) - 2)
  return { network, broadcast, mask, prefix: p, usable, size: 1 << (32 - p) }
}

function cidrsOverlap(cidr1, cidr2) {
  const p1 = parseCidr(cidr1)
  const p2 = parseCidr(cidr2)
  if (!p1 || !p2) return false
  return (p1.network >= p2.network && p1.network <= p2.broadcast) ||
         (p2.network >= p1.network && p2.network <= p1.broadcast)
}

function isIpInCidr(ip, cidr) {
  const p = parseCidr(cidr)
  if (!p) return false
  const ipLong = ipToLong(ip)
  return ipLong >= p.network && ipLong <= p.broadcast
}

function getNextIp(cidr, usedIps) {
  const p = parseCidr(cidr)
  if (!p || p.usable === 0) return null
  const used = new Set(usedIps.map(ipToLong))
  for (let i = p.network + 1; i < p.broadcast; i++) {
    if (!used.has(i)) return longToIp(i)
  }
  return null
}

// Audit logging helper
async function auditLog(req, data) {
  // Remove non-schema fields that routes pass for convenience
  const { ipAddress: _ip, ...cleanData } = data
  return prisma.auditLog.create({
    data: {
      ...cleanData,
      userId: req.user?.sub || 'system',
      userEmail: req.user?.email || null,
      userName: req.user?.username || null,
      ipAddress: req.ip || null
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBNETS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/ipam/v2/subnets - List all subnets with hierarchy
router.get('/subnets', async (req, res, next) => {
  try {
    const { tree, search, vlanId, siteId, includeHosts, includeStats } = req.query
    
    const where = {}
    if (vlanId) where.vlanId = vlanId
    if (siteId) where.siteId = siteId
    if (search) {
      where.OR = [
        { cidr: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { gateway: { contains: search, mode: 'insensitive' } }
      ]
    }
    
    const include = {
      vlan: { select: { id: true, vid: true, name: true, color: true } },
      _count: { select: { hosts: true, children: true } }
    }
    
    if (includeHosts === 'true') {
      include.hosts = { 
        where: { status: { not: 'DEPRECATED' } },
        select: { id: true, ip: true, hostname: true, status: true, assignmentType: true }
      }
    }
    
    if (includeStats === 'true') {
      include.hosts = { 
        select: { id: true, ip: true, status: true, discovered: true, lastSeen: true }
      }
    }
    
    let subnets = await prisma.subnet.findMany({
      where,
      orderBy: [{ parentId: 'asc' }, { cidr: 'asc' }],
      include
    })
    
    // Enrich with VLAN interfaces
    const vlanIds = subnets.filter(s => s.vlanId).map(s => s.vlanId)
    if (vlanIds.length > 0) {
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
      subnets = subnets.map(s => ({
        ...s,
        vlanInterfaces: ifacesByVlan[s.vlanId] || []
      }))
    }
    
    // Build tree structure if requested
    if (tree === 'true') {
      const subnetMap = new Map(subnets.map(s => [s.id, { ...s, children: [] }]))
      const rootSubnets = []
      for (const subnet of subnetMap.values()) {
        if (subnet.parentId && subnetMap.has(subnet.parentId)) {
          subnetMap.get(subnet.parentId).children.push(subnet)
        } else {
          rootSubnets.push(subnet)
        }
      }
      return res.json(rootSubnets)
    }
    
    res.json(subnets)
  } catch (e) { next(e) }
})

// GET /api/ipam/v2/subnets/:id - Get single subnet with full details
router.get('/subnets/:id', async (req, res, next) => {
  try {
    const subnet = await prisma.subnet.findUnique({
      where: { id: req.params.id },
      include: {
        vlan: true,
        parent: { select: { id: true, cidr: true } },
        children: { select: { id: true, cidr: true, description: true, _count: { select: { hosts: true } } } },
        hosts: {
          orderBy: { ip: 'asc' },
          include: {
            vlan: { select: { id: true, vid: true, name: true, color: true } },
            device: { select: { id: true, name: true, ip: true, type: true } }
          }
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { action: true, userName: true, createdAt: true, notes: true }
        }
      }
    })
    
    if (!subnet) return res.status(404).json({ error: 'Subnet not found' })
    
    // Calculate available IPs
    const parsed = parseCidr(subnet.cidr)
    const usedIps = new Set(subnet.hosts.map(h => h.ip))
    const available = parsed ? parsed.usable - usedIps.size : 0
    
    res.json({ ...subnet, availableIps: available, totalIps: parsed?.usable || 0 })
  } catch (e) { next(e) }
})

// POST /api/ipam/v2/subnets - Create subnet
router.post('/subnets', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { cidr, description, vlanId, parentId, poolStart, poolEnd, gateway, 
            dnsPrimary, dnsSecondary, siteId, scanEnabled, notes } = req.body
    
    if (!cidr) return res.status(422).json({ error: 'CIDR required' })
    
    // Validate CIDR format
    if (!parseCidr(cidr)) return res.status(422).json({ error: 'Invalid CIDR format' })
    
    // Check overlap with existing
    const existing = await prisma.subnet.findMany({ select: { id: true, cidr: true } })
    const overlap = existing.find(s => cidrsOverlap(cidr, s.cidr))
    if (overlap) return res.status(409).json({ error: `Overlaps with ${overlap.cidr}` })
    
    // Validate parent
    if (parentId) {
      const parent = await prisma.subnet.findUnique({ where: { id: parentId } })
      if (!parent) return res.status(422).json({ error: 'Parent subnet not found' })
      if (!isIpInCidr(cidr.split('/')[0], parent.cidr)) {
        return res.status(422).json({ error: 'Subnet must be within parent CIDR' })
      }
    }
    
    const subnet = await prisma.subnet.create({
      data: { cidr, description, vlanId, parentId, poolStart, poolEnd, gateway,
              dnsPrimary, dnsSecondary, siteId, scanEnabled: scanEnabled ?? true, notes }
    })
    
    await auditLog(req, {
      action: 'CREATE', entityType: 'SUBNET', entityId: subnet.id,
      newValues: subnet, notes: `Created subnet ${cidr}`
    })
    
    res.status(201).json(subnet)
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'CIDR already exists' })
    next(e)
  }
})

// PATCH /api/ipam/v2/subnets/:id
router.patch('/subnets/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const old = await prisma.subnet.findUnique({ where: { id: req.params.id } })
    if (!old) return res.status(404).json({ error: 'Subnet not found' })
    
    const { description, vlanId, poolStart, poolEnd, gateway, dnsPrimary, 
            dnsSecondary, siteId, scanEnabled, status, notes } = req.body
    
    const data = {}
    if (description !== undefined) data.description = description
    if (vlanId !== undefined) data.vlanId = vlanId
    if (poolStart !== undefined) data.poolStart = poolStart
    if (poolEnd !== undefined) data.poolEnd = poolEnd
    if (gateway !== undefined) data.gateway = gateway
    if (dnsPrimary !== undefined) data.dnsPrimary = dnsPrimary
    if (dnsSecondary !== undefined) data.dnsSecondary = dnsSecondary
    if (siteId !== undefined) data.siteId = siteId
    if (scanEnabled !== undefined) data.scanEnabled = scanEnabled
    if (status !== undefined) data.status = status
    if (notes !== undefined) data.notes = notes
    
    const subnet = await prisma.subnet.update({
      where: { id: req.params.id },
      data,
      include: { vlan: { select: { id: true, vid: true, name: true } } }
    })
    
    await auditLog(req, {
      action: 'UPDATE', entityType: 'SUBNET', entityId: subnet.id,
      oldValues: old, newValues: subnet, notes: `Updated subnet ${subnet.cidr}`
    })
    
    res.json(subnet)
  } catch (e) { next(e) }
})

// DELETE /api/ipam/v2/subnets/:id
router.delete('/subnets/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const subnet = await prisma.subnet.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { hosts: true, children: true } } }
    })
    
    if (!subnet) return res.status(404).json({ error: 'Subnet not found' })
    if (subnet._count.hosts > 0) return res.status(409).json({ error: 'Cannot delete subnet with hosts' })
    if (subnet._count.children > 0) return res.status(409).json({ error: 'Cannot delete subnet with children' })
    
    await prisma.subnet.delete({ where: { id: req.params.id } })
    
    await auditLog(req, {
      action: 'DELETE', entityType: 'SUBNET', entityId: req.params.id,
      oldValues: subnet, notes: `Deleted subnet ${subnet.cidr}`
    })
    
    res.status(204).end()
  } catch (e) { next(e) }
})

// GET /api/ipam/v2/subnets/:id/available-ips
router.get('/subnets/:id/available-ips', async (req, res, next) => {
  try {
    const subnet = await prisma.subnet.findUnique({
      where: { id: req.params.id },
      include: { hosts: { select: { ip: true } } }
    })
    
    if (!subnet) return res.status(404).json({ error: 'Subnet not found' })
    
    const p = parseCidr(subnet.cidr)
    if (!p) return res.status(400).json({ error: 'Invalid CIDR' })
    
    const used = new Set(subnet.hosts.map(h => ipToLong(h.ip)))
    const available = []
    
    // Limit to first 50 available IPs
    for (let i = p.network + 1; i < p.broadcast && available.length < 50; i++) {
      if (!used.has(i)) available.push(longToIp(i))
    }
    
    res.json({ available, total: p.usable - used.size })
  } catch (e) { next(e) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// HOSTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/ipam/v2/hosts
router.get('/hosts', async (req, res, next) => {
  try {
    const { subnetId, vlanId, status, assignmentType, discovered, search, limit = 100 } = req.query
    
    const where = {}
    if (subnetId) where.subnetId = subnetId
    if (vlanId) where.vlanId = vlanId
    if (status) where.status = status
    if (assignmentType) where.assignmentType = assignmentType
    if (discovered !== undefined) where.discovered = discovered === 'true'
    if (search) {
      where.OR = [
        { ip: { contains: search, mode: 'insensitive' } },
        { hostname: { contains: search, mode: 'insensitive' } },
        { mac: { contains: search, mode: 'insensitive' } },
        { assignedTo: { contains: search, mode: 'insensitive' } }
      ]
    }
    
    const hosts = await prisma.host.findMany({
      where,
      orderBy: { ip: 'asc' },
      take: parseInt(limit),
      include: {
        subnet: { select: { id: true, cidr: true } },
        vlan: { select: { id: true, vid: true, name: true, color: true } },
        device: { select: { id: true, name: true, ip: true } }
      }
    })
    
    res.json(hosts)
  } catch (e) { next(e) }
})

// GET /api/ipam/v2/hosts/:id
router.get('/hosts/:id', async (req, res, next) => {
  try {
    const host = await prisma.host.findUnique({
      where: { id: req.params.id },
      include: {
        subnet: true,
        vlan: true,
        device: true,
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    })
    
    if (!host) return res.status(404).json({ error: 'Host not found' })
    res.json(host)
  } catch (e) { next(e) }
})

// POST /api/ipam/v2/hosts
router.post('/hosts', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { ip, hostname, mac, subnetId, vlanId, cvid, assignmentType, 
            assignedTo, assignedToId, deviceId, notes } = req.body
    
    if (!ip || !subnetId) return res.status(422).json({ error: 'IP and subnetId required' })
    
    // Validate IP is in subnet
    const subnet = await prisma.subnet.findUnique({ where: { id: subnetId } })
    if (!subnet) return res.status(422).json({ error: 'Subnet not found' })
    if (!isIpInCidr(ip, subnet.cidr)) return res.status(422).json({ error: 'IP not in subnet range' })
    
    const host = await prisma.host.create({
      data: { 
        ip, hostname, mac, subnetId, vlanId, cvid, 
        assignmentType: assignmentType || 'static',
        assignedTo, assignedToId, deviceId, notes,
        discovered: false, discoveryMethod: 'manual'
      },
      include: {
        subnet: { select: { cidr: true } },
        vlan: { select: { vid: true, name: true } }
      }
    })
    
    await auditLog(req, {
      action: 'CREATE', entityType: 'HOST', entityId: host.id,
      newValues: host, subnetId, ipAddress: ip,
      notes: `Created host ${ip} in ${host.subnet.cidr}`
    })
    
    res.status(201).json(host)
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'IP already exists' })
    next(e)
  }
})

// PATCH /api/ipam/v2/hosts/:id
router.patch('/hosts/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const old = await prisma.host.findUnique({ where: { id: req.params.id } })
    if (!old) return res.status(404).json({ error: 'Host not found' })
    
    const { hostname, mac, vlanId, cvid, status, assignmentType, 
            assignedTo, assignedToId, deviceId, notes } = req.body
    
    const data = {}
    if (hostname !== undefined) data.hostname = hostname
    if (mac !== undefined) data.mac = mac
    if (vlanId !== undefined) data.vlanId = vlanId
    if (cvid !== undefined) data.cvid = cvid ? parseInt(cvid) : null
    if (status !== undefined) data.status = status
    if (assignmentType !== undefined) data.assignmentType = assignmentType
    if (assignedTo !== undefined) data.assignedTo = assignedTo
    if (assignedToId !== undefined) data.assignedToId = assignedToId
    if (deviceId !== undefined) data.deviceId = deviceId
    if (notes !== undefined) data.notes = notes
    
    const host = await prisma.host.update({
      where: { id: req.params.id },
      data,
      include: {
        subnet: { select: { cidr: true } },
        vlan: { select: { vid: true, name: true } }
      }
    })
    
    await auditLog(req, {
      action: 'UPDATE', entityType: 'HOST', entityId: host.id,
      oldValues: old, newValues: host, subnetId: host.subnetId, ipAddress: host.ip,
      notes: `Updated host ${host.ip}`
    })
    
    res.json(host)
  } catch (e) { next(e) }
})

// DELETE /api/ipam/v2/hosts/:id
router.delete('/hosts/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const host = await prisma.host.findUnique({
      where: { id: req.params.id },
      include: { subnet: { select: { id: true, cidr: true } } }
    })
    
    if (!host) return res.status(404).json({ error: 'Host not found' })
    
    await prisma.host.delete({ where: { id: req.params.id } })
    
    await auditLog(req, {
      action: 'DELETE', entityType: 'HOST', entityId: req.params.id,
      oldValues: host, subnetId: host.subnetId, ipAddress: host.ip,
      notes: `Deleted host ${host.ip}`
    })
    
    res.status(204).end()
  } catch (e) { next(e) }
})

// POST /api/ipam/v2/hosts/:id/assign - Assign host to customer/user
router.post('/hosts/:id/assign', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { assignedTo, assignedToId, expiresAt, assignmentType = 'customer' } = req.body
    
    const old = await prisma.host.findUnique({ where: { id: req.params.id } })
    if (!old) return res.status(404).json({ error: 'Host not found' })
    
    const host = await prisma.host.update({
      where: { id: req.params.id },
      data: { assignedTo, assignedToId, expiresAt, assignmentType }
    })
    
    await auditLog(req, {
      action: 'ASSIGN', entityType: 'HOST', entityId: host.id,
      oldValues: old, newValues: host, subnetId: host.subnetId, ipAddress: host.ip,
      notes: `Assigned ${host.ip} to ${assignedTo}`
    })
    
    res.json(host)
  } catch (e) { next(e) }
})

// POST /api/ipam/v2/hosts/:id/release - Release assignment
router.post('/hosts/:id/release', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const old = await prisma.host.findUnique({ where: { id: req.params.id } })
    if (!old) return res.status(404).json({ error: 'Host not found' })
    
    const host = await prisma.host.update({
      where: { id: req.params.id },
      data: { assignedTo: null, assignedToId: null, expiresAt: null, assignmentType: 'static' }
    })
    
    await auditLog(req, {
      action: 'RELEASE', entityType: 'HOST', entityId: host.id,
      oldValues: old, newValues: host, subnetId: host.subnetId, ipAddress: host.ip,
      notes: `Released assignment for ${host.ip}`
    })
    
    res.json(host)
  } catch (e) { next(e) }
})

// ═══════════════════════════════════════════════════════════════════════════════
// SCAN & DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/ipam/v2/scan - Scan subnet for active IPs
router.post('/scan', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { subnetId, method = 'ping' } = req.body
    
    const subnet = await prisma.subnet.findUnique({
      where: { id: subnetId },
      include: { hosts: { select: { ip: true } } }
    })
    
    if (!subnet) return res.status(404).json({ error: 'Subnet not found' })
    
    const p = parseCidr(subnet.cidr)
    const existingHosts = new Set(subnet.hosts.map(h => h.ip))
    
    // Simulate scan (in real implementation, use ping, snmp, or arp scan)
    const discovered = []
    const scanTimestamp = new Date()
    
    // For demo: randomly discover some IPs that don't exist yet
    for (let i = p.network + 1; i < p.broadcast && discovered.length < 5; i++) {
      const ip = longToIp(i)
      if (!existingHosts.has(ip) && Math.random() > 0.7) {
        discovered.push(ip)
        // Auto-create discovered host
        await prisma.host.create({
          data: {
            ip,
            subnetId,
            discovered: true,
            discoveryMethod: method,
            lastSeen: scanTimestamp,
            status: 'ACTIVE'
          }
        })
      }
    }
    
    await prisma.subnet.update({
      where: { id: subnetId },
      data: { lastScanned: scanTimestamp }
    })
    
    await auditLog(req, {
      action: 'SCAN', entityType: 'SUBNET', entityId: subnetId,
      newValues: { discovered: discovered.length },
      notes: `Scanned subnet ${subnet.cidr}, found ${discovered.length} new hosts`
    })
    
    res.json({ discovered, total: discovered.length })
  } catch (e) { next(e) }
})

// GET /api/ipam/v2/audit-logs
router.get('/audit-logs', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { entityType, action, limit = 50 } = req.query
    
    const where = {}
    if (entityType) where.entityType = entityType
    if (action) where.action = action
    
    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: {
        subnet: { select: { cidr: true } },
        host: { select: { ip: true } }
      }
    })
    
    res.json(logs)
  } catch (e) { next(e) }
})

export default router
