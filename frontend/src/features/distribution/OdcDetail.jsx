import React, { useState, useCallback } from 'react'
import {
  X, Loader2, AlertCircle, MapPin, Radio, Zap,
  Pencil, Trash2, ChevronRight, ArrowLeft, RefreshCw, Printer,
  Box, Cable, Network, Calendar, Wrench, User, Hash, ExternalLink,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ProgressBar from '../../components/ui/ProgressBar'
import { useOdcDetail, splitterLabel, capacityFromRatio } from './useDistribution'
import { useOltPonPower } from '../devices/useDriverSnapshot'
import { useNavigate } from 'react-router-dom'
import OdpDetail from './OdpDetail'
import LabelPrintModal from './LabelPrintModal'

function txPowerColor(dbm) {
  if (dbm === null || dbm === undefined) return 'text-muted'
  if (dbm >= 3) return 'text-emerald-400'
  if (dbm >= 1) return 'text-sky-400'
  if (dbm >= 0) return 'text-amber-400'
  return 'text-rose-400'
}
function fmtDbm(v) {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(2)} dBm`
}

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

export default function OdcDetail({ odcId, onClose, onEdit, onDelete, onNavigateOdc }) {
  const navigate = useNavigate()
  const [history, setHistory] = useState([])
  const [printOpen, setPrintOpen] = useState(false)
  const { odc, loading, error } = useOdcDetail(odcId)

  const handleNavigateChild = useCallback((childId) => {
    setHistory(h => [...h, odcId])
    if (onNavigateOdc) onNavigateOdc(childId)
  }, [odcId, onNavigateOdc])

  const handleBack = useCallback(() => {
    const prev = history[history.length - 1]
    if (prev && onNavigateOdc) {
      setHistory(h => h.slice(0, -1))
      onNavigateOdc(prev)
    }
  }, [history, onNavigateOdc])

  const [odpDetailId, setOdpDetailId] = useState(null)

  // PON power for this ODC's PON port — only fetch when ponPort is available
  const ponPort = odc?.ponPort?.replace(/^PON-/, '1/1/') ?? null
  const { data: ponPower, loading: powerLoading, fetch: loadPower } = useOltPonPower(
    ponPort ? (odc?.olt?.id ?? null) : null,
    ponPort ?? '1/1/1'
  )

  const capacity = odc ? (odc.totalOutputs ?? odc.capacity ?? capacityFromRatio(odc.splitterRatio)) : 0
  const usedPorts = odc ? (odc.usedOutputs ?? odc.usedPorts ?? 0) : 0
  const available = capacity - usedPorts
  const pct = capacity > 0 ? Math.round((usedPorts / capacity) * 100) : 0

  // Calculate splitter label from actual splitters
  const getSplitterLabel = (odc) => {
    if (odc.splitters && odc.splitters.length > 0) {
      const totalOutputs = odc.splitters.reduce((sum, s) => sum + (s.splitterType?.outputCount || 0), 0)
      const splitterTypes = odc.splitters.map(s => s.splitterType?.name || s.splitterType?.code).filter(Boolean)
      if (splitterTypes.length === 1) {
        return `${splitterTypes[0]} (${totalOutputs} port)`
      } else {
        return `${splitterTypes.length}x Splitter (${totalOutputs} port)`
      }
    }
    return splitterLabel(odc.splitterRatio)
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
            <h2 className="text-sm font-bold text-primary truncate">{odc?.name ?? 'Detail ODC'}</h2>
          </div>
          <div className="flex items-center gap-2">
            {odc && (
              <>
                <button
                  onClick={() => setPrintOpen(true)}
                  title="Print Label / QR Code"
                  className="p-1.5 rounded text-muted hover:text-[var(--accent)] hover:bg-[var(--accent-glow)] transition-colors"
                >
                  <Printer size={13} />
                </button>
                <button onClick={() => onEdit(odc)} className="p-1.5 rounded text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors">
                  <Pencil size={13} />
                </button>
                <button onClick={() => onDelete(odc)} className="p-1.5 rounded text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
                  <Trash2 size={13} />
                </button>
              </>
            )}
            <button onClick={onClose} className="text-muted hover:text-primary transition-colors ml-1">
              <X size={16} />
            </button>
          </div>
        </div>

        {loading && (
          <div className="py-16 flex flex-col items-center gap-3 text-muted">
            <Loader2 size={24} className="animate-spin" />
          </div>
        )}

        {error && (
          <div className="m-5 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        {odc && (
          <div className="space-y-0">

            {/* ── Hero section ── */}
            <div className="px-5 pt-4 pb-5 border-b border-[var(--border)] bg-gradient-to-b from-[var(--bg-secondary)]/60 to-transparent">
              {/* Node identity */}
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2 ${
                  odc.status === 'ACTIVE' ? 'bg-emerald-500/10 border-emerald-500/30' :
                  odc.status === 'MAINTENANCE' ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-rose-500/10 border-rose-500/30'
                }`}>
                  <Box size={22} className={`${
                    odc.status === 'ACTIVE' ? 'text-emerald-400' :
                    odc.status === 'MAINTENANCE' ? 'text-amber-400' : 'text-rose-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_BADGE[odc.status]}>{STATUS_LABEL[odc.status]}</Badge>
                    <span className="text-[10px] text-muted">Splitter {getSplitterLabel(odc)}</span>
                  </div>
                  {odc.address && (
                    <p className="text-[11px] text-muted flex items-center gap-1 mt-1">
                      <MapPin size={10} className="shrink-0" /> {odc.address}
                    </p>
                  )}
                </div>
              </div>

              {/* Upstream chain visual */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                {odc.olt ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/20 font-medium">
                    <Radio size={9} /> {odc.olt.name} / {odc.ponPort ?? 'PON?'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full border border-[var(--border)] text-muted">OLT belum diset</span>
                )}
                <ChevronRight size={10} className="text-muted" />
                {odc.uplinkType === 'odc' && odc.uplinkOdc && (
                  <>
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                      <Network size={9} /> {odc.uplinkOdc.name}
                    </span>
                    <ChevronRight size={10} className="text-muted" />
                  </>
                )}
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 font-semibold">
                  <Box size={9} /> {odc.name}
                </span>
              </div>
            </div>

            <div className="p-5 space-y-5">

            {/* ── Kapasitas ── */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">Kapasitas Port</span>
                <span className={`text-sm font-bold font-mono ${
                  pct >= 90 ? 'text-rose-400' : pct >= 70 ? 'text-amber-400' : 'text-emerald-400'
                }`}>{usedPorts}<span className="text-muted font-normal">/{capacity}</span></span>
              </div>
              <ProgressBar
                value={usedPorts} max={capacity || 1}
                colorClass={pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'}
              />
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                  <p className="text-sm font-bold text-emerald-400">{available}</p>
                  <p className="text-[9px] text-muted mt-0.5">Port Tersedia</p>
                </div>
                <div className="text-center py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                  <p className="text-sm font-bold text-primary">{odc.odps?.length ?? 0}</p>
                  <p className="text-[9px] text-muted mt-0.5">ODP Terhubung</p>
                </div>
                <div className="text-center py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                  <p className="text-sm font-bold text-primary">{pct}%</p>
                  <p className="text-[9px] text-muted mt-0.5">Terpakai</p>
                </div>
              </div>
              {odc.passthrough > 0 && (
                <p className="text-[10px] text-muted">
                  <Cable size={9} className="inline mr-1" />{odc.passthrough} core passthrough
                </p>
              )}
            </div>

            {/* ── Power Input (dari SFP PON) ── */}
            {odc.olt && odc.ponPort && (
              <div className="card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                    <Zap size={12} className="text-amber-400" />
                    Power Input
                  </div>
                  <button
                    onClick={loadPower}
                    disabled={powerLoading}
                    className="flex items-center gap-1 text-[10px] text-muted hover:text-primary transition-colors disabled:opacity-40"
                  >
                    <RefreshCw size={9} className={powerLoading ? 'animate-spin' : ''} />
                    {!powerLoading && !ponPower && <span>Load</span>}
                  </button>
                </div>
                {powerLoading && !ponPower ? (
                  <div className="flex items-center gap-2 text-[10px] text-muted py-1">
                    <Loader2 size={10} className="animate-spin" /> Mengambil Tx Power dari {odc.olt.name}…
                  </div>
                ) : ponPower ? (
                  <div className="flex items-center gap-4">
                    <div>
                      <p className="text-[9px] text-muted">SFP Tx Power ({odc.ponPort})</p>
                      <p className={`text-lg font-bold font-mono ${txPowerColor(ponPower.txPower)}`}>
                        {fmtDbm(ponPower.txPower)}
                      </p>
                    </div>
                    <div className="text-[10px] text-muted">
                      <p>Sumber: <span className="text-primary font-medium">{odc.olt.name}</span></p>
                      <p>Port: <span className="font-mono text-primary">{odc.ponPort}</span></p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted">
                    Klik Load untuk mengambil Tx Power SFP dari {odc.olt.name} / {odc.ponPort}
                  </p>
                )}
              </div>
            )}

            {/* ── Info dasar ── */}
            <div>
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Informasi</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { icon: MapPin,    label: 'Alamat',      value: odc.address },
                  { icon: Hash,      label: 'Koordinat',   value: odc.lat && odc.lng ? `${odc.lat}, ${odc.lng}` : null, mono: true },
                  { icon: Wrench,    label: 'Mounting',    value: odc.mountType },
                  { icon: Box,       label: 'Brand',       value: odc.brand },
                  { icon: User,      label: 'PIC/Teknisi', value: odc.pic },
                  { icon: Calendar,  label: 'Instalasi',   value: odc.installDate ? new Date(odc.installDate).toLocaleDateString('id-ID') : null },
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

            {/* ── Kabel feeder ── */}
            {(odc.feederLabel || odc.feederCores || odc.feederCore) && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 p-3">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Cable size={10} /> Kabel Feeder
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  {odc.feederLabel && (
                    <span className="font-mono text-xs text-primary bg-[var(--bg-card)] border border-[var(--border)] px-2.5 py-1 rounded-lg">
                      {odc.feederLabel}
                    </span>
                  )}
                  {odc.feederCores && <span className="text-[10px] text-muted">{odc.feederCores} core</span>}
                  {odc.feederCore && (
                    <span className="text-[10px] text-muted">
                      Core dipakai: <span className="font-mono text-primary">{odc.feederCore}</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── ODP list ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                  ODP Terhubung
                </p>
                <span className="text-[10px] text-muted bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                  {odc.odps?.length ?? 0}
                </span>
              </div>
              {!odc.odps?.length ? (
                <div className="py-6 text-center rounded-xl border border-dashed border-[var(--border)]">
                  <Cable size={20} className="text-muted mx-auto mb-2 opacity-40" />
                  <p className="text-[10px] text-muted">Belum ada ODP terhubung</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {odc.odps.map(odp => {
                    const cap = capacityFromRatio(odp.splitterRatio)
                    const p   = cap > 0 ? Math.round((odp.usedPorts / cap) * 100) : 0
                    return (
                      <div key={odp.id}
                        onClick={() => setOdpDetailId(odp.id)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-glow)] transition-all cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center shrink-0">
                          <Radio size={12} className="text-muted group-hover:text-[var(--accent)] transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-primary truncate">{odp.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-muted">{splitterLabel(odp.splitterRatio)}</span>
                            <span className="text-[9px] text-muted">· {odp.usedPorts}/{cap} port</span>
                            {(odp.customerCount ?? 0) > 0 && (
                              <span className="text-[9px] text-emerald-400">· {odp.customerCount} pelanggan</span>
                            )}
                          </div>
                        </div>
                        <div className="w-14 shrink-0">
                          <div className="text-right text-[9px] mb-0.5">
                            <span className={p >= 90 ? 'text-rose-400' : p >= 70 ? 'text-amber-400' : 'text-emerald-400'}>
                              {p}%
                            </span>
                          </div>
                          <ProgressBar value={odp.usedPorts} max={cap || 1}
                            colorClass={p >= 90 ? 'bg-rose-500' : p >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
                        </div>
                        <ChevronRight size={12} className="text-muted group-hover:text-[var(--accent)] transition-colors shrink-0" />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Children ODC ── */}
            {(odc.downlinkOdcs?.length ?? 0) > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">ODC Downstream</p>
                  <span className="text-[10px] text-muted bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">{odc.downlinkOdcs.length}</span>
                </div>
                <div className="space-y-1.5">
                  {odc.downlinkOdcs.map(childOdc => (
                    <div key={childOdc.id}
                      onClick={() => handleNavigateChild(childOdc.id)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] hover:border-sky-500/40 hover:bg-sky-500/5 transition-all cursor-pointer group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                        <Box size={12} className="text-sky-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-primary truncate">{childOdc.name}</p>
                        <p className="text-[9px] text-muted">
                          {childOdc.uplinkCore ? `Core ${childOdc.uplinkCore}` : `Port ${childOdc.uplinkPort?.split('-')[1] || 'N/A'}`}
                        </p>
                      </div>
                      <ChevronRight size={12} className="text-muted group-hover:text-sky-400 transition-colors shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {odc.notes && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-secondary flex items-start gap-2">
                <span className="text-amber-400 mt-0.5 shrink-0">📝</span>
                <p className="leading-relaxed">{odc.notes}</p>
              </div>
            )}

            </div>{/* end inner p-5 */}
          </div>
        )}
      </div>

      {/* Nested ODP detail modal */}
      {odpDetailId && (
        <OdpDetail
          odpId={odpDetailId}
          onClose={() => setOdpDetailId(null)}
          onEdit={(odp) => { setOdpDetailId(null); navigate(`/odp/${odp.id}/edit`) }}
          onDelete={() => setOdpDetailId(null)}
          onNavigateOdp={(id) => setOdpDetailId(id)}
        />
      )}

      {/* Label Print modal */}
      <LabelPrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        nodeType="odc"
        data={odc}
      />
    </div>
  )
}
