import net      from 'net'
import { exec } from 'child_process'

/**
 * TCP connect probe — tries to open a TCP connection to host:port.
 * Returns { alive: bool, latencyMs: number }
 */
export function probeTcp(host, port, timeoutMs = 3000) {
  return new Promise(resolve => {
    const t0     = Date.now()
    const socket = new net.Socket()
    let done     = false

    const finish = (alive) => {
      if (done) return
      done = true
      socket.destroy()
      resolve({ alive, latencyMs: Date.now() - t0 })
    }

    socket.setTimeout(timeoutMs)
    socket.connect(port, host, () => finish(true))
    socket.on('error',   () => finish(false))
    socket.on('timeout', () => finish(false))
  })
}

/**
 * ICMP ping via system ping binary (1 packet, 2s timeout).
 * Falls back gracefully if ping is not available or not permitted.
 * Returns { alive: bool, latencyMs: number | null }
 */
export function probePing(host, timeoutMs = 3000) {
  return new Promise(resolve => {
    const t0  = Date.now()
    const sec = Math.ceil(timeoutMs / 1000)
    // Linux: ping -c1 -W<sec> <host>
    const cmd = `ping -c1 -W${sec} ${host}`

    exec(cmd, { timeout: timeoutMs + 500 }, (err, stdout) => {
      if (err) return resolve({ alive: false, latencyMs: null })

      // Parse "time=4.32 ms" from stdout
      const m = stdout.match(/time[<=]([\d.]+)\s*ms/i)
      resolve({
        alive:     true,
        latencyMs: m ? Math.round(parseFloat(m[1])) : (Date.now() - t0),
      })
    })
  })
}

/**
 * Full probe strategy for a device:
 * 1. Try ICMP ping first (fast, no port needed)
 * 2. If ping fails/unavailable, try TCP on management port
 * 3. If no mgmt port, try common ports: 22, 23, 80, 443, 8728
 *
 * Returns { alive, latencyMs, method }
 */
export async function probeDevice({ ip, mgmtPort, mgmtProtocol }) {
  // 1. ICMP ping
  const pingResult = await probePing(ip)
  if (pingResult.alive) {
    return { alive: true, latencyMs: pingResult.latencyMs, method: 'icmp' }
  }

  // 2. TCP on configured management port
  const port = mgmtPort || defaultPort(mgmtProtocol)
  if (port) {
    const r = await probeTcp(ip, port)
    if (r.alive) return { alive: true, latencyMs: r.latencyMs, method: `tcp:${port}` }
  }

  // 3. Try well-known ports
  const fallbacks = [22, 23, 80, 443, 8728].filter(p => p !== port)
  for (const p of fallbacks) {
    const r = await probeTcp(ip, p, 1500)
    if (r.alive) return { alive: true, latencyMs: r.latencyMs, method: `tcp:${p}` }
  }

  return { alive: false, latencyMs: null, method: 'none' }
}

function defaultPort(protocol) {
  switch (protocol) {
    case 'SSH':    return 22
    case 'TELNET': return 23
    case 'SNMP':   return 161
    case 'API':    return 8728
    case 'WEB':    return 80
    default:       return null
  }
}
