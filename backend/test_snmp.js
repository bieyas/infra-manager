/**
 * test_snmp.js — Script untuk menguji modul SNMP backend secara mandiri.
 *
 * Usage:
 *   node test_snmp.js <ip> [community] [version]
 *
 * Contoh:
 *   node test_snmp.js 192.168.1.1
 *   node test_snmp.js 192.168.1.1 public 2c
 *   node test_snmp.js 192.168.1.1 private 1
 */

import { SnmpClient, OID } from './src/lib/snmpClient.js'
import { GenericSnmpDriver } from './src/drivers/GenericSnmp.js'
import { GenericOltSnmpDriver } from './src/drivers/olt/GenericOltSnmp.js'

const ip        = process.argv[2] || '127.0.0.1'
const community = process.argv[3] || 'public'
const version   = process.argv[4] || '2c'

console.log(`\n========================================`)
console.log(`  SNMP Test — ${ip}  community="${community}"  v${version}`)
console.log(`========================================\n`)

// ── 1. Test SnmpClient primitives ──────────────────────────────────────────

async function testSnmpClient() {
  console.log('[ 1/4 ] SnmpClient — koneksi & GET dasar')
  const client = new SnmpClient(ip, { community, version, timeout: 5000, retries: 1 })

  try {
    // sysDescr
    const descr = await client.getValue(OID.sysDescr)
    if (descr === null) throw new Error('sysDescr mengembalikan null — periksa IP/community/firewall')
    console.log(`  ✓ sysDescr    : ${String(descr).slice(0, 80)}`)

    // sysName + sysUpTime paralel
    const [sysName, uptime] = await Promise.all([
      client.getValue(OID.sysName),
      client.getValue(OID.sysUpTime),
    ])
    console.log(`  ✓ sysName     : ${sysName}`)
    console.log(`  ✓ sysUpTime   : ${uptime} ticks (${uptime ? Math.floor(uptime/100) : 0}s)`)

    // sysObjectID
    const sysOid = await client.getValue(OID.sysObjectID)
    console.log(`  ✓ sysObjectID : ${sysOid}`)
  } finally {
    client.close()
  }
}

// ── 2. Test WALK ifTable ────────────────────────────────────────────────────

async function testWalk() {
  console.log('\n[ 2/4 ] SNMP WALK — ifTable')
  const client = new SnmpClient(ip, { community, version, timeout: 8000 })

  try {
    const rows = await client.table(OID.ifTable)
    const count = Object.keys(rows).length
    if (count === 0) {
      console.log('  ⚠  ifTable kosong (mungkin device tidak support IF-MIB)')
    } else {
      console.log(`  ✓ ${count} interface ditemukan:`)
      for (const [idx, row] of Object.entries(rows).slice(0, 5)) {
        const name   = row['2'] || `if${idx}`
        const admin  = row['7'] === 1 ? 'up' : 'down'
        const oper   = row['8'] === 1 ? 'up' : 'down'
        console.log(`    [${idx}] ${name}  admin=${admin} oper=${oper}`)
      }
      if (count > 5) console.log(`    ... dan ${count - 5} lainnya`)
    }
  } catch (err) {
    console.log(`  ✗ WALK gagal: ${err.message}`)
  } finally {
    client.close()
  }
}

// ── 3. Test GenericSnmpDriver ───────────────────────────────────────────────

async function testGenericDriver() {
  console.log('\n[ 3/4 ] GenericSnmpDriver — getResource() & getInterfaces()')

  const fakeDevice = {
    ip,
    vendor: null,
    type: 'ROUTER',
    model: null,
    snmpVersion: version,
  }

  const driver = new GenericSnmpDriver(fakeDevice, { community })

  try {
    await driver.connect()
    console.log(`  ✓ connect() berhasil — ${driver._sysDescr?.slice(0, 60)}`)

    const status = await driver.getStatus()
    console.log(`  ✓ getStatus()  → sysName="${status.sysName}" uptime=${status.uptimeSeconds}s`)

    const resource = await driver.getResource()
    console.log(`  ✓ getResource() → CPU=${resource.cpuPct}%  RAM=${resource.memoryPct}%`)

    const ifaces = await driver.getInterfaces()
    console.log(`  ✓ getInterfaces() → ${ifaces.length} interface`)
    for (const i of ifaces.slice(0, 3)) {
      console.log(`    - ${i.name}  oper=${i.operStatus}  rx=${i.rxBytes}B tx=${i.txBytes}B`)
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`)
  } finally {
    await driver.disconnect()
    console.log(`  ✓ disconnect() selesai`)
  }
}

// ── 4. Test GenericOltSnmpDriver (OLT-specific) ────────────────────────────

async function testOltDriver() {
  console.log('\n[ 4/4 ] GenericOltSnmpDriver — vendor OID detection & ONU list')

  const fakeDevice = {
    ip,
    vendor: 'vsol',
    type: 'OLT',
    model: null,
    snmpVersion: version,
  }

  const driver = new GenericOltSnmpDriver(fakeDevice, { community })

  try {
    await driver.connect()
    console.log(`  ✓ connect() berhasil`)
    console.log(`  ✓ Vendor OIDs terdeteksi:`)
    const oids = driver._vendorOids
    for (const [k, v] of Object.entries(oids || {})) {
      console.log(`    ${k.padEnd(14)}: ${v || '(null)'}`)
    }

    const onuResult = await driver.getOnuList()
    if (onuResult.note) {
      console.log(`  ⚠  getOnuList(): ${onuResult.note}`)
    } else {
      console.log(`  ✓ getOnuList() → ${onuResult.onus.length} ONU`)
      const online = onuResult.onus.filter(o => o.online).length
      console.log(`    online=${online}  offline=${onuResult.onus.length - online}`)
    }

    const ponResult = await driver.getPonPorts()
    console.log(`  ✓ getPonPorts() → ${ponResult.ports.length} PON port  (total ONU: ${ponResult.globalTotal})`)
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`)
  } finally {
    await driver.disconnect()
    console.log(`  ✓ disconnect() selesai`)
  }
}

// ── Runner ──────────────────────────────────────────────────────────────────

async function main() {
  try {
    await testSnmpClient()
    await testWalk()
    await testGenericDriver()
    await testOltDriver()
    console.log('\n========================================')
    console.log('  Semua test selesai')
    console.log('========================================\n')
  } catch (err) {
    console.error('\n[FATAL]', err.message)
    process.exit(1)
  }
}

main()
