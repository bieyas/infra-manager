import { useState, useEffect, useRef, useCallback } from 'react'

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'

// In-memory cache: key="lng1,lat1;lng2,lat2" → GeoJSON LineString coordinates
const routeCache = new Map()

/**
 * Fetch satu rute jalan dari OSRM antara dua titik.
 * Return array [[lng,lat],...] atau null jika gagal.
 */
async function fetchRoute(from, to, signal) {
  const key = `${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}`
  if (routeCache.has(key)) return routeCache.get(key)

  try {
    const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`OSRM ${res.status}`)
    const data = await res.json()
    const coords = data?.routes?.[0]?.geometry?.coordinates
    if (!coords || coords.length === 0) throw new Error('empty route')
    routeCache.set(key, coords)
    return coords
  } catch (err) {
    if (err.name === 'AbortError') return null
    // Fallback: garis lurus
    const straight = [[from.lng, from.lat], [to.lng, to.lat]]
    routeCache.set(key, straight)
    return straight
  }
}

/**
 * Hook untuk fetch semua rute kabel dari nodes.
 * Menghasilkan Map: "fromId-toId" → [[lng,lat],...]
 *
 * @param {Array}   nodes       - FtthNode array
 * @param {boolean} enabled     - aktifkan routing
 * @param {number}  debounceMs  - delay setelah nodes berubah sebelum fetch (default 800ms)
 */
export function useOsrmRouting(nodes, enabled = true, debounceMs = 800) {
  const [routes, setRoutes] = useState(new Map())
  const [loading, setLoading] = useState(false)
  const abortRef = useRef(null)
  const timerRef = useRef(null)

  const buildRoutes = useCallback(async () => {
    if (!enabled || !nodes?.length) {
      setRoutes(new Map())
      return
    }

    // Buat edges yang perlu di-route
    const nodeMap = new Map(nodes.map(n => [n.id, n]))
    const edges = []

    nodes.forEach(n => {
      // OLT → ODC
      if (n.type === 'odc' && n.oltId) {
        const olt = nodeMap.get(n.oltId)
        if (olt?.lat && olt?.lng && n.lat && n.lng) {
          edges.push({ key: `${olt.id}-${n.id}`, from: olt, to: n })
        }
      }
      // ODC cascade
      if (n.type === 'odc' && n.uplinkOdcId) {
        const uplink = nodeMap.get(n.uplinkOdcId)
        if (uplink?.lat && uplink?.lng && n.lat && n.lng) {
          edges.push({ key: `${uplink.id}-${n.id}`, from: uplink, to: n })
        }
      }
      // ODC → ODP
      if (n.type === 'odp' && n.odcId) {
        const odc = nodeMap.get(n.odcId)
        if (odc?.lat && odc?.lng && n.lat && n.lng) {
          edges.push({ key: `${odc.id}-${n.id}`, from: odc, to: n })
        }
      }
      // ODP cascade
      if (n.type === 'odp' && n.uplinkOdpId) {
        const uplink = nodeMap.get(n.uplinkOdpId)
        if (uplink?.lat && uplink?.lng && n.lat && n.lng) {
          edges.push({ key: `${uplink.id}-${n.id}`, from: uplink, to: n })
        }
      }
    })

    if (edges.length === 0) {
      setRoutes(new Map())
      return
    }

    // Abort request sebelumnya
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)

    // Fetch semua rute secara paralel, max 5 concurrent untuk hindari rate-limit
    const result = new Map()
    const BATCH = 5
    for (let i = 0; i < edges.length; i += BATCH) {
      const batch = edges.slice(i, i + BATCH)
      const settled = await Promise.allSettled(
        batch.map(e => fetchRoute(e.from, e.to, controller.signal).then(coords => ({ key: e.key, coords })))
      )
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value.coords) {
          result.set(s.value.key, s.value.coords)
        }
      }
      if (controller.signal.aborted) break
    }

    if (!controller.signal.aborted) {
      setRoutes(result)
      setLoading(false)
    }
  }, [nodes, enabled])

  useEffect(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(buildRoutes, debounceMs)
    return () => {
      clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [buildRoutes, debounceMs])

  return { routes, loading }
}

/**
 * Clear semua cache OSRM (untuk force refresh)
 */
export function clearOsrmCache() {
  routeCache.clear()
}
