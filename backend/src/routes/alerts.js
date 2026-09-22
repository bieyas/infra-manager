import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// GET /api/alerts?severity=&acked=&deviceId=&limit=&offset=
router.get('/', async (req, res, next) => {
  try {
    const { severity, acked, deviceId, limit = 50, offset = 0 } = req.query
    const where = {}
    if (severity) where.severity = severity.toUpperCase()
    if (acked !== undefined) where.acked = acked === 'true'
    if (deviceId) where.deviceId = deviceId

    const [alerts, total] = await prisma.$transaction([
      prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take:  Number(limit),
        skip:  Number(offset),
        include: { device: { select: { id: true, name: true } } },
      }),
      prisma.alert.count({ where }),
    ])
    res.json({ alerts, total, limit: Number(limit), offset: Number(offset) })
  } catch (e) { next(e) }
})

// POST /api/alerts
router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { deviceId, severity, message, detail } = req.body
    if (!severity || !message) return res.status(422).json({ error: 'severity and message required' })
    const alert = await prisma.alert.create({
      data: { deviceId, severity: severity.toUpperCase(), message, detail },
    })
    res.status(201).json(alert)
  } catch (e) { next(e) }
})

// PATCH /api/alerts/:id/ack
router.patch('/:id/ack', async (req, res, next) => {
  try {
    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data:  { acked: true, ackedAt: new Date() },
    })
    res.json(alert)
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Alert not found' })
    next(e)
  }
})

// POST /api/alerts/ack-all
router.post('/ack-all', async (req, res, next) => {
  try {
    const result = await prisma.alert.updateMany({
      where: { acked: false },
      data:  { acked: true, ackedAt: new Date() },
    })
    res.json({ updated: result.count })
  } catch (e) { next(e) }
})

// DELETE /api/alerts/:id
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    await prisma.alert.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'Alert not found' })
    next(e)
  }
})

export default router
