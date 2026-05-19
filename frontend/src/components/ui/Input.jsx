import React from 'react'
import clsx from 'clsx'

export default function Input({ icon: Icon, className, ...props }) {
  return (
    <div className="relative">
      {Icon && (
        <span className="absolute inset-y-0 left-2.5 flex items-center pointer-events-none">
          <Icon size={14} className="text-muted" />
        </span>
      )}
      <input
        className={clsx(
          'w-full bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-primary placeholder:text-muted',
          'focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all',
          'py-2',
          Icon ? 'pl-8 pr-3' : 'px-3',
          className
        )}
        {...props}
      />
    </div>
  )
}
