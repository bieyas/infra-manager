import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET /api/qr/:type/:id — public endpoint, redirect ke frontend detail page
// Dipanggil saat QR Code di-scan browser (tanpa auth)
router.get('/:type/:id', async (req, res) => {
  const { type, id } = req.params
  const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:6001'

  try {
    switch (type) {
      case 'odc': {
        const odc = await prisma.odc.findUnique({ where: { id }, select: { id: true } })
        if (!odc) return res.status(404).json({ error: 'ODC tidak ditemukan' })
        return res.redirect(`${FRONTEND}/odc?detail=${id}`)
      }
      case 'odp': {
        const odp = await prisma.odp.findUnique({ where: { id }, select: { id: true } })
        if (!odp) return res.status(404).json({ error: 'ODP tidak ditemukan' })
        return res.redirect(`${FRONTEND}/odp?detail=${id}`)
      }
      case 'customer': {
        const cust = await prisma.customer.findUnique({
          where: { id },
          select: { id: true, odpId: true },
        })
        if (!cust) return res.status(404).json({ error: 'Pelanggan tidak ditemukan' })
        return res.redirect(`${FRONTEND}/odp?detail=${cust.odpId}&customer=${id}`)
      }
      default:
        return res.status(400).json({ error: 'Tipe QR tidak dikenal' })
    }
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
