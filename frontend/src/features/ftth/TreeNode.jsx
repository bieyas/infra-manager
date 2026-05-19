import React, { useState, useEffect, useRef, memo } from 'react'
import { ChevronRight, ChevronDown, Server, Database, Box, Router, Wifi, Home, Zap } from 'lucide-react'
import clsx from 'clsx'
import { MARKER_CFG } from './constants'
import { getUtilizationColor } from './mapColors'

const TYPE_ICONS = {
  mikrotik: Router,
  olt: Server,
  odc: Database,
  closure: Box,
  odp: Zap,
  onu: Wifi,
  htb: Home,
}

const TYPE_COLORS = {
  mikrotik: '#f97316', // Orange
  olt: '#3b82f6',      // Blue
  odc: '#06b6d4',      // Cyan
  closure: '#f59e0b',  // Amber
  odp: '#8b5cf6',      // Violet
  onu: '#10b981',      // Emerald
  htb: '#34d399',      // Green
}

function TreeNode({ node, allNodes, depth = 0, onSelect, selectedId, ancestorIds }) {
  const isSelected = selectedId === node.id
  const isAncestor = ancestorIds?.has(node.id)
  const [open, setOpen] = useState(depth < 2 || isAncestor)
  const nodeRef  = useRef(null)
  // Use children from treeData structure (ODC has ODP children)
  const children = node.children || []
  const cfg      = MARKER_CFG[node.type]
  const Icon     = TYPE_ICONS[node.type] || Box
  
  // Utilization info
  const hasUtilization = node.utilization !== undefined && node.utilization !== null
  const utilizationColor = hasUtilization ? getUtilizationColor(node.utilization, node.type) : null

  useEffect(() => { if (isAncestor) setOpen(true) }, [isAncestor])

  useEffect(() => {
    if (isSelected && nodeRef.current) {
      nodeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isSelected])

  return (
    <div>
      <div
        ref={nodeRef}
        onClick={() => onSelect(node)}
        className={clsx(
          'flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer transition-colors group',
          depth > 0 && 'ml-3 border-l border-[var(--border)]',
          isSelected
            ? 'bg-[var(--accent-glow)] ring-1 ring-[var(--accent)]/40'
            : 'hover:bg-[var(--accent-glow)]/60'
        )}
      >
        {children.length > 0 ? (
          <button
            onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
            className="shrink-0"
          >
            {open
              ? <ChevronDown  size={10} className="text-muted" />
              : <ChevronRight size={10} className="text-muted" />}
          </button>
        ) : (
          <span className="w-[10px]" />
        )}

        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{
            background:  TYPE_COLORS[node.type] || cfg?.color || '#6b7280',
            boxShadow:   isSelected ? `0 0 6px ${TYPE_COLORS[node.type] || cfg?.color}` : 'none',
          }}
        />

        <span className={clsx(
          'text-[11px] truncate flex-1',
          isSelected ? 'text-primary font-semibold' : 'text-secondary group-hover:text-primary'
        )}>
          {node.name}
        </span>
        
        {/* Utilization badge */}
        {hasUtilization && (
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded"
            style={{ 
              color: utilizationColor, 
              background: `${utilizationColor}22`,
              border: `1px solid ${utilizationColor}44`
            }}
            title={`Utilisasi: ${node.usedPorts}/${node.capacity} (${node.utilization}%)`}
          >
            {node.utilization}%
          </span>
        )}

        {/* Type badge */}
        <span
          className={clsx(
            'text-[9px] font-mono px-1.5 py-0.5 rounded',
            isSelected && 'ring-1'
          )}
          style={{ 
            color: TYPE_COLORS[node.type] || cfg?.color, 
            background: `${TYPE_COLORS[node.type] || cfg?.color}22`,
            border: isSelected ? `1px solid ${TYPE_COLORS[node.type] || cfg?.color}44` : 'none'
          }}
        >
          {node.type.toUpperCase()}
        </span>
        
        {/* Child count for OLT/ODC */}
        {children.length > 0 && (
          <span className="text-[9px] text-muted ml-1">
            ({children.length})
          </span>
        )}
      </div>

      {open && children.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          allNodes={allNodes}
          depth={depth + 1}
          onSelect={onSelect}
          selectedId={selectedId}
          ancestorIds={ancestorIds}
        />
      ))}
    </div>
  )
}

export default memo(TreeNode)
