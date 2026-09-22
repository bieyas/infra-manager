import React from 'react'
import { AlertTriangle, ArrowUpRight, CheckCircle2, XCircle, Clock } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000)
  if (diff < 60)   return `${diff}d`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}j`
  return `${Math.floor(diff / 86400)}h`
}

export default function RecentAlerts({ alerts = [], loading, onViewAll }) {
  return (
    <Card>
      <CardHeader
        action={
          <Button variant="ghost" size="xs" icon={ArrowUpRight} onClick={onViewAll}>
            All alerts
          </Button>
        }
      >
        <AlertTriangle size={14} className="accent-text" />
        <span className="text-sm font-semibold text-primary">Recent Alerts</span>
      </CardHeader>
      <CardBody className="space-y-2">
        {loading && Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-12 rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
        ))}
        {!loading && alerts.length === 0 && (
          <p className="text-xs text-muted text-center py-4">Tidak ada alert aktif</p>
        )}
        {!loading && alerts.map(alert => {
          const sev = alert.severity?.toLowerCase()
          return (
            <div
              key={alert.id}
              className={`flex items-start gap-2.5 p-2 rounded-lg border transition-all ${
                alert.acked
                  ? 'border-[var(--border)] opacity-50'
                  : sev === 'critical'
                  ? 'border-rose-500/20 bg-rose-500/5'
                  : sev === 'warning'
                  ? 'border-amber-500/20 bg-amber-500/5'
                  : 'border-[var(--border)]'
              }`}
            >
              {alert.acked
                ? <CheckCircle2 size={13} className="text-muted shrink-0 mt-0.5" />
                : sev === 'critical'
                ? <XCircle       size={13} className="text-rose-400 shrink-0 mt-0.5" />
                : <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-xs text-primary font-medium leading-snug">{alert.message}</p>
                <p className="text-[10px] text-muted mt-0.5">{alert.device?.name ?? '—'}</p>
              </div>
              <div className="flex items-center gap-0.5 text-[10px] text-muted shrink-0">
                <Clock size={10} />
                {timeAgo(alert.createdAt)}
              </div>
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}
