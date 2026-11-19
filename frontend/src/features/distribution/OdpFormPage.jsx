import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertCircle, MapPin, Wand2, Trash2, Zap, ChevronDown, Check } from 'lucide-react'
import Button from '../../components/ui/Button'
import LocationPickerModal from '../../components/ui/LocationPickerModal'
import ConfirmModal from '../../components/ui/ConfirmModal'
import PhotoUpload from './PhotoUpload'
import SplitterManager from './SplitterManager'
import { SPLITTER_OPTIONS, MOUNT_OPTIONS, useOdpList, useOdpDetail, createOdp, updateOdp, deleteOdpWithProtection, checkOdpCustomers } from './useDistribution'
import { useDevices } from '../devices/useDevices'
import { useToast } from '../../context/ToastContext'
import { useAppSettings } from '../../hooks/useAppSettings'
import { suggestOdpName, getPonList } from './formHelpers'
import { api } from '../../lib/api'

const IC = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] transition-colors'

// Standar warna fiber optic (APJII/Telkom)
const FIBER_COLORS = [
  { value: 'biru', label: 'Biru', color: '#0066CC' },
  { value: 'oranye', label: 'Oranye', color: '#FF6600' },
  { value: 'hijau', label: 'Hijau', color: '#009900' },
  { value: 'coklat', label: 'Coklat', color: '#8B4513' },
  { value: 'abu-abu', label: 'Abu-Abu', color: '#808080' },
  { value: 'putih', label: 'Putih', color: '#FFFFFF' },
  { value: 'merah', label: 'Merah', color: '#CC0000' },
  { value: 'hitam', label: 'Hitam', color: '#000000' },
  { value: 'kuning', label: 'Kuning', color: '#FFD700' },
  { value: 'ungu', label: 'Ungu', color: '#800080' },
  { value: 'pink', label: 'Pink', color: '#FFB6C1' },
  { value: 'aqua', label: 'Aqua', color: '#00FFFF' }
]

// Haversine formula untuk menghitung jarak antara dua koordinat dalam meter
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000 // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

