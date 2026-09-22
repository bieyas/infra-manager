import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'

export function useSubnets() {
  const [subnets, setSubnets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setSubnets(await api.get('/ipam/subnets')) }
    catch (e) { setError(e.message ?? 'Gagal memuat subnet') }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const create = useCallback(async (form) => {
    try {
      const s = await api.post('/ipam/subnets', form)
      setSubnets(prev => [...prev, s].sort((a, b) => a.cidr.localeCompare(b.cidr)))
      return { ok: true, subnet: s }
    } catch (e) { return { ok: false, error: e.message } }
  }, [])

  const update = useCallback(async (id, form) => {
    try {
      const s = await api.patch(`/ipam/subnets/${id}`, form)
      setSubnets(prev => prev.map(x => x.id === id ? { ...x, ...s } : x))
      return { ok: true, subnet: s }
    } catch (e) { return { ok: false, error: e.message } }
  }, [])

  const remove = useCallback(async (id) => {
    try {
      await api.delete(`/ipam/subnets/${id}`)
      setSubnets(prev => prev.filter(x => x.id !== id))
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  }, [])

  return { subnets, loading, error, reload: load, create, update, remove }
}

export function useHosts(subnetId) {
  const [hosts,   setHosts]   = useState([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    if (!subnetId) return
    setLoading(true); setError(null)
    try { setHosts(await api.get(`/ipam/hosts?subnetId=${subnetId}`)) }
    catch (e) { setError(e.message) }
    finally   { setLoading(false) }
  }, [subnetId])

  useEffect(() => { load() }, [load])

  const create = useCallback(async (form) => {
    try {
      const h = await api.post('/ipam/hosts', { ...form, subnetId })
      setHosts(prev => [...prev, h].sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true })))
      return { ok: true, host: h }
    } catch (e) { return { ok: false, error: e.message } }
  }, [subnetId])

  const update = useCallback(async (id, form) => {
    try {
      const h = await api.patch(`/ipam/hosts/${id}`, form)
      setHosts(prev => prev.map(x => x.id === id ? { ...x, ...h } : x))
      return { ok: true, host: h }
    } catch (e) { return { ok: false, error: e.message } }
  }, [])

  const remove = useCallback(async (id) => {
    try {
      await api.delete(`/ipam/hosts/${id}`)
      setHosts(prev => prev.filter(x => x.id !== id))
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  }, [])

  return { hosts, loading, error, reload: load, create, update, remove }
}
