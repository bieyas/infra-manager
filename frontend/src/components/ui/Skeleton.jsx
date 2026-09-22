import React from 'react'
import clsx from 'clsx'

export function Skeleton({ className }) {
  return (
    <div className={clsx('animate-pulse rounded-md bg-[var(--border)]', className)} />
  )
}

export function SkeletonCard() {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)]">
      <Skeleton className="w-2 h-2 rounded-full" />
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-3 w-24 flex-1" />
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-4 w-14 rounded" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}

export default Skeleton
