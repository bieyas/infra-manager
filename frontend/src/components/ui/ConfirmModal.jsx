import React from 'react'
import { X, AlertTriangle, CheckCircle } from 'lucide-react'
import Button from './Button'

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Konfirmasi',
  message = 'Apakah Anda yakin?',
  confirmText = 'Ya',
  cancelText = 'Batal',
  variant = 'warning', // 'warning' | 'danger' | 'info'
}) {
  if (!isOpen) return null

  const iconStyles = {
    warning: 'text-amber-400',
    danger: 'text-rose-400',
    info: 'text-[var(--accent)]',
  }

  const confirmVariants = {
    warning: 'primary',
    danger: 'danger',
    info: 'primary',
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] shadow-xl animate-slide-in">
        <div className="flex items-start gap-3 p-5">
          <div className={`shrink-0 p-2 rounded-full bg-[var(--bg-primary)] ${iconStyles[variant]}`}>
            {variant === 'warning' && <AlertTriangle size={20} />}
            {variant === 'danger' && <AlertTriangle size={20} />}
            {variant === 'info' && <CheckCircle size={20} />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-primary">{title}</h3>
            <p className="text-xs text-muted mt-1">{message}</p>
          </div>
          <button onClick={onClose} className="shrink-0 p-1 text-muted hover:text-primary transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[var(--border)]">
          <Button variant="outline" size="sm" onClick={onClose}>
            {cancelText}
          </Button>
          <Button variant={confirmVariants[variant]} size="sm" onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
