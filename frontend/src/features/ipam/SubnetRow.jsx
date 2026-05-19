import React from 'react'
import Badge from '../../components/ui/Badge'
import StatusDot from '../../components/ui/StatusDot'
import ProgressBar from '../../components/ui/ProgressBar'
import clsx from 'clsx'
import { STATUS_CFG } from './constants'

function ChevronIcon({ rotated }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10"
      fill="currentColor"
      className={clsx('text-muted transition-transform duration-200', rotated && 'rotate-90')}
    >
      <path d="M3 2l4 3-4 3V2z" />
    </svg>
  )
}

export function SubnetRowDesktop({ subnet, expanded, onToggle }) {
  const pct = Math.round((subnet.used / subnet.total) * 100)

  return (
    <>
      <tr
        className="border-b border-[var(--border)] hover:bg-[var(--accent-glow)] transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <ChevronIcon rotated={expanded} />
            <span className="font-mono font-semibold text-primary text-xs">{subnet.cidr}</span>
          </div>
        </td>
        <td className="px-4 py-2.5 text-xs">
          <Badge variant="neutral">{subnet.name}</Badge>
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-secondary">VLAN {subnet.vlan}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-secondary">{subnet.gateway}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <ProgressBar value={subnet.used} max={subnet.total} className="w-20" />
            <span className="text-[10px] text-muted tabular-nums">
              {subnet.used}/{subnet.total} ({pct}%)
            </span>
          </div>
        </td>
      </tr>

      {expanded && subnet.hosts.map(host => (
        <tr
          key={host.ip}
          className="border-b border-[var(--border)]/50 bg-[var(--bg-secondary)]/40 hover:bg-[var(--accent-glow)] transition-colors"
        >
          <td className="pl-10 pr-4 py-1.5">
            <span className="font-mono text-[11px] text-[var(--accent)]">{host.ip}</span>
          </td>
          <td className="px-4 py-1.5">
            <StatusDot status={STATUS_CFG[host.status]?.dot ?? 'unknown'} size="sm" />
          </td>
          <td className="px-4 py-1.5 font-mono text-[11px] text-secondary">
            {host.mac || <span className="text-muted">—</span>}
          </td>
          <td className="px-4 py-1.5 text-[11px] text-secondary">
            {host.hostname || <span className="text-muted italic">unassigned</span>}
          </td>
          <td className="px-4 py-1.5">
            <div className="flex items-center gap-1.5">
              <Badge variant={host.status === 'used' ? 'info' : host.status === 'reserved' ? 'warning' : 'neutral'}>
                {STATUS_CFG[host.status]?.label ?? host.status}
              </Badge>
              {host.type && (
                <span className="text-[9px] font-mono text-muted uppercase">{host.type}</span>
              )}
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}

export function SubnetCardMobile({ subnet, expanded, onToggle }) {
  const pct = Math.round((subnet.used / subnet.total) * 100)

  return (
    <div>
      <div
        className="p-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--accent-glow)] transition-colors"
        onClick={onToggle}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-primary">{subnet.cidr}</span>
            <Badge variant="neutral">{subnet.name}</Badge>
          </div>
          <p className="text-[10px] text-muted mt-0.5">VLAN {subnet.vlan} · GW {subnet.gateway}</p>
          <div className="mt-1 flex items-center gap-2">
            <ProgressBar value={subnet.used} max={subnet.total} className="w-24" />
            <span className="text-[10px] text-muted">{pct}%</span>
          </div>
        </div>
        <ChevronIcon rotated={expanded} />
      </div>

      {expanded && subnet.hosts.map(host => (
        <div
          key={host.ip}
          className="flex items-center gap-3 px-6 py-1.5 bg-[var(--bg-secondary)]/40 border-t border-[var(--border)]/50"
        >
          <StatusDot status={STATUS_CFG[host.status]?.dot ?? 'unknown'} size="sm" />
          <span className="font-mono text-[11px] text-[var(--accent)] w-32">{host.ip}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-secondary truncate">
              {host.hostname || <span className="text-muted italic">unassigned</span>}
            </p>
            <p className="text-[9px] text-muted font-mono">{host.mac || '—'}</p>
          </div>
          <Badge variant={host.status === 'used' ? 'info' : host.status === 'reserved' ? 'warning' : 'neutral'}>
            {host.status}
          </Badge>
        </div>
      ))}
    </div>
  )
}
