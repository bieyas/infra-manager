import { BaseDriver } from './BaseDriver.js'
import { SnmpClient, OID } from '../lib/snmpClient.js'

/**
 * GenericSnmpDriver — SNMP-only driver for devices without SSH/API support.
 *
 * Uses standard MIBs (RFC 1213, HOST-RESOURCES, IF-MIB) to retrieve:
 *   - System info (uptime, name, description)
 *   - Resource usage (CPU, memory)
 *   - Interface list with traffic counters
 *   - ARP table
 */
export class GenericSnmpDriver extends BaseDriver {
  static get driverName() { return 'Generic SNMP' }

  static get capabilities() {
    return {
      interfaces:  true,
      ipAddresses: false,
      routes:      false,
      neighbors:   true,   // ARP table via SNMP
      resource:    true,
      exec:        false,
    }
  }

  constructor(device, opts) {
    super(device, opts)
    this._snmp = null
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect() {
    this._snmp = new SnmpClient(this.device.ip, {
      community: this.community || 'public',
      version:   this.device.snmpVersion || '2c',
      timeout:   5000,
      retries:   1,
    })
    // Verify connectivity by fetching sysDescr
    const descr = await this._snmp.getValue(OID.sysDescr)
    if (descr === null) throw new Error('SNMP: no response from device')
    this.connected = true
    this._sysDescr = descr
  }

  async disconnect() {
    if (this._snmp) this._snmp.close()
    this._snmp = null
    this.connected = false
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async getStatus() {
    const [sysName, uptime] = await Promise.all([
      this._snmp.getValue(OID.sysName),
      this._snmp.getValue(OID.sysUpTime),
    ])

    return {
      sysDescr:      this._sysDescr,
      sysName:       sysName,
      uptimeSeconds: uptime ? Math.floor(uptime / 100) : null, // TimeTicks → seconds
      protocol:      'snmp',
    }
  }

  // ── Resource (CPU + Memory) ────────────────────────────────────────────────

  async getResource() {
    const [cpuLoads, storageRows] = await Promise.all([
      this._snmp.walk(OID.hrProcessorLoad).catch(() => []),
      this._getStorage(),
    ])

    // CPU: average all processor loads
    const cpuValues = cpuLoads.map(v => v.value).filter(v => typeof v === 'number')
    const cpuPct = cpuValues.length > 0
      ? Math.round(cpuValues.reduce((s, v) => s + v, 0) / cpuValues.length)
      : null

    // Memory: find "Physical Memory" or "RAM" entry
    const mem = storageRows.find(s =>
      /physical|real|ram/i.test(s.descr)
    ) || storageRows[0]

    const memTotal = mem ? mem.size * mem.units : null
    const memUsed  = mem ? mem.used * mem.units : null
    const memPct   = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : null

    // Uptime
    const uptime = await this._snmp.getValue(OID.sysUpTime).catch(() => null)

    return {
      cpuPct,
      memoryPct:    memPct,
      memoryTotal:  memTotal,
      memoryUsed:   memUsed,
      uptimeSeconds: uptime ? Math.floor(uptime / 100) : null,
      protocol:     'snmp',
    }
  }

  // ── Interfaces ─────────────────────────────────────────────────────────────

  async getInterfaces() {
    // Fetch ifTable + ifXTable in parallel
    const [ifRows, ifXRows] = await Promise.all([
      this._snmp.table(OID.ifTable),
      this._snmp.table(OID.ifXTable).catch(() => ({})),
    ])

    const interfaces = []
    for (const [idx, row] of Object.entries(ifRows)) {
      const xrow = ifXRows[idx] || {}
      const speed = xrow['15']         // ifHighSpeed (Mbps)
        ? Number(xrow['15']) * 1_000_000
        : Number(row['5'] || 0)         // ifSpeed (bps)

      interfaces.push({
        index:       Number(row['1'] ?? idx),
        name:        xrow['1'] || row['2'] || `if${idx}`,  // ifName || ifDescr
        description: xrow['18'] || row['2'] || '',          // ifAlias || ifDescr
        type:        Number(row['3'] ?? 0),                  // ifType (IANA)
        speed,
        adminStatus: row['7'] === 1 ? 'up' : 'down',        // 1=up, 2=down
        operStatus:  row['8'] === 1 ? 'up' : 'down',
        rxBytes:     Number(xrow['6']  ?? 0),                // ifHCInOctets
        txBytes:     Number(xrow['10'] ?? 0),                // ifHCOutOctets
      })
    }

    return interfaces.sort((a, b) => a.index - b.index)
  }

  // ── Neighbors (ARP table) ──────────────────────────────────────────────────

  async getNeighbors() {
    const rows = await this._snmp.walk(OID.ipNetToMedia).catch(() => [])
    const entries = {}

    for (const v of rows) {
      // OID: .1.3.6.1.2.1.4.22.1.<column>.<ifIndex>.<ipAddr>
      const parts = v.oid.split('.')
      const col   = parts[parts.length - 6] // column number
      const key   = parts.slice(-5).join('.') // ifIndex.ipAddr

      if (!entries[key]) entries[key] = {}

      if (col === '2')      entries[key].mac = this._formatMac(v.value)
      else if (col === '3') entries[key].ip  = v.value
      else if (col === '1') entries[key].ifIndex = v.value
    }

    return Object.values(entries).filter(e => e.ip)
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  async _getStorage() {
    const rows = await this._snmp.table(OID.hrStorageTable).catch(() => ({}))
    return Object.values(rows).map(r => ({
      descr: r['3'] || '',
      units: Number(r['4'] || 1),
      size:  Number(r['5'] || 0),
      used:  Number(r['6'] || 0),
    }))
  }

  _formatMac(val) {
    if (!val) return null
    // OctetString: might be raw bytes or hex string
    if (Buffer.isBuffer(val) || (typeof val === 'string' && val.length === 6)) {
      const buf = Buffer.isBuffer(val) ? val : Buffer.from(val, 'binary')
      return [...buf].map(b => b.toString(16).padStart(2, '0')).join(':')
    }
    // Already formatted
    if (typeof val === 'string' && val.includes(':')) return val.toLowerCase()
    return val?.toString?.() ?? null
  }
}
