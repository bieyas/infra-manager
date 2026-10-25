import net from 'node:net'
import http from 'node:http'
import crypto from 'node:crypto'
import { allocateRemotePort, releaseRemotePort } from './remoteProxyPorts.js'

const sessions = new Map()
const MIN_PORT = Number(process.env.REMOTE_PROXY_MIN_PORT || 6100)
const MAX_PORT = Number(process.env.REMOTE_PROXY_MAX_PORT || 6999)
const TTL_MS = Number(process.env.REMOTE_PROXY_TTL_MS || 15 * 60 * 1000)
const IDLE_MS = Number(process.env.REMOTE_PROXY_IDLE_MS || 2 * 60 * 1000)
const MAX_SESSIONS = Number(process.env.REMOTE_PROXY_MAX_SESSIONS || 100)
const CONNECT_TIMEOUT_MS = Number(process.env.REMOTE_PROXY_CONNECT_TIMEOUT_MS || 5000)
const BIND_HOST = process.env.REMOTE_PROXY_BIND_HOST || '0.0.0.0'
const PUBLIC_URL = process.env.REMOTE_PROXY_PUBLIC_URL || ''
const DIAGNOSTICS_ENABLED = process.env.REMOTE_PROXY_DIAGNOSTICS !== 'false'

function clientPlatform(userAgent = '') {
  if (/android|iphone|ipad|ipod|mobile/i.test(userAgent)) return 'mobile'
  if (/windows|macintosh|linux|x11/i.test(userAgent)) return 'desktop'
  return 'unknown'
}

function safePath(requestUrl = '/') {
  let pathname = '/'
  try {
    pathname = new URL(requestUrl, 'http://remote-proxy').pathname
  } catch {}
  return pathname
    .split('/')
    .map(segment => segment.length > 48 || /^[\da-f]{24,}$/i.test(segment) ? '[redacted]' : segment)
    .join('/')
    .slice(0, 300)
}

function safeHost(value) {
  try {
    return new URL(value).host
  } catch {
    return null
  }
}

function cookieSummary(cookieHeader = '') {
  return String(cookieHeader)
    .split(';')
    .map(part => part.trim().split('=', 1)[0])
    .filter(Boolean)
}

function setCookieSummary(setCookie = []) {
  return setCookie.map(value => {
    const [pair, ...attributes] = value.split(';')
    const attributeValue = name => attributes
      .find(attribute => new RegExp(`^\\s*${name}=`, 'i').test(attribute))
      ?.split('=', 2)[1]?.trim() || null
    return {
      name: pair.split('=', 1)[0].trim(),
      domain: attributeValue('domain'),
      path: attributeValue('path'),
      expires: attributeValue('expires'),
      maxAge: attributeValue('max-age'),
      httpOnly: attributes.some(attribute => /^\s*httponly\s*$/i.test(attribute)),
      secure: attributes.some(attribute => /^\s*secure\s*$/i.test(attribute)),
      sameSite: attributes.find(attribute => /^\s*samesite=/i.test(attribute))?.split('=', 2)[1]?.trim() || null,
    }
  })
}

function logRemoteDiagnostic(data) {
  if (DIAGNOSTICS_ENABLED) console.info('[remote-diag]', JSON.stringify(data))
}

function trackSocket(session, socket) {
  if (session.trackedSockets.has(socket)) return
  session.trackedSockets.add(socket)
  session.connections.add(socket)
  socket.once('close', () => session.connections.delete(socket))
}

function closeSession(session) {
  if (!session || session.closed) return
  session.closed = true
  session.server.close(() => releaseRemotePort(session.port))
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

function formatHost(host) {
  return host.includes(':') ? `[${host}]` : host
}

function rewriteProxyOrigin(value, proxyUrl, targetOrigin, preservePath = false) {
  if (!value) return value
  try {
    const parsed = new URL(value)
    if (parsed.host === proxyUrl.host) {
      return preservePath
        ? `${targetOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`
        : targetOrigin
    }
  } catch {}
  return value
}

function rewriteLocation(value, targetHost, targetPort, publicUrl) {
  if (!value) return value
  try {
    const location = new URL(value)
    const locationHost = location.hostname.replace(/^\[|\]$/g, '')
    const locationPort = Number(location.port || (location.protocol === 'https:' ? 443 : 80))
    if (locationHost === targetHost && locationPort === targetPort) {
      return `${publicUrl}${location.pathname}${location.search}${location.hash}`
    }
  } catch {}
  return value
}

const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const session of sessions.values()) {
    if (shouldExpire(session, now)) closeSession(session)
  }
}, 30_000)
cleanupTimer.unref()

