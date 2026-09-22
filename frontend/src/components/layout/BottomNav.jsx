import React from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { LayoutDashboard, Map, Cable, UserRound, QrCode } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../../context/AuthContext'
import { hasFeatureAccess, NAV_PERMISSION_MAP } from '../../lib/permissions'

const LEFT_NAV  = [
  { label: 'Dashboard', to: '/',          icon: LayoutDashboard },
  { label: 'Pelanggan', to: '/customers', icon: UserRound },
]
const RIGHT_NAV = [
  { label: 'ODP',       to: '/odp',       icon: Cable },
  { label: 'Map',       to: '/ftth',      icon: Map },
]

function NavItem({ label, to, icon: Icon }) {
  const location = useLocation()
  const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
  return (
    <NavLink
      to={to}
      className={clsx(
        'flex flex-col items-center gap-0.5 flex-1 py-1 text-[10px] font-medium transition-all',
        isActive ? 'accent-text' : 'text-muted'
      )}
    >
      <Icon
        size={20}
        className={clsx('transition-all', isActive && 'drop-shadow-[0_0_6px_var(--accent)]')}
        strokeWidth={isActive ? 2.5 : 1.8}
      />
      <span className={clsx(isActive ? 'font-semibold' : '')}>{label}</span>
    </NavLink>
  )
}

export default function BottomNav() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const filterVisible = (items) =>
    items.filter(item => hasFeatureAccess(user, NAV_PERMISSION_MAP[item.to]))

  const left  = filterVisible(LEFT_NAV)
  const right = filterVisible(RIGHT_NAV)

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-[1001]">
      {/* Curved bar */}
      <div className="relative flex items-center bg-[var(--bg-card)] border-t border-[var(--border)] h-16 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">

        {/* Left items */}
        <div className="flex flex-1 justify-around">
          {left.map(item => <NavItem key={item.to} {...item} />)}
        </div>

        {/* Hero QR button — center notch */}
        <div className="relative flex items-center justify-center mx-3 shrink-0 w-16 h-16 -mt-5">
          {/* Notch ring — sama pusat dengan tombol */}
          <div className="absolute inset-0 rounded-full bg-[var(--bg-card)] border border-[var(--border)]" />
          <button
            onClick={() => navigate('/scan')}
            className={clsx(
              'relative z-10 w-14 h-14 rounded-full',
              'bg-[var(--accent)] text-white shadow-xl shadow-[var(--accent)]/50',
              'flex items-center justify-center',
              'active:scale-95 transition-transform'
            )}
            aria-label="Scan QR Code"
          >
            <QrCode size={24} strokeWidth={1.8} />
          </button>
        </div>

        {/* Right items */}
        <div className="flex flex-1 justify-around">
          {right.map(item => <NavItem key={item.to} {...item} />)}
        </div>
      </div>
    </nav>
  )
}
