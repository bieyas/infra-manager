import React, { useMemo } from 'react'
import TreeNode from './TreeNode'

function countDescendants(node) {
  if (!node.children || node.children.length === 0) return 0
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0)
}

export default function TreePanel({ treeData, selectedId, ancestorIds, onSelect }) {
  const stats = useMemo(() => {
    if (!treeData) return null
    let olts = 0, odcs = 0, odps = 0, onus = 0
    const walk = (nodes) => {
      nodes.forEach(n => {
        if (n.type === 'olt') olts++
        else if (n.type === 'odc') odcs++
        else if (n.type === 'odp') odps++
        else if (n.type === 'onu') onus++
        if (n.children) walk(n.children)
      })
    }
    walk(treeData)
    return { olts, odcs, odps, onus }
  }, [treeData])

  if (!treeData || treeData.length === 0) {
    return <p className="text-xs text-muted text-center py-8">Belum ada data FTTH</p>
  }

  return (
    <div className="p-2 space-y-2">
      {/* Summary */}
      {stats && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[10px]">
          <span className="text-blue-500 font-semibold">{stats.olts} OLT</span>
          <span className="text-[var(--border)]">·</span>
          <span className="text-cyan-500 font-semibold">{stats.odcs} ODC</span>
          <span className="text-[var(--border)]">·</span>
          <span className="text-violet-500 font-semibold">{stats.odps} ODP</span>
          {stats.onus > 0 && (
            <>
              <span className="text-[var(--border)]">·</span>
              <span className="text-emerald-500 font-semibold">{stats.onus} ONU</span>
            </>
          )}
        </div>
      )}

      {/* Tree */}
      <div className="space-y-1">
        {treeData.map(olt => (
          <TreeNode
            key={olt.id}
            node={olt}
            allNodes={treeData}
            depth={0}
            selectedId={selectedId}
            ancestorIds={ancestorIds}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}