export async function createRemoteSession({
  targetHost, targetPort = 80, ownerId, customerId, publicUrl = PUBLIC_URL,
  onuSerial = null, onuIndex = null, onuModel = null, oltVendor = null, oltModel = null, clientUserAgent = '',
}) {
  if (!net.isIP(targetHost)) throw new Error('IP ONU tidak valid')
  if (!Number.isInteger(Number(targetPort)) || Number(targetPort) < 1 || Number(targetPort) > 65535) {
    throw new Error('Port ONU tidak valid')
  }
  if (sessions.size >= MAX_SESSIONS) throw new Error('Jumlah sesi remote sedang penuh')

  const id = crypto.randomUUID()
  const port = allocateRemotePort(MIN_PORT, MAX_PORT)
  const numericTargetPort = Number(targetPort)
  const targetOrigin = `http://${formatHost(targetHost)}${numericTargetPort === 80 ? '' : `:${numericTargetPort}`}`
  const publicSessionUrl = buildPublicUrl(publicUrl, port)
  const proxyUrl = new URL(publicSessionUrl)
  const server = http.createServer((clientReq, clientRes) => {
    const session = sessions.get(id)
    if (!session || session.closed) return clientRes.destroy()
    session.lastActivityAt = Date.now()

    const requestInfo = {
      event: 'request',
      session: id.slice(0, 8),
      platform: clientPlatform(clientReq.headers['user-agent']),
      userAgent: String(clientReq.headers['user-agent'] || '').slice(0, 240),
      onuIp: targetHost,
      onuModel: onuModel || 'unknown (not stored)',
      onuSerialSuffix: onuSerial ? String(onuSerial).slice(-4) : null,
      onuIndex: onuIndex || null,
      oltVendor: oltVendor || null,
      oltModel: oltModel || null,
      method: clientReq.method,
      path: safePath(clientReq.url),
      hasQuery: String(clientReq.url || '').includes('?'),
      contentType: clientReq.headers['content-type'] || null,
      originHost: clientReq.headers.origin ? safeHost(clientReq.headers.origin) : null,
      refererPath: clientReq.headers.referer ? safePath(clientReq.headers.referer) : null,
      cookieNames: cookieSummary(clientReq.headers.cookie),
      authorizationPresent: Boolean(clientReq.headers.authorization),
    }
    logRemoteDiagnostic(requestInfo)

    const headers = { ...clientReq.headers }
    headers.host = numericTargetPort === 80 ? targetHost : `${formatHost(targetHost)}:${numericTargetPort}`
    if (headers.origin) headers.origin = rewriteProxyOrigin(headers.origin, proxyUrl, targetOrigin)
    if (headers.referer) headers.referer = rewriteProxyOrigin(headers.referer, proxyUrl, targetOrigin, true)

    const upstream = http.request({
      host: targetHost,
      port: numericTargetPort,
      method: clientReq.method,
      path: clientReq.url,
      headers,
      timeout: CONNECT_TIMEOUT_MS,
    }, (upstreamRes) => {
      session.lastActivityAt = Date.now()
      const responseHeaders = { ...upstreamRes.headers }
      if (responseHeaders.location) {
        responseHeaders.location = rewriteLocation(responseHeaders.location, targetHost, numericTargetPort, publicSessionUrl)
      }
      if (responseHeaders['set-cookie']) {
        responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(cookie =>
          cookie.replace(/;\s*domain=[^;]*/i, ''))
      }
      logRemoteDiagnostic({
        ...requestInfo,
        event: 'response',
        status: upstreamRes.statusCode || 502,
        setCookies: setCookieSummary(responseHeaders['set-cookie'] || []),
        locationPath: responseHeaders.location ? safePath(responseHeaders.location) : null,
        server: responseHeaders.server || null,
        responseContentType: responseHeaders['content-type'] || null,
      })
      clientRes.writeHead(upstreamRes.statusCode || 502, responseHeaders)
      upstreamRes.on('data', () => { session.lastActivityAt = Date.now() })
      upstreamRes.pipe(clientRes)
    })

    upstream.on('socket', socket => {
      trackSocket(session, socket)
    })
    upstream.on('timeout', () => upstream.destroy(new Error('ONU request timeout')))
    upstream.on('error', error => {
      logRemoteDiagnostic({
        ...requestInfo,
        event: 'upstream-error',
        error: error.message,
      })
      if (!clientRes.headersSent) clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
      clientRes.end('Koneksi ke ONU gagal')
    })
    clientReq.on('data', () => { session.lastActivityAt = Date.now() })
    clientReq.pipe(upstream)
  })
  server.on('connection', socket => {
    const session = sessions.get(id)
    if (!session) return socket.destroy()
    trackSocket(session, socket)
  })

  const session = {
    id,
    ownerId,
    customerId,
    port,
    server,
    connections: new Set(),
    trackedSockets: new WeakSet(),
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
    releaseRemotePort(port)
    throw new Error(`Gagal membuka port remote: ${error.code || error.message}`)
  })

  sessions.set(id, session)
  server.on('error', () => closeSession(session))
  logRemoteDiagnostic({
    event: 'session-created',
    session: id.slice(0, 8),
    version: 'v1',
    platform: clientPlatform(clientUserAgent),
    userAgent: String(clientUserAgent || '').slice(0, 240),
    onuIp: targetHost,
    onuModel: onuModel || 'unknown (not stored)',
    onuSerialSuffix: onuSerial ? String(onuSerial).slice(-4) : null,
    onuIndex: onuIndex || null,
    oltVendor: oltVendor || null,
    oltModel: oltModel || null,
    proxyPort: port,
  })
  return {
    id,
    url: publicSessionUrl,
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
