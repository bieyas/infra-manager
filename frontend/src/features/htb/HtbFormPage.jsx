import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Loader2, AlertCircle, MapPin, Box, Zap, Network,
  Plus,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import LocationPickerModal from '../../components/ui/LocationPickerModal'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'
import { useHtbDetail } from './useHtb'

const IC = 'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] transition-colors'

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

const PRESETS = [
  {
    type: 'SWITCH_3FO_2LAN',
    variant: 'ABB',
    title: 'Switch 3 FO (ABB) + 2 LAN',
    desc: '1 FO A (1310) Uplink + 2 FO B (1550) + 2 LAN',
    portsSummary: '3 FO • 2 LAN',
  },
  {
    type: 'SWITCH_3FO_2LAN',
    variant: 'AAB',
    title: 'Switch 3 FO (AAB) + 2 LAN',
    desc: '2 FO A (1310) + 1 FO B (1550) + 2 LAN',
    portsSummary: '3 FO • 2 LAN',
  },
  {
    type: 'SWITCH_6FO_2LAN',
    variant: 'AAABBB',
    title: 'Switch 6 FO (AAABBB) + 2 LAN',
    desc: '3 FO A (1310) + 3 FO B (1550) + 2 LAN Konsentrator',
    portsSummary: '6 FO • 2 LAN',
  },
  {
    type: 'SINGLE_1FO_1LAN',
    variant: 'A',
    title: 'Single HTB (Side A)',
    desc: '1 FO A (1310) + 1 LAN (Untuk Pelanggan / PTP)',
    portsSummary: '1 FO • 1 LAN',
  },
  {
    type: 'SINGLE_1FO_1LAN',
    variant: 'B',
    title: 'Single HTB (Side B)',
    desc: '1 FO B (1550) + 1 LAN (Untuk Pelanggan / PTP)',
    portsSummary: '1 FO • 1 LAN',
  },
]

