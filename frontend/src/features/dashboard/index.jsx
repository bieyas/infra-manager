import React from 'react'
import {
  Server, AlertTriangle, Box, Cable, UserRound,
  RefreshCw, CheckCircle2, WifiOff,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAlerts } from '../../context/AlertsContext'
import { useDashboardStats } from './useDashboard'
import StatCard from './StatCard'
import TrafficChart from './TrafficChart'
import InternetLinks from './InternetLinks'
import DeviceHealth from './DeviceHealth'
import RecentAlerts from './RecentAlerts'
import { StatusDistribution, DeviceTypes } from './DeviceStats'
import SecurityBar from './SecurityBar'

function LastUpdated({ date, loading, onRefresh }) {
  if (!date && !loading) return null
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted">
      {loading
        ? <RefreshCw size={10} className="animate-spin" />
        : <CheckCircle2 size={10} className="text-emerald-400" />
      }
      {date && !loading && (
        <span>Update {date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
      )}
      <button onClick={onRefresh} className="hover:text-primary transition-colors ml-1">
        <RefreshCw size={10} />
      </button>
    </div>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { unackedCount } = useAlerts()
  const { data, loading, refetch, lastUpdated } = useDashboardStats(30000)

  const d  = data?.devices   ?? {}
  const a  = data?.alerts    ?? {}
  const c  = data?.customers ?? {}

  const statCards = [
    {
      label: 'Devices Online', icon: Server,
      value: loading ? '…' : d.ACTIVE ?? 0,
      total: loading ? null : d.total,
      trend: null, trendUp: true,
      color: 'text-emerald-400', bg: 'bg-emerald-500/10',
      onClick: () => navigate('/devices'),
    },
    {
      label: 'Active Alerts', icon: AlertTriangle,
      value: loading ? '…' : a.unacked ?? unackedCount,
      total: loading ? null : a.total ?? null,
      trend: null, trendUp: false,
      color: 'text-rose-400', bg: 'bg-rose-500/10',
      onClick: () => navigate('/alerts'),
    },
    {
      label: 'Pelanggan Aktif', icon: UserRound,
      value: loading ? '…' : c.ACTIVE ?? 0,
      total: loading ? null : c.total,
      trend: null, trendUp: true,
      color: 'text-[var(--accent)]', bg: 'bg-[var(--accent-glow)]',
      onClick: () => navigate('/customers'),
    },
    {
      label: 'Pelanggan Isolir', icon: WifiOff,
      value: loading ? '…' : c.SUSPENDED ?? 0,
      total: loading ? null : null,
      trend: null, trendUp: false,
      color: 'text-amber-400', bg: 'bg-amber-500/10',
      onClick: () => navigate('/customers?status=SUSPENDED'),
    },
    {
      label: 'ODC', icon: Box,
      value: loading ? '…' : data?.odc?.total ?? 0,
      total: null, trend: null, trendUp: true,
      color: 'text-violet-400', bg: 'bg-violet-500/10',
      onClick: () => navigate('/odc'),
    },
    {
      label: 'ODP', icon: Cable,
      value: loading ? '…' : data?.odp?.total ?? 0,
      total: null, trend: null, trendUp: true,
      color: 'text-sky-400', bg: 'bg-sky-500/10',
      onClick: () => navigate('/odp'),
    },
  ]

  return (
    <div className="p-3 md:p-4 space-y-4 animate-fade-in">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-primary">Dashboard</h1>
        <LastUpdated date={lastUpdated} loading={loading} onRefresh={refetch} />
      </div>

      {/* Stat cards — 2 kolom mobile, 3 tablet, 6 desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(s => (
          <div key={s.label} onClick={s.onClick} className="cursor-pointer">
            <StatCard {...s} />
          </div>
        ))}
      </div>

      {/* Traffic + Internet Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <TrafficChart onViewAll={() => navigate('/traffic')} />
        <InternetLinks onViewAll={() => navigate('/internet')} />
      </div>

      {/* Device Health + Recent Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <DeviceHealth
          devices={data?.topDevices ?? []}
          loading={loading}
          onViewAll={() => navigate('/devices')}
        />
        <RecentAlerts
          alerts={data?.recentAlerts ?? []}
          loading={loading}
          onViewAll={() => navigate('/alerts')}
        />
      </div>

      {/* Status donut + Device types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatusDistribution
          deviceStats={data?.devices}
          loading={loading}
          onViewAll={() => navigate('/devices')}
        />
        <DeviceTypes
          topDevices={data?.topDevices ?? []}
          loading={loading}
        />
      </div>

      <SecurityBar />
    </div>
  )
}
