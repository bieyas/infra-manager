import React, { useState, useMemo, useCallback, memo, useEffect } from 'react'
import {
  Search, Plus, Network, RefreshCw, Loader2, AlertCircle, X,
  ChevronRight, Pencil, Trash2, Server, Tag,
} from 'lucide-react'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ProgressBar from '../../components/ui/ProgressBar'
import { useSubnets, useHosts } from './useIpam'
import { useVlans } from '../vlans/useVlans'
import SubnetForm from './SubnetForm'
import HostForm from './HostForm'

// ── helpers ──────────────────────────────────────────────────────────────────

function cidrToSize(cidr) {
  const prefix = parseInt(cidr.split('/')[1] ?? '24', 10)
  return Math.max(0, (1 << (32 - prefix)) - 2)
}

function statusColor(s) {
  switch (s) {
    case 'ACTIVE':    return 'text-emerald-400'
    case 'RESERVED':  return 'text-amber-400'
    case 'SUSPENDED': return 'text-rose-400'
    default:          return 'text-muted'
  }
}
function statusBadge(s) {
  switch (s) {
    case 'ACTIVE':    return 'online'
    case 'RESERVED':  return 'warning'
    case 'SUSPENDED': return 'offline'
    default:          return 'neutral'
  }
}

// ── SubnetRow (expandable with hosts) ────────────────────────────────────────

