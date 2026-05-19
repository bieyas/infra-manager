import React, { useState, useEffect, useCallback, useRef, memo } from 'react'
import { Loader2, Signal, Wifi, WifiOff, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { useOltOnus, useOltOnuDetail } from './useDriverSnapshot'
import { api } from '../../lib/api'

// ── Friendly PON / ONU labels ────────────────────────────────────────────────
// "gpon-olt_1/1/1" → "PON-1", "1/1/1" → "PON-1", "0/1" → "PON-1", "0/1:2" → "PON-1"
function ponLabel(portOrId) {
  if (!portOrId) return portOrId
  // Strip ONU id suffix (e.g. "0/1:2" → "0/1")
  const stripped = String(portOrId).replace(/:\d+$/, '')
  // Extract the last segment number from any N-segment path
  const m = stripped.match(/(\d+)$/)
  return m ? `PON-${Number(m[1])}` : portOrId
}
// "1/1/1:5" → "ONU-5"
function onuLabel(index) {
  if (!index) return index
  const m = String(index).match(/:(\d+)$/)
  return m ? `ONU-${Number(m[1])}` : index
}

// ── Signal power color ─────────────────────────────────────────────────────
function powerColor(dbm) {
  if (dbm === null || dbm === undefined) return 'text-muted'
  if (dbm >= -20) return 'text-emerald-400'
  if (dbm >= -25) return 'text-amber-400'
  return 'text-rose-400'
}

function fmtDbm(v) {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(1)} dBm`
}

// ── ONU Detail Drawer ──────────────────────────────────────────────────────
function OnuDetailDrawer({ deviceId, onuIndex, onClose }) {
  const { data, loading, error, fetch: refetch } = useOltOnuDetail(deviceId, onuIndex)
  const detail = data?.detail
  const power  = data?.power
  const macs   = data?.macs ?? []

  return (
    <div className="mt-1 mb-2 mx-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <span className="font-mono font-semibold text-primary text-[11px]">{ponLabel(onuIndex)} · {onuLabel(onuIndex)}</span>
        <div className="flex items-center gap-1.5">
          <button onClick={refetch} disabled={loading} className="text-muted hover:text-primary transition-colors disabled:opacity-40">
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors text-sm leading-none">✕</button>
        </div>
      </div>

      {loading && !data ? (
        <div className="py-6 flex justify-center"><Loader2 size={16} className="animate-spin text-muted" /></div>
      ) : error ? (
        <div className="px-3 py-3 text-rose-400 text-[11px]">{error}</div>
      ) : detail ? (
        <div className="divide-y divide-[var(--border)]">
          {/* Info grid: 1-col mobile, 2-col sm+ */}
          <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {[
              ['Nama',       detail.name],
              ['SN',         detail.sn],
              ['MAC',        detail.mac],
              ['Tipe',       detail.type],
              ['Status',     detail.phaseState],
              ['Jarak',      detail.distance != null ? `${detail.distance} m` : null],
              ['Online',     detail.onlineDuration],
              ['Suhu',       detail.temperature != null ? `${detail.temperature}°C` : null],
              ['Voltage',    detail.voltage    != null ? `${detail.voltage} V`    : null],
              ['Dereg',      detail.lastDeregReason],
              ['Last Reg',   detail.lastSeen],
              ['Deskripsi',  detail.description],
            ].filter(([, v]) => v != null && v !== '').map(([label, val]) => (
              <div key={label}>
                <p className="text-[9px] text-muted uppercase tracking-wide">{label}</p>
                <p className="text-[11px] text-primary font-medium break-all">{val}</p>
              </div>
            ))}
          </div>

          {/* Optical power — 2 cards, stack on mobile */}
          {power && (
            <div className="px-3 py-2">
              <p className="text-[9px] text-muted uppercase tracking-wide mb-1.5">Optical Power</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded bg-[var(--surface)] px-2 py-1.5">
                  <p className="text-[9px] text-muted mb-0.5">OLT Rx ↑ upstream</p>
                  <p className={`text-sm font-bold font-mono ${powerColor(power.oltRxPower)}`}>
                    {fmtDbm(power.oltRxPower)}
                  </p>
                  <p className="text-[9px] text-muted mt-0.5">ONU Tx: {fmtDbm(power.onuTxPower)}</p>
                  {power.temperature != null && (
                    <p className="text-[9px] text-muted">Suhu: {power.temperature}°C &middot; {power.voltage}V</p>
                  )}
                </div>
                <div className="rounded bg-[var(--surface)] px-2 py-1.5">
                  <p className="text-[9px] text-muted mb-0.5">ONU Rx ↓ downstream</p>
                  <p className={`text-sm font-bold font-mono ${powerColor(power.onuRxPower)}`}>
                    {fmtDbm(power.onuRxPower)}
                  </p>
                  <p className="text-[9px] text-muted mt-0.5">OLT Tx: {fmtDbm(power.oltTxPower)}</p>
                  {power.distance != null && (
                    <p className="text-[9px] text-muted">Jarak: {power.distance} m</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MAC addresses */}
          {macs.length > 0 && (
            <div className="px-3 py-2">
              <p className="text-[9px] text-muted uppercase tracking-wide mb-1">MAC Address</p>
              <div className="flex flex-col gap-1">
                {macs.map((m, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="font-mono text-primary break-all">{m.mac}</span>
                    {m.vlan != null && <Badge variant="neutral" className="text-[9px]">VLAN {m.vlan}</Badge>}
                    {m.type && <span className="text-muted">{m.type}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

// ── Sequential queue for ONU detail fetches ─────────────────────────────────
// Ensures only 1 request at a time to avoid overwhelming the OLT Telnet session
const detailQueue = { queue: [], running: false, cache: {} }

function enqueueDetailFetch(deviceId, onuIndex) {
  const key = `${deviceId}:${onuIndex}`
  if (detailQueue.cache[key]) return Promise.resolve(detailQueue.cache[key])

  return new Promise((resolve) => {
    detailQueue.queue.push({ deviceId, onuIndex, key, resolve })
    processQueue()
  })
}

async function processQueue() {
  if (detailQueue.running || detailQueue.queue.length === 0) return
  detailQueue.running = true
  const { deviceId, onuIndex, key, resolve } = detailQueue.queue.shift()
  try {
    const data = await api.get(`/driver/${deviceId}/olt/onu/${encodeURIComponent(onuIndex)}`)
    detailQueue.cache[key] = data
    resolve(data)
  } catch {
    resolve(null)
  }
  detailQueue.running = false
  processQueue()
}

function useOnuInlineDetail(deviceId, onuIndex, enabled) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const fetched = useRef(false)

  useEffect(() => {
    if (!enabled || !deviceId || !onuIndex || fetched.current) return
    fetched.current = true
    setLoading(true)
    enqueueDetailFetch(deviceId, onuIndex)
      .then(d => { if (d) setData(d) })
      .finally(() => setLoading(false))
  }, [enabled, deviceId, onuIndex])

  return { data, loading }
}

// ── ONU Row (4-column layout) ───────────────────────────────────────────────
function OnuRow({ onu, deviceId, expanded, onToggle, fetchDetail }) {
  const { data, loading: detailLoading } = useOnuInlineDetail(deviceId, onu.index, fetchDetail)
  const power  = data?.power
  const detail = data?.detail
  const macs   = data?.macs ?? []
  const vlan   = macs[0]?.vlan ?? null

  return (
    <>
      {/* Mobile: 3-col  |  Desktop: 5-col */}
      <div
        className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 sm:gap-x-3 items-center py-1.5 px-2 border-b border-[var(--border)]/40 last:border-0 cursor-pointer hover:bg-[var(--surface-2)]/50 rounded transition-colors"
        onClick={onToggle}
      >
        {/* Col 1: Index / Name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-muted shrink-0 w-3">
            {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-mono font-medium text-primary truncate">
              {onuLabel(onu.index)}
            </p>
            <p className="text-[10px] text-muted truncate">
              {onu.name ?? onu.mac ?? '—'}
            </p>
          </div>
        </div>

        {/* Col 2 desktop: ONU Tx / VLAN — hidden on mobile */}
        <div className="hidden sm:block text-right min-w-[70px]">
          <p className={`text-[11px] font-mono font-medium ${power ? powerColor(power.onuTxPower) : 'text-muted'}`}>
            {power ? fmtDbm(power.onuTxPower) : detailLoading ? '···' : '—'}
          </p>
          <p className="text-[10px] text-muted">
            {vlan != null ? `VLAN ${vlan}` : detailLoading ? '···' : '—'}
          </p>
        </div>

        {/* Col 3 desktop / Col 2 mobile: Rx + Status (merged on mobile) */}
        <div className="text-right">
          {/* Rx power */}
          <p className={`text-[11px] font-mono font-medium ${power ? powerColor(power.onuRxPower) : 'text-muted'}`}>
            {power ? fmtDbm(power.onuRxPower) : detailLoading ? '···' : '—'}
          </p>
          {/* Jarak — desktop only */}
          <p className="hidden sm:block text-[10px] text-muted">
            {detail?.distance != null ? `${detail.distance}m` : detailLoading ? '···' : '—'}
          </p>
          {/* Badge status — mobile only, inline di sini */}
          <span className="sm:hidden">
            <Badge
              variant={onu.online ? 'online' : 'offline'}
              className="text-[9px] rounded-full"
            >
              {onu.online ? 'on' : 'off'}
            </Badge>
          </span>
        </div>

        {/* Col 4 desktop: Status / Uptime — hidden on mobile */}
        <div className="hidden sm:flex flex-col items-end gap-0.5 min-w-[65px]">
          <Badge
            variant={onu.online ? 'online' : 'offline'}
            className="shrink-0 text-[9px] rounded-full"
          >
            {['working','online'].includes(onu.phaseState?.toLowerCase()) ? 'online' : onu.phaseState?.toLowerCase() ?? 'offline'}
          </Badge>
          <p className="text-[9px] text-muted truncate max-w-[80px]">
            {detail?.onlineDuration ?? (detailLoading ? '···' : '—')}
          </p>
        </div>

        {/* Col 5 desktop / Col 3 mobile: Dereg Reason */}
        <div className="text-right min-w-[60px] sm:min-w-[72px]">
          <p className={`text-[10px] font-medium truncate max-w-[80px] ${onu.lastDeregReason ? 'text-amber-400' : 'text-muted'}`}>
            {onu.lastDeregReason ?? '—'}
          </p>
          <p className="text-[9px] text-muted">dereg</p>
        </div>
      </div>

      {expanded && (
        <OnuDetailDrawer
          deviceId={deviceId}
          onuIndex={onu.index}
          onClose={onToggle}
        />
      )}
    </>
  )
}

// ── Main ONU Tab ───────────────────────────────────────────────────────────
function OltOnuTab({ deviceId, ponPorts }) {
  const [selectedPort, setSelectedPort] = useState(ponPorts?.[0]?.port ?? '1/1/1')
  const [expandedOnu,  setExpandedOnu]  = useState(null)
  const [filter,       setFilter]       = useState('all')
  const [search,       setSearch]       = useState('')

  // Sync default port once ponPorts becomes available from snapshot
  useEffect(() => {
    if (ponPorts?.length > 0) setSelectedPort(p => p === '1/1/1' ? ponPorts[0].port : p)
  }, [ponPorts])

  const { onus, loading, error, fetchedAt, fetch: loadOnus } = useOltOnus(deviceId, selectedPort)

  const filteredOnus = (onus ?? []).filter(o => {
    if (filter === 'online'  && !o.online) return false
    if (filter === 'offline' &&  o.online) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        o.index?.toLowerCase().includes(q) ||
        o.name?.toLowerCase().includes(q)  ||
        o.mac?.toLowerCase().includes(q)
      )
    }
    return true
  })

  const onlineCount  = (onus ?? []).filter(o => o.online).length
  const offlineCount = (onus ?? []).filter(o => !o.online).length

  const toggleOnu = (index) => setExpandedOnu(prev => prev === index ? null : index)

  return (
    <div className="space-y-2">
      {/* PON Port selector */}
      {ponPorts && ponPorts.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {ponPorts.map(p => (
            <button
              key={p.port}
              onClick={() => { setSelectedPort(p.port); setExpandedOnu(null); setSearch('') }}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-mono font-medium transition-all ${
                selectedPort === p.port
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--surface-2)] text-muted hover:text-primary'
              }`}
            >
              {ponLabel(p.port)}
              {p.totalOnu > 0 && (
                <span className={`text-[9px] rounded-full px-1 ${
                  selectedPort === p.port ? 'bg-white/20' : 'bg-[var(--border)]'
                }`}>
                  {p.onlineOnu}/{p.totalOnu}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Filter + search + refresh */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Filter pills */}
        <div className="flex gap-1 text-[10px]">
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-0.5 rounded transition-colors ${filter === 'all' ? 'bg-[var(--accent)]/20 text-[var(--accent)]' : 'text-muted hover:text-primary'}`}
          >
            Semua {onus ? `(${onus.length})` : ''}
          </button>
          <button
            onClick={() => setFilter('online')}
            className={`px-2 py-0.5 rounded transition-colors ${filter === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'text-muted hover:text-primary'}`}
          >
            On {onus ? `(${onlineCount})` : ''}
          </button>
          <button
            onClick={() => setFilter('offline')}
            className={`px-2 py-0.5 rounded transition-colors ${filter === 'offline' ? 'bg-rose-500/20 text-rose-400' : 'text-muted hover:text-primary'}`}
          >
            Off {onus ? `(${offlineCount})` : ''}
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari nama / MAC…"
          className="flex-1 min-w-[100px] max-w-[180px] text-[10px] px-2 py-0.5 rounded border border-[var(--border)] bg-[var(--surface)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
        />

        <button
          onClick={loadOnus}
          disabled={loading}
          className="ml-auto flex items-center gap-1 text-[10px] text-muted hover:text-primary transition-colors disabled:opacity-40"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          {!loading && <span className="hidden sm:inline">Refresh</span>}
        </button>
      </div>

      {/* ONU list */}
      {loading && !onus ? (
        <div className="py-10 flex flex-col items-center gap-2 text-muted">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-xs">Mengambil data ONU dari OLT…</span>
          <span className="text-[10px] opacity-60">Mungkin butuh ~30 detik untuk 80+ ONU</span>
        </div>
      ) : error ? (
        <div className="py-6 text-center text-rose-400 text-xs">{error}</div>
      ) : !onus ? (
        <div className="py-10 text-center">
          <button
            onClick={loadOnus}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Load ONU List
          </button>
          <p className="text-[10px] text-muted mt-2">Data diambil langsung dari OLT</p>
        </div>
      ) : filteredOnus.length === 0 ? (
        <div className="py-6 text-center text-muted text-xs">Tidak ada ONU {filter !== 'all' ? filter : ''}</div>
      ) : (
        <div className="border border-[var(--border)] rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 sm:gap-x-3 items-center px-3 py-1.5 bg-[var(--surface-2)] border-b border-[var(--border)] text-[9px] text-muted uppercase tracking-wider">
            <span>Index / Nama</span>
            <span className="hidden sm:block text-right min-w-[70px]">Tx / VLAN</span>
            <span className="text-right">Rx</span>
            <span className="hidden sm:block text-right min-w-[65px]">Status</span>
            <span className="text-right min-w-[60px] sm:min-w-[72px]">Dereg</span>
          </div>
          <div className="divide-y divide-[var(--border)]/30">
            {filteredOnus.map(onu => (
              <OnuRow
                key={onu.index}
                onu={onu}
                deviceId={deviceId}
                expanded={expandedOnu === onu.index}
                onToggle={() => toggleOnu(onu.index)}
                fetchDetail={true}
              />
            ))}
          </div>
        </div>
      )}

      {fetchedAt && (
        <p className="text-[9px] text-muted text-right">
          Data: {fetchedAt.toLocaleTimeString('id-ID')}
        </p>
      )}
    </div>
  )
}

export default memo(OltOnuTab)
