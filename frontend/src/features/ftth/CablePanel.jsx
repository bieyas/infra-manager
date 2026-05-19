import React from 'react'
import { Cable, Eye, EyeOff } from 'lucide-react'
import clsx from 'clsx'
import { CABLE_TYPES } from './mapUtils'

const DISPLAY_MODES = [
  { key: 'simple', label: 'Sederhana', desc: 'Garis polos' },
  { key: 'styled', label: 'Bertingkat', desc: 'Garis dengan pola' },
  { key: 'curved', label: 'Melingkar', desc: 'Lengkung bezier' },
  { key: 'polygon', label: 'Poligon', desc: 'Area lebar' },
]

export default function CablePanel({ options, onChange, onToggleType }) {
  return (
    <div className="p-3 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-[var(--accent)]">
        <Cable size={16} />
        <span className="text-xs font-semibold">Pengaturan Kabel</span>
      </div>

      {/* Display Mode */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted uppercase tracking-wider">Mode Tampilan</p>
        <div className="grid grid-cols-2 gap-1.5">
          {DISPLAY_MODES.map(({ key, label, desc }) => (
            <button
              key={key}
              onClick={() => onChange({ ...options, mode: key })}
              className={clsx(
                'px-2 py-1.5 rounded-lg text-left transition-all border',
                options.mode === key
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-white text-secondary border-[var(--border)] hover:border-[var(--accent)]/50'
              )}
            >
              <p className="text-xs font-medium">{label}</p>
              <p className={clsx('text-[9px]', options.mode === key ? 'text-white/80' : 'text-muted')}>
                {desc}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Cable Types */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-muted uppercase tracking-wider">Tipe Kabel</p>
        <div className="space-y-1">
          {Object.entries(CABLE_TYPES).map(([type, cfg]) => {
            const isVisible = options.visibleTypes[type] !== false
            return (
              <button
                key={type}
                onClick={() => onToggleType?.(type)}
                className={clsx(
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all text-left',
                  isVisible
                    ? 'bg-white border border-[var(--border)] hover:border-[var(--accent)]/50'
                    : 'bg-transparent opacity-50 hover:opacity-70'
                )}
              >
                {/* Preview line */}
                <svg width="24" height="8" className="shrink-0">
                  <line
                    x1="2" y1="4" x2="22" y2="4"
                    stroke={cfg.color}
                    strokeWidth={isVisible ? cfg.weight : 2}
                    strokeDasharray={cfg.dashArray}
                    opacity={isVisible ? 1 : 0.4}
                  />
                </svg>
                
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-primary">{cfg.label}</p>
                  <p className="text-[9px] text-muted truncate">
                    {cfg.weight}px {cfg.dashArray ? '• dashed' : '• solid'}
                  </p>
                </div>
                
                {isVisible ? (
                  <Eye size={14} className="text-[var(--accent)] shrink-0" />
                ) : (
                  <EyeOff size={14} className="text-muted shrink-0" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Opacity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted uppercase tracking-wider">Transparansi</p>
          <span className="text-xs font-mono bg-[var(--bg-secondary)] px-2 py-0.5 rounded">
            {Math.round(options.opacity * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0.2"
          max="1"
          step="0.1"
          value={options.opacity}
          onChange={(e) => onChange({ ...options, opacity: parseFloat(e.target.value) })}
          className="w-full h-2 bg-[var(--bg-secondary)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]"
        />
      </div>
    </div>
  )
}
