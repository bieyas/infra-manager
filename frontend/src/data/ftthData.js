// Standar warna core fiber (Telkom/APJII Indonesia)
// Urutan per tube: Biru, Oranye, Hijau, Coklat, Abu, Putih, Merah, Hitam, Kuning, Violet, Pink, Toska
export const CORE_COLORS = [
  { id: 1,  name: 'Biru',    hex: '#2563eb' },
  { id: 2,  name: 'Oranye',  hex: '#ea580c' },
  { id: 3,  name: 'Hijau',   hex: '#16a34a' },
  { id: 4,  name: 'Coklat',  hex: '#92400e' },
  { id: 5,  name: 'Abu',     hex: '#6b7280' },
  { id: 6,  name: 'Putih',   hex: '#e5e7eb' },
  { id: 7,  name: 'Merah',   hex: '#dc2626' },
  { id: 8,  name: 'Hitam',   hex: '#1f2937' },
  { id: 9,  name: 'Kuning',  hex: '#ca8a04' },
  { id: 10, name: 'Violet',  hex: '#7c3aed' },
  { id: 11, name: 'Pink',    hex: '#db2777' },
  { id: 12, name: 'Toska',   hex: '#0891b2' },
]

// Core assignment: { coreNo, colorId, usedBy (null=available), spliceBox, attenuation, notes }
function makeCore(total) {
  return Array.from({ length: total }, (_, i) => ({
    no:          i + 1,
    colorId:     ((i % 12) + 1),
    usedBy:      null,
    spliceBox:   null,
    attenuation: null,
    notes:       '',
  }))
}

// ─── ODC ────────────────────────────────────────────────────────────────────
export const ODC_LIST = [
  {
    id: 'ODC-001',
    name: 'ODC-001 Pusat',
    type: 'odc',
    parentId: null,
    cableCore: 96,
    cores: makeCore(96),
    lat: -7.2575,
    lng: 112.7521,
    address: 'Jl. Ahmad Yani No.1, Surabaya',
    brand: 'Optix',
    model: 'ODC-96C',
    installDate: '2023-03-15',
    notes: 'ODC utama ring backbone barat',
    status: 'active',
  },
  {
    id: 'ODC-002',
    name: 'ODC-002 Timur',
    type: 'odc',
    parentId: 'ODC-001',
    cableCore: 48,
    cores: makeCore(48),
    lat: -7.2610,
    lng: 112.7580,
    address: 'Jl. Raya Darmo No.45, Surabaya',
    brand: 'FiberHome',
    model: 'ODC-48C',
    installDate: '2023-06-20',
    notes: 'Downline dari ODC-001',
    status: 'active',
  },
  {
    id: 'ODC-003',
    name: 'ODC-003 Barat',
    type: 'odc',
    parentId: 'ODC-001',
    cableCore: 24,
    cores: makeCore(24),
    lat: -7.2540,
    lng: 112.7470,
    address: 'Jl. Basuki Rahmat No.12, Surabaya',
    brand: 'Optix',
    model: 'ODC-24C',
    installDate: '2023-08-10',
    notes: '',
    status: 'active',
  },
]

// ─── ODP ────────────────────────────────────────────────────────────────────
export const ODP_LIST = [
  {
    id: 'ODP-001-01',
    name: 'ODP-001-01',
    type: 'odp',
    parentId: 'ODC-001',
    cableCore: 8,
    cores: makeCore(8),
    lat: -7.2590,
    lng: 112.7500,
    address: 'Gang Mawar No.3, Surabaya',
    brand: 'Huawei',
    model: 'ODP-8C',
    installDate: '2023-09-01',
    notes: '',
    status: 'active',
    capacity: 8,
    used: 5,
  },
  {
    id: 'ODP-001-02',
    name: 'ODP-001-02',
    type: 'odp',
    parentId: 'ODC-001',
    cableCore: 8,
    cores: makeCore(8),
    lat: -7.2565,
    lng: 112.7510,
    address: 'Jl. Kartini No.7, Surabaya',
    brand: 'Huawei',
    model: 'ODP-8C',
    installDate: '2023-09-05',
    notes: '',
    status: 'active',
    capacity: 8,
    used: 3,
  },
  {
    id: 'ODP-002-01',
    name: 'ODP-002-01',
    type: 'odp',
    parentId: 'ODC-002',
    cableCore: 8,
    cores: makeCore(8),
    lat: -7.2625,
    lng: 112.7595,
    address: 'Jl. Pemuda No.22, Surabaya',
    brand: 'ZTE',
    model: 'ODP-8C',
    installDate: '2023-10-12',
    notes: 'Kapasitas hampir penuh',
    status: 'active',
    capacity: 8,
    used: 7,
  },
  {
    id: 'ODP-003-01',
    name: 'ODP-003-01',
    type: 'odp',
    parentId: 'ODC-003',
    cableCore: 4,
    cores: makeCore(4),
    lat: -7.2548,
    lng: 112.7460,
    address: 'Jl. Pahlawan No.5, Surabaya',
    brand: 'Huawei',
    model: 'ODP-4C',
    installDate: '2023-11-01',
    notes: '',
    status: 'active',
    capacity: 4,
    used: 1,
  },
]

