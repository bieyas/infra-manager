import { BaseDriver } from '../BaseDriver.js'
import https from 'https'

// Allow self-signed / expired certs on OLT web UIs
const _tlsAgent = new https.Agent({ rejectUnauthorized: false })

async function _fetch(url, opts = {}) {
  const isHttps = url.startsWith('https')
  const fetchOpts = { ...opts }
  if (isHttps) fetchOpts.agent = _tlsAgent
  // Node 18+ builtin fetch doesn't support agent; use undici via env or http module
  // Use native fetch with NODE_TLS_REJECT_UNAUTHORIZED workaround via env trick
  const prev = process.env.NODE_TLS_REJECT_UNAUTHORIZED
  if (isHttps) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  try {
    return await fetch(url, opts)
  } finally {
    if (isHttps) {
      if (prev === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prev
    }
  }
}

/**
 * VsolHttpDriver — VSOL OLT via HTTP web UI scraping.
 *
 * VSOL V1601E04-DP (and similar budget OLTs) expose data through a
 * goform-based web UI. This driver scrapes:
 *   - systeminfo.html   → uptime, CPU%, memory%, firmware, serial
 *   - onustatusinfo.html → ONU list with status, MAC, distance
 *   - onuopmdiag.html    → ONU optical: Rx/Tx power, temperature
 *
 * Auth: POST /action/main.html with user=&pass= (session cookie)
 */
export class VsolHttpDriver extends BaseDriver {
  static get driverName() { return 'VSOL OLT (HTTP)' }

  static get capabilities() {
    return {
      interfaces:  false,
      ipAddresses: false,
      routes:      false,
      neighbors:   false,
      resource:    true,
      exec:        false,
      ponPorts:    true,
      onuList:     true,
      onuDetail:   true,
    }
  }

  constructor(device, opts) {
    super(device, opts)
    // Auto-detect HTTPS: protocol=WEB/HTTPS or port=443/2029 hints
    const proto = device.mgmtProtocol?.toUpperCase()
    const useHttps = proto === 'HTTPS' || proto === 'WEB'
      || [443, 2029, 8443].includes(device.mgmtPort)
    this._baseUrl = `${useHttps ? 'https' : 'http'}://${device.ip}:${device.mgmtPort || 8081}`
    this._cookie  = null
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect() {
    const res = await this._post('/action/main.html', {
      user: this.device.mgmtUsername || 'admin',
      pass: this.password || 'admin',
      who:  '',
    })

    // Successful login returns the main menu HTML (not redirect to login_first)
    if (res.includes('login_first') || res.includes('login.html')) {
      throw new Error('VSOL HTTP login failed — check credentials')
    }

    this.connected = true
  }

  async disconnect() {
    this._cookie  = null
    this.connected = false
  }

  // ── Status ─────────────────────────────────────────────────────────────────

  async getStatus() {
    const info = await this._getSysInfo()
    return {
      sysName:       info.sysName      ?? null,
      sysDescr:      info.model        ?? null,
      firmware:      info.firmware     ?? null,
      hardware:      info.hardware     ?? null,
      serial:        info.serial       ?? null,
      uptimeSeconds: info.uptimeSeconds ?? null,
      uptime:        info.uptime        ?? null,
      cpuPct:        info.cpuPct        ?? null,
      memPct:        info.memPct        ?? null,
      protocol:      'http',
    }
  }

  // ── Resource ───────────────────────────────────────────────────────────────

  async getResource() {
    const info = await this._getSysInfo()
    return {
      cpuPct:        info.cpuPct        ?? null,
      memoryPct:     info.memPct        ?? null,
      totalMemory:   null,
      freeMemory:    null,
      uptimeSeconds: info.uptimeSeconds ?? null,
      uptime:        info.uptime        ?? null,
      protocol:      'http',
    }
  }

  // ── PON Ports ──────────────────────────────────────────────────────────────

  async getPonPorts() {
    const ponCount = this.device.ponCount || 4
    const ports    = []
    let globalOnline = 0
    let globalTotal  = 0

    await Promise.all(
      Array.from({ length: ponCount }, async (_, i) => {
        const ponIdx = i + 1   // select=1..N
        const onus   = await this._getOnuStatusPage(ponIdx)

        const total  = onus.length
        const online = onus.filter(o => o.online).length
        globalTotal  += total
        globalOnline += online

        ports.push({
          id:         `epon0/${ponIdx}`,
          port:       `0/${ponIdx}`,
          totalOnu:   total,
          onlineOnu:  online,
          offlineOnu: total - online,
          running:    true,
        })
      })
    )

    ports.sort((a, b) => a.port.localeCompare(b.port, undefined, { numeric: true }))
    return { ports, globalOnline, globalTotal }
  }

  // ── ONU List ───────────────────────────────────────────────────────────────

  async getOnuList(ponPort = '0/1') {
    const ponIdx = _ponPortToIdx(ponPort)
    const onus   = await this._getOnuStatusPage(ponIdx)
    return onus
  }

  // ── ONU Detail ─────────────────────────────────────────────────────────────

  async getOnuDetail(onuIndex) {
    const { ponIdx } = _parseOnuIndex(onuIndex)
    const [onus, diagMap] = await Promise.all([
      this._getOnuStatusPage(ponIdx),
      this._getOnuDiagPage(ponIdx),
    ])
    const onu  = onus.find(o => o.index === onuIndex) ?? null
    if (!onu) return null
    const diag = diagMap[onuIndex]
    return {
      ...onu,
      onlineDuration: onu.aliveTime ?? null,
      distance:       diag?.distance ?? onu.distance ?? null,
      temperature:    diag?.temp     ?? null,
      voltage:        diag?.voltage  ?? null,
      oltRxPower:     diag?.rxPower  ?? null,
      onuTxPower:     diag?.txPower  ?? null,
    }
  }

  // ── ONU Optical Power ──────────────────────────────────────────────────────

  async getOnuPower(onuIndex) {
    const { ponIdx } = _parseOnuIndex(onuIndex)
    const diagMap    = await this._getOnuDiagPage(ponIdx)
    const d = diagMap[onuIndex]
    if (!d) return { onuIndex, oltRxPower: null, onuRxPower: null, onuTxPower: null, protocol: 'http' }
    return {
      onuIndex,
      // oltRxPower  = OLT menerima sinyal dari ONU (upstream)
      // onuRxPower  = alias untuk frontend row (pakai nama onuRxPower)
      // onuTxPower  = ONU mengirim ke OLT
      oltRxPower:  d.rxPower  ?? null,
      onuRxPower:  d.rxPower  ?? null,
      onuTxPower:  d.txPower  ?? null,
      oltTxPower:  null,
      temperature: d.temp     ?? null,
      voltage:     d.voltage  ?? null,
      biasCurrent: d.bias     ?? null,
      distance:    d.distance ?? null,
      protocol:    'http',
    }
  }

  // ── Internal: fetch helpers ────────────────────────────────────────────────

  async _get(path) {
    const url  = `${this._baseUrl}${path}`
    const resp = await _fetch(url, {
      headers: { Cookie: this._cookie || '', 'User-Agent': 'infra-manager/1.0' },
      signal:  AbortSignal.timeout(10000),
      redirect: 'manual',
    })
    // Capture Set-Cookie on first request
    const sc = resp.headers.get('set-cookie')
    if (sc) this._cookie = sc.split(';')[0]
    return resp.text()
  }

  async _post(path, fields) {
    const url  = `${this._baseUrl}${path}`
    const body = new URLSearchParams(fields).toString()
    const resp = await _fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie:         this._cookie || '',
        'User-Agent':   'infra-manager/1.0',
      },
      body,
      signal:   AbortSignal.timeout(10000),
      redirect: 'manual',
    })
    const sc = resp.headers.get('set-cookie')
    if (sc) this._cookie = sc.split(';')[0]
    return resp.text()
  }

  // ── Internal: page parsers ─────────────────────────────────────────────────

  async _getSysInfo() {
    const html = await this._get('/action/systeminfo.html')
    return _parseSysInfo(html)
  }

  async _getOnuStatusPage(ponIdx = 1) {
    const html = await this._get(`/action/onustatusinfo.html?select=${ponIdx}`)
    return _parseOnuStatusTable(html, ponIdx)
  }

  async _getOnuDiagPage(ponIdx = 1) {
    const html = await this._get(`/action/onuopmdiag.html?select=${ponIdx}`)
    return _parseOnuDiagTable(html, ponIdx)
  }
}

