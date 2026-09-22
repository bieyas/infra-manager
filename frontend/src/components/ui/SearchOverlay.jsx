import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Server, Network, Tag, AlertTriangle, Activity, Globe, Wifi, Layers, LayoutDashboard, Settings, Database, ArrowRight } from 'lucide-react'
import { DEVICES, INTERFACES } from '../../data/mockData'
import clsx from 'clsx'

const PAGES = [
  { label: 'Dashboard',          to: '/',           icon: LayoutDashboard, type: 'page' },
  { label: 'Devices',            to: '/devices',    icon: Server,           type: 'page' },
  { label: 'Interfaces',         to: '/interfaces', icon: Layers,           type: 'page' },
  { label: 'Topology',           to: '/topology',   icon: Network,          type: 'page' },
  { label: 'Traffic Monitor',    to: '/traffic',    icon: Activity,         type: 'page' },
  { label: 'Wireless',           to: '/wireless',   icon: Wifi,             type: 'page' },
  { label: 'Internet Links',     to: '/internet',   icon: Globe,            type: 'page' },
  { label: 'Alerts',             to: '/alerts',     icon: AlertTriangle,    type: 'page' },
  { label: 'VLANs',              to: '/vlans',      icon: Tag,              type: 'page' },
  { label: 'IPAM',               to: '/ipam',       icon: Database,         type: 'page' },
  { label: 'Settings',           to: '/settings',   icon: Settings,         type: 'page' },
]

function buildIndex() {
  const items = [...PAGES]
  DEVICES.forEach(d => items.push({
    label: d.name,
    sublabel: `${d.ip} · ${d.model}`,
    to: '/devices',
    icon: Server,
    type: 'device',
    badge: d.status,
  }))
  INTERFACES.forEach(i => items.push({
    label: i.name,
    sublabel: `${i.device} · ${i.type} ${i.speed}`,
    to: '/interfaces',
    icon: Layers,
    type: 'interface',
  }))
  return items
}

const INDEX = buildIndex()

const TYPE_LABEL = { page: 'Page', device: 'Device', interface: 'Interface' }

export default function SearchOverlay({ open, onClose }) {
  const [query, setQuery]     = useState('')
  const [cursor, setCursor]   = useState(0)
  const inputRef              = useRef()
  const listRef               = useRef()
  const navigate              = useNavigate()

  useEffect(() => {
    if (open) { setQuery(''); setCursor(0); setTimeout(() => inputRef.current?.focus(), 50) }
  }, [open])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open ? onClose() : null }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const results = query.trim()
    ? INDEX.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.sublabel?.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10)
    : PAGES.slice(0, 8)

  const go = (item) => { navigate(item.to); onClose() }

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && results[cursor]) go(results[cursor])
  }

  useEffect(() => {
    const el = listRef.current?.children[cursor]
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const grouped = results.reduce((acc, item, i) => {
    const g = TYPE_LABEL[item.type] ?? 'Other'
    if (!acc[g]) acc[g] = []
    acc[g].push({ ...item, _idx: i })
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-fade-in">
        <div className="card shadow-2xl overflow-hidden">
          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
            <Search size={16} className="accent-text shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => { setQuery(e.target.value); setCursor(0) }}
              onKeyDown={handleKey}
              placeholder="Search pages, devices, interfaces…"
              className="flex-1 bg-transparent text-sm text-primary placeholder:text-muted focus:outline-none"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[var(--border)] text-[10px] text-muted font-mono">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
            {results.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-muted">No results for "{query}"</p>
            )}
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <p className="px-4 py-1 text-[10px] text-muted uppercase tracking-wider font-semibold">{group}</p>
                {items.map((item) => {
                  const Icon = item.icon
                  const active = cursor === item._idx
                  return (
                    <button
                      key={`${item.type}-${item.label}`}
                      onClick={() => go(item)}
                      onMouseEnter={() => setCursor(item._idx)}
                      className={clsx(
                        'w-full flex items-center gap-3 px-4 py-2 transition-colors text-left',
                        active ? 'bg-[var(--accent-glow)]' : 'hover:bg-[var(--accent-glow)]/50'
                      )}
                    >
                      <div className={clsx(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                        active ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] accent-text'
                      )}>
                        <Icon size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-primary truncate">{item.label}</p>
                        {item.sublabel && <p className="text-[10px] text-muted font-mono truncate">{item.sublabel}</p>}
                      </div>
                      {active && <ArrowRight size={12} className="accent-text shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Footer hint */}
          <div className="px-4 py-2 border-t border-[var(--border)] flex items-center gap-4 text-[10px] text-muted">
            <span className="flex items-center gap-1"><kbd className="font-mono px-1 border border-[var(--border)] rounded">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="font-mono px-1 border border-[var(--border)] rounded">↵</kbd> open</span>
            <span className="flex items-center gap-1"><kbd className="font-mono px-1 border border-[var(--border)] rounded">ESC</kbd> close</span>
          </div>
        </div>
      </div>
    </div>
  )
}
