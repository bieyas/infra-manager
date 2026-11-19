import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Plus, Search, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, XCircle, Wrench, MapPin, Radio, Users,
  Trash2, Pencil, Network, Box, Zap, Share2,
} from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ProgressBar from '../../components/ui/ProgressBar'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { useHtbList, deleteHtbBox } from './useHtb'
import HtbDetail from './HtbDetail'

const STATUS_CFG = {
  ACTIVE:      { label: 'Aktif',     badge: 'online',  icon: CheckCircle2, cls: 'text-emerald-400' },
  INACTIVE:    { label: 'Nonaktif',  badge: 'offline', icon: XCircle,      cls: 'text-rose-400' },
  MAINTENANCE: { label: 'Perbaikan', badge: 'warning', icon: Wrench,       cls: 'text-amber-400' },
}

const MODEL_LABELS = {
  SINGLE_1FO_1LAN: 'Single 1 FO',
  SWITCH_3FO_2LAN: 'Sw 3 FO + 2 LAN',
  SWITCH_6FO_2LAN: 'Sw 6 FO + 2 LAN',
  CUSTOM: 'Custom Switch',
}

// PortDots matching ODP
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

function HtbCard({ box, onClick, onEdit, onDelete }) {
  const cfg = STATUS_CFG[box.status] ?? STATUS_CFG.ACTIVE

  const stats = box.stats || {
    totalPorts: box.ports?.length || 0,
    usedPorts: 0,
    freePorts: box.ports?.length || 0,
  }

  const capacity = stats.totalPorts
  const used = stats.usedPorts
  const available = stats.freePorts
  const pct = capacity > 0 ? Math.round((used / capacity) * 100) : 0

  return (
    <div
      onClick={onClick}
      className="card p-0 cursor-pointer hover:border-[var(--accent)]/50 hover:shadow-lg transition-all group overflow-hidden"
    >
      {/* Status strip */}
      <div className={`h-0.5 w-full ${
        box.status === 'ACTIVE' ? 'bg-emerald-500' :
        box.status === 'MAINTENANCE' ? 'bg-amber-400' : 'bg-rose-500'
      }`} />

      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center shrink-0">
            <Box size={16} className="text-[var(--accent)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-primary truncate leading-tight">{box.name}</p>
            {box.address ? (
              <p className="text-[10px] text-muted flex items-center gap-1 mt-0.5 truncate">
                <MapPin size={9} className="shrink-0" /> {box.address}
              </p>
            ) : (
              <p className="text-[10px] text-muted mt-0.5">Alamat belum diset</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant={cfg.badge} className="text-[9px]">{cfg.label}</Badge>
            {box.foVariant && (
              <span className="text-[9px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                {box.foVariant}
              </span>
            )}
          </div>
        </div>

        {/* Upstream chain & Model info */}
        <div className="flex items-center gap-1.5 mb-3 flex-wrap text-[10px]">
          {box.uplinkType === 'CUSTOMER_ONU' && box.uplinkCustomer ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium truncate max-w-[170px]">
              <Zap size={9} className="shrink-0 text-amber-400" /> ONU {box.uplinkCustomer.name}
            </span>
          ) : box.uplinkType === 'HTB' && box.uplinkHtb ? (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 truncate max-w-[150px]">
              ↑ {box.uplinkHtb.name}
            </span>
          ) : (
            <span className="text-muted px-2 py-0.5 rounded-full border border-[var(--border)]">
              Core Switch NOC
            </span>
          )}

          <span className="text-muted">
            {MODEL_LABELS[box.modelType] || box.modelType}
          </span>
        </div>

        {/* Capacity bar */}
        {capacity > 0 ? (
          <div className="space-y-1 mb-2">
            <div className="flex justify-between text-[10px] text-muted">
              <span>{used}/{capacity} port</span>
              <span className={pct >= 90 ? 'text-rose-400' : pct >= 70 ? 'text-amber-400' : 'text-emerald-400'}>{pct}%</span>
            </div>
            <ProgressBar
              value={used}
              max={capacity}
              colorClass={pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'}
            />
            <PortDots used={used} capacity={capacity} />
          </div>
        ) : (
          <p className="text-[9px] text-amber-400/80 mb-2">Port belum dikonfigurasi</p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
          <span className="text-[10px] text-muted flex items-center gap-2">
            <span className="flex items-center gap-1">
              <Users size={9} /> {box.customers?.length ?? box._count?.customers ?? 0} pelanggan
            </span>
            {available > 0 && <span className="text-emerald-400 font-medium">{available} free</span>}
            {available === 0 && capacity > 0 && <span className="text-rose-400 font-medium">Penuh</span>}
          </span>

          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              className="p-1.5 rounded text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors"
              title="Edit Box"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1.5 rounded text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Hapus Box"
            >
              <Trash2 size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HtbPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [modelFilt, setModelFilt] = useState('')
  const [statusFilt, setStatusFilt] = useState('')
  const [detailId, setDetailId] = useState(null)

  const [confirmDel, setConfirmDel] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const { showToast } = useToast()

  // Open detail drawer from URL query param ?detail=<id>
  useEffect(() => {
    const id = searchParams.get('detail')
    if (id) {
      setDetailId(id)
      searchParams.delete('detail')
      setSearchParams(searchParams, { replace: true })
    }
  }, []) // eslint-disable-line

  const { boxes, loading, error, refetch } = useHtbList({
    q: search,
    modelType: modelFilt,
    status: statusFilt,
  })

  const stats = useMemo(() => {
    let totalPorts = 0
    let usedPorts = 0
    let activeCount = 0
    let totalCust = 0

    boxes.forEach(b => {
      if (b.status === 'ACTIVE') activeCount++
      const pCount = b.ports?.length || 0
      totalPorts += pCount
      usedPorts += (b.stats?.usedPorts || 0)
      totalCust += (b.customers?.length || b._count?.customers || 0)
    })

    return {
      total: boxes.length,
      active: activeCount,
      customers: totalCust,
      freePorts: totalPorts - usedPorts,
    }
  }, [boxes])

  const handleDelete = async () => {
    if (!confirmDel) return
    setDeleting(true)
    try {
      await deleteHtbBox(confirmDel.id)
      showToast({ type: 'success', message: `Box "${confirmDel.name}" berhasil dihapus` })
      setConfirmDel(null)
      refetch()
    } catch (e) {
      showToast({ type: 'error', message: e.message || 'Gagal menghapus Box HTB' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-3 md:p-4 space-y-4 animate-fade-in">
      {/* Header matching ODP */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-bold text-primary">Box HTB</h1>
          <p className="text-[10px] text-muted">Active Ethernet & Switch FO — titik distribusi non-OLT dan estafet tiang</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => navigate('/htb/new')}>
          Tambah Box HTB
        </Button>
      </div>

      {/* Stat Cards matching ODP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="stat-card">
          <p className="text-lg font-bold text-primary">{stats.total}</p>
          <p className="text-[10px] text-muted">Total Box HTB</p>
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
          <p className="text-lg font-bold text-cyan-400">{stats.freePorts}</p>
          <p className="text-[10px] text-muted">Port Tersedia</p>
        </div>
      </div>

      {/* Filter and Search Bar matching ODP */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama, kode, atau alamat Box HTB…"
            className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
          />
        </div>

        <select
          value={modelFilt}
          onChange={e => setModelFilt(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="">Semua Model</option>
          <option value="SWITCH_3FO_2LAN">Switch 3 FO + 2 LAN</option>
          <option value="SWITCH_6FO_2LAN">Switch 6 FO + 2 LAN</option>
          <option value="SINGLE_1FO_1LAN">Single (1 FO + 1 LAN)</option>
          <option value="CUSTOM">Custom Switch</option>
        </select>

        <select
          value={statusFilt}
          onChange={e => setStatusFilt(e.target.value)}
          className="px-2 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="MAINTENANCE">Perbaikan</option>
          <option value="INACTIVE">Nonaktif</option>
        </select>

        <button
          onClick={refetch}
          className="p-1.5 rounded-lg border border-[var(--border)] text-muted hover:text-primary hover:border-[var(--accent)] transition-colors"
          title="Refresh data"
        >
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
          <span className="text-sm">Memuat data Box HTB…</span>
        </div>
      ) : boxes.length === 0 ? (
        <div className="py-16 text-center text-muted text-sm space-y-2">
          <p>Belum ada data Box HTB.</p>
          <Button variant="outline" size="sm" icon={Plus} onClick={() => navigate('/htb/new')}>
            Tambah Box HTB pertama
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {boxes.map(box => (
            <HtbCard
              key={box.id}
              box={box}
              onClick={() => setDetailId(box.id)}
              onEdit={() => navigate(`/htb/${box.id}/edit`)}
              onDelete={() => setConfirmDel(box)}
            />
          ))}
        </div>
      )}

      {/* Detail Drawer Modal */}
      {detailId && (
        <HtbDetail
          htbId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(b) => navigate(`/htb/${b.id}/edit`)}
          onDelete={(b) => {
            setDetailId(null)
            setConfirmDel(b)
          }}
          onNavigateHtb={(id) => setDetailId(id)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {confirmDel && (
        <ConfirmModal
          isOpen={true}
          title="Hapus Box HTB"
          message={`Apakah Anda yakin ingin menghapus Box HTB "${confirmDel.name}"? Pastikan tidak ada pelanggan atau box cabang yang masih terhubung.`}
          confirmLabel={deleting ? 'Menghapus…' : 'Ya, Hapus'}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setConfirmDel(null)}
        />
      )}
    </div>
  )
}
