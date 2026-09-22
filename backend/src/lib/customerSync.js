import prisma from './prisma.js'
import { createDriver } from '../drivers/registry.js'
import { withDriver } from '../drivers/BaseDriver.js'

const SYNC_COOLDOWN_MS = 5 * 60 * 1000
const running = new Map()

function normalizeCustomerComment(comment) {
  const value = String(comment || '').trim()
  const explicitId = value.match(/^(.+?)\s*-\s*(\d{6,})$/)
  const suffixId = value.match(/^([A-Za-z][A-Za-z\s]*?)(\d{6,})$/)
  const atFormat = value.match(/^(.+?)@([^\s]+)$/)
  const namePart = explicitId?.[1] || suffixId?.[1] || atFormat?.[1] || value
  const normalizedName = namePart.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
  const name = /^[A-Z\s]+$/.test(normalizedName)
    ? normalizedName
    : normalizedName.replace(/^Arief\b/i, 'Arie').replace(/\b\w/g, char => char.toUpperCase())
  return { name: name || null, customerId: explicitId?.[2] || suffixId?.[2] || null }
}

async function generatedCustomerId(usedIds) {
  const now = new Date()
  const prefix = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const rows = await prisma.customer.findMany({ where: { customerId: { startsWith: prefix } }, select: { customerId: true } })
  const taken = new Set([...rows.map(row => row.customerId), ...usedIds])
  let sequence = 1
  while (taken.has(`${prefix}${String(sequence).padStart(3, '0')}`)) sequence += 1
  const id = `${prefix}${String(sequence).padStart(3, '0')}`
  usedIds.add(id)
  return id
}

async function identityFor(comment, usedIds, existingId = null) {
  const normalized = normalizeCustomerComment(comment)
  if (normalized.customerId) {
    const conflict = await prisma.customer.findUnique({ where: { customerId: normalized.customerId }, select: { id: true } })
    if (!conflict || conflict.id === existingId) {
      usedIds.add(normalized.customerId)
      return normalized
    }
  }
  return { name: normalized.name, customerId: await generatedCustomerId(usedIds) }
}

function parseRateLimitSpeed(rateLimit) {
  const match = String(rateLimit || '').split('/')[0].trim().toUpperCase().match(/^(\d+(?:\.\d+)?)([KMG]?)B?$/)
  if (!match) return null
  return Math.round(Number(match[1]) * ({ '': 1, K: 1 / 1000, M: 1, G: 1000 }[match[2]]))
}

function isIsolationAddress(address) {
  return /^10\.127\./.test(String(address || '').trim())
}

function isIsolationProfile(profile) {
  return /isolir|isolate|blocked|suspend/i.test(String(profile || ''))
}

export function classifyCustomerConnection({ session = null, secret = null } = {}) {
  if (!session && !secret) {
    return { serviceStatus: 'TERMINATED', connectionStatus: 'UNKNOWN' }
  }
  const isolated = isIsolationAddress(session?.address) || isIsolationProfile(secret?.profile)
  return {
    serviceStatus: isolated ? 'SUSPENDED' : 'ACTIVE',
    connectionStatus: session ? 'ONLINE' : 'OFFLINE',
  }
}

export function selectCustomerForDevice(customers, username, deviceId) {
  const normalizedUsername = String(username || '').toLowerCase()
  const matches = customers.filter(customer => customer.pppoeUsername?.toLowerCase() === normalizedUsername)
  return matches.find(customer => customer.connectionSourceDeviceId === deviceId)
    || (matches.filter(customer => !customer.connectionSourceDeviceId).length === 1
      ? matches.find(customer => !customer.connectionSourceDeviceId)
      : null)
}

function shouldSync(device, force) {
  return force || !device.customerSyncAt || Date.now() - device.customerSyncAt.getTime() >= SYNC_COOLDOWN_MS
}

export async function triggerCustomerSync({ force = false } = {}) {
  const devices = await prisma.device.findMany({
    where: { type: 'ROUTER', vendor: { not: null } },
    select: { id: true, name: true, type: true, vendor: true, customerSyncAt: true },
  })
  const jobs = devices
    .filter(device => /mikrotik|routeros/i.test(device.vendor || '') && shouldSync(device, force))
    .map(device => runCustomerSync(device).catch(error => {
      console.error(`[customer-sync:${device.id}] ${error.message}`)
      return null
    }))
  await Promise.all(jobs)
}

async function runCustomerSync(device) {
  const existingRun = running.get(device.id)
  if (existingRun) return existingRun
  const currentRun = runCustomerSyncNow(device)
  running.set(device.id, currentRun)
  try {
    return await currentRun
  } finally {
    if (running.get(device.id) === currentRun) running.delete(device.id)
  }
}

