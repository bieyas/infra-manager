import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // ── Users ──────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('admin1234', 12)
  await prisma.user.upsert({
    where:  { username: 'admin' },
    update: {},
    create: { username: 'admin', name: 'Administrator', passwordHash: adminHash, role: 'ADMIN' },
  })

  const techHash = await bcrypt.hash('teknisi1234', 12)
  await prisma.user.upsert({
    where:  { username: 'teknisi' },
    update: {},
    create: { username: 'teknisi', name: 'Teknisi NOC', passwordHash: techHash, role: 'TECHNICIAN' },
  })

  const viewerHash = await bcrypt.hash('viewer1234', 12)
  await prisma.user.upsert({
    where:  { username: 'viewer' },
    update: {},
    create: { username: 'viewer', name: 'Viewer', passwordHash: viewerHash, role: 'VIEWER' },
  })

  console.log('✅ Users seeded')

  // ── VLANs ──────────────────────────────────────────────────────────────────
  const vlans = await prisma.$transaction([
    prisma.vlan.upsert({ where: { vid: 1 },   update: {}, create: { vid: 1,   name: 'Management',  color: '#00cbca', status: 'ACTIVE' } }),
    prisma.vlan.upsert({ where: { vid: 10 },  update: {}, create: { vid: 10,  name: 'Data',        color: '#8b5cf6', status: 'ACTIVE' } }),
    prisma.vlan.upsert({ where: { vid: 20 },  update: {}, create: { vid: 20,  name: 'Voice',       color: '#f59e0b', status: 'ACTIVE' } }),
    prisma.vlan.upsert({ where: { vid: 100 }, update: {}, create: { vid: 100, name: 'Internet',    color: '#34d399', status: 'ACTIVE' } }),
    prisma.vlan.upsert({ where: { vid: 200 }, update: {}, create: { vid: 200, name: 'CCTV',        color: '#f87171', status: 'ACTIVE' } }),
  ])
  console.log('✅ VLANs seeded')

  // ── Devices ────────────────────────────────────────────────────────────────
  const router1 = await prisma.device.upsert({
    where:  { ip: '192.168.1.1' },
    update: {},
    create: { name: 'Core-Router-01', ip: '192.168.1.1', type: 'ROUTER', vendor: 'MikroTik', model: 'CCR2004', location: 'DC-Rack-A1', status: 'ACTIVE', cpuPct: 12, memPct: 34 },
  })
  const sw1 = await prisma.device.upsert({
    where:  { ip: '192.168.1.2' },
    update: {},
    create: { name: 'Dist-SW-01', ip: '192.168.1.2', type: 'SWITCH', vendor: 'Cisco', model: 'C9300-48P', location: 'DC-Rack-A2', status: 'ACTIVE', cpuPct: 8, memPct: 22 },
  })
  const olt1 = await prisma.device.upsert({
    where:  { ip: '192.168.2.1' },
    update: {},
    create: { name: 'OLT-Surabaya-01', ip: '192.168.2.1', type: 'OLT', vendor: 'Huawei', model: 'MA5800-X7', location: 'POP-Surabaya', status: 'ACTIVE', cpuPct: 24, memPct: 45 },
  })

  console.log('✅ Devices seeded')

  // ── Alerts ─────────────────────────────────────────────────────────────────
  await prisma.alert.createMany({
    skipDuplicates: true,
    data: [
      { deviceId: olt1.id, severity: 'CRITICAL', message: 'OLT port 0/1/0 link down', detail: 'Loss of signal on GPON port' },
      { deviceId: sw1.id,  severity: 'WARNING',  message: 'High CPU utilization >80%', detail: 'CPU sustained at 84% for 5 minutes' },
      { deviceId: router1.id, severity: 'INFO',  message: 'BGP peer 203.0.113.1 state changed', detail: 'Peer transitioned to Established' },
    ],
  })
  console.log('✅ Alerts seeded')

  // ── Subnets ────────────────────────────────────────────────────────────────
  const subnet10 = await prisma.subnet.upsert({
    where:  { cidr: '10.0.0.0/8' },
    update: {},
    create: { cidr: '10.0.0.0/8', description: 'Internal Network' },
  })
  const subnet192 = await prisma.subnet.upsert({
    where:  { cidr: '192.168.0.0/16' },
    update: {},
    create: { cidr: '192.168.0.0/16', description: 'Management Range', parentId: subnet10.id },
  })
  await prisma.subnet.upsert({
    where:  { cidr: '192.168.1.0/24' },
    update: {},
    create: { cidr: '192.168.1.0/24', description: 'Core Devices', parentId: subnet192.id, vlanId: vlans[0].id },
  })
  console.log('✅ Subnets seeded')

  // ── FTTH Nodes ─────────────────────────────────────────────────────────────
  await prisma.ftthNode.upsert({
    where:  { id: 'ODC-001' },
    update: {},
    create: {
      id: 'ODC-001', name: 'ODC Pusat Surabaya', type: 'ODC',
      lat: -7.2575, lng: 112.7521,
      address: 'Jl. Ahmad Yani No.1, Surabaya',
      status: 'ACTIVE', cableCore: 48, brand: 'Huawei',
    },
  })
  await prisma.ftthNode.upsert({
    where:  { id: 'ODP-001' },
    update: {},
    create: {
      id: 'ODP-001', name: 'ODP Rungkut 01', type: 'ODP',
      parentId: 'ODC-001',
      lat: -7.3105, lng: 112.7672,
      address: 'Jl. Rungkut Industri, Surabaya',
      status: 'ACTIVE', cableCore: 8, capacity: 8, used: 3,
    },
  })
  await prisma.ftthNode.upsert({
    where:  { id: 'HTB-001' },
    update: {},
    create: {
      id: 'HTB-001', name: 'HTB Pelanggan 001', type: 'HTB',
      parentId: 'ODP-001',
      lat: -7.3120, lng: 112.7680,
      address: 'Jl. Rungkut Asri No.5, Surabaya',
      status: 'ACTIVE', coreNo: 1, customerName: 'Budi Santoso', customerId: 'CUST-001',
    },
  })
  console.log('✅ FTTH nodes seeded')

  console.log('\n🎉 Seed complete!')
  console.log('   admin    / admin1234    (ADMIN)')
  console.log('   teknisi  / teknisi1234  (TECHNICIAN)')
  console.log('   viewer   / viewer1234   (VIEWER)')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
