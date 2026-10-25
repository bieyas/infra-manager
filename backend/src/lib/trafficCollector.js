import prisma from './prisma.js'
import { getDirectCustomerTrafficBatch } from './directTraffic.js'
import { createDriver } from '../drivers/registry.js'
import { withDriver } from '../drivers/BaseDriver.js'

const SAMPLE_INTERVAL_MS = 5 * 60 * 1000
const RETENTION_MS = 31 * 24 * 60 * 60 * 1000
let timer
let running = false

// In-memory previous counters for delta calculation
// key: `${deviceId}:${cleanUsername}` -> { rx: Number, tx: Number, at: Number }
const previousCounters = new Map()

async function collectMikrotikTraffic(device, deviceCustomers, sampledAt) {
  const driver = createDriver(device)
  const results = []

  await withDriver(driver, async d => {
    const ifaces = await d._cmd('/interface/print', ['?type=pppoe-in'])
    const ifaceByName = new Map()

    for (const iface of ifaces) {
      const clean = String(iface.name || '').replace(/^<pppoe-|<|>$/gi, '').toLowerCase().trim()
      ifaceByName.set(clean, {
        rx: Number(iface['rx-byte'] || 0),
        tx: Number(iface['tx-byte'] || 0),
      })
    }

    const now = Date.now()
    for (const customer of deviceCustomers) {
      const cleanUser = String(customer.pppoeUsername || '').toLowerCase().trim()
      const current = ifaceByName.get(cleanUser)
      if (!current) continue

      const key = `${device.id}:${cleanUser}`
      const previous = previousCounters.get(key)
      previousCounters.set(key, { ...current, at: now })

      if (previous && now > previous.at) {
        const seconds = (now - previous.at) / 1000
        // Minimum 5 seconds between samples to prevent division by near-zero
        if (seconds >= 5 && current.rx >= previous.rx && current.tx >= previous.tx) {
          const inBps = Math.max(0, ((current.rx - previous.rx) * 8) / seconds)
          const outBps = Math.max(0, ((current.tx - previous.tx) * 8) / seconds)
          results.push({
            customerId: customer.id,
            sampledAt,
            inBps,
            outBps,
          })
        }
      }
    }
  })

  return results
}

async function collectTrafficSamples() {
  if (running) return
  running = true
  try {
    const customers = await prisma.customer.findMany({
      where: { pppoeUsername: { not: null }, connectionSourceDeviceId: { not: null } },
      select: {
        id: true,
        pppoeUsername: true,
        sourceDevice: true,
      },
    })

    const groups = new Map()
    for (const customer of customers) {
      const device = customer.sourceDevice
      if (!device) continue
      const group = groups.get(device.id) || { device, customers: [] }
      group.customers.push({ id: customer.id, pppoeUsername: customer.pppoeUsername })
      groups.set(device.id, group)
    }

    const sampledAt = new Date()
    await Promise.all([...groups.values()].map(async ({ device, customers: deviceCustomers }) => {
      try {
        const isMikrotik = /mikrotik|routeros/i.test(device.vendor || '') || device.mgmtProtocol === 'API'

        let data = []
        if (isMikrotik) {
          data = await collectMikrotikTraffic(device, deviceCustomers, sampledAt)
        } else {
          const results = await getDirectCustomerTrafficBatch({ customers: deviceCustomers, device })
          data = results.filter(result => result.rate).map(result => ({
            customerId: result.customerId,
            sampledAt,
            inBps: result.rate.inBps,
            outBps: result.rate.outBps,
          }))
        }

        if (data.length) {
          await prisma.customerTrafficSample.createMany({ data })
          console.log(`[traffic-sample:${device.name}] Recorded ${data.length} customer traffic samples (${isMikrotik ? 'RouterOS API' : 'SNMP'})`)
        }
      } catch (error) {
        console.error(`[traffic-sample:${device.name}] ${error.message}`)
      }
    }))

    await prisma.customerTrafficSample.deleteMany({
      where: { sampledAt: { lt: new Date(Date.now() - RETENTION_MS) } }
    })
  } finally {
    running = false
  }
}

export function startTrafficCollector() {
  if (timer) return

  // 1. Initial baseline collection
  collectTrafficSamples()
    .then(() => {
      // 2. Prime initial data sample 10 seconds later so charts immediately have data
      setTimeout(() => {
        collectTrafficSamples().catch(e => console.error(`[traffic-sample-prime] ${e.message}`))
      }, 10_000)
    })
    .catch(error => console.error(`[traffic-sample] ${error.message}`))

  // 3. Regular 5-minute interval
  timer = setInterval(() => {
    collectTrafficSamples().catch(error => console.error(`[traffic-sample] ${error.message}`))
  }, SAMPLE_INTERVAL_MS)
  timer.unref?.()
}