const SubnetRow = memo(function SubnetRow({ subnet, vlanMap, vlans, onEdit, onDelete }) {
  const [open,    setOpen]    = useState(false)
  const [editH,   setEditH]   = useState(null)   // host being edited
  const [delH,    setDelH]    = useState(null)
  const [hSaving, setHSaving] = useState(false)
  const { hosts, loading: hLoad, reload: reloadHosts, create, update, remove } = useHosts(open ? subnet.id : null)

  const toggle = () => setOpen(o => !o)
  const total  = cidrToSize(subnet.cidr)
  const used   = subnet._count?.hosts ?? 0
  const pct    = total > 0 ? Math.round((used / total) * 100) : 0
  const vlan   = vlanMap[subnet.vlanId]

  const handleSaveHost = async (form) => {
    setHSaving(true)
    const result = editH?.id
      ? await update(editH.id, form)
      : await create(form)
    setHSaving(false)
    if (result.ok) setEditH(null)
    return result
  }

  const handleDeleteHost = async (id) => {
    await remove(id)
    setDelH(null)
  }

  return (
    <>
      {/* ── Subnet row ── */}
      <tr onClick={toggle}
        className="border-b border-[var(--border)]/60 hover:bg-[var(--accent-glow)] transition-colors group cursor-pointer">
        <td className="px-3 py-2.5 w-6">
          <ChevronRight size={12} className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
        </td>
        <td className="px-3 py-2.5">
          <span className="font-mono font-semibold text-xs text-primary">{subnet.cidr}</span>
          {subnet.description && (
            <p className="text-[10px] text-muted truncate max-w-[180px]">{subnet.description}</p>
          )}
        </td>
        <td className="px-3 py-2.5">
          {vlan
            ? <Badge variant={vlan.color ?? 'neutral'} className="text-[10px]">S-VID {vlan.vid} · {vlan.name}</Badge>
            : <span className="text-muted text-[10px]">—</span>
          }
        </td>
        <td className="px-3 py-2.5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ProgressBar value={used} max={Math.max(total, 1)} className="w-20" />
              <span className="text-[10px] text-muted tabular-nums whitespace-nowrap">
                {used}/{total} ({pct}%)
              </span>
            </div>
            {subnet.vlanInterfaces?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {subnet.vlanInterfaces.map(iface => (
                  <span key={iface.id} className="text-[9px] text-muted bg-[var(--surface-2)] px-1.5 py-0.5 rounded">
                    {iface.device.name}:{iface.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost"  size="xs" icon={Plus}   onClick={() => { setOpen(true); setEditH({}) }} title="Tambah host" />
            <Button variant="ghost"  size="xs" icon={Pencil} onClick={() => onEdit(subnet)} />
            <Button variant="danger" size="xs" icon={Trash2} onClick={() => onDelete(subnet)} />
          </div>
        </td>
      </tr>

      {/* ── Host rows ── */}
      {open && (
        hLoad ? (
          <tr><td colSpan={5} className="px-10 py-2">
            <span className="flex items-center gap-2 text-[10px] text-muted">
              <Loader2 size={11} className="animate-spin" />Memuat hosts…
            </span>
          </td></tr>
        ) : hosts.length === 0 ? (
          <tr><td colSpan={5} className="px-10 py-2 text-[10px] text-muted italic">
            Belum ada host — klik <span className="font-semibold">+</span> untuk menambah.
          </td></tr>
        ) : hosts.map(host => (
          <tr key={host.id}
            className="border-b border-[var(--border)]/30 bg-[var(--bg-secondary)]/30 hover:bg-[var(--accent-glow)] transition-colors group/h">
            <td className="pl-8 pr-2 py-1.5 w-6">
              <div className={`w-1.5 h-1.5 rounded-full ${
                host.status === 'ACTIVE' ? 'bg-emerald-400' :
                host.status === 'RESERVED' ? 'bg-amber-400' : 'bg-rose-400'
              }`} />
            </td>
            <td className="px-3 py-1.5">
              <span className="font-mono text-[11px] text-[var(--accent)]">{host.ip}</span>
              {host.hostname && <span className="ml-2 text-[10px] text-secondary">{host.hostname}</span>}
            </td>
            <td className="px-3 py-1.5 font-mono text-[10px] text-muted">
              {host.mac || '—'}
            </td>
            <td className="px-3 py-1.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant={statusBadge(host.status)} className="text-[9px]">{host.status}</Badge>
                {host.vlan && <Badge variant={host.vlan.color ?? 'neutral'} className="text-[9px]">S-VID {host.vlan.vid}</Badge>}
                {host.cvid && <Badge variant="neutral" className="text-[9px] font-mono">C-VID {host.cvid}</Badge>}
              </div>
              {host.notes && <span className="text-[9px] text-muted italic truncate max-w-[120px] inline-block">{host.notes}</span>}
            </td>
            <td className="px-3 py-1.5">
              <div className="flex items-center gap-1 opacity-0 group-hover/h:opacity-100 transition-opacity">
                <Button variant="ghost"  size="xs" icon={Pencil} onClick={() => setEditH(host)} />
                <Button variant="danger" size="xs" icon={Trash2} onClick={() => setDelH(host)} />
              </div>
            </td>
          </tr>
        ))
      )}

      {/* host form modal */}
      {editH !== null && (
        <tr><td colSpan={0}>
          <HostForm
            host={editH?.id ? editH : null}
            subnetCidr={subnet.cidr}
            subnetVlanId={subnet.vlanId}
            vlans={vlans}
            onSave={handleSaveHost}
            onClose={() => setEditH(null)}
            saving={hSaving}
          />
        </td></tr>
      )}

      {/* host delete confirm */}
      {delH && (
        <tr><td colSpan={0}>
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDelH(null)} />
            <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center w-72 space-y-3 shadow-xl">
              <Trash2 size={18} className="text-rose-400 mx-auto" />
              <p className="text-sm font-semibold text-primary">Hapus {delH.ip}?</p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={() => setDelH(null)}>Batal</Button>
                <Button variant="danger"  size="sm" icon={Trash2} onClick={() => handleDeleteHost(delH.id)}>Hapus</Button>
              </div>
            </div>
          </div>
        </td></tr>
      )}
    </>
  )
})

// ── Mobile subnet card ────────────────────────────────────────────────────────

const SubnetCard = memo(function SubnetCard({ subnet, vlanMap, vlans, onEdit, onDelete }) {
  const [open,    setOpen]    = useState(false)
  const [editH,   setEditH]   = useState(null)
  const [delH,    setDelH]    = useState(null)
  const [hSaving, setHSaving] = useState(false)
  const { hosts, loading: hLoad, create, update, remove } = useHosts(open ? subnet.id : null)

  const total = cidrToSize(subnet.cidr)
  const used  = subnet._count?.hosts ?? 0
  const pct   = total > 0 ? Math.round((used / total) * 100) : 0
  const vlan  = vlanMap[subnet.vlanId]

  const handleSaveHost = async (form) => {
    setHSaving(true)
    const result = editH?.id ? await update(editH.id, form) : await create(form)
    setHSaving(false)
    if (result.ok) setEditH(null)
    return result
  }

  return (
    <div className="border-b border-[var(--border)]">
      {/* ── Header tap area ── */}
      <div onClick={() => setOpen(o => !o)}
        className="p-3 flex items-start gap-3 cursor-pointer active:bg-[var(--accent-glow)] transition-colors">
        <ChevronRight size={13} className={`text-muted mt-0.5 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-semibold text-primary">{subnet.cidr}</span>
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              <Button variant="ghost"  size="xs" icon={Plus}   onClick={() => { setOpen(true); setEditH({}) }} />
              <Button variant="ghost"  size="xs" icon={Pencil} onClick={() => onEdit(subnet)} />
              <Button variant="danger" size="xs" icon={Trash2} onClick={() => onDelete(subnet)} />
            </div>
          </div>
          {subnet.description && <p className="text-[10px] text-muted truncate">{subnet.description}</p>}
          {vlan && (
            <Badge variant={vlan.color ?? 'neutral'} className="text-[9px]">
              S-VID {vlan.vid} · {vlan.name}
            </Badge>
          )}
          {subnet.vlanInterfaces?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {subnet.vlanInterfaces.map(iface => (
                <span key={iface.id} className="text-[8px] text-muted bg-[var(--surface-2)] px-1 py-0.5 rounded">
                  {iface.device.name}:{iface.name}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <ProgressBar value={used} max={Math.max(total, 1)} className="flex-1" />
            <span className="text-[10px] text-muted tabular-nums shrink-0">{used}/{total} ({pct}%)</span>
          </div>
        </div>
      </div>

      {/* ── Host list ── */}
      {open && (
        <div className="bg-[var(--bg-secondary)]/30">
          {hLoad ? (
            <div className="py-3 flex items-center justify-center gap-2 text-muted text-[10px]">
              <Loader2 size={11} className="animate-spin" />Memuat hosts…
            </div>
          ) : hosts.length === 0 ? (
            <p className="px-8 py-3 text-[10px] text-muted italic">
              Belum ada host — tap <span className="font-semibold">+</span> untuk menambah.
            </p>
          ) : (
            <div className="divide-y divide-[var(--border)]/40">
              {hosts.map(host => (
                <div key={host.id} className="flex items-center gap-3 px-5 py-2">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    host.status === 'ACTIVE'   ? 'bg-emerald-400' :
                    host.status === 'RESERVED' ? 'bg-amber-400'   : 'bg-rose-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-[11px] text-[var(--accent)]">{host.ip}</span>
                      <Badge variant={statusBadge(host.status)} className="text-[8px]">{host.status}</Badge>
                      {host.vlan && <Badge variant={host.vlan.color ?? 'neutral'} className="text-[8px]">S-VID {host.vlan.vid}</Badge>}
                      {host.cvid && <Badge variant="neutral" className="text-[8px] font-mono">C-VID {host.cvid}</Badge>}
                    </div>
                    {host.hostname && <p className="text-[10px] text-secondary truncate">{host.hostname}</p>}
                    {host.mac     && <p className="text-[9px]  text-muted font-mono">{host.mac}</p>}
                    {host.notes   && <p className="text-[9px]  text-muted italic truncate">{host.notes}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost"  size="xs" icon={Pencil} onClick={() => setEditH(host)} />
                    <Button variant="danger" size="xs" icon={Trash2} onClick={() => setDelH(host)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* host form */}
      {editH !== null && (
        <HostForm
          host={editH?.id ? editH : null}
          subnetCidr={subnet.cidr}
          subnetVlanId={subnet.vlanId}
          vlans={vlans}
          onSave={handleSaveHost}
          onClose={() => setEditH(null)}
          saving={hSaving}
        />
      )}

      {/* host delete confirm */}
      {delH && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDelH(null)} />
          <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center w-72 space-y-3 shadow-xl">
            <Trash2 size={18} className="text-rose-400 mx-auto" />
            <p className="text-sm font-semibold text-primary">Hapus {delH.ip}?</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={() => setDelH(null)}>Batal</Button>
              <Button variant="danger"  size="sm" icon={Trash2} onClick={async () => { await remove(delH.id); setDelH(null) }}>Hapus</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})

// ── useDebounce hook ───────────────────────────────────────────────────────────

function useDebounce(value, delay = 150) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const SORT_OPTS = [
  { key: 'cidr', label: 'CIDR' },
  { key: 'vlan', label: 'VLAN' },
  { key: 'usage', label: 'Utilisasi' },
]

const USAGE_FILTER = ['all', 'low', 'medium', 'high'] // low <30%, medium 30-70%, high >70%

export default function IpamPage() {
  const { subnets, loading, error, reload, create, update, remove } = useSubnets()
  const { vlans } = useVlans()
  const [searchRaw, setSearchRaw] = useState('')
  const search = useDebounce(searchRaw, 150)
  const [sortBy,    setSortBy]    = useState('cidr')
  const [vlanFilter,setVlanFilter]= useState('')
  const [usageFilter,setUsageFilter]= useState('all')
  const [modal,     setModal]     = useState(null)
  const [confirmDel,setConfirmDel]= useState(null)
  const [saving,    setSaving]    = useState(false)
  const [apiError,  setApiError]  = useState(null)

  const vlanMap = useMemo(() => Object.fromEntries(vlans.map(v => [v.id, v])), [vlans])

  const filtered = useMemo(() => {
    let result = subnets.filter(s => {
      // Search
      if (search) {
        const q = search.toLowerCase()
        const match = (
          s.cidr.includes(q) ||
          (s.description ?? '').toLowerCase().includes(q) ||
          (s.vlan?.name  ?? '').toLowerCase().includes(q) ||
          String(s.vlan?.vid ?? '').includes(q)
        )
        if (!match) return false
      }
      // VLAN filter
      if (vlanFilter && s.vlanId !== vlanFilter) return false
      // Usage filter
      if (usageFilter !== 'all') {
        const total = cidrToSize(s.cidr)
        const used = s._count?.hosts ?? 0
        const pct = total > 0 ? (used / total) * 100 : 0
        if (usageFilter === 'low' && pct >= 30) return false
        if (usageFilter === 'medium' && (pct < 30 || pct > 70)) return false
        if (usageFilter === 'high' && pct <= 70) return false
      }
      return true
    })
    // Sort
    result.sort((a, b) => {
      if (sortBy === 'cidr') return a.cidr.localeCompare(b.cidr)
      if (sortBy === 'vlan') {
        const va = vlanMap[a.vlanId]?.vid ?? 0
        const vb = vlanMap[b.vlanId]?.vid ?? 0
        return va - vb
      }
      if (sortBy === 'usage') {
        const pa = (a._count?.hosts ?? 0) / Math.max(cidrToSize(a.cidr), 1)
        const pb = (b._count?.hosts ?? 0) / Math.max(cidrToSize(b.cidr), 1)
        return pb - pa // high usage first
      }
      return 0
    })
    return result
  }, [subnets, search, vlanFilter, usageFilter, sortBy, vlanMap])

  const totalIPs = useMemo(() => subnets.reduce((s, n) => s + cidrToSize(n.cidr), 0), [subnets])
  const usedIPs  = useMemo(() => subnets.reduce((s, n) => s + (n._count?.hosts ?? 0), 0), [subnets])

  const handleSave = useCallback(async (form) => {
    setSaving(true); setApiError(null)
    const result = modal === 'add'
      ? await create(form)
      : await update(modal.id, form)
    setSaving(false)
    if (result.ok) setModal(null)
    else setApiError(result.error ?? 'Gagal menyimpan subnet')
  }, [modal, create, update])

  const handleDelete = useCallback(async (id) => {
    setApiError(null)
    const result = await remove(id)
    if (result.ok) setConfirmDel(null)
    else { setConfirmDel(null); setApiError(result.error ?? 'Gagal menghapus subnet') }
  }, [remove])

  return (
    <div className="p-3 md:p-4 space-y-3 animate-fade-in">

      {/* Error banner */}
      {apiError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          <AlertCircle size={13} className="shrink-0" />
          <span className="flex-1">{apiError}</span>
          <button onClick={() => setApiError(null)}><X size={12} /></button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <Network size={14} className="accent-text" />
          <p className="text-2xl font-bold text-primary">
            {loading ? <Loader2 size={18} className="animate-spin text-muted" /> : subnets.length}
          </p>
          <p className="text-[10px] text-muted">Subnets</p>
        </div>
        <div className="stat-card">
          <Server size={14} className="text-cyan-400" />
          <p className="text-2xl font-bold text-cyan-400">{usedIPs.toLocaleString()}</p>
          <p className="text-[10px] text-muted">IP Terpakai</p>
        </div>
        <div className="stat-card">
          <Tag size={14} className="text-emerald-400" />
          <p className="text-2xl font-bold text-emerald-400">{Math.max(0, totalIPs - usedIPs).toLocaleString()}</p>
          <p className="text-[10px] text-muted">IP Tersedia</p>
        </div>
      </div>

      {/* Main table */}
      <Card>
        <CardHeader
          action={
            <div className="flex items-center gap-2">
              <button onClick={reload} disabled={loading}
                className="text-muted hover:text-primary transition-colors disabled:opacity-40">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
              <Button variant="primary" size="sm" icon={Plus} onClick={() => setModal('add')}>
                <span className="hidden sm:inline">Tambah Subnet</span>
                <span className="sm:hidden">Tambah</span>
              </Button>
            </div>
          }
        >
          <Network size={14} className="accent-text" />
          <span className="text-sm font-semibold text-primary">IP Address Management</span>
          <Badge variant="neutral" className="ml-1">{filtered.length}</Badge>
        </CardHeader>

        {/* Filters */}
        <div className="px-4 py-2 border-b border-[var(--border)]/60 space-y-2">
          <div className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-2.5 py-1.5">
            <Search size={11} className="text-muted shrink-0" />
            <input type="text" placeholder="Cari CIDR, deskripsi, VLAN…"
              value={searchRaw} onChange={e => setSearchRaw(e.target.value)}
              className="flex-1 bg-transparent text-xs text-primary placeholder-muted outline-none" />
            {searchRaw && <button onClick={() => setSearchRaw('')} className="text-muted hover:text-primary text-xs">✕</button>}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* VLAN Filter */}
            <select value={vlanFilter} onChange={e => setVlanFilter(e.target.value)}
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs text-primary px-2 py-1.5 outline-none focus:border-[var(--accent)]">
              <option value="">Semua VLAN</option>
              {vlans.map(v => (
                <option key={v.id} value={v.id}>VID {v.vid} — {v.name}</option>
              ))}
            </select>
            {/* Usage Filter */}
            <select value={usageFilter} onChange={e => setUsageFilter(e.target.value)}
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs text-primary px-2 py-1.5 outline-none focus:border-[var(--accent)]">
              <option value="all">Semua Utilisasi</option>
              <option value="low">Rendah (&lt;30%)</option>
              <option value="medium">Sedang (30-70%)</option>
              <option value="high">Tinggi (&gt;70%)</option>
            </select>
            {/* Sort */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
              className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs text-primary px-2 py-1.5 outline-none focus:border-[var(--accent)]">
              {SORT_OPTS.map(o => <option key={o.key} value={o.key}>Urut: {o.label}</option>)}
            </select>
            {/* Clear filters */}
            {(vlanFilter || usageFilter !== 'all' || searchRaw) && (
              <button onClick={() => { setVlanFilter(''); setUsageFilter('all'); setSearchRaw('') }}
                className="text-[10px] text-muted hover:text-primary underline">Reset</button>
            )}
          </div>
        </div>

        <CardBody className="p-0">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted">
              <Loader2 size={22} className="animate-spin" />
              <span className="text-xs">Memuat data subnet…</span>
            </div>
          ) : error ? (
            <div className="m-4 flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted text-xs">
              {subnets.length === 0 ? 'Belum ada subnet. Klik "Tambah Subnet" untuk memulai.' : 'Tidak ada subnet yang cocok.'}
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] text-muted uppercase tracking-wider bg-[var(--surface-2)]/50">
                      <th className="px-3 py-2 w-6"></th>
                      <th className="px-3 py-2 text-left font-medium">CIDR / Deskripsi</th>
                      <th className="px-3 py-2 text-left font-medium">S-VLAN</th>
                      <th className="px-3 py-2 text-left font-medium">Utilisasi / Interface</th>
                      <th className="px-3 py-2 text-left font-medium w-24">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(subnet => (
                      <SubnetRow
                        key={subnet.id}
                        subnet={subnet}
                        vlanMap={vlanMap}
                        vlans={vlans}
                        onEdit={s => setModal(s)}
                        onDelete={s => setConfirmDel(s)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y divide-[var(--border)]">
                {filtered.map(subnet => (
                  <SubnetCard
                    key={subnet.id}
                    subnet={subnet}
                    vlanMap={vlanMap}
                    vlans={vlans}
                    onEdit={s => setModal(s)}
                    onDelete={s => setConfirmDel(s)}
                  />
                ))}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Subnet form */}
      {modal && (
        <SubnetForm
          subnet={modal === 'add' ? null : modal}
          vlans={vlans}
          onSave={handleSave}
          onClose={() => { setModal(null); setApiError(null) }}
          saving={saving}
        />
      )}

      {/* Subnet delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDel(null)} />
          <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 text-center w-80 space-y-3 shadow-xl">
            <Trash2 size={18} className="text-rose-400 mx-auto" />
            <p className="text-sm font-semibold text-primary">Hapus subnet <span className="font-mono">{confirmDel.cidr}</span>?</p>
            <p className="text-xs text-muted">Semua host dalam subnet ini juga akan dihapus.</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={() => setConfirmDel(null)}>Batal</Button>
              <Button variant="danger"  size="sm" icon={Trash2} onClick={() => handleDelete(confirmDel.id)}>Hapus</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
