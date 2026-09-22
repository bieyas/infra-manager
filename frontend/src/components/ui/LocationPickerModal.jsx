import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, Marker, useMapEvents, useMap } from 'react-leaflet'
import { PersistentTileLayer } from '../map/TileLayerSwitcher'
import L from 'leaflet'
import { X, Locate, MapPin, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { useMapSettings } from '../../context/MapSettingsContext'

// Fix leaflet default icon path issue with Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

/** Draggable marker — updates position on drag end */
function DraggableMarker({ position, onMove }) {
  const markerRef = useRef(null)

  const eventHandlers = {
    dragend() {
      const m = markerRef.current
      if (m) {
        const { lat, lng } = m.getLatLng()
        onMove(lat, lng)
      }
    },
  }

  return (
    <Marker
      draggable
      position={position}
      ref={markerRef}
      eventHandlers={eventHandlers}
    />
  )
}

/** Click handler — move marker on map click */
function MapClickHandler({ onMove }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

/** Fly map to given position */
function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, map.getZoom() < 16 ? 17 : map.getZoom(), { duration: 1 })
  }, [target]) // eslint-disable-line
  return null
}

export default function LocationPickerModal({ 
  lat, 
  lng, 
  onConfirm = () => {}, 
  onClose, 
  onAddressResolved, 
  onPositionChange 
}) {
  const { settings } = useMapSettings()
  const defaultCenter = [settings.defaultCenter.lat, settings.defaultCenter.lng]
  const defaultZoom = settings.defaultZoom

  const initLat = lat ? Number(lat) : null
  const initLng = lng ? Number(lng) : null

  const [pos,       setPos]       = useState(
    initLat && initLng ? [initLat, initLng] : null
  )
  const [flyTarget, setFlyTarget] = useState(null)
  const [gpsState,  setGpsState]  = useState('idle') // idle | loading | ok | denied | error
  const [gpsMsg,    setGpsMsg]    = useState('')
  const [address,   setAddress]   = useState('')
  const [revGeoing, setRevGeoing] = useState(false)

  /** Reverse geocode using Nominatim */
  const reverseGeocode = useCallback(async (lat, lng) => {
    setRevGeoing(true)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'id' } }
      )
      const data = await res.json()
      const resolved = data.display_name ?? ''
      setAddress(resolved)
      onAddressResolved?.(resolved, data)
    } catch {
      setAddress('')
    } finally {
      setRevGeoing(false)
    }
  }, [])

  const handleMove = useCallback((lat, lng) => {
    setPos([lat, lng])
    onPositionChange?.({ lat: lat.toFixed(7), lng: lng.toFixed(7) })
    reverseGeocode(lat, lng)
  }, [reverseGeocode, onPositionChange])

  /** Get current GPS location */
  const handleGps = () => {
    if (!navigator.geolocation) {
      setGpsState('error')
      setGpsMsg('Browser tidak mendukung GPS')
      return
    }
    setGpsState('loading')
    setGpsMsg('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        setGpsState('ok')
        setGpsMsg(`Akurasi ±${Math.round(accuracy)}m`)
        handleMove(lat, lng)
        setFlyTarget([lat, lng])
        setTimeout(() => setFlyTarget(null), 100)
      },
      (err) => {
        setGpsState(err.code === 1 ? 'denied' : 'error')
        setGpsMsg(
          err.code === 1 ? 'Izin lokasi ditolak — aktifkan di browser' :
          err.code === 2 ? 'Posisi tidak tersedia' :
          'Timeout mendapatkan lokasi'
        )
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    )
  }

  const handleConfirm = () => {
    if (!pos) return
    // Use optional chaining to prevent crashes if onConfirm is undefined
    onConfirm?.({ 
      lat: pos[0].toFixed(7), 
      lng: pos[1].toFixed(7),
      address: address 
    })
    onClose?.()
  }

  const mapCenter = pos ?? defaultCenter

  return (
    <div className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full md:max-w-2xl bg-[var(--bg-card)] border border-[var(--border)] rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ height: 'min(90vh, 640px)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0 bg-[var(--bg-card)] z-10">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-[var(--accent)]" />
            <h3 className="text-sm font-bold text-primary">Pilih Lokasi</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* GPS status bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] shrink-0">
          <button
            onClick={handleGps}
            disabled={gpsState === 'loading'}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-glow)] text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-50"
          >
            {gpsState === 'loading'
              ? <Loader2 size={12} className="animate-spin" />
              : <Locate size={12} />
            }
            Lokasi Saya
          </button>

          {gpsState === 'ok' && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <CheckCircle2 size={10} /> {gpsMsg}
            </span>
          )}
          {(gpsState === 'denied' || gpsState === 'error') && (
            <span className="flex items-center gap-1 text-[10px] text-rose-400">
              <AlertCircle size={10} /> {gpsMsg}
            </span>
          )}

          {!gpsMsg && (
            <span className="text-[10px] text-muted">
              Klik peta atau geser marker untuk menentukan lokasi
            </span>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          <MapContainer
            center={mapCenter}
            zoom={defaultZoom}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <PersistentTileLayer />
            <MapClickHandler onMove={handleMove} />
            {flyTarget && <FlyTo target={flyTarget} />}
            {pos && <DraggableMarker position={pos} onMove={handleMove} />}
          </MapContainer>

          {/* Coordinate overlay */}
          {pos && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-sm text-[10px] text-white/90 font-mono whitespace-nowrap pointer-events-none">
              {pos[0].toFixed(6)}, {pos[1].toFixed(6)}
            </div>
          )}
        </div>

        {/* Address preview + footer */}
        <div className="px-4 py-3 border-t border-[var(--border)] shrink-0 bg-[var(--bg-card)] space-y-2">
          {(address || revGeoing) && (
            <div className="flex items-start gap-1.5 text-[10px] text-muted">
              <MapPin size={9} className="shrink-0 mt-0.5 text-[var(--accent)]" />
              {revGeoing
                ? <span className="flex items-center gap-1"><Loader2 size={9} className="animate-spin" /> Mencari alamat…</span>
                : <span className="line-clamp-2">{address}</span>
              }
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 py-2 text-xs rounded-lg border border-[var(--border)] text-secondary hover:text-primary hover:border-[var(--accent)]/40 transition-colors">
              Batal
            </button>
            <button
              onClick={handleConfirm}
              disabled={!pos}
              className="flex-1 py-2 text-xs rounded-lg bg-[var(--accent)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pos ? `Gunakan Lokasi Ini` : 'Pilih Lokasi di Peta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
