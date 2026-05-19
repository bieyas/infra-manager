import React, { useState, useEffect } from 'react'
import { X, MapPin, Loader2, AlertCircle, Check, LocateFixed } from 'lucide-react'
import { CORE_COLORS } from '../../data/ftthData'
import Button from '../../components/ui/Button'
import clsx from 'clsx'

const TYPE_OPTS = [
  { id: 'odc',     label: 'ODC',     desc: 'Optical Distribution Cabinet' },
  { id: 'odp',     label: 'ODP',     desc: 'Optical Distribution Point'   },
  { id: 'closure', label: 'Closure', desc: 'Splice Closure'               },
  { id: 'htb',     label: 'HTB',     desc: 'Home Terminal Box / ONT'      },
]

const CORE_OPTS = [1, 2, 4, 6, 8, 12, 24, 48]
const MOUNT_OPTS = ['aerial', 'underground', 'wall', 'pole']

function Field({ label, error, children, required }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-secondary">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-[10px] text-rose-400 flex items-center gap-1">
          <AlertCircle size={9} />{error}
        </p>
      )}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, mono, disabled, error }) {
  return (
    <input
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={clsx(
        'w-full bg-[var(--bg-secondary)] border rounded-lg text-sm text-primary px-3 py-2',
        'focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all',
        mono && 'font-mono',
        disabled && 'opacity-50 cursor-not-allowed',
        error ? 'border-rose-500' : 'border-[var(--border)]'
      )}
    />
  )
}

function SelectInput({ value, onChange, options }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-primary px-3 py-2 focus:outline-none focus:border-[var(--accent)] transition-all"
    >
      <option value="">— Pilih —</option>
      {options.map(o => (
        <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
      ))}
    </select>
  )
}

