import React from 'react'
import { Clock, CheckCircle2, Bell } from 'lucide-react'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import clsx from 'clsx'
import { SEV_CONFIG } from './constants'

export default function AlertRow({ alert, onAck, onUnack }) {
  const cfg  = SEV_CONFIG[alert.severity] ?? SEV_CONFIG.info
  const Icon = cfg.icon

  return (
    <div
      className={clsx(
        'flex items-start gap-3 p-3 rounded-lg border transition-all',
        alert.ack
          ? 'opacity-50 bg-transparent border-[var(--border)]'
          : `${cfg.bg} ${cfg.border}`
      )}
    >
      <Icon size={14} className={clsx(cfg.color, 'shrink-0 mt-0.5')} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={cfg.badge}>{alert.severity}</Badge>
          <span className="text-xs font-semibold text-primary">
            {alert.device ?? alert.deviceId ?? '—'}
          </span>
        </div>
        <p className="text-xs text-secondary mt-1 leading-snug">{alert.message}</p>
        <div className="flex items-center gap-1 mt-1 text-[10px] text-muted">
          <Clock size={10} />
          {alert.time ?? (alert.createdAt ? new Date(alert.createdAt).toLocaleString('id-ID') : '—')}
        </div>
      </div>

      <div className="shrink-0">
        {!alert.ack ? (
          <Button variant="ghost" size="xs" icon={CheckCircle2} onClick={() => onAck?.(alert.id)} />
        ) : (
          <Button variant="ghost" size="xs" icon={Bell} onClick={() => onUnack?.(alert.id)} />
        )}
      </div>
    </div>
  )
}
