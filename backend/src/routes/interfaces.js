import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// GET /api/interfaces?deviceId=
router.get('/', async (req, res, next) => {
  try {
    const { deviceId } = req.query
    const ifaces = await prisma.interface.findMany({
      where:   deviceId ? { deviceId } : {},
      include: { device: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    })
    res.json(ifaces)
  } catch (e) { next(e) }
})

// GET /api/interfaces/:id
router.get('/:id', async (req, res, next) => {
  try {
    const iface = await prisma.interface.findUnique({
      where:   { id: req.params.id },
      include: { device: true, vlan: true },
    })
    if (!iface) return res.status(404).json({ error: 'Interface not found' })
    res.json(iface)
  } catch (e) { next(e) }
})

// POST /api/interfaces
router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { deviceId, name, description, ipAddress, macAddress, speed, status, vlanId } = req.body
    if (!deviceId || !name) return res.status(422).json({ error: 'deviceId and name required' })
    const iface = await prisma.interface.create({
      data: {
        deviceId, name, description, ipAddress, macAddress,
        speed:   speed ? Number(speed) : undefined,
        status:  status?.toUpperCase() || 'UP',
        vlanId,
      },
    })
    res.status(201).json(iface)
  } catch (e) { next(e) }
})

// PATCH /api/interfaces/:id
router.patch('/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const allowed = ['name','description','ipAddress','macAddress','speed','status','vlanId','inBps','outBps']
    const data = {}
    for (const k of allowed) {
      if (req.body[k] !== undefined) {
        data[k] = k === 'status' ? req.body[k].toUpperCase() : req.body[k]
      }
    }
    const iface = await prisma.interface.update({ where: { id: req.params.id }, data })
    res.json(iface)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Interface not found' })
    next(e)
  }
})

// DELETE /api/interfaces/:id
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.interface.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Interface not found' })
    next(e)
  }
})

export default router
