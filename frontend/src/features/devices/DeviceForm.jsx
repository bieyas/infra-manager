import React, { useState, useEffect } from 'react'
import { X, Check, AlertCircle, Loader2, Eye, EyeOff, Plus, Trash2, MapPin } from 'lucide-react'
import Card, { CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import clsx from 'clsx'
import { api } from '../../lib/api'

// ── Constants ────────────────────────────────────────────────────────────────
const DEVICE_TYPES = [
  { value: 'ROUTER',   label: 'Router'       },
  { value: 'SWITCH',   label: 'Switch'       },
  { value: 'FIREWALL', label: 'Firewall'     },
  { value: 'AP',       label: 'Access Point' },
  { value: 'SERVER',   label: 'Server'       },
  { value: 'OLT',      label: 'OLT'          },
  { value: 'ONU',      label: 'ONU'          },
  { value: 'OTHER',    label: 'Other'        },
]

const STATUS_OPTS = [
  { value: 'ACTIVE',      label: 'Active'      },
  { value: 'INACTIVE',    label: 'Inactive'    },
  { value: 'MAINTENANCE', label: 'Maintenance' },
]

/** Map UI-normalized status (online/offline/warning) → NodeStatus enum for form */
function toFormStatus(s) {
  switch (s?.toLowerCase()) {
    case 'online':
    case 'active':      return 'ACTIVE'
    case 'offline':
    case 'inactive':    return 'INACTIVE'
    case 'warning':
    case 'maintenance': return 'MAINTENANCE'
    default:            return 'ACTIVE'
  }
}

const PROTOCOL_OPTS = [
  { value: '',       label: '— Pilih protokol —' },
  { value: 'SSH',    label: 'SSH',    defaultPort: 22   },
  { value: 'TELNET', label: 'Telnet', defaultPort: 23   },
  { value: 'SNMP',   label: 'SNMP',   defaultPort: 161  },
  { value: 'API',    label: 'API (RouterOS)', defaultPort: 8728 },
  { value: 'WEB',    label: 'Web / HTTP',    defaultPort: 80   },
]

const SNMP_VERSIONS = ['v1', 'v2c', 'v3']

const LINK_TYPES = ['fiber', 'copper', 'sfp', 'uplink', 'other']

const KNOWN_VENDORS = [
  'Mikrotik', 'Cisco', 'Huawei', 'ZTE', 'Ubiquiti', 'Juniper',
  'Fortinet', 'Palo Alto', 'HPE', 'Aruba', 'TP-Link', 'D-Link',
  'Ruijie', 'Fiberhome', 'VSOL', 'C-Data', 'Dasan', 'Nokia',
]

const LAT_RE = /^-?(90(\.0+)?|[1-8]?\d(\.\d+)?)$/
const LNG_RE = /^-?(180(\.0+)?|(1[0-7]\d|\d{1,2})(\.\d+)?)$/

const EMPTY_FORM = {
  // Basic
  name:          '',
  ip:            '',
  type:          'ROUTER',
  vendor:        '',
  model:         '',
  location:      '',
  lat:           '',
  lng:           '',
  status:        'ACTIVE',
  notes:         '',
  // Management
  mgmtProtocol:  '',
  mgmtPort:      '',
  mgmtUsername:  '',
  mgmtPassword:  '',
  snmpCommunity: '',
  snmpVersion:   'v2c',
  // OLT
  ponCount:      '',
  ponCapacity:   '',
}

const TABS_BASE    = ['Basic', 'Management', 'Uplink']
const TABS_OLT     = ['Basic', 'Management', 'OLT Config', 'Uplink']

// ── Validation ───────────────────────────────────────────────────────────────
const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$/

function validate(form) {
  const e = {}
  if (!form.name.trim())              e.name = 'Nama wajib diisi'
  if (!form.ip.trim())                e.ip   = 'IP wajib diisi'
  else if (!IP_RE.test(form.ip.trim())) e.ip  = 'Format IP tidak valid'
  if (!form.type)                     e.type = 'Tipe wajib dipilih'
  if (form.type === 'OLT' && form.ponCount !== '' && isNaN(Number(form.ponCount)))
    e.ponCount = 'Harus berupa angka'
  if (form.type === 'OLT' && form.ponCapacity !== '' && isNaN(Number(form.ponCapacity)))
    e.ponCapacity = 'Harus berupa angka'
  if (form.mgmtPort !== '' && isNaN(Number(form.mgmtPort)))
    e.mgmtPort = 'Harus berupa angka'
  if (form.lat !== '' && !LAT_RE.test(String(form.lat).trim()))
    e.lat = 'Latitude tidak valid (-90 s/d 90)'
  if (form.lng !== '' && !LNG_RE.test(String(form.lng).trim()))
    e.lng = 'Longitude tidak valid (-180 s/d 180)'
  return e
}

// ── Field helpers ────────────────────────────────────────────────────────────
const inputClass = (error, extra = '') => clsx(
  'w-full bg-[var(--bg-secondary)] border rounded-lg text-sm text-primary px-3 py-2',
  'focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all',
  error ? 'border-rose-500' : 'border-[var(--border)]',
  extra
)

function FieldWrap({ label, error, children, required, hint }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-secondary">
        {label}{required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[10px] text-muted">{hint}</p>}
      {error && (
        <p className="text-[10px] text-rose-400 flex items-center gap-1">
          <AlertCircle size={10} />{error}
        </p>
      )}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, mono, disabled, type = 'text', error }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={inputClass(error, clsx(mono && 'font-mono', disabled && 'opacity-50 cursor-not-allowed'))}
    />
  )
}

