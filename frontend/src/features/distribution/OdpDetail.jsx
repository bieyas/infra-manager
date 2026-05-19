import React, { useState, useCallback } from 'react'
import {
  X, Loader2, AlertCircle, MapPin, Radio, Users,
  Pencil, Trash2, ChevronRight, ArrowLeft, Printer, Tag,
  Signal, Network, Cable, Box, Calendar, Wrench, User, Hash,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ProgressBar from '../../components/ui/ProgressBar'
import { useOdpDetail, splitterLabel, capacityFromRatio } from './useDistribution'
import { useNavigate } from 'react-router-dom'
import LabelPrintModal from './LabelPrintModal'

function Row({ label, value, mono }) {
  return (
    <div>
      <p className="text-[10px] text-muted">{label}</p>
      <p className={`text-xs text-primary font-medium mt-0.5 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  )
}

const STATUS_BADGE = { ACTIVE: 'online', INACTIVE: 'offline', MAINTENANCE: 'warning' }
const STATUS_LABEL = { ACTIVE: 'Aktif', INACTIVE: 'Nonaktif', MAINTENANCE: 'Perbaikan' }
const SVC_CFG = {
  ACTIVE:     { badge: 'online',  label: 'Aktif' },
  SUSPENDED:  { badge: 'warning', label: 'Suspend' },
  TERMINATED: { badge: 'offline', label: 'Berhenti' },
}

function rxPowerColor(dbm) {
  if (dbm === null || dbm === undefined) return 'text-muted'
  if (dbm >= -20) return 'text-emerald-400'
  if (dbm >= -25) return 'text-amber-400'
  return 'text-rose-400'
}

export default function OdpDetail({ odpId, onClose, onEdit, onDelete, onNavigateOdp }) {
  const navigate = useNavigate()
  const [history,   setHistory]   = useState([])
  const [printOpen,  setPrintOpen]  = useState(false)
  const [printPort,  setPrintPort]  = useState(null)  // null = ODC/ODP label, number = port label
  const { odp, loading, error } = useOdpDetail(odpId)

  const openPortPrint = useCallback((portNum) => {
    setPrintPort(portNum)
    setPrintOpen(true)
  }, [])

  const openNodePrint = useCallback(() => {
    setPrintPort(null)
    setPrintOpen(true)
  }, [])

  const handleNavigateChild = useCallback((childId) => {
    setHistory(h => [...h, odpId])
    if (onNavigateOdp) onNavigateOdp(childId)
  }, [odpId, onNavigateOdp])

  const handleBack = useCallback(() => {
    const prev = history[history.length - 1]
    if (prev && onNavigateOdp) {
      setHistory(h => h.slice(0, -1))
      onNavigateOdp(prev)
    }
  }, [history, onNavigateOdp])

  // Kapasitas: ambil dari backend capacity, lalu splitters, lalu splitterRatio
  const computeCapacity = (odp) => {
    if (!odp) return 0
    if (odp.capacity && odp.capacity > 0) return odp.capacity
    if (odp.splitters?.length > 0) {
      const fromSplitters = odp.splitters.reduce((sum, s) => {
        const portCount = s.ports?.length || s.splitterType?.outputCount || 0
        return sum + portCount
      }, 0)
      if (fromSplitters > 0) return fromSplitters
    }
    return capacityFromRatio(odp.splitterRatio) || 0
  }

  const capacity = computeCapacity(odp)
  const pct = capacity > 0 ? Math.round(((odp?.usedPorts ?? 0) / capacity) * 100) : 0

  // Build port map dari customers
  const portMap = {}
  odp?.customers?.forEach(c => { if (c.odpPort) portMap[c.odpPort] = c })

  // Label splitter yang akurat
  const getSplitterLabel = (odp) => {
    if (odp.splitters?.length > 0) {
      const names = odp.splitters
        .map(s => s.splitterType?.name || s.splitterType?.code)
        .filter(Boolean)
      const totalOut = odp.splitters.reduce((sum, s) => {
        return sum + (s.ports?.length || s.splitterType?.outputCount || 0)
      }, 0)
      if (names.length === 1) return `${names[0]}${totalOut > 0 ? ` (${totalOut} port)` : ''}`
      if (names.length > 1)  return `${names.length}× Splitter (${totalOut} port)`
    }
    if (odp.splitterRatio) return splitterLabel(odp.splitterRatio)
    return 'Belum diset'
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--bg-card)] border border-[var(--border)] rounded-t-2xl md:rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-card)] z-10">
          <div className="flex items-center gap-2 min-w-0">
            {history.length > 0 && (
              <button onClick={handleBack} className="p-1.5 rounded text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors shrink-0">
                <ArrowLeft size={14} />
              </button>
            )}
            <h2 className="text-sm font-bold text-primary truncate">{odp?.name ?? 'Detail ODP'}</h2>
          </div>
          <div className="flex items-center gap-2">
            {odp && (
              <>
                <button
                  onClick={openNodePrint}
                  title="Print Label / QR Code"
                  className="p-1.5 rounded text-muted hover:text-[var(--accent)] hover:bg-[var(--accent-glow)] transition-colors"
                >
                  <Printer size={13} />
                </button>
                <button onClick={() => onEdit(odp)} className="p-1.5 rounded text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors"><Pencil size={13} /></button>
                <button onClick={() => onDelete(odp)} className="p-1.5 rounded text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><Trash2 size={13} /></button>
              </>
            )}
            <button onClick={onClose} className="text-muted hover:text-primary transition-colors ml-1"><X size={16} /></button>
          </div>
        </div>

        {loading && <div className="py-16 flex justify-center"><Loader2 size={24} className="animate-spin text-muted" /></div>}
        {error && (
          <div className="m-5 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        {odp && (
          <div className="space-y-0">

            {/* ── Hero section ── */}
            <div className="px-5 pt-4 pb-5 border-b border-[var(--border)] bg-gradient-to-b from-[var(--bg-secondary)]/60 to-transparent">
              {/* Node identity */}
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2 ${
                  odp.status === 'ACTIVE' ? 'bg-emerald-500/10 border-emerald-500/30' :
                  odp.status === 'MAINTENANCE' ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-rose-500/10 border-rose-500/30'
                }`}>
                  <Signal size={22} className={`${
                    odp.status === 'ACTIVE' ? 'text-emerald-400' :
                    odp.status === 'MAINTENANCE' ? 'text-amber-400' : 'text-rose-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_BADGE[odp.status]}>{STATUS_LABEL[odp.status]}</Badge>
                    <span className="text-[10px] text-muted">Splitter {getSplitterLabel(odp)}</span>
                  </div>
                  {odp.address && (
                    <p className="text-[11px] text-muted flex items-center gap-1 mt-1">
                      <MapPin size={10} className="shrink-0" /> {odp.address}
                    </p>
                  )}
                </div>
              </div>

              {/* Upstream chain visual */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                {odp.olt ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/20 font-medium">
                    <Radio size={9} /> {odp.olt.name} / {odp.ponPort ?? 'PON?'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full border border-[var(--border)] text-muted">OLT belum diset</span>
                )}
                <ChevronRight size={10} className="text-muted" />
                {odp.odc && (
                  <>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      <Box size={9} /> {odp.odc.name}
                    </span>
                    <ChevronRight size={10} className="text-muted" />
                  </>
                )}
                {odp.uplinkOdp && (
                  <>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <Signal size={9} /> {odp.uplinkOdp.name}
                    </span>
                    <ChevronRight size={10} className="text-muted" />
                  </>
                )}
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 font-semibold">
                  <Signal size={9} /> {odp.name}
                </span>
              </div>
            </div>

            <div className="p-5 space-y-5">

            {/* Kapasitas */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">Kapasitas Port</span>
                <span className={`text-sm font-bold font-mono ${
                  pct >= 90 ? 'text-rose-400' : pct >= 70 ? 'text-amber-400' : 'text-emerald-400'
                }`}>{odp.usedPorts}<span className="text-muted font-normal">/{capacity || '?'}</span></span>
              </div>
              {capacity > 0 ? (
                <ProgressBar value={odp.usedPorts} max={capacity}
                  colorClass={pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
              ) : (
                <p className="text-[10px] text-amber-400">Splitter belum dikonfigurasi — kapasitas tidak diketahui</p>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                  <p className="text-sm font-bold text-emerald-400">{capacity > 0 ? capacity - odp.usedPorts : '?'}</p>
                  <p className="text-[9px] text-muted mt-0.5">Port Tersedia</p>
                </div>
                <div className="text-center py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                  <p className="text-sm font-bold text-primary">{odp.customers?.length ?? 0}</p>
                  <p className="text-[9px] text-muted mt-0.5">Pelanggan</p>
                </div>
                <div className="text-center py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                  <p className="text-sm font-bold text-primary">{capacity > 0 ? `${pct}%` : '—'}</p>
                  <p className="text-[9px] text-muted mt-0.5">Terpakai</p>
                </div>
              </div>
            </div>

            {/* Splitter detail */}
            {odp.splitters?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Konfigurasi Splitter</p>
                <div className="space-y-2">
                  {odp.splitters.map((s, idx) => {
                    const outCount = s.ports?.length || s.splitterType?.outputCount || 0
                    const usedPorts = s.ports?.filter(p => p.status === 'USED' || p.customerId).length ?? 0
                    const sPct = outCount > 0 ? Math.round((usedPorts / outCount) * 100) : 0
                    return (
                      <div key={s.id ?? idx} className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono text-muted bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border)]">
                              #{s.sequenceOrder ?? idx + 1}
                            </span>
                            <span className="text-xs font-semibold text-primary">
                              {s.splitterType?.name || s.splitterType?.code || `Splitter ${idx + 1}`}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted">{outCount} port</span>
                        </div>
                        {outCount > 0 && (
                          <>
                            <div className="flex justify-between text-[9px] text-muted mb-1">
                              <span>{usedPorts}/{outCount} terisi</span>
                              <span className={sPct >= 90 ? 'text-rose-400' : sPct >= 70 ? 'text-amber-400' : 'text-emerald-400'}>{sPct}%</span>
                            </div>
                            <ProgressBar value={usedPorts} max={outCount}
                              colorClass={sPct >= 90 ? 'bg-rose-500' : sPct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Info dasar */}
            <div>
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Informasi</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { icon: MapPin,   label: 'Alamat',      value: odp.address },
                  { icon: Hash,     label: 'Koordinat',   value: odp.lat && odp.lng ? `${odp.lat}, ${odp.lng}` : null, mono: true },
                  { icon: Wrench,   label: 'Mounting',    value: odp.mountType },
                  { icon: Signal,   label: 'Brand',       value: odp.brand },
                  { icon: User,     label: 'PIC/Teknisi', value: odp.pic },
                  { icon: Calendar, label: 'Instalasi',   value: odp.installDate ? new Date(odp.installDate).toLocaleDateString('id-ID') : null },
                ].map(({ icon: Icon, label, value, mono }) => value ? (
                  <div key={label} className="rounded-xl bg-[var(--bg-secondary)]/60 border border-[var(--border)] px-3 py-2">
                    <p className="text-[9px] text-muted flex items-center gap-1 mb-0.5">
                      <Icon size={8} /> {label}
                    </p>
                    <p className={`text-xs text-primary font-medium truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
                  </div>
                ) : null)}
              </div>
            </div>

            {/* Feeder */}
            {(odp.feederLabel || odp.feederCore) && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 p-3">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Cable size={10} /> Kabel Feeder
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  {odp.feederLabel && (
                    <span className="font-mono text-xs text-primary bg-[var(--bg-card)] border border-[var(--border)] px-2.5 py-1 rounded-lg">
                      {odp.feederLabel}
                    </span>
                  )}
                  {odp.feederCore && (
                    <span className="text-[10px] text-muted">
                      Core: <span className="font-mono text-primary">{odp.feederCore}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Downstream ODPs */}
            {odp.downlinkOdps?.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">ODP Downstream</p>
                  <span className="text-[10px] text-muted bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">{odp.downlinkOdps.length}</span>
                </div>
                <div className="space-y-1.5">
                  {odp.downlinkOdps.map(child => {
                    const childCap = capacityFromRatio(child.splitterRatio)
                    const childPct = childCap > 0 ? Math.round((child.usedPorts / childCap) * 100) : 0
                    return (
                      <div key={child.id}
                        onClick={() => handleNavigateChild(child.id)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-glow)] transition-all cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center shrink-0">
                          <Signal size={12} className="text-muted group-hover:text-[var(--accent)] transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-primary truncate">{child.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {child.uplinkOdpCore && <span className="text-[9px] text-muted font-mono">Core {child.uplinkOdpCore}</span>}
                            <span className="text-[9px] text-muted">{child.usedPorts}/{childCap} port</span>
                          </div>
                        </div>
                        <div className="w-14 shrink-0">
                          <div className="text-right text-[9px] mb-0.5">
                            <span className={childPct >= 90 ? 'text-rose-400' : childPct >= 70 ? 'text-amber-400' : 'text-emerald-400'}>
                              {childPct}%
                            </span>
                          </div>
                          <ProgressBar value={child.usedPorts} max={childCap || 1}
                            colorClass={childPct >= 90 ? 'bg-rose-500' : childPct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
                        </div>
                        <ChevronRight size={12} className="text-muted group-hover:text-[var(--accent)] transition-colors shrink-0" />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Port map — visual slot */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                  Port Splitter
                  {capacity > 0 && (
                    <>
                      <span className="ml-1.5 text-[var(--accent)]">{odp.customers?.length ?? 0}</span>
                      <span className="text-muted">/{capacity} terisi</span>
                    </>
                  )}
                </p>
                {odp.customers?.length > 0 && (
                  <button
                    onClick={() => openPortPrint('all')}
                    className="flex items-center gap-1 text-[10px] text-muted hover:text-[var(--accent)] transition-colors"
                    title="Print semua label port"
                  >
                    <Printer size={10} />
                    Print semua
                  </button>
                )}
              </div>

              {capacity === 0 ? (
                <div className="py-6 text-center rounded-xl border border-dashed border-[var(--border)]">
                  <Signal size={20} className="text-muted mx-auto mb-2 opacity-40" />
                  <p className="text-[10px] text-muted">Splitter belum dikonfigurasi</p>
                  <p className="text-[9px] text-muted opacity-60 mt-0.5">Set splitter ratio atau tambah splitter di form edit</p>
                </div>
              ) : (
                <>
                  {/* Tentukan cols: <=8 → cols=capacity, >8 → cols=8 */}
                  <div className="grid gap-2" style={{
                    gridTemplateColumns: `repeat(${capacity <= 8 ? capacity : capacity <= 16 ? 8 : capacity <= 24 ? 8 : 8}, 1fr)`
                  }}>
                    {Array.from({ length: capacity }, (_, i) => {
                      const port = i + 1
                      const cust = portMap[port]
                      return (
                        <div key={port} className="relative group">
                          <div
                            title={cust ? `Port ${port}: ${cust.name}` : `Port ${port}: Kosong — klik untuk assign`}
                            onClick={() => { if (!cust) navigate(`/customers/new?odpId=${odp.id}&odpPort=${port}`) }}
                            className={`rounded-lg text-center font-mono border transition-all ${
                              cust
                                ? cust.serviceStatus === 'ACTIVE'
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 cursor-default'
                                  : 'bg-amber-500/15 border-amber-500/40 text-amber-400 cursor-default'
                                : 'bg-[var(--bg-secondary)] border-[var(--border)] text-muted hover:border-[var(--accent)]/60 hover:bg-[var(--accent-glow)] hover:text-[var(--accent)] cursor-pointer'
                            }`}
                            style={{ paddingTop: '7px', paddingBottom: '7px' }}
                          >
                            <div className="text-[11px] font-bold leading-none">{port}</div>
                            {cust && (
                              <div className="text-[8px] leading-tight mt-0.5 opacity-75 truncate px-0.5">
                                {cust.name.split(' ')[0]}
                              </div>
                            )}
                          </div>
                          {cust && (
                            <button
                              onClick={e => { e.stopPropagation(); openPortPrint(port) }}
                              title={`Print label port ${port}`}
                              className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:border-[var(--accent)] hover:text-[var(--accent)] text-muted z-10"
                            >
                              <Printer size={8} />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="flex items-center gap-1 text-[9px] text-muted">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/40 inline-block" /> Aktif
                    </span>
                    <span className="flex items-center gap-1 text-[9px] text-muted">
                      <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/20 border border-amber-500/40 inline-block" /> Suspend
                    </span>
                    <span className="flex items-center gap-1 text-[9px] text-muted">
                      <span className="w-2.5 h-2.5 rounded-sm bg-[var(--bg-secondary)] border border-[var(--border)] inline-block" /> Kosong
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Customer list */}
            {odp.customers?.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Daftar Pelanggan</p>
                  <span className="text-[10px] text-muted bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">{odp.customers.length}</span>
                </div>
                <div className="space-y-1.5">
                  {odp.customers.map(c => {
                    const svc = SVC_CFG[c.serviceStatus] ?? SVC_CFG.ACTIVE
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--accent-glow)] transition-colors group">
                        {/* Port badge */}
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono shrink-0 border ${
                          c.serviceStatus === 'ACTIVE'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                            : 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                        }`}>
                          {c.odpPort ?? '–'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-primary truncate">{c.name}</p>
                          <p className="text-[10px] text-muted font-mono truncate">
                            {c.customerId}
                            {c.onuSn && <span className="ml-2 opacity-70">{c.onuSn}</span>}
                          </p>
                        </div>
                        {c.rxPower != null && (
                          <div className="text-right shrink-0">
                            <span className={`text-xs font-bold font-mono ${rxPowerColor(c.rxPower)}`}>
                              {c.rxPower}
                            </span>
                            <p className="text-[8px] text-muted">dBm</p>
                          </div>
                        )}
                        <Badge variant={svc.badge} className="text-[9px] shrink-0">{svc.label}</Badge>
                        <button
                          onClick={() => openPortPrint(c.odpPort)}
                          title={`Print label port ${c.odpPort}`}
                          className="p-1 rounded text-muted opacity-0 group-hover:opacity-100 hover:text-[var(--accent)] hover:bg-[var(--accent-glow)] transition-all shrink-0"
                        >
                          <Tag size={11} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {odp.notes && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-secondary flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 shrink-0">📝</span>
                <p className="leading-relaxed">{odp.notes}</p>
              </div>
            )}

            </div>{/* end inner p-5 */}
          </div>
        )}
      </div>

      {/* Label Print modal */}
      <LabelPrintModal
        open={printOpen}
        onClose={() => { setPrintOpen(false); setPrintPort(null) }}
        nodeType="odp"
        data={odp}
        initialPort={printPort}
      />
    </div>
  )
}
