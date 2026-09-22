import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// GET /api/ftth?type=&status=&parentId=
router.get('/', async (req, res, next) => {
  try {
    const { type, status, parentId } = req.query
    const where = {}
    if (type)     where.type     = type.toUpperCase()
    if (status)   where.status   = status.toUpperCase()
    if (parentId !== undefined) where.parentId = parentId === 'null' ? null : parentId
    const nodes = await prisma.ftthNode.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { children: true } } },
    })
    res.json(nodes)
  } catch (e) { next(e) }
})

// GET /api/ftth/:id
router.get('/:id', async (req, res, next) => {
  try {
    const node = await prisma.ftthNode.findUnique({
      where:   { id: req.params.id },
      include: { parent: true, children: true },
    })
    if (!node) return res.status(404).json({ error: 'FTTH node not found' })
    res.json(node)
  } catch (e) { next(e) }
})

// POST /api/ftth
router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const {
      id, name, type, parentId, lat, lng, address, status,
      brand, model, installDate, notes, cableCore, mountType,
      capacity, used, coreNo, customerName, customerId, serialNo, cores,
    } = req.body

    if (!id || !name || !type || lat === undefined || lng === undefined) {
      return res.status(422).json({ error: 'id, name, type, lat, lng required' })
    }

    const exists = await prisma.ftthNode.findUnique({ where: { id } })
    if (exists) return res.status(409).json({ error: `ID '${id}' already exists` })

    const node = await prisma.ftthNode.create({
      data: {
        id, name,
        type:        type.toUpperCase(),
        parentId:    parentId || null,
        lat:         parseFloat(lat),
        lng:         parseFloat(lng),
        address, status: status?.toUpperCase() || 'ACTIVE',
        brand, model,
        installDate: installDate ? new Date(installDate) : null,
        notes, cableCore: cableCore ? Number(cableCore) : null,
        mountType, capacity: capacity ? Number(capacity) : null,
        used: used ? Number(used) : null,
        coreNo: coreNo ? Number(coreNo) : null,
        customerName, customerId, serialNo,
        cores: cores || undefined,
      },
    })
    res.status(201).json(node)
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'ID already exists' })
    next(e)
  }
})

// PATCH /api/ftth/:id
router.patch('/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const allowed = [
      'name','type','parentId','lat','lng','address','status',
      'brand','model','installDate','notes','cableCore','mountType',
      'capacity','used','coreNo','customerName','customerId','serialNo','cores',
    ]
    const data = {}
    for (const k of allowed) {
      if (req.body[k] === undefined) continue
      if (k === 'type'   || k === 'status') data[k] = req.body[k].toUpperCase()
      else if (k === 'lat' || k === 'lng')  data[k] = parseFloat(req.body[k])
      else if (k === 'installDate')          data[k] = req.body[k] ? new Date(req.body[k]) : null
      else if (['cableCore','capacity','used','coreNo'].includes(k)) data[k] = req.body[k] !== null ? Number(req.body[k]) : null
      else if (k === 'parentId') data[k] = req.body[k] || null
      else data[k] = req.body[k]
    }
    const node = await prisma.ftthNode.update({ where: { id: req.params.id }, data })
    res.json(node)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'FTTH node not found' })
    next(e)
  }
})

// DELETE /api/ftth/:id  (cascade handled by DB)
router.delete('/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    // Delete all descendants first (Prisma doesn't cascade self-referential by default)
    await deleteNodeRecursive(req.params.id)
    res.status(204).end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'FTTH node not found' })
    next(e)
  }
})

async function deleteNodeRecursive(id) {
  const children = await prisma.ftthNode.findMany({ where: { parentId: id }, select: { id: true } })
  for (const child of children) await deleteNodeRecursive(child.id)
  await prisma.ftthNode.delete({ where: { id } })
}

export default router
