import React from 'react'
import clsx from 'clsx'

const variants = {
  primary:  'bg-[var(--accent)] hover:brightness-110 text-slate-950 font-semibold shadow-sm shadow-[var(--accent)]/30',
  ghost:    'bg-transparent hover:bg-[var(--accent-glow)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]',
  outline:  'border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] bg-transparent text-[var(--text-secondary)]',
  danger:   'bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-600/20',
  success:  'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30',
}

const sizes = {
  xs: 'px-2 py-1 text-[11px] gap-1',
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
}

export default function Button({
  variant = 'primary',
  size = 'sm',
  icon: Icon,
  iconRight: IconRight,
  children,
  className,
  loading,
  ...props
}) {
  return (
    <button
      className={clsx(
        'inline-flex items-center justify-center rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant] || variants.primary,
        sizes[size] || sizes.sm,
        className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : Icon ? (
        <Icon className="shrink-0" size={size === 'xs' ? 12 : size === 'sm' ? 13 : size === 'lg' ? 18 : 15} />
      ) : null}
      {children && <span>{children}</span>}
      {IconRight && !loading && (
        <IconRight className="shrink-0" size={size === 'xs' ? 12 : size === 'sm' ? 13 : 15} />
      )}
    </button>
  )
}
