import React, { createContext, useContext, useState, useEffect } from 'react'

const STORAGE_KEY = 'infra-manager:map-settings'

const defaultSettings = {
  defaultCenter: { lat: -7.518893008940605, lng: 112.23274484700512 }, // Jombang area
  defaultZoom: 15,
}

const MapSettingsContext = createContext(null)

export function MapSettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaultSettings)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setSettings(s => ({ ...s, ...parsed }))
      }
    } catch {
      // ignore parse errors
    }
  }, [])

  const saveSettings = (newSettings) => {
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
    } catch {
      // ignore storage errors
    }
  }

  const setDefaultCenter = (lat, lng, zoom) => {
    const update = { defaultCenter: { lat, lng } }
    if (zoom !== undefined && zoom !== null) {
      update.defaultZoom = zoom
    }
    saveSettings(update)
  }

  return (
    <MapSettingsContext.Provider value={{ settings, saveSettings, setDefaultCenter }}>
      {children}
    </MapSettingsContext.Provider>
  )
}

export function useMapSettings() {
  const ctx = useContext(MapSettingsContext)
  if (!ctx) throw new Error('useMapSettings must be used within MapSettingsProvider')
  return ctx
}
