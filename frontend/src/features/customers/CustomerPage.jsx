import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, RefreshCw, Users, Wifi,
  CheckCircle2, AlertTriangle, XCircle, Pencil, Trash2,
  ChevronLeft, ChevronRight, MapPin, LayoutGrid, List,
  Package, Cable,
} from 'lucide-react'
import { useToast } from '../../context/ToastContext'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { api } from '../../lib/api'
import { useCustomerList, useCustomerStats, STATUS_CFG } from './useCustomers'
import CustomerDetail from './CustomerDetail'

const STATUS_BADGE = {
  ACTIVE:     'online',
  SUSPENDED:  'warning',
  TERMINATED: 'offline',
}

// ── Stats Card ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, total, color, barColor }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon size={12} />
          </div>
          <span className="text-[10px] text-muted">{label}</span>
        </div>
        <span className="text-[10px] text-muted font-mono">{pct}%</span>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-xl font-bold text-primary leading-none">{value.toLocaleString('id-ID')}</p>
      </div>
      <div className="h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Customer Card (Grid view) ─────────────────────────────────────────────────

function CustomerCard({ c, onClick, onEdit, onDelete }) {
  const cfg = STATUS_CFG[c.serviceStatus] ?? STATUS_CFG.ACTIVE
  return (
    <div
      onClick={onClick}
      className="card p-0 cursor-pointer hover:border-[var(--accent)]/50 hover:shadow-lg transition-all group overflow-hidden"
    >
      <div className={`h-0.5 w-full ${
        c.serviceStatus === 'ACTIVE'     ? 'bg-emerald-500' :
        c.serviceStatus === 'SUSPENDED'  ? 'bg-amber-400'   : 'bg-rose-500'
      }`} />
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary truncate">{c.name}</p>
            <p className="text-[10px] text-muted font-mono">{c.customerId}</p>
          </div>
          <Badge variant={STATUS_BADGE[c.serviceStatus] ?? 'online'}>{cfg.label}</Badge>
        </div>

        {c.packageName && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <Package size={9} className="shrink-0 text-[var(--accent)]" />
            <span className="truncate">{c.packageName}</span>
            {c.packageSpeed && <span className="ml-auto text-[var(--accent)] font-semibold shrink-0">{c.packageSpeed}M</span>}
          </div>
        )}

        {c.odp && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <Cable size={9} className="shrink-0" />
            <span className="truncate">
              {c.odp.odc?.name && <span className="opacity-50">{c.odp.odc.name} › </span>}
              <span className="text-primary">{c.odp.name}</span>
              {c.odpPort && <span className="text-[var(--accent)] font-mono ml-0.5">:{c.odpPort}</span>}
            </span>
          </div>
        )}

        {c.pppoeUsername && (
          <div className="flex items-center gap-1.5 text-[10px] text-muted">
            <Wifi size={9} className="shrink-0 opacity-50" />
            <span className="font-mono truncate">{c.pppoeUsername}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-1.5 border-t border-[var(--border)]">
          <span className="text-[9px] text-muted truncate max-w-[70%]">
            {c.address || '—'}
          </span>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={e => { e.stopPropagation(); onEdit() }}
              className="p-1.5 rounded text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors">
              <Pencil size={10} />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete() }}
              className="p-1.5 rounded text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Customer Row (List view) ──────────────────────────────────────────────────

