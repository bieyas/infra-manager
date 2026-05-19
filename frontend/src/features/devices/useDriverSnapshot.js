import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../../lib/api'

/**
 * Fetch driver info (capabilities) for a device — no connection to device.
 * Returns { driverName, capabilities } or null.
 */
export function useDriverInfo(deviceId) {
  const [info,    setInfo]    = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!deviceId) return
    setLoading(true)
    api.get(`/driver/${deviceId}/info`)
      .then(setInfo)
      .catch(() => setInfo(null))
      .finally(() => setLoading(false))
  }, [deviceId])

  return { info, loading }
}

/**
 * Fetch a full snapshot from the live device.
 * Triggers on demand (call `fetch()`), not automatically.
 *
 * Returns:
 *   snapshot   — { status, interfaces, ipAddresses, routes, neighbors, resource }
 *   driverName — string
 *   capabilities — object
 *   loading    — bool
 *   error      — string | null
 *   fetchedAt  — Date | null
 *   fetch()    — trigger a new fetch
 */
export function useDriverSnapshot(deviceId, { auto = false } = {}) {
  const [snapshot,     setSnapshot]     = useState(null)
  const [driverName,   setDriverName]   = useState(null)
  const [capabilities, setCapabilities] = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState(null)
  const [fetchedAt,    setFetchedAt]    = useState(null)
  const abortRef = useRef(null)

  const _doFetch = useCallback(async (bust = false) => {
    if (!deviceId) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    try {
      const url = bust ? `/driver/${deviceId}/snapshot?refresh=1` : `/driver/${deviceId}/snapshot`
      const data = await api.get(url)
      if (ctrl.signal.aborted) return
      setSnapshot(data.snapshot)
      setDriverName(data.driverName)
      setCapabilities(data.capabilities)
      setFetchedAt(new Date(data.fetchedAt))
    } catch (e) {
      if (ctrl.signal.aborted) return
      setError(e.message ?? 'Gagal mengambil data dari device')
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [deviceId])

  const fetch        = useCallback(() => _doFetch(false), [_doFetch])
  const forceRefresh = useCallback(() => _doFetch(true),  [_doFetch])

  // Auto-fetch on mount if requested
  useEffect(() => {
    if (auto && deviceId) fetch()
  }, [auto, deviceId]) // eslint-disable-line

  // Cleanup abort on unmount
  useEffect(() => () => abortRef.current?.abort(), [])

  return { snapshot, driverName, capabilities, loading, error, fetchedAt, fetch, forceRefresh }
}

/**
 * Fetch ONU list for a specific PON port on an OLT device.
 * @param {string} deviceId
 * @param {string} ponPort  — e.g. "1/1/1"
 */
export function useOltOnus(deviceId, ponPort = '1/1/1') {
  const [onus,      setOnus]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const fetch = useCallback(async () => {
    if (!deviceId) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.get(`/driver/${deviceId}/olt/onus?port=${encodeURIComponent(ponPort)}`)
      setOnus(data.onus ?? [])
      setFetchedAt(new Date(data.fetchedAt))
    } catch (e) {
      setError(e.message ?? 'Gagal mengambil data ONU')
    } finally {
      setLoading(false)
    }
  }, [deviceId, ponPort])

  return { onus, loading, error, fetchedAt, fetch }
}

/**
 * Fetch SFP Tx Power for PON port(s).
 * @param {string} deviceId
 * @param {string} ponPort — e.g. "1/1/1" or "all"
 */
export function useOltPonPower(deviceId, ponPort = 'all') {
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)
  const [fetchedAt, setFetchedAt] = useState(null)

  const fetch = useCallback(async () => {
    if (!deviceId) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.get(`/driver/${deviceId}/olt/pon-power?port=${encodeURIComponent(ponPort)}`)
      setData(result)
      setFetchedAt(new Date(result.fetchedAt))
    } catch (e) {
      setError(e.message ?? 'Gagal mengambil data power PON')
    } finally {
      setLoading(false)
    }
  }, [deviceId, ponPort])

  return { data, loading, error, fetchedAt, fetch }
}

/**
 * Fetch detail + optical power for a single ONU.
 * @param {string} deviceId
 * @param {string} onuIndex — e.g. "1/1/1:5"
 */
export function useOltOnuDetail(deviceId, onuIndex) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const fetch = useCallback(async () => {
    if (!deviceId || !onuIndex) return
    setLoading(true)
    setError(null)
    try {
      const result = await api.get(`/driver/${deviceId}/olt/onu/${encodeURIComponent(onuIndex)}`)
      setData(result)
    } catch (e) {
      setError(e.message ?? 'Gagal mengambil detail ONU')
    } finally {
      setLoading(false)
    }
  }, [deviceId, onuIndex])

  useEffect(() => { if (deviceId && onuIndex) fetch() }, [deviceId, onuIndex]) // eslint-disable-line

  return { data, loading, error, fetch }
}

/**
 * Execute a single driver command.
 * Returns { result, error, loading, exec(command, params) }
 */
export function useDriverExec(deviceId) {
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const exec = useCallback(async (command, params = {}) => {
    if (!deviceId || !command) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await api.post(`/driver/${deviceId}/exec`, { command, params })
      setResult(data.result)
      return data.result
    } catch (e) {
      setError(e.message ?? 'Eksekusi gagal')
      return null
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  return { result, loading, error, exec }
}
