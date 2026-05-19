export const EMPTY_FORM = { id: '', name: '', subnet: '', description: '', color: 'neutral' }

export const COLOR_OPTS = ['accent', 'online', 'info', 'warning', 'neutral', 'offline', 'critical']

export const COLOR_CLASS = {
  accent:   'bg-[var(--accent)]',
  online:   'bg-emerald-400',
  info:     'bg-cyan-400',
  warning:  'bg-amber-400',
  neutral:  'bg-slate-400',
  offline:  'bg-red-400',
  critical: 'bg-rose-500',
}

export const INITIAL_VLANS = [
  { id: 1,   name: 'Management', subnet: '10.0.0.0/24',      description: 'Network device management',  color: 'accent'   },
  { id: 10,  name: 'Corporate',  subnet: '10.1.0.0/22',      description: 'End-user corporate network', color: 'online'   },
  { id: 20,  name: 'Servers',    subnet: '10.2.0.0/23',      description: 'Server farm',                color: 'info'     },
  { id: 30,  name: 'Wireless',   subnet: '10.3.0.0/22',      description: 'Wireless client network',    color: 'warning'  },
  { id: 40,  name: 'VoIP',       subnet: '10.4.0.0/24',      description: 'VoIP phones',                color: 'neutral'  },
  { id: 50,  name: 'CCTV',       subnet: '10.5.0.0/24',      description: 'IP camera network',          color: 'neutral'  },
  { id: 99,  name: 'Guest',      subnet: '192.168.100.0/24', description: 'Guest Internet access',      color: 'offline'  },
  { id: 100, name: 'DMZ',        subnet: '172.16.0.0/24',    description: 'Demilitarized zone',         color: 'critical' },
]