function CustomerRow({ c, onClick, onEdit, onDelete }) {
  const cfg = STATUS_CFG[c.serviceStatus] ?? STATUS_CFG.ACTIVE
  return (
    <tr
      onClick={onClick}
      className="border-b border-[var(--border)] hover:bg-[var(--bg-secondary)] cursor-pointer transition-colors group"
    >
      <td className="py-2.5 pl-4 pr-2">
        <div>
          <p className="text-xs font-medium text-primary">{c.name}</p>
          <p className="text-[10px] text-muted font-mono">{c.customerId}</p>
        </div>
      </td>
      <td className="py-2.5 px-2 hidden md:table-cell">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </td>
      <td className="py-2.5 px-2 hidden lg:table-cell">
        {c.packageName
          ? <span className="text-[10px] text-primary">{c.packageName}</span>
          : <span className="text-[10px] text-muted">—</span>
        }
      </td>
      <td className="py-2.5 px-2 hidden xl:table-cell">
        {c.odp
          ? <span className="text-[10px] text-primary font-medium">{c.odp.name}{c.odpPort ? <span className="text-[var(--accent)] ml-0.5">:{c.odpPort}</span> : ''}</span>
          : <span className="text-[10px] text-muted">—</span>
        }
      </td>
      <td className="py-2.5 px-2 hidden xl:table-cell">
        {c.pppoeUsername
          ? <span className="text-[10px] font-mono text-muted">{c.pppoeUsername}</span>
          : <span className="text-[10px] text-muted">—</span>
        }
      </td>
      <td className="py-2.5 pl-2 pr-4">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 justify-end transition-opacity">
          <button onClick={e => { e.stopPropagation(); onEdit() }}
            className="p-1.5 rounded text-muted hover:text-primary hover:bg-[var(--bg-card)] transition-colors">
            <Pencil size={11} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            className="p-1.5 rounded text-muted hover:text-rose-400 hover:bg-rose-500/10 transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CustomerPage() {
  const navigate = useNavigate()
  const toast    = useToast()

  const [search,       setSearch]       = useState('')
  const [status,       setStatus]       = useState('')
  const [page,         setPage]         = useState(1)
  const [view,         setView]         = useState('grid')   // 'grid' | 'list'
  const [detailId,     setDetailId]     = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: stats, refetch: refetchStats } = useCustomerStats()

  const LIMIT = 48
  const { data: customers, total, loading, error, refetch } = useCustomerList({
    q: search, status, page, limit: LIMIT,
  })
  const totalPages = Math.ceil(total / LIMIT) || 1

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`/customers/${deleteTarget.id}`)
      toast.success(`"${deleteTarget.name}" berhasil dihapus`)
      setDeleteTarget(null)
      refetch()
      refetchStats()
    } catch (e) {
      toast.error(e.message || 'Gagal menghapus pelanggan')
    }
  }, [deleteTarget, refetch, toast])

  return (
    <div className="p-4 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Users size={15} className="text-[var(--accent)]" />
            Pelanggan
            {!loading && (
              <span className="text-[10px] text-muted bg-[var(--bg-secondary)] px-2 py-0.5 rounded-full border border-[var(--border)]">
                {total.toLocaleString('id-ID')}
              </span>
            )}
          </h1>
          <p className="text-[10px] text-muted mt-0.5">Manajemen data pelanggan FTTH</p>
        </div>
        <Button onClick={() => navigate('/customers/new')} icon={Plus}>
          Tambah
        </Button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={CheckCircle2} label="Aktif"
          value={stats.ACTIVE} total={stats.total}
          color="bg-emerald-500/15 text-emerald-400"
          barColor="bg-emerald-500"
        />
        <StatCard
          icon={AlertTriangle} label="Isolir"
          value={stats.SUSPENDED} total={stats.total}
          color="bg-amber-500/15 text-amber-400"
          barColor="bg-amber-400"
        />
        <StatCard
          icon={XCircle} label="Berhenti"
          value={stats.TERMINATED} total={stats.total}
          color="bg-rose-500/15 text-rose-400"
          barColor="bg-rose-500"
        />
      </div>

      {/* ── Filter + View Toggle ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-44">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Nama, ID, PPPoE, SN ONU..."
            className="w-full pl-8 pr-3 py-2 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>

        <select
          value={status}
          onChange={e => { setStatus(e.target.value); setPage(1) }}
          className="px-3 py-2 text-xs bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-primary focus:outline-none focus:border-[var(--accent)] transition-colors"
        >
          <option value="">Semua Status</option>
          <option value="ACTIVE">Aktif</option>
          <option value="SUSPENDED">Isolir</option>
          <option value="TERMINATED">Berhenti</option>
        </select>

        <button
          onClick={refetch}
          title="Refresh"
          className="p-2 rounded-lg text-muted hover:text-primary hover:bg-[var(--bg-secondary)] border border-[var(--border)] transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>

        {/* View toggle */}
        <div className="flex rounded-lg border border-[var(--border)] overflow-hidden">
          <button
            onClick={() => setView('grid')}
            className={`p-2 transition-colors ${view === 'grid' ? 'bg-[var(--accent)] text-white' : 'text-muted hover:text-primary hover:bg-[var(--bg-secondary)]'}`}
          >
            <LayoutGrid size={13} />
          </button>
          <button
            onClick={() => setView('list')}
            className={`p-2 transition-colors ${view === 'list' ? 'bg-[var(--accent)] text-white' : 'text-muted hover:text-primary hover:bg-[var(--bg-secondary)]'}`}
          >
            <List size={13} />
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className={view === 'grid'
          ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'
          : 'space-y-1.5'
        }>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="card animate-pulse h-20" />
          ))}
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && customers.length === 0 && (
        <div className="text-center py-16 text-muted text-xs space-y-2">
          <Users size={32} className="mx-auto opacity-15" />
          <p className="text-sm font-medium text-primary opacity-40">
            {search || status ? 'Tidak ada data' : 'Belum ada pelanggan'}
          </p>
          <p>{search || status ? 'Coba ubah filter pencarian' : 'Mulai tambah pelanggan baru'}</p>
          {!search && !status && (
            <Button onClick={() => navigate('/customers/new')} icon={Plus} size="sm" className="mt-3">
              Tambah Pelanggan
            </Button>
          )}
        </div>
      )}

      {/* ── Grid view ── */}
      {!loading && customers.length > 0 && view === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {customers.map(c => (
            <CustomerCard
              key={c.id} c={c}
              onClick={() => setDetailId(c.id)}
              onEdit={() => navigate(`/customers/${c.id}/edit`)}
              onDelete={() => setDeleteTarget(c)}
            />
          ))}
        </div>
      )}

      {/* ── List view ── */}
      {!loading && customers.length > 0 && view === 'list' && (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                <th className="text-left py-2.5 pl-4 pr-2 text-[10px] font-semibold text-muted uppercase tracking-wider">Pelanggan</th>
                <th className="text-left py-2.5 px-2 text-[10px] font-semibold text-muted uppercase tracking-wider hidden md:table-cell">Status</th>
                <th className="text-left py-2.5 px-2 text-[10px] font-semibold text-muted uppercase tracking-wider hidden lg:table-cell">Paket</th>
                <th className="text-left py-2.5 px-2 text-[10px] font-semibold text-muted uppercase tracking-wider hidden xl:table-cell">ODP</th>
                <th className="text-left py-2.5 px-2 text-[10px] font-semibold text-muted uppercase tracking-wider hidden xl:table-cell">PPPoE</th>
                <th className="py-2.5 pr-4" />
              </tr>
            </thead>
            <tbody>
              {customers.map(c => (
                <CustomerRow
                  key={c.id} c={c}
                  onClick={() => setDetailId(c.id)}
                  onEdit={() => navigate(`/customers/${c.id}/edit`)}
                  onDelete={() => setDeleteTarget(c)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted">
            {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, total)} dari {total.toLocaleString('id-ID')}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[var(--bg-secondary)] disabled:opacity-30 transition-colors border border-[var(--border)]"
            >
              <ChevronLeft size={13} />
            </button>
            <span className="text-[10px] text-muted px-1">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[var(--bg-secondary)] disabled:opacity-30 transition-colors border border-[var(--border)]"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailId && <CustomerDetail customerId={detailId} onClose={() => setDetailId(null)} />}

      {/* Confirm delete */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Pelanggan"
        message={deleteTarget ? `Hapus "${deleteTarget.name}" (${deleteTarget.customerId})? Tindakan ini tidak dapat dibatalkan.` : ''}
        variant="danger"
        confirmText="Hapus"
        cancelText="Batal"
        onConfirm={handleDelete}
      />
    </div>
  )
}