// ─── CLOSURE ────────────────────────────────────────────────────────────────
export const CLOSURE_LIST = [
  {
    id: 'CLO-001',
    name: 'Closure-001',
    type: 'closure',
    parentId: 'ODC-001',
    cableCore: 24,
    cores: makeCore(24),
    lat: -7.2558,
    lng: 112.7535,
    address: 'Tiang PLN KM-03 Jl. Ahmad Yani',
    brand: 'Corning',
    model: 'FOSC-400',
    installDate: '2023-07-18',
    notes: 'Splice di tiang sebelum ODC-002',
    status: 'active',
    mountType: 'aerial', // aerial | underground | wall
  },
  {
    id: 'CLO-002',
    name: 'Closure-002',
    type: 'closure',
    parentId: 'ODC-002',
    cableCore: 12,
    cores: makeCore(12),
    lat: -7.2618,
    lng: 112.7570,
    address: 'Man-hole depan SPBU Jl. Darmo',
    brand: 'Furukawa',
    model: 'FOSC-200',
    installDate: '2023-11-20',
    notes: 'Underground, kedalaman 60cm',
    status: 'active',
    mountType: 'underground',
  },
]

// ─── HTB / CONVERTER (Pelanggan) ─────────────────────────────────────────────
export const HTB_LIST = [
  {
    id: 'HTB-0001',
    name: 'HTB-0001',
    type: 'htb',
    parentId: 'ODP-001-01',
    coreNo: 1,
    lat: -7.2592,
    lng: 112.7498,
    address: 'Gang Mawar No.3A, Surabaya',
    customerName: 'Budi Santoso',
    customerId: 'CUST-001',
    serialNo: 'HW-1234567',
    brand: 'Huawei',
    model: 'EG8141A5',
    installDate: '2023-09-10',
    status: 'active',
    notes: '',
  },
  {
    id: 'HTB-0002',
    name: 'HTB-0002',
    type: 'htb',
    parentId: 'ODP-001-01',
    coreNo: 2,
    lat: -7.2594,
    lng: 112.7497,
    address: 'Gang Mawar No.5, Surabaya',
    customerName: 'Siti Rahayu',
    customerId: 'CUST-002',
    serialNo: 'HW-1234568',
    brand: 'Huawei',
    model: 'EG8141A5',
    installDate: '2023-09-11',
    status: 'active',
    notes: '',
  },
  {
    id: 'HTB-0003',
    name: 'HTB-0003',
    type: 'htb',
    parentId: 'ODP-002-01',
    coreNo: 1,
    lat: -7.2628,
    lng: 112.7597,
    address: 'Jl. Pemuda No.22A, Surabaya',
    customerName: 'Ahmad Fauzi',
    customerId: 'CUST-003',
    serialNo: 'ZT-9876543',
    brand: 'ZTE',
    model: 'F673AV9',
    installDate: '2023-10-15',
    status: 'inactive',
    notes: 'ONT mati, menunggu penggantian',
  },
]

// ─── Combined helper ─────────────────────────────────────────────────────────
export const ALL_FTTH = [
  ...ODC_LIST.map(o => ({ ...o, type: 'odc' })),
  ...ODP_LIST.map(o => ({ ...o, type: 'odp' })),
  ...CLOSURE_LIST.map(o => ({ ...o, type: 'closure' })),
  ...HTB_LIST.map(o => ({ ...o, type: 'htb' })),
]

export function getChildren(parentId) {
  return ALL_FTTH.filter(n => n.parentId === parentId)
}

export function getAncestors(id) {
  const result = []
  let current = ALL_FTTH.find(n => n.id === id)
  while (current?.parentId) {
    const parent = ALL_FTTH.find(n => n.id === current.parentId)
    if (!parent) break
    result.unshift(parent)
    current = parent
  }
  return result
}
