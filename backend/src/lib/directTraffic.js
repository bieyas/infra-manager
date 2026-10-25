import { SnmpClient, OID } from './snmpClient.js'
import { decrypt } from './crypto.js'

const counters = new Map()
const unavailableUntil = new Map()
const interfaceMaps = new Map()
const interfaceMapLoads = new Map()
const INTERFACE_CACHE_MS = 60_000
const SNMP_GET_BATCH_SIZE = 20

function normalize(value) {
  return String(value || '').trim().replace(/^<|>$/g, '').replace(/^pppoe-/i, '').toLowerCase()
}

function resolveSnmpHost(device) {
  if (device.ip === '172.16.33.1') return '160.22.31.13'
  return device.ip
}

function communityOf(device) {
  if (!device.snmpCommunity) return 'public'
  try { return decrypt(device.snmpCommunity) } catch {
    throw new Error('SNMP community credential is invalid')
  }
}

async function walkColumn(client, baseOid, version) {
  const prefix = `${baseOid}.`
  if (['1', 'v1'].includes(String(version || '').toLowerCase())) {
    return (await client.walk(baseOid)).filter(item => item.oid.startsWith(prefix))
  }

  const results = []
  let cursor = baseOid
  for (let batch = 0; batch < 1000; batch += 1) {
    const items = await client.getBulk([cursor], { maxRepetitions: 20 })
    if (!items.length) break
    let lastOid = cursor
    for (const item of items) {
      if (!item.oid.startsWith(prefix) || item.oid === lastOid) return results
      results.push(item)
      lastOid = item.oid
    }
    if (lastOid === cursor) break
    cursor = lastOid
  }
  return results
}

async function readInterfaceMap(client, version) {
  const descriptions = await walkColumn(client, OID.ifDescr, version)
  const statuses = await walkColumn(client, OID.ifOperStatus, version)
  const names = await walkColumn(client, OID.ifName, version).catch(() => [])
  const aliases = await walkColumn(client, OID.ifAlias, version).catch(() => [])
  const readColumn = (items, baseOid) => new Map(items.map(item => [item.oid.slice(baseOid.length + 1), item.value]))
  const descriptionByIndex = readColumn(descriptions, OID.ifDescr)
  const statusByIndex = readColumn(statuses, OID.ifOperStatus)
  const nameByIndex = readColumn(names, OID.ifName)
  const aliasByIndex = readColumn(aliases, OID.ifAlias)
  const indexes = new Set([...descriptionByIndex.keys(), ...nameByIndex.keys(), ...aliasByIndex.keys()])
  const interfaces = new Map()
  for (const index of indexes) {
    const description = descriptionByIndex.get(index) || ''
    const entry = {
      index,
      name: nameByIndex.get(index) || description,
      description,
      alias: aliasByIndex.get(index) || description,
      operStatus: Number(statusByIndex.get(index)) === 1 ? 'up' : 'down',
      ifIndex: Number(index),
    }
    for (const value of [entry.name, entry.description, entry.alias]) {
      const key = normalize(value)
      if (key && !interfaces.has(key)) interfaces.set(key, entry)
    }
  }
  return interfaces
}

async function getInterfaceMap(device) {
  const key = device.id || device.ip
  const cached = interfaceMaps.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.interfaces
  const existingLoad = interfaceMapLoads.get(key)
  if (existingLoad) return existingLoad

  const load = (async () => {
    const client = new SnmpClient(resolveSnmpHost(device), {
      community: communityOf(device),
      version: device.snmpVersion || '2c',
      port: device.snmpPort || 161,
      timeout: 5000,
      retries: 0,
    })
    try {
      const interfaces = await readInterfaceMap(client, device.snmpVersion)
      interfaceMaps.set(key, { interfaces, expiresAt: Date.now() + INTERFACE_CACHE_MS })
      return interfaces
    } finally {
      client.close()
    }
  })()
  interfaceMapLoads.set(key, load)
  try {
    return await load
  } finally {
    if (interfaceMapLoads.get(key) === load) interfaceMapLoads.delete(key)
  }
}

export async function findCustomerInterfaces({ usernames, device }) {
  if (!Array.isArray(usernames) || !device?.ip) return []
  const interfaces = await getInterfaceMap(device)
  return usernames.map(username => interfaces.get(normalize(username)) || null)
}

export async function findCustomerInterface({ username, device }) {
  if (!username || !device?.ip) return null
  const [entry] = await findCustomerInterfaces({ usernames: [username], device })
  return entry || null
}

async function getOidValues(client, oids) {
  const values = new Map()
  for (let offset = 0; offset < oids.length; offset += SNMP_GET_BATCH_SIZE) {
    const result = await client.get(oids.slice(offset, offset + SNMP_GET_BATCH_SIZE))
    for (const item of Array.isArray(result) ? result : [result]) {
      if (item) values.set(item.oid, item.value)
    }
  }
  return values
}

