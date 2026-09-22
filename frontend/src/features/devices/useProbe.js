import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../../lib/api'

/**
 * Hook for probing a single device and auto-polling its status.
 *
 * @param {string}  deviceId       - Device ID to probe
 * @param {object}  options
 * @param {number}  options.pollMs - Auto-poll interval in ms (0 = disabled, default 30000)
 * @param {boolean} options.auto   - Start polling immediately (default true)
 */
export function useProbe(deviceId, { pollMs = 30_000, auto = true } = {}) {
  const [probing,   setProbing]   = useState(false)
  const [result,    setResult]    = useState(null)  // last probe result
  const [error,     setError]     = useState(null)
  const timerRef = useRef(null)

  const probe = useCallback(async () => {
    if (!deviceId || probing) return null
    setProbing(true)
    setError(null)
    try {
      const r = await api.post(`/devices/${deviceId}/probe`)
      setResult(r)
      return r
    } catch (e) {
      setError(e.message ?? 'Probe gagal')
      return null
    } finally {
      setProbing(false)
    }
  }, [deviceId, probing])

  // Auto-poll
  useEffect(() => {
    if (!auto || !pollMs || !deviceId) return

    // Run immediately, then on interval
    probe()
    timerRef.current = setInterval(probe, pollMs)
    return () => clearInterval(timerRef.current)
  }, [deviceId, pollMs, auto]) // eslint-disable-line react-hooks/exhaustive-deps

  return { probe, probing, result, error }
}

/**
 * One-shot: probe all devices (no polling).
 */
export async function probeAll() {
  return api.post('/devices/probe-all')
}
