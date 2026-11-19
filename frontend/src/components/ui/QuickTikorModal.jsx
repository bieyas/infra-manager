import React, { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, Marker, useMapEvents, useMap } from 'react-leaflet'
import { PersistentTileLayer } from '../map/TileLayerSwitcher'
import L from 'leaflet'
import {
  X, Locate, MapPin, Loader2, AlertCircle, CheckCircle2,
  Trash2, ExternalLink, Sparkles, Navigation, Check
} from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { useMapSettings } from '../../context/MapSettingsContext'
import { smartParseCoordinates } from '../../lib/coordinateParser'
import { api } from '../../lib/api'
import { useToast } from '../../context/ToastContext'

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

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
  return <Marker draggable position={position} ref={markerRef} eventHandlers={eventHandlers} />
}

function MapClickHandler({ onMove }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 17), { duration: 0.8 })
  }, [target, map])
  return null
}

export default function QuickTikorModal({ customer, isOpen, onClose, onUpdated }) {
  const dialogRef = useRef(null)
  const toast = useToast()
  const { settings } = useMapSettings()

  const defaultCenter = [settings.defaultCenter?.lat || -7.52, settings.defaultCenter?.lng || 112.23]
  const defaultZoom = settings.defaultZoom || 15

  const initialLat = customer?.lat != null ? Number(customer.lat) : null
  const initialLng = customer?.lng != null ? Number(customer.lng) : null

  const [lat, setLat] = useState(initialLat)
  const [lng, setLng] = useState(initialLng)
  const [rawInput, setRawInput] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseMsg, setParseMsg] = useState(null)
  const [gpsState, setGpsState] = useState('idle') // idle | loading | ok | error
  const [gpsMsg, setGpsMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [flyTarget, setFlyTarget] = useState(null)

  // Sync state when customer changes or modal opens
  useEffect(() => {
    if (customer) {
      const cLat = customer.lat != null ? Number(customer.lat) : null
      const cLng = customer.lng != null ? Number(customer.lng) : null
      setLat(cLat)
      setLng(cLng)
      setRawInput('')
      setParseMsg(null)
      setGpsState('idle')
      setGpsMsg('')
      setShowMap(!!(cLat && cLng))
    }
  }, [customer, isOpen])

  // Native <dialog> open/close control
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (isOpen) {
      if (!d.open) d.showModal()
    } else {
      if (d.open) d.close()
    }
  }, [isOpen])

  // Light dismiss fallback for Safari
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    const handleClick = (e) => {
      if (e.target !== d) return
      const r = d.getBoundingClientRect()
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        onClose?.()
      }
    }
    d.addEventListener('click', handleClick)
    return () => d.removeEventListener('click', handleClick)
  }, [onClose])

  // Smart Parse Handlers
  const handleParseInput = async (val) => {
    setRawInput(val)
    if (!val.trim()) {
      setParseMsg(null)
      return
    }

    setParsing(true)
    setParseMsg(null)
    try {
      const res = await smartParseCoordinates(val)
      if (res && res.lat != null && res.lng != null) {
        setLat(res.lat)
        setLng(res.lng)
        setFlyTarget([res.lat, res.lng])
        setShowMap(true)
        setParseMsg({
          type: 'success',
          text: `Koordinat terdeteksi (${res.lat.toFixed(6)}, ${res.lng.toFixed(6)})`
        })
      } else {
        setParseMsg({
          type: 'warning',
          text: 'Format koordinat / link belum dikenali. Coba paste link lengkap Google Maps.'
        })
      }
    } catch (err) {
      setParseMsg({
        type: 'error',
        text: err.message || 'Gagal membaca koordinat'
      })
    } finally {
      setParsing(false)
    }
  }

  // GPS Geolocation Handler
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
        const { latitude: gLat, longitude: gLng, accuracy } = pos.coords
        setLat(gLat)
        setLng(gLng)
        setGpsState('ok')
        setGpsMsg(`GPS Akurat ±${Math.round(accuracy)}m`)
        setFlyTarget([gLat, gLng])
        setShowMap(true)
        setParseMsg({
          type: 'success',
          text: `Lokasi GPS HP berhasil diambil (${gLat.toFixed(6)}, ${gLng.toFixed(6)})`
        })
      },
      (err) => {
        setGpsState('error')
        setGpsMsg(
          err.code === 1 ? 'Izin akses lokasi ditolak' :
          err.code === 2 ? 'Sinyal GPS tidak ditemukan' :
          'Timeout membaca GPS'
        )
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  }

  const handleMapMove = useCallback((newLat, newLng) => {
    setLat(newLat)
    setLng(newLng)
    setParseMsg({
      type: 'success',
      text: `Titik disesuaikan di peta: ${newLat.toFixed(6)}, ${newLng.toFixed(6)}`
    })
  }, [])

  // Save to Database
  const handleSave = async () => {
    if (!customer?.id) return
    if (lat == null || lng == null) {
      toast?.error('Koordinat belum ditentukan')
      return
    }

    setSaving(true)
    try {
      const updated = await api.patch(`/customers/${customer.id}`, {
        lat: parseFloat(lat),
        lng: parseFloat(lng)
      })
      toast?.success(`Titik lokasi ${customer.name} berhasil disimpan!`)
      onUpdated?.(updated || { ...customer, lat, lng })
      onClose?.()
    } catch (err) {
      toast?.error(err.message || 'Gagal menyimpan koordinat')
    } finally {
      setSaving(false)
    }
  }

  // Clear / Remove Coordinates
  const handleClear = async () => {
    if (!customer?.id) return
    if (!window.confirm(`Hapus titik koordinat pelanggan ${customer.name}?`)) return

    setSaving(true)
    try {
      const updated = await api.patch(`/customers/${customer.id}`, {
        lat: null,
        lng: null
      })
      toast?.success(`Titik koordinat ${customer.name} telah dihapus`)
      onUpdated?.(updated || { ...customer, lat: null, lng: null })
      onClose?.()
    } catch (err) {
      toast?.error(err.message || 'Gagal menghapus koordinat')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen || !customer) return null

  const currentCenter = (lat != null && lng != null) ? [lat, lng] : defaultCenter

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby="quick-tikor-title"
      className="fixed inset-0 m-auto z-[9999] p-0 bg-transparent backdrop:bg-black/75 backdrop:backdrop-blur-sm max-w-xl w-[95vw] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden text-primary"
      style={{ overscrollBehavior: 'contain' }}
    >
      <div className="bg-[var(--bg-card)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0 border border-[var(--accent)]/20">
              <MapPin size={18} />
            </div>
            <div>
              <h2 id="quick-tikor-title" className="text-sm font-bold text-primary flex items-center gap-2">
                {customer.name}
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-muted border border-[var(--border)]">
                  {customer.customerId}
                </span>
              </h2>
              <p className="text-[11px] text-muted line-clamp-1">
                {customer.address || customer.pppoeUsername ? `${customer.pppoeUsername ? `PPPoE: ${customer.pppoeUsername} • ` : ''}${customer.address || 'Alamat belum ada'}` : 'Atur koordinat pelanggan'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Smart Paste Box */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-secondary flex items-center gap-1.5">
              <Sparkles size={13} className="text-[var(--accent)]" />
              Smart Paste (Tempel Link Google Maps / Teks Koordinat)
            </label>
            <div className="relative">
              <input
                type="text"
                value={rawInput}
                onChange={(e) => handleParseInput(e.target.value)}
                placeholder="Paste link https://maps.app.goo.gl/... atau -7.5221, 112.2300"
                className="w-full px-3.5 py-2.5 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] transition-colors pr-10 font-mono"
              />
              {parsing && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--accent)]">
                  <Loader2 size={16} className="animate-spin" />
                </div>
              )}
            </div>

            {/* Parse Status Feedback */}
            {parseMsg && (
              <div className={`flex items-start gap-2 p-2.5 rounded-xl text-xs ${
                parseMsg.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : parseMsg.type === 'warning'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
                {parseMsg.type === 'success' && <CheckCircle2 size={14} className="shrink-0 mt-0.5" />}
                {parseMsg.type === 'warning' && <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                {parseMsg.type === 'error' && <AlertCircle size={14} className="shrink-0 mt-0.5" />}
                <span className="leading-tight">{parseMsg.text}</span>
              </div>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleGps}
              disabled={gpsState === 'loading'}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-glow)] text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-all disabled:opacity-50"
            >
              {gpsState === 'loading' ? <Loader2 size={13} className="animate-spin" /> : <Locate size={13} />}
              <span>{gpsState === 'loading' ? 'Membaca GPS...' : '📍 Ambil GPS HP'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowMap(!showMap)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-all ${
                showMap
                  ? 'bg-[var(--bg-secondary)] border-[var(--border)] text-primary'
                  : 'border-[var(--border)] text-secondary hover:text-primary'
              }`}
            >
              <Navigation size={13} />
              <span>{showMap ? 'Tutup Peta' : 'Buka Peta'}</span>
            </button>

            {lat != null && lng != null && (
              <a
                href={`https://www.google.com/maps?q=${lat},${lng}`}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl border border-[var(--border)] text-muted hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition-all"
                title="Buka di Google Maps"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </div>

          {/* GPS Accuracy Message */}
          {gpsMsg && (
            <div className="text-[11px] text-emerald-400 flex items-center gap-1.5 pl-1">
              <Check size={12} /> {gpsMsg}
            </div>
          )}

          {/* Mini Interactive Map */}
          {showMap && (
            <div className="rounded-xl overflow-hidden border border-[var(--border)] h-52 relative">
              <MapContainer
                center={currentCenter}
                zoom={defaultZoom}
                style={{ height: '100%', width: '100%' }}
                zoomControl={true}
              >
                <PersistentTileLayer />
                <MapClickHandler onMove={handleMapMove} />
                {flyTarget && <FlyTo target={flyTarget} />}
                {lat != null && lng != null && (
                  <DraggableMarker position={[lat, lng]} onMove={handleMapMove} />
                )}
              </MapContainer>

              <div className="absolute bottom-2 left-2 z-[1000] px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-sm text-[10px] text-white/90 font-mono pointer-events-none">
                Klik atau geser marker untuk koreksi lokasi
              </div>
            </div>
          )}

          {/* Coordinate Readout Fields */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <span className="text-[10px] font-semibold text-muted block mb-1">LATITUDE</span>
              <input
                type="number"
                step="any"
                value={lat != null ? lat : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseFloat(e.target.value)
                  setLat(val)
                }}
                placeholder="-7.522185"
                className="w-full px-3 py-2 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg font-mono text-primary focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <span className="text-[10px] font-semibold text-muted block mb-1">LONGITUDE</span>
              <input
                type="number"
                step="any"
                value={lng != null ? lng : ''}
                onChange={(e) => {
                  const val = e.target.value === '' ? null : parseFloat(e.target.value)
                  setLng(val)
                }}
                placeholder="112.230037"
                className="w-full px-3 py-2 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg font-mono text-primary focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[var(--border)] bg-[var(--bg-secondary)]/30">
          <div>
            {(customer.lat != null || customer.lng != null) && (
              <button
                type="button"
                onClick={handleClear}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-xl transition-colors disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>Hapus Titik</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--border)] text-secondary hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || lat == null || lng == null}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              <span>{saving ? 'Menyimpan...' : 'Simpan Koordinat'}</span>
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
