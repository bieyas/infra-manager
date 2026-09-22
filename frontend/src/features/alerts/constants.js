import { AlertTriangle, XCircle, Info } from 'lucide-react'

export const SEV_CONFIG = {
  critical: { icon: XCircle,       color: 'text-rose-400',  border: 'border-rose-500/20',  bg: 'bg-rose-500/5',  badge: 'critical' },
  warning:  { icon: AlertTriangle, color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5', badge: 'warning'  },
  info:     { icon: Info,          color: 'text-sky-400',   border: 'border-sky-500/20',   bg: 'bg-sky-500/5',   badge: 'info'     },
  // uppercase variants (from API)
  CRITICAL: { icon: XCircle,       color: 'text-rose-400',  border: 'border-rose-500/20',  bg: 'bg-rose-500/5',  badge: 'critical' },
  WARNING:  { icon: AlertTriangle, color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/5', badge: 'warning'  },
  INFO:     { icon: Info,          color: 'text-sky-400',   border: 'border-sky-500/20',   bg: 'bg-sky-500/5',   badge: 'info'     },
}

export const ALERT_FILTERS = ['All', 'Critical', 'Warning', 'Info', 'Acknowledged']
