import React from 'react'
import { XCircle, AlertTriangle, CheckCircle2 } from 'lucide-react'

export default function AlertSummary({ alerts }) {
  const critCount    = alerts.filter(a => !a.ack && (a.severity === 'critical' || a.severity === 'CRITICAL')).length
  const warningCount = alerts.filter(a => !a.ack && (a.severity === 'warning'  || a.severity === 'WARNING')).length
  const ackedCount   = alerts.filter(a => a.ack).length

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="stat-card">
        <XCircle size={15} className="text-rose-400" />
        <p className="text-xl font-bold text-primary">{critCount}</p>
        <p className="text-[10px] text-muted">Critical</p>
      </div>
      <div className="stat-card">
        <AlertTriangle size={15} className="text-amber-400" />
        <p className="text-xl font-bold text-primary">{warningCount}</p>
        <p className="text-[10px] text-muted">Warning</p>
      </div>
      <div className="stat-card">
        <CheckCircle2 size={15} className="text-emerald-400" />
        <p className="text-xl font-bold text-primary">{ackedCount}</p>
        <p className="text-[10px] text-muted">Acked</p>
      </div>
    </div>
  )
}
