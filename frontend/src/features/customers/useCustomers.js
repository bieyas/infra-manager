import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

// ── List hook ─────────────────────────────────────────────────────────────────

export function useCustomerList({ q = '', status = '', connectionStatus = '', odpId = '', page = 1, limit = 50 } = {}) {
  const [data,    setData]    = useState([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams({ page, limit })
      if (q)      params.set('q',      q)
      if (status) params.set('status', status)
      if (connectionStatus) params.set('connectionStatus', connectionStatus)
      if (odpId)  params.set('odpId',  odpId)
      const res = await api.get(`/customers?${params}`)
      setData(res.data)
      setTotal(res.total)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, connectionStatus, odpId, page, limit])

  useEffect(() => { fetch() }, [fetch])
  return { data, total, loading, error, refetch: fetch }
}

// ── Detail hook ───────────────────────────────────────────────────────────────

export function useCustomerDetail(id) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(!!id)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(async () => {
    if (!id) return
    try {
      setLoading(true)
      setError(null)
      const res = await api.get(`/customers/${id}`)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    fetch()
    const timer = setInterval(fetch, 30_000)
    return () => clearInterval(timer)
  }, [fetch])
  return { data, loading, error, refetch: fetch }
}

// ── Stats hook ────────────────────────────────────────────────────────────────

const DEFAULT_CUSTOMER_STATS = {
  ACTIVE: 0,
  SUSPENDED: 0,
  TERMINATED: 0,
  ONLINE: 0,
  OFFLINE: 0,
  UNKNOWN: 0,
  total: 0,
}

export function useCustomerStats() {
  const [data,    setData]    = useState(DEFAULT_CUSTOMER_STATS)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/customers/stats')
      setData({ ...DEFAULT_CUSTOMER_STATS, ...res })
    } catch {
      // silently fail — stats non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, refetch: fetch }
}

// ── Status config ─────────────────────────────────────────────────────────────

export const STATUS_CFG = {
  ACTIVE:     { label: 'Aktif',      color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  SUSPENDED:  { label: 'Isolir',     color: 'text-amber-400',   bg: 'bg-amber-500/15 border-amber-500/30' },
  TERMINATED: { label: 'Putus',       color: 'text-rose-400',    bg: 'bg-rose-500/15 border-rose-500/30' },
}

export const CONNECTION_CFG = {
  ONLINE:  { label: 'Online', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  OFFLINE: { label: 'Offline', color: 'text-rose-400', bg: 'bg-rose-500/15 border-rose-500/30' },
  UNKNOWN: { label: 'Belum dicek', color: 'text-muted', bg: 'bg-[var(--bg-secondary)] border-[var(--border)]' },
}