export async function getDirectCustomerTrafficBatch({ customers, device }) {
  if (!customers?.length || !device?.ip) return []
  const unavailableKey = device.id || device.ip
  if ((unavailableUntil.get(unavailableKey) || 0) > Date.now()) {
    return customers.map(customer => ({ customerId: customer.id, interfaceFound: false, rate: null }))
  }

  let client
  try {
    const mappings = await findCustomerInterfaces({ usernames: customers.map(customer => customer.pppoeUsername), device })
    const matched = customers.map((customer, index) => ({ customer, mapping: mappings[index] }))
    const interfaces = [...new Map(matched.filter(item => item.mapping)
      .map(item => [item.mapping.ifIndex, item.mapping])).values()]
    if (!interfaces.length) {
      return matched.map(({ customer }) => ({ customerId: customer.id, interfaceFound: false, rate: null }))
    }

    client = new SnmpClient(resolveSnmpHost(device), {
      community: communityOf(device),
      version: device.snmpVersion || '2c',
      port: device.snmpPort || 161,
      timeout: 2000,
      retries: 0,
    })
    const indexes = interfaces.map(entry => entry.ifIndex)
    const highInOids = indexes.map(index => `${OID.ifHCInOctets}.${index}`)
    const highOutOids = indexes.map(index => `${OID.ifHCOutOctets}.${index}`)
    const values = await getOidValues(client, [...highInOids, ...highOutOids])
    const fallbackOids = []
    for (const index of indexes) {
      if (values.get(`${OID.ifHCInOctets}.${index}`) == null) fallbackOids.push(`${OID.ifInOctets}.${index}`)
      if (values.get(`${OID.ifHCOutOctets}.${index}`) == null) fallbackOids.push(`${OID.ifOutOctets}.${index}`)
    }
    if (fallbackOids.length) {
      for (const [oid, value] of await getOidValues(client, fallbackOids)) values.set(oid, value)
    }

    const now = Date.now()
    const rates = new Map()
    for (const index of indexes) {
      const inValue = values.get(`${OID.ifHCInOctets}.${index}`) ?? values.get(`${OID.ifInOctets}.${index}`)
      const outValue = values.get(`${OID.ifHCOutOctets}.${index}`) ?? values.get(`${OID.ifOutOctets}.${index}`)
      if (inValue == null || outValue == null) continue
      const key = `${device.id || device.ip}:${index}`
      const current = { in: Number(inValue), out: Number(outValue), at: now }
      const previous = counters.get(key)
      counters.set(key, current)
      if (!previous || current.at <= previous.at) continue
      const seconds = (current.at - previous.at) / 1000
      rates.set(index, {
        timestamp: new Date(current.at),
        inBps: Math.max(0, ((current.in - previous.in) * 8) / seconds),
        outBps: Math.max(0, ((current.out - previous.out) * 8) / seconds),
        ifIndex: index,
      })
    }
    return matched.map(({ customer, mapping }) => ({
      customerId: customer.id,
      interfaceFound: Boolean(mapping),
      rate: mapping ? rates.get(mapping.ifIndex) || null : null,
    }))
  } catch (error) {
    unavailableUntil.set(unavailableKey, Date.now() + 30_000)
    throw error
  } finally {
    client?.close()
  }
}

export async function getDirectCustomerTraffic({ username, device, ifIndex }) {
  if (!username || !device?.ip) return null
  const unavailableKey = device.id || device.ip
  if ((unavailableUntil.get(unavailableKey) || 0) > Date.now()) return { unavailable: true }
  let client
  try {
    let selectedIfIndex = ifIndex
    if (!selectedIfIndex) {
      const entry = await findCustomerInterface({ username, device })
      selectedIfIndex = entry?.ifIndex
    }
    if (!selectedIfIndex) return null

    client = new SnmpClient(resolveSnmpHost(device), {
      community: communityOf(device),
      version: device.snmpVersion || '2c',
      port: device.snmpPort || 161,
      timeout: 2000,
      retries: 0,
    })

    const [inCounter, outCounter] = await Promise.all([
      client.getValue(`${OID.ifHCInOctets}.${selectedIfIndex}`).catch(() => null),
      client.getValue(`${OID.ifHCOutOctets}.${selectedIfIndex}`).catch(() => null),
    ])
    const [inFallback, outFallback] = await Promise.all([
      inCounter == null
        ? client.getValue(`${OID.ifInOctets}.${selectedIfIndex}`).catch(() => null)
        : null,
      outCounter == null
        ? client.getValue(`${OID.ifOutOctets}.${selectedIfIndex}`).catch(() => null)
        : null,
    ])
    const current = {
      in: Number(inCounter ?? inFallback ?? 0),
      out: Number(outCounter ?? outFallback ?? 0),
      at: Date.now(),
    }
    const key = `${device.id || device.ip}:${selectedIfIndex}`
    const previous = counters.get(key)
    counters.set(key, current)
    if (!previous || current.at <= previous.at) return null

    const seconds = (current.at - previous.at) / 1000
    return {
      timestamp: new Date(current.at),
      inBps: Math.max(0, ((current.in - previous.in) * 8) / seconds),
      outBps: Math.max(0, ((current.out - previous.out) * 8) / seconds),
      ifIndex: Number(selectedIfIndex),
    }
  } catch (error) {
    unavailableUntil.set(unavailableKey, Date.now() + 30_000)
    return { unavailable: true, error: error.message }
  } finally {
    client?.close()
  }
}