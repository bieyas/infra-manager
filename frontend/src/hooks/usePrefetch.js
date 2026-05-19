import { useEffect } from 'react'

/**
 * Prefetch a lazy-loaded module when browser is idle
 * Usage: usePrefetch(() => import('./pages/Devices'))
 */
export function usePrefetch(importFn, delay = 2000) {
  useEffect(() => {
    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          importFn()
        })
      } else {
        // Fallback for Safari
        setTimeout(() => importFn(), 100)
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [importFn, delay])
}

/**
 * Prefetch multiple routes based on current path
 */
export function useRoutePrefetch(currentPath) {
  useEffect(() => {
    const prefetchMap = {
      '/': [
        () => import('../pages/Devices'),
        () => import('../pages/Alerts'),
      ],
      '/devices': [
        () => import('../features/devices/DeviceDetailPage'),
      ],
      '/ftth': [
        () => import('../features/distribution/OdcPage'),
        () => import('../features/distribution/OdpPage'),
      ],
    }

    const routesToPrefetch = prefetchMap[currentPath] || []
    
    routesToPrefetch.forEach((importFn, index) => {
      setTimeout(() => {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => importFn())
        } else {
          setTimeout(() => importFn(), 100)
        }
      }, 3000 + (index * 500)) // Stagger prefetch
    })
  }, [currentPath])
}
