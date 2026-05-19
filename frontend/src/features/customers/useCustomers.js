import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

// ── List hook ─────────────────────────────────────────────────────────────────

export function useCustomerList({ q = '', status = '', odpId = '', page = 1, limit = 50 } = {}) {
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
  }, [q, status, odpId, page, limit])

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

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

// ── Stats hook ────────────────────────────────────────────────────────────────

export function useCustomerStats() {
  const [data,    setData]    = useState({ ACTIVE: 0, SUSPENDED: 0, TERMINATED: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      const res = await api.get('/customers/stats')
      setData(res)
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
  TERMINATED: { label: 'Berhenti',   color: 'text-rose-400',    bg: 'bg-rose-500/15 border-rose-500/30' },
}
