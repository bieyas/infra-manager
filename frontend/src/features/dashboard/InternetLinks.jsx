import React from 'react'
import { Globe, ArrowUpRight } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import StatusDot from '../../components/ui/StatusDot'
import ProgressBar from '../../components/ui/ProgressBar'
import Button from '../../components/ui/Button'
import { INTERNET_LINKS } from '../../data/mockData'

export default function InternetLinks({ onViewAll }) {
  return (
    <Card>
      <CardHeader
        action={
          <Button variant="ghost" size="xs" icon={ArrowUpRight} onClick={onViewAll}>
            All
          </Button>
        }
      >
        <Globe size={14} className="accent-text" />
        <span className="text-sm font-semibold text-primary">Internet Links</span>
      </CardHeader>
      <CardBody className="space-y-3">
        {INTERNET_LINKS.map(link => (
          <div key={link.id} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <StatusDot status={link.status === 'standby' ? 'unknown' : link.status} />
                <span className="text-xs font-medium text-primary">{link.name}</span>
              </div>
              <Badge variant={link.status === 'online' ? 'online' : link.status === 'standby' ? 'neutral' : 'offline'}>
                {link.status}
              </Badge>
            </div>
            <p className="text-[10px] text-muted">{link.provider} · {link.bandwidth} Mbps</p>
            {link.status === 'online' && (
              <>
                <div className="flex justify-between text-[10px] text-muted font-mono">
                  <span>↓ {link.usedIn} Mbps</span>
                  <span>↑ {link.usedOut} Mbps</span>
                </div>
                <ProgressBar value={link.usedIn + link.usedOut} max={link.bandwidth} />
              </>
            )}
            {link.status === 'standby' && (
              <p className="text-[10px] text-muted italic">Standby — not active</p>
            )}
          </div>
        ))}
      </CardBody>
    </Card>
  )
}
