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

// ── Shared style ──────────────────────────────────────────────────────────────

const IC = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/20 transition-colors'

const STATUS_OPTIONS = [
  { value: 'ACTIVE',     label: 'Aktif',           dot: 'bg-emerald-500' },
  { value: 'SUSPENDED',  label: 'Isolir / Suspend', dot: 'bg-amber-400' },
  { value: 'TERMINATED', label: 'Berhenti',         dot: 'bg-rose-500' },
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
function OdpPortSelector({ odp, value, onChange }) {
  if (!odp) return null

  const hasSplitters = odp.splitters?.length > 0

  if (hasSplitters) {
    // ── Multi-splitter mode: render satu grup per splitter ──────────────────
    return (
      <div className="space-y-3">
        {odp.splitters.map((splitter, idx) => {
          const portCount = splitter.splitterType?.outputCount
            ?? splitter.ports?.length
            ?? 8
          const label = splitter.position
            ?? splitter.splitterType?.name
            ?? `Splitter ${idx + 1}`
          const typeName = splitter.splitterType?.name ?? ''

          // Ports yang sudah terpakai (connectedToType === 'CUSTOMER')
          const usedPortNums = new Set(
            (splitter.ports ?? [])
              .filter(p => p.connectionStatus === 'CONNECTED' || p.connectedToType === 'CUSTOMER')
              .map(p => p.portNumber)
          )

          return (
            <div key={splitter.id} className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-primary">{label}</span>
                  {typeName && (
                    <span className="text-[9px] text-[var(--accent)] bg-[var(--accent-glow)] border border-[var(--accent)]/20 px-1.5 py-0.5 rounded-full">
                      {typeName}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted">
                  {usedPortNums.size}/{portCount} terpakai
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: portCount }, (_, i) => {
                  const portNum = i + 1
                  const portKey = `${splitter.id}:${portNum}`
                  const isSelected = value === portKey
                  const isUsed = usedPortNums.has(portNum)
                  return (
                    <button
                      key={portNum}
                      type="button"
                      onClick={() => !isUsed && onChange(portKey)}
                      title={isUsed ? `Port ${portNum} — terpakai` : `Port ${portNum}`}
                      className={`w-8 h-8 rounded text-[10px] font-mono font-medium border transition-all relative ${
                        isSelected
                          ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-sm'
                          : isUsed
                          ? 'bg-rose-500/10 border-rose-500/20 text-rose-400/50 cursor-not-allowed'
                          : 'bg-[var(--bg-card)] border-[var(--border)] text-muted hover:border-[var(--accent)]/60 hover:text-primary cursor-pointer'
                      }`}
                    >
                      {portNum}
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

  // ── Legacy mode: flat port grid (tidak ada data splitter) ─────────────────
  const capacity = odp.capacity ?? odp.splitterRatio
    ? { R1_2: 2, R1_4: 4, R1_8: 8, R1_16: 16, R1_32: 32 }[odp.splitterRatio] ?? 8
    : 8
  const max = Math.max(Number(capacity) || 8, 4)
  return (
    <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted">Pilih port</span>
        <span className="text-[9px] text-muted">{odp.usedPorts ?? 0}/{max} terpakai</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: max }, (_, i) => {
          const port = i + 1
          const isSelected = String(value) === String(port)
          return (
            <button
              key={port}
              type="button"
              onClick={() => onChange(String(port))}
              className={`w-8 h-8 rounded text-[10px] font-mono font-medium border transition-all ${
                isSelected
                  ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-sm'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-muted hover:border-[var(--accent)]/60 hover:text-primary'
              }`}
            >
              {port}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Paket preset pills
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
    odpId:         searchParams.get('odpId') || '',
    odpPort:       searchParams.get('odpPort') || '',
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
          odpId:         c.odpId ?? '',
          odpPort:       c.odpPort ?? '',
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

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: null }))
  }
  const setEv = (field) => (e) => set(field, e.target.value)

  // Saat port dipilih dari OdpPortSelector (bisa berformat "splitterId:portNum")
  const handlePortSelect = (portKey) => {
    if (portKey.includes(':')) {
      const [splitterId, portNum] = portKey.split(':')
      setForm(f => ({ ...f, odpPort: portNum, splitterPortId: splitterId }))
    } else {
      setForm(f => ({ ...f, odpPort: portKey, splitterPortId: '' }))
    }
  }

  // Compute portSelectorValue dari odpPort + splitterPortId
  const portSelectorValue = form.splitterPortId
    ? `${form.splitterPortId}:${form.odpPort}`
    : form.odpPort

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

        {/* ── 2. Koneksi FTTH ── */}
        <Section title="Koneksi FTTH" icon={Cable}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="ODP" hint="Optical Distribution Point">
              <select value={form.odpId} onChange={e => { set('odpId', e.target.value); set('odpPort', ''); set('splitterPortId', '') }} className={IC}>
                <option value="">— Pilih ODP —</option>
                {odps.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.name}{o.odc?.name ? ` (${o.odc.name})` : ''}
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
          {selectedOdp && (
            <OdpPortSelector
              odp={selectedOdp}
              value={portSelectorValue}
              onChange={handlePortSelect}
            />
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
