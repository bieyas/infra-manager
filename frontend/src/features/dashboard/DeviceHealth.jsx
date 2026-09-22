import React from 'react'
import { Server, ArrowUpRight } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import Badge from '../../components/ui/Badge'
import StatusDot from '../../components/ui/StatusDot'
import ProgressBar from '../../components/ui/ProgressBar'
import Button from '../../components/ui/Button'

const STATUS_BADGE = { ACTIVE: 'online', WARNING: 'warning', INACTIVE: 'offline' }
const STATUS_LABEL = { ACTIVE: 'online', WARNING: 'warning', INACTIVE: 'offline' }

export default function DeviceHealth({ devices = [], loading, onViewAll }) {
  return (
    <Card>
      <CardHeader
        action={
          <Button variant="ghost" size="xs" icon={ArrowUpRight} onClick={onViewAll}>
            All devices
          </Button>
        }
      >
        <Server size={14} className="accent-text" />
        <span className="text-sm font-semibold text-primary">Device Health</span>
      </CardHeader>
      <CardBody className="space-y-2">
        {loading && Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-7 rounded-lg bg-[var(--bg-secondary)] animate-pulse" />
        ))}
        {!loading && devices.length === 0 && (
          <p className="text-xs text-muted text-center py-4">Tidak ada data device</p>
        )}
        {!loading && devices.map(dev => {
          const cpu = dev.cpuPct ?? 0
          const mem = dev.memPct ?? 0
          return (
            <div key={dev.id} className="flex items-center gap-2">
              <StatusDot status={STATUS_LABEL[dev.status] ?? 'offline'} pulse={dev.status === 'ACTIVE'} />
              <span className="text-xs font-medium text-primary w-28 truncate">{dev.name}</span>
              <div className="flex-1 space-y-0.5">
                <div className="flex items-center justify-between text-[10px] text-muted">
                  <span>CPU {cpu.toFixed(0)}%</span>
                  <span>MEM {mem.toFixed(0)}%</span>
                </div>
                <ProgressBar value={Math.max(cpu, mem)} max={100} />
              </div>
              <Badge variant={STATUS_BADGE[dev.status] ?? 'offline'}>
                {STATUS_LABEL[dev.status] ?? 'offline'}
              </Badge>
            </div>
          )
        })}
      </CardBody>
    </Card>
  )
}
