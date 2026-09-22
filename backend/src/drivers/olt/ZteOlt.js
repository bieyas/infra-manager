import { TelnetDriver } from '../TelnetDriver.js'

/**
 * ZteOltDriver — ZTE C300/C320/C600 series OLT via Telnet (ZXAN CLI).
 *
 * Parsers verified against real ZTE C320 output.
 * ALL commands are READ-ONLY (show/display only — no config changes).
 *
 * CLI modes:
 *   ZXAN>  — user exec (limited)
 *   ZXAN#  — privileged exec (all show commands available here)
 *
 * Key commands:
 *   show gpon onu state [gpon-olt_S/C/P]   → ONU phase state per port
 *   show gpon onu baseinfo gpon-olt_S/C/P  → SN + type per ONU
 *   show gpon onu detail-info gpon-onu_S/C/P:ID → full ONU info
 *   show pon power attenuation gpon-onu_S/C/P:ID → optical power
 *   show gpon onu by sn <SN>               → find ONU index by SN
 *   show mac gpon onu gpon-onu_S/C/P:ID   → MAC address of ONU
 */
export class ZteOltDriver extends TelnetDriver {
  static get driverName() { return 'ZTE OLT (ZXAN)' }

  static get capabilities() {
    return {
      interfaces:  true,
      ipAddresses: false,
      routes:      false,
      neighbors:   false,
      resource:    true,
      exec:        true,
      ontList:     true,
      ponPorts:    true,
      boards:      false,
    }
  }