// ── Static HTML parsers ────────────────────────────────────────────────────

function _parseTable(html) {
  const rowRe  = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
  const rows   = []
  let rm
  while ((rm = rowRe.exec(html)) !== null) {
    const cells = []
    let cm
    cellRe.lastIndex = 0
    while ((cm = cellRe.exec(rm[1])) !== null) {
      const text = cm[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, '')
        .replace(/&#37;/g, '%')
        .replace(/&deg;/g, '°')
        .trim()
      if (text) cells.push(text)
    }
    if (cells.length > 0) rows.push(cells)
  }
  return rows
}

function _parseSysInfo(html) {
  // Table rows have label in col[0] and value in col[1] of the same row
  // but the HTML renderer sometimes splits them across rows — scan all pairs
  const rows = _parseTable(html)
  const map  = {}

  for (const row of rows) {
    // Row may be: [label, value]  or just [value] after a label row
    for (let i = 0; i + 1 < row.length; i += 2) {
      const key = row[i].toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
      map[key] = row[i + 1]
    }
    // Also try single-label rows followed by the next row as value
    if (row.length === 1) map['_last_label'] = row[0].toLowerCase()
    else if (row.length >= 1 && map['_last_label']) {
      map[map['_last_label']] = row[0]
      delete map['_last_label']
    }
  }

  const uptime = map['running time'] ?? null
  return {
    sysName:       map['system name']      ?? null,
    serial:        map['serial number']    ?? null,
    hardware:      map['hardware version'] ?? null,
    firmware:      map['firmware version'] ?? map['software version'] ?? null,
    model:         map['device model']     ?? null,
    uptime,
    uptimeSeconds: uptime ? _parseUptime(uptime) : null,
    cpuPct:        map['cpu usage']    != null ? parseInt(map['cpu usage'])    : null,
    memPct:        map['memory usage'] != null ? parseInt(map['memory usage']) : null,
  }
}

function _parseOnuStatusTable(html, ponIdx) {
  const rows = _parseTable(html)
  const onus = []

  for (const row of rows) {
    // Header row has "ONU ID" in first cell
    if (!row[0] || !row[0].match(/^EPON|^GPON/i)) continue

    // EPON0/1:1  format → normalize to 0/ponIdx:onuId
    const idRaw   = row[0]   // e.g. "EPON0/1:1"
    const status  = row[1]   ?? ''
    const mac     = row[2]   ?? null
    const desc    = row[3]   ?? null
    const dist       = row[4] != null ? parseInt(row[4]) || 0 : null
    const rtt          = row[5] ?? null
    const lastReg      = row[6] ?? null
    const lastDeregRsn = row[8] ?? null   // Last Deregister Reason
    const aliveT       = row[9] ?? null

    // Parse ONU id from "EPON0/1:2" → ponPort=0/1, onuId=2
    const m = idRaw.match(/\d+\/(\d+):(\d+)/i)
    if (!m) continue

    const port  = `0/${m[1]}`
    const onuId = parseInt(m[2])
    const index = `${port}:${onuId}`
    const online = /online/i.test(status)

    onus.push({
      index,
      port,
      onuId,
      status:     status.toLowerCase(),
      phaseState: status.toLowerCase(),
      online,
      sn:         null,
      mac,
      name:       desc && desc !== 'N/A' ? desc : null,
      distance:   dist,
      rtt:        rtt && rtt !== 'N/A' ? rtt : null,
      lastSeen:        lastReg      && lastReg      !== 'N/A' ? lastReg      : null,
      aliveTime:       aliveT       && aliveT       !== 'N/A' ? aliveT       : null,
      lastDeregReason: lastDeregRsn && lastDeregRsn !== 'N/A' ? lastDeregRsn : null,
      protocol:   'http',
    })
  }

  return onus.sort((a, b) => a.onuId - b.onuId)
}

function _parseOnuDiagTable(html, ponIdx) {
  const rows  = _parseTable(html)
  const byIdx = {}

  for (const row of rows) {
    if (!row[0] || !row[0].match(/^EPON|^GPON/i)) continue

    const idRaw  = row[0]
    const m      = idRaw.match(/\d+\/(\d+):(\d+)/i)
    if (!m) continue

    const port  = `0/${m[1]}`
    const onuId = parseInt(m[2])
    const index = `${port}:${onuId}`

    // Columns: ONU ID | MAC | Desc | Distance | Temp | Voltage | TxBias | TxPower | RxPower
    byIdx[index] = {
      mac:      row[1] ?? null,
      desc:     row[2] ?? null,
      distance: row[3] != null ? parseInt(row[3]) || null : null,
      temp:     _parseFloat(row[4]),
      voltage:  _parseFloat(row[5]),
      bias:     _parseFloat(row[6]),
      txPower:  _parseFloat(row[7]),
      rxPower:  _parseFloat(row[8]),
    }
  }

  return byIdx
}

// ── Utility ────────────────────────────────────────────────────────────────

function _parseFloat(val) {
  if (val == null || val === 'N/A' || val === '') return null
  const n = parseFloat(val)
  return isNaN(n) ? null : n
}

function _parseUptime(str) {
  // "0 Days 2 Hours 24 Minutes 33 Seconds"
  const d = parseInt(str.match(/(\d+)\s*Days?/i)?.[1]   ?? 0)
  const h = parseInt(str.match(/(\d+)\s*Hours?/i)?.[1]  ?? 0)
  const m = parseInt(str.match(/(\d+)\s*Minutes?/i)?.[1] ?? 0)
  const s = parseInt(str.match(/(\d+)\s*Seconds?/i)?.[1] ?? 0)
  return d * 86400 + h * 3600 + m * 60 + s
}

function _ponPortToIdx(ponPort) {
  // "0/1" → 1, "0/2" → 2
  const parts = String(ponPort).split('/')
  return parseInt(parts[parts.length - 1]) || 1
}

function _parseOnuIndex(onuIndex) {
  // "0/1:2" → ponIdx=1, onuId=2
  const m = String(onuIndex).match(/\d+\/(\d+):(\d+)/)
  return m ? { ponIdx: parseInt(m[1]), onuId: parseInt(m[2]) } : { ponIdx: 1, onuId: 1 }
}
