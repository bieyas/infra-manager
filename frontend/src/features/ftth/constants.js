export const MARKER_CFG = {
  // Core Network
  mikrotik:  { color: '#f97316', label: 'MT', size: 28, shape: 'hexagon', category: 'core' },  // Orange
  olt:       { color: '#3b82f6', label: 'OLT', size: 32, shape: 'diamond', category: 'core' }, // Blue
  
  // Distribution
  odc:       { color: '#06b6d4', label: 'ODC', size: 30, shape: 'square', category: 'distribution' },   // Cyan
  closure:   { color: '#f59e0b', label: 'CLO', size: 24, shape: 'circle', category: 'distribution' },   // Amber
  
  // Access
  odp:       { color: '#8b5cf6', label: 'ODP', size: 26, shape: 'circle', category: 'access' },        // Violet
  onu:       { color: '#10b981', label: 'ONU', size: 22, shape: 'house', category: 'access' },          // Emerald
  htb:       { color: '#34d399', label: 'HTB', size: 22, shape: 'circle', category: 'access' },        // Legacy
}

// Category groupings for layer control
export const MARKER_CATEGORIES = {
  core: { label: 'Core Network', types: ['mikrotik', 'olt'] },
  distribution: { label: 'Distribusi', types: ['odc', 'closure'] },
  access: { label: 'Akses Pelanggan', types: ['odp', 'onu', 'htb'] },
}

export const LAYER_TYPES = [
  // Core Network
  { id: 'mikrotik', label: 'MikroTik', color: '#f97316', category: 'core' },
  { id: 'olt',      label: 'OLT',      color: '#3b82f6', category: 'core' },
  
  // Distribution
  { id: 'odc',       label: 'ODC',       color: '#06b6d4', category: 'distribution' },
  { id: 'closure',   label: 'Closure',   color: '#f59e0b', category: 'distribution' },
  
  // Access
  { id: 'odp',     label: 'ODP',     color: '#8b5cf6', category: 'access' },
  { id: 'onu',     label: 'ONU',     color: '#10b981', category: 'access' },
  { id: 'htb',     label: 'HTB',     color: '#34d399', category: 'access' },
  
  // Connections
  { id: 'edges',    label: 'Kabel',          color: '#6b7280', category: 'connections' },

  // Coverage
  { id: 'coverage', label: 'Area Coverage',  color: '#06b6d4', category: 'coverage' },
]

// peek = fixed px, half/full = fraction of window height
export const SNAP = { peek: 56, half: 0.42, full: 0.80 }

export const MAP_CENTER = [-7.2575, 112.7521]
export const MAP_ZOOM   = 15
