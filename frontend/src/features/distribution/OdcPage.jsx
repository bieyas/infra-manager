import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, Search, RefreshCw, Loader2, AlertCircle,
  Pencil, Trash2, MapPin, Radio, Box, Network,
  CheckCircle2, XCircle, Wrench, Cable,
} from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ProgressBar from '../../components/ui/ProgressBar'
import ConfirmModal from '../../components/ui/ConfirmModal'
import {
  useOdcList, deleteOdcWithProtection,
  splitterLabel, capacityFromRatio,
} from './useDistribution'
import OdcDetail from './OdcDetail'

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  ACTIVE:      { label: 'Aktif',     badge: 'online',  icon: CheckCircle2, cls: 'text-emerald-400' },
  INACTIVE:    { label: 'Nonaktif',  badge: 'offline', icon: XCircle,      cls: 'text-rose-400' },
  MAINTENANCE: { label: 'Perbaikan', badge: 'warning', icon: Wrench,       cls: 'text-amber-400' },
}

function CapacityBar({ used, capacity }) {
  if (!capacity) return <span className="text-muted text-[10px]">—</span>
  const pct = Math.round((used / capacity) * 100)
  const color = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'
  return (
    <div className="space-y-0.5 w-full">
      <div className="flex justify-between text-[10px] text-muted">
        <span>{used}/{capacity} port</span>
        <span>{pct}%</span>
      </div>
      <ProgressBar value={used} max={capacity} colorClass={color} />
    </div>
  )
}

// ── Mini port-fill visual ──────────────────────────────────────────────────
function PortDots({ used, capacity, max = 16 }) {
  const show = Math.min(capacity, max)
  return (
    <div className="flex flex-wrap gap-0.5">
      {Array.from({ length: show }, (_, i) => (
        <div
          key={i}
          className={`w-2 h-2 rounded-sm ${
            i < used ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
          }`}
        />
      ))}
      {capacity > max && (
        <span className="text-[9px] text-muted ml-0.5 self-center">+{capacity - max}</span>
      )}
    </div>
  )
}

