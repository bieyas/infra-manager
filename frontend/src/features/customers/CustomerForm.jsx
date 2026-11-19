import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Save, Loader2, ArrowLeft, User, Wifi, Package,
  MapPin, AlertCircle, Phone, Calendar, Cable,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useToast } from '../../context/ToastContext'
import Button from '../../components/ui/Button'
import LocationPickerModal from '../../components/ui/LocationPickerModal'
import { MapSettingsProvider } from '../../context/MapSettingsContext'
import { capacityFromRatio } from '../distribution/useDistribution'

// ── Shared style ──────────────────────────────────────────────────────────────

const IC = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors'

const STATUS_OPTIONS = [
  { value: 'ACTIVE',     label: 'Aktif',           dot: 'bg-emerald-500' },
  { value: 'SUSPENDED',  label: 'Isolir / Suspend', dot: 'bg-amber-400' },
  { value: 'TERMINATED', label: 'Putus Berlangganan', dot: 'bg-rose-500' },
]

const PACKAGE_PRESETS = ['5 Mbps Shared', '10 Mbps Shared', '15 Mbps Shared', '20 Mbps Shared', '30 Mbps Shared', '50 Mbps Shared']

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }) {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
        <div className="w-6 h-6 rounded-md bg-[var(--accent-glow)] flex items-center justify-center">
          <Icon size={12} className="text-[var(--accent)]" />
        </div>
        <p className="text-xs font-semibold text-primary uppercase tracking-wider">{title}</p>
      </div>
      {children}
    </div>
  )
}

function Field({ label, hint, required, error, children }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-secondary">
        {label}
        {required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
      {error  && <p className="text-[10px] text-rose-400 flex items-center gap-1"><AlertCircle size={9} />{error}</p>}
      {hint && !error && <p className="text-[10px] text-muted">{hint}</p>}
    </div>
  )
}

