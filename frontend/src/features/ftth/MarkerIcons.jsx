import React from 'react'
import { MARKER_CFG } from './constants'

// SVG icon paths for each device type
const ICON_PATHS = {
  // MikroTik - Router icon (hexagon with signal waves)
  mikrotik: (color, size) => `
    <defs>
      <filter id="shadow-${size}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <!-- Hexagon background -->
    <polygon points="${size/2},2 ${size-4},${size/4} ${size-4},${3*size/4} ${size/2},${size-2} 4,${3*size/4} 4,${size/4}" 
      fill="${color}" stroke="white" stroke-width="1.5" filter="url(#shadow-${size})"/>
    <!-- Router symbol -->
    <rect x="${size/2-6}" y="${size/2-4}" width="12" height="8" rx="1" fill="white"/>
    <circle cx="${size/2-3}" cy="${size/2}" r="1" fill="${color}"/>
    <circle cx="${size/2+3}" cy="${size/2}" r="1" fill="${color}"/>
    <!-- Signal waves -->
    <path d="M${size/2-10},${size/2-6} Q${size/2-14},${size/2} ${size/2-10},${size/2+6}" fill="none" stroke="white" stroke-width="1" opacity="0.7"/>
    <path d="M${size/2+10},${size/2-6} Q${size/2+14},${size/2} ${size/2+10},${size/2+6}" fill="none" stroke="white" stroke-width="1" opacity="0.7"/>
  `,

  // OLT - Optical Line Terminal (diamond with fiber optic symbol)
  olt: (color, size) => `
    <defs>
      <filter id="shadow-${size}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
      <linearGradient id="oltGrad-${size}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${color}"/>
        <stop offset="100%" style="stop-color:${color}dd"/>
      </linearGradient>
    </defs>
    <!-- Diamond shape -->
    <polygon points="${size/2},2 ${size-2},${size/2} ${size/2},${size-2} 2,${size/2}" 
      fill="url(#oltGrad-${size})" stroke="white" stroke-width="2" filter="url(#shadow-${size})"/>
    <!-- Fiber optic symbol -->
    <circle cx="${size/2}" cy="${size/2-2}" r="3" fill="white"/>
    <line x1="${size/2}" y1="${size/2+1}" x2="${size/2}" y2="${size/2+6}" stroke="white" stroke-width="2"/>
    <line x1="${size/2-3}" y1="${size/2+3}" x2="${size/2-3}" y2="${size/2+6}" stroke="white" stroke-width="1.5"/>
    <line x1="${size/2+3}" y1="${size/2+3}" x2="${size/2+3}" y2="${size/2+6}" stroke="white" stroke-width="1.5"/>
    <!-- Light glow -->
    <circle cx="${size/2}" cy="${size/2-2}" r="5" fill="white" opacity="0.3"/>
  `,

  // ODC - Optical Distribution Cabinet (square with splitter grid)
  odc: (color, size) => `
    <defs>
      <filter id="shadow-${size}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <!-- Square with rounded corners -->
    <rect x="3" y="3" width="${size-6}" height="${size-6}" rx="4" 
      fill="${color}" stroke="white" stroke-width="2" filter="url(#shadow-${size})"/>
    <!-- Splitter grid pattern -->
    <rect x="${size/2-8}" y="${size/2-6}" width="16" height="12" rx="1" fill="white" opacity="0.9"/>
    <!-- Grid lines -->
    <line x1="${size/2-4}" y1="${size/2-6}" x2="${size/2-4}" y2="${size/2+6}" stroke="${color}" stroke-width="0.8"/>
    <line x1="${size/2+4}" y1="${size/2-6}" x2="${size/2+4}" y2="${size/2+6}" stroke="${color}" stroke-width="0.8"/>
    <line x1="${size/2-8}" y1="${size/2}" x2="${size/2+8}" y2="${size/2}" stroke="${color}" stroke-width="0.8"/>
    <!-- Port dots -->
    <circle cx="${size/2-6}" cy="${size/2-3}" r="1" fill="${color}"/>
    <circle cx="${size/2}" cy="${size/2-3}" r="1" fill="${color}"/>
    <circle cx="${size/2+6}" cy="${size/2-3}" r="1" fill="${color}"/>
    <circle cx="${size/2-6}" cy="${size/2+3}" r="1" fill="${color}"/>
    <circle cx="${size/2}" cy="${size/2+3}" r="1" fill="${color}"/>
    <circle cx="${size/2+6}" cy="${size/2+3}" r="1" fill="${color}"/>
  `,

  // Closure - Fiber closure (circle with splicing symbol)
  closure: (color, size) => `
    <defs>
      <filter id="shadow-${size}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <!-- Circle background -->
    <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" 
      fill="${color}" stroke="white" stroke-width="2" filter="url(#shadow-${size})"/>
    <!-- Splicing symbol - fiber joining -->
    <line x1="${size/2-8}" y1="${size/2-2}" x2="${size/2-3}" y2="${size/2-2}" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <line x1="${size/2+8}" y1="${size/2-2}" x2="${size/2+3}" y2="${size/2-2}" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <line x1="${size/2-8}" y1="${size/2+2}" x2="${size/2-3}" y2="${size/2+2}" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <line x1="${size/2+8}" y1="${size/2+2}" x2="${size/2+3}" y2="${size/2+2}" stroke="white" stroke-width="2" stroke-linecap="round"/>
    <!-- Center joint -->
    <rect x="${size/2-3}" y="${size/2-4}" width="6" height="8" rx="2" fill="white"/>
    <line x1="${size/2}" y1="${size/2-2}" x2="${size/2}" y2="${size/2+2}" stroke="${color}" stroke-width="1"/>
  `,

  // ODP - Optical Distribution Point (circle with drop symbol)
  odp: (color, size) => `
    <defs>
      <filter id="shadow-${size}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <!-- Circle background -->
    <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" 
      fill="${color}" stroke="white" stroke-width="2" filter="url(#shadow-${size})"/>
    <!-- Distribution symbol - hub with drops -->
    <circle cx="${size/2}" cy="${size/2}" r="3" fill="white"/>
    <line x1="${size/2}" y1="${size/2}" x2="${size/2}" y2="${size/2-7}" stroke="white" stroke-width="1.5"/>
    <line x1="${size/2}" y1="${size/2}" x2="${size/2-6}" y2="${size/2+5}" stroke="white" stroke-width="1.5"/>
    <line x1="${size/2}" y1="${size/2}" x2="${size/2+6}" y2="${size/2+5}" stroke="white" stroke-width="1.5"/>
    <!-- Endpoints -->
    <circle cx="${size/2}" cy="${size/2-7}" r="1.5" fill="white"/>
    <circle cx="${size/2-6}" cy="${size/2+5}" r="1.5" fill="white"/>
    <circle cx="${size/2+6}" cy="${size/2+5}" r="1.5" fill="white"/>
  `,

  // ONU - Optical Network Unit (house shape with signal)
  onu: (color, size) => `
    <defs>
      <filter id="shadow-${size}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <!-- House shape -->
    <polygon points="${size/2},3 ${size-4},${size/3} ${size-4},${size-3} 4,${size-3} 4,${size/3}" 
      fill="${color}" stroke="white" stroke-width="1.5" filter="url(#shadow-${size})"/>
    <!-- Window/WiFi symbol -->
    <rect x="${size/2-5}" y="${size/2-2}" width="10" height="6" rx="1" fill="white"/>
    <!-- Signal arc -->
    <path d="M${size/2-4},${size/2-5} Q${size/2},${size/2-8} ${size/2+4},${size/2-5}" fill="none" stroke="white" stroke-width="1.5"/>
    <line x1="${size/2}" y1="${size/2-6}" x2="${size/2}" y2="${size/2-4}" stroke="white" stroke-width="1.5"/>
  `,

  // HTB - Legacy (simple circle)
  htb: (color, size) => `
    <defs>
      <filter id="shadow-${size}" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
      </filter>
    </defs>
    <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" 
      fill="${color}" stroke="white" stroke-width="2" filter="url(#shadow-${size})"/>
    <text x="${size/2}" y="${size/2+3}" text-anchor="middle" font-size="${size/3}" fill="white" font-weight="bold">H</text>
  `,
}

