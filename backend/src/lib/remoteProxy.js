import net from 'node:net'
import crypto from 'node:crypto'

const sessions = new Map()
const MIN_PORT = Number(process.env.REMOTE_PROXY_MIN_PORT || 40000)
const MAX_PORT = Number(process.env.REMOTE_PROXY_MAX_PORT || 49999)
const TTL_MS = Number(process.env.REMOTE_PROXY_TTL_MS || 15 * 60 * 1000)
const IDLE_MS = Number(process.env.REMOTE_PROXY_IDLE_MS || 2 * 60 * 1000)
const MAX_SESSIONS = Number(process.env.REMOTE_PROXY_MAX_SESSIONS || 100)
const CONNECT_TIMEOUT_MS = Number(process.env.REMOTE_PROXY_CONNECT_TIMEOUT_MS || 5000)
const BIND_HOST = process.env.REMOTE_PROXY_BIND_HOST || '0.0.0.0'
const PUBLIC_URL = process.env.REMOTE_PROXY_PUBLIC_URL || ''

function pickPort() {
  const used = new Set([...sessions.values()].map(session => session.port))
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const port = MIN_PORT + crypto.randomInt(Math.max(1, MAX_PORT - MIN_PORT + 1))
    if (!used.has(port)) return port
  }
  throw new Error('Remote proxy port range penuh')
}

function closeSession(session) {
  if (!session || session.closed) return
  session.closed = true
  session.server.close()
  for (const socket of session.connections) socket.destroy()
  sessions.delete(session.id)
}

function shouldExpire(session, now = Date.now()) {
  return now >= session.expiresAt || now - session.lastActivityAt >= IDLE_MS
}

function buildPublicUrl(publicUrl, port) {
  const base = publicUrl.trim()
  if (!base) return `http://${BIND_HOST}:${port}`
  try {
    const url = new URL(base)
    url.port = String(port)
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    throw new Error('REMOTE_PROXY_PUBLIC_URL tidak valid')
  }
}

const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const session of sessions.values()) {
    if (shouldExpire(session, now)) closeSession(session)
  }
}, 30_000)
cleanupTimer.unref()

export async function createRemoteSession({ targetHost, targetPort = 80, ownerId, customerId, publicUrl = PUBLIC_URL }) {
  if (!net.isIP(targetHost)) throw new Error('IP ONU tidak valid')
  if (!Number.isInteger(Number(targetPort)) || Number(targetPort) < 1 || Number(targetPort) > 65535) {
    throw new Error('Port ONU tidak valid')
  }
  if (sessions.size >= MAX_SESSIONS) throw new Error('Jumlah sesi remote sedang penuh')

  const id = crypto.randomUUID()
  const port = pickPort()
  const server = net.createServer((client) => {
    const session = sessions.get(id)
    if (!session || session.closed) return client.destroy()
    session.connections.add(client)
    session.lastActivityAt = Date.now()

    const upstream = net.createConnection({ host: targetHost, port: Number(targetPort) })
    session.connections.add(upstream)
    upstream.setTimeout(CONNECT_TIMEOUT_MS, () => upstream.destroy())
    upstream.once('connect', () => upstream.setTimeout(0))
    const touch = () => { session.lastActivityAt = Date.now() }
    client.on('data', touch)
    upstream.on('data', touch)
    client.pipe(upstream)
    upstream.pipe(client)

    const closePair = () => {
      session.connections.delete(client)
      session.connections.delete(upstream)
      client.destroy()
      upstream.destroy()
    }
    client.on('error', closePair)
    upstream.on('error', closePair)
    client.on('close', closePair)
    upstream.on('close', closePair)
  })

  const session = {
    id,
    ownerId,
    customerId,
    port,
    server,
    connections: new Set(),
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
    closed: false,
  }

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.removeListener('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.removeListener('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, BIND_HOST)
  }).catch(error => {
    server.close()
    throw new Error(`Gagal membuka port remote: ${error.code || error.message}`)
  })

  sessions.set(id, session)
  server.on('error', () => closeSession(session))
  return {
    id,
    url: buildPublicUrl(publicUrl, port),
    port,
    expiresAt: new Date(session.expiresAt).toISOString(),
  }
}

export function closeRemoteSession(id, ownerId, customerId) {
  const session = sessions.get(id)
  if (!session || session.ownerId !== ownerId || session.customerId !== customerId) return false
  closeSession(session)
  return true
}

export function getRemoteSession(id, ownerId, customerId) {
  const session = sessions.get(id)
  if (!session || session.ownerId !== ownerId || session.customerId !== customerId || shouldExpire(session)) {
    if (session) closeSession(session)
    return null
  }
  return {
    id: session.id,
    port: session.port,
    expiresAt: new Date(session.expiresAt).toISOString(),
    lastActivityAt: new Date(session.lastActivityAt).toISOString(),
  }
}
