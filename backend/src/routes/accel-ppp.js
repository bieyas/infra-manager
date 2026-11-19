import { Router } from 'express'
import { exec, execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

const ACCEL_CMD = '/usr/bin/accel-cmd'
const SECRETS_FILE = '/etc/ppp/chap-secrets'
const CONFIG_FILE = path.resolve(process.cwd(), 'src/config/accel-module.json')

function getModuleConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
      return { enabled: data.enabled ?? true }
    }
  } catch (e) {
    console.error('Error reading accel module config:', e.message)
  }
  return { enabled: true }
}

function saveModuleConfig(config) {
  const dir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
}

function runAccelCmd(args) {
  return new Promise((resolve, reject) => {
    execFile(ACCEL_CMD, args, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      resolve(stdout.trim())
    })
  })
}

function runSudoCmd(cmd) {
  return new Promise((resolve, reject) => {
    exec(`echo aufa2026 | sudo -S sh -c "${cmd.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message))
      resolve(stdout.trim())
    })
  })
}

// Module Config & Status Endpoints
router.get('/config', (_req, res) => {
  res.json(getModuleConfig())
})

router.patch('/config', requireRole('ADMIN'), (req, res) => {
  const { enabled } = req.body
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Field "enabled" harus boolean' })
  }
  saveModuleConfig({ enabled })
  res.json({ success: true, enabled, message: `Modul Accel-PPP berhasil ${enabled ? 'diaktifkan' : 'dinonaktifkan'}` })
})

// Middleware check if module is enabled
router.use((req, res, next) => {
  const cfg = getModuleConfig()
  if (!cfg.enabled && req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Modul Accel-PPP sedang dinonaktifkan', disabled: true })
  }
  next()
})

// GET /api/accel-ppp/status
router.get('/status', async (_req, res, next) => {
  try {
    let serviceActive = false
    try {
      const systemctl = await new Promise((resolve) => {
        exec('systemctl is-active accel-ppp', (_err, stdout) => resolve(stdout.trim()))
      })
      serviceActive = systemctl === 'active'
    } catch {}

    let statRaw = ''
    let poolRaw = ''
    let ifacesRaw = ''
    if (serviceActive) {
      try { statRaw = await runAccelCmd(['show', 'stat']) } catch {}
      try { poolRaw = await runAccelCmd(['show', 'ippool']) } catch {}
      try { ifacesRaw = await runAccelCmd(['pppoe', 'interface', 'show']) } catch {}
    }

    const uptimeMatch = statRaw.match(/uptime:\s*([^\r\n]+)/)
    const cpuMatch = statRaw.match(/cpu:\s*([^\r\n]+)/)
    const memMatch = statRaw.match(/mem\(rss\/virt\):\s*([0-9]+)/)
    const sessionsMatch = statRaw.match(/sessions:[\s\S]*?active:\s*(\d+)/)
    const padiMatch = statRaw.match(/recv PADI:\s*(\d+)/)
    const padoMatch = statRaw.match(/sent PADO:\s*(\d+)/)

    const stats = {
      uptime: uptimeMatch ? uptimeMatch[1].trim() : '-',
      cpu: cpuMatch ? cpuMatch[1].trim() : '0%',
      memRss: memMatch ? `${Math.round(parseInt(memMatch[1], 10) / 1024)} MB` : '0 MB',
      activeSessions: sessionsMatch ? parseInt(sessionsMatch[1], 10) : 0,
      pppoePadi: padiMatch ? parseInt(padiMatch[1], 10) : 0,
      pppoePado: padoMatch ? parseInt(padoMatch[1], 10) : 0,
    }

    const poolTotal = poolRaw.match(/total:\s*(\d+)/)
    const poolUsed = poolRaw.match(/used:\s*(\d+)/)
    const poolFree = poolRaw.match(/available:\s*(\d+)/)
    const poolUsage = poolRaw.match(/usage:\s*([^\r\n]+)/)

    const pool = {
      name: 'pool-lab',
      total: poolTotal ? parseInt(poolTotal[1], 10) : 241,
      used: poolUsed ? parseInt(poolUsed[1], 10) : 0,
      available: poolFree ? parseInt(poolFree[1], 10) : 241,
      usage: poolUsage ? poolUsage[1].trim() : '0%',
    }

    res.json({
      serviceActive,
      moduleConfig: getModuleConfig(),
      stats,
      pool,
      interfaces: ifacesRaw,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/accel-ppp/sessions
router.get('/sessions', async (_req, res, next) => {
  try {
    const raw = await runAccelCmd(['show', 'sessions'])
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (lines.length < 3) {
      return res.json({ sessions: [] })
    }

    const sessions = []
    for (let i = 2; i < lines.length; i++) {
      const cols = lines[i].split('|').map(c => c.trim())
      if (cols.length >= 8) {
        sessions.push({
          ifname: cols[0],
          username: cols[1],
          callingSid: cols[2],
          ip: cols[3],
          rateLimit: cols[4] || '-',
          type: cols[5],
          comp: cols[6],
          state: cols[7],
          uptime: cols[8] || '00:00:00',
        })
      }
    }
    res.json({ sessions })
  } catch (err) {
    next(err)
  }
})

// GET /api/accel-ppp/secrets
router.get('/secrets', async (_req, res, next) => {
  try {
    if (!fs.existsSync(SECRETS_FILE)) {
      return res.json({ secrets: [] })
    }
    const raw = fs.readFileSync(SECRETS_FILE, 'utf8')
    const lines = raw.split(/\r?\n/)
    const secrets = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const parts = trimmed.match(/"([^"]+)"|\S+/g) || []
      if (parts.length >= 3) {
        secrets.push({
          username: parts[0].replace(/^["']|["']$/g, ''),
          server: parts[1].replace(/^["']|["']$/g, ''),
          password: parts[2].replace(/^["']|["']$/g, ''),
          ipOrPool: parts[3] ? parts[3].replace(/^["']|["']$/g, '') : '*',
          rateLimit: parts[4] ? parts[4].replace(/^["']|["']$/g, '') : '-',
        })
      }
    }
    res.json({ secrets })
  } catch (err) {
    next(err)
  }
})

// POST /api/accel-ppp/secrets (Add / Edit Secret)
router.post('/secrets', async (req, res, next) => {
  try {
    const { username, password, ipOrPool = '*', rateLimit = '10240/5120' } = req.body
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan Password wajib diisi' })
    }

    let lines = []
    if (fs.existsSync(SECRETS_FILE)) {
      lines = fs.readFileSync(SECRETS_FILE, 'utf8').split(/\r?\n/)
    }

    let found = false
    const newLines = lines.map(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return line
      const parts = trimmed.match(/"([^"]+)"|\S+/g) || []
      if (parts.length >= 1 && parts[0].replace(/^["']|["']$/g, '') === username) {
        found = true
        return `"${username}" * "${password}" ${ipOrPool} ${rateLimit}`
      }
      return line
    })

    if (!found) {
      newLines.push(`"${username}" * "${password}" ${ipOrPool} ${rateLimit}`)
    }

    const tmpFile = `/tmp/chap_secrets_${Date.now()}`
    fs.writeFileSync(tmpFile, newLines.join('\n') + '\n', 'utf8')
    await runSudoCmd(`mv ${tmpFile} ${SECRETS_FILE} && chmod 600 ${SECRETS_FILE}`)
    res.json({ success: true, message: `Akun ${username} berhasil disimpan` })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/accel-ppp/secrets/:username
router.delete('/secrets/:username', async (req, res, next) => {
  try {
    const { username } = req.params
    const raw = fs.readFileSync(SECRETS_FILE, 'utf8')
    const lines = raw.split(/\r?\n/)
    const filtered = lines.filter(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return true
      const parts = trimmed.match(/"([^"]+)"|\S+/g) || []
      return parts.length >= 1 && parts[0].replace(/^["']|["']$/g, '') !== username
    })

    const tmpFile = `/tmp/chap_secrets_${Date.now()}`
    fs.writeFileSync(tmpFile, filtered.join('\n') + '\n', 'utf8')
    await runSudoCmd(`mv ${tmpFile} ${SECRETS_FILE} && chmod 600 ${SECRETS_FILE}`)
    res.json({ success: true, message: `Akun ${username} berhasil dihapus` })
  } catch (err) {
    next(err)
  }
})

// POST /api/accel-ppp/sessions/terminate
router.post('/sessions/terminate', async (req, res, next) => {
  try {
    const { ifname, username } = req.body
    if (ifname) {
      await runAccelCmd(['terminate', 'if', ifname])
    } else if (username) {
      await runAccelCmd(['terminate', 'username', username])
    } else {
      return res.status(400).json({ error: 'ifname atau username wajib disertakan' })
    }
    res.json({ success: true, message: `Sesi ${ifname || username} berhasil diputuskan` })
  } catch (err) {
    next(err)
  }
})

// POST /api/accel-ppp/shaper/change
router.post('/shaper/change', async (req, res, next) => {
  try {
    const { ifname, rate } = req.body
    if (!ifname || !rate) {
      return res.status(400).json({ error: 'ifname dan rate (down/up) wajib disertakan' })
    }
    await runAccelCmd(['shaper', 'change', ifname, rate])
    res.json({ success: true, message: `Kecepatan ${ifname} berhasil diubah ke ${rate}` })
  } catch (err) {
    next(err)
  }
})

// POST /api/accel-ppp/lab/dial (Simulator Klien Lab)
router.post('/lab/dial', async (req, res, next) => {
  try {
    const { username = 'test10m', password = 'aufa123' } = req.body
    await runSudoCmd('killall pppd 2>/dev/null || true')
    await new Promise(r => setTimeout(r, 600))
    await runSudoCmd(`ip netns exec ns-client pppd plugin rp-pppoe.so nic-veth-client user "${username}" password "${password}" noauth noipv6 nodefaultroute`)
    await new Promise(r => setTimeout(r, 1500))
    res.json({ success: true, message: `Simulasi dial PPPoE (${username}) berhasil dijalankan` })
  } catch (err) {
    next(err)
  }
})

// POST /api/accel-ppp/lab/disconnect
router.post('/lab/disconnect', async (_req, res, next) => {
  try {
    await runSudoCmd('killall pppd 2>/dev/null || true')
    res.json({ success: true, message: 'Simulasi klien lab berhasil diputus' })
  } catch (err) {
    next(err)
  }
})

// POST /api/accel-ppp/service/:action
router.post('/service/:action', async (req, res, next) => {
  try {
    const { action } = req.params
    if (action === 'reload') {
      await runAccelCmd(['reload'])
      return res.json({ success: true, message: 'Konfigurasi Accel-PPP berhasil di-reload' })
    } else if (action === 'restart') {
      await runSudoCmd('systemctl restart accel-ppp')
      return res.json({ success: true, message: 'Layanan Accel-PPP berhasil di-restart' })
    }
    res.status(400).json({ error: 'Action tidak didukung (gunakan reload atau restart)' })
  } catch (err) {
    next(err)
  }
})

export default router