// Default/fallback icon
const defaultIcon = (color, size) => `
  <defs>
    <filter id="shadow-${size}" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
    </filter>
  </defs>
  <circle cx="${size/2}" cy="${size/2}" r="${size/2-3}" 
    fill="${color}" stroke="white" stroke-width="2" filter="url(#shadow-${size})"/>
  <circle cx="${size/2}" cy="${size/2}" r="${size/4}" fill="white"/>
`

// Generate full SVG string for a marker type
export function generateMarkerSvg(type, options = {}) {
  const {
    size = null, // Use config size if not specified
    active = false,
    utilization = null,
    pulse = false,
  } = options

  const cfg = MARKER_CFG[type]
  if (!cfg) return ''

  const s = size || cfg.size
  const color = utilization != null && utilization >= 90 
    ? '#ef4444' // Red for high utilization
    : utilization != null && utilization >= 70
    ? '#f59e0b' // Amber for medium
    : cfg.color

  const iconGenerator = ICON_PATHS[type] || defaultIcon
  const iconSvg = iconGenerator(color, s)

  // Active ring indicator
  const activeRing = active
    ? `<circle cx="${s/2}" cy="${s/2}" r="${s/2-1}" fill="none" stroke="white" stroke-width="2" opacity="0.9"/>`
    : ''

  // Utilization indicator dot
  const utilDot = utilization != null
    ? `<circle cx="${s-5}" cy="5" r="${utilization >= 90 ? 5 : 4}" 
        fill="${utilization >= 90 ? '#ef4444' : utilization >= 70 ? '#f59e0b' : '#22c55e'}" 
        stroke="white" stroke-width="1.5"/>`
    : ''

  // Pulse animation for active/alert state
  const pulseAnim = pulse
    ? `<circle cx="${s/2}" cy="${s/2}" r="${s/2}" fill="none" stroke="${color}" stroke-width="1" opacity="0.5">
        <animate attributeName="r" from="${s/2}" to="${s}" dur="1s" repeatCount="indefinite"/>
        <animate attributeName="opacity" from="0.5" to="0" dur="1s" repeatCount="indefinite"/>
      </circle>`
    : ''

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      ${pulseAnim}
      ${iconSvg}
      ${activeRing}
      ${utilDot}
    </svg>
  `
}

// React component for marker icon (for use in non-Leaflet contexts)
export function MarkerIcon({ type, size, active, utilization, className, ...props }) {
  const svgString = generateMarkerSvg(type, { size, active, utilization })
  
  return (
    <div 
      className={className}
      dangerouslySetInnerHTML={{ __html: svgString }}
      {...props}
    />
  )
}

// Generate L.divIcon for Leaflet
export function createLeafletIcon(type, options = {}) {
  const cfg = MARKER_CFG[type]
  if (!cfg) return null

  const { active = false, utilization = null } = options
  const s = cfg.size

  const svgString = generateMarkerSvg(type, { active, utilization })

  return L.divIcon({
    className: '',
    html: svgString,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
    popupAnchor: [0, -s / 2],
  })
}

// Helper to get marker color by utilization
export function getMarkerColor(type, utilization) {
  const cfg = MARKER_CFG[type]
  if (!cfg) return '#94a3b8'
  
  if (utilization >= 90) return '#ef4444'
  if (utilization >= 70) return '#f59e0b'
  return cfg.color
}

// Export icon preview for legend/ui
export const ICON_PREVIEWS = Object.fromEntries(
  Object.keys(MARKER_CFG).map(type => [
    type,
    generateMarkerSvg(type, { size: 24 })
  ])
)
