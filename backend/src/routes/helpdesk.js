import { Router } from 'express'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

const PORTAL_BACKEND_URL = process.env.PORTAL_BACKEND_URL || 'http://127.0.0.1:3392'

// Helper to generate a temporary staff token for internal communication to portal backend
async function getPortalAdminToken(user) {
  try {
    const res = await fetch(`${PORTAL_BACKEND_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'aufa2026' })
    })
    const data = await res.json()
    return data.token
  } catch (err) {
    console.error('Failed to get portal admin token:', err.message)
    return null
  }
}

// 0. WebSocket Token & Server Info for WebRTC Studio
router.get('/ws-token', async (req, res) => {
  try {
    const token = await getPortalAdminToken(req.user)
    if (!token) return res.status(502).json({ error: 'Portal backend unreachable' })
    res.json({
      success: true,
      token,
      portalHost: '10.17.33.9:3392',
      wsPath: '/ws'
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 1. Dashboard summary stats
router.get('/dashboard', async (req, res) => {
  try {
    const token = await getPortalAdminToken(req.user)
    if (!token) return res.status(502).json({ error: 'Portal backend unreachable' })

    const response = await fetch(`${PORTAL_BACKEND_URL}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const json = await response.json()
    res.json(json)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 2. Customers list with help_status
router.get('/customers', async (req, res) => {
  try {
    const token = await getPortalAdminToken(req.user)
    if (!token) return res.status(502).json({ error: 'Portal backend unreachable' })

    const response = await fetch(`${PORTAL_BACKEND_URL}/api/admin/customers`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const json = await response.json()
    res.json(json)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 3. Reset customer password to default 12345678
router.post('/customers/:pelangganId/reset-password', async (req, res) => {
  try {
    const token = await getPortalAdminToken(req.user)
    if (!token) return res.status(502).json({ error: 'Portal backend unreachable' })

    const response = await fetch(`${PORTAL_BACKEND_URL}/api/admin/customers/${req.params.pelangganId}/reset-password`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    })
    const json = await response.json()
    res.json(json)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 4. Impersonate customer
router.post('/impersonate/:pelangganId', async (req, res) => {
  try {
    const token = await getPortalAdminToken(req.user)
    if (!token) return res.status(502).json({ error: 'Portal backend unreachable' })

    const response = await fetch(`${PORTAL_BACKEND_URL}/api/admin/impersonate/${req.params.pelangganId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ reason: `Dukungan Teknisi via InfraManager (${req.user?.username || 'Staff'})` })
    })
    const json = await response.json()
    res.json(json)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 5. Tickets list
router.get('/tickets', async (req, res) => {
  try {
    const token = await getPortalAdminToken(req.user)
    if (!token) return res.status(502).json({ error: 'Portal backend unreachable' })

    const response = await fetch(`${PORTAL_BACKEND_URL}/api/admin/tickets`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const json = await response.json()
    res.json(json)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 6. Update ticket status / assign
router.patch('/tickets/:id', async (req, res) => {
  try {
    const token = await getPortalAdminToken(req.user)
    if (!token) return res.status(502).json({ error: 'Portal backend unreachable' })

    const response = await fetch(`${PORTAL_BACKEND_URL}/api/admin/tickets/${req.params.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(req.body)
    })
    const json = await response.json()
    res.json(json)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// 7. Staff list
router.get('/staff', async (req, res) => {
  try {
    const token = await getPortalAdminToken(req.user)
    if (!token) return res.status(502).json({ error: 'Portal backend unreachable' })

    const response = await fetch(`${PORTAL_BACKEND_URL}/api/admin/staff`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    const json = await response.json()
    res.json(json)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
