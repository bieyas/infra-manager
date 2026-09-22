import { useEffect } from 'react'
import { useMapEvents, useMap } from 'react-leaflet'

export function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click() { 
      if (onMapClick) onMapClick()
    },
  })
  return null
}

export function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 17, { duration: 1 })
  }, [target])
  return null
}
