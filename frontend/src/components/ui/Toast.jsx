import React, { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
}

const styles = {
  success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  error: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
  info: 'bg-[var(--accent)]/10 border-[var(--accent)]/30 text-[var(--accent)]',
  warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
}

export default function Toast({ id, type = 'info', title, message, duration = 4000, onClose }) {
  const Icon = icons[type] || Info

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => onClose(id), duration)
      return () => clearTimeout(timer)
    }
  }, [id, duration, onClose])

  return (
    <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm shadow-lg animate-slide-in ${styles[type]}`}>
      <Icon size={18} className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-medium">{title}</p>}
        {message && <p className={`text-xs ${title ? 'mt-0.5 opacity-90' : ''}`}>{message}</p>}
      </div>
      <button
        onClick={() => onClose(id)}
        className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
