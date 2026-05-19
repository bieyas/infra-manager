import React from 'react'
import clsx from 'clsx'

const colors = {
  online:   'bg-emerald-400',
  offline:  'bg-red-500',
  warning:  'bg-amber-400',
  unknown:  'bg-slate-500',
  critical: 'bg-rose-500',
}

const pulseColors = {
  online:  'bg-emerald-400',
  warning: 'bg-amber-400',
  critical:'bg-rose-500',
}

export default function StatusDot({ status = 'unknown', pulse = false, size = 'sm' }) {
  const sz = size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-2.5 h-2.5' : 'w-3 h-3'
  const shouldPulse = pulse && pulseColors[status]

  return (
    <span className="relative inline-flex items-center justify-center">
      {shouldPulse && (
        <span
          className={clsx(
            'absolute inline-flex rounded-full opacity-75 animate-ping',
            sz,
            pulseColors[status]
          )}
        />
      )}
      <span className={clsx('relative inline-flex rounded-full', sz, colors[status] ?? 'bg-slate-500')} />
    </span>
  )
}
