import snmp from 'net-snmp'

/**
 * SnmpClient — thin Promise wrapper around net-snmp.
 *
 * Usage:
 *   const client = new SnmpClient('192.168.1.1', { community: 'public' })
 *   const uptime = await client.get('1.3.6.1.2.1.1.3.0')
 *   const ifTable = await client.walk('1.3.6.1.2.1.2.2.1')
 *   client.close()
 */
export class SnmpClient {
  /**
   * @param {string} host
   * @param {object} opts
   * @param {string} [opts.community='public'] — SNMPv1/v2c community string
   * @param {string} [opts.version='2c']       — '1', '2c', or '3'
   * @param {number} [opts.port=161]
   * @param {number} [opts.timeout=5000]       — per-request timeout in ms
   * @param {number} [opts.retries=1]
   */
  constructor(host, opts = {}) {
    this.host = host
    const ver = (opts.version ?? '2c').toString()
    const snmpVer =
      ver === '1'  ? snmp.Version1  :
      ver === '3'  ? snmp.Version3  :
                     snmp.Version2c

    this._session = snmp.createSession(host, opts.community || 'public', {
      port:    opts.port    ?? 161,
      timeout: opts.timeout ?? 5000,
      retries: opts.retries ?? 1,
      version: snmpVer,
    })
  }

  // ── Primitives ──────────────────────────────────────────────────────────────

  /** SNMP GET — single or multiple OIDs */
  get(oids) {
    const list = Array.isArray(oids) ? oids : [oids]
    return new Promise((resolve, reject) => {
      this._session.get(list, (err, varbinds) => {
        if (err) return reject(err)
        if (!Array.isArray(varbinds)) return resolve([])
        const results = varbinds.map(v => ({
          oid:   v.oid,
          type:  v.type,
          value: this._decodeValue(v),
        }))
        resolve(list.length === 1 ? results[0] : results)
      })
    })
  }

  /** SNMP GET single OID, return raw decoded value */
  async getValue(oid) {
    const r = await this.get(oid)
    return r?.value ?? null
  }

  /** SNMP WALK — returns array of { oid, type, value } */
  walk(baseOid) {
    return new Promise((resolve, reject) => {
      const results = []
      this._session.walk(baseOid, 20, (varbinds) => {
        for (const v of varbinds) {
          results.push({
            oid:   v.oid,
            type:  v.type,
            value: this._decodeValue(v),
          })
        }
      }, (err) => {
        if (err) return reject(err)
        resolve(results)
      })
    })
  }

  /** SNMP GETBULK — faster than walk for large tables */
  getBulk(oids, { nonRepeaters = 0, maxRepetitions = 20 } = {}) {
    const list = Array.isArray(oids) ? oids : [oids]
    return new Promise((resolve, reject) => {
      this._session.getBulk(list, nonRepeaters, maxRepetitions, (err, varbinds) => {
        if (err) return reject(err)
        const results = (varbinds || []).flat().map(v => ({
          oid:   v.oid,
          type:  v.type,
          value: this._decodeValue(v),
        }))
        resolve(results)
      })
    })
  }

  /** SNMP TABLE — walk a table OID and return rows keyed by index */
  async table(baseOid) {
    const varbinds = await this.walk(baseOid)
    const rows = {}
    const prefix = baseOid.replace(/\.$/, '') + '.'
    for (const v of varbinds) {
      // OID format: baseOid.column.index...
      const suffix = v.oid.replace(prefix, '')
      const dotPos = suffix.indexOf('.')
      if (dotPos < 0) continue
      const column = suffix.substring(0, dotPos)
      const index  = suffix.substring(dotPos + 1)
      if (!rows[index]) rows[index] = { _index: index }
      rows[index][column] = v.value
    }
    return rows
  }

