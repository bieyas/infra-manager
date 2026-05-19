import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, Search, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, XCircle, Wrench, MapPin, Radio, Users,
  Trash2, Pencil, Network, Signal,
  Ratio,
} from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ProgressBar from '../../components/ui/ProgressBar'
import ConfirmModal from '../../components/ui/ConfirmModal'
import {
  useOdpList, deleteOdpWithProtection,
  splitterLabel, capacityFromRatio,
} from './useDistribution'
import OdpDetail from './OdpDetail'
import OdcDetail from './OdcDetail'

const STATUS_CFG = {
  ACTIVE:      { label: 'Aktif',     badge: 'online',  icon: CheckCircle2, cls: 'text-emerald-400' },
  INACTIVE:    { label: 'Nonaktif',  badge: 'offline', icon: XCircle,      cls: 'text-rose-400' },
  MAINTENANCE: { label: 'Perbaikan', badge: 'warning', icon: Wrench,       cls: 'text-amber-400' },
}

// PortDots shared
function PortDots({ used, capacity, max = 16 }) {
  const show = Math.min(capacity, max)
  return (
    <div className="flex flex-wrap gap-0.5">
      {Array.from({ length: show }, (_, i) => (
        <div key={i} className={`w-2 h-2 rounded-sm ${
          i < used ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
        }`} />
      ))}
      {capacity > max && <span className="text-[9px] text-muted ml-0.5 self-center">+{capacity - max}</span>}
    </div>
  )
}

