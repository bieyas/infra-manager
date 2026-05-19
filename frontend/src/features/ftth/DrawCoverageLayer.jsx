import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet-draw'
import 'leaflet-draw/dist/leaflet.draw.css'
import { api } from '../../lib/api'
import { X, Save, Pencil, Trash2, AlertCircle } from 'lucide-react'

// ── Palette warna untuk pilih warna zona ────────────────────────────────────
const COLORS = [
  '#06b6d4', '#3b82f6', '#8b5cf6', '#f59e0b',
  '#10b981', '#ef4444', '#f97316', '#ec4899',
]

// ── DrawControl inner (harus di dalam MapContainer) ─────────────────────────
function DrawControl({ active, onCreated }) {
  const map = useMap()
  const drawRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    if (!active) {
      drawRef.current?.disable()
      return
    }

    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    layerRef.current = drawnItems

    const draw = new L.Draw.Polygon(map, {
      shapeOptions: {
        color: '#06b6d4',
        fillColor: '#06b6d4',
        fillOpacity: 0.2,
        weight: 2,
        dashArray: '6 4',
      },
      showArea: true,
      metric: true,
    })
    drawRef.current = draw
    draw.enable()

    const handleCreated = (e) => {
      const layer = e.layer
      drawnItems.addLayer(layer)
      // Ekstrak koordinat GeoJSON [[lng,lat],...]
      const latlngs = layer.getLatLngs()[0]
      const coords = latlngs.map(ll => [ll.lng, ll.lat])
      // Tutup ring
      if (coords[0][0] !== coords[coords.length - 1][0] ||
          coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push(coords[0])
      }
      onCreated([coords]) // array of rings (GeoJSON Polygon format)
      draw.disable()
    }

    map.on(L.Draw.Event.CREATED, handleCreated)

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated)
      draw.disable()
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [active, map, onCreated])

  return null
}

