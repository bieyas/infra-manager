// Color utilities for FTTH map based on utilization

export function getUtilizationColor(utilization, type = 'odp') {
  if (utilization >= 90) {
    return '#ef4444' // red-500 - Critical
  }
  if (utilization >= 70) {
    return '#f59e0b' // amber-500 - Warning
  }
  if (utilization >= 50) {
    return '#22c55e' // green-500 - Good
  }
  return '#06b6d4' // cyan - Low usage
}

export function getUtilizationBg(utilization) {
  if (utilization >= 90) return 'bg-rose-500'
  if (utilization >= 70) return 'bg-amber-500'
  if (utilization >= 50) return 'bg-emerald-500'
  return 'bg-blue-500'
}

export function getMarkerIcon(type, utilization) {
  const isFull = utilization >= 90
  return {
    color: getUtilizationColor(utilization, 'odp'),
    shape: 'circle',
    icon: isFull ? '🔴' : '📍',
  }
}

// Generate SVG marker for Leaflet
export function createMarkerSvg(type, utilization, size = 28) {
  const color = getUtilizationColor(utilization, type)
  const isFull = utilization >= 90
  const strokeColor = isFull ? '#7f1d1d' : '#1e293b'
  
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.3"/>
        </filter>
      </defs>
      <circle 
        cx="${size/2}" cy="${size/2}" r="${(size-4)/2}"
        fill="${color}" 
        stroke="${strokeColor}" 
        stroke-width="2"
        filter="url(#shadow)"
      />
      <text 
        x="${size/2}" 
        y="${size/2}" 
        text-anchor="middle" 
        dominant-baseline="central"
        font-size="${size/2}"
      >
        📍
      </text>
    </svg>
  `
}

// Connection line colors
export function getConnectionColor(type) {
  switch (type) {
    case 'olt-odp': return '#6366f1' // indigo feeder
    case 'odp-odp': return '#06b6d4' // cyan cascade
    case 'odp-onu': return '#10b981' // emerald drop
    default: return '#94a3b8' // slate
  }
}
