import { Router }        from 'express'
import bcrypt            from 'bcryptjs'
import jwt               from 'jsonwebtoken'
import { body, validationResult } from 'express-validator'
import prisma            from '../lib/prisma.js'

const EDITOR_ROLES = ['ADMIN', 'TECHNICIAN']

const router = Router()

function signAccess(payload)  {
  return jwt.sign(payload, process.env.JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRES_IN         || '15m' })
}
function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'  })
}

// POST /api/auth/register
router.post('/register',
  body('username').trim().isLength({ min: 3, max: 32 }).matches(/^[a-zA-Z0-9_]+$/),
  body('name').trim().notEmpty(),
  body('password').isLength({ min: 6 }),
  body('role').optional().isIn(['ADMIN', 'TECHNICIAN', 'VIEWER']),
  async (req, res, next) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() })
    try {
      const { username, name, password, role } = req.body
      const exists = await prisma.user.findUnique({ where: { username } })
      if (exists) return res.status(409).json({ error: 'Username already taken' })

      const passwordHash = await bcrypt.hash(password, 12)
      const user = await prisma.user.create({
        data: { username, name, passwordHash, role: role || 'VIEWER' },
        select: { id: true, username: true, name: true, role: true },
      })
      res.status(201).json({ user })
    } catch (e) { next(e) }
  }
)

// POST /api/auth/login
router.post('/login',
  body('username').trim().notEmpty(),
  body('password').notEmpty(),
  async (req, res, next) => {
    const errs = validationResult(req)
    if (!errs.isEmpty()) return res.status(422).json({ errors: errs.array() })
    try {
      const { username, password } = req.body
      const user = await prisma.user.findUnique({ where: { username } })
      if (!user) return res.status(401).json({ error: 'Username atau password salah' })

      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) return res.status(401).json({ error: 'Username atau password salah' })

      const payload = { sub: user.id, username: user.username, role: user.role }
      const accessToken  = signAccess(payload)
      const refreshToken = signRefresh(payload)

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      await prisma.refreshToken.create({ data: { token: refreshToken, userId: user.id, expiresAt } })

      res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, username: user.username, name: user.name, role: user.role, permissions: user.permissions },
      })
    } catch (e) { next(e) }
  }
)

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  const { refreshToken } = req.body
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' })
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    const stored  = await prisma.refreshToken.findUnique({ where: { token: refreshToken } })
    if (!stored || stored.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Refresh token invalid or expired' })
    }
    const user = await prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user) return res.status(401).json({ error: 'User not found' })

    const newPayload      = { sub: user.id, username: user.username, role: user.role }
    const newAccess       = signAccess(newPayload)
    const newRefresh      = signRefresh(newPayload)
    const expiresAt       = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await prisma.refreshToken.delete({ where: { token: refreshToken } })
    await prisma.refreshToken.create({ data: { token: newRefresh, userId: user.id, expiresAt } })

    res.json({ accessToken: newAccess, refreshToken: newRefresh })
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
  const { refreshToken } = req.body
  if (refreshToken) {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }).catch(() => {})
  }
  res.json({ message: 'Logged out' })
})

// GET /api/auth/me
import { authenticate } from '../middleware/auth.js'
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.user.sub },
      select: { id: true, username: true, name: true, role: true, permissions: true, createdAt: true },
    })
    res.json(user)
  } catch (e) { next(e) }
})

// PATCH /api/auth/me — update own profile (name, password)
router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const { name, currentPassword, newPassword } = req.body
    const data = {}

    if (name) data.name = name.trim()

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Password saat ini wajib diisi' })
      if (newPassword.length < 6) return res.status(400).json({ error: 'Password baru min. 6 karakter' })

      const user = await prisma.user.findUnique({ where: { id: req.user.sub } })
      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) return res.status(400).json({ error: 'Password saat ini salah' })

      data.passwordHash = await bcrypt.hash(newPassword, 12)
    }

    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Tidak ada data yang diubah' })

    const updated = await prisma.user.update({
      where: { id: req.user.sub },
      data,
      select: { id: true, username: true, name: true, role: true },
    })
    res.json(updated)
  } catch (e) { next(e) }
})

export default router
