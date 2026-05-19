import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, ArrowDown, ArrowUp, AlertCircle, ExternalLink } from 'lucide-react'
import Card, { CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import StatusDot from '../../components/ui/StatusDot'
import ProgressBar from '../../components/ui/ProgressBar'
import NetworkTools from '../../components/ui/NetworkTools'
import { TYPE_ICON, TYPE_LABEL } from './constants'
import { useDeviceDetail } from './useDevices'
import { useDriverSnapshot } from './useDriverSnapshot'
import OltOnuTab from './OltOnuTab'

// "gpon-olt_1/1/1" or "1/1/1" → "PON-1"
function ponLabel(portOrId) {
  if (!portOrId) return portOrId
  const m = String(portOrId).match(/(\d+)\/(\d+)\/(\d+)/)
  return m ? `PON-${Number(m[3])}` : portOrId
}

const TABS_DEFAULT = ['Overview', 'Interfaces']
const TABS_OLT     = ['Overview', 'ONU List']

const FIELD_ROWS = (device) => [
  ['IP Address',  device.ip,                              true  ],
  ['MAC Address', device.mac   ?? device.macAddress ?? '—', true  ],
  ['Location',    device.location ?? '—',                 false ],
  ['Type',        TYPE_LABEL[device.type] ?? device.type, false ],
  ['Vendor',      device.vendor ?? '—',                   false ],
  ['Uptime',      device.uptime ?? '—',                   true  ],
]

function fmt(kbps) {
  if (!kbps || kbps === 0) return '—'
  if (kbps >= 1000000) return `${(kbps / 1000000).toFixed(1)} Gbps`
  if (kbps >= 1000)    return `${(kbps / 1000).toFixed(0)} Mbps`
  return `${kbps} Kbps`
}

function fmtBytes(b) {
  if (!b || b === 0) return '—'
  if (b >= 1e12) return `${(b/1e12).toFixed(1)}TB`
  if (b >= 1e9)  return `${(b/1e9).toFixed(1)}GB`
  if (b >= 1e6)  return `${(b/1e6).toFixed(1)}MB`
  if (b >= 1e3)  return `${(b/1e3).toFixed(1)}KB`
  return `${b}B`
}

function InterfaceRow({ iface, isLive }) {
  // Live driver data uses `running` field; DB data uses status/operStatus
  const isUp = isLive
    ? (iface.running === true || iface.running === 'true')
    : (iface.status === 'online' || iface.adminStatus === 'UP' || iface.operStatus === 'UP')
  const disabled = iface.disabled === true || iface.disabled === 'true'

  const rxVal = isLive ? fmtBytes(iface.rxBytes) : fmt(iface.inRate ?? iface.inKbps)
  const txVal = isLive ? fmtBytes(iface.txBytes) : fmt(iface.outRate ?? iface.outKbps)

  return (
    <div className="flex items-center gap-2 py-2 px-1 border-b border-[var(--border)]/50 last:border-0">
      <StatusDot status={disabled ? 'offline' : isUp ? 'online' : 'offline'} size="sm" pulse={isUp && !disabled} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-medium text-primary truncate">{iface.name}</p>
        <p className="text-[10px] text-muted font-mono">
          {iface.macAddress ?? iface.description ?? iface.type ?? '—'}
          {iface.comment ? <span className="ml-1.5 text-[var(--accent)]">{iface.comment}</span> : null}
          {iface.vlan ? ` · VLAN ${iface.vlan}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0 space-y-0.5">
        <div className="flex items-center gap-1 text-[10px]">
          <ArrowDown size={9} className={isUp ? 'text-emerald-400' : 'text-muted'} />
          <span className="font-mono text-secondary">{rxVal}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          <ArrowUp size={9} className={isUp ? 'text-[var(--accent)]' : 'text-muted'} />
          <span className="font-mono text-secondary">{txVal}</span>
        </div>
      </div>
      <Badge variant={disabled ? 'neutral' : isUp ? 'online' : 'offline'} className="shrink-0 text-[9px]">
        {disabled ? 'dis' : isUp ? 'up' : 'dn'}
      </Badge>
    </div>
  )
}

export default function DeviceDetail({ device, onClose }) {
  const navigate      = useNavigate()
  const [toolsOpen,    setToolsOpen]    = useState(false)
  const [toolsTarget,  setToolsTarget]  = useState('')

  const isOlt  = device?.type === 'OLT'
  const TABS   = isOlt ? TABS_OLT : TABS_DEFAULT
  const [tab, setTab] = useState(TABS[0])

  const { detail, loading: detailLoading } = useDeviceDetail(device?.id)
  const {
    snapshot, loading: snapLoading, fetch: fetchSnapshot,
  } = useDriverSnapshot(device?.id, { auto: true })

  if (!device) return null

  const Icon    = TYPE_ICON[device.type] ?? TYPE_ICON.OTHER
  const isAlive = device.status !== 'offline' && device.status !== 'inactive'
  const cpu     = device.cpu    ?? device.cpuPct ?? 0
  const mem     = device.memory ?? device.memPct ?? 0

  // OLT: PON ports from snapshot — getPonPorts returns { ports, globalOnline, globalTotal }
  const ponPorts    = Array.isArray(snapshot?.ponPorts) ? snapshot.ponPorts : null
  const globalOnline = snapshot?.globalOnline ?? null
  const globalTotal  = snapshot?.globalTotal  ?? null

  // Non-OLT: prefer live snapshot interfaces over DB
  const snapIfaces = !isOlt && Array.isArray(snapshot?.interfaces) ? snapshot.interfaces : null
  const ifaceList  = snapIfaces ?? detail?.interfaces ?? []
  const isLive     = !!snapIfaces
  const ifaceTotal  = isOlt
    ? (globalTotal  ?? ponPorts?.reduce((s, p) => s + p.totalOnu,  0) ?? device.ponCount ?? '—')
    : (ifaceList.length || device.interfaces || '—')
  const ifaceActive = isOlt
    ? (globalOnline ?? ponPorts?.reduce((s, p) => s + p.onlineOnu, 0) ?? '—')
    : (isLive
        ? ifaceList.filter(i => i.running === true || i.running === 'true').length
        : (detail?.interfaces?.filter(i => i.status === 'online' || i.operStatus === 'UP').length ?? device.activeInterfaces ?? '—'))

  const openTool = (target) => { setToolsTarget(target); setToolsOpen(true) }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <Card className="relative w-full md:max-w-lg md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl max-h-[88vh] flex flex-col animate-slide-in">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent-glow)] flex items-center justify-center">
              <Icon size={17} className="accent-text" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary">{device.name}</p>
              <p className="text-[10px] text-muted">{device.model ?? device.vendor ?? '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={device.status === 'online' ? 'online' : device.status === 'warning' ? 'warning' : 'offline'}>
              {device.status}
            </Badge>
            <Button
              variant="ghost" size="xs" icon={ExternalLink}
              onClick={() => { onClose(); navigate(`/devices/${device.id}`) }}
              title="Buka halaman penuh"
            />
            <Button variant="ghost" size="xs" onClick={onClose}>✕</Button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 px-4 pt-2 pb-1 border-b border-[var(--border)] shrink-0">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-muted hover:text-primary'
              }`}
            >
              {t}
              {(t === 'Interfaces' || t === 'ONU List') && (
                <span className="ml-1.5 text-[10px] opacity-70">
                  {ifaceActive}/{ifaceTotal}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto">
          <CardBody className="space-y-4 pt-3">

            {/* ════ OVERVIEW TAB ════ */}
            {tab === 'Overview' && (
              <>
                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  {FIELD_ROWS(device).map(([label, val, mono]) => (
                    <div key={label}>
                      <p className="text-[10px] text-muted">{label}</p>
                      <p className={`text-xs text-primary font-medium mt-0.5 ${mono ? 'font-mono' : ''}`}>{val}</p>
                    </div>
                  ))}
                </div>

                {/* Resource utilization */}
                {isAlive && (
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-primary border-t border-[var(--border)] pt-3">
                      Resource Utilization
                    </p>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-[10px] text-muted mb-1">
                          <span>CPU</span><span>{cpu}%</span>
                        </div>
                        <ProgressBar value={cpu} max={100} colorClass={cpu >= 80 ? 'bg-rose-500' : cpu >= 60 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
                      </div>
                      <div>
                        <div className="flex justify-between text-[10px] text-muted mb-1">
                          <span>Memory</span><span>{mem}%</span>
                        </div>
                        <ProgressBar value={mem} max={100} colorClass={mem >= 80 ? 'bg-rose-500' : mem >= 60 ? 'bg-amber-400' : 'bg-[var(--accent)]'} />
                      </div>
                    </div>
                  </div>
                )}

                {/* PON ports summary for OLT */}
                {isOlt && (
                  <div className="border-t border-[var(--border)] pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-primary">PON Ports</p>
                      {device.ponCapacity && (
                        <span className="text-[10px] text-muted">
                          {device.ponCount ?? '?'}× PON · {device.ponCapacity} ONU/PON
                        </span>
                      )}
                    </div>
                    {snapLoading && !ponPorts ? (
                      <div className="flex items-center gap-2 text-muted text-xs">
                        <Loader2 size={12} className="animate-spin" /> Mengambil data OLT…
                      </div>
                    ) : ponPorts ? ponPorts.map(p => {
                      const capacity = device.ponCapacity || p.totalOnu || 128
                      const usage = p.totalOnu ?? 0
                      const pct = capacity > 0 ? Math.round((usage / capacity) * 100) : 0
                      const colorClass = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-[var(--accent)]'
                      return (
                        <div key={p.id} className="mb-2">
                          <div className="flex justify-between text-[10px] text-muted mb-1">
                            <span className="font-mono">{ponLabel(p.port)}</span>
                            <span>
                              <span className="text-emerald-400">{p.onlineOnu}</span>/{usage} ONU
                              {device.ponCapacity && <span className="ml-1">({pct}%)</span>}
                            </span>
                          </div>
                          <ProgressBar value={usage} max={capacity} colorClass={colorClass} />
                        </div>
                      )
                    }) : (
                      <div className="flex items-center gap-2 text-[10px] text-muted">
                        <span>{device.ponCount ?? '—'} port</span>
                        {device.ponCapacity && <span>· {device.ponCapacity} ONU/PON</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Interface summary bar (non-OLT) */}
                {!isOlt && (
                  <div className="border-t border-[var(--border)] pt-3">
                    <p className="text-xs font-semibold text-primary mb-2">Interfaces</p>
                    <div className="flex items-center gap-2">
                      <ProgressBar
                        value={typeof ifaceActive === 'number' ? ifaceActive : 0}
                        max={typeof ifaceTotal  === 'number' ? ifaceTotal  : 1}
                        colorClass="bg-[var(--accent)]"
                        className="flex-1"
                      />
                      <span className="text-[10px] text-muted shrink-0">{ifaceActive}/{ifaceTotal} up</span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openTool(device.ip)}>
                    Ping
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openTool(device.ip)}>
                    Traceroute
                  </Button>
                  <Button variant="primary" size="sm" className="flex-1">
                    SSH
                  </Button>
                </div>

                {toolsOpen && (
                  <NetworkTools defaultTarget={toolsTarget} onClose={() => setToolsOpen(false)} />
                )}
              </>
            )}

            {/* ════ ONU LIST TAB (OLT only) ════ */}
            {tab === 'ONU List' && (
              <OltOnuTab
                deviceId={device.id}
                ponPorts={ponPorts}
              />
            )}

            {/* ════ INTERFACES TAB (non-OLT) ════ */}
            {tab === 'Interfaces' && (
              <div>
                {/* Meta strip */}
                <div className="flex items-center gap-2 mb-2 text-[10px] text-muted">
                  {isLive
                    ? <Badge variant="online" className="text-[9px]">live</Badge>
                    : <Badge variant="neutral" className="text-[9px]">DB</Badge>
                  }
                  <span>{ifaceActive}/{ifaceTotal} up</span>
                  <button
                    onClick={fetchSnapshot}
                    disabled={snapLoading}
                    className="ml-auto flex items-center gap-1 hover:text-primary transition-colors disabled:opacity-40"
                  >
                    <Loader2 size={9} className={snapLoading ? 'animate-spin' : 'hidden'} />
                    {!snapLoading && <span>↻ refresh</span>}
                  </button>
                </div>

                {(snapLoading || detailLoading) && ifaceList.length === 0 ? (
                  <div className="py-10 flex flex-col items-center gap-2 text-muted">
                    <Loader2 size={20} className="animate-spin" />
                    <span className="text-xs">Mengambil data interface…</span>
                  </div>
                ) : ifaceList.length === 0 ? (
                  <div className="py-10 text-center text-muted text-xs">
                    Tidak ada data interfaces tersedia.
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 px-1 pb-1 text-[10px] text-muted uppercase tracking-wider border-b border-[var(--border)]">
                      <span className="w-3" />
                      <span className="flex-1">Interface</span>
                      <span className="text-right w-20">{isLive ? 'RX / TX' : 'In / Out'}</span>
                      <span className="w-10 text-right">Status</span>
                    </div>
                    {ifaceList.map(iface => (
                      <InterfaceRow key={iface.id ?? iface.name} iface={iface} isLive={isLive} />
                    ))}
                  </div>
                )}
              </div>
            )}

          </CardBody>
        </div>
      </Card>
    </div>
  )
}
