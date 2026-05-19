/**
 * In-memory snapshot cache with per-device TTL.
 * Prevents hammering Telnet/SSH on every page load.
 *
 * OLT  → TTL 60s  (Telnet session is slow, ~5-10s per snapshot)
 * SSH  → TTL 30s
 * SNMP → TTL 20s
 */

const DEFAULT_TTL_MS = 30_000
const OLT_TTL_MS     = 60_000

const store = new Map() // deviceId → { data, ts, ttl }

export function getSnapshot(deviceId) {
  const entry = store.get(deviceId)
  if (!entry) return null
  if (Date.now() - entry.ts > entry.ttl) {
    store.delete(deviceId)
    return null
  }
  return entry.data
}

export function setSnapshot(deviceId, data, deviceType) {
  const ttl = deviceType === 'OLT' ? OLT_TTL_MS : DEFAULT_TTL_MS
  store.set(deviceId, { data, ts: Date.now(), ttl })
}

export function invalidateSnapshot(deviceId) {
  store.delete(deviceId)
}

export function cacheStats() {
  const now = Date.now()
  const entries = [...store.entries()].map(([id, e]) => ({
    id,
    ageMs:   now - e.ts,
    ttlMs:   e.ttl,
    valid:   now - e.ts <= e.ttl,
  }))
  return { size: store.size, entries }
}
