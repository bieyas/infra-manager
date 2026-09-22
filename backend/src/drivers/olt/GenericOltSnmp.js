import { GenericSnmpDriver } from '../GenericSnmp.js'
import { SnmpClient, OID } from '../../lib/snmpClient.js'

/**
 * GenericOltSnmpDriver — SNMP-based driver for small/budget GPON OLTs.
 *
 * Supports vendors: VSOL, Hioso, HSGQ, C-Data, and other budget OLTs that
 * expose GPON data via SNMP (typically using vendor-private MIBs or
 * semi-standard GPON MIBs).
 *
 * Capabilities:
 *   - All GenericSnmpDriver capabilities (interfaces, resource, neighbors)
 *   - ONU list + status via SNMP walk
 *   - Optical power per ONU (where supported)
 *   - PON port SFP Tx Power (where supported)
 */
export class GenericOltSnmpDriver extends GenericSnmpDriver {
  static get driverName() { return 'Generic OLT (SNMP)' }

  static get capabilities() {
    return {
      ...super.capabilities,
      ontList:    true,
      pontStatus: true,
    }
  }

  // ── Common GPON OIDs (many budget OLTs use similar private MIBs) ────────

  // Override these in vendor subclasses if needed
  get _oids() {
    return {
      // Most budget OLTs use their own enterprise OID tree.
      // These are placeholder patterns; real OIDs depend on vendor.
      // We attempt auto-detection during connect().
      onuState:     null,
      onuSN:        null,
      onuRxPower:   null,
      onuTxPower:   null,
      oltRxPower:   null,
      ponTxPower:   null,
    }
  }

  async connect() {
    await super.connect()
    // Detect vendor-specific OIDs from sysObjectID
    this._vendorOids = await this._detectVendorOids()
  }

  // ── ONU List ────────────────────────────────────────────────────────────────

  async getOnuList() {
    if (!this._vendorOids?.onuState) {
      return { onus: [], note: 'SNMP ONU OIDs not detected for this OLT' }
    }

    const stateRows = await this._snmp.walk(this._vendorOids.onuState).catch(() => [])

    // Also try to get serial numbers
    const snRows = this._vendorOids.onuSN
      ? await this._snmp.walk(this._vendorOids.onuSN).catch(() => [])
      : []
    const snMap = new Map(snRows.map(v => [this._extractIndex(v.oid, this._vendorOids.onuSN), v.value]))

    const onus = stateRows.map(v => {
      const index = this._extractIndex(v.oid, this._vendorOids.onuState)
      return {
        index,
        state:  this._decodeOnuState(v.value),
        online: this._isOnuOnline(v.value),
        sn:     snMap.get(index) || null,
      }
    })

    return { onus, protocol: 'snmp' }
  }

  // ── ONU Power ───────────────────────────────────────────────────────────────

  async getOnuPower(onuIndex) {
    if (!this._vendorOids?.onuRxPower) return null

    const results = {}
    const suffix = `.${onuIndex}`

    if (this._vendorOids.oltRxPower) {
      const val = await this._snmp.getValue(this._vendorOids.oltRxPower + suffix).catch(() => null)
      results.oltRxPower = val != null ? val / 100 : null // Usually in 0.01 dBm units
    }
    if (this._vendorOids.onuTxPower) {
      const val = await this._snmp.getValue(this._vendorOids.onuTxPower + suffix).catch(() => null)
      results.onuTxPower = val != null ? val / 100 : null
    }
    if (this._vendorOids.onuRxPower) {
      const val = await this._snmp.getValue(this._vendorOids.onuRxPower + suffix).catch(() => null)
      results.onuRxPower = val != null ? val / 100 : null
    }

    return results
  }

  // ── PON SFP Tx Power ────────────────────────────────────────────────────────

  async getPonPower(ponPort) {
    if (!this._vendorOids?.ponTxPower) {
      return { ponPort, txPower: null, note: 'SNMP PON power OID not available' }
    }

    const val = await this._snmp.getValue(this._vendorOids.ponTxPower + `.${ponPort}`)
      .catch(() => null)

    return {
      ponPort,
      txPower: val != null ? val / 100 : null,
      protocol: 'snmp',
    }
  }

  async getAllPonPower() {
    if (!this._vendorOids?.ponTxPower) return []

    const rows = await this._snmp.walk(this._vendorOids.ponTxPower).catch(() => [])
    return rows.map(v => ({
      ponPort: this._extractIndex(v.oid, this._vendorOids.ponTxPower),
      txPower: v.value != null ? v.value / 100 : null,
      protocol: 'snmp',
    }))
  }

  // ── PON Ports ───────────────────────────────────────────────────────────────

