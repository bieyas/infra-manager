import React from 'react'
import { Network, Layers } from 'lucide-react'

export default function InfoSection({ node, parentOlt, parentOdp }) {
  return (
    <div className="space-y-3">
      {/* Card OLT untuk ODP */}
      {node.type === 'odp' && node.oltId && (
        <div className="p-3 rounded-lg bg-gradient-to-r from-blue-500/10 to-blue-600/5 border border-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
              <Network size={20} className="text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted uppercase tracking-wide">OLT Connection</p>
              <p className="text-sm font-semibold text-primary truncate">
                {parentOlt?.name || node.olt?.name || node.oltId}
              </p>
              {node.ponPort && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-medium">
                    PON Port {node.ponPort}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Card ODP Uplink (Cascade) */}
      {node.type === 'odp' && node.uplinkOdpId && (
        <div className="p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-purple-600/5 border border-purple-500/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
              <Layers size={20} className="text-purple-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted uppercase tracking-wide">ODP Uplink (Cascade)</p>
              <p className="text-sm font-semibold text-primary truncate">
                {parentOdp?.name || node.uplinkOdp?.name || node.uplinkOdpId}
              </p>
              {node.feederCore && (
                <p className="text-[10px] text-purple-400 mt-1">
                  Core: <strong>{node.feederCore}</strong>
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
