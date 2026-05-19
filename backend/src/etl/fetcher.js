/**
 * ETL Fetcher
 * Mengambil data dari API external, simpan raw JSON ke disk sebagai arsip.
 */

import fs   from 'fs/promises'
import path from 'path'

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildHeaders(auth, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...extraHeaders }
  if (!auth || auth.type === 'none' || auth.type === 'cookie_login') return headers
  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`
  } else if (auth.type === 'basic' && auth.username) {
    const b64 = Buffer.from(`${auth.username}:${auth.password}`).toString('base64')
    headers['Authorization'] = `Basic ${b64}`
  } else if (auth.type === 'apikey' && auth.key) {
    headers[auth.header || 'X-API-Key'] = auth.key
  }
  return headers
}

/** Login ke billing system, kembalikan cookie string untuk dipakai di request berikutnya */
async function loginAndGetCookie(auth) {
  console.log(`  [fetcher] Login ke ${auth.loginUrl}...`)
  const ctrl    = new AbortController()
  const timeout = setTimeout(() => ctrl.abort(), 15_000)
  const res = await fetch(auth.loginUrl, {
    method:   'POST',
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:     auth.loginPayload,
    redirect: 'manual',    // Jangan ikuti redirect, kita perlu Set-Cookie dari response 302
    signal:   ctrl.signal,
  })
  clearTimeout(timeout)

  // Kumpulkan semua Set-Cookie header
  const setCookies = res.headers.getSetCookie?.() ?? []
  const cookieName = auth.cookieName || 'accessToken'
  const match = setCookies.find(c => c.startsWith(`${cookieName}=`))
  if (!match) throw new Error(`Cookie '${cookieName}' tidak ditemukan di response login`)

  const cookieValue = match.split(';')[0]  // ambil "name=value" saja
  console.log(`  [fetcher] Login berhasil, cookie: ${cookieName}=<token>`)
  return cookieValue
}

function getNestedValue(obj, dotPath) {
  if (!dotPath) return obj
  return dotPath.split('.').reduce((acc, key) => acc?.[key], obj)
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchWithRetry(url, options, retry) {
  let lastErr
  for (let attempt = 1; attempt <= (retry?.times ?? 1); attempt++) {
    try {
      const ctrl    = new AbortController()
      const timeout = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 30_000)
      const res     = await fetch(url, { ...options, signal: ctrl.signal })
      clearTimeout(timeout)
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
      return await res.json()
    } catch (e) {
      lastErr = e
      if (attempt < (retry?.times ?? 1)) {
        console.warn(`  [fetcher] Retry ${attempt}/${retry.times} setelah ${retry.delayMs}ms...`)
        await sleep(retry?.delayMs ?? 2_000)
      }
    }
  }
  throw lastErr
}

// ── Fetch satu halaman ───────────────────────────────────────────────────────

async function fetchPage(source, page, cookieStr = null) {
  const { url, method = 'GET', auth, params = {}, pagination, timeoutMs, retry } = source

  const qp = new URLSearchParams(params)
  if (pagination?.type === 'page') {
    qp.set(pagination.pageParam || 'page', page)
    qp.set(pagination.sizeParam || 'limit', pagination.pageSize || 100)
  } else if (pagination?.type === 'offset') {
    qp.set(pagination.offsetParam || 'offset', page * (pagination.pageSize || 100))
    qp.set(pagination.sizeParam  || 'limit',  pagination.pageSize || 100)
  }

  const fullUrl   = qp.toString() ? `${url}?${qp}` : url
  const extraHeaders = cookieStr ? { Cookie: cookieStr } : {}
  const headers   = buildHeaders(auth, extraHeaders)
  const json      = await fetchWithRetry(fullUrl, { method, headers, timeoutMs }, retry)
  const items     = getNestedValue(json, pagination?.dataPath) ?? json
  const total     = getNestedValue(json, pagination?.totalPath) ?? null
  const isArray   = Array.isArray(items)

  return { items: isArray ? items : [items], total, raw: json }
}

// ── Main: fetch semua halaman dari satu source ────────────────────────────────

export async function fetchSource(source, rawDir) {
  const { id, name, auth, pagination } = source
  console.log(`\n[fetcher] Mengambil dari: ${name} (${id})`)

  await fs.mkdir(rawDir, { recursive: true })

  const allItems  = []
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const runDir    = path.join(rawDir, id, timestamp)
  await fs.mkdir(runDir, { recursive: true })

  // Login dulu jika auth tipe cookie_login
  let cookieStr = null
  if (auth?.type === 'cookie_login') {
    cookieStr = await loginAndGetCookie(auth)
  }

  if (!pagination || pagination.type === 'none') {
    // Single fetch tanpa paginasi
    const { items, raw } = await fetchPage(source, 0, cookieStr)
    allItems.push(...items)
    await fs.writeFile(path.join(runDir, 'page-1.json'), JSON.stringify(raw, null, 2))
    console.log(`  [fetcher] ${items.length} record (single fetch)`)
  } else {
    // Paginated fetch
    let page  = pagination.type === 'page' ? 1 : 0
    let total = Infinity
    let fetched = 0
    let pageNum = 1

    while (fetched < total) {
      const { items, total: t, raw } = await fetchPage(source, page, cookieStr)
      if (t != null && total === Infinity) {
        total = t
        console.log(`  [fetcher] Total: ${total} record`)
      }

      if (!items.length) break

      allItems.push(...items)
      fetched += items.length
      await fs.writeFile(path.join(runDir, `page-${pageNum}.json`), JSON.stringify(raw, null, 2))
      console.log(`  [fetcher] Halaman ${pageNum}: ${items.length} record (total ${fetched})`)

      if (items.length < (pagination.pageSize || 100)) break  // halaman terakhir
      page++
      pageNum++
    }
  }

  // Simpan ringkasan
  const meta = {
    sourceId:  id,
    sourceName: name,
    fetchedAt: new Date().toISOString(),
    totalItems: allItems.length,
    runDir,
  }
  await fs.writeFile(path.join(runDir, '_meta.json'), JSON.stringify(meta, null, 2))

  // Simpan semua items gabungan
  const allFile = path.join(runDir, '_all.json')
  await fs.writeFile(allFile, JSON.stringify(allItems, null, 2))
  console.log(`  [fetcher] Raw tersimpan: ${runDir} (${allItems.length} record)`)

  return { items: allItems, meta, runDir }
}

// ── Fetch dari file lokal (untuk testing/re-import) ──────────────────────────

export async function fetchFromFile(filePath) {
  console.log(`[fetcher] Membaca dari file: ${filePath}`)
  const raw  = await fs.readFile(filePath, 'utf-8')
  const data = JSON.parse(raw)
  const items = Array.isArray(data) ? data : (data.data ?? data.items ?? data.customers ?? [data])
  console.log(`  [fetcher] ${items.length} record dari file`)
  return items
}
