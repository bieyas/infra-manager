import React, { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import clsx from 'clsx'
import {
  LayoutDashboard,
  Server,
  Network,
  Activity,
  AlertTriangle,
  Settings,
  ChevronRight,
  Layers,
  Wifi,
  Globe,
  Tag,
  Database,
  Radio,
  Cable,
  Box,
  Map,
  Users,
  UserRound,
} from 'lucide-react'
import Tooltip from '../ui/Tooltip'
import { useAlerts } from '../../context/AlertsContext'
import { useAuth } from '../../context/AuthContext'
import { hasFeatureAccess, NAV_PERMISSION_MAP } from '../../lib/permissions'

const NAV_TOP = [
  { label: 'Dashboard',    to: '/',           icon: LayoutDashboard },
  { label: 'Pelanggan',    to: '/customers',  icon: UserRound },
  { label: 'Devices',      to: '/devices',    icon: Server },
  { label: 'Interfaces',   to: '/interfaces', icon: Layers },
  { label: 'Topology',     to: '/topology',   icon: Network },
  { label: 'Traffic',      to: '/traffic',    icon: Activity },
  { label: 'Wireless',     to: '/wireless',   icon: Wifi },
  { label: 'Internet',     to: '/internet',   icon: Globe },
  { label: 'VLANs',        to: '/vlans',      icon: Tag },
  { label: 'IPAM',         to: '/ipam',       icon: Database },
]

const NAV_FTTH = [
  { label: 'Peta FTTH',    to: '/ftth',       icon: Map },
  { label: 'ODC',          to: '/odc',        icon: Box },
  { label: 'ODP',          to: '/odp',        icon: Cable },
]

const NAV_BOTTOM = [
  { label: 'Alerts',       to: '/alerts',     icon: AlertTriangle },
]

const NAV_ADMIN = [
  { label: 'Users',        to: '/users',      icon: Users },
]

/** Filter nav items based on user permissions */
function filterNav(items, user) {
  return items.filter(item => {
    const key = NAV_PERMISSION_MAP[item.to]
    return hasFeatureAccess(user, key)
  })
}

function NavItem({ to, icon: Icon, label, collapsed, badge }) {
  const location = useLocation()
  const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <Tooltip content={collapsed ? label : undefined} placement="right">
      <NavLink
        to={to}
        className={clsx(
          'nav-item',
          isActive && 'active',
          collapsed ? 'justify-center px-2' : ''
        )}
      >
        <span className="relative shrink-0">
          <Icon size={16} />
          {badge > 0 && collapsed && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500" />
          )}
        </span>
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && badge > 0 && (
          <span className="ml-auto bg-rose-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full leading-none">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
        {!collapsed && isActive && badge === 0 && <ChevronRight size={12} className="ml-auto opacity-60" />}
      </NavLink>
    </Tooltip>
  )
}

export default function Sidebar({ collapsed }) {
  const { unackedCount } = useAlerts()
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const location = useLocation()
  const ftthActive = ['/ftth','/odc','/odp','/customers'].some(p => location.pathname.startsWith(p))
  const [ftthOpen, setFtthOpen] = useState(ftthActive)

  // Filter nav items by user permissions
  const topItems    = filterNav(NAV_TOP, user)
  const ftthItems   = filterNav(NAV_FTTH, user)
  const bottomItems = filterNav(NAV_BOTTOM, user)
  const adminItems  = filterNav(NAV_ADMIN, user)
  const showSettings = hasFeatureAccess(user, 'settings')

  return (
    <aside
      className={clsx(
        'h-full sidebar-bg border-r border-[var(--border)] flex flex-col transition-all duration-200',
        collapsed ? 'w-14' : 'w-52'
      )}
    >
      {/* Logo */}
      <div className={clsx('flex items-center gap-2.5 px-4 py-4 border-b border-[var(--border)]', collapsed && 'justify-center px-0')}>
        <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center shrink-0 glow-ring">
          <Network size={14} className="text-white" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-xs font-bold text-primary tracking-wide">INFRA</p>
            <p className="text-[10px] accent-text font-semibold tracking-widest uppercase">Manager</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5">
        {topItems.map(item => (
          <NavItem key={item.to} {...item} collapsed={collapsed} badge={0} />
        ))}

        {/* ── FTTH & Distribusi group ── */}
        {ftthItems.length > 0 && (
          collapsed ? (
            ftthItems.map(item => (
              <NavItem key={item.to} {...item} collapsed={collapsed} badge={0} />
            ))
          ) : (
            <>
              <button
                onClick={() => setFtthOpen(o => !o)}
                className={clsx(
                  'nav-item mt-1 justify-between',
                  ftthActive && 'text-[var(--accent)]'
                )}
              >
                <span className="flex items-center gap-2">
                  <Radio size={16} />
                  <span className="truncate text-xs font-medium">FTTH & Distribusi</span>
                </span>
                <ChevronRight size={12} className={clsx('transition-transform duration-200 opacity-60', ftthOpen && 'rotate-90')} />
              </button>
              {ftthOpen && (
                <div className="ml-3 pl-2 border-l border-[var(--border)] flex flex-col gap-0.5">
                  {ftthItems.map(item => (
                    <NavItem key={item.to} {...item} collapsed={false} badge={0} />
                  ))}
                </div>
              )}
            </>
          )
        )}

        {bottomItems.length > 0 && (
          <div className="mt-1">
            {bottomItems.map(item => (
              <NavItem key={item.to} {...item} collapsed={collapsed}
                badge={item.to === '/alerts' ? unackedCount : 0} />
            ))}
          </div>
        )}
      </nav>

      {/* Admin & Settings */}
      {(adminItems.length > 0 || showSettings) && (
        <div className="px-2 py-3 border-t border-[var(--border)] space-y-0.5">
          {adminItems.map(item => (
            <NavItem key={item.to} {...item} collapsed={collapsed} badge={0} />
          ))}
          {showSettings && <NavItem to="/settings" icon={Settings} label="Settings" collapsed={collapsed} badge={0} />}
        </div>
      )}
    </aside>
  )
}
