import React from 'react'
import clsx from 'clsx'

export default function ProgressBar({ value = 0, max = 100, className, colorClass }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  const auto = pct >= 90
    ? 'bg-rose-500'
    : pct >= 70
    ? 'bg-amber-400'
    : 'bg-[var(--accent)]'

  return (
    <div className={clsx('w-full h-1.5 rounded-full bg-[var(--border)]', className)}>
      <div
        className={clsx('h-full rounded-full transition-all duration-500', colorClass ?? auto)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
