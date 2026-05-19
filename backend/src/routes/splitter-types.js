import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// GET /api/splitter-types - List all splitter types
router.get('/', async (req, res, next) => {
  try {
    const types = await prisma.splitterType.findMany({
      where: { isActive: true },
      orderBy: [
        { category: 'asc' },
        { outputCount: 'asc' },
      ],
    })
    res.json(types)
  } catch (e) { next(e) }
})

// GET /api/splitter-types/:id - Get single splitter type
router.get('/:id', async (req, res, next) => {
  try {
    const type = await prisma.splitterType.findUnique({
      where: { id: req.params.id },
    })
    if (!type) return res.status(404).json({ error: 'Splitter type not found' })
    res.json(type)
  } catch (e) { next(e) }
})

export default router
