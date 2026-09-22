import React from 'react'
import { Loader2 } from 'lucide-react'

export default function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="animate-spin text-[var(--accent)]" size={32} />
        <p className="text-sm text-muted">Memuat halaman...</p>
      </div>
    </div>
  )
}
