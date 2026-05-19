import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { body, validationResult } from 'express-validator'
import prisma from '../lib/prisma.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// All routes require ADMIN
router.use(authenticate, requireRole('ADMIN'))

// GET /api/users — list all users
router.get('/', async (req, res, next) => {
  try {
    const { q, role } = req.query
    const where = {}
    if (role) where.role = role
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
      ]
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        permissions: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(users)
  } catch (e) { next(e) }
})

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        permissions: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' })
    res.json(user)
  } catch (e) { next(e) }
})

// POST /api/users — create new user
router.post('/',
  body('username').trim().isLength({ min: 3, max: 32 }).matches(/^[a-zA-Z0-9_]+$/).withMessage('Username hanya boleh huruf, angka, dan underscore'),
  body('name').trim().notEmpty().withMessage('Nama wajib diisi'),
  body('password').isLength({ min: 6 }).withMessage('Password min. 6 karakter'),
  body('role').isIn(['ADMIN', 'TECHNICIAN', 'VIEWER']).withMessage('Role tidak valid'),
  async (req, res, next) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() })
    try {
      const { username, name, password, role, permissions } = req.body

      const exists = await prisma.user.findUnique({ where: { username } })
      if (exists) return res.status(409).json({ error: 'Username sudah digunakan' })

      const passwordHash = await bcrypt.hash(password, 12)
      const createData = { username, name, passwordHash, role }
      if (permissions && typeof permissions === 'object') createData.permissions = permissions
      const user = await prisma.user.create({
        data: createData,
        select: { id: true, username: true, name: true, role: true, permissions: true, createdAt: true },
      })
      res.status(201).json(user)
    } catch (e) { next(e) }
  }
)

// PATCH /api/users/:id — update user (name, role, password)
router.patch('/:id',
  body('name').optional().trim().notEmpty(),
  body('role').optional().isIn(['ADMIN', 'TECHNICIAN', 'VIEWER']),
  body('password').optional().isLength({ min: 6 }),
  async (req, res, next) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() })
    try {
      const { name, role, password, permissions } = req.body
      const data = {}

      if (name) data.name = name.trim()
      if (role) data.role = role
      if (password) data.passwordHash = await bcrypt.hash(password, 12)
      if (permissions !== undefined) data.permissions = permissions

      if (Object.keys(data).length === 0) {
        return res.status(400).json({ error: 'Tidak ada data yang diubah' })
      }

      const user = await prisma.user.update({
        where: { id: req.params.id },
        data,
        select: { id: true, username: true, name: true, role: true, permissions: true, createdAt: true, updatedAt: true },
      })
      res.json(user)
    } catch (e) {
      if (e.code === 'P2025') return res.status(404).json({ error: 'User tidak ditemukan' })
      next(e)
    }
  }
)

// DELETE /api/users/:id
router.delete('/:id', async (req, res, next) => {
  try {
    // Prevent self-delete
    if (req.params.id === req.user.sub) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' })
    }

    await prisma.user.delete({ where: { id: req.params.id } })
    res.status(204).end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'User tidak ditemukan' })
    next(e)
  }
})

// POST /api/users/:id/reset-password — reset password by admin
router.post('/:id/reset-password',
  body('password').isLength({ min: 6 }).withMessage('Password min. 6 karakter'),
  async (req, res, next) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() })
    try {
      const passwordHash = await bcrypt.hash(req.body.password, 12)
      await prisma.user.update({
        where: { id: req.params.id },
        data: { passwordHash },
      })
      res.json({ message: 'Password berhasil direset' })
    } catch (e) {
      if (e.code === 'P2025') return res.status(404).json({ error: 'User tidak ditemukan' })
      next(e)
    }
  }
)

export default router
