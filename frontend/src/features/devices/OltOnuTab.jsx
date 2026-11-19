import React, { useState, useEffect, useCallback, useRef, memo } from 'react'
import {
  Loader2, Signal, Wifi, WifiOff, ChevronDown, ChevronRight,
  RefreshCw, Zap, RotateCcw, User, UserPlus, CheckCircle2,
  AlertTriangle, Copy, Check, ExternalLink, ShieldAlert
} from 'lucide-react'
import { Link } from 'react-router-dom'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { useOltOnus, useOltOnuDetail } from './useDriverSnapshot'
import { api } from '../../lib/api'
import ZtpProvisionModal from './ZtpProvisionModal'

// ── Friendly PON / ONU labels ────────────────────────────────────────────────
function ponLabel(portOrId) {
  if (!portOrId) return portOrId
  const stripped = String(portOrId).replace(/:\d+$/, '')
  const m = stripped.match(/(\d+)$/)
  return m ? `PON-${Number(m[1])}` : portOrId
}

function onuLabel(index) {
  if (!index) return index
  const m = String(index).match(/:(\d+)$/)
  return m ? `ONU-${Number(m[1])}` : index
}

// ── Signal power color ─────────────────────────────────────────────────────
function powerColor(dbm) {
  if (dbm === null || dbm === undefined) return 'text-muted'
  if (dbm >= -20) return 'text-emerald-400'
  if (dbm >= -25) return 'text-amber-400'
  return 'text-rose-400'
}

function onuPowerColor(dbm) {
  if (dbm === null || dbm === undefined) return 'text-muted'
  if (dbm > -18) return 'text-purple-400'
  if (dbm < -27) return 'text-rose-400'
  if (dbm < -25) return 'text-amber-400'
  return 'text-emerald-400'
}

function fmtDbm(v) {
  if (v === null || v === undefined) return '—'
  return `${Number(v).toFixed(1)} dBm`
}

