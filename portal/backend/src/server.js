import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import http from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import path from 'path'
import { fileURLToPath } from 'url'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

import db, { initDatabase } from './db.js'
import {
  fetchCustomerFromBilling,
  fetchCustomerBills,
  requestDynamicQris,
  checkBillDetail
} from './billingClient.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 3392
const JWT_SECRET = process.env.JWT_SECRET || 'aufaportal_secret_key_2026'

initDatabase()

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Serve static frontend build if exists
const frontendDist = path.join(__dirname, '../../frontend/dist')
app.use(express.static(frontendDist))

// ── Auth Middlewares ──────────────────────────────────────────────────────────
function authenticateCustomer(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token otentikasi tidak ditemukan' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (decoded.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Akses khusus pelanggan' })
    }
    req.user = decoded
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Sesi telah kedaluwarsa, silakan login kembali' })
  }
}

function authenticateStaff(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token admin tidak ditemukan' })
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    if (!['superadmin', 'admin', 'cs', 'teknisi'].includes(decoded.role)) {
      return res.status(403).json({ success: false, message: 'Akses khusus staf/admin' })
    }
    req.staff = decoded
    next()
  } catch {
    return res.status(401).json({ success: false, message: 'Sesi admin telah kedaluwarsa' })
  }
}

// ── 1. CUSTOMER API ROUTES ────────────────────────────────────────────────────