// Nominatim reverse geocode
async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=id`
  const res = await fetch(url, { headers: { 'Accept-Language': 'id' } })
  if (!res.ok) throw new Error('Geocode failed')
  const data = await res.json()
  return data.display_name ?? ''
}

// Core color picker row
function CoreColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CORE_COLORS.map(c => (
        <button
          key={c.id}
          type="button"
          title={c.name}
          onClick={() => onChange(c.id)}
          className={clsx(
            'w-5 h-5 rounded-full border-2 transition-all',
            value === c.id
              ? 'border-white scale-110 ring-1 ring-white/50'
              : 'border-transparent opacity-70 hover:opacity-100'
          )}
          style={{ background: c.hex }}
        />
      ))}
    </div>
  )
}

export default function FtthForm({ mode, type: initType, initialLatlng, node, allNodes, onSave, onClose }) {
  const isEdit = mode === 'edit'

  const [form, setForm] = useState(() => {
    if (isEdit && node) return { ...node }
    return {
      id:          '',
      name:        '',
      type:        initType ?? 'odc',
      parentId:    '',
      cableCore:   12,
      lat:         initialLatlng?.lat ?? '',
      lng:         initialLatlng?.lng ?? '',
      address:     '',
      brand:       '',
      model:       '',
      installDate: '',
      notes:       '',
      status:      'active',
      // ODC/ODP/Closure specific
      cores:       [],
      // ODP specific
      capacity:    8,
      used:        0,
      // Closure specific
      mountType:   'aerial',
      // HTB specific
      coreNo:      1,
      customerName:'',
      customerId:  '',
      serialNo:    '',
    }
  })

  const [errors, setErrors]     = useState({})
  const [geocoding, setGeocoding] = useState(false)
  const [tab, setTab]           = useState('info') // 'info' | 'cores' | 'notes'

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  // Auto-geocode when lat/lng filled
  useEffect(() => {
    const lat = parseFloat(form.lat)
    const lng = parseFloat(form.lng)
    if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 && !form.address) {
      setGeocoding(true)
      reverseGeocode(lat, lng)
        .then(addr => set('address', addr))
        .catch(() => {})
        .finally(() => setGeocoding(false))
    }
  }, [form.lat, form.lng])

  // Auto-geocode when latlng provided initially
  useEffect(() => {
    if (initialLatlng && !isEdit) {
      const { lat, lng } = initialLatlng
      set('lat', lat.toFixed(6))
      set('lng', lng.toFixed(6))
      setGeocoding(true)
      reverseGeocode(lat, lng)
        .then(addr => set('address', addr))
        .catch(() => {})
        .finally(() => setGeocoding(false))
    }
  }, [])

  const getMyLocation = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      set('lat', lat.toFixed(6))
      set('lng', lng.toFixed(6))
    })
  }

  const validate = () => {
    const e = {}
    if (!form.id.trim())   e.id   = 'ID wajib diisi'
    if (!form.name.trim()) e.name = 'Nama wajib diisi'
    if (!form.lat || isNaN(parseFloat(form.lat))) e.lat = 'Latitude tidak valid'
    if (!form.lng || isNaN(parseFloat(form.lng))) e.lng = 'Longitude tidak valid'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave({
      ...form,
      lat:       parseFloat(form.lat),
      lng:       parseFloat(form.lng),
      cableCore: Number(form.cableCore),
    })
  }

  const parentOpts = allNodes
    .filter(n => n.id !== form.id && (
      form.type === 'odc'     ? n.type === 'odc' :
      form.type === 'odp'     ? (n.type === 'odc' || n.type === 'odp') :
      form.type === 'closure' ? (n.type === 'odc' || n.type === 'odp') :
      form.type === 'htb'     ? n.type === 'odp' : false
    ))
    .map(n => ({ value: n.id, label: `${n.id} — ${n.name}` }))

  const TABS = [
    { id: 'info',  label: 'Info Umum' },
    { id: 'cores', label: 'Core',     hide: form.type === 'htb' },
    { id: 'notes', label: 'Catatan'   },
  ].filter(t => !t.hide)

  return (
    <div className="fixed inset-0 z-[3000] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full md:max-w-lg bg-[var(--bg-card)] border border-[var(--border)] md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
          <div>
            <p className="text-sm font-semibold text-primary">
              {isEdit ? `Edit ${node?.name}` : 'Tambah Entitas Baru'}
            </p>
            <p className="text-[10px] text-muted mt-0.5">
              {isEdit ? `${node?.type?.toUpperCase()} · ${node?.id}` : 'FTTH Network Element'}
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Type selector (only on add) */}
        {!isEdit && (
          <div className="px-4 pt-3 pb-2 border-b border-[var(--border)] shrink-0">
            <p className="text-[10px] text-muted uppercase tracking-wider mb-2">Tipe Entitas</p>
            <div className="grid grid-cols-4 gap-1.5">
              {TYPE_OPTS.map(t => (
                <button
                  key={t.id}
                  onClick={() => set('type', t.id)}
                  className={clsx(
                    'py-2 px-1 rounded-lg text-center text-[10px] font-semibold transition-all border',
                    form.type === t.id
                      ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                      : 'bg-[var(--bg-secondary)] text-secondary border-[var(--border)] hover:border-[var(--accent)]'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex-1 py-2.5 text-xs font-medium transition-all',
                tab === t.id
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-secondary hover:text-primary'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">

          {/* ── Tab: Info ── */}
          {tab === 'info' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="ID" required error={errors.id}>
                  <TextInput value={form.id} onChange={v => set('id', v)} placeholder="ODC-001" mono disabled={isEdit} error={errors.id} />
                </Field>
                <Field label="Status">
                  <SelectInput value={form.status} onChange={v => set('status', v)} options={['active','inactive','maintenance'].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
                </Field>
              </div>

              <Field label="Nama" required error={errors.name}>
                <TextInput value={form.name} onChange={v => set('name', v)} placeholder="ODC-001 Pusat" error={errors.name} />
              </Field>

              <Field label="Parent">
                <SelectInput
                  value={form.parentId}
                  onChange={v => set('parentId', v)}
                  options={[{ value: '', label: '— Tidak ada (root) —' }, ...parentOpts]}
                />
              </Field>

              {/* Koordinat */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-secondary">Koordinat *</p>
                  <button
                    onClick={getMyLocation}
                    className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
                  >
                    <LocateFixed size={10} /> Lokasi saya
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <TextInput value={form.lat} onChange={v => set('lat', v)} placeholder="-7.2575" mono error={errors.lat} />
                    {errors.lat && <p className="text-[10px] text-rose-400 mt-0.5 flex items-center gap-1"><AlertCircle size={9}/>{errors.lat}</p>}
                  </div>
                  <div>
                    <TextInput value={form.lng} onChange={v => set('lng', v)} placeholder="112.7521" mono error={errors.lng} />
                    {errors.lng && <p className="text-[10px] text-rose-400 mt-0.5 flex items-center gap-1"><AlertCircle size={9}/>{errors.lng}</p>}
                  </div>
                </div>
              </div>

              {/* Alamat */}
              <Field label="Alamat">
                <div className="relative">
                  <TextInput value={form.address} onChange={v => set('address', v)} placeholder="Jl. Ahmad Yani No.1…" />
                  {geocoding && (
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <Loader2 size={13} className="animate-spin text-[var(--accent)]" />
                    </div>
                  )}
                </div>
                {geocoding && <p className="text-[10px] text-[var(--accent)]">Mengambil alamat dari koordinat…</p>}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Brand/Merk">
                  <TextInput value={form.brand} onChange={v => set('brand', v)} placeholder="Huawei, ZTE, Optix…" />
                </Field>
                <Field label="Model">
                  <TextInput value={form.model} onChange={v => set('model', v)} placeholder="ODC-96C" />
                </Field>
              </div>

              {/* Type-specific fields */}
              {(form.type === 'odc' || form.type === 'odp' || form.type === 'closure') && (
                <Field label="Jumlah Core Kabel">
                  <div className="flex flex-wrap gap-1.5">
                    {CORE_OPTS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => set('cableCore', c)}
                        className={clsx(
                          'px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all border',
                          Number(form.cableCore) === c
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'bg-[var(--bg-secondary)] text-secondary border-[var(--border)] hover:border-[var(--accent)]'
                        )}
                      >
                        {c}C
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              {form.type === 'odp' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Kapasitas Port">
                    <TextInput value={form.capacity} onChange={v => set('capacity', v)} placeholder="8" mono />
                  </Field>
                  <Field label="Port Terpakai">
                    <TextInput value={form.used} onChange={v => set('used', v)} placeholder="0" mono />
                  </Field>
                </div>
              )}

              {form.type === 'closure' && (
                <Field label="Tipe Pemasangan">
                  <SelectInput value={form.mountType} onChange={v => set('mountType', v)} options={MOUNT_OPTS.map(m => ({ value: m, label: { aerial: 'Aerial (Tiang)', underground: 'Underground', wall: 'Wall Mount', pole: 'Pole Mount' }[m] }))} />
                </Field>
              )}

              {form.type === 'htb' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Nama Pelanggan">
                      <TextInput value={form.customerName} onChange={v => set('customerName', v)} placeholder="Nama Pelanggan" />
                    </Field>
                    <Field label="ID Pelanggan">
                      <TextInput value={form.customerId} onChange={v => set('customerId', v)} placeholder="CUST-001" mono />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Serial Number">
                      <TextInput value={form.serialNo} onChange={v => set('serialNo', v)} placeholder="SN-XXXXXXX" mono />
                    </Field>
                    <Field label="No. Core (ODP)">
                      <TextInput value={form.coreNo} onChange={v => set('coreNo', v)} placeholder="1" mono />
                    </Field>
                  </div>
                </>
              )}

              <Field label="Tanggal Pasang">
                <input
                  type="date"
                  value={form.installDate ?? ''}
                  onChange={e => set('installDate', e.target.value)}
                  className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-primary px-3 py-2 focus:outline-none focus:border-[var(--accent)] transition-all"
                />
              </Field>
            </>
          )}

          {/* ── Tab: Core ── */}
          {tab === 'cores' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-secondary">
                  Kabel <strong>{form.cableCore} core</strong> — standar warna Telkom/APJII
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5 max-h-80 overflow-y-auto pr-1">
                {Array.from({ length: Number(form.cableCore) || 12 }).map((_, i) => {
                  const coreIdx = i % 12
                  const tubeNo  = Math.floor(i / 12) + 1
                  const color   = CORE_COLORS[coreIdx]
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]"
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                        style={{ background: color.hex }}
                        title={color.name}
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] font-mono text-primary">Core {i + 1}</p>
                        <p className="text-[9px] text-muted">Tube {tubeNo} · {color.name}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[10px] text-muted">
                Assignment core ke pelanggan dapat dilakukan setelah entitas tersimpan di halaman detail.
              </p>
            </div>
          )}

          {/* ── Tab: Notes ── */}
          {tab === 'notes' && (
            <Field label="Catatan">
              <textarea
                value={form.notes ?? ''}
                onChange={e => set('notes', e.target.value)}
                rows={6}
                placeholder="Catatan tambahan, kondisi lapangan, dsb…"
                className="w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-primary px-3 py-2 focus:outline-none focus:border-[var(--accent)] transition-all resize-none"
              />
            </Field>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-[var(--border)] shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-[var(--bg-secondary)] text-secondary border border-[var(--border)] hover:border-[var(--accent)] hover:text-primary transition-all"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <Check size={14} />
            {isEdit ? 'Simpan Perubahan' : 'Tambah'}
          </button>
        </div>
      </div>
    </div>
  )
}