export default function HtbFormPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const { showToast } = useToast()

  const { box: existingBox, loading: loadingBox } = useHtbDetail(id)

  const [saving, setSaving] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [customersList, setCustomersList] = useState([])
  const [existingBoxesList, setExistingBoxesList] = useState([])

  // Form State
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [modelType, setModelType] = useState('SWITCH_3FO_2LAN')
  const [foVariant, setFoVariant] = useState('ABB')
  const [mountType, setMountType] = useState('POLE')
  const [status, setStatus] = useState('ACTIVE')

  // Kelistrikan
  const [powerSource, setPowerSource] = useState('HOST_CUSTOMER_PLN')
  const [hostCustomerId, setHostCustomerId] = useState('')
  const [hasUpsBattery, setHasUpsBattery] = useState(false)
  const [powerNotes, setPowerNotes] = useState('')

  // Uplink
  const [uplinkType, setUplinkType] = useState('CUSTOMER_ONU')
  const [uplinkHtbId, setUplinkHtbId] = useState('')
  const [uplinkPortLabel, setUplinkPortLabel] = useState('FO-2 (B)')
  const [uplinkCustomerId, setUplinkCustomerId] = useState('')
  const [uplinkOnuPort, setUplinkOnuPort] = useState('LAN 1')
  const [uplinkLocalPort, setUplinkLocalPort] = useState('')
  const [fiberLength, setFiberLength] = useState('')
  const [cableLabel, setCableLabel] = useState('')
  const [notes, setNotes] = useState('')

  // Fetch customers & boxes for pickers
  useEffect(() => {
    api.get('/customers?limit=500')
      .then(res => setCustomersList(res.data || res || []))
      .catch(() => {})

    api.get('/htb-boxes')
      .then(res => setExistingBoxesList((res || []).filter(b => b.id !== id)))
      .catch(() => {})
  }, [id])

  // Populate data when editing
  useEffect(() => {
    if (existingBox) {
      setName(existingBox.name || '')
      setCode(existingBox.code || '')
      setAddress(existingBox.address || '')
      setLat(existingBox.lat != null ? String(existingBox.lat) : '')
      setLng(existingBox.lng != null ? String(existingBox.lng) : '')
      setModelType(existingBox.modelType || 'SWITCH_3FO_2LAN')
      setFoVariant(existingBox.foVariant || 'ABB')
      setMountType(existingBox.mountType || 'POLE')
      setStatus(existingBox.status || 'ACTIVE')

      setPowerSource(existingBox.powerSource || 'HOST_CUSTOMER_PLN')
      setHostCustomerId(existingBox.hostCustomerId || '')
      setHasUpsBattery(Boolean(existingBox.hasUpsBattery))
      setPowerNotes(existingBox.powerNotes || '')

      setUplinkType(existingBox.uplinkType || 'CUSTOMER_ONU')
      setUplinkHtbId(existingBox.uplinkHtbId || '')
      setUplinkPortLabel(existingBox.uplinkPortLabel || '')
      setUplinkCustomerId(existingBox.uplinkCustomerId || '')
      setUplinkOnuPort(existingBox.uplinkOnuPort || 'LAN 1')
      setFiberLength(existingBox.fiberLength != null ? String(existingBox.fiberLength) : '')
      setCableLabel(existingBox.cableLabel || '')
      setNotes(existingBox.notes || '')
    }
  }, [existingBox])

  const handleSelectPreset = (p) => {
    setModelType(p.type)
    setFoVariant(p.variant)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      showToast({ type: 'error', message: 'Nama Box HTB wajib diisi' })
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        address: address || null,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
        modelType,
        foVariant,
        mountType,
        status,
        powerSource,
        hostCustomerId: hostCustomerId || null,
        hasUpsBattery,
        powerNotes: powerNotes || null,
        uplinkType,
        uplinkHtbId: uplinkType === 'HTB' ? (uplinkHtbId || null) : null,
        uplinkPortLabel: uplinkType === 'HTB' ? (uplinkPortLabel || null) : null,
        uplinkCustomerId: uplinkType === 'CUSTOMER_ONU' ? (uplinkCustomerId || null) : null,
        uplinkOnuPort: uplinkType === 'CUSTOMER_ONU' ? (uplinkOnuPort || 'LAN 1') : null,
        uplinkLocalPort: uplinkLocalPort || 'NONE',
        fiberLength: fiberLength ? parseFloat(fiberLength) : null,
        cableLabel: cableLabel || null,
        notes: notes || null,
      }

      if (isEdit) {
        await api.patch(`/htb-boxes/${id}`, payload)
        showToast({ type: 'success', message: 'Box HTB berhasil diperbarui' })
      } else {
        await api.post('/htb-boxes', payload)
        showToast({ type: 'success', message: 'Box HTB berhasil dibuat' })
      }
      navigate('/htb')
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Gagal menyimpan Box HTB' })
    } finally {
      setSaving(false)
    }
  }

  if (isEdit && loadingBox) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 size={24} className="animate-spin text-muted" />
      </div>
    )
  }

  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4 animate-fade-in">
      {/* Header matching OdpFormPage */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/htb')}
          className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-base font-bold text-primary">
            {isEdit ? `Edit ${name || 'Box HTB'}` : 'Tambah Box HTB Baru'}
          </h1>
          <p className="text-[10px] text-muted">
            {isEdit ? 'Perbarui informasi dan port Box HTB' : 'Daftarkan titik distribusi Switch FO / Media Converter baru'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Preset Selection (Only on Create) */}
        {!isEdit && (
          <Section title="Pilih Model Perangkat Switch FO">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESETS.map((p, idx) => {
                const isSelected = modelType === p.type && foVariant === p.variant
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelectPreset(p)}
                    className={`p-3 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 ring-1 ring-[var(--accent)]'
                        : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--border)]/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-primary">
                        {p.title}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border)] font-mono text-muted">
                        {p.portsSummary}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted mt-1 leading-relaxed">
                      {p.desc}
                    </p>
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* Section 1: Identitas & Lokasi Box */}
        <Section title="1. Identitas & Lokasi">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nama Box HTB" required hint="e.g. HTB-TIANG-04 atau HTB-RMH-UNYIL">
              <input
                type="text"
                placeholder="Nama unik Box"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className={IC}
              />
            </Field>

            <Field label="Kode / Barcode" hint="Identifikasi fisik / stiker">
              <input
                type="text"
                placeholder="Kode barcode"
                value={code}
                onChange={e => setCode(e.target.value)}
                className={IC}
              />
            </Field>

            <Field label="Tipe Penempatan">
              <select
                value={mountType}
                onChange={e => setMountType(e.target.value)}
                className={IC}
              >
                <option value="POLE">Tiang Listrik / Tiang Besi</option>
                <option value="WALL">Dinding Luar</option>
                <option value="HOUSE">Numpang di Rumah Warga</option>
              </select>
            </Field>

            <Field label="Status Operasional">
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className={IC}
              >
                <option value="ACTIVE">Aktif</option>
                <option value="MAINTENANCE">Perbaikan</option>
                <option value="INACTIVE">Nonaktif</option>
              </select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Alamat / Keterangan Lokasi">
                <input
                  type="text"
                  placeholder="Jl. / RT RW / Lokasi tiang"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className={IC}
                />
              </Field>
            </div>

            <Field label="Latitude" hint="Koordinat GPS">
              <input
                type="text"
                placeholder="-7.123456"
                value={lat}
                onChange={e => setLat(e.target.value)}
                className={IC + ' font-mono'}
              />
            </Field>

            <Field label="Longitude">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="112.123456"
                  value={lng}
                  onChange={e => setLng(e.target.value)}
                  className={IC + ' font-mono'}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  icon={MapPin}
                  onClick={() => setMapOpen(true)}
                  className="shrink-0"
                >
                  Peta
                </Button>
              </div>
            </Field>
          </div>
        </Section>

        {/* Section 2: Sumber Uplink */}
        <Section title="2. Sumber Uplink (Jalur Internet Masuk)">
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setUplinkType('CUSTOMER_ONU')}
                className={`p-3 rounded-xl border text-left text-xs transition-all ${
                  uplinkType === 'CUSTOMER_ONU'
                    ? 'border-amber-400 bg-amber-500/10 text-amber-300 ring-1 ring-amber-400'
                    : 'border-[var(--border)] text-muted hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <span className="font-semibold block text-primary">Bridge ONU Pelanggan</span>
                <span className="text-[10px] text-muted">ODP ➔ ONU Bridge ➔ LAN</span>
              </button>

              <button
                type="button"
                onClick={() => setUplinkType('HTB')}
                className={`p-3 rounded-xl border text-left text-xs transition-all ${
                  uplinkType === 'HTB'
                    ? 'border-sky-400 bg-sky-500/10 text-sky-300 ring-1 ring-sky-400'
                    : 'border-[var(--border)] text-muted hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <span className="font-semibold block text-primary">Estafet dari Box HTB</span>
                <span className="text-[10px] text-muted">Kabel FO dari Box upstream</span>
              </button>

              <button
                type="button"
                onClick={() => setUplinkType('CORE_SWITCH')}
                className={`p-3 rounded-xl border text-left text-xs transition-all ${
                  uplinkType === 'CORE_SWITCH'
                    ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400'
                    : 'border-[var(--border)] text-muted hover:bg-[var(--bg-secondary)]'
                }`}
              >
                <span className="font-semibold block text-primary">Core Switch NOC</span>
                <span className="text-[10px] text-muted">Direct link dari router pusat</span>
              </button>
            </div>

            {/* If Bridge Customer ONU */}
            {uplinkType === 'CUSTOMER_ONU' && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                  <Zap size={13} className="text-amber-400" />
                  Pilih Pelanggan Penyedia Bridge ONU
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Pelanggan Host ONU" required>
                    <select
                      value={uplinkCustomerId}
                      onChange={e => setUplinkCustomerId(e.target.value)}
                      className={IC}
                    >
                      <option value="">-- Pilih Pelanggan (misal: UNYIL) --</option>
                      {customersList.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.customerId}) {c.address ? `- ${c.address}` : ''}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Port LAN pada ONU" hint="Port output bridge">
                    <input
                      type="text"
                      placeholder="LAN 1"
                      value={uplinkOnuPort}
                      onChange={e => setUplinkOnuPort(e.target.value)}
                      className={IC}
                    />
                  </Field>
                </div>
              </div>
            )}

            {/* If Cascade HTB */}
            {uplinkType === 'HTB' && (
              <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Box HTB Induk" required>
                    <select
                      value={uplinkHtbId}
                      onChange={e => setUplinkHtbId(e.target.value)}
                      className={IC}
                    >
                      <option value="">-- Pilih Box HTB Upstream --</option>
                      {existingBoxesList.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.modelType})
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Port Asal di Box Induk">
                    <input
                      type="text"
                      placeholder="FO-2 (B)"
                      value={uplinkPortLabel}
                      onChange={e => setUplinkPortLabel(e.target.value)}
                      className={IC}
                    />
                  </Field>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <Field label="Panjang Kabel Uplink (meter)">
                <input
                  type="number"
                  placeholder="150"
                  value={fiberLength}
                  onChange={e => setFiberLength(e.target.value)}
                  className={IC}
                />
              </Field>

              <Field label="Label Kabel">
                <input
                  type="text"
                  placeholder="DC-1C-BIRU / UTP-OUTDOOR"
                  value={cableLabel}
                  onChange={e => setCableLabel(e.target.value)}
                  className={IC}
                />
              </Field>
            </div>

            {!isEdit && (
              <Field
                label="Port Masuk pada Box Ini (Opsional)"
                hint="Biarkan [Belum Ditentukan] jika Anda ingin menentukan port uplink nanti langsung di lapangan lewat visual port."
              >
                <select
                  value={uplinkLocalPort}
                  onChange={e => setUplinkLocalPort(e.target.value)}
                  className={IC}
                >
                  <option value="">[ Belum Ditentukan / Bebas (Set Nanti di Visual Port) ]</option>
                  <optgroup label="Port LAN (RJ45)">
                    <option value="LAN-1">LAN-1 (RJ45)</option>
                    {modelType !== 'SINGLE_1FO_1LAN' && <option value="LAN-2">LAN-2 (RJ45)</option>}
                  </optgroup>
                  <optgroup label="Port Fiber Optik (SC BiDi)">
                    <option value="FO-1">FO-1 ({foVariant === 'B' ? 'B/1550' : 'A/1310'})</option>
                    {modelType !== 'SINGLE_1FO_1LAN' && (
                      <>
                        <option value="FO-2">FO-2 ({foVariant === 'AAB' ? 'A/1310' : 'B/1550'})</option>
                        <option value="FO-3">FO-3 ({foVariant === 'AAB' ? 'B/1550' : 'B/1550'})</option>
                      </>
                    )}
                    {modelType === 'SWITCH_6FO_2LAN' && (
                      <>
                        <option value="FO-4">FO-4 (B/1550)</option>
                        <option value="FO-5">FO-5 (B/1550)</option>
                        <option value="FO-6">FO-6 (B/1550)</option>
                      </>
                    )}
                  </optgroup>
                </select>
              </Field>
            )}
          </div>
        </Section>

        {/* Section 3: Catu Daya / Kelistrikan */}
        <Section title="3. Catu Daya & Kelistrikan">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Sumber Listrik">
              <select
                value={powerSource}
                onChange={e => setPowerSource(e.target.value)}
                className={IC}
              >
                <option value="HOST_CUSTOMER_PLN">Numpang Rumah Pelanggan / Warga</option>
                <option value="REVERSE_POE">Reverse PoE dari Pelanggan</option>
                <option value="PLN_DEDICATED">Meteran PLN Khusus Tiang</option>
                <option value="CENTRAL_DC_UPS">Sentral DC / Baterai Backup</option>
                <option value="SOLAR">Panel Surya</option>
              </select>
            </Field>

            {(powerSource === 'HOST_CUSTOMER_PLN' || powerSource === 'REVERSE_POE') && (
              <Field label="Pemilik Rumah Sumber Listrik">
                <select
                  value={hostCustomerId}
                  onChange={e => setHostCustomerId(e.target.value)}
                  className={IC}
                >
                  <option value="">-- Pilih Pelanggan --</option>
                  {customersList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.customerId})
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-secondary">
                <input
                  type="checkbox"
                  checked={hasUpsBattery}
                  onChange={e => setHasUpsBattery(e.target.checked)}
                  className="rounded border-[var(--border)] text-[var(--accent)]"
                />
                Dilengkapi Mini DC UPS / Baterai Backup di dalam Box
              </label>
            </div>

            <div className="sm:col-span-2">
              <Field label="Catatan Kelistrikan">
                <input
                  type="text"
                  placeholder="Colok di garasi / adaptor 5V 2A"
                  value={powerNotes}
                  onChange={e => setPowerNotes(e.target.value)}
                  className={IC}
                />
              </Field>
            </div>
          </div>
        </Section>

        {/* Section 4: Catatan */}
        <Section title="4. Catatan">
          <textarea
            rows={3}
            placeholder="Keterangan teknis lainnya..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className={IC + ' resize-none'}
          />
        </Section>

        {/* Action Buttons matching OdpFormPage */}
        <div className="flex gap-2 justify-end pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate('/htb')}
            disabled={saving}
          >
            Batal
          </Button>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={saving}
            icon={isEdit ? undefined : Plus}
          >
            {saving ? 'Menyimpan…' : isEdit ? 'Simpan Perubahan' : 'Tambah Box HTB'}
          </Button>
        </div>
      </form>

      {/* Location Picker Modal */}
      {mapOpen && (
        <LocationPickerModal
          isOpen={true}
          lat={lat ? parseFloat(lat) : null}
          lng={lng ? parseFloat(lng) : null}
          onSelect={(selectedLat, selectedLng) => {
            setLat(selectedLat.toFixed(6))
            setLng(selectedLng.toFixed(6))
            setMapOpen(false)
          }}
          onClose={() => setMapOpen(false)}
        />
      )}
    </div>
  )
}
