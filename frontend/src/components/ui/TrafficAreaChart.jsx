import React, { useId } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, Legend,
} from 'recharts'

const SERIES = [
  { dataKey: 'in', name: 'Upload', color: '#00cbca', fillOpacity: 0.35 },
  { dataKey: 'out', name: 'Download', color: '#f59e0b', fillOpacity: 0.3 },
]

export function formatSpeed(mbps) {
  const val = Number(mbps) || 0
  if (val <= 0) return '0 bps'
  const bps = val * 1_000_000
  if (bps < 1000) return `${Math.round(bps)} bps`
  if (bps < 1_000_000) return `${(bps / 1000).toFixed(1)} Kbps`
  if (bps < 100_000_000) return `${(bps / 1_000_000).toFixed(2)} Mbps`
  return `${(bps / 1_000_000).toFixed(1)} Mbps`
}

function formatYAxisTick(value) {
  const val = Number(value) || 0
  if (val === 0) return '0'
  const bps = val * 1_000_000
  if (bps < 1_000_000) {
    return `${Math.round(bps / 1000)}k`
  }
  return `${val >= 10 ? val.toFixed(0) : val.toFixed(1)}M`
}

function TooltipContent({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 text-[10px] shadow-xl">
      <p className="text-muted mb-1 font-mono font-medium">{label}</p>
      {payload.map(item => (
        <p key={item.dataKey} style={{ color: item.color }} className="font-mono font-semibold">
          {item.name}: {formatSpeed(item.value)}
        </p>
      ))}
    </div>
  )
}

export default function TrafficAreaChart({ data, height = 185 }) {
  const chartId = useId().replace(/:/g, '')

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -6 }}>
        <defs>
          {SERIES.map(series => (
            <linearGradient key={series.dataKey} id={`${chartId}-${series.dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={series.color} stopOpacity={series.fillOpacity} />
              <stop offset="95%" stopColor={series.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          minTickGap={35}
          dy={4}
        />
        <YAxis
          width={40}
          tick={{ fontSize: 9, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatYAxisTick}
        />
        <ReTooltip content={<TooltipContent />} />
        <Legend
          verticalAlign="top"
          align="right"
          height={20}
          iconSize={8}
          wrapperStyle={{ fontSize: '10px', color: 'var(--text-muted)', paddingBottom: '4px' }}
        />
        {SERIES.map(series => (
          <Area
            key={series.dataKey}
            type="monotone"
            dataKey={series.dataKey}
            name={series.name}
            stroke={series.color}
            fill={`url(#${chartId}-${series.dataKey})`}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}
