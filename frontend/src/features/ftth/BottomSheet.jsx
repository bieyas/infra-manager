import React, { useState, useRef, useEffect } from 'react'
import { ChevronsUp, ChevronsDown } from 'lucide-react'
import { SNAP } from './constants'

function getSnapPx(s) {
  const wh = window.innerHeight
  if (s === 'peek') return SNAP.peek
  if (s === 'half') return Math.round(wh * SNAP.half)
  return Math.round(wh * SNAP.full)
}

const SNAP_ORDER = ['peek', 'half', 'full']

export default function BottomSheet({ children, activeTab, onTabChange, tabs, sheetApiRef }) {
  const [snap,    setSnap]    = useState('peek')
  const sheetRef              = useRef(null)
  const dragStart             = useRef(null)
  const snapH                 = useRef(getSnapPx('peek'))

  const applySnap = (s) => {
    setSnap(s)
    const px = getSnapPx(s)
    snapH.current = px
    if (sheetRef.current) sheetRef.current.style.height = `${px}px`
  }

  // Expose applySnap to parent via ref
  useEffect(() => {
    if (sheetApiRef) sheetApiRef.current = { applySnap }
  })

  const onTouchStart = (e) => {
    dragStart.current = { y: e.touches[0].clientY, h: snapH.current }
  }
  const onTouchMove = (e) => {
    if (!dragStart.current) return
    const dy   = dragStart.current.y - e.touches[0].clientY
    const newH = Math.max(SNAP.peek, Math.min(getSnapPx('full'), dragStart.current.h + dy))
    if (sheetRef.current) sheetRef.current.style.height = `${newH}px`
    snapH.current = newH
  }
  const onTouchEnd = () => {
    if (!dragStart.current) return
    const h     = snapH.current
    const dists = SNAP_ORDER.map(s => ({ s, d: Math.abs(h - getSnapPx(s)) }))
    applySnap(dists.sort((a, b) => a.d - b.d)[0].s)
    dragStart.current = null
  }

  const cycleSnap = () => {
    applySnap(SNAP_ORDER[(SNAP_ORDER.indexOf(snap) + 1) % SNAP_ORDER.length])
  }

  return (
    <div
      ref={sheetRef}
      className="md:hidden fixed bottom-16 left-0 right-0 z-[999] flex flex-col bg-card-var border-t border-[var(--border)] rounded-t-2xl shadow-2xl transition-[height] duration-300 ease-out"
      style={{ height: getSnapPx('peek') }}
    >
      {/* Drag handle + tab bar */}
      <div
        className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="w-10 h-1 rounded-full bg-[var(--border)] mb-2" />
        <div className="w-full flex items-center justify-between px-4">
          <div className="flex gap-1">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => { onTabChange(t.id); if (snap === 'peek') applySnap('half') }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                  activeTab === t.id
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--bg-secondary)] text-secondary border border-[var(--border)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={cycleSnap}
            className="w-7 h-7 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center text-muted hover:text-primary transition-colors"
          >
            {snap === 'full' ? <ChevronsDown size={13} /> : <ChevronsUp size={13} />}
          </button>
        </div>
      </div>

      {/* Scrollable content — hidden when peeked */}
      <div className={`flex-1 overflow-y-auto transition-opacity duration-200 ${
        snap === 'peek' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        {children}
      </div>
    </div>
  )
}
