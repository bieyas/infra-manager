import { api } from './api'

/**
 * Ekstraksi koordinat sinkron dari teks lokal (URL lengkap Google Maps atau angka desimal)
 */
export function parseLocalCoordinates(input) {
  if (!input || typeof input !== 'string') return null
  const str = input.trim()

  // 1. URL Google Maps lengkap (!3d-7.5... !4d112.2...)
  let m = str.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), source: 'google_maps_url' }

  // 2. URL Google Maps (@-7.5...,112.2...)
  m = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), source: 'google_maps_at' }

  // 3. Query string (?q=-7.5...,112.2...)
  m = str.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]), source: 'google_maps_query' }

  // 4. Format Indonesia koma: -7,5221852, 112,2300377 atau -7,5221852 112,2300377
  const commaMatch = str.match(/(-?\d+),(\d{4,})[\s,]+(\d+),(\d{4,})/)
  if (commaMatch) {
    return {
      lat: parseFloat(`${commaMatch[1]}.${commaMatch[2]}`),
      lng: parseFloat(`${commaMatch[3]}.${commaMatch[4]}`),
      source: 'indonesian_comma'
    }
  }

  // 5. Format desimal titik: -7.5221852, 112.2300377 atau -7.5221852 112.2300377
  const dotMatch = str.match(/(-?\d+\.\d+)[\s,]+(\d+\.\d+)/)
  if (dotMatch) {
    return {
      lat: parseFloat(dotMatch[1]),
      lng: parseFloat(dotMatch[2]),
      source: 'standard_decimal'
    }
  }

  return null
}

/**
 * Cek apakah input merupakan shortlink Google Maps yang butuh di-resolve backend
 */
export function isMapsShortlink(input) {
  if (!input || typeof input !== 'string') return false
  return /https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(input)
}

/**
 * Smart Parser komprehensif: langsung parse lokal jika bisa, atau hubungi backend jika shortlink
 */
export async function smartParseCoordinates(input) {
  if (!input || typeof input !== 'string') return null
  const str = input.trim()

  // Coba parse lokal dulu (instan tanpa request jaringan)
  const local = parseLocalCoordinates(str)
  if (local) return local

  // Jika shortlink, resolve via backend
  if (isMapsShortlink(str)) {
    const urlMatch = str.match(/https?:\/\/[^\s"'\]]+/i)
    const targetUrl = urlMatch ? urlMatch[0] : str
    const res = await api.get(`/customers/resolve-maps-url?url=${encodeURIComponent(targetUrl)}`)
    if (res?.success && res.lat != null && res.lng != null) {
      return {
        lat: res.lat,
        lng: res.lng,
        source: 'resolved_shortlink',
        resolvedUrl: res.resolvedUrl
      }
    }
  }

  return null
}
