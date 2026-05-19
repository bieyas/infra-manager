import React from 'react'
import clsx from 'clsx'

const variants = {
  online:   'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  offline:  'bg-red-500/10 text-red-400 border border-red-500/20',
  warning:  'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  info:     'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20',
  neutral:  'bg-slate-500/10 text-slate-400 border border-slate-500/20',
  critical: 'bg-rose-600/10 text-rose-400 border border-rose-600/20',
  accent:   'bg-[var(--accent-glow)] text-[var(--accent)] border border-[var(--accent)]/20',
}

export default function Badge({ variant = 'neutral', children, className }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide',
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  )
}
