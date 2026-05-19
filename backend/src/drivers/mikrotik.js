import { RouterOSAPI } from 'node-routeros'
import { BaseDriver } from './BaseDriver.js'

/**
 * MikrotikDriver — communicates with RouterOS via the API protocol (port 8728/8729).
 *
 * Supported capabilities: interfaces, ipAddresses, routes, neighbors, resource, exec.
 */
export class MikrotikDriver extends BaseDriver {
  static get driverName() { return 'Mikrotik RouterOS API' }

  static get capabilities() {
    return {
      interfaces:  true,
      ipAddresses: true,
      routes:      true,
      neighbors:   true,
      resource:    true,
      exec:        true,
    }
  }

  constructor(device, opts) {
    super(device, opts)
    this._api = null
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect() {
    const port    = this.device.mgmtPort || 8728
    const timeout = 8000

    this._api = new RouterOSAPI({
      host:     this.device.ip,
      user:     this.device.mgmtUsername || 'admin',
      password: this.password || '',
      port,
      timeout,
    })

    await this._api.connect()
    this.connected = true
  }

  async disconnect() {
    if (this._api) {
      try { await this._api.close() } catch (_) {}
      this._api = null
    }
    this.connected = false
  }

  // ── Low-level helper ───────────────────────────────────────────────────────

  /** Run a RouterOS API command, return array of response objects. */
  async _cmd(path, params = {}) {
    if (!this._api || !this.connected) throw new Error('Not connected')
    // node-routeros api.write() accepts: command string + optional params array
    // Params format: ['=key=val', '?filter=val']  (already array) or object → convert
    const paramArr = Array.isArray(params)
      ? params
      : Object.entries(params).map(([k, v]) => `${k}=${v}`)
    return this._api.write(path, paramArr)
  }

  // ── Implementations ───────────────────────────────────────────────────────

  async getResource() {
    const [r] = await this._cmd('/system/resource/print')
    return {
      platform:       r['platform']        || null,
      boardName:      r['board-name']      || null,
      version:        r['version']         || null,
      uptime:         r['uptime']          || null,
      cpuLoad:        Number(r['cpu-load'] || 0),
      totalMemory:    Number(r['total-memory'] || 0),
      freeMemory:     Number(r['free-memory']  || 0),
      totalHddSpace:  Number(r['total-hdd-space']  || 0),
      freeHddSpace:   Number(r['free-hdd-space']   || 0),
      architecture:   r['architecture-name'] || null,
    }
  }

  async getInterfaces() {
    const list = await this._cmd('/interface/print')
    const PHYSICAL_TYPES = new Set(['ether', 'sfp', 'sfp-sfpplus', 'wlan', 'cap', 'lte', 'bridge', 'vlan', 'pppoe-out', 'l2tp-out', 'sstp-out', 'ovpn-out'])

    // Fetch VLAN details for vlan-id and parent interface info
    let vlanMap = {}
    try {
      const vlanList = await this._cmd('/interface/vlan/print')
      for (const v of vlanList) {
        vlanMap[v['name']] = {
          vlanId:    Number(v['vlan-id']) || null,
          interface: v['interface'] || null,
        }
      }
    } catch {}

    return list
      .filter(i => PHYSICAL_TYPES.has(i['type']))
      .map(i => ({
        name:         i['name'],
        defaultName:  i['default-name'] || i['name'],
        type:         i['type'],
        macAddress:   i['mac-address']  || null,
        mtu:          Number(i['mtu']   || 0),
        running:      i['running']      === 'true',
        disabled:     i['disabled']     === 'true',
        slave:        i['slave']        === 'true',
        txBytes:      Number(i['tx-byte']    || 0),
        rxBytes:      Number(i['rx-byte']    || 0),
        txPackets:    Number(i['tx-packet']  || 0),
        rxPackets:    Number(i['rx-packet']  || 0),
        linkDowns:    Number(i['link-downs'] || 0),
        lastLinkUp:   i['last-link-up-time']   || null,
        lastLinkDown: i['last-link-down-time'] || null,
        comment:      i['comment'] || null,
        vlanId:       vlanMap[i['name']]?.vlanId    ?? null,
        vlanParent:   vlanMap[i['name']]?.interface ?? null,
      }))
  }

  async getIpAddresses() {
    const list = await this._cmd('/ip/address/print')
    return list.map(a => ({
      address:   a['address'],
      network:   a['network'],
      interface: a['interface'],
      disabled:  a['disabled'] === 'true',
      dynamic:   a['dynamic']  === 'true',
      invalid:   a['invalid']  === 'true',
      comment:   a['comment']  || null,
    }))
  }

  async getRoutes() {
    const list = await this._cmd('/ip/route/print')
    return list.map(r => {
      // gateway-status e.g. "10.0.0.1 reachable via ether1" or "ether1 reachable"
      const gwStatus = r['gateway-status'] ?? ''
      const viaMatch = gwStatus.match(/via\s+(\S+)/)
      const iface    = viaMatch?.[1] ?? (r['interface'] || null)
      return {
        dst:              r['dst-address'],
        gateway:          r['gateway']          || null,
        interface:        iface,
        preferredSource:  r['pref-src']         || null,
        distance:         Number(r['distance']  || 0),
        active:           r['active']           === 'true',
        dynamic:          r['dynamic']          === 'true',
        bgp:              r['bgp']              === 'true',
        ospf:             r['ospf']             === 'true',
        ecmp:             r['ecmp']             === 'true',
        comment:          r['comment']          || null,
      }
    })
  }

  async getNeighbors() {
    const list = await this._cmd('/ip/neighbor/print')
    return list.map(n => ({
      interface:  n['interface'],
      ip:         n['address']      || null,
      mac:        n['mac-address']  || null,
      identity:   n['identity']     || null,
      platform:   n['platform']     || null,
      version:    n['version']      || null,
      board:      n['board']        || null,
      uptime:     n['uptime']       || null,
    }))
  }

  async getStatus() {
    try {
      const r = await this.getResource()
      const memUsedPct = r.totalMemory > 0
        ? Math.round((1 - r.freeMemory / r.totalMemory) * 100)
        : 0
      return {
        alive:      true,
        uptime:     r.uptime,
        cpuPct:     r.cpuLoad,
        memPct:     memUsedPct,
        version:    r.version,
        boardName:  r.boardName,
        platform:   r.platform,
      }
    } catch (e) {
      return { alive: false, error: e.message }
    }
  }

  /**
   * Execute an arbitrary RouterOS API command.
   * @param {string} cmd    — e.g. '/ip/firewall/filter/print'
   * @param {object} params — e.g. { '?chain': 'forward' }
   */
  async exec(cmd, params = {}) {
    return this._cmd(cmd, params)
  }
}
