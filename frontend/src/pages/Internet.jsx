import React from 'react'
import { Globe, ArrowDownToLine, ArrowUpFromLine, Clock } from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import StatusDot from '../components/ui/StatusDot'
import ProgressBar from '../components/ui/ProgressBar'
import { INTERNET_LINKS } from '../data/mockData'

export default function Internet() {
  return (
    <div className="p-3 md:p-4 space-y-3 animate-fade-in">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="stat-card">
          <Globe size={15} className="accent-text" />
          <p className="text-2xl font-bold text-primary">{INTERNET_LINKS.filter(l=>l.status==='online').length}</p>
          <p className="text-[10px] text-muted">Active Links</p>
        </div>
        <div className="stat-card">
          <ArrowDownToLine size={15} className="text-cyan-400" />
          <p className="text-2xl font-bold text-primary">
            {INTERNET_LINKS.reduce((s,l)=>s+l.usedIn,0)} <span className="text-sm font-normal">Mbps</span>
          </p>
          <p className="text-[10px] text-muted">Total Inbound</p>
        </div>
        <div className="stat-card">
          <ArrowUpFromLine size={15} className="text-violet-400" />
          <p className="text-2xl font-bold text-primary">
            {INTERNET_LINKS.reduce((s,l)=>s+l.usedOut,0)} <span className="text-sm font-normal">Mbps</span>
          </p>
          <p className="text-[10px] text-muted">Total Outbound</p>
        </div>
      </div>

      {/* Link cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {INTERNET_LINKS.map(link => {
          const totalUsed = link.usedIn + link.usedOut
          const pct = link.bandwidth > 0 ? Math.round((totalUsed / link.bandwidth) * 100) : 0
          return (
            <Card key={link.id} className={`${link.status === 'online' ? 'card-glow' : ''}`}>
              <CardHeader
                action={
                  <Badge variant={link.status==='online'?'online':link.status==='standby'?'neutral':'offline'}>
                    {link.status}
                  </Badge>
                }
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${link.status==='online'?'bg-emerald-500/10':'bg-slate-500/10'}`}>
                  <Globe size={15} className={link.status==='online'?'text-emerald-400':'text-slate-400'} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-primary">{link.name}</p>
                  <p className="text-[10px] text-muted">{link.provider}</p>
                </div>
              </CardHeader>
              <CardBody className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-[10px]">
                  <div>
                    <p className="text-muted">Bandwidth</p>
                    <p className="font-mono text-primary font-semibold">{link.bandwidth} Mbps</p>
                  </div>
                  {link.latency !== null ? (
                    <div>
                      <p className="text-muted flex items-center gap-1"><Clock size={9}/> Latency</p>
                      <p className={`font-mono font-semibold ${link.latency < 5 ? 'text-emerald-400' : link.latency < 20 ? 'text-amber-400' : 'text-red-400'}`}>
                        {link.latency} ms
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-muted">Latency</p>
                      <p className="text-muted">—</p>
                    </div>
                  )}
                </div>

                {link.status === 'online' && (
                  <>
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="flex items-center gap-1 text-cyan-400"><ArrowDownToLine size={10}/>{link.usedIn} Mbps</span>
                      <span className="flex items-center gap-1 text-violet-400"><ArrowUpFromLine size={10}/>{link.usedOut} Mbps</span>
                    </div>
                    <div className="space-y-1">
                      <ProgressBar value={totalUsed} max={link.bandwidth} />
                      <div className="flex justify-between text-[10px] text-muted">
                        <span>Utilization</span>
                        <span className="font-mono">{pct}%</span>
                      </div>
                    </div>
                  </>
                )}

                {link.status === 'standby' && (
                  <div className="py-3 text-center">
                    <p className="text-xs text-muted italic">Standby — automatic failover ready</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
