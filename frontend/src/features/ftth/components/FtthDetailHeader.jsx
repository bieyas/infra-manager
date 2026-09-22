import React from 'react'
import { X, Box, Circle, Zap, Home, AlertCircle, CheckCircle2, Wrench, Network, Cable, Layers } from 'lucide-react'
import clsx from 'clsx'

const TYPE_CFG = {
  odc:     { label: 'ODC',     color: '#00cbca', icon: Box    },
  odp:     { label: 'ODP',     color: '#8b5cf6', icon: Circle },
  closure: { label: 'Closure', color: '#f59e0b', icon: Cable  },
  htb:     { label: 'HTB',     color: '#34d399', icon: Home   },
}

const STATUS_CFG = {
  active:      { label: 'Aktif',       color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  inactive:    { label: 'Non-aktif',   color: 'text-slate-400',   bg: 'bg-slate-500/10',   icon: AlertCircle },
  maintenance: { label: 'Maintenance', color: 'text-amber-400',   bg: 'bg-amber-500/10',   icon: Wrench },
  fault:       { label: 'Fault',       color: 'text-rose-400',    bg: 'bg-rose-500/10',    icon: AlertCircle },
}

export default function FtthDetailHeader({ node, onClose }) {
  const cfg = TYPE_CFG[node.type] || { label: node.type, color: '#94a3b8', icon: Box }
  const statusCfg = STATUS_CFG[node.status] || STATUS_CFG.inactive
  const Icon = cfg.icon

  return (
    <div className="flex items-start justify-between gap-3 p-4 border-b border-[var(--border)]">
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${cfg.color}20` }}
        >
          <Icon size={24} style={{ color: cfg.color }} />
        </div>
        
        {/* Title & Status */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wide text-white"
              style={{ background: cfg.color }}
            >
              {cfg.label}
            </span>
            <span className={clsx(
              'text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1',
              statusCfg.color, statusCfg.bg
            )}>
              <statusCfg.icon size={10} />
              {statusCfg.label}
            </span>
          </div>
          <h3 className="font-semibold text-base leading-tight truncate" title={node.name}>
            {node.name}
          </h3>
          {node.address && (
            <p className="text-[11px] text-muted mt-0.5 line-clamp-2">
              {node.address}
            </p>
          )}
        </div>
      </div>
      
      {/* Close button */}
      <button
        onClick={onClose}
        className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-muted hover:text-[var(--text-primary)] transition-colors shrink-0"
      >
        <X size={20} />
      </button>
    </div>
  )
}
