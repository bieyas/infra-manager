import prisma from './prisma.js'
import { getDirectCustomerTrafficBatch } from './directTraffic.js'

const SAMPLE_INTERVAL_MS = 5 * 60 * 1000
const RETENTION_MS = 31 * 24 * 60 * 60 * 1000
let timer
let running = false

async function collectTrafficSamples() {
  if (running) return
  running = true
  try {
    const customers = await prisma.customer.findMany({
      where: { pppoeUsername: { not: null }, connectionSourceDeviceId: { not: null } },
      select: {
        id: true,
        pppoeUsername: true,
        sourceDevice: { select: { id: true, name: true, ip: true, mgmtPort: true, snmpCommunity: true, snmpVersion: true } },
      },
    })
    const groups = new Map()
    for (const customer of customers) {
      const device = customer.sourceDevice
      const group = groups.get(device.id) || { device, customers: [] }
      group.customers.push({ id: customer.id, pppoeUsername: customer.pppoeUsername })
      groups.set(device.id, group)
    }

    const sampledAt = new Date()
    await Promise.all([...groups.values()].map(async ({ device, customers: deviceCustomers }) => {
      try {
        const results = await getDirectCustomerTrafficBatch({ customers: deviceCustomers, device })
        const data = results.filter(result => result.rate).map(result => ({
          customerId: result.customerId,
          sampledAt,
          inBps: result.rate.inBps,
          outBps: result.rate.outBps,
        }))
        if (data.length) await prisma.customerTrafficSample.createMany({ data })
        if (results.length && results.every(result => !result.interfaceFound)) {
          console.warn(`[traffic-sample:${device.name}] no PPPoE interfaces matched (${deviceCustomers.length} customers)`)
        }
      } catch (error) {
        console.error(`[traffic-sample:${device.name}] ${error.message}`)
      }
    }))
    await prisma.customerTrafficSample.deleteMany({ where: { sampledAt: { lt: new Date(Date.now() - RETENTION_MS) } } })
  } finally {
    running = false
  }
}

export function startTrafficCollector() {
  if (timer) return
  collectTrafficSamples().catch(error => console.error(`[traffic-sample] ${error.message}`))
  timer = setInterval(() => collectTrafficSamples().catch(error => console.error(`[traffic-sample] ${error.message}`)), SAMPLE_INTERVAL_MS)
  timer.unref?.()
}