import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

// ── ODC hooks ─────────────────────────────────────────────────────────────────

export function useOdcList(filters = {}) {
  const [odcs,    setOdcs]    = useState([])
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
      const data = await api.get(`/odc?${params}`)
      setOdcs(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters.oltId, filters.status, filters.search]) // eslint-disable-line

  useEffect(() => { fetch() }, [fetch])
  return { odcs, loading, error, refetch: fetch }
}

export function useOdcDetail(id) {
  const [odc,     setOdc]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [tick,    setTick]    = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    api.get(`/odc/${id}`)
      .then(d => { if (!cancelled) setOdc(d) })
      .catch(e => { if (!cancelled) setError(e.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [id, tick])

  return { odc, loading, error, refresh: () => setTick(t => t + 1) }
}

export async function createOdc(data)      { return api.post('/odc', data) }
export async function updateOdc(id, data)  { return api.patch(`/odc/${id}`, data) }
export async function deleteOdc(id)        { return api.delete(`/odc/${id}`) }

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
      if (filters.odcId)  params.set('odcId',  filters.odcId)
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
  }, [filters.odcId, filters.oltId, filters.status, filters.search]) // eslint-disable-line

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
    return odp.customerCount > 0 ? odp.customers || [] : []
  } catch (e) {
    console.error('Error checking ODP customers:', e)
    return []
  }
}

// Check if ODC has connected ODPs
export async function checkOdcChildren(odcId) {
  try {
    // Check for connected ODPs
    const odps = await api.get(`/odp?odcId=${odcId}`)
    
    // Check for downstream ODCs
    const odcDetail = await api.get(`/odc/${odcId}`)
    const downlinkOdcs = odcDetail.downlinkOdcs || []
    
    const allChildren = {
      odps: odps || [],
      downlinkOdcs: downlinkOdcs
    }
    
    return allChildren
  } catch (e) {
    console.error('Error checking ODC children:', e)
    return { odps: [], downlinkOdcs: [] }
  }
}

// Protected delete functions
export async function deleteOdpWithProtection(odpId) {
  const customers = await checkOdpCustomers(odpId)
  if (customers.length > 0) {
    throw new Error(`Tidak dapat menghapus ODP yang memiliki ${customers.length} customer terhubung. Hapus customer terlebih dahulu.`)
  }
  return deleteOdp(odpId)
}

export async function deleteOdcWithProtection(odcId) {
  const children = await checkOdcChildren(odcId)
  const { odps, downlinkOdcs } = children
  
  if (odps.length > 0 && downlinkOdcs.length > 0) {
    throw new Error(`Tidak dapat menghapus ODC yang memiliki ${odps.length} ODP dan ${downlinkOdcs.length} ODC downstream terhubung. Hapus ODP dan ODC downstream terlebih dahulu.`)
  } else if (odps.length > 0) {
    throw new Error(`Tidak dapat menghapus ODC yang memiliki ${odps.length} ODP terhubung. Hapus ODP terlebih dahulu.`)
  } else if (downlinkOdcs.length > 0) {
    throw new Error(`Tidak dapat menghapus ODC yang memiliki ${downlinkOdcs.length} ODC downstream terhubung. Hapus ODC downstream terlebih dahulu.`)
  }
  
  return deleteOdc(odcId)
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
  return SPLITTER_OPTIONS.find(o => o.value === ratio)?.label ?? ratio
}

export function capacityFromRatio(ratio) {
  return SPLITTER_OPTIONS.find(o => o.value === ratio)?.capacity ?? 0
}
