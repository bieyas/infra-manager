import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Loader2, ArrowDown, ArrowUp,
  AlertCircle, ChevronRight, RefreshCw,
  Terminal, Radio, BellRing, Pencil, Trash2,
  Wifi, WifiOff, Activity, MemoryStick, Zap, Network,
  Search, TrendingDown, Clock,
} from 'lucide-react'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import StatusDot from '../../components/ui/StatusDot'
import ProgressBar from '../../components/ui/ProgressBar'
import NetworkTools from '../../components/ui/NetworkTools'
import { TYPE_ICON, TYPE_LABEL, STATUS_COLOR, STATUS_LABEL } from './constants'
import { useDeviceDetail, updateDevice, deleteDevice, syncUplinks } from './useDevices'
import { useProbe } from './useProbe'
import { useDriverSnapshot, useDriverExec } from './useDriverSnapshot'
import { LiveTab, SessionTab, RoutesTab, NeighborsTab, IpAddressTab, ExecPanel } from './DriverTabs'
import OltOnuTab from './OltOnuTab'
import OltPowerTab from './OltPowerTab'
import { SEV_CONFIG } from '../alerts/constants'
import DeviceForm from './DeviceForm'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(kbps) {
  if (!kbps || kbps === 0) return '—'
  if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(1)} Gbps`
  if (kbps >= 1_000)     return `${(kbps / 1_000).toFixed(0)} Mbps`
  return `${kbps} Kbps`
}

function fmtBytes(b) {
  if (!b) return '—'
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

function fmtUptime(seconds) {
  if (!seconds) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${d}d ${h}h ${m}m`
}

