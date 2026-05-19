import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

export function useDashboardStats(refreshInterval = 30000) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetch = useCallback(async () => {
    try {
      setError(null)
      const res = await api.get('/dashboard/stats')
      setData(res)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    const id = setInterval(fetch, refreshInterval)
    return () => clearInterval(id)
  }, [fetch, refreshInterval])

  return { data, loading, error, refetch: fetch, lastUpdated }
}
