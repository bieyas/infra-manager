import React from 'react'
import { ChevronRight, Cpu, Pencil, Trash2, Loader2 } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import StatusDot from '../../components/ui/StatusDot'
import ProgressBar from '../../components/ui/ProgressBar'
import { TYPE_ICON, TYPE_LABEL, STATUS_COLOR, STATUS_LABEL } from './constants'
import { useDeviceResource } from './useDevices'

export default function DeviceCard({ device, onClick, onEdit, onDelete, deleting }) {
  const Icon    = TYPE_ICON[device.type]   ?? TYPE_ICON.OTHER
  const label   = TYPE_LABEL[device.type]  ?? device.type
  const s       = STATUS_COLOR[device.status] ?? STATUS_COLOR.offline
  const isAlive = device.status === 'online' || device.status === 'warning'
  const statusLabel = STATUS_LABEL[device.status] ?? device.status

  // Live resource data — fetched once on mount from driver
  const { data: res, loading: resLoading } = useDeviceResource(isAlive ? device.id : null)

  const cpu    = res?.cpu    ?? device.cpu    ?? device.cpuPct    ?? 0
  const memPct = res?.memPct ?? device.memory ?? device.memPct    ?? 0
  const uptime = res?.uptime ?? device.uptime ?? '—'
  const liveData = !!res

  return (
    <div
      onClick={onClick}
      className={`card p-3 flex flex-col gap-2 cursor-pointer transition-all duration-150 hover-glow ${
        !isAlive ? 'opacity-60' : ''
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${s.ring}`}>
            <Icon size={15} className={s.icon} />
          </div>
          <div>
            <p className="text-xs font-semibold text-primary leading-tight">{device.name}</p>
            <p className="text-[10px] text-muted">{label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <StatusDot status={s.dot} pulse={s.dot === 'online'} />
          <Badge variant={s.badge}>{statusLabel}</Badge>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
        <div>
          <span className="text-muted">IP</span>
          <p className="font-mono text-secondary">{device.ip}</p>
        </div>
        <div>
          <span className="text-muted">Location</span>
          <p className="text-secondary truncate">{device.location ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted">Model</span>
          <p className="text-secondary truncate">{device.model ?? device.vendor ?? '—'}</p>
        </div>
        <div>
          <span className="text-muted">Uptime</span>
          <p className="font-mono text-secondary">{uptime}</p>
        </div>
      </div>

      {/* CPU / Memory bar — show if alive (with loading state while fetching) */}
      {isAlive && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <Cpu size={9} />
              {resLoading && !res ? (
                <Loader2 size={9} className="animate-spin" />
              ) : (
                <>CPU {cpu}%</>
              )}
            </span>
            <span className="flex items-center gap-1">
              {resLoading && !res ? (
                <Loader2 size={9} className="animate-spin" />
              ) : (
                <>MEM {memPct}%</>
              )}
              {liveData && <span className="w-1 h-1 rounded-full bg-emerald-400" title="data live" />}
            </span>
          </div>
          <ProgressBar
            value={cpu} max={100}
            colorClass={cpu >= 80 ? 'bg-rose-500' : cpu >= 60 ? 'bg-amber-400' : 'bg-[var(--accent)]'}
          />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted">
          {device.activeInterfaces ?? '—'}/{device.interfaces ?? '—'} interfaces active
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                onClick={e => { e.stopPropagation(); onEdit() }}
                className="p-1 rounded hover:bg-[var(--accent-glow)] text-muted hover:text-[var(--accent)] transition-colors"
                title="Edit device"
              >
                <Pencil size={11} />
              </button>
            )}
            {onDelete && (
              <button
                onClick={e => { e.stopPropagation(); onDelete() }}
                disabled={deleting}
                className="p-1 rounded hover:bg-rose-500/10 text-muted hover:text-rose-400 transition-colors disabled:opacity-50"
                title="Hapus device"
              >
                {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
              </button>
            )}
          </div>
          <ChevronRight size={12} className="text-muted" />
        </div>
      </div>
    </div>
  )
}
