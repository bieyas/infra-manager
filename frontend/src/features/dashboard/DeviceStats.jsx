import React from 'react'
import { Server, ArrowUpRight } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import ProgressBar from '../../components/ui/ProgressBar'
import Button from '../../components/ui/Button'

const TYPE_ROWS = [
  { type: 'SWITCH',       label: 'Switches',      color: 'bg-[var(--accent)]' },
  { type: 'ROUTER',       label: 'Routers',       color: 'bg-violet-400'      },
  { type: 'FIREWALL',     label: 'Firewalls',     color: 'bg-rose-400'        },
  { type: 'ACCESS_POINT', label: 'Access Points', color: 'bg-amber-400'       },
  { type: 'OLT',          label: 'OLT',           color: 'bg-emerald-400'     },
]

export function StatusDistribution({ deviceStats, loading, onViewAll }) {
  const active   = deviceStats?.ACTIVE   ?? 0
  const warning  = deviceStats?.WARNING  ?? 0
  const inactive = deviceStats?.INACTIVE ?? 0
  const total    = deviceStats?.total    ?? 0

  const pieData = [
    { name: 'Active',   value: active,   fill: '#34d399' },
    { name: 'Warning',  value: warning,  fill: '#fbbf24' },
    { name: 'Inactive', value: inactive, fill: '#f87171' },
  ]

  return (
    <Card>
      <CardHeader action={
        <Button variant="ghost" size="xs" icon={ArrowUpRight} onClick={onViewAll}>Devices</Button>
      }>
        <Server size={14} className="accent-text" />
        <span className="text-sm font-semibold text-primary">Status Distribution</span>
      </CardHeader>
      <CardBody className="flex items-center gap-4">
        {loading ? (
          <div className="w-[110px] h-[110px] rounded-full bg-[var(--bg-secondary)] animate-pulse shrink-0" />
        ) : (
          <ResponsiveContainer width={110} height={110}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%"
                innerRadius={32} outerRadius={50}
                paddingAngle={3} dataKey="value" strokeWidth={0}
              >
                {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        )}
        <div className="space-y-2 flex-1">
          {[
            { label: 'Active',   val: active,   color: 'bg-emerald-400' },
            { label: 'Warning',  val: warning,  color: 'bg-amber-400'   },
            { label: 'Inactive', val: inactive, color: 'bg-red-400'     },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${s.color}`} />
              <span className="text-xs text-secondary flex-1">{s.label}</span>
              <span className="text-xs font-mono font-semibold text-primary">{s.val}</span>
              <span className="text-[10px] text-muted">
                {total > 0 ? Math.round(s.val / total * 100) : 0}%
              </span>
            </div>
          ))}
          <p className="text-[10px] text-muted pt-1">{total} total devices</p>
        </div>
      </CardBody>
    </Card>
  )
}

export function DeviceTypes({ topDevices = [], loading }) {
  const typeCounts = {}
  topDevices.forEach(d => {
    typeCounts[d.type] = (typeCounts[d.type] || 0) + 1
  })
  const maxCount = Math.max(1, ...Object.values(typeCounts))

  return (
    <Card>
      <CardHeader>
        <Server size={14} className="accent-text" />
        <span className="text-sm font-semibold text-primary">Device Types</span>
      </CardHeader>
      <CardBody className="space-y-2.5">
        {loading && Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-5 rounded bg-[var(--bg-secondary)] animate-pulse" />
        ))}
        {!loading && TYPE_ROWS.map(t => {
          const count = typeCounts[t.type] ?? 0
          return (
            <div key={t.type} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${t.color}`} />
              <span className="text-xs text-secondary flex-1">{t.label}</span>
              <div className="w-20">
                <ProgressBar value={count} max={maxCount} colorClass={t.color} />
              </div>
              <span className="text-xs font-mono font-semibold text-primary w-4 text-right">
                {count}
              </span>
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}