function SelectInput({ value, onChange, options, error }) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={inputClass(error)}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

function VendorCombobox({ value, onChange, savedVendors }) {
  const [open,  setOpen]  = useState(false)
  const [query, setQuery] = useState(value)
  useEffect(() => { setQuery(value) }, [value])
  const allVendors = [...new Set([...KNOWN_VENDORS, ...savedVendors])].sort()
  const filtered = query
    ? allVendors.filter(v => v.toLowerCase().includes(query.toLowerCase()))
    : allVendors

  const select = (v) => { onChange(v); setQuery(v); setOpen(false) }

  return (
    <div className="relative">
      <input
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="mis. Mikrotik"
        className={inputClass(false)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-card)] shadow-lg max-h-44 overflow-y-auto text-sm">
          {filtered.map(v => (
            <li
              key={v}
              onMouseDown={() => select(v)}
              className={clsx(
                'px-3 py-1.5 cursor-pointer hover:bg-[var(--accent-glow)] text-primary transition-colors',
                value === v && 'text-[var(--accent)] font-medium'
              )}
            >
              {v}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PasswordInput({ value, onChange, placeholder, error }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="new-password"
        className={inputClass(error, 'pr-9 font-mono')}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
    </div>
  )
}

// ── Uplink row sub-component ─────────────────────────────────────────────────
function UplinkRow({ link, deviceList, onChange, onDelete, idx }) {
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end">
      <FieldWrap label={idx === 0 ? 'Port lokal' : undefined}>
        <TextInput
          value={link.fromPort}
          onChange={e => onChange('fromPort', e.target.value)}
          placeholder="mis. ether1"
          mono
        />
      </FieldWrap>
      <FieldWrap label={idx === 0 ? 'Uplink ke device' : undefined}>
        <select
          value={link.toDeviceId}
          onChange={e => onChange('toDeviceId', e.target.value)}
          className={inputClass(false)}
        >
          <option value="">— Pilih —</option>
          {deviceList.map(d => (
            <option key={d.id} value={d.id}>{d.name} ({d.ip})</option>
          ))}
        </select>
      </FieldWrap>
      <FieldWrap label={idx === 0 ? 'Port uplink' : undefined}>
        <TextInput
          value={link.toPort}
          onChange={e => onChange('toPort', e.target.value)}
          placeholder="mis. ether2"
          mono
        />
      </FieldWrap>
      <FieldWrap label={idx === 0 ? 'Tipe kabel' : undefined}>
        <select
          value={link.linkType}
          onChange={e => onChange('linkType', e.target.value)}
          className={inputClass(false)}
        >
          <option value="">—</option>
          {LINK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </FieldWrap>
      <div className={idx === 0 ? 'pb-0 mt-[19px]' : ''}>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded hover:bg-rose-500/10 text-muted hover:text-rose-400 transition-colors"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DeviceForm({ device, onSave, onClose, loading: savingProp }) {
  const isEdit = !!device
  const isOLT  = (form) => form.type === 'OLT'

  const [tab,    setTab]    = useState('Basic')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deviceList,   setDeviceList]   = useState([])
  const [savedVendors, setSavedVendors] = useState([])
  // Track whether user manually edited the port field
  const [portEdited,   setPortEdited]   = useState(
    isEdit && device?.mgmtPort ? true : false
  )

  const [form, setForm] = useState(() => isEdit ? {
    name:          device.name          ?? '',
    ip:            device.ip            ?? '',
    type:          device.type?.toUpperCase() ?? 'SWITCH',
    vendor:        device.vendor        ?? '',
    model:         device.model         ?? '',
    location:      device.location      ?? '',
    status:        toFormStatus(device.status),
    notes:         device.notes         ?? '',
    mgmtProtocol:  device.mgmtProtocol  ?? '',
    mgmtPort:      device.mgmtPort != null ? String(device.mgmtPort) : '',
    mgmtUsername:  device.mgmtUsername  ?? '',
    mgmtPassword:  '',  // never pre-fill password
    snmpCommunity: '',  // never pre-fill
    snmpVersion:   device.snmpVersion   ?? 'v2c',
    ponCount:      device.ponCount      ?? '',
    ponCapacity:   device.ponCapacity   ?? '',
    lat:           device.lat            != null ? String(device.lat) : '',
    lng:           device.lng            != null ? String(device.lng) : '',
  } : EMPTY_FORM)

  // Uplink rows (separate state — saved via /links API after main save)
  const [uplinks, setUplinks] = useState(() =>
    (isEdit && device.uplinks) ? device.uplinks.map(l => ({
      id:         l.id,
      fromPort:   l.fromPort,
      toDeviceId: l.toDeviceId,
      toPort:     l.toPort,
      linkType:   l.linkType ?? '',
    })) : []
  )

  // Fetch device list for uplink selector + extract saved vendors
  useEffect(() => {
    api.get('/devices')
      .then(list => {
        setDeviceList(list.filter(d => d.id !== device?.id))
        const vendors = [...new Set(
          list.map(d => d.vendor).filter(Boolean)
        )]
        setSavedVendors(vendors)
      })
      .catch(() => {})
  }, [device?.id])

  const isSaving  = saving || savingProp
  const TABS      = isOLT(form) ? TABS_OLT : TABS_BASE
  const hasErrors = Object.values(errors).some(Boolean)

  const set = (k, v) => {
    if (k === 'mgmtPort') setPortEdited(true)
    setForm(f => {
      const next = { ...f, [k]: v }
      // Auto-update port when protocol changes, unless user manually set it
      if (k === 'mgmtProtocol') {
        const proto = PROTOCOL_OPTS.find(p => p.value === v)
        if (proto?.defaultPort && !portEdited)
          next.mgmtPort = String(proto.defaultPort)
      }
      return next
    })
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const setPort = (v) => {
    setPortEdited(v !== '')
    setForm(f => ({ ...f, mgmtPort: v }))
    setErrors(e => ({ ...e, mgmtPort: '' }))
  }

  const addUplink = () => setUplinks(u => [...u, { id: null, fromPort: '', toDeviceId: '', toPort: '', linkType: '' }])
  const delUplink = (i) => setUplinks(u => u.filter((_, idx) => idx !== i))
  const setUplink = (i, k, v) => setUplinks(u => u.map((r, idx) => idx === i ? { ...r, [k]: v } : r))

  const handleSave = async () => {
    const e = validate(form)
    if (Object.keys(e).length) {
      setErrors(e)
      // Switch to the tab containing the first error
      if (e.name || e.ip || e.type || e.lat || e.lng) setTab('Basic')
      else if (e.mgmtPort)                           setTab('Management')
      else if (e.ponCount)                           setTab('OLT Config')
      return
    }
    setSaving(true)
    try {
      // Build payload — exclude empty optional strings
      const payload = {}
      for (const [k, v] of Object.entries(form)) {
        if (v === '' || v === null || v === undefined) continue
        payload[k] = v
      }
      // Convert numeric strings
      if (payload.mgmtPort) payload.mgmtPort = Number(payload.mgmtPort)
      if (payload.ponCount) payload.ponCount = Number(payload.ponCount)
      if (payload.ponCapacity) payload.ponCapacity = Number(payload.ponCapacity)
      if (payload.lat)      payload.lat      = Number(payload.lat)
      if (payload.lng)      payload.lng      = Number(payload.lng)
      // Don't send password/community if empty (keep existing)
      if (!form.mgmtPassword)  delete payload.mgmtPassword
      if (!form.snmpCommunity) delete payload.snmpCommunity

      const saved = await onSave(payload, uplinks)
      if (!saved) return // parent signalled error
    } finally {
      setSaving(false)
    }
  }

  const isSNMP     = form.mgmtProtocol === 'SNMP'
  const needsLogin = ['SSH', 'TELNET', 'API', 'WEB'].includes(form.mgmtProtocol)

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <Card className="relative w-full md:max-w-2xl md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl max-h-[92vh] flex flex-col animate-slide-in">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
          <span className="text-sm font-semibold text-primary">
            {isEdit ? `Edit Device — ${device.name}` : 'Tambah Device Baru'}
          </span>
          <Button variant="ghost" size="xs" icon={X} onClick={onClose} />
        </div>

        {/* ── Tab bar ── */}
        <div className="flex gap-0.5 px-4 pt-2 border-b border-[var(--border)] shrink-0">
          {TABS.map(t => {
            const hasTabError =
              (t === 'Basic'      && (errors.name || errors.ip || errors.type || errors.lat || errors.lng)) ||
              (t === 'Management' && errors.mgmtPort) ||
              (t === 'OLT Config' && errors.ponCount)
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-all',
                  tab === t
                    ? 'border-[var(--accent)] text-[var(--accent)]'
                    : 'border-transparent text-muted hover:text-primary'
                )}
              >
                {t}
                {hasTabError && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
              </button>
            )
          })}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <CardBody className="space-y-4 pt-4">

            {/* ════ BASIC TAB ════ */}
            {tab === 'Basic' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FieldWrap label="Nama Device" error={errors.name} required>
                    <TextInput value={form.name} onChange={e => set('name', e.target.value)} placeholder="mis. Core-SW-01" error={errors.name} />
                  </FieldWrap>
                  <FieldWrap label="Tipe" error={errors.type} required>
                    <SelectInput value={form.type} onChange={e => set('type', e.target.value)} options={DEVICE_TYPES} error={errors.type} />
                  </FieldWrap>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FieldWrap label="IP Address" error={errors.ip} required>
                    <TextInput value={form.ip} onChange={e => set('ip', e.target.value)} placeholder="mis. 10.0.0.1" mono error={errors.ip} />
                  </FieldWrap>
                  <FieldWrap label="Status">
                    <SelectInput value={form.status} onChange={e => set('status', e.target.value)} options={STATUS_OPTS} />
                  </FieldWrap>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FieldWrap label="Vendor">
                    <VendorCombobox
                      value={form.vendor}
                      onChange={v => set('vendor', v)}
                      savedVendors={savedVendors}
                    />
                  </FieldWrap>
                  <FieldWrap label="Model" hint="Boleh kosong, bisa diisi otomatis saat sinkronisasi">
                    <TextInput value={form.model} onChange={e => set('model', e.target.value)} placeholder="mis. Catalyst 9300" />
                  </FieldWrap>
                </div>

                <FieldWrap label="Lokasi">
                  <TextInput value={form.location} onChange={e => set('location', e.target.value)} placeholder="mis. DC-Rack-A1, Gedung B" />
                </FieldWrap>

                {isEdit && (
                  <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px]">
                    <AlertCircle size={12} className="mt-0.5 shrink-0" />
                    <span>
                      Mengubah IP Address akan otomatis memperbarui record IPAM Host jika ada.
                      Pastikan tidak ada konflik IP di jaringan sebelum menyimpan.
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <FieldWrap label="Latitude" error={errors.lat} hint="mis. -6.2088">
                    <TextInput
                      value={form.lat}
                      onChange={e => set('lat', e.target.value)}
                      placeholder="-6.2088"
                      mono
                      error={errors.lat}
                    />
                  </FieldWrap>
                  <FieldWrap label="Longitude" error={errors.lng} hint="mis. 106.8456">
                    <TextInput
                      value={form.lng}
                      onChange={e => set('lng', e.target.value)}
                      placeholder="106.8456"
                      mono
                      error={errors.lng}
                    />
                  </FieldWrap>
                </div>

                <FieldWrap label="Catatan">
                  <textarea
                    value={form.notes}
                    onChange={e => set('notes', e.target.value)}
                    placeholder="Catatan opsional…"
                    rows={3}
                    className={inputClass(false, 'resize-none')}
                  />
                </FieldWrap>
              </>
            )}

            {/* ════ MANAGEMENT TAB ════ */}
            {tab === 'Management' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <FieldWrap label="Protokol Management">
                    <SelectInput
                      value={form.mgmtProtocol}
                      onChange={e => set('mgmtProtocol', e.target.value)}
                      options={PROTOCOL_OPTS}
                    />
                  </FieldWrap>
                  <FieldWrap
                    label="Port"
                    error={errors.mgmtPort}
                    hint={portEdited ? 'Port diset manual' : 'Mengikuti protokol'}
                  >
                    <div className="relative">
                      <TextInput
                        value={form.mgmtPort}
                        onChange={e => setPort(e.target.value)}
                        placeholder={String(PROTOCOL_OPTS.find(p => p.value === form.mgmtProtocol)?.defaultPort ?? '—')}
                        mono
                        error={errors.mgmtPort}
                      />
                      {portEdited && (
                        <button
                          type="button"
                          title="Reset ke default protokol"
                          onClick={() => {
                            const proto = PROTOCOL_OPTS.find(p => p.value === form.mgmtProtocol)
                            setPortEdited(false)
                            setForm(f => ({ ...f, mgmtPort: proto?.defaultPort ? String(proto.defaultPort) : '' }))
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-[var(--accent)] hover:underline"
                        >
                          reset
                        </button>
                      )}
                    </div>
                  </FieldWrap>
                </div>

                {/* SSH / TELNET / API / WEB credentials */}
                {needsLogin && (
                  <>
                    <div className="pt-1 border-t border-[var(--border)]">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-3">Kredensial Login</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldWrap label="Username">
                        <TextInput
                          value={form.mgmtUsername}
                          onChange={e => set('mgmtUsername', e.target.value)}
                          placeholder="mis. admin"
                          mono
                        />
                      </FieldWrap>
                      <FieldWrap
                        label="Password"
                        hint={isEdit && device?.hasPassword ? 'Kosongkan jika tidak ingin mengubah' : undefined}
                      >
                        <PasswordInput
                          value={form.mgmtPassword}
                          onChange={e => set('mgmtPassword', e.target.value)}
                          placeholder={isEdit && device?.hasPassword ? '••••••••' : 'Password'}
                        />
                      </FieldWrap>
                    </div>
                  </>
                )}

                {/* SNMP fields */}
                {isSNMP && (
                  <>
                    <div className="pt-1 border-t border-[var(--border)]">
                      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-3">Konfigurasi SNMP</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <FieldWrap label="SNMP Version">
                        <SelectInput
                          value={form.snmpVersion}
                          onChange={e => set('snmpVersion', e.target.value)}
                          options={SNMP_VERSIONS.map(v => ({ value: v, label: v.toUpperCase() }))}
                        />
                      </FieldWrap>
                      <FieldWrap
                        label="Community String"
                        hint={isEdit && device?.hasSnmpCommunity ? 'Kosongkan jika tidak ingin mengubah' : undefined}
                      >
                        <PasswordInput
                          value={form.snmpCommunity}
                          onChange={e => set('snmpCommunity', e.target.value)}
                          placeholder={isEdit && device?.hasSnmpCommunity ? '••••••••' : 'public'}
                        />
                      </FieldWrap>
                    </div>
                  </>
                )}

                {!form.mgmtProtocol && (
                  <p className="py-6 text-center text-muted text-xs">
                    Pilih protokol untuk menampilkan opsi kredensial.
                  </p>
                )}
              </>
            )}

            {/* ════ OLT CONFIG TAB ════ */}
            {tab === 'OLT Config' && (
              <>
                <div className="p-3 rounded-lg bg-[var(--accent-glow)] border border-[var(--accent)]/20 text-xs text-secondary mb-2">
                  Konfigurasi khusus OLT. <strong>PON Count</strong> menentukan jumlah port PON yang tersedia
                  dan digunakan sebagai referensi saat ODC memilih uplink ke OLT ini.
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FieldWrap label="Jumlah Port PON" error={errors.ponCount} required hint="mis. 16 untuk OLT 16-PON">
                    <TextInput
                      value={form.ponCount}
                      onChange={e => set('ponCount', e.target.value)}
                      placeholder="mis. 16"
                      mono
                      error={errors.ponCount}
                    />
                  </FieldWrap>
                  <FieldWrap label="Kapasitas per PON" error={errors.ponCapacity} hint="Maks ONU per port PON (mis. 128)">
                    <TextInput
                      value={form.ponCapacity}
                      onChange={e => set('ponCapacity', e.target.value)}
                      placeholder="mis. 128"
                      mono
                      error={errors.ponCapacity}
                    />
                  </FieldWrap>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FieldWrap label="Slot / Chassis" hint="Opsional, mis. 0/1">
                    <TextInput
                      value={form.oltSlot ?? ''}
                      onChange={e => set('oltSlot', e.target.value)}
                      placeholder="mis. 0/1"
                      mono
                    />
                  </FieldWrap>
                  {form.ponCount && form.ponCapacity && !isNaN(Number(form.ponCount)) && !isNaN(Number(form.ponCapacity)) && (
                    <div className="flex flex-col justify-center">
                      <p className="text-[10px] text-muted">Total kapasitas OLT</p>
                      <p className="text-sm font-bold text-primary font-mono">
                        {Number(form.ponCount) * Number(form.ponCapacity)} <span className="text-[10px] text-muted font-normal">ONU maks</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* PON port preview */}
                {form.ponCount > 0 && !isNaN(Number(form.ponCount)) && (
                  <div>
                    <p className="text-[10px] text-muted mb-2">Preview port PON yang akan tersedia:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: Math.min(Number(form.ponCount), 32) }, (_, i) => (
                        <span key={i} className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border)] text-secondary">
                          PON{i + 1}
                        </span>
                      ))}
                      {Number(form.ponCount) > 32 && (
                        <span className="text-[10px] text-muted px-2 py-0.5">+{Number(form.ponCount) - 32} lagi…</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ════ UPLINK TAB ════ */}
            {tab === 'Uplink' && (
              <>
                <div className="p-3 rounded-lg bg-[var(--accent-glow)] border border-[var(--accent)]/20 text-xs text-secondary mb-2">
                  Definisikan koneksi fisik dari port device ini ke device uplink (parent).
                  Satu port hanya bisa memiliki satu uplink.
                </div>

                {uplinks.length === 0 ? (
                  <div className="py-8 text-center text-muted text-xs">
                    Belum ada uplink terdefinisi.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {uplinks.map((link, i) => (
                      <UplinkRow
                        key={i}
                        idx={i}
                        link={link}
                        deviceList={deviceList}
                        onChange={(k, v) => setUplink(i, k, v)}
                        onDelete={() => delUplink(i)}
                      />
                    ))}
                  </div>
                )}

                <Button
                  variant="outline" size="sm" icon={Plus}
                  onClick={addUplink}
                  className="w-full mt-2"
                >
                  Tambah Uplink
                </Button>
              </>
            )}

          </CardBody>
        </div>

        {/* ── Footer actions ── */}
        <div className="flex gap-2 px-4 pb-4 pt-3 border-t border-[var(--border)] shrink-0">
          {/* Tab navigation */}
          <Button
            variant="ghost" size="sm"
            onClick={() => setTab(TABS[TABS.indexOf(tab) - 1])}
            disabled={TABS.indexOf(tab) === 0 || isSaving}
          >
            ← Prev
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() => setTab(TABS[TABS.indexOf(tab) + 1])}
            disabled={TABS.indexOf(tab) === TABS.length - 1 || isSaving}
          >
            Next →
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            Batal
          </Button>
          <Button
            variant="primary" size="sm"
            icon={isSaving ? Loader2 : Check}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Menyimpan…' : isEdit ? 'Simpan' : 'Buat Device'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
