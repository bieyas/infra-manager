import React, { createContext, useContext, useState } from 'react'
import { ALERTS } from '../data/mockData'

const AlertsContext = createContext()

export function AlertsProvider({ children }) {
  const [alerts, setAlerts] = useState(ALERTS)

  const ack   = id => setAlerts(prev => prev.map(a => a.id === id ? { ...a, ack: true }  : a))
  const unack = id => setAlerts(prev => prev.map(a => a.id === id ? { ...a, ack: false } : a))
  const ackAll = () => setAlerts(prev => prev.map(a => ({ ...a, ack: true })))

  const unackedCount = alerts.filter(a => !a.ack).length
  const criticalCount = alerts.filter(a => !a.ack && a.severity === 'critical').length

  return (
    <AlertsContext.Provider value={{ alerts, ack, unack, ackAll, unackedCount, criticalCount }}>
      {children}
    </AlertsContext.Provider>
  )
}

export const useAlerts = () => useContext(AlertsContext)
