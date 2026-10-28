import React, { useMemo } from 'react'
import { Polygon, Tooltip } from 'react-leaflet'
import buffer from '@turf/buffer'
import { point, polygon as turfPolygon } from '@turf/helpers'

/**
 * Default coverage options
 */
export const DEFAULT_COVERAGE_OPTIONS = {
  enabled: true,
  showOdp: true,
  mergeOverlapping: true,
  odpRadius: 150,            // meter
  opacity: 0.15,
  strokeOpacity: 0.5,
  colorByUtilization: false,
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

  // Ring pertama adalah exterior ring
  const ring = Array.isArray(coords[0][0]) ? coords[0] : coords
  return ring.map(([lng, lat]) => [lat, lng])
}

/**
 * Buat buffer lingkaran di sekitar satu titik (lat, lng)
 */
function buildNodeBuffer(node, radiusMeters) {
  if (!node.lat || !node.lng) return null
  try {
    const pt = point([Number(node.lng), Number(node.lat)])
    return buffer(pt, radiusMeters, { units: 'meters', steps: 32 })
  } catch {
    return null
  }
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
          name: z.name || 'Zona',
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
 * Build ODP coverage polygons
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
 * CoverageLayer
 */
export function CoverageLayer({
  nodes = [],
  options = DEFAULT_COVERAGE_OPTIONS,
  manualZones = [],
}) {
  const { enabled, showOdp, opacity, strokeOpacity } = options

  const odpCoverages = useMemo(() => {
    if (!enabled || !showOdp) return []
    return buildOdpCoverages(nodes, options)
  }, [nodes, enabled, showOdp, options])

  const dbZoneCoverages = useMemo(() => {
    if (!enabled) return []
    return buildManualZones(manualZones)
  }, [enabled, manualZones])

  if (!enabled) return null

  return (
    <>
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
