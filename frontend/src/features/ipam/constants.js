export const STATUS_CFG = {
  used:     { label: 'Used',     color: 'text-cyan-400',    dot: 'online'  },
  free:     { label: 'Free',     color: 'text-emerald-400', dot: 'unknown' },
  reserved: { label: 'Reserved', color: 'text-amber-400',   dot: 'warning' },
}

export const SUBNETS = [
  {
    id: 's1', cidr: '10.0.0.0/24', name: 'Management', vlan: 1,
    total: 254, used: 12, gateway: '10.0.0.1',
    hosts: [
      { ip: '10.0.0.1',  mac: '00:1A:2B:3C:4D:01', hostname: 'Core-SW-01',   status: 'used', type: 'static' },
      { ip: '10.0.0.2',  mac: '00:1A:2B:3C:4D:02', hostname: 'Core-SW-02',   status: 'used', type: 'static' },
      { ip: '10.0.0.10', mac: '00:1A:2B:3C:4D:10', hostname: 'Edge-RTR-01',  status: 'used', type: 'static' },
      { ip: '10.0.0.11', mac: '00:1A:2B:3C:4D:11', hostname: 'Edge-RTR-02',  status: 'used', type: 'static' },
      { ip: '10.0.0.20', mac: '00:1A:2B:3C:4D:20', hostname: 'FW-Primary',   status: 'used', type: 'static' },
      { ip: '10.0.0.21', mac: '00:1A:2B:3C:4D:21', hostname: 'FW-Secondary', status: 'used', type: 'static' },
    ],
  },
  {
    id: 's2', cidr: '10.1.0.0/22', name: 'Corporate', vlan: 10,
    total: 1022, used: 387, gateway: '10.1.0.1',
    hosts: [
      { ip: '10.1.0.1',  mac: '00:AA:BB:CC:00:01', hostname: 'gw-corporate',  status: 'used', type: 'static' },
      { ip: '10.1.1.50', mac: '00:AA:BB:CC:01:50', hostname: 'ws-finance-01', status: 'used', type: 'dhcp'   },
      { ip: '10.1.1.51', mac: '00:AA:BB:CC:01:51', hostname: 'ws-finance-02', status: 'used', type: 'dhcp'   },
      { ip: '10.1.2.80', mac: '00:AA:BB:CC:02:80', hostname: 'ws-dev-05',     status: 'used', type: 'dhcp'   },
      { ip: '10.1.3.10', mac: '',                  hostname: '',               status: 'free', type: ''       },
      { ip: '10.1.3.11', mac: '',                  hostname: '',               status: 'free', type: ''       },
    ],
  },
  {
    id: 's3', cidr: '10.2.0.0/23', name: 'Servers', vlan: 20,
    total: 510, used: 24, gateway: '10.2.0.1',
    hosts: [
      { ip: '10.2.0.1',  mac: '00:CC:DD:EE:00:01', hostname: 'gw-servers',    status: 'used',     type: 'static' },
      { ip: '10.2.0.5',  mac: '00:CC:DD:EE:00:05', hostname: 'srv-web-01',    status: 'used',     type: 'static' },
      { ip: '10.2.0.6',  mac: '00:CC:DD:EE:00:06', hostname: 'srv-web-02',    status: 'used',     type: 'static' },
      { ip: '10.2.0.10', mac: '00:CC:DD:EE:00:10', hostname: 'srv-db-01',     status: 'used',     type: 'static' },
      { ip: '10.2.0.20', mac: '00:CC:DD:EE:00:20', hostname: 'srv-backup-01', status: 'used',     type: 'static' },
      { ip: '10.2.1.50', mac: '',                  hostname: '',               status: 'reserved', type: ''       },
    ],
  },
  {
    id: 's4', cidr: '192.168.100.0/24', name: 'Guest', vlan: 99,
    total: 254, used: 41, gateway: '192.168.100.1',
    hosts: [
      { ip: '192.168.100.1',  mac: '00:FF:EE:DD:00:01', hostname: 'gw-guest', status: 'used', type: 'static' },
      { ip: '192.168.100.10', mac: '00:FF:EE:DD:01:10', hostname: '',         status: 'used', type: 'dhcp'   },
      { ip: '192.168.100.11', mac: '00:FF:EE:DD:01:11', hostname: '',         status: 'used', type: 'dhcp'   },
    ],
  },
]
