import React, { useState } from 'react'
import { Bell, BellOff, CheckCircle2 } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import { useAlerts } from '../../context/AlertsContext'
import clsx from 'clsx'
import AlertRow from './AlertRow'
import AlertSummary from './AlertSummary'
import { ALERT_FILTERS } from './constants'

export default function AlertsPage() {
  const { alerts, ack, unack, ackAll, unackedCount } = useAlerts()
  const [filter, setFilter] = useState('All')

  const filtered = alerts.filter(a => {
    if (filter === 'Acknowledged') return a.ack
    if (filter === 'All') return true
    return a.severity.toLowerCase() === filter.toLowerCase() && !a.ack
  })

  return (
    <div className="p-3 md:p-4 space-y-3 animate-fade-in">
      <AlertSummary alerts={alerts} />

      <Card>
        <CardHeader
          action={
            unackedCount > 0
              ? <Button variant="ghost" size="xs" icon={BellOff} onClick={ackAll}>Ack All</Button>
              : null
          }
        >
          <Bell size={14} className="accent-text" />
          <span className="text-sm font-semibold text-primary">Alert Feed</span>
          {unackedCount > 0 && <Badge variant="critical">{unackedCount} active</Badge>}
        </CardHeader>

        {/* Filter tabs */}
        <div className="px-4 pb-2 flex flex-wrap gap-1.5">
          {ALERT_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all',
                filter === f
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-card)] border border-[var(--border)] text-secondary hover:text-primary'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <CardBody className="space-y-2 pt-1">
          {filtered.length === 0 && (
            <div className="py-10 text-center">
              <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-muted">Tidak ada alert di kategori ini.</p>
            </div>
          )}
          {filtered.map(alert => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onAck={ack}
              onUnack={unack}
            />
          ))}
        </CardBody>
      </Card>
    </div>
  )
}
