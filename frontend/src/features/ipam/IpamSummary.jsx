import React from 'react'
import { Network, CheckCircle2, XCircle } from 'lucide-react'

export default function IpamSummary({ subnets }) {
  const totalIPs = subnets.reduce((s, n) => s + n.total, 0)
  const usedIPs  = subnets.reduce((s, n) => s + n.used,  0)
  const freeIPs  = totalIPs - usedIPs

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="stat-card">
        <Network size={14} className="accent-text" />
        <p className="text-2xl font-bold text-primary">{subnets.length}</p>
        <p className="text-[10px] text-muted">Subnets</p>
      </div>
      <div className="stat-card">
        <CheckCircle2 size={14} className="text-cyan-400" />
        <p className="text-2xl font-bold text-primary">{usedIPs.toLocaleString()}</p>
        <p className="text-[10px] text-muted">IPs Used</p>
      </div>
      <div className="stat-card">
        <XCircle size={14} className="text-emerald-400" />
        <p className="text-2xl font-bold text-primary">{freeIPs.toLocaleString()}</p>
        <p className="text-[10px] text-muted">IPs Free</p>
      </div>
    </div>
  )
}
