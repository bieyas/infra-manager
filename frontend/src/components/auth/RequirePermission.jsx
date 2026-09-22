import React, { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldX, ArrowLeft, Lock } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { hasRouteAccess } from '../../lib/permissions'

/**
 * Route guard that checks feature-level permissions.
 * Shows a warning modal overlay when access is denied, then navigates back.
 */
export default function RequirePermission({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [denied, setDenied] = useState(false)

  const allowed = hasRouteAccess(user, location.pathname)

  useEffect(() => {
    if (!allowed) {
      setDenied(true)
    } else {
      setDenied(false)
    }
  }, [allowed, location.pathname])

  const handleGoBack = () => {
    setDenied(false)
    // Try to go back, fallback to dashboard
    if (window.history.length > 2) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  if (denied) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
        <div className="relative bg-[var(--bg-primary)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          {/* Top accent bar */}
          <div className="h-1 bg-gradient-to-r from-rose-500 via-amber-500 to-rose-500" />

          <div className="p-6 text-center">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center mb-4">
              <ShieldX size={28} className="text-rose-400" />
            </div>

            {/* Title */}
            <h2 className="text-base font-bold text-primary mb-1">Akses Ditolak</h2>
            <p className="text-xs text-muted mb-5 leading-relaxed">
              Anda tidak memiliki izin untuk mengakses halaman ini.<br />
              Hubungi administrator untuk mendapatkan akses.
            </p>

            {/* Path info */}
            <div className="flex items-center justify-center gap-2 mb-5 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
              <Lock size={12} className="text-muted shrink-0" />
              <code className="text-[11px] text-muted truncate">{location.pathname}</code>
            </div>

            {/* Action */}
            <button
              onClick={handleGoBack}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-all shadow-lg shadow-[var(--accent)]/20"
            >
              <ArrowLeft size={14} />
              Kembali
            </button>
          </div>
        </div>
      </div>
    )
  }

  return children
}
