import React, { useState } from 'react'
import {
  Loader2, AlertCircle, RefreshCw, ArrowDown, ArrowUp,
  Terminal, ChevronRight, Network, Route, Users, Cpu,
  MemoryStick, HardDrive, Info, Wifi, WifiOff, Clock,
  TrendingDown, Activity, Server,
} from 'lucide-react'
import Card, { CardBody, CardHeader } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import StatusDot from '../../components/ui/StatusDot'
import ProgressBar from '../../components/ui/ProgressBar'
import Button from '../../components/ui/Button'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(kbps) {
  if (!kbps) return '—'
  if (kbps >= 1_000_000) return `${(kbps / 1_000_000).toFixed(1)} Gbps`
  if (kbps >= 1_000)     return `${(kbps / 1_000).toFixed(0)} Mbps`
  return `${kbps} Kbps`
}

function fmtBytes(b) {
  if (!b) return '—'
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  if (b >= 1e3) return `${(b / 1e3).toFixed(1)} KB`
  return `${b} B`
}

function fmtUptime(s) {
  if (!s || typeof s === 'string') return s || '—'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

function EmptyState({ message }) {
  return (
    <div className="py-10 text-center text-muted text-xs flex flex-col items-center gap-2">
      <Info size={20} className="opacity-40" />
      {message}
    </div>
  )
}

function SnapshotMeta({ driverName, fetchedAt, loading, onRefetch }) {
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted">
      <span className="font-medium text-secondary">{driverName}</span>
      {fetchedAt && (
        <span>· {fetchedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      )}
      <button
        onClick={onRefetch}
        disabled={loading}
        className="ml-auto flex items-center gap-1 hover:text-primary transition-colors disabled:opacity-40"
      >
        <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Mengambil data…' : 'Refresh'}
      </button>
    </div>
  )
}

// ── LiveTab ──────────────────────────────────────────────────────────────────

export function LiveTab({ snapshot, driverName, capabilities, loading, error, fetchedAt, onRefetch }) {
  const [ifaceFilter, setIfaceFilter] = useState('all')

  if (loading && !snapshot) {
    return (
      <Card>
        <CardBody>
          <div className="py-10 flex flex-col items-center gap-3 text-muted">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-xs">Menghubungi device…</span>
          </div>
        </CardBody>
      </Card>
    )
  }

  if (error && !snapshot) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-start gap-3 p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Gagal terhubung ke device</p>
              <p className="text-rose-300/70 mt-0.5">{error}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRefetch} className="mt-3">
            Coba Lagi
          </Button>
        </CardBody>
      </Card>
    )
  }

  if (!snapshot) {
    return (
      <Card>
        <CardBody>
          <EmptyState message="Belum ada data live. Klik refresh untuk terhubung ke device." />
          <div className="flex justify-center mt-2">
            <Button variant="outline" size="sm" icon={RefreshCw} onClick={onRefetch}>
              Ambil Data Live
            </Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  const { resource, status, interfaces } = snapshot
  const res   = resource ?? {}
  const stat  = status   ?? {}
  const ifaces = Array.isArray(interfaces) ? interfaces : []

  const memUsed = res.totalMemory > 0 ? res.totalMemory - res.freeMemory : 0
  const memPct  = res.totalMemory > 0
    ? Math.round((memUsed / res.totalMemory) * 100)
    : (stat.memPct ?? 0)
  const cpuPct  = res.cpuLoad ?? stat.cpuPct ?? 0
  const hddUsed = res.totalHddSpace > 0 ? res.totalHddSpace - res.freeHddSpace : 0
  const hddPct  = res.totalHddSpace > 0 ? Math.round((hddUsed / res.totalHddSpace) * 100) : 0

  const ifaceUp       = ifaces.filter(i => i.running && !i.disabled).length
  const ifaceDisabled = ifaces.filter(i => i.disabled).length

  const filteredIfaces = ifaces.filter(i => {
    if (ifaceFilter === 'up')       return i.running && !i.disabled
    if (ifaceFilter === 'down')     return !i.running && !i.disabled
    if (ifaceFilter === 'disabled') return i.disabled
    return true
  })

  return (
    <div className="space-y-3">
      {/* Meta strip */}
      <div className="px-1">
        <SnapshotMeta driverName={driverName} fetchedAt={fetchedAt} loading={loading} onRefetch={onRefetch} />
      </div>

      {/* ── System Resource ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Server size={12} /> System
          </span>
        </CardHeader>
        <CardBody className="space-y-3 pt-1">
          {/* Board info strip */}
          {(res.boardName || res.version || res.uptime || res.architecture) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                ['Board',    res.boardName],
                ['RouterOS', res.version],
                ['Uptime',   res.uptime],
                ['Platform', res.platform ?? res.architecture],
              ].filter(([, v]) => v).map(([label, val]) => (
                <div key={label} className="rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5">
                  <p className="text-[9px] text-muted uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-[11px] font-mono font-medium text-primary truncate">{val}</p>
                </div>
              ))}
            </div>
          )}

          {/* Resource bars */}
          <div className="space-y-2.5">
            {/* CPU */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted">
                <span className="flex items-center gap-1"><Cpu size={9} /> CPU</span>
                <span className={cpuPct >= 80 ? 'text-rose-400 font-semibold' : cpuPct >= 60 ? 'text-amber-400' : ''}>{cpuPct}%</span>
              </div>
              <ProgressBar value={cpuPct} max={100}
                colorClass={cpuPct >= 80 ? 'bg-rose-500' : cpuPct >= 60 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
            </div>
            {/* Memory */}
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-muted">
                <span className="flex items-center gap-1"><MemoryStick size={9} /> Memory</span>
                <span className={memPct >= 80 ? 'text-rose-400 font-semibold' : memPct >= 60 ? 'text-amber-400' : ''}>
                  {res.totalMemory > 0
                    ? `${fmtBytes(memUsed)} / ${fmtBytes(res.totalMemory)} (${memPct}%)`
                    : `${memPct}%`}
                </span>
              </div>
              <ProgressBar value={memPct} max={100}
                colorClass={memPct >= 80 ? 'bg-rose-500' : memPct >= 60 ? 'bg-amber-400' : 'bg-emerald-500'} />
            </div>
            {/* Storage */}
            {res.totalHddSpace > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted">
                  <span className="flex items-center gap-1"><HardDrive size={9} /> Storage</span>
                  <span>{fmtBytes(hddUsed)} / {fmtBytes(res.totalHddSpace)} ({hddPct}%)</span>
                </div>
                <ProgressBar value={hddPct} max={100}
                  colorClass={hddPct >= 90 ? 'bg-rose-500' : hddPct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ── Interfaces ──────────────────────────────────────────────────── */}
      {capabilities?.interfaces && (
        <Card>
          <CardHeader>
            <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Network size={12} /> Interfaces
            </span>
            {/* Filter pills */}
            <div className="ml-auto flex gap-1 text-[9px]">
              {[
                ['all',      `Semua (${ifaces.length})`],
                ['up',       `Up (${ifaceUp})`],
                ['down',     `Down (${ifaces.length - ifaceUp - ifaceDisabled})`],
                ['disabled', `Off (${ifaceDisabled})`],
              ].map(([key, label]) => (
                <button key={key} onClick={() => setIfaceFilter(key)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${ifaceFilter === key
                    ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                    : 'text-muted hover:text-primary'}`}>
                  {label}
                </button>
              ))}
            </div>
          </CardHeader>

          {filteredIfaces.length === 0 ? (
            <CardBody><EmptyState message="Tidak ada interface yang cocok." /></CardBody>
          ) : (
            <div className="divide-y divide-[var(--border)]/40">
              {filteredIfaces.map((iface, i) => {
                const up       = iface.running && !iface.disabled
                const disabled = !!iface.disabled
                const hasTraffic = iface.rxBytes > 0 || iface.txBytes > 0
                return (
                  <div key={iface.name ?? i}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 hover:bg-[var(--accent-glow)] transition-colors">
                    {/* Status dot */}
                    <StatusDot status={disabled ? 'neutral' : up ? 'online' : 'offline'} pulse={up} />

                    {/* Name + meta */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-primary">{iface.name}</p>
                        {iface.comment && (
                          <span className="text-[10px] text-[var(--accent)] truncate max-w-[140px]">{iface.comment}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted flex-wrap">
                        {iface.type && <span className="font-mono">{iface.type}</span>}
                        {iface.macAddress && <span className="font-mono hidden sm:inline">{iface.macAddress}</span>}
                        {iface.mtu > 0 && <span>MTU {iface.mtu}</span>}
                        {iface.linkDowns > 0 && (
                          <span className="flex items-center gap-0.5 text-amber-400">
                            <TrendingDown size={9} />{iface.linkDowns} drops
                          </span>
                        )}
                        {iface.lastLinkUp && up && (
                          <span className="hidden md:inline text-muted/70">up since {iface.lastLinkUp}</span>
                        )}
                        {iface.lastLinkDown && !up && !disabled && (
                          <span className="flex items-center gap-0.5 text-rose-400/70">
                            <Clock size={9} />{iface.lastLinkDown}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Traffic + badge */}
                    <div className="text-right shrink-0 space-y-0.5">
                      {hasTraffic ? (
                        <div className="text-[10px] space-y-0.5">
                          <div className="flex items-center gap-1 justify-end">
                            <ArrowDown size={8} className="text-emerald-400" />
                            <span className="font-mono text-secondary">{fmtBytes(iface.rxBytes)}</span>
                          </div>
                          <div className="flex items-center gap-1 justify-end">
                            <ArrowUp size={8} className="text-[var(--accent)]" />
                            <span className="font-mono text-secondary">{fmtBytes(iface.txBytes)}</span>
                          </div>
                        </div>
                      ) : (
                        <Badge variant={disabled ? 'neutral' : up ? 'online' : 'offline'} className="text-[9px]">
                          {disabled ? 'disabled' : up ? 'up' : 'down'}
                        </Badge>
                      )}
                      {hasTraffic && (
                        <Badge variant={disabled ? 'neutral' : up ? 'online' : 'offline'} className="text-[9px]">
                          {disabled ? 'disabled' : up ? 'up' : 'down'}
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

// ── RoutesTab ─────────────────────────────────────────────────────────────────

export function RoutesTab({ snapshot, loading, error, onRefetch }) {
  const [showAll, setShowAll] = useState(false)
  const routes = snapshot?.routes ?? null

  if (loading && !snapshot) return <Card><CardBody><div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-muted" /></div></CardBody></Card>
  if (!routes) return <Card><CardBody><EmptyState message="Tidak ada data routes." /><div className="flex justify-center mt-2"><Button variant="outline" size="sm" icon={RefreshCw} onClick={onRefetch}>Ambil Data</Button></div></CardBody></Card>
  if (routes.length === 0) return <Card><CardBody><EmptyState message="Routing table kosong." /></CardBody></Card>

  // Prioritize: active routes first, then by dst
  const sorted   = [...routes].sort((a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0))
  const active   = sorted.filter(r => r.active)
  const inactive = sorted.filter(r => !r.active)
  const displayed = showAll ? sorted : active

  return (
    <Card>
      <CardHeader>
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Route size={12} /> Routing Table
        </span>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-muted">
          {inactive.length > 0 && (
            <button onClick={() => setShowAll(v => !v)}
              className="hover:text-primary transition-colors">
              {showAll ? `Tampilkan aktif (${active.length})` : `+${inactive.length} inactive`}
            </button>
          )}
          <span>{displayed.length} entries</span>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] text-muted uppercase tracking-wider">
              <th className="text-left px-3 py-2">Destination</th>
              <th className="text-left px-3 py-2">Gateway / Interface</th>
              <th className="text-center px-3 py-2 hidden sm:table-cell">Dist</th>
              <th className="text-center px-3 py-2">Flags</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((r, i) => (
              <tr key={i} className={`border-b border-[var(--border)]/40 last:border-0 transition-colors ${
                r.active ? 'hover:bg-[var(--accent-glow)]' : 'opacity-50 hover:opacity-70'
              }`}>
                <td className="px-3 py-2 font-mono font-medium text-primary whitespace-nowrap">{r.dst}</td>
                <td className="px-3 py-2">
                  <p className="font-mono text-secondary">{r.gateway ?? '—'}</p>
                  <p className="text-[10px] text-muted">
                    {r.interface ?? ''}
                    {r.comment && <span className="ml-1 text-[var(--accent)]">{r.comment}</span>}
                  </p>
                </td>
                <td className="px-3 py-2 text-center text-muted hidden sm:table-cell">{r.distance}</td>
                <td className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1 flex-wrap">
                    {r.active  && <Badge variant="online"  className="text-[9px]">A</Badge>}
                    {r.dynamic && <Badge variant="neutral" className="text-[9px]">D</Badge>}
                    {r.bgp     && <Badge variant="warning" className="text-[9px]">B</Badge>}
                    {r.ospf    && <Badge variant="neutral" className="text-[9px]">O</Badge>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── NeighborsTab ──────────────────────────────────────────────────────────────

export function NeighborsTab({ snapshot, loading, error, onRefetch }) {
  const neighbors = snapshot?.neighbors ?? null

  if (loading && !snapshot) return <Card><CardBody><div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-muted" /></div></CardBody></Card>
  if (!neighbors) return <Card><CardBody><EmptyState message="Tidak ada data neighbors." /><div className="flex justify-center mt-2"><Button variant="outline" size="sm" icon={RefreshCw} onClick={onRefetch}>Ambil Data</Button></div></CardBody></Card>
  if (neighbors.length === 0) return <Card><CardBody><EmptyState message="Tidak ada neighbor terdeteksi." /></CardBody></Card>

  return (
    <Card>
      <CardHeader>
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Users size={12} /> Neighbor Discovery
          <span className="ml-auto text-[10px] font-normal text-muted">{neighbors.length} neighbor</span>
        </span>
      </CardHeader>
      <div className="divide-y divide-[var(--border)]/40">
        {neighbors.map((n, i) => (
          <div key={i} className="px-4 py-2.5 hover:bg-[var(--accent-glow)] transition-colors">
            <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
              {/* Left: identity + IP */}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-primary truncate">{n.identity ?? n.ip ?? '?'}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap text-[10px] text-muted">
                  {n.ip        && <span className="font-mono">{n.ip}</span>}
                  {n.interface && <span>via <span className="font-mono text-secondary">{n.interface}</span></span>}
                  {n.mac       && <span className="font-mono hidden sm:inline">{n.mac}</span>}
                </div>
              </div>
              {/* Right: platform + uptime */}
              <div className="text-right shrink-0 space-y-0.5">
                {n.platform && (
                  <p className="text-[10px] font-medium text-secondary">{n.platform}</p>
                )}
                {n.board && (
                  <p className="text-[10px] text-muted">{n.board}</p>
                )}
                {n.uptime && (
                  <p className="text-[9px] text-muted flex items-center gap-0.5 justify-end">
                    <Clock size={8} />{n.uptime}
                  </p>
                )}
              </div>
            </div>
            {n.version && (
              <p className="text-[9px] text-muted mt-1">ROS {n.version}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── IpAddressTab ──────────────────────────────────────────────────────────────

export function IpAddressTab({ snapshot, loading, onRefetch }) {
  const ips = snapshot?.ipAddresses ?? null

  if (loading && !snapshot) return <Card><CardBody><div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-muted" /></div></CardBody></Card>
  if (!ips) return <Card><CardBody><EmptyState message="Tidak ada data IP Address." /><div className="flex justify-center mt-2"><Button variant="outline" size="sm" icon={RefreshCw} onClick={onRefetch}>Ambil Data</Button></div></CardBody></Card>
  if (ips.length === 0) return <Card><CardBody><EmptyState message="Tidak ada IP address terkonfigurasi." /></CardBody></Card>

  // Group by interface
  const byIface = ips.reduce((acc, ip) => {
    const k = ip.interface ?? 'unknown'
    ;(acc[k] = acc[k] ?? []).push(ip)
    return acc
  }, {})

  return (
    <Card>
      <CardHeader>
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Network size={12} /> IP Addresses
          <span className="ml-auto text-[10px] font-normal text-muted">{ips.length} addr · {Object.keys(byIface).length} iface</span>
        </span>
      </CardHeader>
      <div className="divide-y divide-[var(--border)]/40">
        {Object.entries(byIface).map(([iface, addrs]) => (
          <div key={iface} className="px-4 py-2.5 hover:bg-[var(--accent-glow)] transition-colors">
            <p className="text-[10px] font-semibold text-secondary mb-1.5 flex items-center gap-1">
              <Network size={9} />{iface}
            </p>
            <div className="space-y-1.5">
              {addrs.map((ip, j) => (
                <div key={j} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-xs font-mono font-medium ${
                      ip.disabled ? 'text-muted line-through' : 'text-primary'
                    }`}>{ip.address}</p>
                    {ip.network && (
                      <p className="text-[10px] font-mono text-muted">{ip.network}</p>
                    )}
                    {ip.comment && (
                      <p className="text-[10px] text-[var(--accent)]">{ip.comment}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {ip.disabled && <Badge variant="offline"  className="text-[9px]">disabled</Badge>}
                    {ip.dynamic  && <Badge variant="neutral"  className="text-[9px]">dhcp</Badge>}
                    {ip.invalid  && <Badge variant="warning"  className="text-[9px]">invalid</Badge>}
                    {!ip.disabled && !ip.dynamic && !ip.invalid && (
                      <Badge variant="online" className="text-[9px]">static</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── ExecPanel ─────────────────────────────────────────────────────────────────
// Lightweight terminal — ADMIN only

export function ExecPanel({ deviceId, driverName, capabilities, onExec, execResult, execLoading, execError }) {
  const [cmd, setCmd] = useState('')
  const [history, setHistory] = useState([])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!cmd.trim()) return
    const trimmed = cmd.trim()
    setCmd('')
    const result = await onExec(trimmed)
    setHistory(h => [...h, { cmd: trimmed, result, ts: new Date() }].slice(-50))
  }

  const formatResult = (r) => {
    if (!r) return 'null'
    if (typeof r === 'string') return r
    if (Array.isArray(r)) return r.map(item =>
      typeof item === 'object'
        ? Object.entries(item).map(([k, v]) => `  ${k}: ${v}`).join('\n')
        : String(item)
    ).join('\n---\n')
    return JSON.stringify(r, null, 2)
  }

  return (
    <Card>
      <CardHeader>
        <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <Terminal size={12} /> Exec Console
          <span className="ml-2 text-[10px] font-normal text-muted bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded">
            {driverName}
          </span>
        </span>
      </CardHeader>
      <CardBody className="space-y-3">
        {/* Hint */}
        {driverName?.includes('Mikrotik') && (
          <div className="flex flex-wrap gap-1.5">
            {[
              '/system/resource/print',
              '/interface/print',
              '/ip/address/print',
              '/ip/route/print',
              '/ip/neighbor/print',
            ].map(s => (
              <button key={s} onClick={() => setCmd(s)}
                className="text-[10px] font-mono px-2 py-0.5 rounded border border-[var(--border)] text-muted hover:text-primary hover:border-[var(--accent)]/50 transition-colors">
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] focus-within:border-[var(--accent)] transition-colors">
            <ChevronRight size={12} className="text-[var(--accent)] shrink-0" />
            <input
              type="text"
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              placeholder={driverName?.includes('Mikrotik') ? '/ip/address/print' : 'command here…'}
              className="flex-1 bg-transparent text-xs font-mono text-primary outline-none placeholder:text-muted"
            />
          </div>
          <Button type="submit" variant="primary" size="sm" disabled={execLoading || !cmd.trim()}>
            {execLoading ? <Loader2 size={13} className="animate-spin" /> : 'Run'}
          </Button>
        </form>

        {/* Output */}
        {(history.length > 0 || execError) && (
          <div className="rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] overflow-hidden">
            {execError && (
              <div className="px-3 py-2 text-[10px] font-mono text-rose-400 border-b border-[var(--border)]/50">
                Error: {execError}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto p-3 space-y-3">
              {[...history].reverse().map((h, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-[10px] font-mono text-[var(--accent)] flex items-center gap-1">
                    <ChevronRight size={9} />
                    {h.cmd}
                    <span className="ml-auto text-muted">{h.ts.toLocaleTimeString('id-ID')}</span>
                  </p>
                  <pre className="text-[10px] font-mono text-secondary whitespace-pre-wrap break-all leading-relaxed">
                    {h.result ? formatResult(h.result) : '(no output)'}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  )
}
