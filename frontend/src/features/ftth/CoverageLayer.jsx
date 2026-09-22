import React, { useMemo } from 'react'
import { Polygon, Tooltip } from 'react-leaflet'
import buffer from '@turf/buffer'
import { lineString, point, polygon as turfPolygon, featureCollection } from '@turf/helpers'
import { union } from '@turf/union'

/**
 * Default coverage options per node type
 */
export const DEFAULT_COVERAGE_OPTIONS = {
  enabled: true,
  showOdc: true,
  showOdp: false,
  mergeOverlapping: true,    // Gabung polygon ODC yang overlap jadi satu area
  odcRadius: 300,            // meter
  odpRadius: 150,            // meter
  opacity: 0.15,
  strokeOpacity: 0.5,
  colorByUtilization: false, // false = pakai warna per node type
}

// Warna per utilisasi
function coverageColor(utilization, defaultColor) {
  if (utilization == null) return defaultColor
  if (utilization >= 80) return '#ef4444' // merah
  if (utilization >= 50) return '#f59e0b' // amber
  return '#10b981'                        // hijau
}

/**
 * Konversi GeoJSON Feature/Polygon ke array [lat, lng] untuk Leaflet
 */
function geojsonToLeaflet(geometry) {
  if (!geometry) return []

  const coords = geometry.type === 'Feature'
    ? geometry.geometry?.coordinates
    : geometry.coordinates

  if (!coords) return []

  // Polygon: coords[0] = outer ring, coords[1..] = holes
  if (geometry.type === 'Polygon' || geometry.geometry?.type === 'Polygon') {
    return (coords[0] || []).map(([lng, lat]) => [lat, lng])
  }

  // MultiPolygon: array of polygons
  if (geometry.type === 'MultiPolygon' || geometry.geometry?.type === 'MultiPolygon') {
    return coords.map(poly => (poly[0] || []).map(([lng, lat]) => [lat, lng]))
  }

  return []
}

/**
 * Buat buffer polygon dari sebuah node (titik) atau dari edge (garis OLT→ODC→ODP)
 * Menggunakan Turf.js @turf/buffer — input GeoJSON, output GeoJSON polygon
 */
function buildNodeBuffer(node, radiusMeters) {
  if (!node.lat || !node.lng) return null
  try {
    const pt = point([node.lng, node.lat])
    const buffered = buffer(pt, radiusMeters / 1000, { units: 'kilometers', steps: 32 })
    return buffered
  } catch {
    return null
  }
}

/**
 * Buat buffer dari edge (garis antara dua node)
 */
function buildEdgeBuffer(from, to, radiusMeters) {
  if (!from.lat || !from.lng || !to.lat || !to.lng) return null
  try {
    const line = lineString([
      [from.lng, from.lat],
      [to.lng, to.lat],
    ])
    const buffered = buffer(line, radiusMeters / 1000, { units: 'kilometers', steps: 16 })
    return buffered
  } catch {
    return null
  }
}

/**
 * Gabungkan array feature GeoJSON menjadi satu polygon (union)
 */
function mergeFeatures(features) {
  if (features.length === 0) return null
  if (features.length === 1) return features[0]

  try {
    let merged = features[0]
    for (let i = 1; i < features.length; i++) {
      merged = union(featureCollection([merged, features[i]]))
      if (!merged) break
    }
    return merged
  } catch {
    return features[0]
  }
}

/**
 * Buat buffer dari polyline multi-titik (rute OSRM)
 * coords: [[lng,lat], ...] — GeoJSON format
 */
function buildRouteBuffer(coords, radiusMeters) {
  if (!coords || coords.length < 2) return null
  try {
    const line = lineString(coords)
    return buffer(line, radiusMeters / 1000, { units: 'kilometers', steps: 16 })
  } catch {
    return null
  }
}

/**
 * Build coverage polygons per ODC.
 * Jika osrmRoutes tersedia, gunakan rute jalan untuk buffer kabel.
 * Jika tidak, fallback ke garis lurus.
 *
 * @param {Array}   nodes        - FtthNode array
 * @param {Object}  options      - DEFAULT_COVERAGE_OPTIONS
 * @param {Map}     osrmRoutes   - Map key="odcId-odpId" → [[lng,lat],...]
 */
function buildOdcCoverages(nodes, options, osrmRoutes = new Map()) {
  const { odcRadius, odpRadius, mergeOverlapping, showOdp, colorByUtilization } = options

  const odcNodes = nodes.filter(n => n.type === 'odc' && n.lat && n.lng)
  const odpNodes = nodes.filter(n => n.type === 'odp' && n.lat && n.lng)

  const result = []

  odcNodes.forEach(odc => {
    const features = []

    // Buffer titik ODC
    const odcBuf = buildNodeBuffer(odc, odcRadius)
    if (odcBuf) features.push(odcBuf)

    // Buffer edge ODC → ODP (via rute OSRM atau garis lurus)
    if (showOdp) {
      const linkedOdps = odpNodes.filter(o => o.odcId === odc.id)
      linkedOdps.forEach(odp => {
        const routeKey = `${odc.id}-${odp.id}`
        const routeCoords = osrmRoutes.get(routeKey)

        if (routeCoords && routeCoords.length >= 2) {
          // Gunakan rute jalan dari OSRM
          const routeBuf = buildRouteBuffer(routeCoords, odpRadius)
          if (routeBuf) features.push(routeBuf)
        } else {
          // Fallback: garis lurus
          const edgeBuf = buildEdgeBuffer(odc, odp, odpRadius)
          if (edgeBuf) features.push(edgeBuf)
        }

        // Buffer titik ODP
        const odpBuf = buildNodeBuffer(odp, odpRadius)
        if (odpBuf) features.push(odpBuf)
      })
    }

    if (features.length === 0) return

    const polygon = mergeOverlapping ? mergeFeatures(features) : features[0]
    if (!polygon) return

    const color = colorByUtilization
      ? coverageColor(odc.utilization, '#06b6d4')
      : '#06b6d4'

    result.push({ id: odc.id, name: odc.name, polygon, color, utilization: odc.utilization })
  })

  return result
}