// ── Sub-components ───────────────────────────────────────────────────────────
function InfoRow({ label, value, mono = false }) {
  return (
    <div>
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`text-xs text-primary font-medium mt-0.5 ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </p>
    </div>
  )
}

function ResourceBar({ label, value, max = 100 }) {
  const pct = value ?? 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] text-muted">
        <span>{label}</span><span>{pct}%</span>
      </div>
      <ProgressBar
        value={pct} max={max}
        colorClass={pct >= 80 ? 'bg-rose-500' : pct >= 60 ? 'bg-amber-400' : 'bg-[var(--accent)]'}
      />
    </div>
  )
}

function InterfaceRow({ iface, isLive }) {
  // Support both live snapshot fields (running/rxBytes/txBytes) and DB fields
  const isUp = isLive
    ? (iface.running === true || iface.running === 'true')
    : ['online', 'UP', 'up'].includes(iface.status ?? iface.operStatus ?? '')
  const disabled  = iface.disabled === true || iface.disabled === 'true'
  const hasErrors = (iface.rxError ?? iface.txError ?? iface.errors ?? iface.inErrors ?? 0) > 0

  const rxVal = isLive ? fmtBytes(iface.rxBytes) : fmt(iface.inRate ?? iface.inKbps)
  const txVal = isLive ? fmtBytes(iface.txBytes) : fmt(iface.outRate ?? iface.outKbps)
  const hasTraffic = isLive ? (iface.rxBytes > 0 || iface.txBytes > 0) : !!(iface.inRate || iface.inKbps)

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2.5 px-4 border-b border-[var(--border)]/40 last:border-0 hover:bg-[var(--accent-glow)] transition-colors">
      {/* Status dot */}
      <StatusDot status={disabled ? 'neutral' : isUp ? 'online' : 'offline'} pulse={isUp && !disabled} size="sm" />

      {/* Name + meta */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold text-primary">{iface.name}</p>
          {iface.comment && (
            <span className="text-[10px] text-[var(--accent)] truncate max-w-[160px]">{iface.comment}</span>
          )}
          {iface.slave && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--surface-2)] text-muted">slave</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted flex-wrap">
          {iface.type && <span className="font-mono">{iface.type}</span>}
          {iface.macAddress && (
            <span className="font-mono hidden sm:inline">{iface.macAddress}</span>
          )}
          {iface.mtu > 0 && <span className="hidden md:inline">MTU {iface.mtu}</span>}
          {iface.vlan ? <span className="text-[var(--accent)]">VLAN {iface.vlan}</span> : null}
          {(iface.linkDowns ?? 0) > 0 && (
            <span className="flex items-center gap-0.5 text-amber-400">
              <TrendingDown size={9} />{iface.linkDowns}
            </span>
          )}
          {iface.lastLinkUp && isUp && (
            <span className="hidden md:inline text-muted/60">
              <Clock size={8} className="inline mr-0.5" />{iface.lastLinkUp}
            </span>
          )}
          {iface.lastLinkDown && !isUp && !disabled && (
            <span className="flex items-center gap-0.5 text-rose-400/70">
              <Clock size={9} />{iface.lastLinkDown}
            </span>
          )}
          {iface.description && !iface.comment && (
            <span className="text-muted/70 truncate max-w-[140px]">{iface.description}</span>
          )}
        </div>
      </div>

      {/* Traffic + status badge */}
      <div className="text-right shrink-0 space-y-0.5">
        {hasTraffic ? (
          <>
            <div className="flex items-center gap-1 justify-end text-[10px]">
              <ArrowDown size={8} className={isUp ? 'text-emerald-400' : 'text-muted'} />
              <span className="font-mono text-secondary">{rxVal}</span>
            </div>
            <div className="flex items-center gap-1 justify-end text-[10px]">
              <ArrowUp size={8} className={isUp ? 'text-[var(--accent)]' : 'text-muted'} />
              <span className="font-mono text-secondary">{txVal}</span>
            </div>
          </>
        ) : (
          <span className="text-[10px] font-mono text-muted">
            {iface.speed ?? '—'}
          </span>
        )}
        <div className="flex items-center justify-end gap-1">
          {hasErrors && (
            <AlertCircle size={10} className="text-amber-400" title={`Errors detected`} />
          )}
          <Badge variant={disabled ? 'neutral' : isUp ? 'online' : 'offline'} className="text-[9px]">
            {disabled ? 'dis' : isUp ? 'up' : 'dn'}
          </Badge>
        </div>
      </div>
    </div>
  )
}

function InterfacesTab({ ifaces, isLive, snapLoading, fetchSnapshot }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const ifaceUp       = ifaces.filter(i => i.running === true || i.running === 'true' ||
    ['online','UP','up'].includes(i.status ?? i.operStatus ?? '')).length
  const ifaceDisabled = ifaces.filter(i => i.disabled === true || i.disabled === 'true').length
  const ifaceDown     = ifaces.length - ifaceUp - ifaceDisabled

  const filtered = ifaces.filter(i => {
    const up       = i.running === true || i.running === 'true' ||
      ['online','UP','up'].includes(i.status ?? i.operStatus ?? '')
    const disabled = i.disabled === true || i.disabled === 'true'
    if (filter === 'up')       { if (!(up && !disabled)) return false }
    if (filter === 'down')     { if (!(!up && !disabled)) return false }
    if (filter === 'disabled') { if (!disabled) return false }
    if (search) {
      const q = search.toLowerCase()
      return (i.name ?? '').toLowerCase().includes(q) ||
             (i.comment ?? '').toLowerCase().includes(q) ||
             (i.description ?? '').toLowerCase().includes(q) ||
             (i.macAddress ?? '').toLowerCase().includes(q)
    }
    return true
  })

  return (
    <Card>
      {/* Header strip */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--border)] flex-wrap gap-y-2">
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Network size={13} /> Interfaces
        </span>
        {isLive
          ? <Badge variant="online" className="text-[9px]">live</Badge>
          : <Badge variant="neutral" className="text-[9px]">DB</Badge>
        }
        <span className="text-[10px] text-muted">
          <span className="text-emerald-400">{ifaceUp}</span>
          <span className="mx-0.5">/</span>
          <span>{ifaces.length}</span>
          {ifaceDisabled > 0 && <span className="ml-1 text-muted/60">{ifaceDisabled} dis</span>}
        </span>

        {/* Filter pills */}
        <div className="flex gap-1 ml-auto text-[9px]">
          {[
            ['all',      'Semua'],
            ['up',       `Up·${ifaceUp}`],
            ['down',     `Dn·${ifaceDown}`],
            ['disabled', `Dis·${ifaceDisabled}`],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`px-1.5 py-0.5 rounded transition-colors ${
                filter === key
                  ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                  : 'text-muted hover:text-primary'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {/* Refresh */}
        <button
          onClick={fetchSnapshot}
          disabled={snapLoading}
          className="text-muted hover:text-primary transition-colors disabled:opacity-40"
          title="Refresh live data"
        >
          <RefreshCw size={11} className={snapLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search bar */}
      <div className="px-4 py-2 border-b border-[var(--border)]/60">
        <div className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-2.5 py-1.5">
          <Search size={11} className="text-muted shrink-0" />
          <input
            type="text"
            placeholder="Cari interface, comment, MAC…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-xs text-primary placeholder-muted outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted hover:text-primary">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-1.5 text-[9px] text-muted uppercase tracking-widest border-b border-[var(--border)]/40">
        <span className="w-3" />
        <span>Interface / Info</span>
        <span className="text-right">Traffic / Status</span>
      </div>

      {/* Rows */}
      {snapLoading && ifaces.length === 0 ? (
        <CardBody>
          <div className="py-10 flex flex-col items-center gap-2 text-muted">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-xs">Mengambil data interface…</span>
          </div>
        </CardBody>
      ) : filtered.length === 0 ? (
        <CardBody>
          <div className="py-8 text-center text-muted text-xs">
            {ifaces.length === 0
              ? <>
                  Belum ada data interface.{' '}
                  <button onClick={fetchSnapshot} className="text-[var(--accent)] hover:underline">Ambil data live</button>
                </>
              : 'Tidak ada interface yang cocok.'}
          </div>
        </CardBody>
      ) : (
        <div>
          {filtered.map(iface => (
            <InterfaceRow key={iface.id ?? iface.name} iface={iface} isLive={isLive} />
          ))}
        </div>
      )}
    </Card>
  )
}

// "gpon-olt_1/1/1" or "1/1/1" → "PON-1"
function ponLabel(portOrId) {
  if (!portOrId) return portOrId
  const m = String(portOrId).match(/(\d+)\/(\d+)\/(\d+)/)
  return m ? `PON-${Number(m[3])}` : portOrId
}

// Static tabs always present
const STATIC_TABS        = ['Overview', 'Interfaces', 'Alerts']
const STATIC_TABS_OLT    = ['Overview', 'ONU List', 'Power', 'Alerts']

// Dynamic tabs added based on driver capabilities
function buildTabs(caps, isOlt = false) {
  const base = isOlt ? STATIC_TABS_OLT : STATIC_TABS
  if (!caps) return base
  const extra = []
  if (!isOlt && (caps.resource || caps.interfaces)) extra.push('Live')
  if (!isOlt && caps.ipAddresses)                   extra.push('IP Addr')
  if (!isOlt && caps.routes)                        extra.push('Routes')
  if (!isOlt && caps.neighbors)                     extra.push('Neighbors')
  if (!isOlt && caps.pppoeSessions)                 extra.push('Session')
  if (caps.exec)                                    extra.push('Console')
  return [...base, ...extra]
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function DeviceDetailPage() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const [tab,       setTab]       = useState('Overview')
  const [toolsOpen, setToolsOpen] = useState(false)
  const [toolTarget, setToolTarget] = useState('')
  const [editOpen,   setEditOpen]   = useState(false)
  const [saveError,  setSaveError]  = useState('')
  const [confirmDel, setConfirmDel] = useState(false)
  const [deleting,   setDeleting]   = useState(false)

  const { detail, loading, error, refresh } = useDeviceDetail(id)

  // ── Driver snapshot ───────────────────────────────────────────────────────
  const {
    snapshot, driverName, capabilities,
    loading: snapLoading, error: snapError, fetchedAt,
    fetch: fetchSnapshot, forceRefresh,
  } = useDriverSnapshot(id, { auto: true })
  const { exec: execCmd, result: execResult, loading: execLoading, error: execError } = useDriverExec(id)

  const isOlt = detail?.type === 'OLT'
  const TABS = buildTabs(capabilities, isOlt)

  // ── Probe / realtime status ───────────────────────────────────────────────
  // auto=true handles both initial probe + 30s interval internally
  const { probe, probing, result: probeResult } = useProbe(id, { pollMs: 30_000, auto: true })

  const handleSave = async (formData, uplinks = []) => {
    setSaveError('')
    try {
      await updateDevice(id, formData)
      if (uplinks.length > 0) await syncUplinks(id, uplinks)
      setEditOpen(false)
      refresh?.()
      return true
    } catch (err) {
      setSaveError(err.message ?? 'Gagal menyimpan')
      return null
    }
  }

  const handleDelete = async () => {
    setConfirmDel(false)
    setDeleting(true)
    try {
      await deleteDevice(id)
      navigate('/devices')
    } catch (err) {
      setSaveError(err.message ?? 'Gagal menghapus device')
      setDeleting(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted animate-fade-in">
        <Loader2 size={28} className="animate-spin" />
        <span className="text-sm">Memuat detail device…</span>
      </div>
    )
  }

  // ── Error / not found ────────────────────────────────────────────────────
  if (error || !detail) {
    return (
      <div className="p-4 flex flex-col items-center gap-4 animate-fade-in">
        <AlertCircle size={32} className="text-rose-400" />
        <p className="text-sm text-muted text-center">
          {error ?? 'Device tidak ditemukan.'}
        </p>
        <Button variant="outline" size="sm" icon={ArrowLeft} onClick={() => navigate('/devices')}>
          Kembali ke Devices
        </Button>
      </div>
    )
  }

  // Merge live probe result + snapshot into display values
  const d         = detail
  const Icon      = TYPE_ICON[d.type?.toLowerCase()] ?? TYPE_ICON.OTHER
  const liveAlive  = probeResult?.alive
  const liveStatus = liveAlive === true ? 'online' : liveAlive === false ? 'offline' : d.status?.toLowerCase()
  const s          = STATUS_COLOR[liveStatus] ?? STATUS_COLOR.offline
  const isAlive   = liveStatus === 'online' || liveStatus === 'warning'

  // Prefer live snapshot data over stale DB values
  const snapRes   = snapshot?.resource ?? {}
  const snapStat  = snapshot?.status   ?? {}
  const cpu    = snapRes.cpuLoad ?? snapRes.cpuPct ?? snapStat.cpuPct ?? d.cpuPct ?? d.cpu ?? null
  const memPct = snapRes.totalMemory > 0
    ? Math.round((1 - snapRes.freeMemory / snapRes.totalMemory) * 100)
    : (snapRes.memoryPct ?? snapStat.memPct ?? d.memPct ?? d.memory ?? null)
  const uptime = snapRes.uptime ?? snapStat.uptime ?? d.uptime ?? (d.uptimeSeconds ? fmtUptime(d.uptimeSeconds) : '—')
  const version = snapRes.version ?? snapStat.version ?? null
  const boardName = snapRes.boardName ?? snapStat.boardName ?? null

  // OLT: PON ports from snapshot
  const ponPorts   = isOlt && Array.isArray(snapshot?.ponPorts) ? snapshot.ponPorts : null
  const onuOnline  = snapshot?.globalOnline ?? (ponPorts ? ponPorts.reduce((s, p) => s + p.onlineOnu, 0) : null)
  const onuTotal   = snapshot?.globalTotal  ?? (ponPorts ? ponPorts.reduce((s, p) => s + p.totalOnu,  0) : (d.ponCount ?? null))

  // Interfaces: live from snapshot preferred, fallback to DB (non-OLT)
  const snapIfaces = !isOlt && Array.isArray(snapshot?.interfaces) ? snapshot.interfaces : null
  const dbIfaces   = d.interfaces ?? []
  const ifaces     = snapIfaces ?? dbIfaces
  const ifaceUp    = snapIfaces
    ? snapIfaces.filter(i => i.running === true || i.running === 'true').length
    : dbIfaces.filter(i => ['online','UP','up'].includes(i.status ?? i.operStatus ?? '')).length

  const alerts    = d.alerts    ?? []

  return (
    <div className="p-3 md:p-4 space-y-4 animate-fade-in">

      {/* ── Breadcrumb ── */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link to="/devices" className="hover:text-primary transition-colors">Devices</Link>
        <ChevronRight size={12} />
        <span className="text-primary font-medium truncate">{d.name}</span>
      </nav>

      {/* ── Hero header ── */}
      <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.ring}`}>
            <Icon size={22} className={s.icon} />
          </div>
          <div>
            <h1 className="text-base font-bold text-primary leading-tight">{d.name}</h1>
            <p className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
              <span>{d.model ?? d.vendor ?? TYPE_LABEL[d.type?.toLowerCase()] ?? d.type}</span>
              {driverName && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-glow)] text-[var(--accent)] font-medium border border-[var(--accent)]/20">
                  {driverName}
                </span>
              )}
            </p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <StatusDot status={s.dot} pulse={s.dot === 'online'} />
              <Badge variant={s.badge}>{STATUS_LABEL[liveStatus] ?? STATUS_LABEL[d.status?.toLowerCase()] ?? d.status}</Badge>
              {d.location && (
                <span className="text-[10px] text-muted">{d.location}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Tes Koneksi — tombol + hasil probe inline */}
          <button
            onClick={probe}
            disabled={probing}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all disabled:opacity-50 ${
              probing
                ? 'bg-[var(--surface-2)] border-[var(--border)] text-muted'
                : probeResult?.alive === true
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : probeResult?.alive === false
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                    : 'bg-[var(--surface-2)] border-[var(--border)] text-muted hover:text-primary'
            }`}
          >
            {probing
              ? <Loader2 size={11} className="animate-spin" />
              : probeResult?.alive === true
                ? <Wifi size={11} />
                : probeResult?.alive === false
                  ? <WifiOff size={11} />
                  : <Activity size={11} />}
            <span className="hidden sm:inline">
              {probing
                ? 'Probing…'
                : probeResult
                  ? (probeResult.alive ? 'Online' : 'Offline')
                  : 'Tes Koneksi'}
            </span>
            {!probing && probeResult?.latencyMs != null && (
              <span className="font-mono opacity-80">{probeResult.latencyMs}ms</span>
            )}
            {!probing && probeResult?.method && (
              <span className="text-[9px] opacity-60 hidden md:inline">·{probeResult.method}</span>
            )}
          </button>

          {/* Ping / Traceroute */}
          <Button variant="outline" size="sm" icon={Network}
            onClick={() => { setToolTarget(d.ip); setToolsOpen(true) }}>
            <span className="hidden sm:inline">Ping / Trace</span>
          </Button>

          <Button variant="outline" size="sm" icon={Pencil}
            onClick={() => { setSaveError(''); setEditOpen(true) }}>
            <span className="hidden sm:inline">Edit</span>
          </Button>
          <Button variant="primary" size="sm" icon={Terminal}>
            <span className="hidden sm:inline">SSH</span>
          </Button>
          <Button variant="ghost" size="sm" icon={RefreshCw}
            onClick={() => { refresh(); forceRefresh() }}
            title="Refresh DB + live snapshot" />
          <Button
            variant="ghost" size="sm" icon={deleting ? Loader2 : Trash2}
            className="text-muted hover:text-rose-400 hover:bg-rose-500/10"
            onClick={() => setConfirmDel(true)}
            disabled={deleting}
          />
        </div>
      </div>

      {/* ── Main content: 2-col on desktop ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left sidebar: quick stats ── */}
        <div className="space-y-3">
          {/* Info card */}
          <Card>
            <CardHeader>
              <span className="text-xs font-semibold text-primary">Informasi</span>
            </CardHeader>
            <CardBody className="grid grid-cols-2 gap-3 pt-1">
              <InfoRow label="IP Address"  value={d.ip}    mono />
              <InfoRow label="MAC Address" value={d.mac ?? d.macAddress} mono />
              <InfoRow label="Vendor"      value={d.vendor} />
              <InfoRow label="Tipe"        value={TYPE_LABEL[d.type?.toLowerCase()] ?? d.type} />
              <InfoRow label="Lokasi"      value={d.location} />
              <InfoRow label="Uptime"      value={uptime} mono />
              {version   && <InfoRow label="Versi OS" value={version} mono />}
              {boardName && <InfoRow label="Board"    value={boardName} mono />}
              {/* Probe / connectivity info */}
              <InfoRow
                label="Last Seen"
                value={
                  probeResult?.alive
                    ? 'Baru saja'
                    : d.lastSeen
                      ? new Date(d.lastSeen).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })
                      : '—'
                }
              />
              <InfoRow
                label="Latency"
                value={
                  probeResult?.latencyMs != null
                    ? `${probeResult.latencyMs} ms (${probeResult.method})`
                    : d.probeLatency
                      ? `${d.probeLatency} ms`
                      : '—'
                }
                mono
              />
              {d.notes && (
                <div className="col-span-2">
                  <InfoRow label="Catatan" value={d.notes} />
                </div>
              )}
            </CardBody>
          </Card>

          {/* Resource card — always show if alive or loading snapshot */}
          {(isAlive || snapLoading) && (
            <Card>
              <CardHeader>
                <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                  Utilisasi
                  {snapLoading && <Loader2 size={10} className="animate-spin text-muted" />}
                  {fetchedAt && !snapLoading && (
                    <span className="ml-auto text-[9px] font-normal text-muted flex items-center gap-1.5">
                      {fetchedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <button onClick={forceRefresh} disabled={snapLoading}
                        className="text-[var(--accent)] hover:opacity-70 disabled:opacity-30 transition-opacity"
                        title="Force refresh (bypass cache)">
                        <RefreshCw size={9} />
                      </button>
                    </span>
                  )}
                </span>
              </CardHeader>
              <CardBody className="space-y-3 pt-1">
                {snapLoading && !snapshot ? (
                  <div className="py-3 flex items-center justify-center gap-2 text-[10px] text-muted">
                    <Loader2 size={12} className="animate-spin" />
                    Mengambil data live…
                  </div>
                ) : (
                  <>
                    <ResourceBar label="CPU"    value={cpu} />
                    <ResourceBar label="Memory" value={memPct} />
                    {snapRes.totalHddSpace > 0 && (
                      <ResourceBar
                        label="Storage"
                        value={Math.round((1 - snapRes.freeHddSpace / snapRes.totalHddSpace) * 100)}
                      />
                    )}
                    <div className="pt-1">
                      <div className="flex justify-between text-[10px] text-muted mb-1">
                        <span>Interfaces</span>
                        <span>{ifaceUp}/{ifaces.length} up</span>
                      </div>
                      <ProgressBar value={ifaceUp} max={ifaces.length || 1} colorClass="bg-[var(--accent)]" />
                    </div>
                    {snapError && (
                      <p className="text-[10px] text-rose-400 flex items-center gap-1">
                        <AlertCircle size={10} /> {snapError}
                      </p>
                    )}
                  </>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        {/* ── Right: tabbed content ── */}
        <div className="lg:col-span-2 space-y-3">
          {/* Tab bar — horizontal scroll on mobile */}
          <div className="flex gap-0 border-b border-[var(--border)] overflow-x-auto scrollbar-none -mb-px">
            {TABS.map(t => {
              const badge = t === 'Interfaces' ? `${ifaceUp}/${ifaces.length}`
                          : t === 'Alerts'     ? alerts.filter(a => !a.ack).length || null
                          : null
              const isDriver = ['Live', 'IP Addr', 'Routes', 'Neighbors', 'Console'].includes(t)
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap shrink-0 transition-all ${
                    tab === t
                      ? 'border-[var(--accent)] text-[var(--accent)]'
                      : 'border-transparent text-muted hover:text-primary'
                  }`}
                >
                  {t}
                  {isDriver && tab !== t && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]/40" />
                  )}
                  {badge !== null && badge !== undefined && badge !== 0 && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                      t === 'Alerts'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-[var(--accent-glow)] text-[var(--accent)]'
                    }`}>
                      {badge}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* ── Overview ── */}
          {tab === 'Overview' && (
            <div className="space-y-3">
              {/* Stat summary row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="stat-card">
                  <Radio size={13} className="accent-text" />
                  {isOlt ? (
                    <>
                      <p className="text-lg font-bold text-primary">
                        {snapLoading && !ponPorts
                          ? <Loader2 size={14} className="animate-spin" />
                          : <>{onuOnline ?? '—'}<span className="text-xs font-normal text-muted">/{onuTotal ?? '—'}</span></>}
                      </p>
                      <p className="text-[10px] text-muted">ONU Online</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg font-bold text-primary">{ifaceUp}<span className="text-xs font-normal text-muted">/{ifaces.length}</span></p>
                      <p className="text-[10px] text-muted">Iface Up</p>
                    </>
                  )}
                </div>
                <div className="stat-card">
                  <AlertCircle size={13} className="text-amber-400" />
                  <p className="text-lg font-bold text-primary">{alerts.filter(a => !a.ack).length}</p>
                  <p className="text-[10px] text-muted">Active Alerts</p>
                </div>
                <div className="stat-card">
                  <Activity size={13} className={cpu == null ? 'text-muted' : cpu >= 80 ? 'text-rose-400' : cpu >= 50 ? 'text-amber-400' : 'text-emerald-400'} />
                  <p className="text-lg font-bold text-primary">
                    {snapLoading && !snapshot ? <Loader2 size={14} className="animate-spin" /> : cpu != null ? `${cpu}%` : '—'}
                  </p>
                  <p className="text-[10px] text-muted">CPU</p>
                </div>
                <div className="stat-card">
                  <BellRing size={13} className={memPct == null ? 'text-muted' : memPct >= 80 ? 'text-rose-400' : memPct >= 50 ? 'text-amber-400' : 'text-emerald-400'} />
                  <p className="text-lg font-bold text-primary">
                    {snapLoading && !snapshot ? <Loader2 size={14} className="animate-spin" /> : memPct != null ? `${memPct}%` : '—'}
                  </p>
                  <p className="text-[10px] text-muted">Memory</p>
                </div>
              </div>

              {/* PON port bars for OLT */}
              {isOlt && (
                <Card>
                  <CardHeader>
                    <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                      PON Ports
                      {snapLoading && !ponPorts && <Loader2 size={10} className="animate-spin text-muted" />}
                      {ponPorts && <Badge variant="neutral" className="ml-1">live</Badge>}
                      <button onClick={() => setTab('Power')}
                        className="ml-auto flex items-center gap-1 text-[10px] text-muted hover:text-[var(--accent)] transition-colors">
                        <Zap size={10} /> Power
                      </button>
                      <button onClick={fetchSnapshot} disabled={snapLoading}
                        className="text-muted hover:text-primary transition-colors disabled:opacity-40">
                        <RefreshCw size={10} className={snapLoading ? 'animate-spin' : ''} />
                      </button>
                    </span>
                  </CardHeader>
                  <CardBody className="space-y-2 pt-1">
                    {/* Capacity summary */}
                    {(d.ponCount || d.ponCapacity) && (
                      <div className="flex items-center gap-4 px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] mb-2">
                        {d.ponCount && (
                          <div>
                            <p className="text-[10px] text-muted">Port PON</p>
                            <p className="text-xs font-bold text-primary font-mono">{d.ponCount}</p>
                          </div>
                        )}
                        {d.ponCapacity && (
                          <div>
                            <p className="text-[10px] text-muted">Kapasitas/PON</p>
                            <p className="text-xs font-bold text-primary font-mono">{d.ponCapacity} <span className="text-[9px] text-muted font-normal">ONU</span></p>
                          </div>
                        )}
                        {d.ponCount && d.ponCapacity && (
                          <div>
                            <p className="text-[10px] text-muted">Total Kapasitas</p>
                            <p className="text-xs font-bold text-primary font-mono">{d.ponCount * d.ponCapacity} <span className="text-[9px] text-muted font-normal">ONU</span></p>
                          </div>
                        )}
                        {onuOnline != null && (
                          <div className="ml-auto text-right">
                            <p className="text-[10px] text-muted">Terpakai</p>
                            <p className="text-xs font-bold text-primary font-mono">
                              {onuTotal ?? '?'}
                              {d.ponCount && d.ponCapacity && (
                                <span className="text-[9px] text-muted font-normal"> / {d.ponCount * d.ponCapacity}</span>
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {snapLoading && !ponPorts ? (
                      <div className="py-3 flex items-center justify-center gap-2 text-[10px] text-muted">
                        <Loader2 size={12} className="animate-spin" /> Mengambil data OLT…
                      </div>
                    ) : ponPorts ? ponPorts.map(p => {
                      const capacity = d.ponCapacity || p.totalOnu || 128
                      const usage = p.totalOnu ?? 0
                      const pct = capacity > 0 ? Math.round((usage / capacity) * 100) : 0
                      const colorClass = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'
                      return (
                        <div key={p.id}>
                          <div className="flex justify-between text-[10px] text-muted mb-1">
                            <span className="font-mono">{ponLabel(p.port)}</span>
                            <span>
                              <span className="text-emerald-400">{p.onlineOnu}</span>
                              <span className="mx-0.5">/</span>
                              <span>{usage}</span>
                              <span className="mx-0.5 text-muted">ONU</span>
                              {d.ponCapacity && (
                                <span className="ml-1 text-muted">({pct}% dari {capacity})</span>
                              )}
                            </span>
                          </div>
                          <ProgressBar value={usage} max={capacity} colorClass={colorClass} />
                        </div>
                      )
                    }) : (
                      <p className="text-[10px] text-muted text-center py-3">
                        {d.ponCount ? `${d.ponCount} PON port` : 'Belum ada data'}
                        {d.ponCapacity ? ` · ${d.ponCapacity} ONU/PON` : ''}
                        <button onClick={fetchSnapshot} className="ml-2 text-[var(--accent)] hover:underline">Refresh</button>
                      </p>
                    )}
                  </CardBody>
                </Card>
              )}

              {/* Live interfaces quick list (non-OLT) */}
              {!isOlt && <Card>
                <CardHeader>
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    Interfaces
                    {snapLoading && !snapshot && <Loader2 size={10} className="animate-spin text-muted" />}
                    {snapshot && (
                      <Badge variant="neutral" className="ml-1">live</Badge>
                    )}
                    <span className="ml-auto text-[10px] font-normal text-muted">{ifaceUp}/{ifaces.length} up</span>
                    <button
                      onClick={fetchSnapshot}
                      disabled={snapLoading}
                      className="ml-1 text-muted hover:text-primary transition-colors disabled:opacity-40"
                    >
                      <RefreshCw size={10} className={snapLoading ? 'animate-spin' : ''} />
                    </button>
                  </span>
                </CardHeader>
                {ifaces.length === 0 && !snapLoading ? (
                  <CardBody>
                    <p className="text-[10px] text-muted text-center py-4">
                      Tidak ada data interface.
                      {!snapshot && (
                        <button onClick={fetchSnapshot} className="ml-2 text-[var(--accent)] hover:underline">
                          Ambil data live
                        </button>
                      )}
                    </p>
                  </CardBody>
                ) : (
                  <div>
                    {/* Show up to 8 interfaces, rest truncated */}
                    {ifaces.slice(0, 8).map((iface, i) => {
                      const up = snapIfaces
                        ? (iface.running === true || iface.running === 'true')
                        : ['online','UP','up'].includes(iface.status ?? iface.operStatus ?? '')
                      const disabled = iface.disabled === true || iface.disabled === 'true'
                      const rxB = iface.rxBytes ?? iface.inKbps
                      const txB = iface.txBytes ?? iface.outKbps
                      return (
                        <div key={iface.id ?? iface.name ?? i}
                          className="flex items-center gap-2.5 px-4 py-2 border-b border-[var(--border)]/40 last:border-0 hover:bg-[var(--accent-glow)] transition-colors">
                          <StatusDot status={disabled ? 'offline' : up ? 'online' : 'offline'} pulse={up && !disabled} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-primary truncate">{iface.name}</p>
                            <p className="text-[10px] text-muted font-mono truncate">
                              {iface.macAddress ?? iface.description ?? iface.type ?? '—'}
                              {iface.comment && <span className="ml-1.5 text-[var(--accent)]">{iface.comment}</span>}
                            </p>
                          </div>
                          {(rxB || txB) && (
                            <div className="text-[10px] text-muted text-right shrink-0 space-y-0.5">
                              <div className="flex items-center gap-1 justify-end">
                                <ArrowDown size={8} className={up ? 'text-emerald-400' : 'text-muted'} />
                                <span className="font-mono">{snapIfaces ? fmtBytes(rxB) : fmt(rxB)}</span>
                              </div>
                              <div className="flex items-center gap-1 justify-end">
                                <ArrowUp size={8} className={up ? 'text-[var(--accent)]' : 'text-muted'} />
                                <span className="font-mono">{snapIfaces ? fmtBytes(txB) : fmt(txB)}</span>
                              </div>
                            </div>
                          )}
                          <Badge variant={disabled ? 'neutral' : up ? 'online' : 'offline'} className="shrink-0 text-[9px]">
                            {disabled ? 'dis' : up ? 'up' : 'dn'}
                          </Badge>
                        </div>
                      )
                    })}
                    {ifaces.length > 8 && (
                      <div className="px-4 py-2 text-[10px] text-muted text-center border-t border-[var(--border)]/40">
                        +{ifaces.length - 8} interface lainnya — lihat tab <button onClick={() => setTab('Interfaces')} className="text-[var(--accent)] hover:underline">Interfaces</button>
                      </div>
                    )}
                  </div>
                )}
              </Card>}

              {d.notes && (
                <div className="p-3 rounded-lg bg-[var(--bg-secondary)] text-xs text-secondary border border-[var(--border)]">
                  {d.notes}
                </div>
              )}
            </div>
          )}

          {/* ── Live (driver snapshot) ── */}
          {tab === 'Live' && (
            <LiveTab
              snapshot={snapshot}
              driverName={driverName}
              capabilities={capabilities}
              loading={snapLoading}
              error={snapError}
              fetchedAt={fetchedAt}
              onRefetch={fetchSnapshot}
            />
          )}

          {/* ── IP Addresses ── */}
          {tab === 'IP Addr' && (
            <IpAddressTab
              snapshot={snapshot}
              loading={snapLoading}
              onRefetch={fetchSnapshot}
            />
          )}

          {/* ── Routes ── */}
          {tab === 'Routes' && (
            <RoutesTab
              snapshot={snapshot}
              loading={snapLoading}
              error={snapError}
              onRefetch={fetchSnapshot}
            />
          )}

          {/* ── Neighbors ── */}
          {tab === 'Neighbors' && (
            <NeighborsTab
              snapshot={snapshot}
              loading={snapLoading}
              error={snapError}
              onRefetch={fetchSnapshot}
            />
          )}

          {/* ── Device sessions ── */}
          {tab === 'Session' && (
            <SessionTab
              deviceId={id}
              sessions={snapshot?.pppoeSessions}
              secrets={snapshot?.pppSecrets}
              sourceErrors={snapshot?.sourceErrors}
              loading={snapLoading}
              error={snapError}
              onRefetch={fetchSnapshot}
            />
          )}

          {/* ── Console ── */}
          {tab === 'Console' && (
            <ExecPanel
              deviceId={id}
              driverName={driverName}
              capabilities={capabilities}
              onExec={execCmd}
              execResult={execResult}
              execLoading={execLoading}
              execError={execError}
            />
          )}

          {/* ── ONU List (OLT only) ── */}
          {tab === 'ONU List' && (
            <OltOnuTab deviceId={id} ponPorts={ponPorts} />
          )}

          {/* ── Power (OLT only) ── */}
          {tab === 'Power' && (
            <OltPowerTab deviceId={id} ponPorts={ponPorts} />
          )}

          {/* ── Interfaces (non-OLT) ── */}
          {tab === 'Interfaces' && (
            <InterfacesTab
              ifaces={ifaces}
              isLive={!!snapIfaces}
              snapLoading={snapLoading}
              fetchSnapshot={fetchSnapshot}
            />
          )}

          {/* ── Alerts ── */}
          {tab === 'Alerts' && (
            <Card>
              {alerts.length === 0 ? (
                <CardBody>
                  <div className="py-10 text-center text-muted text-xs">
                    Tidak ada alerts untuk device ini.
                  </div>
                </CardBody>
              ) : (
                <CardBody className="space-y-2">
                  {alerts.map(alert => {
                    const cfg  = SEV_CONFIG[alert.severity] ?? SEV_CONFIG.info
                    const Icon = cfg.icon
                    return (
                      <div
                        key={alert.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border ${
                          alert.ack ? 'opacity-50 border-[var(--border)]' : `${cfg.bg} ${cfg.border}`
                        }`}
                      >
                        <Icon size={13} className={`${cfg.color} shrink-0 mt-0.5`} />
                        <div className="flex-1 min-w-0">
                          <Badge variant={cfg.badge}>{alert.severity}</Badge>
                          <p className="text-xs text-secondary mt-1">{alert.message}</p>
                          <p className="text-[10px] text-muted mt-0.5">
                            {alert.time ?? (alert.createdAt
                              ? new Date(alert.createdAt).toLocaleString('id-ID')
                              : '—')}
                          </p>
                        </div>
                        {alert.ack && (
                          <Badge variant="neutral">acked</Badge>
                        )}
                      </div>
                    )
                  })}
                </CardBody>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Network tools overlay */}
      {toolsOpen && (
        <NetworkTools defaultTarget={toolTarget} onClose={() => setToolsOpen(false)} />
      )}

      {/* Edit form */}
      {editOpen && (
        <DeviceForm
          device={detail}
          onSave={handleSave}
          onClose={() => { setEditOpen(false); setSaveError('') }}
        />
      )}

      {/* Delete confirm dialog */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDel(false)} />
          <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10 shrink-0">
                <Trash2 size={18} className="text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-primary">Hapus Device?</p>
                <p className="text-xs text-muted mt-1">
                  <span className="font-mono text-primary">{d.name}</span> ({d.ip}) akan dihapus permanen
                  beserta semua interface, alert, dan link topologi terkait.
                  Tindakan ini <strong className="text-rose-400">tidak dapat dibatalkan</strong>.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDel(false)}>
                Batal
              </Button>
              <Button variant="danger" size="sm" className="flex-1" icon={Trash2} onClick={handleDelete}>
                Ya, Hapus Permanen
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 px-4 py-2 rounded-full bg-rose-500/90 text-white text-xs shadow-xl">
          <AlertCircle size={13} />{saveError}
        </div>
      )}
    </div>
  )
}
