import React from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Activity, ArrowUpRight } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import { TRAFFIC_SERIES } from '../../data/mockData'

function TooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card-var border border-[var(--border)] rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: {p.value} Mbps
        </p>
      ))}
    </div>
  )
}

export default function TrafficChart({ onViewAll }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader
        action={
          <Button variant="ghost" size="xs" icon={ArrowUpRight} onClick={onViewAll}>
            Details
          </Button>
        }
      >
        <Activity size={14} className="accent-text" />
        <span className="text-sm font-semibold text-primary">Traffic Overview — 24h</span>
      </CardHeader>
      <CardBody>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={TRAFFIC_SERIES} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#00cbca" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00cbca" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval={3} />
            <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
            <ReTooltip content={<TooltipContent />} />
            <Legend wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }} iconSize={8} />
            <Area type="monotone" dataKey="in"  name="Inbound"  stroke="#00cbca" fill="url(#gIn)"  strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="out" name="Outbound" stroke="#8b5cf6" fill="url(#gOut)" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  )
}
