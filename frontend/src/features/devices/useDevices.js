import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { DEVICES as MOCK_DEVICES } from '../../data/mockData'

// Map Prisma device status enum → UI display status
function normalizeStatus(s) {
  switch (s?.toUpperCase()) {
    case 'ACTIVE':      return 'online'
    case 'INACTIVE':    return 'offline'
    case 'MAINTENANCE': return 'warning'
    case 'ONLINE':      return 'online'
    case 'OFFLINE':     return 'offline'
    case 'WARNING':     return 'warning'
    default:            return 'offline'
  }
}

// Normalize API device (uppercase status/type) → lowercase for UI consistency
function normalizeDevice(d) {
  return {
    ...d,
    status: normalizeStatus(d.status),
    type:   d.type?.toLowerCase()   ?? 'other',
    cpu:    d.cpuPct    ?? d.cpu    ?? 0,
    memory: d.memPct    ?? d.memory ?? 0,
    // _count from API: { interfaces, alerts }
    interfaces:       d.interfaces       ?? d._count?.interfaces ?? '—',
    activeInterfaces: d.activeInterfaces ?? '—',
  }
}

export function useDevices() {
  const [devices,  setDevices]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [useMock,  setUseMock]  = useState(false)

  const fetchDevices = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.get('/devices')
      setDevices(data.map(normalizeDevice))
      setUseMock(false)
    } catch (err) {
      // Fallback to mock when backend is not running / unauthenticated
      console.warn('[useDevices] API failed, using mock data:', err.message)
      setDevices(MOCK_DEVICES.map(normalizeDevice))
      setUseMock(true)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDevices() }, [fetchDevices])

  return { devices, loading, error, useMock, refetch: fetchDevices }
}

export async function createDevice(data) {
  return api.post('/devices', data)
}

export async function updateDevice(id, data) {
  return api.patch(`/devices/${id}`, data)
}

export async function deleteDevice(id) {
  return api.delete(`/devices/${id}`)
}

/**
 * Sync uplinks for a device.
 * - Existing uplinks (have .id) that are no longer in the new list → DELETE
 * - New uplinks (id === null) that are complete → POST
 * - Existing uplinks that changed fields → DELETE old + POST new
 */
export async function syncUplinks(deviceId, uplinks) {
  // Fetch current server state
  const current = await api.get(`/devices/${deviceId}/links`).catch(() => [])
  const currentIds = new Set(current.map(l => l.id))
  const newIds     = new Set(uplinks.filter(l => l.id).map(l => l.id))

  // Delete removed
  for (const id of currentIds) {
    if (!newIds.has(id)) {
      await api.delete(`/devices/${deviceId}/links/${id}`).catch(() => {})
    }
  }

  // Create or update
  for (const link of uplinks) {
    if (!link.fromPort || !link.toDeviceId || !link.toPort) continue
    const body = {
      fromPort:    link.fromPort,
      toDeviceId:  link.toDeviceId,
      toPort:      link.toPort,
      linkType:    link.linkType || null,
    }
    if (link.id && currentIds.has(link.id)) {
      // Update existing
      await api.patch(`/devices/${deviceId}/links/${link.id}`, body).catch(() => {})
    } else {
      // Create new
      await api.post(`/devices/${deviceId}/links`, body).catch(() => {})
    }
  }
}

/**
 * Lightweight hook: fetches /api/driver/:id/resource once on mount.
 * Returns { cpu, memPct, uptime, version, boardName, loading }.
 * Gracefully returns null values if driver doesn't support resource or request fails.
 */
export function useDeviceResource(deviceId) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!deviceId) return
    let cancelled = false
    setLoading(true)
    api.get(`/driver/${deviceId}/resource`)
      .then(r => {
        if (cancelled) return
        if (r?.error) { setData(null); return }
        const totalMem = r.totalMemory ?? 0
        const freeMem  = r.freeMemory  ?? 0
        setData({
          cpu:       r.cpuLoad ?? null,
          memPct:    totalMem > 0 ? Math.round((1 - freeMem / totalMem) * 100) : null,
          uptime:    r.uptime    ?? null,
          version:   r.version   ?? null,
          boardName: r.boardName ?? null,
          raw:       r,
        })
      })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [deviceId])

  return { data, loading }
}

export function useDeviceDetail(deviceId) {
  const [detail,  setDetail]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    if (!deviceId) return
    let cancelled = false
    setLoading(true)
    setError(null)

    api.get(`/devices/${deviceId}`)
      .then(data => { if (!cancelled) setDetail(data) })
      .catch(err => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [deviceId, tick])

  const refresh = () => setTick(t => t + 1)

  return { detail, loading, error, refresh }
}
