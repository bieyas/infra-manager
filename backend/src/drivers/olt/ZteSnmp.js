import { GenericSnmpDriver } from '../GenericSnmp.js'
import { OID } from '../../lib/snmpClient.js'

function _fmtUptime(sec) {
  if (!sec) return '0s'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

/**
 * ZteSnmpDriver — ZTE C300/C320/C600 OLT via SNMP GET (no WALK).
 *
 * Avoids SNMP WALK timeout on ZTE by computing 32-bit port indexes
 * directly and issuing targeted SNMP GET requests per ONU.
 *
 * ZTE 32-bit port index formula:
 *   portIndex = 268500992 + (slot * 256) + port
 *   OID suffix = {portIndex}.{onuId}
 *
 * Private MIB OIDs (ZTE enterprise: 1.3.6.1.4.1.3902):
 *   - ONU name      : 1.3.6.1.4.1.3902.1012.3.28.1.1.3.{portIndex}.{onuId}
 *   - ONU status    : 1.3.6.1.4.1.3902.1012.3.28.2.1.4.{portIndex}.{onuId}
 *   - ONU Rx power  : 1.3.6.1.4.1.3902.1012.3.50.11.1.1.2.{portIndex}.{onuId}
 *   - PON port count: 1.3.6.1.4.1.3902.1012.3.13.1.1.1.{portIndex}
 *   - PON online cnt: 1.3.6.1.4.1.3902.1012.3.13.1.1.4.{portIndex}
 */
export class ZteSnmpDriver extends GenericSnmpDriver {
  static get driverName() { return 'ZTE OLT (SNMP)' }

  static get capabilities() {
    return {
      interfaces:  true,
      ipAddresses: false,
      routes:      false,
      neighbors:   false,
      resource:    true,
      exec:        false,
      ontList:     true,
      ponPorts:    true,
    }
  }

  // ── ZTE private OIDs ──────────────────────────────────────────────────────

  static get _OID() {
    return {
      // ONU table (ZTE C300/C320 private MIB)
      onuName:      '1.3.6.1.4.1.3902.1012.3.28.1.1.3',
      onuStatus:    '1.3.6.1.4.1.3902.1012.3.28.2.1.4',
      // Rx Power: C320 V2.1+ uses 1082 branch; 1012 branch is older firmware
      onuRxPower:   '1.3.6.1.4.1.3902.1082.500.10.2.1.1.3',   // OLT-side Rx from ONU (0.01 dBm)
      onuRxPowerAlt:'1.3.6.1.4.1.3902.1012.3.50.11.1.1.2',    // fallback (older firmware)
      // PON port summary — tested on C320 V2.1.0
      ponTotalOnu:  '1.3.6.1.4.1.3902.1082.500.10.1.1.1',
      ponOnlineOnu: '1.3.6.1.4.1.3902.1082.500.10.1.1.4',
    }
  }

  // ONU phase state decode (ZTE C320)
  static _decodeOnuState(val) {
    const map = {
      1: 'initial',
      2: 'standby',
      3: 'working',
      4: 'dying-gasp',
      5: 'auth-fail',
      6: 'offline',
    }
    return map[val] ?? `unknown(${val})`
  }

  // ── ZTE index formula ─────────────────────────────────────────────────────

  /**
   * Convert slot/port to ZTE 32-bit port index.
   * Formula: 268500992 + (slot * 256) + port
   */
  static portIndex(slot, port) {
    return 268500992 + (slot * 256) + port
  }

  /**
   * Parse a ZTE port index back to { slot, port }.
   * slot = Math.floor((index - 268500992) / 256)
   * port = (index - 268500992) % 256
   */
  static parsePortIndex(index) {
    const offset = index - 268500992
    return { slot: Math.floor(offset / 256), port: offset % 256 }
  }

  // ── Status (override to add formatted uptime) ─────────────────────────────

  async getStatus() {
    const [sysName, sysLocation, sysContact, uptime] = await Promise.all([
      this._snmp.getValue(OID.sysName).catch(() => null),
      this._snmp.getValue('1.3.6.1.2.1.1.6.0').catch(() => null),  // sysLocation
      this._snmp.getValue('1.3.6.1.2.1.1.4.0').catch(() => null),  // sysContact
      this._snmp.getValue(OID.sysUpTime).catch(() => null),
    ])

    const uptimeSeconds = uptime != null ? Math.floor(Number(uptime) / 100) : null

    return {
      sysDescr:      this._sysDescr,
      sysName,
      sysLocation,
      sysContact,
      uptimeSeconds,
      uptime:        uptimeSeconds != null ? _fmtUptime(uptimeSeconds) : null,
      cpuPct:        null,
      memPct:        null,
      protocol:      'snmp',
    }
  }

  // ── SNMP GET helpers ──────────────────────────────────────────────────────

  async _get(oid) {
    return this._snmp.getValue(oid)
  }

  /**
   * GET a single ONU attribute. Returns null silently on error.
   * @param {string} baseOid
   * @param {number} portIndex
   * @param {number} onuId
   */
  async _onuGet(baseOid, portIndex, onuId) {
    return this._snmp.getValue(`${baseOid}.${portIndex}.${onuId}`).catch(() => null)
  }

  // ── PON Port list ─────────────────────────────────────────────────────────

  /**
   * Get summary for all PON ports via targeted SNMP GET (not WALK).
   * Uses device.ponCount from DB to know which slots/ports to query.
   *
   * Port numbering: slot 1, port 1..ponCount
   * (ZTE C320 default: 1 slot, 8 PON ports)
   */
  async getPonPorts() {
    const ponCount = this.device.ponCount || 8
    const slot     = this.device.snmpSlot || 1   // configurable, default slot 1

    const ports = []
    let globalTotal  = 0
    let globalOnline = 0

    await Promise.all(
      Array.from({ length: ponCount }, async (_, i) => {
        const ponPort   = i + 1
        const portIndex = ZteSnmpDriver.portIndex(slot, ponPort)

        const [totalOnu, onlineOnu] = await Promise.all([
          this._snmp.getValue(`${ZteSnmpDriver._OID.ponTotalOnu}.${portIndex}`).catch(() => null),
          this._snmp.getValue(`${ZteSnmpDriver._OID.ponOnlineOnu}.${portIndex}`).catch(() => null),
        ])

        const total   = totalOnu  != null ? Number(totalOnu)  : null
        const online  = onlineOnu != null ? Number(onlineOnu) : null
        const offline = (total != null && online != null) ? total - online : null

        if (total != null) {
          globalTotal  += total
          globalOnline += online ?? 0
        }

        ports.push({
          id:         `gpon-olt_${slot}/1/${ponPort}`,
          port:       `${slot}/1/${ponPort}`,
          portIndex,
          totalOnu:   total   ?? 0,
          onlineOnu:  online  ?? 0,
          offlineOnu: offline ?? 0,
          running:    (online ?? 0) > 0,
        })
      })
    )

    ports.sort((a, b) => a.port.localeCompare(b.port, undefined, { numeric: true }))
    return { ports, globalOnline, globalTotal, protocol: 'snmp' }
  }

  // ── Required by snapshot route: getInterfaces = getPonPorts ──────────────

  async getInterfaces() {
    return this.getPonPorts()
  }

  // ── ONU list on a single PON port ─────────────────────────────────────────

  /**
   * Get all ONUs on a PON port using targeted SNMP GET.
   *
   * @param {string} ponPort — "S/C/P" format e.g. "1/1/1"
   * @param {number} [maxOnu=128] — max ONU ID to probe
   *
   * Strategy: GET ONU status for IDs 1..maxOnu in parallel batches.
   * Skip any that return null (not registered).
   */
  async getOnuList(ponPort = '1/1/1', maxOnu = 128) {
    const { slot, port } = this._parsePonPort(ponPort)
    const portIndex      = ZteSnmpDriver.portIndex(slot, port)

    // Phase 1: Probe all ONU status IDs in one parallel batch
    const statusResults = await Promise.all(
      Array.from({ length: maxOnu }, async (_, i) => {
        const onuId = i + 1
        const val   = await this._onuGet(ZteSnmpDriver._OID.onuStatus, portIndex, onuId)
        return val != null ? { onuId, statusRaw: Number(val) } : null
      })
    )

    // Filter registered ONUs (those with a status response)
    const registered = statusResults.filter(Boolean)

    if (registered.length === 0) return []

    // Phase 2: Fetch name + Rx power for registered ONUs only
    const onus = await Promise.all(
      registered.map(async ({ onuId, statusRaw }) => {
        const [name, rxRaw] = await Promise.all([
          this._onuGet(ZteSnmpDriver._OID.onuName, portIndex, onuId),
          this._fetchRxPower(portIndex, onuId),
        ])

        const statusStr = ZteSnmpDriver._decodeOnuState(statusRaw)
        return {
          index:      `${slot}/1/${port}:${onuId}`,
          port:       `${slot}/1/${port}`,
          onuId,
          portIndex,
          status:     statusStr,
          phaseState: statusStr,   // alias — frontend OnuRow uses onu.phaseState
          statusRaw,
          online:     statusRaw === 3,  // 3 = working
          sn:         null,             // not available via standard SNMP on C320
          name:       name ? String(name).trim() || null : null,
          rxPower:    this._decodeRxPower(rxRaw),
          protocol:   'snmp',
        }
      })
    )

    return onus.sort((a, b) => a.onuId - b.onuId)
  }

  // ── Rx Power with primary + fallback OID ─────────────────────────────────

  async _fetchRxPower(portIndex, onuId) {
    let val = await this._snmp.getValue(
      `${ZteSnmpDriver._OID.onuRxPower}.${portIndex}.${onuId}`
    ).catch(() => null)
    if (val == null || Number(val) === 0) {
      val = await this._snmp.getValue(
        `${ZteSnmpDriver._OID.onuRxPowerAlt}.${portIndex}.${onuId}`
      ).catch(() => null)
    }
    return val
  }

  // ── ONU detail (single ONU) ───────────────────────────────────────────────

  /**
   * Get detail for one ONU.
   * @param {string} onuIndex — "S/C/P:ID" format e.g. "1/1/1:5"
   */
  async getOnuDetail(onuIndex) {
    const { slot, port, onuId } = this._parseOnuIndex(onuIndex)
    const portIndex = ZteSnmpDriver.portIndex(slot, port)

    const [statusRaw, name, rxRaw] = await Promise.all([
      this._onuGet(ZteSnmpDriver._OID.onuStatus, portIndex, onuId),
      this._onuGet(ZteSnmpDriver._OID.onuName,   portIndex, onuId),
      this._fetchRxPower(portIndex, onuId),
    ])

    const status = statusRaw != null ? ZteSnmpDriver._decodeOnuState(Number(statusRaw)) : null

    const rxPower = this._decodeRxPower(rxRaw)
    return {
      index:      onuIndex,
      port:       `${slot}/1/${port}`,
      onuId,
      portIndex,
      status,
      phaseState: status,   // alias for frontend compatibility
      statusRaw:  statusRaw != null ? Number(statusRaw) : null,
      online:     statusRaw === 3,
      name:       name ? String(name).trim() || null : null,
      rxPower,
      protocol:   'snmp',
    }
  }

  // ── ONU optical power (same as detail, separate method for API compat) ────

  async getOnuPower(onuIndex) {
    const { slot, port, onuId } = this._parseOnuIndex(onuIndex)
    const portIndex = ZteSnmpDriver.portIndex(slot, port)

    const rxRaw  = await this._fetchRxPower(portIndex, onuId)
    const rxPower = this._decodeRxPower(rxRaw)

    // Return shape expected by frontend OnuDetailDrawer:
    //   power.oltRxPower  — OLT receives from ONU (upstream Rx) = our rxPower
    //   power.onuTxPower  — ONU transmit power (not available via SNMP on C320)
    //   power.onuRxPower  — ONU downstream Rx (not available)
    //   power.oltTxPower  — OLT downstream Tx (not available)
    return {
      onuIndex,
      protocol:    'snmp',
      oltRxPower:  rxPower,   // upstream — best data we have
      onuTxPower:  null,
      onuRxPower:  null,
      oltTxPower:  null,
      upAtten:     null,
      downAtten:   null,
      rxPower,                // raw alias
    }
  }

  // ── PON SFP Power ─────────────────────────────────────────────────────────
  // ZTE C320 does not expose SFP Tx power via standard SNMP MIBs.
  // Return null gracefully so frontend shows "N/A" instead of error.

  async getPonPower(ponPort = '1/1/1') {
    return { ponPort, txPower: null, protocol: 'snmp', note: 'SFP Tx power not available via SNMP' }
  }

  async getAllPonPower() {
    const ponCount = this.device.ponCount || 8
    const slot     = this.device.snmpSlot || 1
    return Array.from({ length: ponCount }, (_, i) => ({
      ponPort:  `${slot}/1/${i + 1}`,
      txPower:  null,
      protocol: 'snmp',
    }))
  }

  // ── Resource ──────────────────────────────────────────────────────────────
  // ZTE C320 V2.1.0 does not expose CPU/memory via SNMP (private OIDs not responding).
  // Only uptime is available via standard sysUpTime.

  async getResource() {
    const uptimeTicks = await this._snmp.getValue('1.3.6.1.2.1.1.3.0').catch(() => null)
    const uptimeSeconds = uptimeTicks != null ? Math.floor(Number(uptimeTicks) / 100) : null
    return {
      cpuPct:       null,
      memoryPct:    null,
      totalMemory:  null,
      freeMemory:   null,
      uptimeSeconds,
      uptime:       uptimeSeconds != null ? _fmtUptime(uptimeSeconds) : null,
      protocol:     'snmp',
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  /**
   * Decode ZTE Rx power value.
   * ZTE encodes as signed integer in 0.01 dBm units.
   * Value 0 = not available (ONU offline or no reading).
   */
  _decodeRxPower(val) {
    if (val == null) return null
    const raw = Number(val)
    if (raw === 0) return null
    return Math.round(raw / 100 * 100) / 100  // 2 decimal places in dBm
  }

  /**
   * Parse "S/C/P" or "S/P" format into { slot, port }.
   * Handles both "1/1/1" (slot/card/port) and "1/1" (slot/port).
   */
  _parsePonPort(str) {
    const parts = String(str).split('/')
    if (parts.length === 3) {
      return { slot: Number(parts[0]), port: Number(parts[2]) }
    }
    if (parts.length === 2) {
      return { slot: Number(parts[0]), port: Number(parts[1]) }
    }
    return { slot: 1, port: Number(parts[0]) || 1 }
  }

  /**
   * Parse "S/C/P:ID" ONU index into { slot, port, onuId }.
   * Example: "1/1/1:5" → { slot: 1, port: 1, onuId: 5 }
   */
  _parseOnuIndex(str) {
    const [portPart, onuIdStr] = String(str).split(':')
    const { slot, port } = this._parsePonPort(portPart)
    return { slot, port, onuId: Number(onuIdStr) }
  }
}