// ── ODC row card ───────────────────────────────────────────────────────────────
function OdcCard({ odc, onClick, onEdit, onDelete }) {
  const cfg      = STATUS_CFG[odc.status] ?? STATUS_CFG.ACTIVE
  const StatusIcon = cfg.icon

  const firstSplitter = odc.splitters?.[0]
  const effectiveRatio = firstSplitter
    ? `R1_${firstSplitter.splitterType?.outputCount || firstSplitter.outputs || 8}`
    : odc.splitterRatio
  const effectiveCapacity = odc.capacity ?? odc.totalOutputs ?? capacityFromRatio(effectiveRatio)
  const capacity  = effectiveCapacity
  const used      = odc.usedOutputs ?? odc.usedPorts ?? 0
  const available = (capacity ?? 0) - used
  const pct       = capacity > 0 ? Math.round((used / capacity) * 100) : 0

  return (
    <div
      onClick={onClick}
      className="card p-0 cursor-pointer hover:border-[var(--accent)]/50 hover:shadow-lg transition-all group overflow-hidden"
    >
      {/* Top accent strip by status */}
      <div className={`h-0.5 w-full ${
        odc.status === 'ACTIVE' ? 'bg-emerald-500' :
        odc.status === 'MAINTENANCE' ? 'bg-amber-400' : 'bg-rose-500'
      }`} />

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          {/* Node icon */}
          <div className="w-9 h-9 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <Box size={16} className="text-[var(--accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-primary truncate leading-tight">{odc.name}</p>
            {odc.address ? (
              <p className="text-[10px] text-muted flex items-center gap-1 mt-0.5 truncate">
                <MapPin size={9} className="shrink-0" /> {odc.address}
              </p>
            ) : (
              <p className="text-[10px] text-muted mt-0.5">Alamat belum diset</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant={cfg.badge} className="text-[9px]">{cfg.label}</Badge>
            {odc.feederLabel && (
              <span className="text-[9px] font-mono text-muted bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border)] truncate max-w-[80px]">
                {odc.feederLabel}
              </span>
            )}
          </div>
        </div>

        {/* Upstream chain */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {odc.olt ? (
            <span className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/20 font-medium">
              <Radio size={9} /> {odc.olt.name} / {odc.ponPort ?? 'PON?'}
            </span>
          ) : (
            <span className="text-[10px] text-muted px-2 py-0.5 rounded-full border border-[var(--border)]">
              OLT belum diset
            </span>
          )}
          {odc.uplinkType === 'odc' && odc.uplinkOdc && (
            <span className="text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Network size={8} /> {odc.uplinkOdc.name}
            </span>
          )}
          <span className="text-[10px] text-muted">
            {splitterLabel(effectiveRatio)}
            {odc.splitters?.length > 1 && (
              <span className="ml-1 text-emerald-400">×{odc.splitters.length}</span>
            )}
          </span>
        </div>

        {/* Capacity */}
        <CapacityBar used={used} capacity={capacity} />

        {/* Port dots visual */}
        {capacity > 0 && (
          <div className="mt-2">
            <PortDots used={used} capacity={capacity} />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
          <div className="flex items-center gap-3 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <Cable size={9} />
              <span>{odc.odps?.length ?? 0} ODP</span>
            </span>
            {available > 0 ? (
              <span className="text-emerald-400 font-medium">{available} port free</span>
            ) : capacity > 0 ? (
              <span className="text-rose-400 font-medium">Penuh</span>
            ) : null}
          </div>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={e => { e.stopPropagation(); onEdit() }}
              className="p-1.5 rounded text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors">
              <Pencil size={11} />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1.5 rounded text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function OdcPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search,     setSearch]     = useState('')
  const [statusFilt, setStatusFilt] = useState('')
  const [oltFilt,    setOltFilt]    = useState('')
  const [detailId,   setDetailId]   = useState(null)

  // Open detail drawer from URL query param ?detail=<id>
  useEffect(() => {
    const id = searchParams.get('detail')
    if (id) {
      setDetailId(id)
      searchParams.delete('detail')
      setSearchParams(searchParams, { replace: true })
    }
  }, []) // eslint-disable-line
  const toast = useToast()
  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting,   setDeleting]   = useState(null)

  const { odcs, loading, error, refetch } = useOdcList({ search, status: statusFilt, oltId: oltFilt })

  const stats = useMemo(() => ({
    total:    odcs.length,
    active:   odcs.filter(o => o.status === 'ACTIVE').length,
    full:     odcs.filter(o => {
      const cap  = o.capacity ?? o.totalOutputs ?? capacityFromRatio(o.splitterRatio)
      const used = o.usedOutputs ?? o.usedPorts ?? 0
      return cap > 0 && used >= cap
    }).length,
    totalOdp: odcs.reduce((s, o) => s + (o.odps?.length ?? 0), 0),
  }), [odcs])

  const handleDelete = async (odc) => {
    setConfirmDel(null)
    setDeleting(odc.id)
    try {
      await deleteOdcWithProtection(odc.id)
      refetch()
    } catch (e) {
      toast.error(e.message || 'Gagal menghapus ODC')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-3 md:p-4 space-y-4 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-bold text-primary">ODC</h1>
          <p className="text-[10px] text-muted">Optical Distribution Cabinet — titik splitter pertama dari OLT</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => navigate('/odc/new')}>
          Tambah ODC
        </Button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="stat-card">
          <p className="text-lg font-bold text-primary">{stats.total}</p>
          <p className="text-[10px] text-muted">Total ODC</p>
        </div>
        <div className="stat-card">
          <p className="text-lg font-bold text-emerald-400">{stats.active}</p>
          <p className="text-[10px] text-muted">Aktif</p>
        </div>
        <div className="stat-card">
          <p className="text-lg font-bold text-primary">{stats.totalOdp}</p>
          <p className="text-[10px] text-muted">Total ODP</p>
        </div>
        <div className="stat-card">
          <p className="text-lg font-bold text-rose-400">{stats.full}</p>
          <p className="text-[10px] text-muted">ODC Penuh</p>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama atau alamat ODC…"
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <select
          value={statusFilt}
          onChange={e => setStatusFilt(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Nonaktif</option>
          <option value="MAINTENANCE">Perbaikan</option>
        </select>
        <select
          value={oltFilt}
          onChange={e => setOltFilt(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="">Semua OLT</option>
          {[...new Map(odcs.filter(o => o.olt).map(o => [o.olt.id, o.olt])).values()].map(olt => (
            <option key={olt.id} value={olt.id}>{olt.name}</option>
          ))}
        </select>
        <button
          onClick={refetch}
          className="p-1.5 rounded-lg border border-[var(--border)] text-muted hover:text-primary hover:border-[var(--accent)] transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Error fetch ── */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          <AlertCircle size={13} />
          <span>{error}</span>
        </div>
      )}

      {/* ── List ── */}
      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-muted">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-sm">Memuat data ODC…</span>
        </div>
      ) : odcs.length === 0 ? (
        <div className="py-16 text-center text-muted text-sm space-y-2">
          <p>Belum ada data ODC.</p>
          <Button variant="outline" size="sm" icon={Plus} onClick={() => navigate('/odc/new')}>
            Tambah ODC pertama
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {odcs.map(odc => (
            <OdcCard
              key={odc.id}
              odc={odc}
              onClick={() => setDetailId(odc.id)}
              onEdit={() => navigate(`/odc/${odc.id}/edit`)}
              onDelete={() => setConfirmDel(odc)}
            />
          ))}
        </div>
      )}

      {/* ── Detail drawer ── */}
      {detailId && (
        <OdcDetail
          odcId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(odc) => { setDetailId(null); navigate(`/odc/${odc.id}/edit`) }}
          onDelete={(odc) => { setDetailId(null); setConfirmDel(odc) }}
          onNavigateOdc={(id) => setDetailId(id)}
        />
      )}

      {/* ── Delete confirm ── */}
      <ConfirmModal
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => handleDelete(confirmDel)}
        title="Hapus ODC?"
        message={`"${confirmDel?.name}" beserta semua ODP terhubung akan dihapus permanen. Jika masih ada ODP aktif, penghapusan akan dibatalkan.`}
        variant="danger"
        confirmText={deleting ? 'Menghapus…' : 'Ya, Hapus'}
      />
    </div>
  )
}
