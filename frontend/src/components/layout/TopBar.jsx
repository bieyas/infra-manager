import React, { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Menu, Sun, Moon, Bell, Search, RefreshCw, LogOut, ChevronDown, Shield, Wrench, Eye } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'
import { useAlerts } from '../../context/AlertsContext'
import { useAuth } from '../../context/AuthContext'
import Button from '../ui/Button'
import StatusDot from '../ui/StatusDot'
import SearchOverlay from '../ui/SearchOverlay'

const PAGE_TITLES = {
  '/':           'Dashboard',
  '/devices':    'Devices',
  '/interfaces': 'Interfaces',
  '/topology':   'Topology',
  '/traffic':    'Traffic Monitor',
  '/wireless':   'Wireless',
  '/internet':   'Internet Links',
  '/vlans':      'VLANs',
  '/ipam':       'IP Address Management',
  '/ftth':       'FTTH Network Map',
  '/alerts':     'Alerts',
  '/settings':   'Settings',
}

function useClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const ROLE_CFG = {
  ADMIN:      { label: 'Admin',    icon: Shield,  color: '#f87171' },
  TECHNICIAN: { label: 'Teknisi',  icon: Wrench,  color: '#fb923c' },
  VIEWER:     { label: 'Viewer',   icon: Eye,     color: '#4ade80' },
}

export default function TopBar({ onMenuToggle, showSearch = true }) {
  const { theme, toggle } = useTheme()
  const { unackedCount, criticalCount } = useAlerts()
  const { user, logout } = useAuth()
  const location  = useLocation()
  const navigate  = useNavigate()
  const title     = PAGE_TITLES[location.pathname] ?? 'InfraManager'
  const clock     = useClock()
  const [searchOpen, setSearchOpen]   = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const roleCfg = ROLE_CFG[user?.role] ?? ROLE_CFG.VIEWER
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?'

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(o => !o)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <header className="h-14 border-b border-[var(--border)] bg-card-var flex items-center px-3 md:px-4 gap-3 shrink-0">
      <Button variant="ghost" size="xs" icon={Menu} onClick={onMenuToggle} />

      <div className="flex items-center gap-2 mr-auto">
        <h1 className="font-semibold text-sm text-primary">{title}</h1>
        <span className="hidden sm:flex items-center gap-1 text-[10px] text-muted font-mono">
          <StatusDot status="online" pulse size="sm" />
          <span>System nominal</span>
        </span>
      </div>

      <span className="hidden lg:block text-[11px] font-mono text-muted tabular-nums">{clock}</span>

      {showSearch && (
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-2 w-48 lg:w-64 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-muted hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all text-xs"
        >
          <Search size={12} />
          <span className="flex-1 text-left">Search…</span>
          <kbd className="text-[10px] font-mono px-1 border border-[var(--border)] rounded">⌘K</kbd>
        </button>
      )}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />

      <Button variant="ghost" size="xs" icon={RefreshCw} />

      <button
        onClick={toggle}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--accent-glow)] text-secondary hover:accent-text"
        title="Toggle theme"
      >
        {theme === 'dark'
          ? <Sun size={14} />
          : <Moon size={14} />}
      </button>

      <button className="relative w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-[var(--accent-glow)] text-secondary hover:accent-text">
        <Bell size={14} />
        {unackedCount > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full text-[8px] font-bold text-white flex items-center justify-center ${criticalCount > 0 ? 'bg-rose-500' : 'bg-amber-500'}`}>
            {unackedCount > 9 ? '9+' : unackedCount}
          </span>
        )}
      </button>

      {/* User menu */}
      {user && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-[var(--accent-glow)] transition-all"
          >
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: roleCfg.color }}>
              {initials}
            </div>
            <span className="hidden sm:block text-xs font-medium text-[var(--text-primary)] max-w-[80px] truncate">{user.name}</span>
            <ChevronDown size={12} className={`text-[var(--text-muted)] transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-[var(--bg-card)] border border-[var(--border)] rounded-xl shadow-xl z-[9999] overflow-hidden">
              {/* User info */}
              <div className="px-4 py-3 border-b border-[var(--border)]">
                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{user.name}</p>
                <p className="text-[11px] font-mono text-[var(--text-muted)] truncate">@{user.username}</p>
                <span className="inline-flex items-center gap-1 mt-1.5 text-[10px] px-2 py-0.5 rounded-full border"
                  style={{ color: roleCfg.color, borderColor: roleCfg.color + '40', background: roleCfg.color + '12' }}>
                  <roleCfg.icon size={10} />
                  {roleCfg.label}
                </span>
              </div>
              {/* Logout */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={14} />
                Keluar
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
