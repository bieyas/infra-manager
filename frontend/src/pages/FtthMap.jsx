import React from 'react'
import { MapSettingsProvider } from '../context/MapSettingsContext'
import FtthMap from '../features/ftth'

export default function FtthMapPage() {
  return (
    <MapSettingsProvider>
      <FtthMap />
    </MapSettingsProvider>
  )
}
