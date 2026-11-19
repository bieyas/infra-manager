import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

export function useAccelPpp() {
  const [status, setStatus] = useState(null)
  const [sessions, setSessions] = useState([])
  const [secrets, setSecrets] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const [statusRes, sessionsRes, secretsRes] = await Promise.allSettled([
        api.get('/accel-ppp/status'),
        api.get('/accel-ppp/sessions'),
        api.get('/accel-ppp/secrets'),
      ])

      if (statusRes.status === 'fulfilled') {
        setStatus(statusRes.value)
      } else if (statusRes.reason?.response?.status === 403) {
        // Module might be disabled
        setStatus({ moduleConfig: { enabled: false }, serviceActive: false })
      } else {
        throw new Error(statusRes.reason?.message || 'Gagal memuat status Accel-PPP')
      }

      if (sessionsRes.status === 'fulfilled') {
        setSessions(sessionsRes.value?.sessions || [])
      }

      if (secretsRes.status === 'fulfilled') {
        setSecrets(secretsRes.value?.secrets || [])
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const timer = setInterval(() => fetchAll(true), 10000)
    return () => clearInterval(timer)
  }, [fetchAll])

  const changeShaper = async (ifname, rate) => {
    const res = await api.post('/accel-ppp/shaper/change', { ifname, rate })
    await fetchAll(true)
    return res
  }

  const terminateSession = async (ifname, username) => {
    const res = await api.post('/accel-ppp/sessions/terminate', { ifname, username })
    await fetchAll(true)
    return res
  }

  const saveSecret = async (secretData) => {
    const res = await api.post('/accel-ppp/secrets', secretData)
    await fetchAll(true)
    return res
  }

  const deleteSecret = async (username) => {
    const res = await api.delete(`/accel-ppp/secrets/${encodeURIComponent(username)}`)
    await fetchAll(true)
    return res
  }

  const labDial = async (username, password) => {
    const res = await api.post('/accel-ppp/lab/dial', { username, password })
    await fetchAll(true)
    return res
  }

  const labDisconnect = async () => {
    const res = await api.post('/accel-ppp/lab/disconnect')
    await fetchAll(true)
    return res
  }

  const serviceAction = async (action) => {
    const res = await api.post(`/accel-ppp/service/${action}`)
    await fetchAll(true)
    return res
  }

  const toggleModule = async (enabled) => {
    const res = await api.patch('/accel-ppp/config', { enabled })
    await fetchAll(true)
    return res
  }

  return {
    status,
    sessions,
    secrets,
    loading,
    refreshing,
    error,
    refetch: () => fetchAll(true),
    changeShaper,
    terminateSession,
    saveSecret,
    deleteSecret,
    labDial,
    labDisconnect,
    serviceAction,
    toggleModule,
  }
}
