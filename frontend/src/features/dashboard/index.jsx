import React from 'react'
import {
  Server, AlertTriangle, UserRound, Wifi, WifiOff,
  RefreshCw, CheckCircle2,
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

function CustomerSyncStatus({ sync }) {
  const routers = sync ?? []
  if (routers.length === 0) return null
  return (
    <div className="hidden md:flex flex-wrap items-center gap-2 text-[10px] text-muted">
      <span>Customer sync:</span>
      {routers.map(router => (
        <span key={router.deviceId} className={router.status === 'ERROR' ? 'text-rose-400' : router.status === 'RUNNING' ? 'text-amber-400' : 'text-emerald-400'}>
          {router.deviceName}: {router.status.toLowerCase()}
          {router.lastSyncAt && ` (${new Date(router.lastSyncAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})`}
        </span>
      ))}
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
      label: 'Online', icon: Wifi,
      value: loading ? '…' : c.ONLINE ?? 0,
      total: null,
      trend: null, trendUp: true,
      color: 'text-emerald-400', bg: 'bg-emerald-500/10',
      onClick: () => navigate('/customers?connectionStatus=ONLINE'),
    },
    {
      label: 'Offline', icon: WifiOff,
      value: loading ? '…' : c.OFFLINE ?? 0,
      total: null,
      trend: null, trendUp: false,
      color: 'text-rose-400', bg: 'bg-rose-500/10',
      onClick: () => navigate('/customers?connectionStatus=OFFLINE'),
    },
    {
      label: 'Isolir', icon: WifiOff,
      value: loading ? '…' : c.SUSPENDED ?? 0,
      total: null,
      trend: null, trendUp: false,
      color: 'text-amber-400', bg: 'bg-amber-500/10',
      onClick: () => navigate('/customers?status=SUSPENDED'),
    },
    {
      label: 'Total', icon: UserRound,
      value: loading ? '…' : c.total ?? 0,
      total: null, trend: null, trendUp: true,
      color: 'text-sky-400', bg: 'bg-sky-500/10',
      onClick: () => navigate('/customers'),
    },
    {
      label: 'Device', icon: Server,
      value: loading ? '…' : d.total ?? 0,
      total: null, trend: null, trendUp: true,
      color: 'text-emerald-400', bg: 'bg-emerald-500/10',
      onClick: () => navigate('/devices'),
    },
    {
      label: 'Alert', icon: AlertTriangle,
      value: loading ? '…' : a.unacked ?? unackedCount,
      total: null,
      trend: null, trendUp: false,
      color: 'text-rose-400', bg: 'bg-rose-500/10',
      onClick: () => navigate('/alerts'),
    },
  ]

  return (
    <div className="p-3 md:p-4 space-y-4 animate-fade-in">

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold text-primary">Dashboard</h1>
        <div className="flex flex-col items-end gap-1">
          <LastUpdated date={lastUpdated} loading={loading} onRefresh={refetch} />
          <CustomerSyncStatus sync={data?.customerSync} />
        </div>
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