  close() {
    if (this._session) {
      try { this._session.close() } catch (_) {}
      this._session = null
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _decodeValue(varbind) {
    if (snmp.isVarbindError(varbind)) return null

    switch (varbind.type) {
      case snmp.ObjectType.OctetString:
        return varbind.value.toString()
      case snmp.ObjectType.Integer:
      case snmp.ObjectType.Counter:
      case snmp.ObjectType.Counter32:
      case snmp.ObjectType.Gauge:
      case snmp.ObjectType.Gauge32:
      case snmp.ObjectType.TimeTicks:
      case snmp.ObjectType.Integer32:
      case snmp.ObjectType.Unsigned32:
        return Number(varbind.value)
      case snmp.ObjectType.Counter64:
        // net-snmp returns Buffer for Counter64
        if (Buffer.isBuffer(varbind.value)) {
          const buf = varbind.value
          if (buf.length === 8) {
            try { return Number(buf.readBigUInt64BE()) } catch (_) {}
          }
          // Partial buffer — read as big-endian unsigned integer
          let n = BigInt(0)
          for (let i = 0; i < buf.length; i++) n = (n << BigInt(8)) | BigInt(buf[i])
          return Number(n)
        }
        return Number(varbind.value)
      case snmp.ObjectType.OID:
        return varbind.value
      case snmp.ObjectType.IpAddress:
        return varbind.value.toString()
      case snmp.ObjectType.Opaque:
        return varbind.value.toString('hex')
      case snmp.ObjectType.Null:
      case snmp.ObjectType.NoSuchObject:
      case snmp.ObjectType.NoSuchInstance:
      case snmp.ObjectType.EndOfMibView:
        return null
      default:
        return varbind.value?.toString?.() ?? null
    }
  }
}

// ── Well-known OIDs ──────────────────────────────────────────────────────────

export const OID = {
  // System
  sysDescr:     '1.3.6.1.2.1.1.1.0',
  sysObjectID:  '1.3.6.1.2.1.1.2.0',
  sysUpTime:    '1.3.6.1.2.1.1.3.0',
  sysContact:   '1.3.6.1.2.1.1.4.0',
  sysName:      '1.3.6.1.2.1.1.5.0',
  sysLocation:  '1.3.6.1.2.1.1.6.0',

  // Interface table (ifTable)
  ifTable:       '1.3.6.1.2.1.2.2.1',
  ifIndex:       '1.3.6.1.2.1.2.2.1.1',
  ifDescr:       '1.3.6.1.2.1.2.2.1.2',
  ifType:        '1.3.6.1.2.1.2.2.1.3',
  ifSpeed:       '1.3.6.1.2.1.2.2.1.5',
  ifAdminStatus: '1.3.6.1.2.1.2.2.1.7',
  ifOperStatus:  '1.3.6.1.2.1.2.2.1.8',

  // Extended interface table (ifXTable) — 64-bit counters
  ifXTable:      '1.3.6.1.2.1.31.1.1.1',
  ifName:        '1.3.6.1.2.1.31.1.1.1.1',
  ifHCInOctets:  '1.3.6.1.2.1.31.1.1.1.6',
  ifHCOutOctets: '1.3.6.1.2.1.31.1.1.1.10',
  ifHighSpeed:   '1.3.6.1.2.1.31.1.1.1.15',
  ifAlias:       '1.3.6.1.2.1.31.1.1.1.18',

  // IP Net-to-Media (ARP table)
  ipNetToMedia:  '1.3.6.1.2.1.4.22.1',

  // HOST-RESOURCES — CPU
  hrProcessorLoad: '1.3.6.1.2.1.25.3.3.1.2',

  // HOST-RESOURCES — Storage (memory, disk)
  hrStorageTable:     '1.3.6.1.2.1.25.2.3.1',
  hrStorageDescr:     '1.3.6.1.2.1.25.2.3.1.3',
  hrStorageAllocationUnits: '1.3.6.1.2.1.25.2.3.1.4',
  hrStorageSize:      '1.3.6.1.2.1.25.2.3.1.5',
  hrStorageUsed:      '1.3.6.1.2.1.25.2.3.1.6',

  // ── Mikrotik private ──
  mtik: {
    pppoeActive: '1.3.6.1.4.1.14988.1.1.5',   // PPP active sessions
  },

  // ── ZTE GPON private ──
  zte: {
    onuState:   '1.3.6.1.4.1.3902.1082.500.10.2.2.5.1',
    onuRxPower: '1.3.6.1.4.1.3902.1082.500.10.2.3.4.1.2',
    onuTxPower: '1.3.6.1.4.1.3902.1082.500.10.2.3.4.1.3',
    ponTxPower: '1.3.6.1.4.1.3902.1082.500.10.2.3.1.1.5',
  },
}
