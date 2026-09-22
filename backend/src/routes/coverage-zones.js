import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// ── Hitung luas area polygon dalam m² menggunakan Shoelace formula ──────────
// Input: GeoJSON coordinates array (rings), ring[0] = outer boundary [[lng,lat],...]
function calcAreaM2(coordinates) {
  try {
    const ring = coordinates[0]
    if (!ring || ring.length < 3) return null
    // Haversine-based approximate area
    const R = 6371000 // Earth radius in meters
    let area = 0
    const n = ring.length
    for (let i = 0; i < n; i++) {
      const [lng1, lat1] = ring[i]
      const [lng2, lat2] = ring[(i + 1) % n]
      const dLng = ((lng2 - lng1) * Math.PI) / 180
      const lat1Rad = (lat1 * Math.PI) / 180
      const lat2Rad = (lat2 * Math.PI) / 180
      area += dLng * (2 + Math.sin(lat1Rad) + Math.sin(lat2Rad))
    }
    return Math.abs((area * R * R) / 2)
  } catch {
    return null
  }
}

// GET /api/coverage-zones — list semua zona aktif
router.get('/', async (req, res) => {
  try {
    const { odcId, all } = req.query
    const where = {}
    if (all !== 'true') where.isActive = true
    if (odcId) where.odcId = odcId

    const zones = await prisma.coverageZone.findMany({
      where,
      include: { odc: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json(zones)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/coverage-zones/:id
router.get('/:id', async (req, res) => {
  try {
    const zone = await prisma.coverageZone.findUnique({
      where: { id: req.params.id },
      include: { odc: { select: { id: true, name: true } } },
    })
    if (!zone) return res.status(404).json({ error: 'Not found' })
    res.json(zone)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/coverage-zones — buat zona baru
router.post('/', async (req, res) => {
  try {
    const { name, description, coordinates, odcId, color, opacity, label } = req.body
    if (!name || !coordinates) {
      return res.status(400).json({ error: 'name dan coordinates wajib diisi' })
    }

    const areaM2 = calcAreaM2(coordinates)

    const zone = await prisma.coverageZone.create({
      data: {
        name,
        description: description || null,
        coordinates,
        odcId: odcId || null,
        color: color || '#06b6d4',
        opacity: opacity != null ? parseFloat(opacity) : 0.2,
        label: label || null,
        areaM2,
        createdBy: req.user?.id || null,
      },
      include: { odc: { select: { id: true, name: true } } },
    })
    res.status(201).json(zone)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/coverage-zones/:id — update
router.patch('/:id', async (req, res) => {
  try {
    const { name, description, coordinates, odcId, color, opacity, label, isActive } = req.body
    const data = {}

    if (name !== undefined)        data.name        = name
    if (description !== undefined) data.description = description
    if (odcId !== undefined)       data.odcId       = odcId || null
    if (color !== undefined)       data.color       = color
    if (opacity !== undefined)     data.opacity     = parseFloat(opacity)
    if (label !== undefined)       data.label       = label
    if (isActive !== undefined)    data.isActive    = isActive

    if (coordinates !== undefined) {
      data.coordinates = coordinates
      data.areaM2 = calcAreaM2(coordinates)
    }

    const zone = await prisma.coverageZone.update({
      where: { id: req.params.id },
      data,
      include: { odc: { select: { id: true, name: true } } },
    })
    res.json(zone)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' })
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/coverage-zones/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.coverageZone.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' })
    res.status(500).json({ error: err.message })
  }
})

export default router
