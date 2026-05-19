import { Router } from 'express'
import { exec, spawn } from 'child_process'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidTarget(t) {
  if (!t || typeof t !== 'string') return false
  const s = t.trim()
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return true
  // IPv6
  if (/^[0-9a-fA-F:]+$/.test(s) && s.includes(':')) return true
  // Hostname (letters, digits, dots, hyphens)
  if (/^[a-zA-Z0-9]([a-zA-Z0-9\-\.]{0,253}[a-zA-Z0-9])?$/.test(s)) return true
  return false
}

function sseSetup(res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
}

function sseLine(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

// ── POST /api/tools/ping ──────────────────────────────────────────────────────
// Body: { target: string, count?: number }
// Response: SSE stream of { type: 'line'|'summary'|'done'|'error', text?, stats? }

router.post('/ping', requireRole('ADMIN', 'TECHNICIAN', 'VIEWER'), (req, res) => {
  const target = (req.body.target ?? '').trim()
  const count  = Math.min(Math.max(parseInt(req.body.count) || 4, 1), 20)

  if (!isValidTarget(target)) {
    return res.status(422).json({ error: 'Target tidak valid' })
  }

  sseSetup(res)
  sseLine(res, { type: 'start', cmd: `ping -c${count} ${target}` })

  const proc = spawn('ping', ['-c', String(count), '-W', '2', target], { timeout: (count + 5) * 3000 })

  const stats = { sent: count, received: 0, loss: 100, min: null, avg: null, max: null }
  let done = false

  proc.stdout.on('data', chunk => {
    const lines = chunk.toString().split('\n')
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      sseLine(res, { type: 'line', text: line })
      // Parse stats
      const rxM = line.match(/(\d+) packets transmitted, (\d+) received/)
      if (rxM) {
        stats.sent     = parseInt(rxM[1])
        stats.received = parseInt(rxM[2])
        stats.loss     = Math.round((stats.sent - stats.received) / stats.sent * 100)
      }
      const rtM = line.match(/min\/avg\/max[^=]+=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/)
      if (rtM) {
        stats.min = parseFloat(rtM[1])
        stats.avg = parseFloat(rtM[2])
        stats.max = parseFloat(rtM[3])
      }
    }
  })

  proc.stderr.on('data', chunk => {
    sseLine(res, { type: 'line', text: chunk.toString().trim(), style: 'error' })
  })

  proc.on('close', code => {
    if (done) return
    done = true
    sseLine(res, { type: 'summary', stats, alive: stats.received > 0 })
    sseLine(res, { type: 'done' })
    res.end()
  })

  proc.on('error', err => {
    if (done) return
    done = true
    sseLine(res, { type: 'error', text: err.message })
    sseLine(res, { type: 'done' })
    res.end()
  })

  req.on('close', () => { if (!done) { done = true; proc.kill() } })
})

// ── POST /api/tools/traceroute ────────────────────────────────────────────────
// Body: { target: string, maxHops?: number }
// Response: SSE stream of { type: 'line'|'done'|'error', text? }

router.post('/traceroute', requireRole('ADMIN', 'TECHNICIAN', 'VIEWER'), (req, res) => {
  const target  = (req.body.target ?? '').trim()
  const maxHops = Math.min(Math.max(parseInt(req.body.maxHops) || 20, 5), 30)

  if (!isValidTarget(target)) {
    return res.status(422).json({ error: 'Target tidak valid' })
  }

  sseSetup(res)
  sseLine(res, { type: 'start', cmd: `traceroute -m${maxHops} ${target}` })

  // Use traceroute if available, fallback to tracepath
  const proc = spawn('traceroute', ['-m', String(maxHops), '-w', '2', '-n', target])

  let done = false

  proc.stdout.on('data', chunk => {
    const lines = chunk.toString().split('\n')
    for (const raw of lines) {
      const line = raw.trim()
      if (!line) continue
      sseLine(res, { type: 'line', text: line })
    }
  })

  proc.stderr.on('data', chunk => {
    // Try tracepath if traceroute not found
    sseLine(res, { type: 'line', text: chunk.toString().trim(), style: 'error' })
  })

  proc.on('close', () => {
    if (done) return
    done = true
    sseLine(res, { type: 'done' })
    res.end()
  })

  proc.on('error', err => {
    if (done) return
    done = true
    // traceroute binary missing — try tracepath
    if (err.code === 'ENOENT') {
      sseLine(res, { type: 'line', text: 'traceroute tidak tersedia, menggunakan tracepath…', style: 'warn' })
      const proc2 = spawn('tracepath', ['-n', '-m', String(maxHops), target])
      proc2.stdout.on('data', c => {
        c.toString().split('\n').filter(Boolean).forEach(l =>
          sseLine(res, { type: 'line', text: l.trim() })
        )
      })
      proc2.on('close', () => { done = true; sseLine(res, { type: 'done' }); res.end() })
      proc2.on('error', e => { sseLine(res, { type: 'error', text: e.message }); sseLine(res, { type: 'done' }); res.end() })
    } else {
      sseLine(res, { type: 'error', text: err.message })
      sseLine(res, { type: 'done' })
      res.end()
    }
  })

  req.on('close', () => { if (!done) { done = true; proc.kill() } })
})

// ── POST /api/tools/nslookup ──────────────────────────────────────────────────

router.post('/nslookup', requireRole('ADMIN', 'TECHNICIAN', 'VIEWER'), (req, res) => {
  const target = (req.body.target ?? '').trim()

  if (!isValidTarget(target)) {
    return res.status(422).json({ error: 'Target tidak valid' })
  }

  exec(`nslookup ${target}`, { timeout: 5000 }, (err, stdout, stderr) => {
    const lines = (stdout || stderr || err?.message || 'Gagal').split('\n').filter(Boolean)
    res.json({ lines })
  })
})

export default router
