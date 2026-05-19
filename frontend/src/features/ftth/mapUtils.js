import L from 'leaflet'
import { MARKER_CFG, MARKER_CATEGORIES } from './constants'
import { generateMarkerSvg, getMarkerColor } from './MarkerIcons'

// ── Fix Leaflet default icon paths (broken with Vite) ────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ═══════════════════════════════════════════════════════════════════════════════
// MARKER ICON GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a Leaflet divIcon with custom SVG marker
 * @param {string} type - Marker type (mikrotik, olt, odc, odp, closure, onu, htb)
 * @param {Object} options - Icon options
 * @param {boolean} options.active - Show active/selected ring
 * @param {number|null} options.utilization - Utilization percentage for color coding
 * @param {boolean} options.pulse - Add pulse animation
 * @returns {L.DivIcon} Leaflet divIcon instance
 */
export function makeSvgIcon(type, options = {}) {
  const { active = false, utilization = null, pulse = false } = options
  const cfg = MARKER_CFG[type]
  
  if (!cfg) return new L.Icon.Default()
  
  const s = cfg.size
  const svgString = generateMarkerSvg(type, { active, utilization, pulse })
  
  return L.divIcon({
    className:   'custom-marker-icon',
    html:        svgString,
    iconSize:    [s, s],
    iconAnchor:  [s / 2, s / 2],
    popupAnchor: [0, -s / 2],
  })
}

// Legacy compatibility - keep old signature working
export function makeSvgIconLegacy(type, active = false, utilization) {
  return makeSvgIcon(type, { active, utilization })
}

// ═══════════════════════════════════════════════════════════════════════════════
// CABLE / POLYLINE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cable type definitions with visual styles
 */
export const CABLE_TYPES = {
  // Backbone / Feeder cables
  feeder: {
    label: 'Feeder Cable',
    color: '#1e40af',      // Dark blue
    weight: 4,
    opacity: 0.9,
    dashArray: null,
    lineCap: 'round',
  },
  // Distribution cables
  distribution: {
    label: 'Distribution Cable',
    color: '#0891b2',      // Cyan
    weight: 3,
    opacity: 0.85,
    dashArray: null,
    lineCap: 'round',
  },
  // Drop cables to customer
  drop: {
    label: 'Drop Cable',
    color: '#7c3aed',      // Violet
    weight: 2,
    opacity: 0.8,
    dashArray: '5,5',
    lineCap: 'round',
  },
  // Aerial / overhead
  aerial: {
    label: 'Aerial',
    color: '#ea580c',      // Orange
    weight: 3,
    opacity: 0.85,
    dashArray: '10,5',
    lineCap: 'round',
  },
  // Underground
  underground: {
    label: 'Underground',
    color: '#16a34a',      // Green
    weight: 3,
    opacity: 0.85,
    dashArray: null,
    lineCap: 'round',
  },
  // Planned / proposed
  planned: {
    label: 'Planned',
    color: '#94a3b8',      // Gray
    weight: 2,
    opacity: 0.6,
    dashArray: '8,4,2,4',
    lineCap: 'round',
  },
}

/**
 * Connection type mapping to cable styles
 */
export const CONNECTION_CABLE_MAP = {
  'olt-odc': 'feeder',
  'odc-odp': 'distribution',
  'odp-odp': 'distribution',
  'odp-onu': 'drop',
  'odc-closure': 'feeder',
  'closure-odp': 'distribution',
  'mikrotik-olt': 'feeder',
}

/**
 * Build cable connections between nodes with style information
 * @param {Array} nodes - Array of node objects
 * @param {Object} options - Build options
 * @param {string} options.defaultCableType - Default cable type if not inferred
 * @returns {Array} Array of cable segments with style info
 */
export function buildCables(nodes, options = {}) {
  const { defaultCableType = 'distribution' } = options
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  
  return nodes.reduce((acc, n) => {
    // OLT → ODC connection (via oltId on ODC nodes)
    if (n.type === 'odc' && n.oltId && byId[n.oltId]) {
      const parent = byId[n.oltId]
      acc.push({
        key: `${parent.id}-${n.id}-feeder`,
        from: [parent.lat, parent.lng],
        to: [n.lat, n.lng],
        fromId: parent.id,
        toId: n.id,
        type: 'feeder',
        style: CABLE_TYPES.feeder,
        width: 4,
      })
    }

    // ODC → ODP connection (via odcId)
    if (n.type === 'odp' && n.odcId && byId[n.odcId]) {
      const parent = byId[n.odcId]
      const cableType = CONNECTION_CABLE_MAP['odc-odp'] || defaultCableType
      acc.push({
        key: `${parent.id}-${n.id}`,
        from: [parent.lat, parent.lng],
        to: [n.lat, n.lng],
        fromId: parent.id,
        toId: n.id,
        type: cableType,
        style: CABLE_TYPES[cableType],
        width: 2,
      })
    }
    
    // ODP cascade (via uplinkOdpId)
    if (n.type === 'odp' && n.uplinkOdpId && byId[n.uplinkOdpId]) {
      const parent = byId[n.uplinkOdpId]
      acc.push({
        key: `${parent.id}-${n.id}-cascade`,
        from: [parent.lat, parent.lng],
        to: [n.lat, n.lng],
        fromId: parent.id,
        toId: n.id,
        type: 'distribution',
        style: { ...CABLE_TYPES.distribution, dashArray: '5,5' },
        width: 1.5,
        isCascade: true,
      })
    }

    // ODP → Customer/ONU drop cable (via odpId on customer nodes)
    if (n.type === 'onu' && n.odpId && byId[n.odpId]) {
      const parent = byId[n.odpId]
      acc.push({
        key: `${parent.id}-${n.id}-drop`,
        from: [parent.lat, parent.lng],
        to: [n.lat, n.lng],
        fromId: parent.id,
        toId: n.id,
        type: 'drop',
        style: CABLE_TYPES.drop,
        width: 1,
      })
    }
    
    return acc
  }, [])
}

