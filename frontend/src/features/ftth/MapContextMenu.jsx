import React from 'react'
import { Plus, Box, MapPin } from 'lucide-react'

export default function MapContextMenu({ x, y, latlng, onAddOdc, onAddOdp, onClose }) {
  if (!latlng) return null

  return (
    <>
      {/* Backdrop untuk menutup saat klik di luar */}
      <div 
        className="fixed inset-0 z-[9998]" 
        onClick={onClose}
      />
      
      {/* Context Menu */}
      <div
        className="fixed z-[9999] min-w-[180px] bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] shadow-xl py-2 animate-slide-in"
        style={{ 
          left: Math.min(x, window.innerWidth - 200), 
          top: Math.min(y, window.innerHeight - 120) 
        }}
      >
        <div className="px-3 py-2 border-b border-[var(--border)]">
          <p className="text-[10px] text-muted uppercase tracking-wide">Tambah di lokasi</p>
          <p className="text-[11px] font-mono text-secondary mt-0.5">
            {latlng.lat.toFixed(6)}, {latlng.lng.toFixed(6)}
          </p>
        </div>
        
        <button
          onClick={() => { onAddOdc(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-primary)] transition-colors text-left"
        >
          <div className="p-1.5 rounded bg-blue-500/10 text-blue-400">
            <Box size={14} />
          </div>
          <div>
            <p className="text-xs font-medium text-primary">Tambah ODC</p>
            <p className="text-[10px] text-muted">Distribution Closure</p>
          </div>
        </button>
        
        <button
          onClick={() => { onAddOdp(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--bg-primary)] transition-colors text-left"
        >
          <div className="p-1.5 rounded bg-cyan-500/10 text-cyan-400">
            <MapPin size={14} />
          </div>
          <div>
            <p className="text-xs font-medium text-primary">Tambah ODP</p>
            <p className="text-[10px] text-muted">Distribution Point</p>
          </div>
        </button>
        
        <div className="px-3 py-2 border-t border-[var(--border)] mt-1">
          <button
            onClick={onClose}
            className="w-full text-center text-[11px] text-muted hover:text-primary transition-colors"
          >
            Batal
          </button>
        </div>
      </div>
    </>
  )
}
