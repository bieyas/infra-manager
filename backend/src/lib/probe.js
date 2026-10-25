import net      from 'net'
import { exec } from 'child_process'
import { SnmpClient, OID } from './snmpClient.js'

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
 * Probe the configured management endpoint first so multiple devices behind
 * the same NAT address are checked independently.
 *
 * Returns { alive, latencyMs, method }
 */
export async function probeDevice({ ip, mgmtPort, mgmtProtocol, community, snmpCommunity, snmpVersion }) {
  if (mgmtProtocol === 'SNMP') {
    return probeSnmp(ip, mgmtPort, community ?? snmpCommunity, snmpVersion)
  }

  const port = mgmtPort ?? defaultPort(mgmtProtocol)
  if (port) {
    const r = await probeTcp(ip, port)
    return {
      alive: r.alive,
      latencyMs: r.alive ? r.latencyMs : null,
      method: `tcp:${port}`,
    }
  }

  const pingResult = await probePing(ip)
  if (pingResult.alive) {
    return { alive: true, latencyMs: pingResult.latencyMs, method: 'icmp' }
  }

  const fallbacks = [22, 23, 80, 443, 8728]
  for (const p of fallbacks) {
    const r = await probeTcp(ip, p, 1500)
    if (r.alive) return { alive: true, latencyMs: r.latencyMs, method: `tcp:${p}` }
  }

  return { alive: false, latencyMs: null, method: 'none' }
}

async function probeSnmp(host, port, community, version) {
  if (community === null) {
    return { alive: false, latencyMs: null, method: 'snmp-config-error' }
  }

  const startedAt = Date.now()
  let client
  try {
    client = new SnmpClient(host, {
      community: community || 'public',
      version: version || '2c',
      port: port || 161,
      timeout: 2000,
      retries: 0,
    })
    const descr = await client.getValue(OID.sysDescr)
    return { alive: descr !== null, latencyMs: Date.now() - startedAt, method: 'snmp' }
  } catch (_) {
    return { alive: false, latencyMs: null, method: 'snmp' }
  } finally {
    client?.close()
  }
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
