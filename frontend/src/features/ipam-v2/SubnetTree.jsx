import React from 'react'
import { ChevronRight, Network } from 'lucide-react'
import Badge from '../../components/ui/Badge'

function SubnetTreeNode({ subnet, vlanMap, level = 0 }) {
  const vlan = vlanMap[subnet.vlanId]
  const hasChildren = subnet.children && subnet.children.length > 0
  
  return (
    <div className="select-none">
      <div 
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-[var(--surface-2)]/50 rounded-lg transition-colors"
        style={{ paddingLeft: `${level * 20 + 8}px` }}
      >
        <ChevronRight 
          size={12} 
          className={`text-muted transition-transform ${hasChildren ? '' : 'opacity-0'}`} 
        />
        <Network size={12} className="text-muted" />
        <span className="font-mono text-xs text-primary">{subnet.cidr}</span>
        {subnet.description && (
          <span className="text-[10px] text-muted truncate max-w-[150px]">
            {subnet.description}
          </span>
        )}
        {vlan && (
          <Badge variant={vlan.color ?? 'neutral'} className="text-[8px] ml-auto">
            VID {vlan.vid}
          </Badge>
        )}
      </div>
      
      {hasChildren && (
        <div className="border-l border-[var(--border)]/40 ml-4">
          {subnet.children.map(child => (
            <SubnetTreeNode 
              key={child.id} 
              subnet={child} 
              vlanMap={vlanMap} 
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function SubnetTree({ subnets, vlanMap }) {
  const rootSubnets = subnets.filter(s => !s.parentId)
  
  return (
    <div className="p-4 space-y-1">
      {rootSubnets.map(subnet => (
        <SubnetTreeNode key={subnet.id} subnet={subnet} vlanMap={vlanMap} />
      ))}
    </div>
  )
}