// ── Form simpan zona setelah gambar ─────────────────────────────────────────
function SaveZoneForm({ coordinates, odcNodes, onSave, onCancel }) {
  const [name, setName]     = useState('')
  const [odcId, setOdcId]   = useState('')
  const [color, setColor]   = useState(COLORS[0])
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)

  const handleSave = async () => {
    if (!name.trim()) { setErr('Nama zona wajib diisi'); return }
    setSaving(true)
    setErr(null)
    try {
      const zone = await api.post('/coverage-zones', {
        name: name.trim(),
        coordinates,
        odcId: odcId || null,
        color,
        opacity: 0.2,
      })
      onSave(zone)
    } catch (e) {
      setErr(e.message || 'Gagal menyimpan')
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold text-primary">Simpan Area Coverage</p>

      {err && (
        <div className="flex items-center gap-1.5 text-[11px] text-red-400 bg-red-500/10 rounded-lg px-2 py-1.5">
          <AlertCircle size={12} /> {err}
        </div>
      )}

      <div>
        <label className="block text-[10px] text-muted mb-1">Nama zona *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="mis. Coverage ODC-01 / Kelurahan X"
          className="w-full text-[12px] px-2.5 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-primary focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      <div>
        <label className="block text-[10px] text-muted mb-1">Attach ke ODC (opsional)</label>
        <select
          value={odcId}
          onChange={e => setOdcId(e.target.value)}
          className="w-full text-[11px] px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-primary focus:outline-none focus:border-[var(--accent)] transition-colors"
        >
          <option value="">— Tidak attach ke ODC —</option>
          {odcNodes.map(n => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] text-muted mb-1.5">Warna</label>
        <div className="flex gap-1.5 flex-wrap">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className="w-6 h-6 rounded-full transition-all shrink-0"
              style={{
                background: c,
                outline: color === c ? `2px solid white` : 'none',
                outlineOffset: '2px',
                boxShadow: color === c ? `0 0 0 3px ${c}60` : 'none',
              }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-[var(--accent)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Save size={12} />
          {saving ? 'Menyimpan…' : 'Simpan'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-[11px] text-secondary hover:bg-[var(--accent-glow)] transition-colors"
        >
          Batal
        </button>
      </div>
    </div>
  )
}

// ── Panel manajemen zona yang sudah tersimpan ────────────────────────────────
function ZoneListPanel({ zones, onDelete, onClose }) {
  const [deleting, setDeleting] = useState(null)

  const handleDelete = async (id) => {
    setDeleting(id)
    try {
      await api.delete(`/coverage-zones/${id}`)
      onDelete(id)
    } catch (e) {
      console.error('Gagal hapus zona:', e)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold text-primary">Zona Tersimpan ({zones.length})</p>
        <button onClick={onClose} className="text-muted hover:text-primary transition-colors p-0.5 rounded hover:bg-[var(--accent-glow)]">
          <X size={13} />
        </button>
      </div>

      {zones.length === 0 && (
        <p className="text-[11px] text-muted text-center py-3">Belum ada zona tersimpan</p>
      )}

      <div className="space-y-1 max-h-52 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {zones.map(z => (
          <div key={z.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ background: z.color || '#06b6d4' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-primary truncate leading-tight">{z.name}</p>
              {z.odc && <p className="text-[9px] text-muted truncate">{z.odc.name}</p>}
            </div>
            <button
              onClick={() => handleDelete(z.id)}
              disabled={deleting === z.id}
              className="shrink-0 text-muted hover:text-red-400 transition-colors p-0.5 rounded hover:bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Komponen utama ────────────────────────────────────────────────────────────

/**
 * DrawCoverageLayer — floating panel + leaflet-draw untuk gambar/kelola zone
 *
 * Props:
 *  - nodes: FtthNode[] untuk daftar ODC di dropdown
 *  - zones: CoverageZone[] dari DB (state dari parent)
 *  - onZonesChange: callback(zones) setelah tambah/hapus
 */
export default function DrawCoverageLayer({ nodes = [], zones = [], onZonesChange }) {
  const [mode, setMode]               = useState('idle') // 'idle' | 'drawing' | 'saving' | 'list'
  const [drawnCoords, setDrawnCoords] = useState(null)

  const odcNodes = nodes.filter(n => n.type === 'odc')

  const handleCreated = useCallback((coords) => {
    setDrawnCoords(coords)
    setMode('saving')
  }, [])

  const handleSaved = useCallback((newZone) => {
    onZonesChange([newZone, ...zones])
    setDrawnCoords(null)
    setMode('idle')
  }, [zones, onZonesChange])

  const handleDeleted = useCallback((id) => {
    onZonesChange(zones.filter(z => z.id !== id))
  }, [zones, onZonesChange])

  const handleCancelDraw = useCallback(() => {
    setDrawnCoords(null)
    setMode('idle')
  }, [])

  return (
    <>
      {/* DrawControl harus di dalam MapContainer context */}
      <DrawControl
        active={mode === 'drawing'}
        onCreated={handleCreated}
      />

      {/* Floating panel di kanan atas — offset agar tidak tumpang tindih dengan TileLayerSwitcher */}
      <div className="absolute top-14 right-3 z-[1001] flex flex-col gap-2" style={{ maxWidth: '240px' }}>

        {/* Tombol aksi */}
        <div className="flex gap-1.5 justify-end">
          <button
            onClick={() => setMode(mode === 'drawing' ? 'idle' : 'drawing')}
            title="Gambar zona baru"
            className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all border ${
              mode === 'drawing'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-card-var text-secondary border-[var(--border)] hover:border-[var(--accent)]'
            }`}
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => setMode(mode === 'list' ? 'idle' : 'list')}
            title="Kelola zona"
            className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all border text-[10px] font-bold ${
              mode === 'list'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                : 'bg-card-var text-secondary border-[var(--border)] hover:border-[var(--accent)]'
            }`}
          >
            {zones.length}
          </button>
        </div>

        {/* Hint saat mode drawing */}
        {mode === 'drawing' && (
          <div className="bg-card-var border border-[var(--accent)] rounded-lg px-3 py-2 shadow-xl">
            <p className="text-[11px] text-primary font-medium mb-0.5">Mode Gambar Aktif</p>
            <p className="text-[10px] text-muted leading-relaxed">
              Klik di peta untuk menentukan titik polygon.<br />
              Klik ganda atau klik titik awal untuk selesai.
            </p>
            <button
              onClick={handleCancelDraw}
              className="mt-2 text-[10px] text-muted hover:text-primary transition-colors underline underline-offset-2"
            >
              Batalkan
            </button>
          </div>
        )}

        {/* Form simpan */}
        {mode === 'saving' && drawnCoords && (
          <div className="bg-card-var border border-[var(--border)] rounded-lg p-3 shadow-xl">
            <SaveZoneForm
              coordinates={drawnCoords}
              odcNodes={odcNodes}
              onSave={handleSaved}
              onCancel={handleCancelDraw}
            />
          </div>
        )}

        {/* Daftar zona */}
        {mode === 'list' && (
          <div className="bg-card-var border border-[var(--border)] rounded-lg p-3 shadow-xl">
            <ZoneListPanel
              zones={zones}
              onDelete={handleDeleted}
              onClose={() => setMode('idle')}
            />
          </div>
        )}
      </div>
    </>
  )
}