// Login Pelanggan (ID Pelanggan + Password default 12345678)
app.post('/api/auth/login', async (req, res) => {
  const { pelanggan_id, password } = req.body || {}
  if (!pelanggan_id || !password) {
    return res.status(400).json({ success: false, message: 'ID Pelanggan dan Password wajib diisi' })
  }

  const pid = String(pelanggan_id).trim()

  let user = db.prepare('SELECT * FROM portal_users WHERE pelanggan_id = ?').get(pid)

  // Auto-Enrollment: jika belum ada di DB lokal portal, cek ke Main Billing AUFA
  if (!user) {
    console.log(`[Auto-Enroll] Checking ID ${pid} in Main Billing...`)
    const billingCust = await fetchCustomerFromBilling(pid)
    if (billingCust) {
      const defHash = bcrypt.hashSync('12345678', 10)
      const newId = 'cust-' + Date.now()
      db.prepare(`
        INSERT INTO portal_users (id, pelanggan_id, nama_lengkap, phone, password_hash)
        VALUES (?, ?, ?, ?, ?)
      `).run(newId, pid, billingCust.name, billingCust.phone || '', defHash)

      db.prepare(`
        INSERT INTO customer_cache (pelanggan_id, paket_name, harga_layanan, alamat, pop_name, status_layanan)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        pid,
        billingCust.paket?.name || 'Paket Internet',
        Number(billingCust.harga_layanan || billingCust.paket?.price || 100000),
        billingCust.address || '',
        billingCust.pop?.name || 'POP Pusat',
        billingCust.status || 'aktif'
      )

      user = db.prepare('SELECT * FROM portal_users WHERE pelanggan_id = ?').get(pid)
      console.log(`[Auto-Enroll] Successfully enrolled ${pid} (${billingCust.name})`)
    } else {
      return res.status(404).json({ success: false, message: 'ID Pelanggan tidak terdaftar di sistem AUFA' })
    }
  }

  if (!user.is_active) {
    return res.status(403).json({ success: false, message: 'Akun portal Anda dinonaktifkan. Hubungi CS.' })
  }

  const valid = bcrypt.compareSync(password, user.password_hash)
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Password salah' })
  }

  // Update last login
  db.prepare('UPDATE portal_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id)

  const token = jwt.sign({
    id: user.id,
    pelanggan_id: user.pelanggan_id,
    nama_lengkap: user.nama_lengkap,
    role: 'customer'
  }, JWT_SECRET, { expiresIn: '7d' })

  res.json({
    success: true,
    message: 'Login berhasil',
    token,
    user: {
      id: user.id,
      pelanggan_id: user.pelanggan_id,
      nama_lengkap: user.nama_lengkap,
      phone: user.phone,
      is_custom_password: Boolean(user.is_custom_password)
    }
  })
})

// Profil Pelanggan & Data Blending (Local Cache + Live Main Billing)
app.get('/api/customer/me', authenticateCustomer, async (req, res) => {
  const pid = req.user.pelanggan_id
  const user = db.prepare('SELECT id, pelanggan_id, nama_lengkap, phone, is_custom_password, created_at FROM portal_users WHERE pelanggan_id = ?').get(pid)
  const cache = db.prepare('SELECT * FROM customer_cache WHERE pelanggan_id = ?').get(pid) || {}
  const liveSession = db.prepare('SELECT status, staff_name FROM live_assist_sessions WHERE pelanggan_id = ?').get(pid)

  res.json({
    success: true,
    data: {
      ...user,
      cache,
      is_impersonated: req.user.is_impersonated || false,
      impersonated_by: req.user.admin_username || null,
      help_session: liveSession || { status: 'none' }
    }
  })
})

// Ganti Password Mandiri (Opsional)
app.post('/api/customer/change-password', authenticateCustomer, (req, res) => {
  const { current_password, new_password } = req.body || {}
  const user = db.prepare('SELECT password_hash FROM portal_users WHERE id = ?').get(req.user.id)

  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ success: false, message: 'Password saat ini salah' })
  }

  const newHash = bcrypt.hashSync(new_password, 10)
  db.prepare('UPDATE portal_users SET password_hash = ?, is_custom_password = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(newHash, req.user.id)

  res.json({ success: true, message: 'Password berhasil diperbarui' })
})

// Tagihan Pelanggan (Fetch dari Main Billing AUFA)
app.get('/api/customer/bills', authenticateCustomer, async (req, res) => {
  const pid = req.user.pelanggan_id
  const bills = await fetchCustomerBills(pid)
  res.json({ success: true, data: bills || [] })
})

// Request Bayar QRIS (24 Jam Expiration)
app.post('/api/customer/qris', authenticateCustomer, async (req, res) => {
  const { tagihan_id } = req.body || {}
  const pid = req.user.pelanggan_id

  // 1. Cek apakah sudah ada QRIS aktif yang belum kedaluwarsa di portal_db
  const existing = db.prepare(`
    SELECT * FROM payment_requests 
    WHERE tagihan_id = ? AND pelanggan_id = ? AND status = 'pending' AND expired_at > CURRENT_TIMESTAMP
    ORDER BY created_at DESC LIMIT 1
  `).get(tagihan_id, pid)

  if (existing) {
    return res.json({
      success: true,
      message: 'Menggunakan QRIS aktif (berlaku 24 jam)',
      data: {
        payment_id: existing.id,
        tagihan_id: existing.tagihan_id,
        nominal: existing.nominal,
        qr_string: existing.qr_string,
        expired_at: existing.expired_at,
        created_at: existing.created_at
      }
    })
  }

  // 2. Jika belum ada atau sudah lewat 24 jam, generate baru ke Main Billing
  const qrisResp = await requestDynamicQris(tagihan_id)
  
  const paymentId = 'pay-' + Date.now()
  const nominal = Number(qrisResp?.nominal || qrisResp?.amount || 100000)
  const qrString = qrisResp?.qr_string || qrisResp?.qrCode || '00020101021226680014ID.LINKAJA.WWW0118936009110022340123'
  
  // Set expired 24 jam dari sekarang
  const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ')

  db.prepare(`
    INSERT INTO payment_requests (id, tagihan_id, pelanggan_id, nominal, qr_string, expired_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(paymentId, tagihan_id, pid, nominal, qrString, expiredAt)

  res.json({
    success: true,
    message: 'QRIS 24 Jam berhasil dibuat',
    data: {
      payment_id: paymentId,
      tagihan_id,
      nominal,
      qr_string: qrString,
      expired_at: expiredAt
    }
  })
})

// Status Pembayaran Tagihan
app.get('/api/customer/bills/:tagihanId/status', authenticateCustomer, async (req, res) => {
  const { tagihanId } = req.params
  const bill = await checkBillDetail(tagihanId)
  if (bill && (bill.status === 'PAID' || bill.status === 'Lunas')) {
    db.prepare("UPDATE payment_requests SET status = 'paid' WHERE tagihan_id = ?").run(tagihanId)
  }
  res.json({ success: true, bill })
})

// Tiket Pengaduan Mandiri (Helpdesk Pelanggan)
app.post('/api/customer/tickets', authenticateCustomer, (req, res) => {
  const { kategori, judul, deskripsi } = req.body || {}
  const pid = req.user.pelanggan_id

  if (!judul || !deskripsi) {
    return res.status(400).json({ success: false, message: 'Judul dan rincian aduan wajib diisi' })
  }

  const ticketId = 'tkt-' + Date.now()
  const ticketNumber = 'AUFA-' + Math.floor(100000 + Math.random() * 900000)

  db.prepare(`
    INSERT INTO tickets (id, ticket_number, pelanggan_id, kategori, judul, deskripsi, status)
    VALUES (?, ?, ?, ?, ?, ?, 'open')
  `).run(ticketId, ticketNumber, pid, kategori || 'los_mati', judul, deskripsi)

  // Pesan inisial pelanggan
  db.prepare(`
    INSERT INTO ticket_messages (ticket_id, sender_type, sender_name, message)
    VALUES (?, 'customer', ?, ?)
  `).run(ticketId, req.user.nama_lengkap, deskripsi)

  res.json({
    success: true,
    message: 'Tiket aduan berhasil dibuat',
    ticket: { id: ticketId, ticket_number: ticketNumber, status: 'open' }
  })
})

app.get('/api/customer/tickets', authenticateCustomer, (req, res) => {
  const pid = req.user.pelanggan_id
  const tickets = db.prepare('SELECT * FROM tickets WHERE pelanggan_id = ? ORDER BY created_at DESC').all(pid)
  res.json({ success: true, data: tickets })
})

app.get('/api/customer/tickets/:id/messages', authenticateCustomer, (req, res) => {
  const messages = db.prepare('SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC').all(req.params.id)
  res.json({ success: true, data: messages })
})

app.post('/api/customer/tickets/:id/messages', authenticateCustomer, (req, res) => {
  const { message } = req.body || {}
  if (!message) return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong' })

  db.prepare(`
    INSERT INTO ticket_messages (ticket_id, sender_type, sender_name, message)
    VALUES (?, 'customer', ?, ?)
  `).run(req.params.id, req.user.nama_lengkap, message)

  res.json({ success: true, message: 'Balasan terkirim' })
})

// ── 2. ADMIN AUTH & DASHBOARD ROUTES ──────────────────────────────────────────

const handleAdminLogin = (req, res) => {
  const { username, password } = req.body || {}
  const staff = db.prepare('SELECT * FROM staff_users WHERE username = ?').get(username)
  if (!staff || !staff.is_active) {
    return res.status(401).json({ success: false, message: 'Username atau password salah' })
  }

  const valid = bcrypt.compareSync(password, staff.password_hash)
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Username atau password salah' })
  }

  const token = jwt.sign({
    id: staff.id,
    username: staff.username,
    nama_lengkap: staff.nama_lengkap,
    role: staff.role
  }, JWT_SECRET, { expiresIn: '12h' })

  res.json({
    success: true,
    token,
    staff: {
      id: staff.id,
      username: staff.username,
      nama_lengkap: staff.nama_lengkap,
      role: staff.role
    }
  })
}

app.post('/api/admin/auth/login', handleAdminLogin)
app.post('/api/admin/login', handleAdminLogin)

// Ringkasan Dashboard Admin
app.get('/api/admin/dashboard', authenticateStaff, (req, res) => {
  const openTickets = db.prepare("SELECT count(*) as c FROM tickets WHERE status = 'open'").get().c
  const totalCustomers = db.prepare("SELECT count(*) as c FROM portal_users").get().c
  const totalTrx = db.prepare("SELECT count(*) as c FROM payment_requests WHERE status = 'paid'").get().c
  const activeHelp = db.prepare("SELECT count(*) as c FROM live_assist_sessions WHERE status IN ('requesting', 'active')").get().c

  res.json({
    success: true,
    data: { openTickets, totalCustomers, totalTrx, activeHelp }
  })
})

// Daftar Pelanggan Portal & Status Live Bantuan (Badge Hijau)
app.get('/api/admin/customers', authenticateStaff, (req, res) => {
  const customers = db.prepare(`
    SELECT u.id, u.pelanggan_id, u.nama_lengkap, u.phone, u.is_custom_password, u.last_login_at,
           c.paket_name, c.alamat, c.status_layanan,
           COALESCE(l.status, 'none') as help_status,
           l.staff_name as help_staff_name
    FROM portal_users u
    LEFT JOIN customer_cache c ON u.pelanggan_id = c.pelanggan_id
    LEFT JOIN live_assist_sessions l ON u.pelanggan_id = l.pelanggan_id
    ORDER BY u.created_at DESC
  `).all()

  res.json({ success: true, data: customers })
})

// Reset Password Pelanggan ke Default '12345678'
app.post('/api/admin/customers/:pelangganId/reset-password', authenticateStaff, (req, res) => {
  const defHash = bcrypt.hashSync('12345678', 10)
  db.prepare(`
    UPDATE portal_users 
    SET password_hash = ?, is_custom_password = 0, updated_at = CURRENT_TIMESTAMP
    WHERE pelanggan_id = ?
  `).run(defHash, req.params.pelangganId)

  res.json({ success: true, message: `Password pelanggan ${req.params.pelangganId} berhasil direset ke 12345678` })
})

// Fitur Admin Impersonate
app.post('/api/admin/impersonate/:pelangganId', authenticateStaff, (req, res) => {
  const targetPid = req.params.pelangganId
  const user = db.prepare('SELECT * FROM portal_users WHERE pelanggan_id = ?').get(targetPid)
  if (!user) {
    return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan di portal' })
  }

  // Audit log
  try {
    const logId = `imp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
    db.prepare(`
      INSERT INTO impersonate_audit_logs (id, admin_id, admin_username, target_pelanggan_id, reason, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      logId,
      req.staff?.id || 'staff-admin-1',
      req.staff?.username || 'admin',
      targetPid,
      req.body?.reason || 'Bantuan Remote Helpdesk',
      req.ip || '127.0.0.1'
    )
  } catch (auditErr) {
    console.warn('[IMPERSONATE AUDIT WARNING]', auditErr.message)
  }

  // Generate Impersonated Token (Masa berlaku 2 jam)
  const impersonateToken = jwt.sign({
    id: user.id,
    pelanggan_id: user.pelanggan_id,
    nama_lengkap: user.nama_lengkap,
    role: 'customer',
    is_impersonated: true,
    admin_id: req.staff.id,
    admin_username: req.staff.username
  }, JWT_SECRET, { expiresIn: '2h' })

  console.log(`[IMPERSONATE] Admin ${req.staff.username} is impersonating ${targetPid} (${user.nama_lengkap})`)

  res.json({
    success: true,
    message: `Berhasil masuk mode impersonasi untuk ${user.nama_lengkap}`,
    token: impersonateToken,
    user: {
      id: user.id,
      pelanggan_id: user.pelanggan_id,
      nama_lengkap: user.nama_lengkap,
      is_impersonated: true,
      impersonated_by: req.staff.username
    }
  })
})

// Pengelolaan Tiket Aduan oleh Admin/Teknisi
app.get('/api/admin/tickets', authenticateStaff, (req, res) => {
  const tickets = db.prepare(`
    SELECT t.*, u.nama_lengkap, u.phone, s.nama_lengkap as assigned_staff_name
    FROM tickets t
    JOIN portal_users u ON t.pelanggan_id = u.pelanggan_id
    LEFT JOIN staff_users s ON t.assigned_to_staff_id = s.id
    ORDER BY t.created_at DESC
  `).all()
  res.json({ success: true, data: tickets })
})

app.patch('/api/admin/tickets/:id', authenticateStaff, (req, res) => {
  const tid = req.params.id
  const { status, assigned_to_staff_id, resolution_notes, prioritas } = req.body || {}

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(tid)
  if (!ticket) return res.status(404).json({ success: false, message: 'Tiket tidak ditemukan' })

  let updateFields = []
  let params = []

  if (status) {
    updateFields.push('status = ?')
    params.push(status)
    if (status === 'resolved' || status === 'closed') {
      updateFields.push('resolved_at = CURRENT_TIMESTAMP')
    }
  }
  if (assigned_to_staff_id) {
    updateFields.push('assigned_to_staff_id = ?')
    params.push(assigned_to_staff_id)
  }
  if (resolution_notes) {
    updateFields.push('resolution_notes = ?')
    params.push(resolution_notes)
  }
  if (prioritas) {
    updateFields.push('prioritas = ?')
    params.push(prioritas)
  }

  updateFields.push('updated_at = CURRENT_TIMESTAMP')
  params.push(tid)

  db.prepare(`UPDATE tickets SET ${updateFields.join(', ')} WHERE id = ?`).run(...params)

  res.json({ success: true, message: 'Tiket berhasil diperbarui' })
})

// Daftar Teknisi & CS
app.get('/api/admin/staff', authenticateStaff, (req, res) => {
  const staff = db.prepare('SELECT id, username, nama_lengkap, role, phone, is_active FROM staff_users').all()
  res.json({ success: true, data: staff })
})

// Fallback index.html for SPA client routing
app.use((req, res) => {
  const indexPath = path.join(frontendDist, 'index.html')
  res.sendFile(indexPath, err => {
    if (err) res.json({ message: 'AUFA Customer Portal API Engine running on port ' + PORT })
  })
})

// ── 3. WEBSOCKET REAL-TIME ENGINE (Bantu Saya, Co-Browsing, WebRTC Signaling) ─
const server = http.createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

const clients = new Map() // ws -> metadata { role, id, pelanggan_id, username }

function broadcastToStaff(payload) {
  const msg = JSON.stringify(payload)
  for (const [ws, meta] of clients.entries()) {
    if (meta.role === 'staff' && ws.readyState === WebSocket.OPEN) {
      ws.send(msg)
    }
  }
}

wss.on('connection', ws => {
  clients.set(ws, { role: 'guest' })

  ws.on('message', data => {
    try {
      const msg = JSON.parse(data.toString())

      // 1. Authenticate WebSocket connection
      if (msg.type === 'AUTH') {
        try {
          const decoded = jwt.verify(msg.token, JWT_SECRET)
          clients.set(ws, {
            role: decoded.role === 'customer' ? 'customer' : 'staff',
            id: decoded.id,
            pelanggan_id: decoded.pelanggan_id || null,
            username: decoded.username || decoded.nama_lengkap
          })
          ws.send(JSON.stringify({ type: 'AUTH_SUCCESS', role: decoded.role, username: decoded.username || decoded.nama_lengkap }))
        } catch {
          ws.send(JSON.stringify({ type: 'AUTH_ERROR', message: 'Token tidak valid' }))
        }
      }

      // 2. Customer Triggers "BANTU SAYA"
      else if (msg.type === 'CUSTOMER_REQUEST_HELP') {
        const meta = clients.get(ws)
        const pid = msg.pelanggan_id || meta?.pelanggan_id
        const customerName = meta?.username || msg.nama_lengkap || 'Pelanggan AUFA'

        if (pid) {
          db.prepare(`
            INSERT INTO live_assist_sessions (pelanggan_id, status, updated_at)
            VALUES (?, 'requesting', CURRENT_TIMESTAMP)
            ON CONFLICT(pelanggan_id) DO UPDATE SET status = 'requesting', staff_id = NULL, staff_name = NULL, updated_at = CURRENT_TIMESTAMP
          `).run(pid)

          console.log(`[HELP] Pelanggan ${pid} (${customerName}) meminta bantuan layar!`)
          
          // Ack back to customer
          ws.send(JSON.stringify({
            type: 'HELP_REQUEST_ACK',
            status: 'requesting',
            message: 'Permintaan bantuan telah terkirim ke tim support'
          }))

          // Broadcast badge to all logged-in staff
          broadcastToStaff({
            type: 'CUSTOMER_HELP_BADGE',
            pelanggan_id: pid,
            nama_lengkap: customerName,
            status: 'requesting'
          })
        }
      }

      // 3. Customer Cancels "BANTU SAYA"
      else if (msg.type === 'CUSTOMER_CANCEL_HELP') {
        const meta = clients.get(ws)
        const pid = msg.pelanggan_id || meta?.pelanggan_id
        if (pid) {
          db.prepare(`
            UPDATE live_assist_sessions 
            SET status = 'closed', updated_at = CURRENT_TIMESTAMP
            WHERE pelanggan_id = ?
          `).run(pid)

          console.log(`[HELP] Pelanggan ${pid} membatalkan bantuan layar`)
          ws.send(JSON.stringify({ type: 'HELP_SESSION_ENDED', reason: 'cancelled_by_customer' }))
          
          broadcastToStaff({
            type: 'CUSTOMER_HELP_BADGE',
            pelanggan_id: pid,
            status: 'closed'
          })
        }
      }

      // 4. Staff Accepts Live Session
      else if (msg.type === 'STAFF_ACCEPT_HELP') {
        const meta = clients.get(ws)
        const targetPid = msg.target_pelanggan_id
        const staffName = meta?.username || 'Tim Support AUFA'
        const staffId = meta?.id || 'staff'

        db.prepare(`
          INSERT INTO live_assist_sessions (pelanggan_id, status, staff_id, staff_name, updated_at)
          VALUES (?, 'active', ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(pelanggan_id) DO UPDATE SET status = 'active', staff_id = ?, staff_name = ?, updated_at = CURRENT_TIMESTAMP
        `).run(targetPid, staffId, staffName, staffId, staffName)

        console.log(`[HELP] CS ${staffName} menerima bantuan layar untuk ${targetPid}!`)

        // Notify specific customer that staff is connected
        let customerConnected = false
        for (const [cWs, cMeta] of clients.entries()) {
          if (cMeta.pelanggan_id === targetPid && cWs.readyState === WebSocket.OPEN) {
            cWs.send(JSON.stringify({
              type: 'HELP_SESSION_CONNECTED',
              staff_name: staffName,
              staff_id: staffId,
              target_pelanggan_id: targetPid
            }))
            customerConnected = true
          }
        }

        // Notify current staff connection confirmed
        ws.send(JSON.stringify({
          type: 'STAFF_HELP_CONNECTED',
          target_pelanggan_id: targetPid,
          customer_online: customerConnected
        }))

        // Broadcast to all staff that this customer is now in active session
        broadcastToStaff({
          type: 'CUSTOMER_HELP_BADGE',
          pelanggan_id: targetPid,
          status: 'active',
          staff_name: staffName
        })
      }

      // 5. End Help Session (By Customer or Staff)
      else if (msg.type === 'END_HELP_SESSION') {
        const targetPid = msg.target_pelanggan_id || clients.get(ws)?.pelanggan_id
        if (targetPid) {
          db.prepare(`
            UPDATE live_assist_sessions 
            SET status = 'closed', updated_at = CURRENT_TIMESTAMP
            WHERE pelanggan_id = ?
          `).run(targetPid)

          console.log(`[HELP] Sesi bantuan untuk ${targetPid} diselesaikan`)

          for (const [cWs, cMeta] of clients.entries()) {
            if ((cMeta.pelanggan_id === targetPid || cMeta.role === 'staff') && cWs.readyState === WebSocket.OPEN) {
              cWs.send(JSON.stringify({
                type: 'HELP_SESSION_ENDED',
                target_pelanggan_id: targetPid
              }))
            }
          }

          broadcastToStaff({
            type: 'CUSTOMER_HELP_BADGE',
            pelanggan_id: targetPid,
            status: 'closed'
          })
        }
      }

      // 6. Relay WebRTC Signal & Co-Browsing Pointer / Visual Guidance
      else if (msg.type === 'WEBRTC_SIGNAL' || msg.type === 'COBROWSE_POINTER' || msg.type === 'COBROWSE_GUIDE') {
        const targetPid = msg.target_pelanggan_id
        for (const [cWs, cMeta] of clients.entries()) {
          if (cWs !== ws && cWs.readyState === WebSocket.OPEN) {
            // Relays to the target customer OR to staff monitoring
            if (cMeta.pelanggan_id === targetPid || cMeta.role === 'staff') {
              cWs.send(JSON.stringify(msg))
            }
          }
        }
      }

    } catch (e) {
      console.error('WS Error:', e.message)
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 AUFA Customer Portal Backend running on http://0.0.0.0:${PORT}`)
})
