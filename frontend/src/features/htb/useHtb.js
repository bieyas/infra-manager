import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

export function useHtbList(filters = {}) {
  const [boxes, setBoxes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.q) params.set('q', filters.q)
      if (filters.modelType) params.set('modelType', filters.modelType)
      if (filters.status) params.set('status', filters.status)
      const data = await api.get(`/htb-boxes?${params}`)
      setBoxes(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters.q, filters.modelType, filters.status])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { boxes, loading, error, refetch: fetch }
}

export function useHtbDetail(id) {
  const [box, setBox] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    api.get(`/htb-boxes/${id}`)
      .then(data => {
        if (!cancelled) setBox(data)
      })
      .catch(e => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [id, tick])

  return {
    box,
    loading,
    error,
    refetch: () => setTick(t => t + 1)
  }
}

export async function deleteHtbBox(id) {
  return api.delete(`/htb-boxes/${id}`)
}

export async function updateHtbPort(boxId, portId, data) {
  return api.patch(`/htb-boxes/${boxId}/ports/${portId}`, data)
}