function OdpCard({ odp, onClick, onEdit, onDelete, onShowOdc }) {
  const cfg      = STATUS_CFG[odp.status] ?? STATUS_CFG.ACTIVE
  const StatusIcon = cfg.icon

  const firstSplitter = odp.splitters?.[0]

  const effectiveRatio = firstSplitter && firstSplitter.splitterType
    ? `R1_${firstSplitter.splitterType?.outputCount || firstSplitter.outputs || 8}`
    : odp.splitterRatio
  const effectiveCapacity = odp.capacity ?? odp.totalOutputs ?? capacityFromRatio(effectiveRatio)
  const capacity  = effectiveCapacity
  const available = capacity > 0 ? capacity - odp.usedPorts : null
  const pct = capacity > 0 ? Math.round((odp.usedPorts / capacity) * 100) : 0

  return (
    <div onClick={onClick} className="card p-0 cursor-pointer hover:border-[var(--accent)]/50 hover:shadow-lg transition-all group overflow-hidden">
      {/* Status strip */}
      <div className={`h-0.5 w-full ${
        odp.status === 'ACTIVE' ? 'bg-emerald-500' :
        odp.status === 'MAINTENANCE' ? 'bg-amber-400' : 'bg-rose-500'
      }`} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <Signal size={16} className="text-[var(--accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-primary truncate leading-tight">{odp.name}</p>
            {odp.address ? (
              <p className="text-[10px] text-muted flex items-center gap-1 mt-0.5 truncate">
                <MapPin size={9} className="shrink-0" /> {odp.address}
              </p>
            ) : (
              <p className="text-[10px] text-muted mt-0.5">Alamat belum diset</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant={cfg.badge} className="text-[9px]">{cfg.label}</Badge>
            {odp.feederLabel && (
              <span className="text-[9px] font-mono text-muted bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded border border-[var(--border)] truncate max-w-[80px]">
                {odp.feederLabel}
              </span>
            )}
          </div>
        </div>

        {/* Upstream chain */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap text-[10px]">
          {odp.olt && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/20 font-medium">
              <Radio size={9} /> {odp.olt.name} / {odp.ponPort ?? '—'}
            </span>
          )}
          {odp.odc ? (
            <span
              onClick={e => { e.stopPropagation(); onShowOdc?.(odp.odc.id) }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--bg-secondary)] text-secondary border border-[var(--border)] cursor-pointer hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition-colors"
            >
              <Network size={8} /> {odp.odc.name}
            </span>
          ) : odp.uplinkOdp ? (
            <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">↑ {odp.uplinkOdp.name}</span>
          ) : (
            <span className="text-muted px-2 py-0.5 rounded-full border border-[var(--border)]">Upstream belum diset</span>
          )}
          <span className="text-muted">
            {splitterLabel(effectiveRatio)}
            {odp.splitters?.length > 1 && (
              <span className="ml-1 text-emerald-400">×{odp.splitters.length}</span>
            )}
          </span>
        </div>

        {/* Capacity bar */}
        {capacity > 0 ? (
          <div className="space-y-1 mb-2">
            <div className="flex justify-between text-[10px] text-muted">
              <span>{odp.usedPorts}/{capacity} port</span>
              <span className={pct >= 90 ? 'text-rose-400' : pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}>{pct}%</span>
            </div>
            <ProgressBar value={odp.usedPorts} max={capacity}
              colorClass={pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
            <PortDots used={odp.usedPorts} capacity={capacity} />
          </div>
        ) : (
          <p className="text-[9px] text-amber-400/80 mb-2">Splitter belum dikonfigurasi</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
          <span className="text-[10px] text-muted flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Users size={9} /> {odp.customerCount ?? 0} pelanggan
            </span>
            {available !== null && available > 0 && <span className="text-emerald-400 font-medium">{available} free</span>}
            {available === 0 && capacity > 0 && <span className="text-rose-400 font-medium">Penuh</span>}
          </span>
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

export default function OdpPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search,     setSearch]     = useState('')
  const [statusFilt, setStatusFilt] = useState('')
  const [odcFilt,    setOdcFilt]    = useState('')
  const [oltFilt,    setOltFilt]    = useState('')
  const [detailId,   setDetailId]   = useState(null)
  const [odcDetailId, setOdcDetailId] = useState(null)

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

  const { odps, loading, error, refetch } = useOdpList({ search, status: statusFilt, odcId: odcFilt, oltId: oltFilt })

  const stats = useMemo(() => ({
    total:     odps.length,
    active:    odps.filter(o => o.status === 'ACTIVE').length,
    full:      odps.filter(o => (o.capacity ?? 0) > 0 && o.usedPorts >= (o.capacity ?? 0)).length,
    customers: odps.reduce((s, o) => s + (o.customerCount ?? 0), 0),
  }), [odps])

  const handleDelete = async (odp) => {
    setConfirmDel(null)
    setDeleting(odp.id)
    try {
      await deleteOdpWithProtection(odp.id)
      refetch()
    } catch (e) {
      toast.error(e.message || 'Gagal menghapus ODP')
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="p-3 md:p-4 space-y-4 animate-fade-in">

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-bold text-primary">ODP</h1>
          <p className="text-[10px] text-muted">Optical Distribution Point — titik distribusi terakhir ke pelanggan</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => navigate('/odp/new')}>
          Tambah ODP
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="stat-card">
          <p className="text-lg font-bold text-primary">{stats.total}</p>
          <p className="text-[10px] text-muted">Total ODP</p>
        </div>
        <div className="stat-card">
          <p className="text-lg font-bold text-emerald-400">{stats.active}</p>
          <p className="text-[10px] text-muted">Aktif</p>
        </div>
        <div className="stat-card">
          <p className="text-lg font-bold text-primary">{stats.customers}</p>
          <p className="text-[10px] text-muted">Total Pelanggan</p>
        </div>
        <div className="stat-card">
          <p className="text-lg font-bold text-rose-400">{stats.full}</p>
          <p className="text-[10px] text-muted">ODP Penuh</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama atau alamat ODP…"
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]" />
        </div>
        <select value={statusFilt} onChange={e => setStatusFilt(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]">
          <option value="">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="INACTIVE">Nonaktif</option>
          <option value="MAINTENANCE">Perbaikan</option>
        </select>
        <select value={oltFilt} onChange={e => setOltFilt(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]">
          <option value="">Semua OLT</option>
          {[...new Map(odps.filter(o => o.olt).map(o => [o.olt.id, o.olt])).values()].map(olt => (
            <option key={olt.id} value={olt.id}>{olt.name}</option>
          ))}
        </select>
        <select value={odcFilt} onChange={e => setOdcFilt(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]">
          <option value="">Semua ODC</option>
          {[...new Map(odps.filter(o => o.odc).map(o => [o.odc.id, o.odc])).values()].map(odc => (
            <option key={odc.id} value={odc.id}>{odc.name}</option>
          ))}
        </select>
        <button onClick={refetch}
          className="p-1.5 rounded-lg border border-[var(--border)] text-muted hover:text-primary hover:border-[var(--accent)] transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          <AlertCircle size={13} /> <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-muted">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-sm">Memuat data ODP…</span>
        </div>
      ) : odps.length === 0 ? (
        <div className="py-16 text-center text-muted text-sm space-y-2">
          <p>Belum ada data ODP.</p>
          <Button variant="outline" size="sm" icon={Plus} onClick={() => navigate('/odp/new')}>Tambah ODP pertama</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {odps.map(odp => (
            <OdpCard key={odp.id} odp={odp}
              onClick={() => setDetailId(odp.id)}
              onEdit={() => navigate(`/odp/${odp.id}/edit`)}
              onDelete={() => setConfirmDel(odp)}
              onShowOdc={id => setOdcDetailId(id)} />
          ))}
        </div>
      )}

      {detailId && (
        <OdpDetail odpId={detailId} onClose={() => setDetailId(null)}
          onEdit={(odp) => { setDetailId(null); navigate(`/odp/${odp.id}/edit`) }}
          onDelete={(odp) => { setDetailId(null); setConfirmDel(odp) }}
          onNavigateOdp={(id) => setDetailId(id)} />
      )}

      {/* ODC detail popup dari klik badge ODC di OdpCard */}
      {odcDetailId && (
        <OdcDetail
          odcId={odcDetailId}
          onClose={() => setOdcDetailId(null)}
          onEdit={(odc) => { setOdcDetailId(null); navigate(`/odc/${odc.id}/edit`) }}
          onDelete={(odc) => { setOdcDetailId(null) }}
          onNavigateOdc={(id) => setOdcDetailId(id)}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => handleDelete(confirmDel)}
        title="Hapus ODP?"
        message={`"${confirmDel?.name}" dan semua data pelanggan terhubung akan dihapus. Jika masih ada pelanggan aktif, penghapusan akan dibatalkan.`}
        variant="danger"
        confirmText={deleting ? 'Menghapus…' : 'Ya, Hapus'}
      />
    </div>
  )
}
