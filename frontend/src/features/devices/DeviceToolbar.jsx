import React from 'react'
import { Search, RefreshCw, Loader2, Activity, Plus } from 'lucide-react'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import StatusDot from '../../components/ui/StatusDot'
import { STATUS_FILTERS } from './constants'

const FILTER_STATUS = {
  Online:  'online',
  Warning: 'warning',
  Offline: 'offline',
}

export default function DeviceToolbar({
  search, onSearch,
  filter, onFilter,
  stats,  onRefresh,
  onProbeAll, probing,
  onAdd,
}) {
  return (
    <div className="space-y-2">

      {/* Row 1: Search + Refresh + Actions */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <Input
            icon={Search}
            placeholder="Cari nama atau IP…"
            value={search}
            onChange={e => onSearch(e.target.value)}
          />
        </div>
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={onRefresh} className="shrink-0" />
        {onProbeAll && (
          <Button
            variant="outline" size="sm"
            icon={probing ? Loader2 : Activity}
            onClick={onProbeAll}
            disabled={probing}
            className="shrink-0 hidden sm:flex"
          >
            {probing ? '…' : 'Probe All'}
          </Button>
        )}
        {onAdd && (
          <Button
            variant="primary" size="sm" icon={Plus}
            onClick={onAdd}
            className="shrink-0"
          >
            <span className="hidden sm:inline">Add Device</span>
          </Button>
        )}
      </div>

      {/* Row 2: Filter pills + stats (horizontal scroll on mobile) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
        {/* Filter pills */}
        {STATUS_FILTERS.map(f => {
          const uiStatus = FILTER_STATUS[f]
          const count = uiStatus ? (stats[uiStatus] ?? 0) : (stats.total ?? 0)
          const isActive = filter === f
          return (
            <button
              key={f}
              onClick={() => onFilter(f)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-all border ${
                isActive
                  ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                  : 'bg-[var(--bg-card)] border-[var(--border)] text-secondary hover:text-primary hover:border-[var(--accent)]/50'
              }`}
            >
              {uiStatus && <StatusDot status={uiStatus} />}
              {f}
              <span className={`text-[10px] ${isActive ? 'text-white/70' : 'text-muted'}`}>
                {count}
              </span>
            </button>
          )
        })}

        {/* Total — pushed right on wider screens */}
        <span className="ml-auto shrink-0 text-[11px] text-muted whitespace-nowrap pl-1">
          {stats.total ?? 0} total
        </span>
      </div>

      {/* Mobile-only Probe All row */}
      {onProbeAll && (
        <div className="sm:hidden">
          <Button
            variant="outline" size="sm"
            icon={probing ? Loader2 : Activity}
            onClick={onProbeAll}
            disabled={probing}
            className="w-full"
          >
            {probing ? 'Probing…' : 'Probe All Devices'}
          </Button>
        </div>
      )}
    </div>
  )
}
