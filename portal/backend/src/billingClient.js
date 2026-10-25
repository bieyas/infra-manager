import dotenv from 'dotenv'
dotenv.config()

const MAIN_API_URL = process.env.MAIN_API_URL || 'https://api.aufa.net.id'
const ADMIN_USER = process.env.MAIN_API_USER || 'bas'
const ADMIN_PASS = process.env.MAIN_API_PASS || 'aufa2026'

let cachedToken = null
let tokenExpiry = 0

export async function getMainAuthToken() {
  const now = Date.now()
  if (cachedToken && now < tokenExpiry) {
    return cachedToken
  }

  try {
    const res = await fetch(`${MAIN_API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS })
    })
    const data = await res.json()
    if (data.success && data.data?.token) {
      cachedToken = data.data.token
      // Token valid for ~2 hours
      tokenExpiry = now + (2 * 60 * 60 * 1000)
      return cachedToken
    }
    throw new Error(data.message || 'Gagal login ke Main Billing API')
  } catch (err) {
    console.error('[BillingClient] Auth Error:', err.message)
    throw err
  }
}

async function requestMain(path, options = {}) {
  const token = await getMainAuthToken()
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }

  const res = await fetch(`${MAIN_API_URL}${path}`, {
    ...options,
    headers
  })

  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { success: false, raw: text, status: res.status }
  }
}

export async function fetchCustomerFromBilling(pelangganId) {
  try {
    const res = await requestMain(`/pelanggan/search?q=${encodeURIComponent(pelangganId)}&limit=1`)
    if (res.success && res.data && res.data.length > 0) {
      return res.data[0]
    }
    return null
  } catch (err) {
    console.error('[BillingClient] fetchCustomer Error:', err.message)
    return null
  }
}

export async function fetchCustomerBills(pelangganId) {
  try {
    const res = await requestMain(`/tagihan?search=${encodeURIComponent(pelangganId)}&limit=12`)
    if (res.success && res.data) {
      const items = Array.isArray(res.data) ? res.data : (res.data.tagihan || [])
      return items
    }
    return []
  } catch (err) {
    console.error('[BillingClient] fetchBills Error:', err.message)
    return []
  }
}

export async function requestDynamicQris(tagihanId) {
  try {
    const res = await requestMain(`/pembayaran/qris`, {
      method: 'POST',
      body: JSON.stringify({ tagihan_id: tagihanId })
    })
    return res
  } catch (err) {
    console.error('[BillingClient] requestQris Error:', err.message)
    return { success: false, message: err.message }
  }
}

export async function checkBillDetail(tagihanId) {
  try {
    const res = await requestMain(`/tagihan/${tagihanId}`)
    return res
  } catch (err) {
    console.error('[BillingClient] checkBill Error:', err.message)
    return null
  }
}