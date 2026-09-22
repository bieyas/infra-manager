import { MikrotikDriver }       from './mikrotik/mikrotikDriver.js'
import { HuaweiOltDriver }      from './olt/HuaweiOlt.js'
import { ZteOltDriver }         from './olt/ZteOlt.js'
import { ZteSnmpDriver }        from './olt/ZteSnmp.js'
import { GenericSshDriver }     from './GenericSsh.js'
import { GenericSnmpDriver }    from './GenericSnmp.js'
import { GenericOltSnmpDriver } from './olt/GenericOltSnmp.js'
import { VsolHttpDriver }      from './olt/VsolHttp.js'
import { decrypt }              from '../lib/crypto.js'

/**
 * Driver registry — maps { type, vendor, model } to a Driver class.
 *
 * Resolution order (most specific → least specific):
 *   1. vendor + model (exact, case-insensitive)
 *   2. vendor         (case-insensitive prefix/contains match)
 *   3. type           (ROUTER, OLT, SWITCH, …)
 *   4. generic SSH    (fallback)
 */

// ── Static rules ─────────────────────────────────────────────────────────────

/** vendor → driver class */
const BY_VENDOR = new Map([
  ['mikrotik', MikrotikDriver],
  ['routeros', MikrotikDriver],
  ['zte',      ZteOltDriver],
  ['zxan',     ZteOltDriver],
  ['huawei',   HuaweiOltDriver],
])

/** vendor+type → driver class */
const BY_VENDOR_TYPE = new Map([
  ['huawei:OLT',     HuaweiOltDriver],
  ['zte:OLT',        ZteOltDriver],
  ['zxan:OLT',       ZteOltDriver],
  ['fiberhome:OLT',  GenericSshDriver],
  ['vsol:OLT',       VsolHttpDriver],
  ['hioso:OLT',      GenericOltSnmpDriver],
  ['hsgq:OLT',       GenericOltSnmpDriver],
  ['syrotech:OLT',   GenericOltSnmpDriver],
  ['c-data:OLT',     GenericOltSnmpDriver],
])

/** type → driver class (fallback per-type) */
const BY_TYPE = new Map([
  ['OLT',    ZteOltDriver],   // default OLT → ZTE (most common in this network)
  ['ONU',    GenericSshDriver],
  ['ROUTER', GenericSshDriver],
  ['SWITCH', GenericSshDriver],
])

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the best driver class for a device.
 * @param {object} device — Prisma Device record
 * @returns {typeof import('./BaseDriver.js').BaseDriver}
 */
export function resolveDriverClass(device) {
  const vendor   = device.vendor?.toLowerCase()?.trim()       || ''
  const type     = device.type?.toUpperCase()?.trim()         || ''
  const model    = device.model?.toLowerCase()?.trim()        || ''
  const protocol = device.mgmtProtocol?.toUpperCase()?.trim() || ''

  // 0. ZTE + SNMP protocol → always use ZteSnmpDriver (avoids Telnet WALK timeout)
  if ((vendor === 'zte' || vendor === 'zxan') && type === 'OLT' && protocol === 'SNMP') {
    return ZteSnmpDriver
  }

  // 1. vendor + type
  if (vendor) {
    const vendorType = `${vendor}:${type}`.toLowerCase()
    for (const [key, Cls] of BY_VENDOR_TYPE) {
      if (vendorType.startsWith(key.toLowerCase())) return Cls
    }
  }

  // 2. vendor alone
  if (vendor) {
    for (const [key, Cls] of BY_VENDOR) {
      if (vendor.includes(key)) return Cls
    }
  }

  // 3. type alone
  if (type && BY_TYPE.has(type)) return BY_TYPE.get(type)

  // 4. ultimate fallback — prefer SNMP if device has community configured
  return GenericSshDriver
}

/**
 * Instantiate a driver for the given device, decrypting credentials.
 * @param {object} device — full Prisma Device record (with mgmtPassword, snmpCommunity)
 * @returns {import('./BaseDriver.js').BaseDriver}
 */
export function createDriver(device) {
  const DriverClass = resolveDriverClass(device)

  const password  = device.mgmtPassword  ? safeDecrypt(device.mgmtPassword)  : null
  const community = device.snmpCommunity ? safeDecrypt(device.snmpCommunity) : null

  return new DriverClass(device, { password, community })
}

function safeDecrypt(val) {
  try { return decrypt(val) } catch (_) { return null }
}

/**
 * Return driver metadata for a device (no connection, no decryption).
 * Safe to return to the frontend.
 */
export function driverInfo(device) {
  const Cls = resolveDriverClass(device)
  return {
    driverName:   Cls.driverName,
    capabilities: Cls.capabilities,
  }
}
