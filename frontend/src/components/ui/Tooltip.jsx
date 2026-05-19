import React, { useState } from 'react'
import clsx from 'clsx'

export default function Tooltip({ children, content, placement = 'top' }) {
  const [show, setShow] = useState(false)

  const pos = {
    top:    '-top-8 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-1 left-1/2 -translate-x-1/2',
    left:   'right-full mr-1 top-1/2 -translate-y-1/2',
    right:  'left-full ml-1 top-1/2 -translate-y-1/2',
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && content && (
        <span
          className={clsx(
            'absolute z-50 px-2 py-1 rounded text-[10px] font-medium whitespace-nowrap pointer-events-none animate-fade-in',
            'bg-[#1e2a3a] text-slate-200 border border-[var(--border)] shadow-lg',
            pos[placement]
          )}
        >
          {content}
        </span>
      )}
    </span>
  )
}
