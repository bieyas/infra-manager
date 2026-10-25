import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import net from 'node:net'
import { allocateRemotePort, releaseRemotePort } from './remoteProxyPorts.js'

const execFileAsync = promisify(execFile)
const sessions = new Map()
const MIN_PORT = Number(process.env.REMOTE_PROXY_MIN_PORT || 6100)
const MAX_PORT = Number(process.env.REMOTE_PROXY_MAX_PORT || 6999)
const TTL_MS = Number(process.env.REMOTE_PROXY_TTL_MS || 15 * 60 * 1000)
const HELPER = process.env.REMOTE_PROXY_NAT_HELPER || '/usr/local/sbin/infra-manager-onu-nat'
const SUDO = process.env.REMOTE_PROXY_SUDO || '/usr/bin/sudo'
const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0

function runHelper(args) {
  const command = runningAsRoot ? HELPER : SUDO
  const commandArgs = runningAsRoot ? args : ['-n', HELPER, ...args]
  return execFileAsync(command, commandArgs, { timeout: 10_000, maxBuffer: 16 * 1024 })
}

function isValidCidr(value) {
  const [address, prefix, ...extra] = String(value || '').split('/')
  if (extra.length || net.isIP(address) !== 4) return false
  if (prefix === undefined) return true
  return /^\d+$/.test(prefix) && Number(prefix) >= 0 && Number(prefix) <= 32
}

function buildPublicUrl(publicUrl, port) {
  const base = String(publicUrl || '').trim()
  if (!base) throw new Error('REMOTE_PROXY_PUBLIC_URL belum dikonfigurasi')
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

async function removeSession(session) {
  if (!session || session.closing) return
  session.closing = true
  try {
    await runHelper(['remove', session.id])
    sessions.delete(session.id)
    releaseRemotePort(session.port)
  } catch (error) {
    session.closing = false
    throw new Error(`Gagal menghapus rule NAT: ${error.stderr?.trim() || error.message}`)
  }
}

const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const session of sessions.values()) {
    if (now >= session.expiresAt) removeSession(session).catch(error => console.error(error.message))
  }
}, 30_000)
cleanupTimer.unref()

export async function initializeRemoteNatProxy() {
  await runHelper(['reset'])
}

export async function checkRemoteNatHelper(ingressInterface) {
  const args = ingressInterface ? ['check', ingressInterface] : ['check']
  await runHelper(args)
  return true
}

export async function createNatRemoteSession({ targetHost, targetPort = 80, ownerId, customerId, publicUrl, sourceCidr, ingressInterface }) {
  if (net.isIP(targetHost) !== 4) throw new Error('NAT v2 hanya mendukung IP ONU IPv4')
  if (!Number.isInteger(Number(targetPort)) || Number(targetPort) < 1 || Number(targetPort) > 65535) {
    throw new Error('Port ONU tidak valid')
  }
  if (!/^[a-zA-Z0-9_.:-]{1,15}$/.test(String(ingressInterface || ''))) {
    throw new Error('Interface ingress NAT belum dikonfigurasi')
  }
  if (!isValidCidr(sourceCidr)) throw new Error('Allowlist CIDR NAT belum valid')
  if (sessions.size >= 100) throw new Error('Jumlah sesi remote sedang penuh')

  const id = crypto.randomUUID()
  const port = allocateRemotePort(MIN_PORT, MAX_PORT)
  let url
  try {
    url = buildPublicUrl(publicUrl, port)
    await runHelper(['add', id, ingressInterface, String(port), targetHost, String(Number(targetPort)), sourceCidr])
  } catch (error) {
    releaseRemotePort(port)
    const detail = [
      error.stderr?.trim(),
      error.stdout?.trim(),
      error.code !== undefined ? `exit code: ${error.code}` : null,
      error.message,
    ].filter(Boolean).join('\n')
    throw new Error(`Gagal memasang NAT v2: ${detail}`)
  }

  const session = {
    id,
    ownerId,
    customerId,
    port,
    url,
    createdAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
    closing: false,
  }
  sessions.set(id, session)
  return { id, url, port, expiresAt: new Date(session.expiresAt).toISOString(), version: 'v2' }
}

export async function closeNatRemoteSession(id, ownerId, customerId) {
  const session = sessions.get(id)
  if (!session || session.ownerId !== ownerId || session.customerId !== customerId) return false
  await removeSession(session)
  return true
}

export function getNatRemoteSession(id, ownerId, customerId) {
  const session = sessions.get(id)
  if (!session || session.ownerId !== ownerId || session.customerId !== customerId || Date.now() >= session.expiresAt) {
    if (session) removeSession(session).catch(error => console.error(error.message))
    return null
  }
  return {
    id: session.id,
    port: session.port,
    expiresAt: new Date(session.expiresAt).toISOString(),
    lastActivityAt: new Date(session.createdAt).toISOString(),
    version: 'v2',
  }
}