import React, { useState, useMemo } from 'react'
import {
  MapPin, Calendar, Tag,
  Box, Circle, Zap, Home, Cable, Network, Layers
} from 'lucide-react'
import clsx from 'clsx'
import { CORE_COLORS } from '../../data/ftthData'
import UtilizationCard from './components/UtilizationCard'
import FtthDetailHeader from './components/FtthDetailHeader'
import InfoSection from './components/InfoSection'
import ActionButtons from './components/ActionButtons'

const TYPE_CFG = {
  odc:     { label: 'ODC',     color: '#00cbca', icon: Box    },
  odp:     { label: 'ODP',     color: '#8b5cf6', icon: Circle },
  closure: { label: 'Closure', color: '#f59e0b', icon: Cable  },
  olt:     { label: 'OLT',     color: '#22c55e', icon: Zap    },
  htb:     { label: 'HTB',     color: '#34d399', icon: Home   },
}

const STATUS_CFG = {
  active:      { label: 'Aktif',       color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: null },
  inactive:    { label: 'Non-aktif',   color: 'text-slate-400',   bg: 'bg-slate-500/10',   icon: null },
  maintenance: { label: 'Maintenance', color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: null },
}

function InfoRow({ label, value, mono }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-[var(--border)]/50">
      <span className="text-[11px] text-muted shrink-0">{label}</span>
      <span className={clsx('text-[11px] text-primary text-right', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

export default function FtthDetail({ node, allNodes, onClose, onEdit, onDelete }) {
  const [tab, setTab]       = useState('info')
  const [confirmDel, setConfirmDel] = useState(false)

  if (!node) return null

  const cfg        = TYPE_CFG[node.type] ?? TYPE_CFG.odc
  const statusCfg  = STATUS_CFG[node.status] ?? STATUS_CFG.active
  const StatusIcon = statusCfg.icon
  const TypeIcon   = cfg.icon

  // Find parent nodes efficiently
  const parentOlt = useMemo(() => {
    if (node?.oltId && allNodes) {
      const found = allNodes.find(n => n.id === node.oltId && n.type === 'olt')
      if (found) return found
    }
    return node?.olt || null
  }, [node?.oltId, node?.olt, allNodes])
  
  const parentOdc = useMemo(() => {
    if (node?.odcId && allNodes) return allNodes.find(n => n.id === node.odcId && n.type === 'odc')
    return parent
  }, [node?.odcId, parent, allNodes])
  
  const children = useMemo(() => 
    (allNodes ?? []).filter(n => n.parentId === node.id),
    [allNodes, node.id]
  )

  const coreTotal  = Number(node?.cableCore) || 0
  const usedCores  = (node?.cores ?? []).filter(c => c.usedBy).length

  const TABS = [
    { id: 'info',     label: 'Info'     },
    { id: 'cores',    label: `Core (${coreTotal})`, hide: node?.type === 'htb' },
    { id: 'children', label: `Downline (${children?.length ?? 0})` },
  ].filter(t => !t.hide)

  return (
    <div className="fixed inset-0 z-[3000] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full md:max-w-md bg-[var(--bg-card)] border border-[var(--border)] md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl shadow-2xl flex flex-col max-h-[88vh]">

        {/* Header */}
        <FtthDetailHeader node={node} onClose={onClose} />

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)] shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex-1 py-2.5 text-xs font-medium transition-all',
                tab === t.id
                  ? 'border-b-2 text-[var(--accent)]'
                  : 'text-secondary hover:text-primary'
              )}
              style={tab === t.id ? { borderBottomColor: cfg.color } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* ── Info tab ── */}
          {tab === 'info' && (
            <div className="space-y-4">
              
              {/* Section: Informasi Lokasi */}
              {node.address && (
                <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                  <div className="flex items-start gap-2">
                    <MapPin size={16} className="text-muted shrink-0 mt-0.5" />
                    <p className="text-xs text-secondary">{node.address}</p>
                  </div>
                </div>
              )}
              
              {/* Section: Koneksi Jaringan */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wide">Koneksi Jaringan</h4>
                
                <InfoSection node={node} parentOlt={parentOlt} parentOdc={parentOdc} />
                
                <div className="grid grid-cols-2 gap-2">
                  <InfoRow label="Tipe" value={cfg.label} />
                  <InfoRow label="Status" value={statusCfg.label} />
                </div>
              </div>
              
              {/* Section: Kapasitas & Utilisasi */}
              <div className="space-y-3">
                <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wide">Kapasitas & Utilisasi</h4>
                
                {/* Utilization untuk ODC */}
                {node?.type === 'odc' && node?.utilization !== undefined && (
                  <UtilizationCard 
                    value={node?.utilization} 
                    label="Utilisasi ODP" 
                    showSplitter={true}
                    splitterRatio={node?.splitterRatio}
                  />
                )}
                
                {/* Utilization untuk ODP */}
                {node?.type === 'odp' && (
                  <UtilizationCard 
                    value={node?.utilization} 
                    label="Utilisasi Port" 
                    showSplitter={true}
                    splitterRatio={node?.splitterRatio}
                  />
                )}
              </div>
              
              {/* Section: Detail Teknis */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-semibold text-muted uppercase tracking-wide">Detail Teknis</h4>
                <div className="grid grid-cols-2 gap-2">
                  <InfoRow label="Koordinat" value={`${node.lat?.toFixed(6)}, ${node.lng?.toFixed(6)}`} mono />
                  <InfoRow label="Kabel" value={node?.cableCore ? `${node.cableCore} core` : null} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <InfoRow label="Brand" value={node?.brand} />
                  <InfoRow label="Model" value={node?.model} />
                </div>
                <InfoRow label="Tgl Pasang" value={node?.installDate} />
                {node?.pic && <InfoRow label="PIC" value={node?.pic} />}
              </div>

              {node?.type === 'closure' && (
                <InfoRow label="Pemasangan"  value={{ aerial: 'Aerial (Tiang)', underground: 'Underground', wall: 'Wall Mount', pole: 'Pole Mount' }[node?.mountType] ?? node?.mountType} />
              )}

              {node?.type === 'htb' && (
                <>
                  <InfoRow label="Pelanggan"   value={node?.customerName} />
                  <InfoRow label="ID Pelanggan" value={node?.customerId}  mono />
                  <InfoRow label="Serial No."  value={node?.serialNo}    mono />
                  <InfoRow label="No. Core"    value={node?.coreNo}      mono />
                </>
              )}

              {node?.notes && (
                <div className="mt-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                  <p className="text-[10px] text-muted mb-1 uppercase tracking-wider">Catatan</p>
                  <p className="text-xs text-secondary">{node?.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* ── Core tab ── */}
          {tab === 'cores' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Total {coreTotal} core</span>
                <span className="text-muted">{usedCores} terpakai · {coreTotal - usedCores} tersedia</span>
              </div>

              {/* Utilization bar */}
              <div className="h-1.5 rounded-full bg-[var(--bg-secondary)] mb-3">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all"
                  style={{ width: `${coreTotal ? (usedCores / coreTotal) * 100 : 0}%` }}
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto pr-1">
                {Array.from({ length: coreTotal }).map((_, i) => {
                  const colorDef = CORE_COLORS[i % 12]
                  const tubeNo   = Math.floor(i / 12) + 1
                  const coreData = (node.cores ?? [])[i]
                  const isUsed   = coreData?.usedBy

                  return (
                    <div
                      key={i}
                      className={clsx(
                        'flex items-center gap-2 p-2 rounded-lg border transition-all',
                        isUsed
                          ? 'bg-[var(--accent-glow)] border-[var(--accent)]/30'
                          : 'bg-[var(--bg-secondary)] border-[var(--border)]'
                      )}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                        style={{ background: colorDef.hex }}
                        title={colorDef.name}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-mono text-primary">Core {i + 1}</p>
                        <p className="text-[9px] text-muted">Tube {tubeNo} · {colorDef.name}</p>
                        {isUsed && (
                          <p className="text-[9px] text-[var(--accent)] truncate">{coreData.usedBy}</p>
                        )}
                      </div>
                      <span className={clsx(
                        'text-[9px] font-semibold px-1.5 py-0.5 rounded',
                        isUsed ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'bg-[var(--border)] text-muted'
                      )}>
                        {isUsed ? 'OK' : 'FREE'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Children/Downline tab ── */}
          {tab === 'children' && (
            <div className="space-y-1.5">
              {children.length === 0 ? (
                <p className="text-xs text-muted text-center py-8">Tidak ada downline</p>
              ) : children.map(child => {
                const childCfg = TYPE_CFG[child.type] ?? TYPE_CFG.odc
                const ChildIcon = childCfg.icon
                return (
                  <div
                    key={child.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] hover:border-[var(--accent)]/30 transition-all"
                  >
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${childCfg.color}22` }}
                    >
                      <ChildIcon size={13} style={{ color: childCfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-primary">{child.name}</p>
                      <p className="text-[10px] text-muted font-mono">{child.id} · {childCfg.label}</p>
                    </div>
                    <span className={clsx(
                      'text-[9px] px-1.5 py-0.5 rounded-full font-medium',
                      child.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    )}>
                      {child.status}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        {!confirmDel ? (
          <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
            <ActionButtons 
              onEdit={onEdit} 
              onDelete={() => setConfirmDel(true)} 
              nodeType={cfg.label}
            />
          </div>
        ) : (
          <div className="px-4 py-3 border-t border-[var(--border)] shrink-0 space-y-2">
            <p className="text-xs text-rose-400 text-center font-medium">
              Hapus <strong>{node.name}</strong>? Semua downline juga akan terhapus.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDel(false)}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-[var(--bg-secondary)] text-secondary border border-[var(--border)] hover:border-[var(--accent)] transition-all"
              >
                Batal
              </button>
              <button
                onClick={onDelete}
                className="flex-1 py-2 rounded-lg text-xs font-medium bg-rose-500 text-white hover:opacity-90 transition-opacity"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
