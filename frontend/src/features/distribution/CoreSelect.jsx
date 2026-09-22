import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { FIBER_CORES } from './formHelpers'

/**
 * Dropdown pilihan core kabel fiber dengan indikator dot berwarna.
 * value: string e.g. "core-4"
 * onChange: (value) => void
 */
export default function CoreSelect({ value, onChange, placeholder = '— Pilih core —' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = FIBER_CORES.find(c => c.value === value)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary hover:border-[var(--accent)] focus:outline-none focus:border-[var(--accent)] transition-colors"
      >
        {selected ? (
          <>
            <span
              className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/20"
              style={{ backgroundColor: selected.color === '#000000' ? '#334155' : selected.color }}
            />
            <span className="flex-1 text-left">
              {selected.label} — <span className="text-muted">{selected.name}</span>
            </span>
          </>
        ) : (
          <span className="flex-1 text-left text-muted">{placeholder}</span>
        )}
        {selected ? (
          <span
            onClick={e => { e.stopPropagation(); onChange('') }}
            className="text-muted hover:text-rose-400 transition-colors cursor-pointer p-1"
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onChange(''); } }}
          >
            <X size={12} />
          </span>
        ) : (
          <ChevronDown size={14} className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-60 overflow-y-auto py-1">
            {FIBER_CORES.map(core => (
              <button
                key={core.value}
                type="button"
                onClick={() => { onChange(core.value); setOpen(false) }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-[var(--accent-glow)] transition-colors text-left ${
                  value === core.value ? 'bg-[var(--accent-glow)] text-[var(--accent)]' : 'text-primary'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-white/20"
                  style={{ backgroundColor: core.color === '#000000' ? '#334155' : core.color }}
                />
                <span className="font-medium">{core.label}</span>
                <span className="text-muted text-xs ml-auto">{core.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
