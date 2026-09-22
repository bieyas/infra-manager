import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// GET /api/vlans
router.get('/', async (req, res, next) => {
  try {
    const vlans = await prisma.vlan.findMany({
      orderBy: { vid: 'asc' },
      include: { _count: { select: { interfaces: true, subnets: true } } },
    })
    res.json(vlans)
  } catch (e) { next(e) }
})

// GET /api/vlans/:id
router.get('/:id', async (req, res, next) => {
  try {
    const vlan = await prisma.vlan.findUnique({
      where:   { id: req.params.id },
      include: { interfaces: true, subnets: true },
    })
    if (!vlan) return res.status(404).json({ error: 'VLAN not found' })
    res.json(vlan)
  } catch (e) { next(e) }
})

// POST /api/vlans
router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { vid, name, description, color, status } = req.body
    if (!vid || !name) return res.status(422).json({ error: 'vid and name required' })
    const vlan = await prisma.vlan.create({
      data: { vid: Number(vid), name, description, color, status: status?.toUpperCase() || 'ACTIVE' },
    })
    res.status(201).json(vlan)
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'VLAN ID already exists' })
    next(e)
  }
})

// PATCH /api/vlans/:id
router.patch('/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { name, description, color, status } = req.body
    const data = {}
    if (name        !== undefined) data.name        = name
    if (description !== undefined) data.description = description
    if (color       !== undefined) data.color       = color
    if (status      !== undefined) data.status      = status.toUpperCase()
    const vlan = await prisma.vlan.update({ where: { id: req.params.id }, data })
    res.json(vlan)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'VLAN not found' })
    next(e)
  }
})

// DELETE /api/vlans/:id
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.vlan.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'VLAN not found' })
    next(e)
  }
})

export default router