async function runCustomerSyncNow(device) {
  await prisma.device.update({ where: { id: device.id }, data: { customerSyncStatus: 'RUNNING', customerSyncError: null } })
  try {
    const fullDevice = await prisma.device.findUnique({ where: { id: device.id } })
    const driver = createDriver(fullDevice)
    const { sessions, secrets } = await withDriver(driver, async d => ({
      sessions: await d.getPppoeSessions(),
      secrets: typeof d.getPppSecrets === 'function' ? await d.getPppSecrets() : [],
    }))
    const usernames = [...new Set(sessions.map(session => session.username).filter(Boolean))]
    const existing = usernames.length
      ? await prisma.customer.findMany({ where: { OR: usernames.map(username => ({ pppoeUsername: { equals: username, mode: 'insensitive' } })) } })
      : []
    const existingByUsername = new Map(usernames.map(username => [
      username.toLowerCase(),
      selectCustomerForDevice(existing, username, device.id),
    ]))
    const secretByUsername = new Map(secrets.filter(secret => secret.username).map(secret => [secret.username.toLowerCase(), secret]))
    const usedIds = new Set(existing.map(customer => customer.customerId))
    const checkedAt = new Date()
    let created = 0
    let updated = 0

    const sessionByUsername = new Map(sessions.map(session => [session.username.toLowerCase(), session]))
    for (const username of usernames) {
      const normalizedUsername = username.toLowerCase()
      const session = sessionByUsername.get(normalizedUsername)
      const secret = secretByUsername.get(normalizedUsername)
      const current = existingByUsername.get(normalizedUsername)
      const identity = await identityFor(session?.comment || secret?.comment, usedIds, current?.id)
      const { serviceStatus, connectionStatus } = classifyCustomerConnection({ session, secret })
        await prisma.PppoeSession.upsert({
        where: { deviceId_username: { deviceId: device.id, username } },
        create: {
          deviceId: device.id,
          username,
          sessionId: session.sessionId,
          service: session.service,
          ipAddress: session.address,
          callerId: session.callerId,
          uptime: session.uptime,
          profile: secret?.profile || null,
          rateLimit: secret?.rateLimit || null,
          comment: session.comment || secret?.comment || null,
          isActive: true,
          firstSeenAt: checkedAt,
          lastSeenAt: checkedAt,
          lastCheckedAt: checkedAt,
        },
        update: {
          sessionId: session.sessionId,
          service: session.service,
          ipAddress: session.address,
          callerId: session.callerId,
          uptime: session.uptime,
          profile: secret?.profile || null,
          rateLimit: secret?.rateLimit || null,
          comment: session.comment || secret?.comment || null,
          isActive: true,
          lastSeenAt: checkedAt,
          lastCheckedAt: checkedAt,
        },
      })
      const data = {
        pppoeUsername: username,
        serviceStatus,
        connectionStatus,
        connectionSourceDeviceId: device.id,
        connectionLastChecked: checkedAt,
      }
      data.connectionLastSeen = checkedAt
      if (!current || identity.name) data.name = identity.name || username
      if (session?.address) data.ipAddress = session.address
      if (secret?.password) data.pppoePassword = secret.password
      if (secret?.profile) data.packageName = secret.profile
      const speed = parseRateLimitSpeed(secret?.rateLimit)
      if (speed != null) data.packageSpeed = speed

      if (current) {
        await prisma.customer.update({ where: { id: current.id }, data })
        updated += 1
      } else {
        await prisma.customer.create({ data: { customerId: identity.customerId, notes: `Auto-synced from MikroTik ${device.name}`, ...data } })
        created += 1
      }
    }
    const knownUsernames = usernames.map(username => username.toLowerCase())
    const inactiveSessionWhere = { deviceId: device.id }
    if (knownUsernames.length) inactiveSessionWhere.username = { notIn: usernames }
      await prisma.PppoeSession.updateMany({
      where: inactiveSessionWhere,
      data: { isActive: false, lastCheckedAt: checkedAt },
    })
    const offlineCustomerWhere = { connectionSourceDeviceId: device.id, pppoeUsername: { not: null } }
    if (knownUsernames.length) offlineCustomerWhere.pppoeUsername.notIn = usernames
    await prisma.customer.updateMany({
      where: offlineCustomerWhere,
      data: { connectionStatus: 'OFFLINE', connectionLastChecked: checkedAt },
    })
    await prisma.device.update({ where: { id: device.id }, data: { customerSyncAt: new Date(), customerSyncStatus: 'SUCCESS', customerSyncError: null } })
    return { created, updated, total: sessions.length }
  } catch (error) {
    await prisma.device.update({ where: { id: device.id }, data: { customerSyncStatus: 'ERROR', customerSyncError: error.message.slice(0, 500) } }).catch(() => {})
    throw error
  }
}

export function syncCooldownMs() { return SYNC_COOLDOWN_MS }
