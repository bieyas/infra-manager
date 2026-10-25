import React from 'react'
import clsx from 'clsx'

export default function Card({ children, className, glow, ...props }) {
  return (
    <div
      className={clsx('card', glow && 'card-glow', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className, action }) {
  return (
    <div className={clsx('flex items-center justify-between px-4 pt-4 pb-2', className)}>
      <div className="flex items-center gap-2">{children}</div>
      {action && <div className="flex items-center gap-1.5">{action}</div>}
    </div>
  )
}

export function CardBody({ children, className }) {
  return <div className={clsx('px-4 pb-4', className)}>{children}</div>
}
