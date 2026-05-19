import React from 'react'
import { Wifi, Users, Signal, Radio } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import StatusDot from '../components/ui/StatusDot'
import ProgressBar from '../components/ui/ProgressBar'
import { WIRELESS_APS } from '../data/mockData'

function SignalBar({ dbm }) {
  if (dbm === null) return <span className="text-muted text-[10px]">—</span>
  const pct = Math.min(100, Math.max(0, ((dbm + 100) / 60) * 100))
  const color = dbm > -60 ? 'text-emerald-400' : dbm > -70 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="flex items-center gap-1.5">
      <Signal size={12} className={color} />
      <span className={`text-[10px] font-mono ${color}`}>{dbm} dBm</span>
    </div>
  )
}

export default function Wireless() {
  const totalClients = WIRELESS_APS.reduce((s, ap) => s + ap.clients, 0)
  const online = WIRELESS_APS.filter(a => a.status === 'online').length

  return (
    <div className="p-3 md:p-4 space-y-3 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <Wifi size={15} className="accent-text" />
          <p className="text-2xl font-bold text-primary">{online}</p>
          <p className="text-[10px] text-muted">APs Online</p>
        </div>
        <div className="stat-card">
          <Users size={15} className="text-violet-400" />
          <p className="text-2xl font-bold text-primary">{totalClients}</p>
          <p className="text-[10px] text-muted">Total Clients</p>
        </div>
        <div className="stat-card">
          <Radio size={15} className="text-sky-400" />
          <p className="text-2xl font-bold text-primary">{WIRELESS_APS.length}</p>
          <p className="text-[10px] text-muted">Total APs</p>
        </div>
      </div>

      {/* AP table */}
      <Card>
        <CardHeader>
          <Wifi size={14} className="accent-text" />
          <span className="text-sm font-semibold text-primary">Access Points</span>
        </CardHeader>
        <CardBody className="p-0 pb-3">
          {/* Desktop */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] text-muted uppercase tracking-wider">
                  {['Status','Name','Location','Clients','Band','Channel','Signal'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {WIRELESS_APS.map((ap, i) => (
                  <tr key={ap.id} className={`border-b border-[var(--border)] hover:bg-[var(--accent-glow)] transition-colors ${i%2===0?'':'bg-[var(--bg-secondary)]/30'}`}>
                    <td className="px-4 py-2.5"><StatusDot status={ap.status} pulse={ap.status==='online'} /></td>
                    <td className="px-4 py-2.5 font-medium text-primary">{ap.name}</td>
                    <td className="px-4 py-2.5 text-secondary">{ap.location}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1">
                        <Users size={11} className="text-violet-400" />
                        <span className="font-mono text-primary">{ap.clients}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={ap.band.includes('5') ? 'accent' : 'neutral'}>{ap.band}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-secondary">{ap.channel || '—'}</td>
                    <td className="px-4 py-2.5"><SignalBar dbm={ap.signal} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile */}
          <div className="md:hidden divide-y divide-[var(--border)]">
            {WIRELESS_APS.map(ap => (
              <div key={ap.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot status={ap.status} pulse={ap.status==='online'} />
                    <span className="text-xs font-semibold text-primary">{ap.name}</span>
                  </div>
                  <Badge variant={ap.status==='online'?'online':ap.status==='warning'?'warning':'offline'}>{ap.status}</Badge>
                </div>
                <p className="text-[10px] text-muted">{ap.location}</p>
                <div className="flex flex-wrap gap-3 text-[10px]">
                  <span className="flex items-center gap-1 text-violet-400"><Users size={10}/>{ap.clients} clients</span>
                  <span className="text-secondary">{ap.band} · Ch {ap.channel || '—'}</span>
                  <SignalBar dbm={ap.signal} />
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
