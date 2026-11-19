import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

// ── ODP hooks ─────────────────────────────────────────────────────────────────

export function useOdpList(filters = {}) {
  const [odps,    setOdps]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.oltId)  params.set('oltId',  filters.oltId)
      if (filters.status) params.set('status', filters.status)
      if (filters.search) params.set('search', filters.search)
      const data = await api.get(`/odp?${params}`)
      setOdps(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters.oltId, filters.status, filters.search]) // eslint-disable-line

  useEffect(() => { fetch() }, [fetch])
  return { odps, loading, error, refetch: fetch }
}

export function useOdpDetail(id) {
  const [odp,     setOdp]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    api.get(`/odp/${id}`)
      .then(d => { if (!cancelled) setOdp(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, tick])

  return { odp, loading, error, refresh: () => setTick(t => t + 1) }
}

export async function createOdp(data)      { return api.post('/odp', data) }
export async function updateOdp(id, data)  { return api.patch(`/odp/${id}`, data) }
export async function deleteOdp(id)        { return api.delete(`/odp/${id}`) }

// Check if ODP has connected customers
export async function checkOdpCustomers(odpId) {
  try {
    const odp = await api.get(`/odp/${odpId}`)
    return odp.customers?.length > 0 ? odp.customers : []
  } catch (e) {
    console.error('Error checking ODP customers:', e)
    return []
  }
}

// Protected delete function
export async function deleteOdpWithProtection(odpId) {
  const customers = await checkOdpCustomers(odpId)
  if (customers.length > 0) {
    throw new Error(`Tidak dapat menghapus ODP yang memiliki ${customers.length} customer terhubung. Hapus customer terlebih dahulu.`)
  }
  return deleteOdp(odpId)
}

// ── Shared ────────────────────────────────────────────────────────────────────

export const SPLITTER_OPTIONS = [
  { value: 'R1_2',  label: '1:2',  capacity: 2  },
  { value: 'R1_4',  label: '1:4',  capacity: 4  },
  { value: 'R1_8',  label: '1:8',  capacity: 8  },
  { value: 'R1_16', label: '1:16', capacity: 16 },
  { value: 'R1_32', label: '1:32', capacity: 32 },
]

export const MOUNT_OPTIONS = ['pole', 'wall', 'underground', 'aerial', 'pedestal']

export function splitterLabel(ratio) {
  if (!ratio) return '?'
  const opt = SPLITTER_OPTIONS.find(o => o.value === ratio || o.label === ratio)
  if (opt) return opt.label
  const m = String(ratio).match(/R?1[_:](\d+)/)
  return m ? `1:${m[1]}` : ratio
}

export function capacityFromRatio(ratio) {
  if (!ratio) return 0
  const opt = SPLITTER_OPTIONS.find(o => o.value === ratio || o.label === ratio)
  if (opt) return opt.capacity
  const m = String(ratio).match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}
