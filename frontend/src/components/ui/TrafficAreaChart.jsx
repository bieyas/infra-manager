import React, { useId } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Legend,
} from 'recharts'

const SERIES = [
  { dataKey: 'in', name: 'Upload', color: '#00cbca', fillOpacity: 0.3 },
  { dataKey: 'out', name: 'Download', color: '#f59e0b', fillOpacity: 0.25 },
]

const numberFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 2,
})

export function formatTrafficMbps(value) {
  return `${numberFormatter.format(Number(value) || 0)} Mbps`
}

function TooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card-var border border-[var(--border)] rounded-lg px-3 py-2 text-[10px] shadow-xl">
      <p className="text-muted mb-1">{label}</p>
      {payload.map(item => (
        <p key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {formatTrafficMbps(item.value)}
        </p>
      ))}
    </div>
  )
}

export default function TrafficAreaChart({ data, height = 180 }) {
  const chartId = useId().replace(/:/g, '')

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
        <defs>
          {SERIES.map(series => (
            <linearGradient key={series.dataKey} id={`${chartId}-${series.dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={series.color} stopOpacity={series.fillOpacity} />
              <stop offset="95%" stopColor={series.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis width={48} tick={{ fontSize: 9, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={formatTrafficMbps} />
        <ReTooltip content={<TooltipContent />} />
        <Legend
          verticalAlign="top"
          align="right"
          height={24}
          iconSize={8}
          wrapperStyle={{ fontSize: '10px', color: 'var(--text-muted)' }}
        />
        {SERIES.map(series => (
          <Area
            key={series.dataKey}
            type="monotone"
            dataKey={series.dataKey}
            name={series.name}
            stroke={series.color}
            fill={`url(#${chartId}-${series.dataKey})`}
            strokeWidth={1.5}
            dot={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