// Status selector — pill buttons
function StatusSelector({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {STATUS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
            value === opt.value
              ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]'
              : 'border-[var(--border)] bg-[var(--bg-secondary)] text-muted hover:border-[var(--accent)]/50'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ODP port selector — per-splitter grouped grid
// value format: "splitterId:portNum" (multi-splitter) atau "portNum" (legacy)
// ODP port selector ? per-splitter grouped grid
function OdpPortSelector({ odp, value, onChange, currentCustomerId }) {
  if (!odp) return null

  const hasSplitters = odp.splitters?.length > 0

  if (hasSplitters) {
    return (
      <div className="space-y-3">
        {odp.splitters.map((splitter, idx) => {
          const portCount = splitter.ports?.length ?? splitter.splitterType?.outputCount ?? 8
          const label = splitter.position ?? splitter.splitterType?.name ?? `Splitter ${idx + 1}`
          const typeName = splitter.splitterType?.name ?? ""
          const isAsym = splitter.splitterType?.category === "ASYMMETRIC"
          const ports = splitter.ports || []

          return (
            <div key={splitter.id} className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-primary">{label}</span>
                  {typeName && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                      isAsym ? "bg-purple-500/10 text-purple-400 border-purple-500/30" : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                    }`}>
                      {typeName}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted">
                  {ports.filter(p => p.connectionStatus === "CONNECTED").length}/{portCount} terpakai
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ports.map((port) => {
                  const portNum = port.portNumber
                  const isSplitterUplink = port.connectedToType === 'SPLITTER'
                  const cust = (odp.customers || []).find(c => 
                    c.splitterPortId === port.id || 
                    port.connectedToId === c.id ||
                    (String(c.odpPort) === String(portNum) && (!c.splitterPortId || c.splitterPortId === splitter.id))
                  )
                  const childOdp = (odp.downlinkOdps || []).find(d => 
                    port.connectedToId === d.id ||
                    d.uplinkPort === port.id ||
                    d.uplinkPort === `${splitter.id}-${portNum}` || 
                    d.uplinkPort === `${splitter.id}:${portNum}` || 
                    d.uplinkPort === String(portNum)
                  )
                  const isCurrentCustomer = currentCustomerId && (cust?.id === currentCustomerId || port.connectedToId === currentCustomerId)
                  const isOdpDownlink = !!childOdp || (port.connectionStatus === "CONNECTED" && port.connectedToType === "ODP")
                  const isCustConnected = (!isCurrentCustomer && (!!cust || (port.connectionStatus === "CONNECTED" && port.connectedToType === "CUSTOMER")))
                  const isPass = port.portType === "PASS_THROUGH"
                  const isOccupied = (!isCurrentCustomer && (isCustConnected || isOdpDownlink || isSplitterUplink || port.connectionStatus === "CONNECTED")) || isPass || isSplitterUplink
                  const isSelected = value === port.id || (value === String(portNum) && (!isAsym || !port.splitterInstanceId))

                  return (
                    <button
                      key={port.id || portNum}
                      type="button"
                      disabled={isOccupied}
                      onClick={() => !isOccupied && onChange(port.id, portNum)}
                      title={
                        isSplitterUplink
                          ? `Port ${portNum} (Drop) — Spliced internal ke Splitter Slot B (tidak untuk pelanggan)`
                          : isCurrentCustomer
                          ? `Port ${portNum} — Port pelanggan saat ini`
                          : cust
                          ? `Port ${portNum} — Terpakai (${cust.name})`
                          : isCustConnected
                          ? `Port ${portNum} — Terpakai (Pelanggan)`
                          : childOdp
                          ? `Port ${portNum} — Terpakai (Feeder ODP ${childOdp.name})`
                          : isOdpDownlink
                          ? `Port ${portNum} — Terpakai (Feeder ODP)`
                          : isPass
                          ? `Port ${portNum} (Pass) — Feeder Out (tidak untuk pelanggan)`
                          : `Port ${portNum} (Tersedia)`
                      }
                      className={`w-9 h-9 rounded-lg text-xs font-mono font-medium border transition-all relative flex flex-col items-center justify-center ${
                        isSelected
                          ? "bg-[var(--accent)] border-[var(--accent)] text-white shadow-md font-bold"
                          : isCurrentCustomer
                          ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 font-bold"
                          : isSplitterUplink
                          ? "bg-sky-500/10 border-sky-500/20 text-sky-400/50 cursor-not-allowed"
                          : isPass
                          ? "bg-purple-500/5 border-purple-500/20 text-purple-300/40 cursor-not-allowed"
                          : isOdpDownlink
                          ? "bg-purple-500/15 border-purple-500/30 text-purple-400 cursor-not-allowed"
                          : isCustConnected
                          ? "bg-rose-500/10 border-rose-500/20 text-rose-400/60 cursor-not-allowed"
                          : "bg-[var(--bg-card)] border-[var(--border)] text-primary hover:border-[var(--accent)]/60 hover:text-[var(--accent)] cursor-pointer"
                      }`}
                    >
                      <span>{portNum}</span>
                      {isSplitterUplink ? (
                        <span className="text-[6.5px] leading-none text-sky-300">SPLICE</span>
                      ) : isPass && (
                        <span className="text-[7px] leading-none text-purple-300">PASS</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // ?? Legacy mode: flat port grid (tidak ada data splitter di DB) ????????????
  const capacity = odp.capacity || capacityFromRatio(odp.splitterRatio) || 8
  const max = Math.max(Number(capacity) || 8, 2)
  const usedCount = odp.usedPorts ?? (odp.customers?.length || 0)

  return (
    <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-primary">Port Splitter (1:{max})</span>
        <span className="text-[10px] text-muted">{usedCount}/{max} terpakai</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: max }, (_, i) => {
          const port = i + 1
          const cust = (odp.customers || []).find(c => String(c.odpPort) === String(port))
          const childOdp = (odp.downlinkOdps || []).find(d => d.uplinkPort === String(port))
          const isCurrentCustomer = currentCustomerId && cust && cust.id === currentCustomerId
          const isOccupied = !isCurrentCustomer && (cust || childOdp)
          const isSelected = String(value) === String(port)

          return (
            <button
              key={port}
              type="button"
              disabled={isOccupied}
              onClick={() => !isOccupied && onChange("", port)}
              title={
                isCurrentCustomer
                  ? `Port ${port} ? Port pelanggan saat ini`
                  : cust
                  ? `Port ${port} ? Terpakai (${cust.name})`
                  : childOdp
                  ? `Port ${port} ? Terpakai (Feeder ODP ${childOdp.name})`
                  : `Port ${port} (Tersedia)`
              }
              className={`w-9 h-9 rounded-lg text-xs font-mono font-medium border transition-all relative flex items-center justify-center ${
                isSelected
                  ? "bg-[var(--accent)] border-[var(--accent)] text-white shadow-md font-bold"
                  : isCurrentCustomer
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 font-bold"
                  : childOdp
                  ? "bg-purple-500/15 border-purple-500/30 text-purple-400 cursor-not-allowed"
                  : cust
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-400/60 cursor-not-allowed"
                  : "bg-[var(--bg-card)] border-[var(--border)] text-primary hover:border-[var(--accent)]/60 hover:text-[var(--accent)] cursor-pointer"
              }`}
            >
              {port}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3 pt-1 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-[var(--accent)]" /> Terpilih
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-rose-500/30 border border-rose-500/50" /> Terpakai
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded bg-[var(--bg-card)] border border-[var(--border)]" /> Tersedia
        </span>
      </div>
    </div>
  )
}

function PackagePresets({ onSelect }) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {PACKAGE_PRESETS.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className="px-2 py-0.5 rounded-md text-[10px] border border-[var(--border)] bg-[var(--bg-secondary)] text-muted hover:border-[var(--accent)]/50 hover:text-primary transition-colors"
        >
          {p}
        </button>
      ))}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CustomerForm() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate   = useNavigate()
  const toast      = useToast()
  const isEdit     = !!id

  const [saving,  setSaving]  = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [error,   setError]   = useState('')
  const [odps,    setOdps]    = useState([])
  const [errors,  setErrors]  = useState({})
  const [mapOpen, setMapOpen] = useState(false)

  const [form, setForm] = useState({
    customerId:    '',
    name:          '',
    phone:         '',
    address:       '',
    lat:           '',
    lng:           '',
    distributionType: searchParams.get('htbBoxId') ? 'HTB' : 'ODP',
    odpId:         searchParams.get('odpId') || '',
    odpPort:       searchParams.get('odpPort') || '',
    htbBoxId:      searchParams.get('htbBoxId') || '',
    htbPortId:     searchParams.get('htbPortId') || '',
    cpeType:       'ROUTER_WIFI',
    onuSn:         '',
    onuIndex:      '',
    packageName:   '',
    packageSpeed:  '',
    vlan:          '',
    ipAddress:     '',
    pppoeUsername: '',
    installerName: '',
    installDate:   '',
    contractExpiry:'',
    serviceStatus: 'ACTIVE',
    notes:         '',
  })

  // Load ODP list
  useEffect(() => {
    api.get('/odp?limit=500')
      .then(data => setOdps(Array.isArray(data) ? data : (data.data ?? [])))
      .catch(() => {})
  }, [])

  // Load existing data (edit mode)
  useEffect(() => {
    if (!isEdit) return
    api.get(`/customers/${id}`)
      .then(c => {
        setForm({
          customerId:    c.customerId ?? '',
          name:          c.name ?? '',
          phone:         c.phone ?? '',
          address:       c.address ?? '',
          lat:           c.lat ?? '',
          lng:           c.lng ?? '',
          distributionType: c.distributionType ?? (c.htbBoxId ? 'HTB' : 'ODP'),
          odpId:         c.odpId ?? '',
          odpPort:       c.odpPort ?? '',
          htbBoxId:      c.htbBoxId ?? '',
          htbPortId:     c.htbPortId ?? '',
          cpeType:       c.cpeType ?? 'ROUTER_WIFI',
          onuSn:         c.onuSn ?? '',
          onuIndex:      c.onuIndex ?? '',
          packageName:   c.packageName ?? '',
          packageSpeed:  c.packageSpeed ?? '',
          vlan:          c.vlan ?? '',
          ipAddress:     c.ipAddress ?? '',
          pppoeUsername: c.pppoeUsername ?? '',
          installerName: c.installerName ?? '',
          installDate:   c.installDate ? c.installDate.slice(0, 10) : '',
          contractExpiry: c.contractExpiry ? c.contractExpiry.slice(0, 10) : '',
          serviceStatus: c.serviceStatus ?? 'ACTIVE',
          notes:         c.notes ?? '',
        })
      })
      .catch(e => {
        toast.error(e.message || 'Gagal memuat data customer')
        navigate('/customers')
      })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // Auto-fill packageSpeed dari packageName
  useEffect(() => {
    if (!form.packageName) return
    const m = form.packageName.match(/^(\d+)/)
    if (m && !form.packageSpeed) {
      setForm(f => ({ ...f, packageSpeed: m[1] }))
    }
  }, [form.packageName]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedOdp = useMemo(() => odps.find(o => o.id === form.odpId) ?? null, [odps, form.odpId])
  const [selectedOdpDetail, setSelectedOdpDetail] = useState(null)
  const [htbBoxes, setHtbBoxes] = useState([])
  const [selectedHtbBoxDetail, setSelectedHtbBoxDetail] = useState(null)

  useEffect(() => {
    api.get('/htb-boxes')
      .then(res => setHtbBoxes(res || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!form.htbBoxId) {
      setSelectedHtbBoxDetail(null)
      return
    }
    api.get(`/htb-boxes/${form.htbBoxId}`)
      .then(res => setSelectedHtbBoxDetail(res))
      .catch(() => setSelectedHtbBoxDetail(null))
  }, [form.htbBoxId])

  // Fetch live detail ODP saat form.odpId berubah
  useEffect(() => {
    if (!form.odpId) {
      setSelectedOdpDetail(null)
      return
    }
    api.get(`/odp/${form.odpId}`)
      .then(data => setSelectedOdpDetail(data))
      .catch(() => setSelectedOdpDetail(null))
  }, [form.odpId])

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
  }
  const setEv = (field) => (e) => set(field, e.target.value)

  // Saat port dipilih dari OdpPortSelector
  const handlePortSelect = (splitterPortId, portNum) => {
    setForm(f => ({
      ...f,
      odpPort: String(portNum),
      splitterPortId: splitterPortId || ''
    }))
  }

  const portSelectorValue = form.splitterPortId || form.odpPort

  const validate = () => {
    const errs = {}
    if (!form.customerId.trim()) errs.customerId = 'Wajib diisi'
    if (!form.name.trim())       errs.name       = 'Wajib diisi'
    if (form.lat && isNaN(parseFloat(form.lat))) errs.lat = 'Format tidak valid'
    if (form.lng && isNaN(parseFloat(form.lng))) errs.lng = 'Format tidak valid'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setError('')
    setSaving(true)
    try {
      if (isEdit) {
        await api.patch(`/customers/${id}`, form)
        toast.success('Data pelanggan berhasil diupdate')
      } else {
        await api.post('/customers', form)
        toast.success('Pelanggan berhasil ditambahkan')
      }
      navigate('/customers')
    } catch (e) {
      setError(e.message || 'Gagal menyimpan data')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">

      {/* ── Sticky Header ── */}
      <div className="bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/customers')}
              className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors shrink-0"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-primary leading-tight">
                {isEdit ? 'Edit Pelanggan' : 'Tambah Pelanggan'}
              </h1>
              {form.name && (
                <p className="text-[10px] text-muted truncate">{form.name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" type="button" onClick={() => navigate('/customers')}>
              Batal
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              form="customer-form"
              disabled={saving}
              loading={saving}
              icon={saving ? undefined : Save}
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Form Body ── */}
      <form id="customer-form" onSubmit={handleSubmit} className="max-w-3xl mx-auto p-4 space-y-4">

        {/* Global error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* ── 1. Identitas ── */}
        <Section title="Identitas Pelanggan" icon={User}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="ID Pelanggan" required hint="Nomor unik dari sistem billing" error={errors.customerId}>
              <input
                value={form.customerId}
                onChange={setEv('customerId')}
                placeholder="mis. 02400612"
                className={IC + (errors.customerId ? ' border-rose-500/60' : '')}
              />
            </Field>
            <Field label="Nama Lengkap" required error={errors.name}>
              <input
                value={form.name}
                onChange={setEv('name')}
                placeholder="Nama pelanggan"
                className={IC + (errors.name ? ' border-rose-500/60' : '')}
              />
            </Field>
          </div>

          <Field label="No. Telepon / HP" hint="Nomor yang bisa dihubungi">
            <div className="relative">
              <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="tel"
                value={form.phone}
                onChange={setEv('phone')}
                placeholder="08xx-xxxx-xxxx"
                className={IC + ' pl-9'}
              />
            </div>
          </Field>

          <Field label="Status Layanan">
            <StatusSelector value={form.serviceStatus} onChange={v => set('serviceStatus', v)} />
          </Field>

          <Field label="Alamat" hint="Alamat pemasangan lengkap">
            <textarea
              rows={2}
              value={form.address}
              onChange={setEv('address')}
              placeholder="Jl. Nama Jalan No.X, RT/RW, Kelurahan, Kecamatan"
              className={IC + ' resize-none'}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Latitude" hint="Koordinat GPS" error={errors.lat}>
              <input
                type="number" step="any"
                value={form.lat}
                onChange={setEv('lat')}
                placeholder="-7.5221852"
                className={IC + ' font-mono' + (errors.lat ? ' border-rose-500/60' : '')}
              />
            </Field>
            <Field label="Longitude" error={errors.lng}>
              <input
                type="number" step="any"
                value={form.lng}
                onChange={setEv('lng')}
                placeholder="112.2300377"
                className={IC + ' font-mono' + (errors.lng ? ' border-rose-500/60' : '')}
              />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" variant="outline" size="sm" icon={MapPin} onClick={() => setMapOpen(true)}>
              Pilih dari Peta
            </Button>
            {form.lat && form.lng && (
              <a
                href={`https://www.google.com/maps?q=${form.lat},${form.lng}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
              >
                <MapPin size={9} /> {parseFloat(form.lat).toFixed(6)}, {parseFloat(form.lng).toFixed(6)}
              </a>
            )}
          </div>
        </Section>

        {/* ── 2. Koneksi Distribusi (ODP / HTB) ── */}
        <Section title="Koneksi Distribusi" icon={Cable}>
          {/* Toggle Jenis Jalur Distribusi */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-[var(--muted-foreground)]">
              Jenis Jalur Distribusi
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => set('distributionType', 'ODP')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  form.distributionType !== 'HTB'
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-primary ring-1 ring-[var(--accent)]'
                    : 'border-[var(--border)] text-muted hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <span className="font-semibold text-xs block">Jalur PON (ODP / OLT)</span>
                <span className="text-[10px] text-muted">Passive Optical Splitter (ONU)</span>
              </button>

              <button
                type="button"
                onClick={() => set('distributionType', 'HTB')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  form.distributionType === 'HTB'
                    ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-400'
                    : 'border-[var(--border)] text-muted hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <span className="font-semibold text-xs block text-cyan-400">Jalur Non-OLT (Box HTB)</span>
                <span className="text-[10px] text-muted">Active Switch FO / Media Converter</span>
              </button>
            </div>
          </div>

          {/* JALUR HTB FORM */}
          {form.distributionType === 'HTB' ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Box HTB" hint="Pilih Kotak Distribusi Switch FO / Media Converter">
                  <select
                    value={form.htbBoxId}
                    onChange={e => {
                      set('htbBoxId', e.target.value)
                      set('htbPortId', '')
                    }}
                    className={IC}
                  >
                    <option value="">— Pilih Box HTB —</option>
                    {htbBoxes.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.modelType} • {b.address || 'Tiang'})
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Tipe Perangkat CPE di Pelanggan" hint="Perangkat penerima di rumah pelanggan">
                  <select
                    value={form.cpeType}
                    onChange={setEv('cpeType')}
                    className={IC}
                  >
                    <option value="ROUTER_WIFI">Router WiFi Standar (Drop Kabel UTP LAN)</option>
                    <option value="HTB_SINGLE">Single HTB + Router WiFi (Drop Kabel FO)</option>
                    <option value="ONU">ONU / ONT</option>
                    <option value="DIRECT_PC">Direct PC / Switch Kantor</option>
                  </select>
                </Field>
              </div>

              {/* HTB Port Selector */}
              {selectedHtbBoxDetail && (
                <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-primary">
                      Pilih Port Terminasi pada Box {selectedHtbBoxDetail.name}:
                    </span>
                    <span className="text-[10px] text-muted font-mono">
                      {selectedHtbBoxDetail.ports?.length || 0} Total Port
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                    {selectedHtbBoxDetail.ports?.map(p => {
                      const isSelected = form.htbPortId === p.id
                      const isOccupiedByOther = (p.customers?.length > 0 && p.customers[0].id !== id) || p.role === 'UPLINK' || p.role === 'CASCADE'
                      const isFO = p.portType === 'FO'
                      const isWdmB = p.wavelength === '1550'

                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={isOccupiedByOther}
                          onClick={() => set('htbPortId', p.id)}
                          className={`p-2.5 rounded-lg border text-left transition-all text-xs flex flex-col justify-between ${
                            isSelected
                              ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-primary ring-2 ring-[var(--accent)]'
                              : isOccupiedByOther
                                ? 'border-[var(--border)] bg-[var(--bg-card)] opacity-40 cursor-not-allowed text-muted'
                                : 'border-[var(--border)] bg-[var(--bg-card)] hover:border-cyan-400 text-primary'
                          }`}
                        >
                          <div className="flex justify-between items-center w-full mb-1">
                            <span className="font-mono font-bold">{p.label}</span>
                            <span className="text-[9px] font-mono px-1 rounded bg-[var(--border)] text-muted">
                              {isFO ? (isWdmB ? '1550' : '1310') : 'RJ45'}
                            </span>
                          </div>

                          <div className="text-[10px] truncate text-muted">
                            {isOccupiedByOther ? (
                              p.role === 'UPLINK' ? 'Uplink In' : p.role === 'CASCADE' ? 'Estafet' : (p.customers?.[0]?.name || 'Terpakai')
                            ) : isSelected ? (
                              '✓ Terpilih'
                            ) : (
                              'Tersedia'
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* JALUR PON (ODP) FORM */
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="ODP" hint="Optical Distribution Point">
                  <select value={form.odpId} onChange={e => { set('odpId', e.target.value); set('odpPort', ''); set('splitterPortId', '') }} className={IC}>
                    <option value="">— Pilih ODP —</option>
                    {odps.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </Field>
                {(!selectedOdp || !selectedOdp.splitters?.length) && (
                  <Field label="Port ODP" hint={selectedOdp ? `Kapasitas ${selectedOdp.capacity ?? '?'} port` : 'Pilih ODP dulu'}>
                    <input
                      type="number" min="1" max="64"
                      value={form.odpPort}
                      onChange={setEv('odpPort')}
                      placeholder="Nomor port"
                      className={IC + ' font-mono'}
                      disabled={!form.odpId}
                    />
                  </Field>
                )}
              </div>

              {/* Port visual selector */}
              {(selectedOdpDetail || selectedOdp) && (
                <OdpPortSelector
                  odp={selectedOdpDetail || selectedOdp}
                  value={portSelectorValue}
                  onChange={handlePortSelect}
                  currentCustomerId={isEdit ? id : null}
                />
              )}
            </>
          )}
        </Section>

        {/* ── 3. Paket Layanan ── */}
        <Section title="Paket Layanan" icon={Package}>
          <Field label="Nama Paket">
            <input
              value={form.packageName}
              onChange={setEv('packageName')}
              placeholder="mis. 15 Mbps Shared"
              className={IC}
            />
            <PackagePresets onSelect={v => {
              set('packageName', v)
              const m = v.match(/^(\d+)/)
              if (m) set('packageSpeed', m[1])
            }} />
          </Field>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Kecepatan (Mbps)">
              <input
                type="number" min="1"
                value={form.packageSpeed}
                onChange={setEv('packageSpeed')}
                placeholder="10"
                className={IC + ' font-mono'}
              />
            </Field>
            <Field label="VLAN ID">
              <input
                type="number"
                value={form.vlan}
                onChange={setEv('vlan')}
                placeholder="100"
                className={IC + ' font-mono'}
              />
            </Field>
            <Field label="IP Address" hint="">
              <input
                value={form.ipAddress}
                onChange={setEv('ipAddress')}
                placeholder="192.168.x.x"
                className={IC + ' font-mono'}
              />
            </Field>
            <Field label="PPPoE Username">
              <input
                value={form.pppoeUsername}
                onChange={setEv('pppoeUsername')}
                placeholder="user@domain"
                className={IC + ' font-mono'}
              />
            </Field>
          </div>
        </Section>

        {/* ── 4. ONU / Perangkat ── */}
        <Section title="ONU & Perangkat" icon={Wifi}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Serial Number ONU" hint="Format: HWTC/ZTEG + 8 karakter hex">
              <input
                value={form.onuSn}
                onChange={setEv('onuSn')}
                placeholder="HWTC12345678"
                className={IC + ' font-mono tracking-wider'}
              />
            </Field>
            <Field label="ONU Index" hint="Posisi di OLT, mis. 0/1/0:5">
              <input
                value={form.onuIndex}
                onChange={setEv('onuIndex')}
                placeholder="0/1/0:5"
                className={IC + ' font-mono'}
              />
            </Field>
          </div>
        </Section>

        {/* ── 5. Instalasi ── */}
        <Section title="Data Instalasi" icon={Calendar}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Nama Teknisi">
              <input
                value={form.installerName}
                onChange={setEv('installerName')}
                placeholder="Nama teknisi"
                className={IC}
              />
            </Field>
            <Field label="Tanggal Pasang">
              <input
                type="date"
                value={form.installDate}
                onChange={setEv('installDate')}
                className={IC}
              />
            </Field>
            <Field label="Kontrak Berlaku Sampai">
              <input
                type="date"
                value={form.contractExpiry}
                onChange={setEv('contractExpiry')}
                className={IC}
              />
            </Field>
          </div>

          <Field label="Catatan" hint="Info tambahan, nomor HP, keterangan khusus, dll.">
            <textarea
              rows={3}
              value={form.notes}
              onChange={setEv('notes')}
              placeholder="Nomor HP: 08xx..., catatan pemasangan, dll."
              className={IC + ' resize-none'}
            />
          </Field>
        </Section>

        {/* ── Bottom actions (mobile-friendly duplicate) ── */}
        <div className="flex gap-2 justify-end pb-6">
          <Button variant="outline" type="button" onClick={() => navigate('/customers')}>
            Batal
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={saving}
            loading={saving}
            icon={saving ? undefined : Save}
          >
            {saving ? 'Menyimpan…' : (isEdit ? 'Simpan Perubahan' : 'Tambah Pelanggan')}
          </Button>
        </div>
      </form>

      {/* ── Location Picker Modal ── */}
      {mapOpen && (
        <MapSettingsProvider>
          <LocationPickerModal
            lat={form.lat ? parseFloat(form.lat) : null}
            lng={form.lng ? parseFloat(form.lng) : null}
            onConfirm={({ lat, lng, address }) => {
              set('lat', lat)
              set('lng', lng)
              if (address && !form.address) set('address', address)
              setMapOpen(false)
            }}
            onClose={() => setMapOpen(false)}
          />
        </MapSettingsProvider>
      )}
    </div>
  )
}
