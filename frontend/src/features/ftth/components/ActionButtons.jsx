import React from 'react'
import { Edit2, Trash2 } from 'lucide-react'

export default function ActionButtons({ onEdit, onDelete, nodeType }) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
      <div className="flex items-center gap-2">
        <button
          onClick={onEdit}
          className="px-3 py-1.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 
                     text-xs font-medium transition-colors flex items-center gap-1.5"
        >
          <Edit2 size={14} />
          Edit
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 
                     text-xs font-medium transition-colors flex items-center gap-1.5"
        >
          <Trash2 size={14} />
          Hapus
        </button>
      </div>
      <span className="text-[10px] text-muted capitalize">
        {nodeType}
      </span>
    </div>
  )
}