/**
 * Konversi CoverageZone dari DB ke format render.
 * coordinates: GeoJSON Polygon rings [[lng,lat],...]
 */
function buildManualZones(dbZones = []) {
  return dbZones
    .filter(z => z.isActive !== false && z.coordinates)
    .map(z => {
      try {
        const feat = turfPolygon(z.coordinates)
        return {
          id: z.id,
          name: z.name || z.odc?.name || 'Zona',
          polygon: feat,
          color: z.color || '#06b6d4',
          opacity: z.opacity ?? 0.2,
          isManual: true,
        }
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

/**
 * Build standalone ODP coverage (untuk ODP tanpa ODC, atau mode independent)
 */
function buildOdpCoverages(nodes, options) {
  const { odpRadius, colorByUtilization } = options
  const odpNodes = nodes.filter(n => n.type === 'odp' && n.lat && n.lng)

  return odpNodes.map(odp => {
    const polygon = buildNodeBuffer(odp, odpRadius)
    if (!polygon) return null

    const color = colorByUtilization
      ? coverageColor(odp.utilization, '#8b5cf6')
      : '#8b5cf6'

    return { id: odp.id, name: odp.name, polygon, color, utilization: odp.utilization }
  }).filter(Boolean)
}

/**
 * Render satu coverage polygon ke peta
 */
function CoveragePolygon({ id, name, polygon, color, opacity, strokeOpacity }) {
  if (!polygon) return null

  const geomType = polygon.geometry?.type || polygon.type

  // MultiPolygon → render sebagai beberapa Polygon
  if (geomType === 'MultiPolygon') {
    const parts = geojsonToLeaflet(polygon.geometry || polygon)
    return parts.map((ring, i) => (
      <Polygon
        key={`${id}-${i}`}
        positions={ring}
        pathOptions={{
          fillColor: color,
          fillOpacity: opacity,
          color: color,
          weight: 1.5,
          opacity: strokeOpacity,
          dashArray: '4 4',
        }}
      >
        <Tooltip sticky direction="top" offset={[0, -8]}>
          <span className="text-xs font-medium">{name}</span>
        </Tooltip>
      </Polygon>
    ))
  }

  // Single Polygon
  const positions = geojsonToLeaflet(polygon.geometry || polygon)
  if (!positions || positions.length === 0) return null

  return (
    <Polygon
      positions={positions}
      pathOptions={{
        fillColor: color,
        fillOpacity: opacity,
        color: color,
        weight: 1.5,
        opacity: strokeOpacity,
        dashArray: '4 4',
      }}
    >
      <Tooltip sticky direction="top" offset={[0, -8]}>
        <span className="text-xs font-medium">{name}</span>
      </Tooltip>
    </Polygon>
  )
}

/**
 * CoverageLayer — komponen utama untuk menampilkan area coverage FTTH di peta
 *
 * Props:
 *  - nodes: array FtthNode (dari useFtthData)
 *  - options: DEFAULT_COVERAGE_OPTIONS
 *  - osrmRoutes: Map dari useOsrmRouting (opsional)
 *  - manualZones: array CoverageZone dari DB (opsional)
 */
export function CoverageLayer({
  nodes = [],
  options = DEFAULT_COVERAGE_OPTIONS,
  osrmRoutes = new Map(),
  manualZones = [],
}) {
  const { enabled, showOdc, showOdp, opacity, strokeOpacity } = options

  const odcCoverages = useMemo(() => {
    if (!enabled || !showOdc) return []
    return buildOdcCoverages(nodes, options, osrmRoutes)
  }, [nodes, enabled, showOdc, options, osrmRoutes])

  const odpCoverages = useMemo(() => {
    if (!enabled || !showOdp || showOdc) return []
    return buildOdpCoverages(nodes, options)
  }, [nodes, enabled, showOdp, showOdc, options])

  const dbZoneCoverages = useMemo(() => {
    if (!enabled) return []
    return buildManualZones(manualZones)
  }, [enabled, manualZones])

  if (!enabled) return null

  return (
    <>
      {/* ODC coverage polygons — render pertama agar di bawah marker */}
      {odcCoverages.map(({ id, name, polygon, color }) => (
        <CoveragePolygon
          key={`odc-cov-${id}`}
          id={id}
          name={name}
          polygon={polygon}
          color={color}
          opacity={opacity}
          strokeOpacity={strokeOpacity}
        />
      ))}

      {/* ODP standalone coverage polygons */}
      {odpCoverages.map(({ id, name, polygon, color }) => (
        <CoveragePolygon
          key={`odp-cov-${id}`}
          id={id}
          name={name}
          polygon={polygon}
          color={color}
          opacity={opacity}
          strokeOpacity={strokeOpacity}
        />
      ))}

      {/* Manual zones dari DB — render di atas auto-coverage */}
      {dbZoneCoverages.map(({ id, name, polygon, color, opacity: zOpacity }) => (
        <CoveragePolygon
          key={`manual-cov-${id}`}
          id={id}
          name={name}
          polygon={polygon}
          color={color}
          opacity={zOpacity}
          strokeOpacity={0.8}
        />
      ))}
    </>
  )
}

export default CoverageLayer