// ── ONU Detail Drawer ──────────────────────────────────────────────────────
function OnuDetailDrawer({ deviceId, onuIndex, onClose, onRebootSuccess, onZtpClick }) {
  const { data, loading, error, fetch: refetch } = useOltOnuDetail(deviceId, onuIndex)
  const [rebooting, setRebooting] = useState(false)
  const [rebootMsg, setRebootMsg] = useState('')
  const detail = data?.detail
  const power  = data?.power
  const macs   = data?.macs ?? []

  const handleReboot = async () => {
    if (!window.confirm(`Yakin ingin merestart/reboot ONU ${onuIndex}?`)) return
    setRebooting(true)
    setRebootMsg('')
    try {
      const res = await api.post(`/driver/${deviceId}/olt/onu/${encodeURIComponent(onuIndex)}/reboot`)
      setRebootMsg(res.message || 'Perintah reboot berhasil dikirim')
      if (onRebootSuccess) onRebootSuccess()
    } catch (e) {
      alert(`Gagal reboot: ${e.message}`)
    } finally {
      setRebooting(false)
    }
  }

  return (
    <div className="mt-1 mb-2 mx-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="font-mono font-semibold text-primary text-[11px]">{ponLabel(onuIndex)} · {onuLabel(onuIndex)}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleReboot}
            disabled={rebooting}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
            title="Reboot ONU"
          >
            <RotateCcw size={10} className={rebooting ? 'animate-spin' : ''} />
            <span>{rebooting ? 'Rebooting…' : 'Reboot'}</span>
          </button>
          {onZtpClick && (
            <button
              onClick={() => onZtpClick(detail || { index: onuIndex, port: onuIndex.split(':')[0], onuId: parseInt(onuIndex.split(':')[1]) })}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
            >
              <Zap size={10} />
              <span>Aktivasi ZTP</span>
            </button>
          )}
          <button onClick={refetch} disabled={loading} className="text-muted hover:text-primary transition-colors disabled:opacity-40 ml-1">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors text-sm leading-none ml-1">✕</button>
        </div>
      </div>

      {rebootMsg && (
        <div className="px-3 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20 text-emerald-400 text-[10px] flex items-center gap-1.5">
          <CheckCircle2 size={12} />
          <span>{rebootMsg}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="py-6 flex justify-center"><Loader2 size={16} className="animate-spin text-muted" /></div>
      ) : error ? (
        <div className="px-3 py-3 text-rose-400 text-[11px]">{error}</div>
      ) : detail ? (
        <div className="divide-y divide-[var(--border)]">
          {/* Info grid */}
          <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {[
              ['Nama',       detail.name],
              ['SN',         detail.sn],
              ['MAC',        detail.mac],
              ['Tipe',       detail.type],
              ['Status',     detail.phaseState],
              ['Jarak',      detail.distance != null ? `${detail.distance} m` : null],
              ['Online',     detail.onlineDuration],
              ['Suhu',       detail.temperature != null ? `${detail.temperature}°C` : null],
              ['Voltage',    detail.voltage    != null ? `${detail.voltage} V`    : null],
              ['Dereg',      detail.lastDeregReason],
              ['Last Reg',   detail.lastSeen],
              ['Deskripsi',  detail.description],
            ].filter(([, v]) => v != null && v !== '').map(([label, val]) => (
              <div key={label}>
                <p className="text-[9px] text-muted uppercase tracking-wide">{label}</p>
                <p className="text-[11px] text-primary font-medium break-all">{val}</p>
              </div>
            ))}
          </div>

          {/* Optical power */}
          {power && (
            <div className="px-3 py-2">
              <p className="text-[9px] text-muted uppercase tracking-wide mb-1.5">Optical Power</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded bg-[var(--surface)] px-2 py-1.5">
                  <p className="text-[9px] text-muted mb-0.5">OLT Rx ↑ upstream</p>
                  <p className={`text-sm font-bold font-mono ${powerColor(power.oltRxPower)}`}>
                    {fmtDbm(power.oltRxPower)}
                  </p>
                  <p className="text-[9px] text-muted mt-0.5">ONU Tx: {fmtDbm(power.onuTxPower)}</p>
                  {power.temperature != null && (
                    <p className="text-[9px] text-muted">Suhu: {power.temperature}°C &middot; {power.voltage}V</p>
                  )}
                </div>
                <div className="rounded bg-[var(--surface)] px-2 py-1.5">
                  <p className="text-[9px] text-muted mb-0.5">ONU Rx ↓ downstream</p>
                  <p className={`text-sm font-bold font-mono ${onuPowerColor(power.onuRxPower)}`}>
                    {fmtDbm(power.onuRxPower)}
                  </p>
                  <p className="text-[9px] text-muted mt-0.5">OLT Tx: {fmtDbm(power.oltTxPower)}</p>
                  {power.distance != null && (
                    <p className="text-[9px] text-muted">Jarak: {power.distance} m</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MAC addresses */}
          {macs.length > 0 && (
            <div className="px-3 py-2">
              <p className="text-[9px] text-muted uppercase tracking-wide mb-1">MAC Address</p>
              <div className="flex flex-col gap-1">
                {macs.map((m, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-mono text-primary break-all">{m.mac}</span>
                    {m.vlan != null && <Badge variant="neutral" className="text-[9px]">VLAN {m.vlan}</Badge>}
                    {m.type && <span className="text-muted">{m.type}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ── Sequential queue for ONU detail fetches ─────────────────────────────────
const detailQueue = { queue: [], running: false, cache: {} }

function enqueueDetailFetch(deviceId, onuIndex) {
  const key = `${deviceId}:${onuIndex}`
  if (detailQueue.cache[key]) return Promise.resolve(detailQueue.cache[key])

  return new Promise((resolve) => {
    detailQueue.queue.push({ deviceId, onuIndex, key, resolve })
    processQueue()
  })
}

async function processQueue() {
  if (detailQueue.running || detailQueue.queue.length === 0) return
  detailQueue.running = true
  const { deviceId, onuIndex, key, resolve } = detailQueue.queue.shift()
  try {
    const data = await api.get(`/driver/${deviceId}/olt/onu/${encodeURIComponent(onuIndex)}`)
    detailQueue.cache[key] = data
    resolve(data)
  } catch {
    resolve(null)
  }
  detailQueue.running = false
  processQueue()
}

function useOnuInlineDetail(deviceId, onuIndex, enabled) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const fetched = useRef(false)

  useEffect(() => {
    if (!enabled || !deviceId || !onuIndex || fetched.current) return
    fetched.current = true
    setLoading(true)
    enqueueDetailFetch(deviceId, onuIndex)
      .then(d => { if (d) setData(d) })
      .finally(() => setLoading(false))
  }, [enabled, deviceId, onuIndex])

  return { data, loading }
}

// ── ONU Row (Desktop 5-col | Mobile 3-col) ──────────────────────────────────
function OnuRow({ onu, deviceId, expanded, onToggle, fetchDetail, onZtpClick }) {
  const { data, loading: detailLoading } = useOnuInlineDetail(deviceId, onu.index, fetchDetail)
  const power  = data?.power
  const detail = data?.detail
  const macs   = data?.macs ?? []
  const vlan   = macs[0]?.vlan ?? null

  return (
    <>
      <div
        className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 sm:gap-x-3 items-center py-2 px-2.5 border-b border-[var(--border)]/40 last:border-0 cursor-pointer hover:bg-[var(--surface-2)]/50 rounded transition-colors"
        onClick={onToggle}
      >
        {/* Col 1: Index / Name / Mapping */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted shrink-0 w-3">
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono font-semibold text-primary">
                {onuLabel(onu.index)}
              </span>
              {onu.name ? (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-medium truncate max-w-[120px]">
                  {onu.name}
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 font-medium">
                  Unprovisioned
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted truncate font-mono mt-0.5">
              {onu.mac || '—'}
            </p>
          </div>
        </div>

        {/* Col 2 desktop: Tx / VLAN */}
        <div className="hidden sm:block text-right min-w-[70px]">
          <p className={`text-[11px] font-mono font-medium ${power ? powerColor(power.onuTxPower) : 'text-muted'}`}>
            {power ? fmtDbm(power.onuTxPower) : detailLoading ? '···' : '—'}
          </p>
          <p className="text-[10px] text-muted">
            {vlan != null ? `VLAN ${vlan}` : detailLoading ? '···' : '—'}
          </p>
        </div>

        {/* Col 3 desktop / Col 2 mobile: Rx */}
        <div className="text-right">
          <p className={`text-[11px] font-mono font-bold ${power ? onuPowerColor(power.onuRxPower) : 'text-muted'}`}>
            {power ? fmtDbm(power.onuRxPower) : detailLoading ? '···' : '—'}
          </p>
          <p className="hidden sm:block text-[10px] text-muted">
            {detail?.distance != null ? `${detail.distance}m` : detailLoading ? '···' : '—'}
          </p>
          <span className="sm:hidden">
            <Badge variant={onu.online ? 'online' : 'offline'} className="text-[9px] rounded-full">
              {onu.online ? 'on' : 'off'}
            </Badge>
          </span>
        </div>

        {/* Col 4 desktop: Status */}
        <div className="hidden sm:flex flex-col items-end gap-0.5 min-w-[65px]">
          <Badge variant={onu.online ? 'online' : 'offline'} className="shrink-0 text-[9px] rounded-full">
            {['working','online'].includes(onu.phaseState?.toLowerCase()) ? 'online' : onu.phaseState?.toLowerCase() ?? 'offline'}
          </Badge>
          <p className="text-[9px] text-muted truncate max-w-[80px]">
            {detail?.onlineDuration ?? (detailLoading ? '···' : '—')}
          </p>
        </div>

        {/* Col 5: Dereg / Action */}
        <div className="text-right min-w-[60px] sm:min-w-[80px]">
          <p className={`text-[10px] font-medium truncate max-w-[80px] ${onu.lastDeregReason ? 'text-amber-400' : 'text-muted'}`}>
            {onu.lastDeregReason ?? '—'}
          </p>
          <p className="text-[9px] text-muted">dereg</p>
        </div>
      </div>

      {expanded && (
        <OnuDetailDrawer
          deviceId={deviceId}
          onuIndex={onu.index}
          onClose={onToggle}
          onZtpClick={onZtpClick}
        />
      )}
    </>
  )
}

// ── Main ONU Tab with ZTP / Autofind ───────────────────────────────────────
function OltOnuTab({ deviceId, ponPorts }) {
  const [subTab, setSubTab] = useState('ztp') // 'ztp' | 'all'
  const [selectedPort, setSelectedPort] = useState(ponPorts?.[0]?.port ?? '1/1/1')
  const [expandedOnu, setExpandedOnu] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  // ZTP Modal state
  const [ztpModalOpen, setZtpModalOpen] = useState(false)
  const [activeZtpOnu, setActiveZtpOnu] = useState(null)

  // Autofind data state
  const [autofindData, setAutofindData] = useState(null)
  const [autofindLoading, setAutofindLoading] = useState(false)
  const [autofindError, setAutofindError] = useState('')
  const [ztpSuccessMsg, setZtpSuccessMsg] = useState('')

  // Regular ONU list hook
  const { onus, loading: onusLoading, error: onusError, fetchedAt, fetch: loadOnus } = useOltOnus(deviceId, selectedPort)

  // Sync default port once ponPorts becomes available
  useEffect(() => {
    if (ponPorts?.length > 0) setSelectedPort(p => p === '1/1/1' ? ponPorts[0].port : p)
  }, [ponPorts])

  // Fetch Autofind data
  const loadAutofind = useCallback(async () => {
    setAutofindLoading(true)
    setAutofindError('')
    try {
      const res = await api.get(`/driver/${deviceId}/olt/autofind`)
      setAutofindData(res)
    } catch (err) {
      setAutofindError(err.message || 'Gagal mengambil data autofind OLT')
    } finally {
      setAutofindLoading(false)
    }
  }, [deviceId])

  // Initial load autofind
  useEffect(() => {
    loadAutofind()
  }, [loadAutofind])

  const handleOpenZtp = (onu) => {
    setActiveZtpOnu(onu)
    setZtpModalOpen(true)
  }

  const handleZtpSuccess = (res) => {
    setZtpSuccessMsg(res.message || 'ONU berhasil di-provisioning!')
    setTimeout(() => setZtpSuccessMsg(''), 6000)
    loadAutofind()
    loadOnus()
  }

  const unprovisionedList = autofindData?.unprovisioned ?? []
  const provisionedList = autofindData?.provisioned ?? []

  const filteredOnus = (onus ?? []).filter(o => {
    if (filter === 'online'  && !o.online) return false
    if (filter === 'offline' &&  o.online) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        o.index?.toLowerCase().includes(q) ||
        o.name?.toLowerCase().includes(q)  ||
        o.mac?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const onlineCount  = (onus ?? []).filter(o => o.online).length
  const offlineCount = (onus ?? []).filter(o => !o.online).length

  const toggleOnu = (index) => setExpandedOnu(prev => prev === index ? null : index)

  return (
    <div className="space-y-3">
      {/* Success Notification */}
      {ztpSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between gap-2 shadow-lg animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="shrink-0" />
            <span className="font-medium">{ztpSuccessMsg}</span>
          </div>
          <button onClick={() => setZtpSuccessMsg('')} className="text-emerald-400/70 hover:text-emerald-400 text-sm">✕</button>
        </div>
      )}

      {/* Top Main Navigation Switcher */}
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2 flex-wrap gap-2">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
          <button
            onClick={() => setSubTab('ztp')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              subTab === 'ztp'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-muted hover:text-primary'
            }`}
          >
            <Zap size={14} className={unprovisionedList.length > 0 ? 'text-amber-300' : ''} />
            <span>ZTP / Autofind</span>
            {unprovisionedList.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                subTab === 'ztp' ? 'bg-amber-400 text-black' : 'bg-amber-500/20 text-amber-400'
              }`}>
                {unprovisionedList.length} Baru
              </span>
            )}
          </button>

          <button
            onClick={() => setSubTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              subTab === 'all'
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'text-muted hover:text-primary'
            }`}
          >
            <span>Semua ONU</span>
            {autofindData?.totalOnus != null && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                subTab === 'all' ? 'bg-white/20' : 'bg-[var(--border)]'
              }`}>
                {autofindData.totalOnus}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'ztp' ? (
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={loadAutofind}
              disabled={autofindLoading}
              className="text-xs"
            >
              {autofindLoading ? 'Memindai…' : 'Scan Ulang OLT'}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={loadOnus}
              disabled={onusLoading}
              className="text-xs"
            >
              {onusLoading ? 'Loading…' : 'Refresh'}
            </Button>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 1: ZTP / AUTOFIND (NEW ONUS AWAITING PROVISIONING)            */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subTab === 'ztp' && (
        <div className="space-y-3">
          {/* Summary KPI Banner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
              <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Belum Terdaftar (Pending)</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xl font-bold font-mono text-amber-400">{unprovisionedList.length}</span>
                <span className="text-[10px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full">Siap ZTP</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
              <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Sudah Terdaftar</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xl font-bold font-mono text-emerald-400">{provisionedList.length}</span>
                <span className="text-[10px] text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded-full">Mapped</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)]">
              <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Total Online OLT</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xl font-bold font-mono text-primary">{autofindData?.totalOnus ?? '—'}</span>
                <span className="text-[10px] text-muted">4 PON Ports</span>
              </div>
            </div>
          </div>

          {autofindLoading && !autofindData ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted">
              <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
              <p className="text-xs font-medium text-primary">Memindai seluruh port PON pada OLT-VSOL…</p>
              <p className="text-[10px]">Membaca tabel ONU dan redaman optik live</p>
            </div>
          ) : autofindError ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
              {autofindError}
            </div>
          ) : unprovisionedList.length === 0 ? (
            <div className="py-12 text-center rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-6 space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 size={24} />
              </div>
              <h4 className="text-sm font-semibold text-primary">Seluruh ONU Sudah Terdaftar!</h4>
              <p className="text-xs text-muted max-w-sm mx-auto">
                Tidak ada modem ONU baru yang belum dipetakan. Saat teknisi mencolokkan modem baru di lapangan, klik <strong>Scan Ulang OLT</strong> untuk mendeteksinya.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted px-1">
                <span>Ditemukan <strong>{unprovisionedList.length}</strong> modem belum terdaftar di pelanggan:</span>
              </div>

              {/* Unprovisioned Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {unprovisionedList.map((item) => (
                  <div
                    key={item.index}
                    className="p-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--accent)]/50 transition-all space-y-3 shadow-sm"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-primary text-sm px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)]">
                          {ponLabel(item.port)} · {onuLabel(item.index)}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-400 font-semibold">
                          {item.vendor || 'Generic'}
                        </span>
                      </div>
                      <Badge variant="warning" className="text-[10px]">
                        Pending ZTP
                      </Badge>
                    </div>

                    {/* Hardware & Signal Details */}
                    <div className="grid grid-cols-2 gap-2 text-xs py-1 border-y border-[var(--border)]/40">
                      <div>
                        <p className="text-[10px] text-muted">MAC Address</p>
                        <p className="font-mono text-primary font-semibold text-[11px] truncate">{item.mac || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted">Redaman Rx Power</p>
                        <p className={`font-mono font-bold text-[12px] ${
                          item.rxPower != null && item.rxPower >= -24
                            ? 'text-emerald-400'
                            : item.rxPower != null && item.rxPower >= -27
                              ? 'text-amber-400'
                              : 'text-rose-400'
                        }`}>
                          {item.rxPower != null ? `${item.rxPower.toFixed(2)} dBm` : '—'}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] text-muted">Jarak Optik</p>
                        <p className="font-medium text-primary text-[11px]">
                          {item.opticalDistance != null ? `${item.opticalDistance} meter` : '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted">Uptime / Alive</p>
                        <p className="font-medium text-muted text-[11px]">{item.aliveTime || '—'}</p>
                      </div>
                    </div>

                    {/* Smart Suggestion */}
                    {item.suggestedCustomer && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-xs flex items-center gap-2">
                        <User size={13} className="text-[var(--accent)] shrink-0" />
                        <span className="text-muted text-[11px]">
                          Saran Pelanggan: <strong className="text-[var(--accent)]">{item.suggestedCustomer.name}</strong> ({item.suggestedCustomer.pppoeUsername})
                        </span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-muted">
                        {item.name ? `Nama OLT: "${item.name}"` : 'Belum ada nama di OLT'}
                      </span>
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Zap}
                        onClick={() => handleOpenZtp(item)}
                        className="bg-[var(--accent)] text-white hover:opacity-90 text-xs"
                      >
                        ⚡ Aktivasi ZTP
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 2: SEMUA ONU TERPASANG (PER-PON PORT BROWSER)                  */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {subTab === 'all' && (
        <div className="space-y-2">
          {/* PON Port selector */}
          {ponPorts && ponPorts.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              {ponPorts.map(p => (
                <button
                  key={p.port}
                  onClick={() => { setSelectedPort(p.port); setExpandedOnu(null); setSearch('') }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-all ${
                    selectedPort === p.port
                      ? 'bg-[var(--accent)] text-white'
                      : 'bg-[var(--surface-2)] text-muted hover:text-primary'
                  }`}
                >
                  {ponLabel(p.port)}
                  {p.totalOnu > 0 && (
                    <span className={`text-[9px] rounded-full px-1.5 ${
                      selectedPort === p.port ? 'bg-white/20' : 'bg-[var(--border)]'
                    }`}>
                      {p.onlineOnu}/{p.totalOnu}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Filter + search */}
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex gap-1 text-[10px]">
              <button
                onClick={() => setFilter('all')}
                className={`px-2 py-0.5 rounded transition-colors ${filter === 'all' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-muted hover:text-primary'}`}
              >
                Semua {onus ? `(${onus.length})` : ''}
              </button>
              <button
                onClick={() => setFilter('online')}
                className={`px-2 py-0.5 rounded transition-colors ${filter === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'text-muted hover:text-primary'}`}
              >
                On {onus ? `(${onlineCount})` : ''}
              </button>
              <button
                onClick={() => setFilter('offline')}
                className={`px-2 py-0.5 rounded transition-colors ${filter === 'offline' ? 'bg-rose-500/20 text-rose-400' : 'text-muted hover:text-primary'}`}
              >
                Off {onus ? `(${offlineCount})` : ''}
              </button>
            </div>

            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cari nama / MAC…"
              className="flex-1 min-w-[120px] max-w-[200px] text-[10px] px-2.5 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
            />
          </div>

          {/* ONU List Table */}
          {onusLoading && !onus ? (
            <div className="py-10 flex flex-col items-center gap-2 text-muted">
              <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
              <span className="text-xs">Mengambil data ONU dari OLT…</span>
            </div>
          ) : onusError ? (
            <div className="py-6 text-center text-rose-400 text-xs">{onusError}</div>
          ) : filteredOnus.length === 0 ? (
            <div className="py-6 text-center text-muted text-xs">Tidak ada ONU yang cocok</div>
          ) : (
            <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)]">
              <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 sm:gap-x-3 items-center px-3 py-2 bg-[var(--surface-2)] border-b border-[var(--border)] text-[9px] text-muted uppercase tracking-wider font-semibold">
                <span>Port / Index / Identitas</span>
                <span className="hidden sm:block text-right min-w-[70px]">Tx / VLAN</span>
                <span className="text-right">Rx Sinyal</span>
                <span className="hidden sm:block text-right min-w-[65px]">Status</span>
                <span className="text-right min-w-[60px] sm:min-w-[80px]">Dereg Reason</span>
              </div>
              <div className="divide-y divide-[var(--border)]/30">
                {filteredOnus.map(onu => (
                  <OnuRow
                    key={onu.index}
                    onu={onu}
                    deviceId={deviceId}
                    expanded={expandedOnu === onu.index}
                    onToggle={() => toggleOnu(onu.index)}
                    fetchDetail={true}
                    onZtpClick={() => handleOpenZtp({
                      ...onu,
                      port: selectedPort,
                      onuId: parseInt(onu.index.split(':')[1]),
                    })}
                  />
                ))}
              </div>
            </div>
          )}

          {fetchedAt && (
            <p className="text-[9px] text-muted text-right">
              Terakhir diperbarui: {fetchedAt.toLocaleTimeString('id-ID')}
            </p>
          )}
        </div>
      )}

      {/* ZTP Provision Modal */}
      {ztpModalOpen && activeZtpOnu && (
        <ZtpProvisionModal
          deviceId={deviceId}
          onu={activeZtpOnu}
          unassignedCustomers={autofindData?.unassignedCustomers ?? []}
          odps={autofindData?.odps ?? []}
          onClose={() => {
            setZtpModalOpen(false)
            setActiveZtpOnu(null)
          }}
          onSuccess={handleZtpSuccess}
        />
      )}
    </div>
  )
}

export default memo(OltOnuTab)