/**
 * Generate polygon coordinates for a cable segment (for customizable cable display)
 * @param {Array} from - [lat, lng] start point
 * @param {Array} to - [lat, lng] end point
 * @param {number} width - Width in meters
 * @returns {Array} Polygon coordinates [[lat,lng], ...]
 */
export function generateCablePolygon(from, to, width = 2) {
  const [lat1, lng1] = from
  const [lat2, lng2] = to
  
  // Calculate perpendicular offset
  const dLat = lat2 - lat1
  const dLng = lng2 - lng1
  const dist = Math.sqrt(dLat * dLat + dLng * dLng)
  
  if (dist === 0) return [from, to]
  
  // Convert width in meters to lat/lng offset (approximate)
  // 1 degree lat ≈ 111km, 1 degree lng ≈ 111km * cos(lat)
  const latOffset = (width / 2) / 111000 // meters to degrees
  const lngOffset = (width / 2) / (111000 * Math.cos((lat1 + lat2) / 2 * Math.PI / 180))
  
  // Perpendicular unit vector
  const perpLat = -dLng / dist
  const perpLng = dLat / dist
  
  // Four corners of the polygon
  return [
    [lat1 + perpLat * latOffset, lng1 + perpLng * lngOffset],
    [lat2 + perpLat * latOffset, lng2 + perpLng * lngOffset],
    [lat2 - perpLat * latOffset, lng2 - perpLng * lngOffset],
    [lat1 - perpLat * latOffset, lng1 - perpLng * lngOffset],
  ]
}

/**
 * Create curved cable path for better visualization
 * @param {Array} from - [lat, lng] start
 * @param {Array} to - [lat, lng] end
 * @param {number} curvature - Curve amount (0-1)
 * @returns {Array} Array of [lat, lng] points for polyline
 */
export function generateCurvedCable(from, to, curvature = 0.2) {
  const [lat1, lng1] = from
  const [lat2, lng2] = to
  
  // Midpoint
  const midLat = (lat1 + lat2) / 2
  const midLng = (lng1 + lng2) / 2
  
  // Perpendicular offset for curve
  const dLat = lat2 - lat1
  const dLng = lng2 - lng1
  const dist = Math.sqrt(dLat * dLat + dLng * dLng)
  
  if (dist === 0) return [from, to]
  
  // Offset midpoint
  const perpLat = -dLng / dist * curvature * dist * 0.3
  const perpLng = dLat / dist * curvature * dist * 0.3
  
  const controlLat = midLat + perpLat
  const controlLng = midLng + perpLng
  
  // Generate curve points using quadratic bezier
  const points = []
  const steps = 20
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const lat = (1 - t) * (1 - t) * lat1 + 2 * (1 - t) * t * controlLat + t * t * lat2
    const lng = (1 - t) * (1 - t) * lng1 + 2 * (1 - t) * t * controlLng + t * t * lng2
    points.push([lat, lng])
  }
  
  return points
}

export function buildEdges(nodes) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  return nodes.reduce((acc, n) => {
    // OLT → ODC feeder
    if (n.type === 'odc' && n.oltId && byId[n.oltId]) {
      const p = byId[n.oltId]
      acc.push({
        key:   `${p.id}-${n.id}-feeder`,
        from:  [p.lat, p.lng],
        to:    [n.lat, n.lng],
        color: '#1e40af', // dark blue for feeder
      })
    }
    // ODC → ODP
    if (n.type === 'odp' && n.odcId && byId[n.odcId]) {
      const p = byId[n.odcId]
      acc.push({
        key:   `${p.id}-${n.id}`,
        from:  [p.lat, p.lng],
        to:    [n.lat, n.lng],
        color: '#22c55e', // green for odc-odp
      })
    }
    // ODP cascade (via uplinkOdpId)
    if (n.type === 'odp' && n.uplinkOdpId && byId[n.uplinkOdpId]) {
      const p = byId[n.uplinkOdpId]
      acc.push({
        key:   `${p.id}-${n.id}-cascade`,
        from:  [p.lat, p.lng],
        to:    [n.lat, n.lng],
        color: '#06b6d4', // cyan for cascade
      })
    }
    // ODP → Customer/ONU
    if (n.type === 'onu' && n.odpId && byId[n.odpId]) {
      const p = byId[n.odpId]
      acc.push({
        key:   `${p.id}-${n.id}-drop`,
        from:  [p.lat, p.lng],
        to:    [n.lat, n.lng],
        color: '#7c3aed', // violet for drop
      })
    }
    return acc
  }, [])
}

export function getAncestorIds(id, allNodes) {
  const byId = Object.fromEntries(allNodes.map(n => [n.id, n]))
  const ids  = new Set()
  let cur    = byId[id]
  if (!cur) return ids

  // Walk up: ONU→ODP, ODP→ODC or ODP→ODP(uplink), ODC→OLT
  const visited = new Set()
  while (cur && !visited.has(cur.id)) {
    visited.add(cur.id)
    const parentKey = cur.odpId || cur.odcId || cur.oltId || cur.uplinkOdpId || cur.parentId
    if (parentKey && byId[parentKey]) {
      ids.add(parentKey)
      cur = byId[parentKey]
    } else {
      break
    }
  }
  return ids
}
