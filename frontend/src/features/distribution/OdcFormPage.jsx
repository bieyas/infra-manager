import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, AlertCircle, MapPin, Wand2, Trash2, Zap, ChevronDown, Check } from 'lucide-react'
import Button from '../../components/ui/Button'
import LocationPickerModal from '../../components/ui/LocationPickerModal'
import ConfirmModal from '../../components/ui/ConfirmModal'
import PhotoUpload from './PhotoUpload'
import SplitterManager from './SplitterManager'
import { SPLITTER_OPTIONS, MOUNT_OPTIONS, useOdcList, useOdcDetail, useOdpList, createOdc, updateOdc, deleteOdcWithProtection, checkOdcChildren } from './useDistribution'
import { useDevices } from '../devices/useDevices'
import { useToast } from '../../context/ToastContext'
import { useAppSettings } from '../../hooks/useAppSettings'
import { suggestOdcName, getPonList } from './formHelpers'
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

function Field({ label, hint, children, required }) {
  return (
    <div>
      <label className="block text-xs font-medium text-secondary mb-1.5">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted mt-1">{hint}</p>}
    </div>
  )
}

// Custom color select with colored dots in options
function ColorSelect({ value, onChange, colors, placeholder }) {
  const [isOpen, setIsOpen] = useState(false)
  const selectedColor = colors.find(c => c.value === value)
  
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={IC + ' flex items-center justify-between text-left'}
      >
        <div className="flex items-center gap-2">
          {selectedColor && (
            <div 
              className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0"
              style={{ backgroundColor: selectedColor.color }}
            />
          )}
          <span className={selectedColor ? '' : 'text-muted'}>
            {selectedColor ? selectedColor.label : placeholder}
          </span>
        </div>
        <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg shadow-lg max-h-60 overflow-auto">
          <div className="p-1">
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm text-muted hover:bg-[var(--bg-secondary)] rounded"
            >
              {placeholder}
            </button>
            {colors.map(color => (
              <button
                key={color.value}
                type="button"
                onClick={() => { onChange(color.value); setIsOpen(false); }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--bg-secondary)] rounded flex items-center gap-2"
              >
                <div 
                  className="w-4 h-4 rounded-full border border-gray-300 flex-shrink-0"
                  style={{ backgroundColor: color.color }}
                />
                {color.label}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Close dropdown when clicking outside */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-0" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}

// Port selector for ODC uplink - shows all ports from upstream ODC, marks used ones
function PortSelect({ uplinkOdc, value, onChange, currentOdcId }) {
  const IC = 'w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]'
  
  // Generate port options based on upstream ODC cableCore
  const ports = useMemo(() => {
    if (!uplinkOdc) return []
    
    const totalCores = uplinkOdc.cableCore || uplinkOdc.cores?.length || 0
    const usedCores = uplinkOdc.cores || []
    
    return Array.from({ length: totalCores }, (_, i) => {
      const portNum = i + 1
      const usedBy = usedCores.find(c => c.core === portNum)
      return {
        value: portNum.toString(),
        label: `Core ${portNum}${usedBy ? ` (digunakan ${usedBy.odcName})` : ' (tersedia)'}`,
        disabled: usedBy && usedBy.odcId !== currentOdcId
      }
    })
  }, [uplinkOdc, currentOdcId])

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className={IC}>
      <option value="">— Pilih Core —</option>
      {ports.map(port => (
        <option key={port.value} value={port.value} disabled={port.disabled}>
          {port.label}
        </option>
      ))}
    </select>
  )
}

// Power badge color: orange > -20, green -20 to -23, red < -23
function powerColor(dbm) {
  if (dbm == null) return null
  if (dbm > -20) return { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30' }
  if (dbm >= -23) return { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30' }
  return { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30' }
}

function PortDropdown({ ports, value, onChange, disabled, placeholder, isEdit }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const selected = ports.find(p => p.id === value)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)] flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {selected ? (
          <span className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-primary truncate">{selected.label}</span>
            {selected.power != null && (() => {
              const c = powerColor(selected.power)
              return c ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${c.bg} ${c.text} ${c.border}`}>
                  {selected.power.toFixed(1)} dBm
                </span>
              ) : null
            })()}
            {selected.connectedName && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-sky-500/15 text-sky-400 border-sky-500/30">
                {selected.connectedName}
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted">{placeholder}</span>
        )}
        <ChevronDown size={14} className={`text-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-xl">
          {ports.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted">{placeholder}</div>
          ) : (
            ports.map(p => {
              const isSelected = p.id === value
              const isDisabled = p.connected && !isEdit && p.id !== value
              const pc = powerColor(p.power)
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => { onChange(p.id); setOpen(false) }}
                  className={`w-full px-3 py-2 flex items-center gap-2 text-left text-sm transition-colors
                    ${isSelected ? 'bg-[var(--accent-glow)] text-[var(--accent)]' : 'text-primary hover:bg-[var(--bg-secondary)]'}
                    ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                  `}
                >
                  <span className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    <span className="truncate">{p.label}</span>
                    {pc && p.power != null && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${pc.bg} ${pc.text} ${pc.border}`}>
                        {p.power.toFixed(1)} dBm
                      </span>
                    )}
                    {p.connectedName && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-sky-500/15 text-sky-400 border-sky-500/30">
                        {p.connectedName}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check size={14} className="text-[var(--accent)] shrink-0" />}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

const getEmptyState = (settings) => ({
  name: '', address: '', lat: '', lng: '',
  uplinkType: 'olt', // 'olt' | 'odc'
  oltId: '', ponPort: '',
  uplinkOdcId: '', uplinkCore: '',
  feederLabel: '', feederCores: '', feederCore: '', feederPass: '',
  // NEW: Multi-splitter system
  splitters: [],
  inputPower: '', fiberLength: '',
  // Port change reason
  portChangeReason: '',
  // Legacy fields
  splitterRatio: settings?.defaultOdcSplitter ?? 'R1_8',
  mountType: settings?.defaultMountType ?? '',
  brand: '', status: 'ACTIVE',
  installDate: '', pic: '', notes: '', photos: [],
})

export default function OdcFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const toast = useToast()
  const { settings } = useAppSettings()

  const { devices } = useDevices()
  const olts = useMemo(() => devices.filter(d => d.type === 'olt' || d.type === 'OLT'), [devices])
  const { odcs } = useOdcList({})
  const { odps: allOdps } = useOdpList({})
  const { odc, loading: loadingOdc } = useOdcDetail(isEdit ? id : null)

  const [form,    setForm]    = useState(() => getEmptyState(settings))
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmMode, setConfirmMode] = useState('save') // 'save' | 'delete'
  const [pendingPayload, setPendingPayload] = useState(null)
  const [connectedOdps, setConnectedOdps] = useState([])

  // Fetch ODC detail untuk mendapatkan ports (jika uplink dari ODC)
  const { odc: selectedUplinkOdc } = useOdcDetail(form.uplinkType === 'odc' ? form.uplinkOdcId : null)

  // Dapatkan available ports dari upstream
  const upstreamPorts = useMemo(() => {
    if (form.uplinkType === 'odc' && selectedUplinkOdc?.splitters) {
      const ports = []
      selectedUplinkOdc.splitters.forEach(splitter => {
        (splitter.ports || []).forEach(port => {
          if (port.connectionStatus === 'AVAILABLE' || port.connectionStatus === 'CONNECTED') {
            let connectedName = null
            let connectedType = null
            if (port.connectionStatus === 'CONNECTED') {
              connectedType = port.connectedToType
              if (port.connectedToType === 'ODC') {
                const connectedOdc = selectedUplinkOdc.downlinkOdcs?.find(odc => odc.uplinkPort === `${splitter.id}-${port.portNumber}`)
                if (connectedOdc) {
                  connectedName = connectedOdc.name
                } else {
                  const allOdcs = odcs || []
                  const connectedOdcFromList = allOdcs.find(odc => odc.uplinkPort === `${splitter.id}-${port.portNumber}`)
                  connectedName = connectedOdcFromList?.name || 'ODC'
                }
              } else if (port.connectedToType === 'ODP') {
                connectedName = 'ODP'
              }
            }
            
            ports.push({
              id: `${splitter.id}-${port.portNumber}`,
              splitterId: splitter.id,
              portNumber: port.portNumber,
              label: `${splitter.position || 'Splitter'} - Port ${port.portNumber}`,
              power: port.outputPower ?? splitter.inputPower ?? selectedUplinkOdc.inputPower,
              connected: port.connectionStatus === 'CONNECTED',
              connectedName,
              connectedType,
              connectionStatus: port.connectionStatus,
              connectedToType: port.connectedToType,
              connectedToId: port.connectedToId
            })
          }
        })
      })
      return ports
    }
    return []
  }, [form.uplinkType, selectedUplinkOdc])
  
  // Kalkulasi power input berdasarkan port yang dipilih dan panjang kabel (ODC uplink)
  useEffect(() => {
    if (!form.uplinkPort || !form.fiberLength) return
    
    const port = upstreamPorts.find(p => p.id === form.uplinkPort)
    if (!port || port.power === null || port.power === undefined) return
    
    // Loss per km: 0.35 dB/km di 1490nm
    const lossPerKm = 0.35
    const lengthKm = Number(form.fiberLength) / 1000
    const calculatedPower = port.power - (lossPerKm * lengthKm)
    
    setForm(f => ({ ...f, inputPower: calculatedPower.toFixed(2) }))
  }, [form.uplinkPort, form.fiberLength, upstreamPorts])

  // Auto-fill power input dari SFP Tx Power saat uplink = OLT + PON port dipilih
  const [sfpLoading, setSfpLoading] = useState(false)
  useEffect(() => {
    if (form.uplinkType !== 'olt' || !form.oltId || !form.ponPort) return
    // Convert PON-X → 1/1/X
    const portId = form.ponPort.replace(/^PON-/, '1/1/')
    setSfpLoading(true)
    api.get(`/driver/${form.oltId}/olt/pon-power?port=${encodeURIComponent(portId)}`)
      .then(data => {
        if (data?.txPower != null) {
          setForm(f => ({ ...f, inputPower: data.txPower.toFixed(2) }))
        }
      })
      .catch(() => { /* silently ignore — user can fill manually */ })
      .finally(() => setSfpLoading(false))
  }, [form.uplinkType, form.oltId, form.ponPort])

  // Reset form dengan default baru jika settings berubah (tambah mode)
  useEffect(() => {
    if (!isEdit) {
      setForm(f => ({ 
        ...f, 
        splitterRatio: settings?.defaultOdcSplitter ?? 'R1_8', 
        mountType: settings?.defaultMountType ?? '',
        splitters: [],
        inputPower: '',
        fiberLength: '',
      }))
    }
  }, [settings.defaultOdcSplitter, settings.defaultMountType, isEdit])

  // Derive PON list from selected OLT
  const selectedOlt = useMemo(() => {
    return olts.find(o => o.id === form.oltId) ?? null
  }, [olts, form.oltId])

  const ponList = useMemo(() => getPonList(selectedOlt), [selectedOlt])
  const existingNames = useMemo(() => odcs.filter(o => o.id !== id).map(o => o.name), [odcs, id])
  const selectedUplinkOdcForPort = useMemo(() => odcs.find(o => o.id === form.uplinkOdcId) ?? null, [odcs, form.uplinkOdcId])

  // Hitung estimasi jarak antara uplink dan ODC
  const estimatedDistance = useMemo(() => {
    if (!form.lat || !form.lng) return null
    
    let upstreamLat = null
    let upstreamLng = null
    
    if (form.uplinkType === 'olt' && selectedOlt) {
      upstreamLat = selectedOlt.lat
      upstreamLng = selectedOlt.lng
    } else if (form.uplinkType === 'odc' && selectedUplinkOdcForPort) {
      upstreamLat = selectedUplinkOdcForPort.lat
      upstreamLng = selectedUplinkOdcForPort.lng
    }
    
    if (!upstreamLat || !upstreamLng) return null
    
    const distance = calculateDistance(
      Number(upstreamLat), Number(upstreamLng),
      Number(form.lat), Number(form.lng)
    )
    
    // Tambahkan 10% overhead untuk routing jalur kabel
    return Math.round(distance * 1.1)
  }, [form.lat, form.lng, form.uplinkType, selectedOlt, selectedUplinkOdcForPort])

  const [fiberLengthManual, setFiberLengthManual] = useState(false)

  // Auto-update fiberLength jika belum diisi manual dan ada estimasi jarak
  useEffect(() => {
    if (estimatedDistance && !fiberLengthManual && !form.fiberLength) {
      set('fiberLength', estimatedDistance.toString())
    }
  }, [estimatedDistance, fiberLengthManual, form.fiberLength])

  // Check connected ODPs in edit mode
  useEffect(() => {
    if (isEdit && id) {
      checkOdcChildren(id).then(({ odps, downlinkOdcs }) => {
        setConnectedOdps([...odps, ...downlinkOdcs])
      }).catch(() => {
        setConnectedOdps([])
      })
    }
  }, [isEdit, id])

  // Load existing data (edit mode)
  useEffect(() => {
    if (isEdit && odc) {
      setForm({
        name: odc.name ?? '',
        address: odc.address ?? '',
        lat: odc.lat ?? '',
        lng: odc.lng ?? '',
        uplinkType: odc.uplinkType ?? 'olt',
        oltId: odc.oltId ?? '',
        ponPort: odc.ponPort ?? '',
        uplinkOdcId: odc.uplinkOdcId ?? '',
        uplinkCore: odc.uplinkCore ?? '',
        uplinkPort: odc.uplinkPort ?? '',
        feederLabel: odc.feederLabel ?? '',
        feederCores: odc.feederCores ?? '',
        feederCore: odc.feederCore ?? '',
        feederPass: odc.feederPass ?? '',
        splitters: odc.splitters ?? [],
        inputPower: odc.inputPower ?? '',
        fiberLength: odc.fiberLength ?? '',
        // Legacy fields
        splitterRatio: odc.splitterRatio ?? settings?.defaultOdcSplitter ?? 'R1_8',
        mountType: odc.mountType ?? settings?.defaultMountType ?? '',
        brand: odc.brand ?? '',
        status: odc.status ?? 'ACTIVE',
        installDate: odc.installDate ? odc.installDate.slice(0, 10) : '',
        pic: odc.pic ?? '',
        notes: odc.notes ?? '',
        photos: odc.photos ?? [],
      })
    }
  }, [isEdit, odc, settings])

  // Auto-fill OLT/PON from selected OLT
  const handleOltChange = (oltId) => {
    setForm(f => ({
      ...f,
      oltId,
      ponPort: '',
      uplinkPort: '',
    }))
  }

  // Handler untuk ODC uplink change
  const handleUplinkOdcChange = (odcId) => {
    const selectedOdc = odcs.find(o => o.id === odcId)
    setForm(f => ({
      ...f,
      uplinkOdcId: odcId,
      uplinkCore: '',
      uplinkPort: '',
      // Auto-fill OLT and PON from parent ODC
      oltId: selectedOdc?.oltId || '',
      ponPort: selectedOdc?.ponPort || '',
    }))
  }

  // Handler untuk uplink type change
  const handleUplinkTypeChange = (type) => {
    setForm(f => ({
      ...f,
      uplinkType: type,
      oltId: type === 'olt' ? f.oltId : '',
      uplinkOdcId: type === 'odc' ? f.uplinkOdcId : '',
      uplinkCore: '',
      uplinkPort: '',
      ponPort: '',
    }))
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async (payload) => {
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await updateOdc(id, payload)
        toast.success('ODC berhasil diperbarui')
      } else {
        await createOdc(payload)
        toast.success('ODC berhasil ditambahkan')
      }
      navigate('/odc')
    } catch (err) {
      console.error('Save ODC error:', err)
      setError(err.message || 'Gagal menyimpan ODC')
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
    oltId: form.oltId || null,
    uplinkOdcId: form.uplinkType === 'odc' ? (form.uplinkOdcId || null) : null,
    ponPort: form.ponPort || null,
    feederCores: form.feederCores !== '' ? Number(form.feederCores) : null,
    inputPower: form.inputPower !== '' ? Number(form.inputPower) : null,
    fiberLength: form.fiberLength !== '' ? Number(form.fiberLength) : null,
    installDate: form.installDate || null,
    portChangeReason: form.portChangeReason || null,
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    // Basic validation
    if (!form.name?.trim()) { setError('Nama ODC wajib diisi'); return }
    if (!form.oltId && form.uplinkType === 'olt') { setError('OLT wajib dipilih'); return }
    if (!form.uplinkOdcId && form.uplinkType === 'odc') { setError('ODC upstream wajib dipilih'); return }

    if (isEdit) {
      // Edit: tampilkan confirm modal
      setPendingPayload(buildPayload())
      setConfirmMode('save')
      setConfirmOpen(true)
    } else {
      // Tambah baru: langsung simpan tanpa confirm
      handleSave(buildPayload())
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    setSaving(true)
    try {
      await deleteOdcWithProtection(id)
      toast.success('ODC berhasil dihapus')
      navigate('/odc')
    } catch (err) {
      console.error('Delete ODC error:', err)
      setError(err.message || 'Gagal menghapus ODC')
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
    const suggested = suggestOdcName({
      oltName: selectedOlt?.name,
      ponPort: form.ponPort,
      address: form.address,
      existingNames,
    })
    if (suggested) set('name', suggested)
  }

  if (loadingOdc) {
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
            <button onClick={() => navigate('/odc')} className="text-muted hover:text-primary transition-colors">
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-lg font-semibold text-primary">
              {isEdit ? 'Edit ODC' : 'Tambah ODC'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/odc')}>
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

        {/* Connected ODPs Warning */}
        {isEdit && connectedOdps.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
            <AlertCircle size={16} />
            <span>
              ODC ini memiliki <strong>{connectedOdps.length}</strong> ODP terhubung. 
              Hapus ODP terlebih dahulu sebelum menghapus ODC.
            </span>
          </div>
        )}

        {/* Identitas */}
        <Section title="Identitas">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Nama ODC" required hint="Unik per OLT">
              <div className="flex gap-2">
                <input
                  required
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder={form.oltId ? `ODC-${selectedOlt?.name?.replace(/[^A-Z0-9]/g, '') || 'OLT'}-XX` : 'ODC-OLT-XX'}
                  className={IC + ' flex-1'}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleSuggestName} disabled={!form.oltId}>
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
          {/* Uplink Type Selection */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => handleUplinkTypeChange('olt')}
              className={`flex-1 py-2 px-4 text-sm rounded-lg border transition-colors ${
                form.uplinkType === 'olt'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-secondary)] text-muted border-[var(--border)] hover:border-[var(--accent)]'
              }`}
            >
              Dari OLT
            </button>
            <button
              type="button"
              onClick={() => handleUplinkTypeChange('odc')}
              className={`flex-1 py-2 px-4 text-sm rounded-lg border transition-colors ${
                form.uplinkType === 'odc'
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--bg-secondary)] text-muted border-[var(--border)] hover:border-[var(--accent)]'
              }`}
            >
              Dari ODC Lain
            </button>
          </div>
          
          <div className="space-y-4">
            {/* Row 1: OLT/ODC Selection + Port */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* OLT Selection */}
              {form.uplinkType === 'olt' && (
                <>
                  <Field label="OLT Sumber" required hint="Pilih OLT sumber">
                    <select value={form.oltId} onChange={e => handleOltChange(e.target.value)} className={IC}>
                      <option value="">— Pilih OLT —</option>
                      {olts.map(o => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="PON Port" hint="Pilih PON port dari OLT">
                    <select value={form.ponPort} onChange={e => set('ponPort', e.target.value)} className={IC}>
                      <option value="">— Pilih PON —</option>
                      {ponList.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              
              {/* ODC Selection */}
              {form.uplinkType === 'odc' && (
                <>
                  <Field label="ODC Sumber" required hint="Pilih ODC upstream">
                    <select value={form.uplinkOdcId} onChange={e => handleUplinkOdcChange(e.target.value)} className={IC}>
                      <option value="">— Pilih ODC —</option>
                      {odcs.filter(o => o.id !== odc?.id).map(o => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Port dari ODC" hint={upstreamPorts.length > 0 ? `${upstreamPorts.filter(p => !p.connected).length} port tersedia, ${upstreamPorts.filter(p => p.connected).length} port terpakai` : ''}>
                    <PortDropdown
                      ports={upstreamPorts}
                      value={form.uplinkPort}
                      onChange={(val) => set('uplinkPort', val)}
                      disabled={!upstreamPorts.length}
                      placeholder={!upstreamPorts.length 
                        ? (form.uplinkOdcId ? 'Memuat ports...' : 'Pilih ODC dulu')
                        : '— Pilih Port —'}
                      isEdit={isEdit}
                    />
                  </Field>
                </>
              )}
            </div>
            
            {/* Row 1.5: OLT & PON Info (Read-only for ODC uplink) */}
            {form.uplinkType === 'odc' && form.uplinkOdcId && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="OLT Induk" hint="OLT dari ODC induk (read-only)">
                  <input 
                    type="text" 
                    value={selectedUplinkOdcForPort?.olt?.name || ''} 
                    readOnly 
                    className={`${IC} bg-[var(--bg-secondary)]/50 cursor-not-allowed`}
                    placeholder="OLT induk"
                  />
                </Field>
                <Field label="PON Port Induk" hint="PON port dari ODC induk (read-only)">
                  <input 
                    type="text" 
                    value={selectedUplinkOdcForPort?.ponPort || ''} 
                    readOnly 
                    className={`${IC} bg-[var(--bg-secondary)]/50 cursor-not-allowed`}
                    placeholder="PON port induk"
                  />
                </Field>
              </div>
            )}
          </div>
          
          {/* Port Change Reason */}
          {isEdit && (form.uplinkType === 'odc' && form.uplinkPort) && (
            <div className="mt-4">
              <Field label="Alasan Perubahan Port" hint="Jelaskan mengapa port ini diubah (opsional)">
                <textarea
                  value={form.portChangeReason}
                  onChange={e => set('portChangeReason', e.target.value)}
                  className={`${IC} resize-none`}
                  rows={2}
                  placeholder="Contoh: Perubahan jalur distribusi untuk optimasi jaringan..."
                />
              </Field>
            </div>
          )}
        </Section>

        {/* Kabel Feeder */}
        <Section title="Kabel Feeder (Masuk dari Upstream)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Label Kabel">
              <input value={form.feederLabel} onChange={e => set('feederLabel', e.target.value)}
                placeholder="FO-OLT01-ODC-A" className={IC} />
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
            <Field label="Core Digunakan" hint="Pilih warna core fiber optic yang aktif ke ODC ini">
              <ColorSelect
                value={form.feederCore}
                onChange={color => set('feederCore', color)}
                colors={FIBER_COLORS}
                placeholder="— Pilih Warna —"
              />
            </Field>
            <Field label="Core Lewat" hint="Core yang lepas/continue ke ODC lain">
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
                  : 'Pilih lokasi ODC dan uplink untuk estimasi otomatis'
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
                  {sfpLoading && <Loader2 size={12} className="animate-spin text-muted" />}
                </span>
              }
              hint={
                sfpLoading
                  ? 'Mengambil SFP Tx Power dari OLT…'
                  : form.uplinkType === 'olt' && form.ponPort && form.inputPower
                  ? `Otomatis dari SFP Tx Power ${form.ponPort}`
                  : form.uplinkPort && form.fiberLength 
                  ? 'Dihitung otomatis dari port uplink + panjang kabel'
                  : form.uplinkType === 'olt'
                  ? 'Pilih PON port untuk mengambil SFP Tx Power dari OLT secara otomatis'
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
            onChange={splitters => set('splitters', splitters)}
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
                Hapus ODC
              </Button>
              <span className="text-xs text-muted">
                Menghapus ODC akan menghapus semua data ODP dan customer yang terhubung.
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
        title={confirmMode === 'delete' ? 'Hapus ODC?' : 'Konfirmasi Simpan'}
        message={confirmMode === 'delete' 
          ? 'ODC dan semua data ODP/customer yang terhubung akan dihapus permanen. Lanjutkan?'
          : 'Simpan perubahan pada ODC ini?'
        }
        confirmText={confirmMode === 'delete' ? 'Hapus' : 'Simpan'}
        cancelText="Batal"
        onConfirm={handleConfirm}
        variant={confirmMode === 'delete' ? 'danger' : 'primary'}
      />
    </div>
  )
}