function Section({ title, children }) {
  return (
    <div className="card p-5 space-y-4">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider border-b border-[var(--border)] pb-2">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, required, hint, children }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-secondary">
        {label} {required && <span className="text-rose-400">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  )
}

function ColorSelect({ value, onChange, colors, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selectedColor = colors.find(c => c.value === value)

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`${IC} flex items-center justify-between text-left`}
      >
        <span className="flex items-center gap-2">
          {selectedColor ? (
            <>
              <span 
                className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" 
                style={{ backgroundColor: selectedColor.color }} 
              />
              <span className="text-primary">{selectedColor.label}</span>
            </>
          ) : (
            <span className="text-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>

      {open && (
        <div className="absolute z-20 w-full mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {colors.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                onChange(c.value)
                setOpen(false)
              }}
              className="w-full px-3 py-2 text-sm flex items-center justify-between hover:bg-[var(--accent-glow)]/20 transition-colors text-left"
            >
              <span className="flex items-center gap-2">
                <span 
                  className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" 
                  style={{ backgroundColor: c.color }} 
                />
                <span className="text-primary">{c.label}</span>
              </span>
              {value === c.value && <Check size={14} className="text-[var(--accent)]" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PortDropdown({ ports, value, onChange, disabled, placeholder, isEdit }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selectedPort = ports.find(p => (p.key && p.key === value) || p.number?.toString() === value?.toString())

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`${IC} flex items-center justify-between text-left ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span className="flex items-center gap-2 flex-wrap">
          {selectedPort ? (
            <>
              <span className={`w-2 h-2 rounded-full shrink-0 ${selectedPort.connected ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              <span className="text-primary font-medium">Port {selectedPort.number}</span>
              {selectedPort.splitterName && (
                <span className="text-[11px] text-muted">[{selectedPort.splitterName}]</span>
              )}
              {selectedPort.portType === 'PASS_THROUGH' && (
                <span className="text-[10px] bg-purple-500/20 text-purple-400 font-semibold px-1.5 py-0.5 rounded border border-purple-500/30">
                  PASS / Feeder Out
                </span>
              )}
              {selectedPort.portType === 'DROP' && (
                <span className="text-[10px] bg-blue-500/20 text-blue-400 font-semibold px-1.5 py-0.5 rounded border border-blue-500/30">
                  DROP / Lokal
                </span>
              )}
              {selectedPort.power !== null && selectedPort.power !== undefined && (
                <span className="text-xs text-muted">({selectedPort.power} dBm)</span>
              )}
              {selectedPort.connected && (
                <span className="text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                  Terpakai {selectedPort.connectedTo ? `(${selectedPort.connectedTo})` : ''}
                </span>
              )}
            </>
          ) : (
            <span className="text-muted">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={14} className="text-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute z-20 w-full mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {ports.map(p => {
            const isCurrentSelected = (p.key && p.key === value) || p.number?.toString() === value?.toString()
            const canSelect = !p.connected || isCurrentSelected || isEdit

            return (
              <button
                key={p.key || p.number}
                type="button"
                disabled={!canSelect}
                onClick={() => {
                  onChange(p.key || p.number.toString())
                  setOpen(false)
                }}
                className={`w-full px-3 py-2 text-sm flex items-center justify-between hover:bg-[var(--accent-glow)]/20 transition-colors text-left ${
                  !canSelect ? 'opacity-40 cursor-not-allowed bg-muted/20' : ''
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${p.connected ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                  <span className="text-primary font-medium">Port {p.number}</span>
                  {p.splitterName && (
                    <span className="text-[11px] text-muted">[{p.splitterName}]</span>
                  )}
                  {p.portType === 'PASS_THROUGH' && (
                    <span className="text-[10px] bg-purple-500/20 text-purple-400 font-semibold px-1.5 py-0.5 rounded border border-purple-500/30">
                      PASS / Feeder Out
                    </span>
                  )}
                  {p.portType === 'DROP' && (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 font-semibold px-1.5 py-0.5 rounded border border-blue-500/30">
                      DROP / Lokal
                    </span>
                  )}
                  {p.power !== null && p.power !== undefined && (
                    <span className="text-xs text-muted">({p.power} dBm)</span>
                  )}
                  {p.connected && (
                    <span className="text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">
                      {p.connectedTo ? `Terpakai (${p.connectedTo})` : 'Terpakai'}
                    </span>
                  )}
                </div>
                {isCurrentSelected && <Check size={14} className="text-[var(--accent)] shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const getEmptyState = (settings) => ({
  name: '', address: '', lat: '', lng: '',
  uplinkType: 'olt', // 'olt' | 'odp'
  oltId: '', ponPort: '',
  uplinkOdpId: '', uplinkPort: '',
  feederLabel: '', feederCores: '', feederCore: '', feederPass: '',
  splitters: [],
  inputPower: '', fiberLength: '',
  splitterRatio: settings?.defaultOdpSplitter ?? 'R1_8',
  mountType: settings?.defaultMountType ?? '',
  brand: '', status: 'ACTIVE',
  installDate: '', pic: '', notes: '', photos: [],
})

export default function OdpFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const toast = useToast()
  const { settings } = useAppSettings()

  const { devices } = useDevices()
  const olts = useMemo(() => devices.filter(d => d.type === 'olt' || d.type === 'OLT'), [devices])
  const { odps: allOdps } = useOdpList({})
  const { odp, loading: loadingOdp } = useOdpDetail(isEdit ? id : null)

  const [form,    setForm]    = useState(() => getEmptyState(settings))
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMode, setConfirmMode] = useState('save')
  const [pendingPayload, setPendingPayload] = useState(null)
  const [connectedCustomers, setConnectedCustomers] = useState([])

  // Fetch upstream ODP detail untuk port cascade
  const [selectedOdpDetail, setSelectedOdpDetail] = useState(null)
  useEffect(() => {
    if (form.uplinkType === 'odp' && form.uplinkOdpId) {
      api.get(`/odp/${form.uplinkOdpId}`).then(d => setSelectedOdpDetail(d)).catch(() => setSelectedOdpDetail(null))
    } else {
      setSelectedOdpDetail(null)
    }
  }, [form.uplinkType, form.uplinkOdpId])
  
  // Dapatkan available ports dari upstream ODP
  const upstreamPorts = useMemo(() => {
    if (form.uplinkType !== 'odp' || !selectedOdpDetail?.splitters) return []
    const ports = []
    selectedOdpDetail.splitters.forEach(splitter => {
      const sName = splitter.name || splitter.type?.name || `Splitter ${splitter.sequenceOrder ?? 1}`
      ;(splitter.ports || []).forEach(port => {
        if (port.connectionStatus === 'AVAILABLE' || port.connectionStatus === 'CONNECTED') {
          let connectedName = null
          if (port.connectionStatus === 'CONNECTED') {
            if (port.connectedToType === 'ODP') {
              const linked = allOdps.find(o => o.id === port.connectedToId)
              connectedName = linked?.name || 'ODP'
            } else if (port.connectedToType === 'CUSTOMER') {
              connectedName = 'Customer'
            }
          }
          ports.push({
            id: port.id,
            key: `${splitter.id}-${port.portNumber}`,
            number: port.portNumber,
            splitterName: sName,
            portType: port.portType, // 'DROP', 'PASS_THROUGH', 'OUTPUT'
            power: port.outputPower,
            connected: port.connectionStatus === 'CONNECTED',
            connectedTo: connectedName,
          })
        }
      })
    })
    return ports
  }, [form.uplinkType, selectedOdpDetail, allOdps])
  
  // Kalkulasi power input berdasarkan port yang dipilih dan panjang kabel
  useEffect(() => {
    if (!form.uplinkPort || !form.fiberLength) return
    
    let sourcePower = null
    if (form.uplinkType === 'odp') {
      const port = upstreamPorts.find(p => p.key === form.uplinkPort || p.number?.toString() === form.uplinkPort?.toString())
      sourcePower = port?.power
    }
    
    if (sourcePower !== null && sourcePower !== undefined) {
      const distanceKm = Number(form.fiberLength) / 1000
      const fiberLoss = distanceKm * 0.35 // 0.35 dB/km
      const connectorLoss = 0.5 // 0.5 dB connector
      const calculatedInputPower = Number(sourcePower) - fiberLoss - connectorLoss
      set('inputPower', calculatedInputPower.toFixed(2))
    }
  }, [form.uplinkPort, form.fiberLength, form.uplinkType, upstreamPorts])

  // Sync settings when available
  useEffect(() => {
    if (!isEdit && settings) {
      setForm(f => ({
        ...f,
        splitterRatio: settings.defaultOdpSplitter ?? f.splitterRatio,
        mountType: settings.defaultMountType ?? f.mountType,
        fiberLength: '',
      }))
    }
  }, [settings.defaultOdpSplitter, settings.defaultMountType, isEdit])

  const selectedOlt = useMemo(() => {
    return olts.find(o => o.id === form.oltId) ?? null
  }, [olts, form.oltId])

  const ponList = useMemo(() => getPonList(selectedOlt), [selectedOlt])
  const existingNames = useMemo(() => allOdps.filter(o => o.id !== id).map(o => o.name), [allOdps, id])

  // Hitung estimasi jarak antara uplink dan ODP
  const estimatedDistance = useMemo(() => {
    if (!form.lat || !form.lng) return null
    
    let upstreamLat = null
    let upstreamLng = null
    
    if (form.uplinkType === 'olt' && selectedOlt) {
      upstreamLat = selectedOlt.lat
      upstreamLng = selectedOlt.lng
    } else if (form.uplinkType === 'odp' && selectedOdpDetail) {
      upstreamLat = selectedOdpDetail.lat
      upstreamLng = selectedOdpDetail.lng
    }
    
    if (!upstreamLat || !upstreamLng) return null
    
    const distance = calculateDistance(
      Number(upstreamLat), Number(upstreamLng),
      Number(form.lat), Number(form.lng)
    )
    
    return Math.round(distance * 1.1)
  }, [form.lat, form.lng, form.uplinkType, selectedOlt, selectedOdpDetail])

  const [fiberLengthManual, setFiberLengthManual] = useState(false)

  // Auto-update fiberLength jika belum diisi manual dan ada estimasi jarak
  useEffect(() => {
    if (estimatedDistance && !fiberLengthManual && !form.fiberLength) {
      set('fiberLength', estimatedDistance.toString())
    }
  }, [estimatedDistance, fiberLengthManual, form.fiberLength])

  // Check connected customers in edit mode
  useEffect(() => {
    if (isEdit && id) {
      checkOdpCustomers(id).then(customers => {
        setConnectedCustomers(customers)
      }).catch(() => {
        setConnectedCustomers([])
      })
    }
  }, [isEdit, id])

  // Load existing data (edit mode)
  useEffect(() => {
    if (isEdit && odp) {
      setForm({
        name: odp.name ?? '',
        address: odp.address ?? '',
        lat: odp.lat ?? '',
        lng: odp.lng ?? '',
        uplinkType: odp.uplinkType === 'odp' ? 'odp' : 'olt',
        oltId: odp.oltId ?? '',
        ponPort: odp.ponPort ?? '',
        uplinkOdpId: odp.uplinkOdpId ?? '',
        uplinkPort: odp.uplinkPort ?? '',
        feederLabel: odp.feederLabel ?? '',
        feederCores: odp.feederCores ?? '',
        feederCore: odp.feederCore ?? '',
        feederPass: odp.feederPass ?? '',
        splitters: (odp.splitters && odp.splitters.length > 0) ? odp.splitters : (odp.splitterRatio ? [{
          id: `legacy-${Date.now()}`,
          splitterTypeId: `1:${odp.splitterRatio.replace('R1_', '')}`,
          sequenceOrder: 1,
          position: 'Slot A',
          portMappings: [],
          inputPower: odp.inputPower != null ? Number(odp.inputPower) : null,
          outputs: parseInt(odp.splitterRatio.replace('R1_', ''), 10) || 8,
          type: {
            id: `1:${odp.splitterRatio.replace('R1_', '')}`,
            code: `1:${odp.splitterRatio.replace('R1_', '')}`,
            name: `PLC 1:${odp.splitterRatio.replace('R1_', '')}`,
            category: 'SYMMETRIC',
            outputCount: parseInt(odp.splitterRatio.replace('R1_', ''), 10) || 8,
            attEqual: parseFloat((3.5 + 10 * Math.log10(parseInt(odp.splitterRatio.replace('R1_', ''), 10) || 8)).toFixed(1)),
          }
        }] : []),
        inputPower: odp.inputPower ?? '',
        fiberLength: odp.fiberLength ?? '',
        splitterRatio: odp.splitterRatio ?? settings?.defaultOdpSplitter ?? 'R1_8',
        mountType: odp.mountType ?? settings?.defaultMountType ?? '',
        brand: odp.brand ?? '',
        status: odp.status ?? 'ACTIVE',
        installDate: odp.installDate ? odp.installDate.slice(0, 10) : '',
        pic: odp.pic ?? '',
        notes: odp.notes ?? '',
        photos: odp.photos ?? [],
      })
    }
  }, [isEdit, odp, settings])

  // Handler untuk ODP uplink change (cascade)
  const handleUplinkOdpChange = (odpId) => {
    const parentOdp = allOdps.find(o => o.id === odpId)
    setForm(f => ({
      ...f,
      uplinkOdpId: odpId,
      oltId: parentOdp?.oltId ?? f.oltId,
      ponPort: parentOdp?.ponPort ?? f.ponPort,
      uplinkPort: '',
    }))
  }

  // Handler untuk uplink type change
  const handleUplinkTypeChange = (type) => {
    setForm(f => ({
      ...f,
      uplinkType: type,
      uplinkOdpId: type === 'odp' ? f.uplinkOdpId : '',
      uplinkPort: '',
      oltId: type === 'olt' ? f.oltId : '',
      ponPort: type === 'olt' ? f.ponPort : '',
    }))
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async (payload) => {
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await updateOdp(id, payload)
        toast.success('ODP berhasil diperbarui')
      } else {
        await createOdp(payload)
        toast.success('ODP berhasil ditambahkan')
      }
      navigate('/odp')
    } catch (err) {
      console.error('Save ODP error:', err)
      setError(err.message || 'Gagal menyimpan ODP')
    } finally {
      setSaving(false)
      setConfirmOpen(false)
      setPendingPayload(null)
    }
  }

  const buildPayload = () => ({
    ...form,
    lat: form.lat ? Number(form.lat) : null,
    lng: form.lng ? Number(form.lng) : null,
    uplinkType: form.uplinkType,
    uplinkOdpId: form.uplinkType === 'odp' ? (form.uplinkOdpId || null) : null,
    oltId: form.oltId || null,
    ponPort: form.ponPort || null,
    feederCores: form.feederCores !== '' ? Number(form.feederCores) : null,
    inputPower: form.inputPower !== '' ? Number(form.inputPower) : null,
    fiberLength: form.fiberLength !== '' ? Number(form.fiberLength) : null,
    installDate: form.installDate || null,
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    // Basic validation
    if (!form.name?.trim()) { setError('Nama ODP wajib diisi'); return }
    if (form.uplinkType === 'olt' && !form.oltId) { setError('OLT sumber wajib dipilih'); return }
    if (form.uplinkType === 'odp' && !form.uplinkOdpId) { setError('ODP upstream wajib dipilih'); return }

    if (isEdit) {
      setPendingPayload(buildPayload())
      setConfirmMode('save')
      setConfirmOpen(true)
    } else {
      handleSave(buildPayload())
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    setSaving(true)
    try {
      await deleteOdpWithProtection(id)
      toast.success('ODP berhasil dihapus')
      navigate('/odp')
    } catch (err) {
      console.error('Delete ODP error:', err)
      setError(err.message || 'Gagal menghapus ODP')
    } finally {
      setSaving(false)
      setConfirmOpen(false)
    }
  }

  const handleConfirm = () => {
    if (confirmMode === 'delete') {
      handleDelete()
    } else {
      if (pendingPayload) handleSave(pendingPayload)
    }
  }

  // Auto-suggest name
  const handleSuggestName = () => {
    const parentOdpName = allOdps.find(o => o.id === form.uplinkOdpId)?.name
    const suggested = suggestOdpName({
      oltName: selectedOlt?.name,
      ponPort: form.ponPort,
      uplinkOdpName: parentOdpName,
      existingNames,
    })
    if (suggested) set('name', suggested)
  }

  if (loadingOdp) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-muted" size={24} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/odp')} className="text-muted hover:text-primary transition-colors">
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-lg font-semibold text-primary">
              {isEdit ? 'Edit ODP' : 'Tambah ODP'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/odp')}>
              Batal
            </Button>
            <Button variant="primary" size="sm" onClick={handleSubmit} disabled={saving} icon={saving ? Loader2 : null}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto p-4 space-y-6">
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Connected Customers Warning */}
        {isEdit && connectedCustomers.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
            <AlertCircle size={16} />
            <span>
              ODP ini memiliki <strong>{connectedCustomers.length}</strong> customer terhubung. 
              Hapus customer terlebih dahulu sebelum menghapus ODP.
            </span>
          </div>
        )}

        {/* Identitas */}
        <Section title="Identitas">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nama ODP" required hint="Contoh: ODP-OLT01-P1-01 atau ODP-PUSAT-A">
              <div className="flex gap-2">
                <input
                  required
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="ODP-XXX-01"
                  className={IC + ' flex-1'}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleSuggestName} disabled={!form.oltId && !form.uplinkOdpId}>
                  <Wand2 size={14} />
                </Button>
              </div>
            </Field>
            <Field label="Alamat / Lokasi">
              <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="Tiang depan No.12" className={IC} />
            </Field>
            <Field label="Latitude">
              <input type="number" step="any" value={form.lat} onChange={e => set('lat', e.target.value)} placeholder="-7.2575" className={IC} />
            </Field>
            <Field label="Longitude">
              <input type="number" step="any" value={form.lng} onChange={e => set('lng', e.target.value)} placeholder="112.7521" className={IC} />
            </Field>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setMapOpen(true)} icon={MapPin} size="sm">
              Pilih dari Peta
            </Button>
          </div>
        </Section>

        {/* Upstream */}
        <Section title="Upstream">
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => handleUplinkTypeChange('olt')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg border transition-colors ${
                form.uplinkType === 'olt'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-secondary)] text-muted border-[var(--border)] hover:border-[var(--accent)]'
              }`}
            >
              Langsung dari OLT (PON)
            </button>
            <button
              type="button"
              onClick={() => handleUplinkTypeChange('odp')}
              className={`flex-1 py-2 px-4 text-sm font-medium rounded-lg border transition-colors ${
                form.uplinkType === 'odp'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-secondary)] text-muted border-[var(--border)] hover:border-[var(--accent)]'
              }`}
            >
              Dari ODP Lain (Cascade)
            </button>
          </div>
          
          <div className="space-y-4">
            {form.uplinkType === 'olt' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="OLT Sumber" required hint="Pilih OLT penyedia feed">
                  <select value={form.oltId} onChange={e => set('oltId', e.target.value)} className={IC}>
                    <option value="">— Pilih OLT —</option>
                    {olts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </Field>
                <Field label="PON Port" hint="Port PON pada OLT">
                  <select value={form.ponPort} onChange={e => set('ponPort', e.target.value)} className={IC} disabled={!form.oltId}>
                    <option value="">— Pilih PON —</option>
                    {ponList.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            
            {form.uplinkType === 'odp' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="ODP Sumber (Parent)" required hint="Pilih ODP upstream untuk cascading">
                    <select value={form.uplinkOdpId} onChange={e => handleUplinkOdpChange(e.target.value)} className={IC}>
                      <option value="">— Pilih ODP —</option>
                      {allOdps.filter(o => o.id !== odp?.id).map(o => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Port dari ODP Sumber" hint={upstreamPorts.length > 0 ? `${upstreamPorts.filter(p => !p.connected).length} port tersedia, ${upstreamPorts.filter(p => p.connected).length} terpakai` : ''}>
                    <PortDropdown
                      ports={upstreamPorts}
                      value={form.uplinkPort}
                      onChange={(val) => set('uplinkPort', val)}
                      disabled={!upstreamPorts.length}
                      placeholder={!upstreamPorts.length 
                        ? (form.uplinkOdpId ? 'Memuat ports...' : 'Pilih ODP dulu')
                        : '— Pilih Port —'}
                      isEdit={isEdit}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="OLT (Turunan)" hint="Otomatis mengikuti ODP upstream">
                    <input 
                      type="text" 
                      value={selectedOlt?.name || ''} 
                      readOnly 
                      className={IC + ' bg-muted cursor-not-allowed'}
                      placeholder="OLT akan terisi otomatis"
                    />
                  </Field>
                  <Field label="PON Port (Turunan)" hint="Otomatis mengikuti ODP upstream">
                    <input 
                      type="text" 
                      value={form.ponPort || ''} 
                      readOnly 
                      className={IC + ' bg-muted cursor-not-allowed'}
                      placeholder="PON Port akan terisi otomatis"
                    />
                  </Field>
                </div>
              </>
            )}
          </div>
        </Section>

        {/* Kabel Feeder / Distribusi */}
        <Section title="Kabel Feeder / Distribusi (Masuk dari Upstream)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Label Kabel">
              <input value={form.feederLabel} onChange={e => set('feederLabel', e.target.value)}
                placeholder="FO-OLT-ODP-01" className={IC} />
            </Field>
            <Field label="Total Core">
              <select value={form.feederCores} onChange={e => set('feederCores', e.target.value)} className={IC}>
                <option value="">— Pilih —</option>
                <option value="1">1 Core</option>
                <option value="2">2 Core</option>
                <option value="4">4 Core</option>
                <option value="8">8 Core</option>
                <option value="12">12 Core</option>
                <option value="24">24 Core</option>
              </select>
            </Field>
            <Field label="Core Digunakan" hint="Pilih warna core fiber optic yang aktif ke ODP ini">
              <ColorSelect
                value={form.feederCore}
                onChange={color => set('feederCore', color)}
                colors={FIBER_COLORS}
                placeholder="— Pilih Warna —"
              />
            </Field>
            <Field label="Core Lewat" hint="Core yang lepas/continue ke ODP lain">
              <input value={form.feederPass} onChange={e => set('feederPass', e.target.value)}
                placeholder="core-2 (oranye)" className={IC} />
            </Field>
          </div>
        </Section>
        
        {/* Power Budget */}
        <Section title="Power Budget">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field 
              label="Panjang Kabel (meter)" 
              hint={
                estimatedDistance 
                  ? `Estimasi jarak: ${estimatedDistance.toLocaleString()} meter (+10% routing overhead)`
                  : 'Pilih lokasi ODP dan uplink untuk estimasi otomatis'
              }
            >
              <input 
                type="number" 
                value={form.fiberLength} 
                onChange={e => { setFiberLengthManual(true); set('fiberLength', e.target.value) }}
                placeholder={estimatedDistance?.toString() || "500"} 
                className={IC} />
            </Field>
            <Field 
              label={
                <span className="flex items-center gap-1">
                  <Zap size={14} className="text-amber-400" />
                  Power Input (dBm)
                </span>
              }
              hint={
                form.uplinkPort && form.fiberLength 
                  ? 'Dihitung otomatis dari port uplink + panjang kabel'
                  : 'Pilih port uplink dan isi panjang kabel untuk kalkulasi otomatis'
              }
            >
              <div className="relative">
                <input 
                  type="number" 
                  step="0.01"
                  value={form.inputPower} 
                  onChange={e => set('inputPower', e.target.value)}
                  placeholder="-15.50" 
                  className={`${IC} pr-12`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">dBm</span>
              </div>
            </Field>
          </div>
        </Section>

        {/* Splitter Configuration */}
        <Section title="Konfigurasi Splitter">
          <SplitterManager
            splitters={form.splitters}
            onChange={newSplitters => {
              set('splitters', newSplitters)
              const sym = newSplitters.find(s => s.category === 'SYMMETRIC' || s.type?.category === 'SYMMETRIC')
              if (sym) {
                const count = sym.outputs || sym.type?.outputCount || 8
                set('splitterRatio', `R1_${count}`)
              }
            }}
            inputPower={form.inputPower !== '' && form.inputPower !== null ? Number(form.inputPower) : null}
            customers={odp?.customers?.length ? odp.customers : connectedCustomers}
            legacySplitterRatio={form.splitterRatio}
            onLegacyChange={ratio => set('splitterRatio', ratio)}
          />
        </Section>

        {/* Info Fisik */}
        <Section title="Info Fisik">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipe Mounting">
              <select value={form.mountType} onChange={e => set('mountType', e.target.value)} className={IC}>
                <option value="">— Pilih —</option>
                {MOUNT_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Brand">
              <input value={form.brand} onChange={e => set('brand', e.target.value)}
                placeholder="FiberHome, Huawei, …" className={IC} />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={IC}>
                <option value="ACTIVE">Aktif</option>
                <option value="INACTIVE">Nonaktif / Cadangan</option>
                <option value="MAINTENANCE">Perbaikan</option>
              </select>
            </Field>
            <Field label="Tanggal Instalasi">
              <input type="date" value={form.installDate} onChange={e => set('installDate', e.target.value)} className={IC} />
            </Field>
            <Field label="PIC / Teknisi">
              <input value={form.pic} onChange={e => set('pic', e.target.value)}
                placeholder="Nama teknisi" className={IC} />
            </Field>
          </div>
          <Field label="Catatan">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} placeholder="Catatan…" className={IC + ' resize-none'} />
          </Field>
        </Section>

        {/* Photos */}
        <Section title="Foto Dokumentasi">
          <PhotoUpload photos={form.photos} onChange={photos => set('photos', photos)} />
        </Section>

        {/* Actions */}
        {isEdit && (
          <Section title="Actions">
            <div className="flex items-center gap-4">
              <Button type="button" variant="danger" icon={Trash2} onClick={() => { setConfirmMode('delete'); setConfirmOpen(true) }} disabled={saving}>
                Hapus ODP
              </Button>
              <span className="text-xs text-muted">
                Menghapus ODP akan menghapus semua data customer yang terhubung.
              </span>
            </div>
          </Section>
        )}
      </form>

      {/* Modals */}
      {mapOpen && (
        <LocationPickerModal
          lat={form.lat || '-7.5189537'}
          lng={form.lng || '112.2325999'}
          onConfirm={({lat, lng, address}) => {
            set('lat', lat)
            set('lng', lng)
            if (address) {
              set('address', address)
            }
            setMapOpen(false)
          }}
          onPositionChange={({lat, lng}) => {
            set('lat', lat)
            set('lng', lng)
          }}
          onAddressResolved={(address) => {
            if (address) {
              set('address', address)
            }
          }}
          onClose={() => setMapOpen(false)}
        />
      )}

      <ConfirmModal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={confirmMode === 'delete' ? 'Hapus ODP?' : 'Konfirmasi Simpan'}
        message={confirmMode === 'delete' 
          ? 'ODP dan semua data customer yang terhubung akan dihapus permanen. Lanjutkan?'
          : 'Simpan perubahan pada ODP ini?'
        }
        confirmText={confirmMode === 'delete' ? 'Hapus' : 'Simpan'}
        cancelText="Batal"
        onConfirm={handleConfirm}
        variant={confirmMode === 'delete' ? 'danger' : 'primary'}
      />
    </div>
  )
}
