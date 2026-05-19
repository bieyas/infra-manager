import React from 'react'
import { ShieldCheck } from 'lucide-react'
import Card, { CardBody } from '../../components/ui/Card'
import StatusDot from '../../components/ui/StatusDot'

const ITEMS = [
  { label: 'Firewall',       ok: true  },
  { label: 'IDS/IPS',        ok: true  },
  { label: 'VPN Tunnels',    ok: true  },
  { label: 'SSL Inspection', ok: false },
  { label: 'Threat Feeds',   ok: true  },
]

export default function SecurityBar() {
  return (
    <Card>
      <CardBody className="py-3">
        <div className="flex flex-wrap items-center gap-4 md:gap-8">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-400" />
            <span className="text-xs font-semibold text-primary">Security</span>
          </div>
          {ITEMS.map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <StatusDot status={item.ok ? 'online' : 'warning'} />
              <span className="text-[11px] text-secondary">{item.label}</span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}
