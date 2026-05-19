import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

export function useVlans() {
  const [vlans,   setVlans]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setVlans(await api.get('/vlans'))
    } catch (e) {
      setError(e.message ?? 'Gagal memuat data VLAN')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const create = useCallback(async (form) => {
    setSaving(true)
    try {
      const vlan = await api.post('/vlans', form)
      setVlans(prev => [...prev, vlan].sort((a, b) => a.vid - b.vid))
      return { ok: true, vlan }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const update = useCallback(async (id, form) => {
    setSaving(true)
    try {
      const vlan = await api.patch(`/vlans/${id}`, form)
      setVlans(prev => prev.map(v => v.id === id ? vlan : v))
      return { ok: true, vlan }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setSaving(false)
    }
  }, [])

  const remove = useCallback(async (id) => {
    try {
      await api.delete(`/vlans/${id}`)
      setVlans(prev => prev.filter(v => v.id !== id))
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    }
  }, [])

  return { vlans, loading, error, saving, reload: load, create, update, remove }
}
