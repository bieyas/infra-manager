import React, { useState, useCallback } from 'react'
import {
  X, Loader2, AlertCircle, MapPin, Radio, Users,
  Pencil, Trash2, ChevronRight, ArrowLeft,
  Signal, Network, Cable, Box, Zap, ExternalLink, ShieldAlert,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ProgressBar from '../../components/ui/ProgressBar'
import { useHtbDetail, updateHtbPort } from './useHtb'
import { useNavigate } from 'react-router-dom'

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

const MODEL_LABELS = {
  SINGLE_1FO_1LAN: 'Single (1 FO + 1 LAN)',
  SWITCH_3FO_2LAN: 'Switch 3 FO + 2 LAN',
  SWITCH_6FO_2LAN: 'Switch 6 FO + 2 LAN',
  CUSTOM: 'Custom Switch FO',
}

const POWER_LABELS = {
  HOST_CUSTOMER_PLN: 'Numpang Rumah Warga',
  REVERSE_POE: 'Reverse PoE dari Pelanggan',
  PLN_DEDICATED: 'Meteran PLN Tiang',
  CENTRAL_DC_UPS: 'Sentral DC / Baterai Backup',
  SOLAR: 'Panel Surya',
}

export default function HtbDetail({ htbId, onClose, onEdit, onDelete, onNavigateHtb }) {
  const navigate = useNavigate()
  const [history, setHistory] = useState([])
  const { box, loading, error, refetch } = useHtbDetail(htbId)
  const [editPort, setEditPort] = useState(null)
  const [selectedRole, setSelectedRole] = useState('UNUSED')
  const [targetPortLabel, setTargetPortLabel] = useState('')
  const [savingPort, setSavingPort] = useState(false)

  const handleNavigateChild = useCallback((childId) => {
    setHistory(h => [...h, htbId])
    if (onNavigateHtb) onNavigateHtb(childId)
  }, [htbId, onNavigateHtb])

  const handleBack = useCallback(() => {
    const prev = history[history.length - 1]
    if (prev && onNavigateHtb) {
      setHistory(h => h.slice(0, -1))
      onNavigateHtb(prev)
    }
  }, [history, onNavigateHtb])

  const handleOpenEditPort = (p) => {
    setEditPort(p)
    setSelectedRole(p.role || 'UNUSED')
    setTargetPortLabel(p.targetPortLabel || '')
  }

  const handleSavePortRole = async () => {
    if (!editPort) return
    setSavingPort(true)
    try {
      await updateHtbPort(htbId, editPort.id, { role: selectedRole, targetPortLabel })
      refetch()
      setEditPort(null)
    } catch (e) {
      alert(e.message || 'Gagal mengubah peran port')
    } finally {
      setSavingPort(false)
    }
  }

  const ports = box?.ports || []
  const foPorts = ports.filter(p => p.portType === 'FO')
  const lanPorts = ports.filter(p => p.portType === 'LAN')
  const totalPorts = ports.length
  const usedPorts = ports.filter(p => (p.role && p.role !== 'UNUSED') || p.customers?.length > 0).length
  const availablePorts = totalPorts - usedPorts
  const pct = totalPorts > 0 ? Math.round((usedPorts / totalPorts) * 100) : 0
  const customers = ports.flatMap(p => p.customers || [])

  return (
    <div className="fixed inset-0 z-[2000] flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="relative w-full md:max-w-2xl max-h-[90vh] overflow-y-auto bg-[var(--bg-card)] border border-[var(--border)] rounded-t-2xl md:rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-card)] z-10">
          <div className="flex items-center gap-2 min-w-0">
            {history.length > 0 && (
              <button onClick={handleBack} className="p-1.5 rounded text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors shrink-0">
                <ArrowLeft size={14} />
              </button>
            )}
            <h2 className="text-sm font-bold text-primary truncate">{box?.name ?? 'Detail Box HTB'}</h2>
          </div>
          <div className="flex items-center gap-2">
            {box && (
              <>
                <button
                  onClick={() => onEdit(box)}
                  className="p-1.5 rounded text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors"
                  title="Edit Box"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => onDelete(box)}
                  className="p-1.5 rounded text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Hapus Box"
                >
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
          <div className="py-16 flex justify-center">
            <Loader2 size={24} className="animate-spin text-muted" />
          </div>
        )}

        {error && (
          <div className="m-5 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        {box && (
          <div className="space-y-0">
            {/* ── Hero section ── */}
            <div className="px-5 pt-4 pb-5 border-b border-[var(--border)] bg-gradient-to-b from-[var(--bg-secondary)]/60 to-transparent">
              {/* Node identity */}
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border-2 ${
                  box.status === 'ACTIVE' ? 'bg-emerald-500/10 border-emerald-500/30' :
                  box.status === 'MAINTENANCE' ? 'bg-amber-500/10 border-amber-500/30' :
                  'bg-rose-500/10 border-rose-500/30'
                }`}>
                  <Box size={22} className={`${
                    box.status === 'ACTIVE' ? 'text-emerald-400' :
                    box.status === 'MAINTENANCE' ? 'text-amber-400' : 'text-rose-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_BADGE[box.status]}>{STATUS_LABEL[box.status]}</Badge>
                    <span className="text-[10px] text-muted">{MODEL_LABELS[box.modelType] || box.modelType}</span>
                    {box.foVariant && (
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        {box.foVariant}
                      </span>
                    )}
                  </div>
                  {box.address ? (
                    <p className="text-[11px] text-muted flex items-center gap-1 mt-1 truncate">
                      <MapPin size={10} className="shrink-0" /> {box.address}
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted mt-1">Alamat belum diset</p>
                  )}
                </div>
              </div>

              {/* Upstream chain visual */}
              <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                {box.uplinkType === 'CUSTOMER_ONU' && box.uplinkCustomer ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                    <Zap size={9} /> Bridge ONU {box.uplinkCustomer.name} / {box.uplinkOnuPort || 'LAN 1'}
                  </span>
                ) : box.uplinkType === 'HTB' && box.uplinkHtb ? (
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                    <Network size={9} /> {box.uplinkHtb.name} / {box.uplinkPortLabel || 'FO'}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-[var(--bg-card)] border border-[var(--border)] text-muted">
                    Core Switch / Server NOC
                  </span>
                )}

                <ChevronRight size={10} className="text-muted" />
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 font-semibold">
                  <Box size={9} /> {box.name}
                </span>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Critical Infrastructure Gateway Banner (Case: ONU Bridge) */}
              {box.uplinkType === 'CUSTOMER_ONU' && box.uplinkCustomer && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5">
                  <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-0.5 text-xs text-amber-200">
                    <span className="font-bold text-amber-300 block">
                      Jalur Kritis: Bridge ONU Pelanggan {box.uplinkCustomer.name} ({box.uplinkCustomer.customerId})
                    </span>
                    <p className="text-[11px] text-amber-200/80 leading-relaxed">
                      Box HTB ini menerima sumber internet utama melalui port LAN bridge ONU pelanggan <b>{box.uplinkCustomer.name}</b>.
                      Jika ONU tersebut mengalami <b>LOS, padam, atau isolir OLT</b>, maka seluruh pelanggan pada Box HTB ini akan ikut offline.
                    </p>
                  </div>
                </div>
              )}

              {/* Power Host Banner */}
              {box.hostCustomer && (
                <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center gap-2 text-xs text-sky-300">
                  <Zap size={14} className="text-sky-400 shrink-0" />
                  <span>
                    Box ini menumpang catu daya listrik di rumah <b>{box.hostCustomer.name}</b> ({box.hostCustomer.customerId}).
                    {box.powerNotes && ` (${box.powerNotes})`}
                  </span>
                </div>
              )}

              {/* Kapasitas Port Card */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary">Kapasitas Port</span>
                  <span className={`text-sm font-bold font-mono ${
                    pct >= 90 ? 'text-rose-400' : pct >= 70 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {usedPorts}<span className="text-muted font-normal">/{totalPorts}</span>
                  </span>
                </div>

                <ProgressBar
                  value={usedPorts}
                  max={totalPorts || 1}
                  colorClass={pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'}
                />

                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                    <p className="text-sm font-bold text-emerald-400">{availablePorts}</p>
                    <p className="text-[9px] text-muted mt-0.5">Port Tersedia</p>
                  </div>
                  <div className="text-center py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                    <p className="text-sm font-bold text-primary">{customers.length}</p>
                    <p className="text-[9px] text-muted mt-0.5">Pelanggan</p>
                  </div>
                  <div className="text-center py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                    <p className="text-sm font-bold text-primary">{pct}%</p>
                    <p className="text-[9px] text-muted mt-0.5">Terpakai</p>
                  </div>
                </div>
              </div>

              {/* ── Port Visual Slot ── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                    Panel Port Switch FO
                  </p>
                  <span className="text-[10px] text-muted">
                    {usedPorts}/{totalPorts} port aktif
                  </span>
                </div>

                {/* Optical SC Ports */}
                {foPorts.length > 0 && (
                  <div className="p-3 rounded-xl bg-[var(--bg-secondary)]/50 border border-[var(--border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cable size={13} className="text-sky-400" />
                        <span className="text-xs font-bold text-primary">Port Optik SC (Fiber)</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold border bg-sky-500/10 text-sky-400 border-sky-500/30">
                          WDM BiDi
                        </span>
                      </div>
                      <span className="text-[10px] text-muted font-medium">
                        {foPorts.filter(p => (p.role && p.role !== 'UNUSED') || p.customers?.length > 0).length}/{foPorts.length} terpakai
                      </span>
                    </div>

                    <div className="grid gap-2" style={{
                      gridTemplateColumns: `repeat(${foPorts.length <= 4 ? foPorts.length : foPorts.length <= 6 ? foPorts.length : 6}, 1fr)`
                    }}>
                      {foPorts.map(p => {
                        const isSideB = p.wavelength === '1550'
                        const cust = p.customers?.[0]
                        const isUplink = p.role === 'UPLINK'
                        const isCascade = p.role === 'CASCADE'
                        const isLocalAp = p.role === 'LOCAL_AP'
                        const isCust = p.role === 'CUSTOMER' || !!cust
                        const isUsed = isUplink || isCascade || isLocalAp || isCust

                        return (
                          <div
                            key={p.id}
                            onClick={() => handleOpenEditPort(p)}
                            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer group flex flex-col justify-between ${
                              isUsed
                                ? isUplink
                                  ? 'bg-cyan-500/10 border-cyan-500/40 hover:border-cyan-400'
                                  : isCascade
                                    ? 'bg-purple-500/10 border-purple-500/40 hover:border-purple-400'
                                    : isCust
                                      ? 'bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-400'
                                      : 'bg-blue-500/10 border-blue-500/40 hover:border-blue-400'
                                : 'bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--accent)]/50'
                            }`}
                            title={isUsed ? (cust ? `Pelanggan: ${cust.name}` : p.label) : 'Klik untuk kelola peran port'}
                          >
                            <div className="flex items-center justify-between text-[9px] font-mono mb-1">
                              <span className="font-bold text-primary">{p.label}</span>
                              <span className={isSideB ? 'text-amber-400' : 'text-sky-400'}>
                                {isSideB ? '1550' : '1310'}
                              </span>
                            </div>

                            <div className="my-1.5 flex justify-center">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
                                isSideB
                                  ? 'bg-amber-950/30 border-amber-500/40 text-amber-400'
                                  : 'bg-sky-950/30 border-sky-500/40 text-sky-400'
                              }`}>
                                <div className={`w-2 h-2 rounded-full ${isUsed ? (isSideB ? 'bg-amber-400' : 'bg-sky-400') : 'bg-zinc-700'}`} />
                              </div>
                            </div>

                            <p className="text-[10px] truncate text-muted mt-1">
                              {isUplink
                                ? 'Uplink In'
                                : isCascade
                                  ? (p.targetPortLabel || 'Estafet')
                                  : isLocalAp
                                    ? 'Access Point'
                                    : cust ? cust.name : 'Kosong'}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Electrical RJ45 LAN Ports */}
                {lanPorts.length > 0 && (
                  <div className="p-3 rounded-xl bg-[var(--bg-secondary)]/50 border border-[var(--border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Network size={13} className="text-emerald-400" />
                        <span className="text-xs font-bold text-primary">Port Ethernet RJ45 (LAN)</span>
                      </div>
                      <span className="text-[10px] text-muted font-medium">
                        {lanPorts.filter(p => (p.role && p.role !== 'UNUSED') || p.customers?.length > 0).length}/{lanPorts.length} terpakai
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {lanPorts.map(p => {
                        const cust = p.customers?.[0]
                        const isUplink = p.role === 'UPLINK' || p.connectedToType === 'ONU_UPLINK'
                        const isCascade = p.role === 'CASCADE'
                        const isLocalAp = p.role === 'LOCAL_AP'
                        const isCust = p.role === 'CUSTOMER' || !!cust
                        const isUsed = isUplink || isCascade || isLocalAp || isCust

                        return (
                          <div
                            key={p.id}
                            onClick={() => handleOpenEditPort(p)}
                            className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer group flex flex-col justify-between ${
                              isUsed
                                ? isUplink
                                  ? 'bg-amber-500/10 border-amber-500/40 hover:border-amber-400'
                                  : isCascade
                                    ? 'bg-purple-500/10 border-purple-500/40 hover:border-purple-400'
                                    : isCust
                                      ? 'bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-400'
                                      : 'bg-blue-500/10 border-blue-500/40 hover:border-blue-400'
                                : 'bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--accent)]/50'
                            }`}
                            title={isUsed ? (cust ? `Pelanggan: ${cust.name}` : p.label) : 'Klik untuk kelola peran port'}
                          >
                            <div className="flex items-center justify-between text-[9px] font-mono mb-1">
                              <span className="font-bold text-primary">{p.label}</span>
                              <span className="text-muted">RJ45</span>
                            </div>

                            <div className="my-1.5 flex justify-center">
                              <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center text-muted group-hover:text-primary">
                                <Network size={14} className={isUsed ? (isUplink ? 'text-amber-400' : isCust ? 'text-emerald-400' : 'text-purple-400') : 'text-muted'} />
                              </div>
                            </div>

                            <p className="text-[10px] truncate text-muted mt-1">
                              {isUplink
                                ? (box.uplinkType === 'CUSTOMER_ONU' ? 'Bridge In' : 'Uplink In')
                                : isCascade
                                  ? (p.targetPortLabel || 'Estafet')
                                  : isLocalAp
                                    ? 'Access Point'
                                    : cust ? cust.name : 'Kosong'}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Downstream Cascade (Cabang Estafet) ── */}
              {box.downlinkBoxes?.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
                      Cabang Estafet Downstream
                    </p>
                    <span className="text-[10px] text-muted bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                      {box.downlinkBoxes.length}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {box.downlinkBoxes.map(child => (
                      <div
                        key={child.id}
                        onClick={() => handleNavigateChild(child.id)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent-glow)] transition-all cursor-pointer group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center shrink-0">
                          <Box size={12} className="text-muted group-hover:text-[var(--accent)] transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-primary truncate">{child.name}</p>
                          <p className="text-[9px] text-muted mt-0.5 truncate">
                            {child.address || child.modelType}
                          </p>
                        </div>
                        <ChevronRight size={12} className="text-muted group-hover:text-[var(--accent)] transition-colors shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Pelanggan Terhubung List ── */}
              <div>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">
                  Pelanggan Terhubung ({customers.length})
                </p>

                {customers.length === 0 ? (
                  <p className="text-[11px] text-muted text-center py-4 bg-[var(--bg-secondary)]/30 rounded-xl border border-[var(--border)]">
                    Belum ada pelanggan terhubung ke Box HTB ini.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {customers.map(c => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]"
                      >
                        <div>
                          <p className="text-xs font-semibold text-primary">{c.name}</p>
                          <p className="text-[10px] text-muted font-mono">
                            {c.customerId} • {c.cpeType || 'Router WiFi'}
                          </p>
                        </div>

                        <button
                          onClick={() => navigate(`/customers/${c.id}`)}
                          className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1"
                        >
                          Detail <ExternalLink size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info Teknis Tambahan */}
              <div className="pt-2 border-t border-[var(--border)] space-y-2">
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">Info Tambahan</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Row label="Penempatan" value={box.mountType} />
                  <Row label="Catu Daya" value={POWER_LABELS[box.powerSource] || box.powerSource} />
                  {box.lat != null && box.lng != null && (
                    <Row label="Koordinat GPS" value={`${box.lat.toFixed(5)}, ${box.lng.toFixed(5)}`} mono />
                  )}
                  {box.powerNotes && <Row label="Catatan Power" value={box.powerNotes} />}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Port Edit Modal */}
      {editPort && (
        <div className="fixed inset-0 z-[2100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  editPort.portType === 'FO'
                    ? (editPort.wavelength === '1550' ? 'bg-amber-500/10 text-amber-400' : 'bg-sky-500/10 text-sky-400')
                    : 'bg-emerald-500/10 text-emerald-400'
                }`}>
                  {editPort.portType === 'FO' ? <Cable size={16} /> : <Network size={16} />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-primary">
                    Port {editPort.label}
                  </h3>
                  <p className="text-[10px] text-muted">
                    {editPort.portType === 'FO'
                      ? `SC BiDi Optik (${editPort.wavelength === '1550' ? 'Tx 1550 / Rx 1310 Side B' : 'Tx 1310 / Rx 1550 Side A'})`
                      : 'RJ45 Fast/Gigabit Ethernet'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditPort(null)}
                className="text-muted hover:text-primary transition-colors p-1"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            {editPort.customers?.length > 0 ? (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <Users size={14} /> Terhubung Pelanggan Aktif
                  </div>
                  <div className="text-xs text-primary font-medium">
                    {editPort.customers[0].name} ({editPort.customers[0].customerId})
                  </div>
                  {editPort.customers[0].address && (
                    <p className="text-[11px] text-muted">{editPort.customers[0].address}</p>
                  )}
                  {editPort.customers[0].packageName && (
                    <p className="text-[11px] text-emerald-300 font-mono">Paket: {editPort.customers[0].packageName}</p>
                  )}
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  icon={ExternalLink}
                  className="w-full justify-center text-xs"
                  onClick={() => navigate(`/customers/${editPort.customers[0].id}`)}
                >
                  Buka Detail Pelanggan
                </Button>

                <p className="text-[10px] text-muted text-center leading-relaxed">
                  Untuk melepaskan atau mengubah peran port ini, putuskan sambungan melalui form edit pelanggan.
                </p>

                <div className="flex justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditPort(null)}>
                    Tutup
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-secondary">Pilih Peran Port (Role)</p>

                <div className="space-y-1.5">
                  {/* UNUSED */}
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    selectedRole === 'UNUSED'
                      ? 'bg-[var(--bg-secondary)] border-[var(--border)] ring-1 ring-[var(--accent)]'
                      : 'border-[var(--border)]/60 hover:bg-[var(--bg-secondary)]/50'
                  }`}>
                    <input
                      type="radio"
                      name="portRole"
                      value="UNUSED"
                      checked={selectedRole === 'UNUSED'}
                      onChange={() => setSelectedRole('UNUSED')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-semibold block text-primary">Kosong (Tersedia)</span>
                      <span className="text-[10px] text-muted">Port bebas, belum ada kabel atau peran aktif</span>
                    </div>
                  </label>

                  {/* UPLINK */}
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    selectedRole === 'UPLINK'
                      ? 'bg-cyan-500/10 border-cyan-500/40 ring-1 ring-cyan-400'
                      : 'border-[var(--border)]/60 hover:bg-[var(--bg-secondary)]/50'
                  }`}>
                    <input
                      type="radio"
                      name="portRole"
                      value="UPLINK"
                      checked={selectedRole === 'UPLINK'}
                      onChange={() => setSelectedRole('UPLINK')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-semibold block text-primary">
                        {editPort.portType === 'LAN' && box.uplinkType === 'CUSTOMER_ONU'
                          ? 'Uplink (Bridge In dari ONU)'
                          : 'Uplink In (Sumber Internet Masuk)'}
                      </span>
                      <span className="text-[10px] text-muted">
                        Jalur internet utama yang memberi koneksi ke switch box ini
                      </span>
                    </div>
                  </label>

                  {/* CASCADE */}
                  <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    selectedRole === 'CASCADE'
                      ? 'bg-purple-500/10 border-purple-500/40 ring-1 ring-purple-400'
                      : 'border-[var(--border)]/60 hover:bg-[var(--bg-secondary)]/50'
                  }`}>
                    <input
                      type="radio"
                      name="portRole"
                      value="CASCADE"
                      checked={selectedRole === 'CASCADE'}
                      onChange={() => setSelectedRole('CASCADE')}
                      className="mt-0.5"
                    />
                    <div>
                      <span className="text-xs font-semibold block text-primary">Estafet Downlink (Ke Box Lain)</span>
                      <span className="text-[10px] text-muted">Menyalurkan kabel ke Box HTB cabang berikutnya</span>
                    </div>
                  </label>

                  {/* LOCAL_AP */}
                  {editPort.portType === 'LAN' && (
                    <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                      selectedRole === 'LOCAL_AP'
                        ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-400'
                        : 'border-[var(--border)]/60 hover:bg-[var(--bg-secondary)]/50'
                    }`}>
                      <input
                        type="radio"
                        name="portRole"
                        value="LOCAL_AP"
                        checked={selectedRole === 'LOCAL_AP'}
                        onChange={() => setSelectedRole('LOCAL_AP')}
                        className="mt-0.5"
                      />
                      <div>
                        <span className="text-xs font-semibold block text-primary">Access Point (WiFi Warga)</span>
                        <span className="text-[10px] text-muted">Kabel LAN menuju AP Hotspot / Voucheran</span>
                      </div>
                    </label>
                  )}
                </div>

                {selectedRole === 'CASCADE' && (
                  <div className="pt-1">
                    <label className="block text-[11px] text-muted mb-1 font-medium">Keterangan / Tujuan Estafet</label>
                    <input
                      type="text"
                      placeholder="Contoh: Ke Box Tiang 05 / RT 02"
                      value={targetPortLabel}
                      onChange={e => setTargetPortLabel(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                )}

                {/* Shortcut to Customer Registration */}
                <div className="pt-2 border-t border-[var(--border)]">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    icon={Users}
                    className="w-full justify-center text-xs"
                    onClick={() => navigate(`/customers/new?htbBoxId=${box.id}&htbPortId=${editPort.id}`)}
                  >
                    + Daftarkan Pelanggan Baru di Port Ini
                  </Button>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => setEditPort(null)} disabled={savingPort}>
                    Batal
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={savingPort}
                    onClick={handleSavePortRole}
                  >
                    {savingPort ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
