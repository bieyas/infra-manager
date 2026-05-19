import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Tag, RefreshCw, Loader2, AlertCircle, X, Network, ArrowDown, ArrowUp } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import StatusDot from '../../components/ui/StatusDot'
import VlanForm from './VlanForm'
import VlanTable from './VlanTable'
import DeleteConfirm from './DeleteConfirm'
import { useVlans } from './useVlans'
import { useInterfaces } from '../interfaces/useInterfaces'

const VLAN_TYPES = new Set(['vlan', 'pppoe-out', 'l2tp-out', 'sstp-out', 'ovpn-out'])
function fmtBps(bps) {
  if (!bps) return '—'
  const n = Number(bps)
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Gbps`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} Mbps`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} Kbps`
  return `${n} bps`
}

export default function VlansPage() {
  const { vlans, loading, error, saving, reload, create, update, remove } = useVlans()
  const [search,     setSearch]     = useState('')
  const [modal,      setModal]      = useState(null)   // null | 'add' | vlan object
  const [confirmDel, setConfirmDel] = useState(null)
  const [apiError,   setApiError]   = useState(null)

  const filtered = useMemo(() => vlans.filter(v =>
    !search ||
    String(v.vid).includes(search) ||
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.description ?? '').toLowerCase().includes(search.toLowerCase())
  ), [vlans, search])

  const countActive   = vlans.filter(v => v.status === 'ACTIVE').length
  const totalIfaces   = vlans.reduce((s, v) => s + (v._count?.interfaces ?? 0), 0)

  const { ifaces: allIfaces, loading: ifaceLoading } = useInterfaces()
  const [ifSearch, setIfSearch] = useState('')
  const vlanIfaces = useMemo(() => {
    const base = allIfaces.filter(i => i.ifType && VLAN_TYPES.has(i.ifType))
    if (!ifSearch) return base
    const q = ifSearch.toLowerCase()
    return base.filter(i =>
      (i.name ?? '').toLowerCase().includes(q) ||
      (i.device?.name ?? '').toLowerCase().includes(q)
    )
  }, [allIfaces, ifSearch])

  const handleSave = async (form) => {
    setApiError(null)
    let result
    if (modal === 'add') {
      result = await create(form)
    } else {
      const { vid, ...patch } = form
      result = await update(modal.id, patch)
    }
    if (result.ok) {
      setModal(null)
    } else {
      setApiError(result.error ?? 'Gagal menyimpan VLAN')
    }
  }

  const handleDelete = async (id) => {
    setApiError(null)
    const result = await remove(id)
    if (result.ok) {
      setConfirmDel(null)
    } else {
      setConfirmDel(null)
      setApiError(result.error ?? 'Gagal menghapus VLAN')
    }
  }

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

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <Tag size={14} className="accent-text" />
          <p className="text-2xl font-bold text-primary">
            {loading ? <Loader2 size={18} className="animate-spin text-muted" /> : vlans.length}
          </p>
          <p className="text-[10px] text-muted">Total VLAN</p>
        </div>
        <div className="stat-card">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-2xl font-bold text-emerald-400">{countActive}</p>
          <p className="text-[10px] text-muted">Active</p>
        </div>
        <div className="stat-card">
          <Tag size={14} className="text-violet-400" />
          <p className="text-2xl font-bold text-primary font-mono">{totalIfaces}</p>
          <p className="text-[10px] text-muted">Total Interface</p>
        </div>
      </div>

      <Card>
        <CardHeader
          action={
            <div className="flex items-center gap-2">
              <button onClick={reload} disabled={loading}
                className="text-muted hover:text-primary transition-colors disabled:opacity-40">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
              <Button variant="primary" size="sm" icon={Plus} onClick={() => setModal('add')}>
                <span className="hidden sm:inline">Tambah VLAN</span>
                <span className="sm:hidden">Tambah</span>
              </Button>
            </div>
          }
        >
          <Tag size={14} className="accent-text" />
          <span className="text-sm font-semibold text-primary">VLAN Table</span>
          <Badge variant="neutral" className="ml-1">{filtered.length}</Badge>
        </CardHeader>

        {/* Search */}
        <div className="px-4 py-2 border-b border-[var(--border)]/60">
          <div className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-2.5 py-1.5">
            <Search size={11} className="text-muted shrink-0" />
            <input
              type="text"
              placeholder="Cari ID, nama, deskripsi…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-primary placeholder-muted outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted hover:text-primary text-xs">✕</button>
            )}
          </div>
        </div>

        <CardBody className="p-0">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted">
              <Loader2 size={22} className="animate-spin" />
              <span className="text-xs">Memuat data VLAN…</span>
            </div>
          ) : error ? (
            <div className="m-4 flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : (
            <VlanTable
              vlans={filtered}
              onEdit={vlan => setModal(vlan)}
              onDelete={vlan => setConfirmDel(vlan)}
            />
          )}
        </CardBody>
      </Card>

      {modal && (
        <VlanForm
          vlan={modal === 'add' ? null : modal}
          onSave={handleSave}
          onClose={() => { setModal(null); setApiError(null) }}
          saving={saving}
        />
      )}

      <DeleteConfirm
        vlan={confirmDel}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />

      {/* ── VLAN Interfaces (virtual interfaces dari device) ── */}
      <Card>
        <CardHeader>
          <Network size={13} className="accent-text" />
          <span className="text-sm font-semibold text-primary">VLAN Interfaces</span>
          <Badge variant="neutral" className="ml-1">{vlanIfaces.length}</Badge>
        </CardHeader>

        <div className="px-4 py-2 border-b border-[var(--border)]/60">
          <div className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-2.5 py-1.5">
            <Search size={11} className="text-muted shrink-0" />
            <input
              type="text"
              placeholder="Cari nama atau device…"
              value={ifSearch}
              onChange={e => setIfSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-primary placeholder-muted outline-none"
            />
            {ifSearch && (
              <button onClick={() => setIfSearch('')} className="text-muted hover:text-primary text-xs">✕</button>
            )}
          </div>
        </div>

        <CardBody className="p-0">
          {ifaceLoading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-muted">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-xs">Memuat…</span>
            </div>
          ) : vlanIfaces.length === 0 ? (
            <div className="py-10 text-center text-muted text-xs">
              {allIfaces.filter(i => i.ifType && VLAN_TYPES.has(i.ifType)).length === 0
                ? 'Belum ada VLAN interface. Ambil snapshot device untuk sync otomatis.'
                : 'Tidak ada interface yang cocok.'}
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] text-muted uppercase tracking-wider bg-[var(--surface-2)]/50">
                      <th className="px-4 py-2 text-left font-medium w-8"></th>
                      <th className="px-4 py-2 text-left font-medium">Device</th>
                      <th className="px-4 py-2 text-left font-medium">Interface</th>
                      <th className="px-4 py-2 text-left font-medium">VID</th>
                      <th className="px-4 py-2 text-left font-medium">In (↓)</th>
                      <th className="px-4 py-2 text-left font-medium">Out (↑)</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vlanIfaces.map((iface, idx) => {
                      const isUp = iface.status === 'UP'
                      return (
                        <tr key={iface.id}
                          className={`border-b border-[var(--border)]/50 hover:bg-[var(--accent-glow)] transition-colors ${
                            idx % 2 === 1 ? 'bg-[var(--bg-secondary)]/20' : ''
                          }`}>
                          <td className="px-4 py-2.5">
                            <StatusDot status={isUp ? 'online' : 'offline'} pulse={isUp} />
                          </td>
                          <td className="px-4 py-2.5 font-medium text-primary">
                            {iface.device
                              ? <Link to={`/devices/${iface.device.id}`}
                                  className="hover:text-[var(--accent)] transition-colors">
                                  {iface.device.name}
                                </Link>
                              : '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-mono text-secondary">{iface.name}</p>
                            {iface.description && (
                              <p className="text-[10px] text-muted truncate max-w-[160px]">{iface.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-semibold text-primary">
                            {iface.vid ?? <span className="text-muted">—</span>}
                          </td>
                          <td className="px-4 py-2.5 font-mono">
                            <span className="flex items-center gap-1 text-emerald-400">
                              <ArrowDown size={9} />{fmtBps(iface.inBps)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 font-mono">
                            <span className="flex items-center gap-1 text-[var(--accent)]">
                              <ArrowUp size={9} />{fmtBps(iface.outBps)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant={isUp ? 'online' : 'offline'} className="text-[9px]">{iface.status}</Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {/* Mobile */}
              <div className="md:hidden divide-y divide-[var(--border)]">
                {vlanIfaces.map(iface => {
                  const isUp = iface.status === 'UP'
                  return (
                    <div key={iface.id} className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusDot status={isUp ? 'online' : 'offline'} pulse={isUp} />
                          <span className="font-mono text-xs text-primary">{iface.name}</span>
                          {iface.vid && <Badge variant="neutral" className="text-[9px]">VID {iface.vid}</Badge>}
                        </div>
                        <Badge variant={isUp ? 'online' : 'offline'} className="text-[9px]">{iface.status}</Badge>
                      </div>
                      {iface.device && (
                        <Link to={`/devices/${iface.device.id}`}
                          className="text-[10px] text-muted hover:text-[var(--accent)] transition-colors block">
                          {iface.device.name}
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