  async getPonPorts() {
    // Use interface table to identify GPON PON ports (ifType = 250 = gpon)
    const ifaces = await this.getInterfaces()
    const ponIfaces = ifaces.filter(i =>
      i.type === 250 ||                         // IANA ifType gpon
      /^(gpon|pon|GPON)/i.test(i.name) ||
      /^(gpon|pon|GPON)/i.test(i.description)
    )

    // Try to get ONU counts per PON from ONU state data
    const onuData = await this.getOnuList().catch(() => ({ onus: [] }))
    const ponMap = {}
    for (const onu of onuData.onus) {
      // Index format varies; try to extract PON port part
      const ponPart = this._extractPonFromIndex(onu.index)
      if (!ponPart) continue
      if (!ponMap[ponPart]) ponMap[ponPart] = { total: 0, online: 0 }
      ponMap[ponPart].total++
      if (onu.online) ponMap[ponPart].online++
    }

    const ports = ponIfaces.map(i => {
      const stats = ponMap[i.index] || ponMap[i.name] || { total: 0, online: 0 }
      return {
        id:       `gpon-olt_${i.name}`,
        port:     i.name,
        totalOnu:  stats.total,
        onlineOnu: stats.online,
        offlineOnu: stats.total - stats.online,
      }
    })

    const globalOnline = ports.reduce((s, p) => s + p.onlineOnu, 0)
    const globalTotal  = ports.reduce((s, p) => s + p.totalOnu, 0)
    return { ports, globalOnline, globalTotal, protocol: 'snmp' }
  }

  // ── Vendor auto-detection ───────────────────────────────────────────────────

  async _detectVendorOids() {
    const sysObjId = await this._snmp.getValue(OID.sysObjectID).catch(() => '')
    const descr = (this._sysDescr || '').toLowerCase()

    // VSOL
    if (sysObjId?.includes('37950') || descr.includes('vsol')) {
      return {
        onuState:   '1.3.6.1.4.1.37950.1.10.1.1.1.2',
        onuSN:      '1.3.6.1.4.1.37950.1.10.1.1.1.3',
        onuRxPower: '1.3.6.1.4.1.37950.1.10.1.2.1.1.2',
        onuTxPower: '1.3.6.1.4.1.37950.1.10.1.2.1.1.3',
        oltRxPower: '1.3.6.1.4.1.37950.1.10.1.2.1.1.4',
        ponTxPower: '1.3.6.1.4.1.37950.1.10.1.3.1.1.2',
      }
    }

    // Hioso
    if (sysObjId?.includes('17409') || descr.includes('hioso')) {
      return {
        onuState:   '1.3.6.1.4.1.17409.2.3.1.2.1.1.5',
        onuSN:      '1.3.6.1.4.1.17409.2.3.1.2.1.1.3',
        onuRxPower: '1.3.6.1.4.1.17409.2.3.1.2.2.1.2',
        onuTxPower: '1.3.6.1.4.1.17409.2.3.1.2.2.1.3',
        oltRxPower: '1.3.6.1.4.1.17409.2.3.1.2.2.1.4',
        ponTxPower: '1.3.6.1.4.1.17409.2.3.1.1.1.1.8',
      }
    }

    // HSGQ / Syrotech / generic
    if (descr.includes('hsgq') || descr.includes('syrotech')) {
      return {
        onuState:   '1.3.6.1.4.1.17409.2.3.1.2.1.1.5',
        onuSN:      '1.3.6.1.4.1.17409.2.3.1.2.1.1.3',
        onuRxPower: '1.3.6.1.4.1.17409.2.3.1.2.2.1.2',
        onuTxPower: '1.3.6.1.4.1.17409.2.3.1.2.2.1.3',
        oltRxPower: null,
        ponTxPower: null,
      }
    }

    // C-Data
    if (sysObjId?.includes('34592') || descr.includes('c-data')) {
      return {
        onuState:   '1.3.6.1.4.1.34592.1.3.1.4.1.1.2',
        onuSN:      '1.3.6.1.4.1.34592.1.3.1.4.1.1.5',
        onuRxPower: '1.3.6.1.4.1.34592.1.3.1.4.2.1.2',
        onuTxPower: '1.3.6.1.4.1.34592.1.3.1.4.2.1.3',
        oltRxPower: '1.3.6.1.4.1.34592.1.3.1.4.2.1.4',
        ponTxPower: '1.3.6.1.4.1.34592.1.3.1.1.1.1.7',
      }
    }

    // Unknown — return nulls, basic monitoring still works via GenericSnmpDriver
    return { onuState: null, onuSN: null, onuRxPower: null, onuTxPower: null, oltRxPower: null, ponTxPower: null }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _extractIndex(oid, baseOid) {
    const prefix = baseOid.replace(/\.$/, '') + '.'
    return oid.replace(prefix, '')
  }

  _extractPonFromIndex(index) {
    // Index usually has format like ponPort.onuId (e.g. "1.5" = PON 1, ONU 5)
    const parts = index?.split?.('.') || []
    return parts[0] || null
  }

  _decodeOnuState(val) {
    // Common state mapping (varies by vendor)
    const states = {
      1: 'online', 2: 'offline', 3: 'activating', 4: 'deactivating',
      5: 'offline', 6: 'online',
    }
    return states[val] || `unknown(${val})`
  }

  _isOnuOnline(val) {
    return val === 1 || val === 6
  }
}
