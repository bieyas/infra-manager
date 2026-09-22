import { useState, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'

const API_BASE = '/api/ipam/v2'

function getAuthHeaders() {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  }
}

export function useSubnets() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  
  const fetchSubnets = useCallback(async (params = {}) => {
    const query = new URLSearchParams(params).toString()
    const res = await fetch(`${API_BASE}/subnets?${query}`, {
      headers: getAuthHeaders()
    })
    if (!res.ok) throw new Error('Failed to fetch subnets')
    return res.json()
  }, [])
  
  const createSubnet = useCallback(async (data) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/subnets`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      })
      const result = await res.json()
      if (!res.ok) return { ok: false, error: result.error }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setLoading(false)
    }
  }, [])
  
  const updateSubnet = useCallback(async (id, data) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/subnets/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      })
      const result = await res.json()
      if (!res.ok) return { ok: false, error: result.error }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setLoading(false)
    }
  }, [])
  
  const deleteSubnet = useCallback(async (id) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/subnets/${id}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (!res.ok) {
        const result = await res.json()
        return { ok: false, error: result.error }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setLoading(false)
    }
  }, [])
  
  return {
    loading,
    error,
    fetchSubnets,
    createSubnet,
    updateSubnet,
    deleteSubnet
  }
}

export function useHosts(subnetId) {
  const [loading, setLoading] = useState(false)
  
  const fetchHosts = useCallback(async (params = {}) => {
    const query = new URLSearchParams({ subnetId, ...params }).toString()
    const res = await fetch(`${API_BASE}/hosts?${query}`, {
      headers: getAuthHeaders()
    })
    if (!res.ok) throw new Error('Failed to fetch hosts')
    return res.json()
  }, [subnetId])
  
  const createHost = useCallback(async (data) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/hosts`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      })
      const result = await res.json()
      if (!res.ok) return { ok: false, error: result.error }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setLoading(false)
    }
  }, [])
  
  const updateHost = useCallback(async (id, data) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/hosts/${id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      })
      const result = await res.json()
      if (!res.ok) return { ok: false, error: result.error }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setLoading(false)
    }
  }, [])
  
  const deleteHost = useCallback(async (id) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/hosts/${id}`, { 
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      if (!res.ok) {
        const result = await res.json()
        return { ok: false, error: result.error }
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setLoading(false)
    }
  }, [])
  
  const assignHost = useCallback(async (id, data) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/hosts/${id}/assign`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data)
      })
      const result = await res.json()
      if (!res.ok) return { ok: false, error: result.error }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setLoading(false)
    }
  }, [])
  
  const releaseHost = useCallback(async (id) => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/hosts/${id}/release`, { 
        method: 'POST',
        headers: getAuthHeaders()
      })
      const result = await res.json()
      if (!res.ok) return { ok: false, error: result.error }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setLoading(false)
    }
  }, [])
  
  return {
    loading,
    fetchHosts,
    createHost,
    updateHost,
    deleteHost,
    assignHost,
    releaseHost
  }
}

export function useScan() {
  const [scanning, setScanning] = useState(false)
  
  const scanSubnet = useCallback(async (subnetId, method = 'ping') => {
    setScanning(true)
    try {
      const res = await fetch(`${API_BASE}/scan`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ subnetId, method })
      })
      const result = await res.json()
      if (!res.ok) return { ok: false, error: result.error }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e.message }
    } finally {
      setScanning(false)
    }
  }, [])
  
  return { scanning, scanSubnet }
}

export function useAuditLogs() {
  const fetchLogs = useCallback(async (params = {}) => {
    const query = new URLSearchParams(params).toString()
    const res = await fetch(`${API_BASE}/audit-logs?${query}`, {
      headers: getAuthHeaders()
    })
    if (!res.ok) throw new Error('Failed to fetch audit logs')
    return res.json()
  }, [])
  
  return { fetchLogs }
}
