import React, { createContext, useContext, useState, useCallback, useMemo } from 'react'
import Toast from '../components/ui/Toast'

const ToastContext = createContext(null)

let toastId = 0

function getToastSettings() {
  try {
    const saved = localStorage.getItem('app_settings')
    if (saved) {
      const parsed = JSON.parse(saved)
      return {
        autoDismiss: parsed?.toastAutoDismiss ?? true,
        duration: (parseInt(parsed?.toastDuration) || 4) * 1000, // convert to ms
      }
    }
  } catch {}
  return { autoDismiss: true, duration: 4000 } // default 4s
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((options) => {
    const id = ++toastId
    const settings = getToastSettings()
    const newToast = {
      id,
      ...options,
      duration: settings.autoDismiss ? (options.duration ?? settings.duration) : 0,
    }
    setToasts(prev => [...prev, newToast])
    return id
  }, [])

  const closeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const success = useCallback((message, title = 'Berhasil') => {
    return showToast({ type: 'success', title, message })
  }, [showToast])

  const error = useCallback((message, title = 'Gagal') => {
    return showToast({ type: 'error', title, message })
  }, [showToast])

  const info = useCallback((message, title = 'Info') => {
    return showToast({ type: 'info', title, message })
  }, [showToast])

  const warning = useCallback((message, title = 'Peringatan') => {
    return showToast({ type: 'warning', title, message })
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast, closeToast, success, error, info, warning }}>
      {children}
      {/* Toast container - fixed top-right */}
      <div className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 max-w-sm">
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            {...toast}
            onClose={closeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
