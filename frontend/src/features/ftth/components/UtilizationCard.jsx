import React from 'react'
import clsx from 'clsx'

export default function UtilizationCard({ 
  value, 
  label = 'Utilisasi', 
  showSplitter = false,
  splitterRatio = null,
  className = '' 
}) {
  const getColor = (val) => {
    if (val > 80) return { text: 'text-rose-400', bg: 'from-rose-400 to-red-500' }
    if (val > 50) return { text: 'text-amber-400', bg: 'from-amber-400 to-orange-500' }
    return { text: 'text-emerald-400', bg: 'from-emerald-400 to-green-500' }
  }

  const colors = getColor(value)

  return (
    <div className={clsx(
      'p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]',
      className
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">{label}</span>
        <span className={clsx('text-xs font-bold', colors.text)}>
          {value}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-500 bg-gradient-to-r', colors.bg)}
          style={{ width: `${value}%` }}
        />
      </div>
      {showSplitter && splitterRatio && (
        <p className="text-[10px] text-muted mt-2">
          Splitter 1:{splitterRatio.replace('R1_', '')}
        </p>
      )}
    </div>
  )
}
