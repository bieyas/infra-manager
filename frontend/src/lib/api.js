const BASE = '/api'

function getTokens() {
  return {
    access:  localStorage.getItem('access_token'),
    refresh: localStorage.getItem('refresh_token'),
  }
}

function setTokens(access, refresh) {
  localStorage.setItem('access_token',  access)
  localStorage.setItem('refresh_token', refresh)
}

function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
  localStorage.removeItem('auth_user')
}

let isRefreshing   = false
let refreshQueue   = []

async function refreshAccessToken() {
  const { refresh } = getTokens()
  if (!refresh) throw new Error('No refresh token')
  const res  = await fetch(`${BASE}/auth/refresh`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ refreshToken: refresh }),
  })
  if (!res.ok) { clearTokens(); throw new Error('Session expired') }
  const data = await res.json()
  setTokens(data.accessToken, data.refreshToken)
  return data.accessToken
}

export async function apiFetch(path, options = {}) {
  const { access } = getTokens()
  const headers = { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  if (access) headers['Authorization'] = `Bearer ${access}`

  let res = await fetch(`${BASE}${path}`, { ...options, headers })

  if (res.status === 401 && path !== '/auth/login') {
    if (!isRefreshing) {
      isRefreshing = true
      try {
        const newToken = await refreshAccessToken()
        refreshQueue.forEach(cb => cb(newToken))
        refreshQueue = []
        isRefreshing = false
        // Retry original request with new token
        headers['Authorization'] = `Bearer ${newToken}`
        res = await fetch(`${BASE}${path}`, { ...options, headers })
      } catch (e) {
        isRefreshing = false
        refreshQueue.forEach(cb => cb(null))
        refreshQueue = []
        clearTokens()
        window.dispatchEvent(new Event('auth:logout'))
        throw e
      }
    } else {
      await new Promise(resolve => refreshQueue.push(resolve))
      const { access: newAccess } = getTokens()
      if (newAccess) {
        headers['Authorization'] = `Bearer ${newAccess}`
        res = await fetch(`${BASE}${path}`, { ...options, headers })
      }
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err  = new Error(body.error ?? `HTTP ${res.status}`)
    err.status = res.status
    err.body   = body
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get:    (path, opts)       => apiFetch(path, { method: 'GET',    ...opts }),
  post:   (path, body, opts) => apiFetch(path, { method: 'POST',   body: JSON.stringify(body),  ...opts }),
  patch:  (path, body, opts) => apiFetch(path, { method: 'PATCH',  body: JSON.stringify(body),  ...opts }),
  delete: (path, opts)       => apiFetch(path, { method: 'DELETE', ...opts }),

  auth: {
    login:   (username, password) => apiFetch('/auth/login',   { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout:  (refreshToken)       => apiFetch('/auth/logout',  { method: 'POST', body: JSON.stringify({ refreshToken }) }),
    me:      ()                   => apiFetch('/auth/me'),
  },
}

export { getTokens, setTokens, clearTokens }
