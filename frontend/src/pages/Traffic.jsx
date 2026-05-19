import React, { useState } from 'react'
import { Activity, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Legend,
} from 'recharts'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import { TRAFFIC_SERIES } from '../data/mockData'

const RANGES = ['1H', '6H', '24H', '7D']

function TooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card-var border border-[var(--border)] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1 font-mono">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: {p.value} Mbps
        </p>
      ))}
    </div>
  )
}

const TOP_TALKERS = [
  { ip: '10.1.4.22', host: 'ws-finance-01',  in: 412, out: 180 },
  { ip: '10.1.4.55', host: 'srv-backup-01',  in: 340, out: 22  },
  { ip: '10.2.0.14', host: 'mobile-device',  in: 88,  out: 110 },
  { ip: '10.0.3.5',  host: 'srv-video-01',   in: 625, out: 420 },
  { ip: '10.1.2.80', host: 'ws-dev-05',      in: 65,  out: 85  },
]

const PROTOCOLS = [
  { name: 'HTTPS', pct: 58, color: '#00cbca' },
  { name: 'DNS',   pct: 12, color: '#8b5cf6' },
  { name: 'SSH',   pct: 8,  color: '#06b6d4' },
  { name: 'SNMP',  pct: 5,  color: '#f59e0b' },
  { name: 'Other', pct: 17, color: '#4b5563' },
]

export default function Traffic() {
  const [range, setRange] = useState('24H')

  return (
    <div className="p-3 md:p-4 space-y-4 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Inbound',    value: '712 Mbps',  icon: ArrowDownToLine,  color: 'text-cyan-400',   bg: 'bg-cyan-500/10' },
          { label: 'Outbound',   value: '488 Mbps',  icon: ArrowUpFromLine,  color: 'text-violet-400', bg: 'bg-violet-500/10' },
          { label: 'Peak In',    value: '1.2 Gbps',  icon: Activity,         color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
          { label: 'Active Flows',value: '4,821',    icon: Activity,         color: 'text-amber-400',  bg: 'bg-amber-500/10' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`w-7 h-7 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon size={14} className={s.color} />
            </div>
            <p className="text-xl font-bold text-primary mt-2">{s.value}</p>
            <p className="text-[10px] text-muted">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Area chart */}
      <Card>
        <CardHeader
          action={
            <div className="flex gap-1">
              {RANGES.map(r => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded transition-all ${
                    range === r
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-muted hover:text-secondary'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          }
        >
          <Activity size={14} className="accent-text" />
          <span className="text-sm font-semibold text-primary">Bandwidth ({range})</span>
        </CardHeader>
        <CardBody>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={TRAFFIC_SERIES} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="gIn2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#00cbca" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#00cbca" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOut2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={3} />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} unit=" Mb" />
              <ReTooltip content={<TooltipContent />} />
              <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} iconSize={8} />
              <Area type="monotone" dataKey="in"  name="Inbound"  stroke="#00cbca" fill="url(#gIn2)"  strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="out" name="Outbound" stroke="#8b5cf6" fill="url(#gOut2)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Top talkers */}
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-primary">Top Talkers</span>
            <Badge variant="neutral">Last 1h</Badge>
          </CardHeader>
          <CardBody className="space-y-2">
            {TOP_TALKERS.map(t => (
              <div key={t.ip} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-primary truncate">{t.host}</p>
                  <p className="text-[10px] font-mono text-muted">{t.ip}</p>
                </div>
                <div className="text-right text-[10px] font-mono shrink-0">
                  <p className="text-cyan-400">↓ {t.in} Mbps</p>
                  <p className="text-violet-400">↑ {t.out} Mbps</p>
                </div>
                <div className="w-16 space-y-0.5">
                  <div className="h-1 rounded-full bg-cyan-500/20">
                    <div className="h-full rounded-full bg-cyan-400" style={{ width: `${Math.min(100, t.in / 7)}%` }} />
                  </div>
                  <div className="h-1 rounded-full bg-violet-500/20">
                    <div className="h-full rounded-full bg-violet-400" style={{ width: `${Math.min(100, t.out / 7)}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>

        {/* Protocol distribution */}
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-primary">Protocol Distribution</span>
          </CardHeader>
          <CardBody className="space-y-2.5">
            {PROTOCOLS.map(p => (
              <div key={p.name} className="space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="font-medium text-primary">{p.name}</span>
                  <span className="font-mono text-muted">{p.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--border)]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${p.pct}%`, backgroundColor: p.color }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
