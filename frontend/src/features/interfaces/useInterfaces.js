import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

export function useInterfaces({ deviceId } = {}) {
  const [ifaces,  setIfaces]  = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = deviceId ? `/interfaces?deviceId=${deviceId}` : '/interfaces'
      const data = await api.get(url)
      setIfaces(data)
    } catch (e) {
      setError(e.message ?? 'Gagal memuat data interface')
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  useEffect(() => { load() }, [load])

  return { ifaces, loading, error, reload: load }
}
