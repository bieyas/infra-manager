import { Server, Shield, Wifi, Router } from 'lucide-react'

export const TYPE_ICON = {
  SWITCH:       Server,
  ROUTER:       Router,
  FIREWALL:     Shield,
  AP:           Wifi,
  OLT:          Server,
  ONU:          Server,
  SERVER:       Server,
  OTHER:        Server,
  // legacy lowercase (mock data)
  switch:       Server,
  router:       Router,
  firewall:     Shield,
  access_point: Wifi,
}

export const TYPE_LABEL = {
  SWITCH:       'Switch',
  ROUTER:       'Router',
  FIREWALL:     'Firewall',
  AP:           'Access Point',
  OLT:          'OLT',
  ONU:          'ONU',
  SERVER:       'Server',
  OTHER:        'Other',
  // legacy lowercase
  switch:       'Switch',
  router:       'Router',
  firewall:     'Firewall',
  access_point: 'Access Point',
}

export const STATUS_FILTERS = ['All', 'Online', 'Warning', 'Offline']

// Human-readable label for normalized status
export const STATUS_LABEL = {
  online:  'Online',
  warning: 'Maintenance',
  offline: 'Offline',
}

export const STATUS_COLOR = {
  online:  { dot: 'online',  badge: 'online',  ring: 'bg-emerald-500/10', icon: 'text-emerald-400' },
  warning: { dot: 'warning', badge: 'warning', ring: 'bg-amber-500/10',   icon: 'text-amber-400'   },
  offline: { dot: 'offline', badge: 'offline', ring: 'bg-slate-500/10',   icon: 'text-slate-400'   },
}