  // ── ZTE ZXAN prompt patterns ──────────────────────────────────────────────
  // After login lands at ZXAN# (privileged) directly on this device
  get promptRegex()      { return /\w[\w\-()]*[#>]\s*$/ }
  get loginPromptRegex() { return /[Uu]sername\s*[:][ ]*$|[Ll]ogin\s*[:][ ]*$/ }
  get passPromptRegex()  { return /[Pp]assword\s*[:][ ]*$/ }
  get moreRegex()        { return /----\s*[Mm]ore\s*----|--\s*[Mm]ore\s*--/ }
  get moreResponse()     { return ' ' }

  // ── Resource / Status ─────────────────────────────────────────────────────

  /**
   * getResource() — parses 'show version' for board/version/uptime info.
   * ZTE C300/C320 output:
   *   Product name: ZTE C320
   *   Software Version: V2.1.0P1T6
   *   Hardware Version: V2.0
   *   Uptime: 12 days, 3 hours, 45 minutes
   */
  async getResource() {
    const out = await this.runCommand('show version', 20_000)
    return this._parseVersion(out)
  }

  /**
   * getStatus() — quick summary from 'show gpon onu state' global count.
   */
  async getStatus() {
    try {
      const out    = await this.runCommand('show gpon onu state', 45_000)
      const m      = out.match(/ONU Number:\s*(\d+)\/(\d+)/i)
      const online = m ? Number(m[1]) : null
      const total  = m ? Number(m[2]) : null
      return { platform: 'ZTE OLT', onuOnline: online, onuTotal: total }
    } catch {
      return { platform: 'ZTE OLT' }
    }
  }

  // ── Public READ-ONLY methods ───────────────────────────────────────────────

  /**
   * BaseDriver: getInterfaces() — returns PON port list with ONU counts.
   * Uses: show gpon onu state gpon-olt_1/1/1
   */
  async getInterfaces() {
    return this.getPonPorts()
  }

  /**
   * PON port summary — auto-discovers ALL PON ports on the OLT.
   * Uses: show gpon onu state (no port filter) → groups by S/C/P.
   * Also parses the summary line "ONU Number: X/Y" for cross-check.
   */
  async getPonPorts() {
    const out  = await this.runCommand('show gpon onu state', 45_000)
    const onus = this._parseOnuState(out)

    // Parse global summary line: "ONU Number: 168/291"
    const summaryMatch = out.match(/ONU Number:\s*(\d+)\/(\d+)/i)
    const globalOnline = summaryMatch ? Number(summaryMatch[1]) : null
    const globalTotal  = summaryMatch ? Number(summaryMatch[2]) : null

    // Group by port (S/C/P part before the colon)
    const ports = {}
    for (const o of onus) {
      const key = o.port
      if (!ports[key]) ports[key] = { port: key, total: 0, online: 0, offline: 0 }
      ports[key].total++
      if (o.phaseState === 'working') ports[key].online++
      else ports[key].offline++
    }

    const portList = Object.values(ports)
      .sort((a, b) => a.port.localeCompare(b.port, undefined, { numeric: true }))
      .map(p => ({
        id:         `gpon-olt_${p.port}`,
        port:       p.port,
        totalOnu:   p.total,
        onlineOnu:  p.online,
        offlineOnu: p.offline,
        running:    p.online > 0,
      }))

    return { ports: portList, globalOnline, globalTotal }
  }

  /**
   * ONU list on a specific PON port.
   * @param {string} ponPort — e.g. "1/1/1"
   * Merges state + baseinfo for SN data.
   */
  async getOnuList(ponPort = '1/1/1') {
    // Sequential — single Telnet session cannot handle concurrent commands
    const stateOut = await this.runCommand(`show gpon onu state gpon-olt_${ponPort}`)
    const baseOut  = await this.runCommand(`show gpon onu baseinfo gpon-olt_${ponPort}`)
    const states = this._parseOnuState(stateOut)
    const bases  = this._parseOnuBaseinfo(baseOut)

    // Merge by onuIndex
    const baseMap = {}
    for (const b of bases) baseMap[b.index] = b

    return states.map(s => ({
      index:       s.index,          // "1/1/1:1"
      port:        s.port,           // "1/1/1"
      onuId:       s.onuId,          // 1
      adminState:  s.adminState,     // "enable"
      omccState:   s.omccState,      // "enable"|"disable"
      phaseState:  s.phaseState,     // "working"|"OffLine"|...
      online:      s.phaseState === 'working',
      name:        s.name,
      sn:          baseMap[s.index]?.sn          || null,
      type:        baseMap[s.index]?.type        || null,
      authMode:    baseMap[s.index]?.authMode    || null,
      cfgState:    baseMap[s.index]?.cfgState    || null,
    }))
  }

  /**
   * SFP transceiver Tx Power for a PON port.
   * @param {string} ponPort — e.g. "1/1/1"
   * @returns {{ ponPort, txPower, rxPower, temperature, voltage, biasCurrent }}
   */
  async getPonPower(ponPort = '1/1/1') {
    const out = await this.runCommand(`show pon power attenuation gpon-olt_${ponPort}`)
    return { ponPort, ...this._parsePonSfpPower(out) }
  }

  /**
   * SFP Tx Power for ALL PON ports in one session.
   * Returns array of { port, txPower } for each port.
   */
  async getAllPonPower() {
    const { ports } = await this.getPonPorts()
    const results = []
    for (const p of ports) {
      try {
        const power = await this.getPonPower(p.port)
        results.push(power)
      } catch { results.push({ ponPort: p.port, txPower: null }) }
    }
    return results
  }

  /**
   * Full detail for one ONU.
   * @param {string} onuIndex — e.g. "1/1/1:1"
   */
  async getOnuDetail(onuIndex) {
    const out = await this.runCommand(`show gpon onu detail-info gpon-onu_${onuIndex}`, 25_000)
    return this._parseOnuDetail(out)
  }

  /**
   * Optical power (attenuation) for one ONU.
   * @param {string} onuIndex — e.g. "1/1/1:1"
   */
  async getOnuPower(onuIndex) {
    const out = await this.runCommand(`show pon power attenuation gpon-onu_${onuIndex}`)
    return this._parseOnuPower(out)
  }

  /**
   * Find ONU index by serial number.
   * @param {string} sn — e.g. "ZTEGCBDF65CD"
   * @returns {string|null} — e.g. "1/1/1:74"
   */
  async findOnuBySn(sn) {
    const out = await this.runCommand(`show gpon onu by sn ${sn}`)
    // Output: "gpon-onu_1/1/1:74"
    const m = out.match(/gpon-onu_([\d/]+:\d+)/)
    return m ? m[1] : null
  }

  /**
   * MAC address(es) of an ONU.
   * @param {string} onuIndex — e.g. "1/1/1:1"
   */
  async getOnuMac(onuIndex) {
    const out = await this.runCommand(`show mac gpon onu gpon-onu_${onuIndex}`)
    return this._parseMacTable(out)
  }

  /**
   * exec() — arbitrary read-only command for Console tab.
   * Rejects config-altering keywords as safety guard.
   */
  async exec(cmd) {
    const forbidden = /^\s*(configure|config|no\s|interface\s|shutdown|reboot|reload|write|copy|delete|reset)/i
    if (forbidden.test(cmd)) {
      throw new Error('Config commands are not allowed via exec. Use read-only show commands.')
    }
    return this.runCommand(cmd)
  }

  // ── Parsers ───────────────────────────────────────────────────────────────

  /**
   * Parse: show version
   *
   * ZTE C320 real output:
   *   Product name: ZTE C320
   *   Software Version: V2.1.0P1T6
   *   Hardware Version: V2.0
   *   BOOT  Version  : V5.0.0
   *   Uptime: 12 days, 3 hours, 45 minutes
   *   System MacAddress: xx:xx:xx:xx:xx:xx
   */
  _parseVersion(raw) {
    const get = (patterns) => {
      for (const p of (Array.isArray(patterns) ? patterns : [patterns])) {
        const m = raw.match(p)
        if (m) return m[1]?.trim() || null
      }
      return null
    }
    const product  = get(/Product\s+name\s*[:\-]\s*(.+)/i)
    const swVer    = get(/Software\s+Version\s*[:\-]\s*(\S+)/i)
    const hwVer    = get(/Hardware\s+Version\s*[:\-]\s*(\S+)/i)
    const uptimeRaw = get(/Uptime\s*[:\-]\s*(.+)/i)

    // Parse uptime to seconds: "12 days, 3 hours, 45 minutes"
    let uptimeSeconds = null
    if (uptimeRaw) {
      const d = parseInt(uptimeRaw.match(/(\d+)\s+day/i)?.[1]  || 0)
      const h = parseInt(uptimeRaw.match(/(\d+)\s+hour/i)?.[1] || 0)
      const m = parseInt(uptimeRaw.match(/(\d+)\s+min/i)?.[1]  || 0)
      const s = parseInt(uptimeRaw.match(/(\d+)\s+sec/i)?.[1]  || 0)
      uptimeSeconds = d * 86400 + h * 3600 + m * 60 + s
    }

    return {
      platform:       product ?? 'ZTE OLT',
      boardName:      product ?? null,
      version:        swVer   ?? null,
      hwVersion:      hwVer   ?? null,
      uptime:         uptimeRaw ?? null,
      uptimeSeconds:  uptimeSeconds,
      // ZTE OLT has no CPU/memory via Telnet 'show version'
      cpuLoad:        null,
      totalMemory:    null,
      freeMemory:     null,
    }
  }

  /**
   * Parse: show gpon onu state [gpon-olt_S/C/P]
   *
   * Real output format:
   *   OnuIndex   Admin State  OMCC State  Phase State  Channel
   *   -------------------------------------------------------
   *   1/1/1:1    enable       enable      working      1(GPON)
   *   1/1/1:10   enable       disable     OffLine      1(GPON)
   */
  _parseOnuState(raw) {
    const onus  = []
    const lines = raw.split('\n')
    for (const line of lines) {
      // Match: "1/1/1:1   enable   enable   working   1(GPON)"
      // or full prefix: "gpon-onu_1/1/1:1  ..."
      const m = line.match(/(?:gpon-onu_)?([\d/]+):(\d+)\s+(enable|disable)\s+(enable|disable)\s+(\S+)/)
      if (!m) continue
      onus.push({
        index:      `${m[1]}:${m[2]}`,
        port:       m[1],
        onuId:      Number(m[2]),
        adminState: m[3],
        omccState:  m[4],
        phaseState: m[5],   // "working" | "OffLine" | "StandBy" etc.
      })
    }
    return onus
  }

  /**
   * Parse: show gpon onu baseinfo gpon-olt_S/C/P
   *
   * Real output format:
   *   OnuIndex            Type  Mode  AuthInfo                 State
   *   ---------------------------------------------------------------
   *   gpon-onu_1/1/1:1    ALL   sn    SN:ZTEGCC576835         ready
   *   gpon-onu_1/1/1:3    ALL   sn    SN:ZTEGC85C105D         ready
   */
  _parseOnuBaseinfo(raw) {
    const result = []
    const lines  = raw.split('\n')
    for (const line of lines) {
      const m = line.match(/gpon-onu_([\d/]+:\d+)\s+(\S+)\s+(\S+)\s+SN:(\S+)\s+(\S+)/)
      if (!m) continue
      result.push({
        index:    m[1],
        type:     m[2],
        authMode: m[3],
        sn:       m[4],
        cfgState: m[5],
      })
    }
    return result
  }

  /**
   * Parse: show gpon onu detail-info gpon-onu_S/C/P:ID
   *
   * Real output (key fields):
   *   ONU interface:   gpon-onu_1/1/1:1
   *   Name:            Saleh
   *   Type:            ALL
   *   Phase state:     working
   *   Admin state:     enable
   *   Serial number:   ZTEGCC576835
   *   Description:     4/1/2026 ODP-2
   *   ONU Distance:    507m
   *   Online Duration: 27h 50m 09s
   */
  _parseOnuDetail(raw) {
    const get = (patterns) => {
      for (const p of (Array.isArray(patterns) ? patterns : [patterns])) {
        const m = raw.match(p)
        if (m) return m[1]?.trim() || null
      }
      return null
    }
    return {
      raw,
      index:          get(/ONU interface:\s*([\S]+)/i),
      name:           get(/^\s*Name:\s*(.+)/im),
      type:           get(/^\s*Type:\s*(.+)/im),
      phaseState:     get(/^\s*Phase state:\s*(.+)/im),
      adminState:     get(/^\s*Admin state:\s*(.+)/im),
      configState:    get(/^\s*Config state:\s*(.+)/im),
      sn:             get(/^\s*Serial number:\s*(\S+)/im),
      description:    get(/^\s*Description:\s*(.+)/im),
      distance:       get(/^\s*ONU Distance:\s*(\S+)/im),
      onlineDuration: get(/^\s*Online Duration:\s*(.+)/im),
      lineProfile:    get(/^\s*Line Profile:\s*(.+)/im),
      serviceProfile: get(/^\s*Service Profile:\s*(.+)/im),
      vportMode:      get(/^\s*Vport mode:\s*(.+)/im),
    }
  }

  /**
   * Parse: show pon power attenuation gpon-olt_S/C/P
   *
   * Real output formats (ZTE):
   *   OLT Tx optical power(dBm): 6.496
   * OR (same tabular format as ONU but for port-level):
   *   down  Tx :6.496(dbm)
   */
  _parsePonSfpPower(raw) {
    // Format 1: "OLT Tx optical power(dBm): 6.496"
    const txMatch = raw.match(/(?:OLT\s+)?Tx\s+optical\s+power\s*\(?\s*dBm\s*\)?\s*[:=]\s*([-\d.]+)/i)
    if (txMatch) {
      return { txPower: parseFloat(txMatch[1]) }
    }
    // Format 2: Tabular "down  Tx :6.496(dbm)" — OLT downstream Tx = SFP Tx power
    const downLine = raw.match(/down\s+(.+)/i)?.[1] || ''
    const txFromTable = downLine.match(/Tx\s*[: ]+([-\d.]+)\s*\(dbm\)/i)
    if (txFromTable) {
      return { txPower: parseFloat(txFromTable[1]) }
    }
    // Format 3: generic "Tx Power" or "Transmit Power"
    const txGeneric = raw.match(/(?:Tx|Transmit)\s*(?:Power|power)\s*[:(=]\s*([-\d.]+)/i)
    if (txGeneric) {
      return { txPower: parseFloat(txGeneric[1]) }
    }
    return { txPower: null }
  }

  /**
   * Parse: show pon power attenuation gpon-onu_S/C/P:ID
   *
   * Real output:
   *         OLT                  ONU        Attenuation
   *   up    Rx :-28.856(dbm)    Tx:2.310(dbm)    31.166(dB)
   *   down  Tx :6.496(dbm)      Rx:-23.666(dbm)  30.162(dB)
   */
  _parseOnuPower(raw) {
    const getDbm = (label, text) => {
      const m = text.match(new RegExp(`${label}\\s*[: ]+([\\-\\d.]+)\\s*\\(dbm\\)`, 'i'))
      return m ? parseFloat(m[1]) : null
    }
    const getDb = (text) => {
      const m = text.match(/([\d.]+)\s*\(dB\)/i)
      return m ? parseFloat(m[1]) : null
    }
    const upLine   = raw.match(/up\s+(.+)/i)?.[1]   || ''
    const downLine = raw.match(/down\s+(.+)/i)?.[1] || ''
    return {
      raw,
      // OLT receives from ONU (upstream)
      oltRxPower:  getDbm('Rx', upLine),    // OLT upstream Rx
      onuTxPower:  getDbm('Tx', upLine),    // ONU upstream Tx
      upAtten:     getDb(upLine),
      // OLT transmits to ONU (downstream)
      oltTxPower:  getDbm('Tx', downLine),  // OLT downstream Tx
      onuRxPower:  getDbm('Rx', downLine),  // ONU downstream Rx
      downAtten:   getDb(downLine),
    }
  }

  /**
   * Parse: show mac gpon onu gpon-onu_S/C/P:ID
   *
   * Real output:
   *   d4b7.096f.8f71   1601  Dynamic   gpon-onu_1/1/1:1  vport 1
   */
  _parseMacTable(raw) {
    const macs  = []
    const lines = raw.split('\n')
    for (const line of lines) {
      // MAC format: d4b7.096f.8f71
      const m = line.match(/([0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4})\s+(\d+)\s+(\S+)/i)
      if (!m) continue
      macs.push({
        mac:   m[1].replace(/\./g, '').replace(/(.{2})(?=.)/g, '$1:'), // normalize to xx:xx:xx:xx:xx:xx
        vlan:  Number(m[2]),
        type:  m[3],
      })
    }
    return macs
  }
}
