import { GenericSshDriver } from '../GenericSsh.js'

/**
 * HuaweiOltDriver — for Huawei MA5600/MA5800 series OLT.
 *
 * Commands use Huawei VRP CLI syntax over SSH.
 * Override more methods as real device access becomes available.
 */
export class HuaweiOltDriver extends GenericSshDriver {
  static get driverName() { return 'Huawei OLT (VRP)' }

  static get capabilities() {
    return {
      interfaces:  true,
      ipAddresses: false,
      routes:      false,
      neighbors:   false,
      resource:    true,
      exec:        true,
      ontList:     true,
      pontStatus:  true,
    }
  }

  // ── VRP-specific commands ────────────────────────────────────────────────

  /** Get board/slot info */
  async getBoardInfo() {
    const out = await this.runCommand('display board 0')
    return { raw: out, parsed: this._parseBoardInfo(out) }
  }

  /** List all ONTs on a given PON port */
  async getOntList(frame = 0, slot = 0, port = 0) {
    const out = await this.runCommand(
      `display ont info ${frame} ${slot} ${port} all`
    )
    return { raw: out, parsed: this._parseOntList(out) }
  }

  /** Get optical signal level of ONTs on a PON port */
  async getOpticalInfo(frame = 0, slot = 0, port = 0) {
    const out = await this.runCommand(
      `display ont optical-info ${frame} ${slot} ${port} all`
    )
    return { raw: out, parsed: this._parseOpticalInfo(out) }
  }

  /** Get running configuration */
  async getConfig() {
    const out = await this.runCommand('display current-configuration')
    return { raw: out }
  }

  // ── Parsers ───────────────────────────────────────────────────────────────

  _parseBoardInfo(raw) {
    const boards = []
    const lines  = raw.split('\n')
    for (const line of lines) {
      // Example: "  0    H805GPFD  Normal  Online  H805GPFD"
      const m = line.match(/^\s*(\d+)\s+(\S+)\s+(\S+)\s+(Online|Offline|Standby)\s*(.*)/)
      if (m) {
        boards.push({
          slot:    Number(m[1]),
          type:    m[2],
          state:   m[3],
          status:  m[4],
          comment: m[5]?.trim() || null,
        })
      }
    }
    return boards
  }

  _parseOntList(raw) {
    const onts  = []
    const lines = raw.split('\n')
    for (const line of lines) {
      // Example: "  0   1  D  10  online  ..."
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+\S+\s+(\d+)\s+(online|offline|dying-gasp)/i)
      if (m) {
        onts.push({
          port:     Number(m[1]),
          ontId:    Number(m[2]),
          sn:       null, // separate command needed
          distance: Number(m[3]),
          status:   m[4].toLowerCase(),
        })
      }
    }
    return onts
  }

  _parseOpticalInfo(raw) {
    const results = []
    const lines   = raw.split('\n')
    for (const line of lines) {
      // Example: "  0/0/0  1   -18.5  2.3  1490/1310"
      const m = line.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+)\s+([-\d.]+)\s+([-\d.]+)/)
      if (m) {
        results.push({
          frame:     Number(m[1]),
          slot:      Number(m[2]),
          port:      Number(m[3]),
          ontId:     Number(m[4]),
          rxPower:   parseFloat(m[5]),
          txPower:   parseFloat(m[6]),
        })
      }
    }
    return results
  }

  // ── Override getInterfaces ────────────────────────────────────────────────

  async getInterfaces() {
    const out = await this.runCommand('display interface brief')
    return [{ raw: out }]
  }

  async getResource() {
    const out = await this.runCommand('display system-info')
    return { raw: out }
  }
}
