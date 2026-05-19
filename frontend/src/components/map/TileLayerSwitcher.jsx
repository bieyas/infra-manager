import React, { useState } from 'react'
import { TileLayer, LayersControl } from 'react-leaflet'
import { Map, Satellite, Moon } from 'lucide-react'
import clsx from 'clsx'

export const TILE_LAYERS = {
  street: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    icon: Map,
    maxZoom: 19,
  },
  satellite: {
    name: 'Satelit',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    icon: Satellite,
    maxZoom: 18,
  },
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    icon: Moon,
    maxZoom: 20,
  },
}

const STORAGE_KEY = 'infra-manager:tile-layer'

/**
 * Inline tile layer switcher — floating button group.
 * Usage: place inside <MapContainer> as a sibling of markers/popups.
 */
export default function TileLayerSwitcher({ defaultLayer = 'street' }) {
  const [active, setActive] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || defaultLayer
    } catch {
      return defaultLayer
    }
  })

  const handleSwitch = (key) => {
    setActive(key)
    try { localStorage.setItem(STORAGE_KEY, key) } catch { /* ignore */ }
  }

  const layer = TILE_LAYERS[active] || TILE_LAYERS.street

  return (
    <>
      <TileLayer
        key={active}
        url={layer.url}
        attribution={layer.attribution}
        maxZoom={layer.maxZoom}
      />
      <div className="leaflet-top leaflet-right" style={{ pointerEvents: 'auto' }}>
        <div className="leaflet-control flex gap-0.5 p-1 rounded-lg bg-[var(--bg-secondary)]/90 backdrop-blur-sm border border-[var(--border)] shadow-lg mt-2 mr-2">
          {Object.entries(TILE_LAYERS).map(([key, cfg]) => {
            const Icon = cfg.icon
            return (
              <button
                key={key}
                onClick={() => handleSwitch(key)}
                title={cfg.name}
                className={clsx(
                  'p-1.5 rounded-md transition-all text-[11px] flex items-center gap-1',
                  active === key
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-secondary hover:bg-[var(--accent-glow)] hover:text-primary'
                )}
              >
                <Icon size={14} />
                <span className="hidden sm:inline">{cfg.name}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

/**
 * Simple tile layer with no switcher UI — just renders the active layer.
 * Reads the persisted preference from localStorage.
 */
export function PersistentTileLayer({ fallback = 'street' }) {
  const [active] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || fallback
    } catch {
      return fallback
    }
  })

  const layer = TILE_LAYERS[active] || TILE_LAYERS.street

  return (
    <TileLayer
      url={layer.url}
      attribution={layer.attribution}
      maxZoom={layer.maxZoom}
    />
  )
}
