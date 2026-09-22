import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

export default function StatCard({ label, value, total, icon: Icon, trend, trendUp, color, bg }) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon size={15} className={color} />
        </div>
        <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${trendUp ? 'text-emerald-400' : 'text-rose-400'}`}>
          {trendUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {trend}
        </span>
      </div>
      <p className="text-2xl font-bold text-primary mt-2 leading-none">{value}
      {total !== null && total !== undefined && (
        <span className="text-[10px] text-muted"> of {total}</span>
      )}
      </p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  )
}
