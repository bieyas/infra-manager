import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, ArrowDown, ArrowUp, AlertCircle,
  RefreshCw, Loader2, Network,
} from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import StatusDot from '../components/ui/StatusDot'
import ProgressBar from '../components/ui/ProgressBar'
import { useInterfaces } from '../features/interfaces/useInterfaces'

function fmtBps(bps) {
  if (!bps) return '—'
  const n = Number(bps)
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Gbps`
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)} Mbps`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} Kbps`
  return `${n} bps`
}

function utilPct(bps, speedMbps) {
  if (!bps || !speedMbps) return 0
  return Math.min(100, Math.round((Number(bps) / (speedMbps * 1e6)) * 100))
}

const STATUS_FILTER = ['all', 'UP', 'DOWN']

const PHYSICAL_TYPES = new Set(['ether', 'sfp', 'sfp-sfpplus', 'wlan', 'cap', 'lte', 'bridge'])
function isPhysical(iface) {
  if (!iface.ifType) return true  // unknown type → tampilkan (data lama sebelum ifType ada)
  return PHYSICAL_TYPES.has(iface.ifType)
}

export default function Interfaces() {
  const { ifaces, loading, error, reload } = useInterfaces()
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const physical = useMemo(() => ifaces.filter(isPhysical), [ifaces])

  const filtered = useMemo(() => physical.filter(i => {
    if (statusFilter !== 'all' && i.status !== statusFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (i.name        ?? '').toLowerCase().includes(q) ||
      (i.device?.name ?? '').toLowerCase().includes(q) ||
      (i.description  ?? '').toLowerCase().includes(q) ||
      (i.macAddress   ?? '').toLowerCase().includes(q) ||
      (i.ipAddress    ?? '').toLowerCase().includes(q)
    )
  }), [ifaces, search, statusFilter])

  const countUp   = physical.filter(i => i.status === 'UP').length
  const countDown = physical.filter(i => i.status === 'DOWN').length

  return (
    <div className="p-3 md:p-4 space-y-3 animate-fade-in">

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <Network size={14} className="accent-text" />
          <p className="text-2xl font-bold text-primary">{physical.length}</p>
          <p className="text-[10px] text-muted">Total Interface</p>
        </div>
        <div className="stat-card">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <p className="text-2xl font-bold text-emerald-400">{countUp}</p>
          <p className="text-[10px] text-muted">Up</p>
        </div>
        <div className="stat-card">
          <div className="w-2 h-2 rounded-full bg-rose-400" />
          <p className="text-2xl font-bold text-rose-400">{countDown}</p>
          <p className="text-[10px] text-muted">Down</p>
        </div>
      </div>

      <Card>
        <CardHeader
          action={
            <button onClick={reload} disabled={loading}
              className="text-muted hover:text-primary transition-colors disabled:opacity-40">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          }
        >
          <Network size={13} className="accent-text" />
          <span className="text-sm font-semibold text-primary">Interface List</span>
          <Badge variant="neutral" className="ml-1">{filtered.length}</Badge>
        </CardHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-2.5 py-1.5 flex-1 min-w-[180px] max-w-xs">
            <Search size={11} className="text-muted shrink-0" />
            <input
              type="text"
              placeholder="Nama, device, IP, MAC…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-xs text-primary placeholder-muted outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-muted hover:text-primary text-xs">✕</button>
            )}
          </div>
          {/* Status filter pills */}
          <div className="flex gap-1 text-[9px]">
            {STATUS_FILTER.map(s => (
              <button key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-1 rounded-md transition-colors font-medium ${
                  statusFilter === s
                    ? s === 'UP'   ? 'bg-emerald-500/20 text-emerald-400'
                    : s === 'DOWN' ? 'bg-rose-500/20 text-rose-400'
                    : 'bg-[var(--accent)]/20 text-[var(--accent)]'
                    : 'text-muted hover:text-primary'
                }`}>
                {s === 'all' ? `Semua (${physical.length})`
                 : s === 'UP' ? `Up (${countUp})`
                 : `Down (${countDown})`}
              </button>
            ))}
          </div>
        </div>

        <CardBody className="p-0">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted">
              <Loader2 size={22} className="animate-spin" />
              <span className="text-xs">Memuat data interface…</span>
            </div>
          ) : error ? (
            <div className="m-4 flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted text-xs">
              {physical.length === 0 ? 'Belum ada interface tersimpan.' : 'Tidak ada interface yang cocok.'}
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-[10px] text-muted uppercase tracking-wider bg-[var(--surface-2)]/50">
                      <th className="px-4 py-2 text-left font-medium w-8"></th>
                      <th className="px-4 py-2 text-left font-medium">Device</th>
                      <th className="px-4 py-2 text-left font-medium">Interface</th>
                      <th className="px-4 py-2 text-left font-medium">IP / MAC</th>
                      <th className="px-4 py-2 text-left font-medium">In (↓)</th>
                      <th className="px-4 py-2 text-left font-medium">Out (↑)</th>
                      <th className="px-4 py-2 text-left font-medium w-32">Utilisasi</th>
                      <th className="px-4 py-2 text-left font-medium">VLAN</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((iface, idx) => {
                      const isUp  = iface.status === 'UP'
                      const util  = utilPct(iface.inBps, iface.speed)
                      return (
                        <tr key={iface.id}
                          className={`border-b border-[var(--border)]/50 hover:bg-[var(--accent-glow)] transition-colors ${
                            idx % 2 === 1 ? 'bg-[var(--bg-secondary)]/20' : ''
                          }`}
                        >
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
                          <td className="px-4 py-2.5 font-mono text-[10px] text-muted space-y-0.5">
                            {iface.ipAddress  && <p className="text-secondary">{iface.ipAddress}</p>}
                            {iface.macAddress && <p>{iface.macAddress}</p>}
                            {!iface.ipAddress && !iface.macAddress && '—'}
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
                          <td className="px-4 py-2.5 w-32">
                            {iface.speed ? (
                              <div className="flex items-center gap-2">
                                <ProgressBar value={util} max={100} className="w-16 flex-1"
                                  colorClass={util >= 80 ? 'bg-rose-500' : util >= 60 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
                                <span className="text-[10px] text-muted shrink-0">{util}%</span>
                              </div>
                            ) : <span className="text-muted">—</span>}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-secondary">
                            {iface.vlan?.vid
                              ? <Badge variant="neutral" className="text-[9px]">VLAN {iface.vlan.vid}</Badge>
                              : <span className="text-muted">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge variant={isUp ? 'online' : 'offline'} className="text-[9px]">
                              {iface.status}
                            </Badge>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-[var(--border)]">
                {filtered.map(iface => {
                  const isUp = iface.status === 'UP'
                  const util = utilPct(iface.inBps, iface.speed)
                  return (
                    <div key={iface.id} className="p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StatusDot status={isUp ? 'online' : 'offline'} pulse={isUp} />
                          <span className="text-xs font-mono font-semibold text-primary">{iface.name}</span>
                        </div>
                        <Badge variant={isUp ? 'online' : 'offline'} className="text-[9px]">{iface.status}</Badge>
                      </div>
                      {iface.device && (
                        <Link to={`/devices/${iface.device.id}`}
                          className="text-[10px] text-muted hover:text-[var(--accent)] transition-colors block">
                          {iface.device.name}
                        </Link>
                      )}
                      {iface.description && (
                        <p className="text-[10px] text-muted">{iface.description}</p>
                      )}
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-muted flex items-center gap-1"><ArrowDown size={9} /> In</span>
                          <p className="font-mono text-emerald-400">{fmtBps(iface.inBps)}</p>
                        </div>
                        <div>
                          <span className="text-muted flex items-center gap-1"><ArrowUp size={9} /> Out</span>
                          <p className="font-mono text-[var(--accent)]">{fmtBps(iface.outBps)}</p>
                        </div>
                      </div>
                      {iface.speed > 0 && (
                        <div>
                          <div className="flex justify-between text-[9px] text-muted mb-1">
                            <span>Utilisasi</span><span>{util}%</span>
                          </div>
                          <ProgressBar value={util} max={100}
                            colorClass={util >= 80 ? 'bg-rose-500' : util >= 60 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
                        </div>
                      )}
                      {iface.vlan?.vid && (
                        <Badge variant="neutral" className="text-[9px]">VLAN {iface.vlan.vid}</Badge>
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
