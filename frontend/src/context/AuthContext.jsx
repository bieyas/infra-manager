import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api, setTokens, clearTokens } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem('auth_user')) } catch { return null }
  })
  const [loading, setLoading] = useState(true)

  const persistUser = (u) => {
    setUser(u)
    if (u) localStorage.setItem('auth_user', JSON.stringify(u))
    else    localStorage.removeItem('auth_user')
  }

  // Verify token on mount
  useEffect(() => {
    const access = localStorage.getItem('access_token')
    if (!access) { setLoading(false); return }
    api.auth.me()
      .then(me => { persistUser(me); setLoading(false) })
      .catch(() => { persistUser(null); setLoading(false) })
  }, [])

  // Listen for forced logout from api.js (token refresh failure)
  useEffect(() => {
    const handler = () => {
      persistUser(null)
      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?expired=1'
      }
    }
    window.addEventListener('auth:logout', handler)
    return () => window.removeEventListener('auth:logout', handler)
  }, [])

  const login = useCallback(async (username, password) => {
    const data = await api.auth.login(username, password)
    setTokens(data.accessToken, data.refreshToken)
    persistUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(async () => {
    const refresh = localStorage.getItem('refresh_token')
    try { await api.auth.logout(refresh) } catch {}
    clearTokens()
    persistUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
