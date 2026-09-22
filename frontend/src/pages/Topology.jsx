import React, { useState } from 'react'
import { Server, Shield, Wifi, Globe, ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import StatusDot from '../components/ui/StatusDot'
import Badge from '../components/ui/Badge'

const TOPO = {
  internet: {
    id: 'internet',
    label: 'Internet',
    icon: Globe,
    color: 'text-sky-400',
    bg: 'bg-sky-500/10 border-sky-500/20',
    children: ['fw-primary', 'fw-secondary'],
  },
  'fw-primary': {
    id: 'fw-primary',
    label: 'FW-Primary',
    ip: '10.0.2.1',
    icon: Shield,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    status: 'online',
    children: ['core-sw-01', 'core-sw-02'],
  },
  'fw-secondary': {
    id: 'fw-secondary',
    label: 'FW-Secondary',
    ip: '10.0.2.2',
    icon: Shield,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    status: 'online',
    children: [],
  },
  'core-sw-01': {
    id: 'core-sw-01',
    label: 'Core-SW-01',
    ip: '10.0.0.1',
    icon: Server,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
    status: 'online',
    children: ['access-sw-01', 'edge-rtr-01'],
  },
  'core-sw-02': {
    id: 'core-sw-02',
    label: 'Core-SW-02',
    ip: '10.0.0.2',
    icon: Server,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10 border-cyan-500/20',
    status: 'online',
    children: ['access-sw-02', 'edge-rtr-02'],
  },
  'edge-rtr-01': {
    id: 'edge-rtr-01',
    label: 'Edge-RTR-01',
    ip: '10.0.1.1',
    icon: Server,
    color: 'text-violet-400',
    bg: 'bg-violet-500/10 border-violet-500/20',
    status: 'online',
    children: [],
  },
  'edge-rtr-02': {
    id: 'edge-rtr-02',
    label: 'Edge-RTR-02',
    ip: '10.0.1.2',
    icon: Server,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    status: 'warning',
    children: [],
  },
  'access-sw-01': {
    id: 'access-sw-01',
    label: 'Access-SW-01',
    ip: '10.1.0.1',
    icon: Server,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    status: 'online',
    children: ['ap-floor1-01', 'ap-floor1-02'],
  },
  'access-sw-02': {
    id: 'access-sw-02',
    label: 'Access-SW-02',
    ip: '10.1.0.2',
    icon: Server,
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    status: 'offline',
    children: [],
  },
  'ap-floor1-01': {
    id: 'ap-floor1-01',
    label: 'AP-Floor1-01',
    ip: '10.2.0.1',
    icon: Wifi,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    status: 'online',
    children: [],
  },
  'ap-floor1-02': {
    id: 'ap-floor1-02',
    label: 'AP-Floor1-02',
    ip: '10.2.0.2',
    icon: Wifi,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    status: 'warning',
    children: [],
  },
}

function TopoNode({ node, depth = 0, expandedState, toggleExpand }) {
  const Icon = node.icon
  const hasChildren = node.children?.length > 0
  const expanded = expandedState[node.id] !== false

  return (
    <div className={`${depth > 0 ? 'ml-4 md:ml-8 border-l border-[var(--border)] pl-4' : ''}`}>
      <div
        className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${node.bg} cursor-pointer transition-all hover:brightness-110 mb-1`}
        onClick={() => hasChildren && toggleExpand(node.id)}
      >
        <div className={`w-7 h-7 rounded-md flex items-center justify-center bg-[var(--bg-card)] shrink-0`}>
          <Icon size={13} className={node.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-primary leading-tight">{node.label}</p>
          {node.ip && <p className="text-[10px] font-mono text-muted">{node.ip}</p>}
        </div>
        {node.status && (
          <StatusDot status={node.status} pulse={node.status === 'online'} />
        )}
        {hasChildren && (
          expanded
            ? <ChevronUp size={12} className="text-muted shrink-0" />
            : <ChevronDown size={12} className="text-muted shrink-0" />
        )}
      </div>

      {hasChildren && expanded && (
        <div className="space-y-0">
          {node.children.map(childId => (
            <TopoNode
              key={childId}
              node={TOPO[childId]}
              depth={depth + 1}
              expandedState={expandedState}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const LINK_LIST = [
  { from: 'Internet', to: 'FW-Primary',   speed: '1 Gbps', status: 'online' },
  { from: 'Internet', to: 'FW-Secondary', speed: '1 Gbps', status: 'online' },
  { from: 'FW-Primary', to: 'Core-SW-01', speed: '10 Gbps', status: 'online' },
  { from: 'FW-Primary', to: 'Core-SW-02', speed: '10 Gbps', status: 'online' },
  { from: 'Core-SW-01', to: 'Access-SW-01', speed: '1 Gbps', status: 'online' },
  { from: 'Core-SW-02', to: 'Access-SW-02', speed: '1 Gbps', status: 'offline' },
  { from: 'Core-SW-01', to: 'Edge-RTR-01',  speed: '1 Gbps', status: 'online' },
  { from: 'Core-SW-02', to: 'Edge-RTR-02',  speed: '1 Gbps', status: 'warning' },
]

export default function Topology() {
  const [expanded, setExpanded] = useState({})

  const toggleExpand = id => {
    setExpanded(prev => ({ ...prev, [id]: prev[id] === false ? true : false }))
  }

  return (
    <div className="p-3 md:p-4 space-y-4 animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tree topology */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <span className="text-sm font-semibold text-primary">Network Topology Tree</span>
            <Badge variant="info">Interactive</Badge>
          </CardHeader>
          <CardBody className="overflow-x-auto">
            <TopoNode
              node={TOPO['internet']}
              depth={0}
              expandedState={expanded}
              toggleExpand={toggleExpand}
            />
          </CardBody>
        </Card>

        {/* Link list */}
        <Card>
          <CardHeader>
            <Link2 size={14} className="accent-text" />
            <span className="text-sm font-semibold text-primary">Links</span>
          </CardHeader>
          <CardBody className="space-y-2 p-0 pb-3">
            {LINK_LIST.map((link, i) => (
              <div key={i} className="flex items-center gap-2 px-4 py-1.5 hover:bg-[var(--accent-glow)] transition-colors">
                <StatusDot status={link.status} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-primary truncate">
                    {link.from} → {link.to}
                  </p>
                  <p className="text-[10px] text-muted font-mono">{link.speed}</p>
                </div>
                <Badge variant={link.status === 'online' ? 'online' : link.status === 'warning' ? 'warning' : 'offline'}>
                  {link.status}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
