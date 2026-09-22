import net from 'net'
import { BaseDriver } from './BaseDriver.js'

/**
 * TelnetDriver — interactive Telnet session base class.
 *
 * Handles:
 *   - TCP connection + IAC option negotiation
 *   - Login prompt detection (username + password)
 *   - CLI prompt detection for command/response cycle
 *   - Pagination stripping (--More--, Press any key, etc.)
 *
 * Subclasses should override:
 *   - promptRegex      — regex matching the device CLI prompt
 *   - loginPromptRegex — regex matching username prompt
 *   - passPromptRegex  — regex matching password prompt
 *   - moreRegex        — regex matching pagination prompts
 *   - moreResponse     — byte to send to skip pagination (default: space)
 */
export class TelnetDriver extends BaseDriver {
  static get driverName() { return 'Generic Telnet' }

  static get capabilities() {
    return {
      interfaces:  false,
      ipAddresses: false,
      routes:      false,
      neighbors:   false,
      resource:    false,
      exec:        true,
    }
  }

  // ── Prompt patterns (override in subclass) ────────────────────────────────
  get promptRegex()      { return /[#>$]\s*$/ }
  get loginPromptRegex() { return /[Uu]sername[:\s]*$|[Ll]ogin[:\s]*$/ }
  get passPromptRegex()  { return /[Pp]assword[:\s]*$/ }
  get moreRegex()        { return /--\s*[Mm]ore\s*--|Press any key|---- More ----|<cr>/ }
  get moreResponse()     { return ' ' }          // space skips one page
  get connectTimeout()   { return this._connectTimeout || 12_000 }
  get commandTimeout()   { return this._commandTimeout || 15_000 }

  constructor(device, opts) {
    super(device, opts)
    this._socket = null
    this._buf    = ''
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect() {
    const host = this.device.ip
    const port = this.device.mgmtPort || 23

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._socket?.destroy()
        reject(new Error(`Telnet connect timeout (${this.connectTimeout}ms) to ${host}:${port}`))
      }, this.connectTimeout)

      const sock = net.createConnection({ host, port })
      this._socket = sock
      this._buf    = ''

      sock.on('error', err => { clearTimeout(timer); reject(err) })

      sock.on('data', chunk => {
        // Strip IAC negotiation bytes (0xFF sequences)
        const stripped = this._stripIac(chunk)
        this._buf += stripped
      })

      // Perform login handshake
      this._waitLogin(timer, resolve, reject)
    })
  }

  async disconnect() {
    if (this._socket) {
      try { this._socket.destroy() } catch (_) {}
      this._socket = null
    }
    this._buf    = ''
    this.connected = false
  }

  // ── Low-level command runner ───────────────────────────────────────────────

  /**
   * Send a command and collect output until the CLI prompt appears.
   * Automatically skips pagination prompts.
   * @param {string} cmd
   * @param {number} [timeoutMs]
   */
  async runCommand(cmd, timeoutMs = this.commandTimeout) {
    if (!this._socket || !this.connected) throw new Error('Not connected')

    // Drain any residual bytes (e.g. trailing prompt from prior command)
    this._buf = ''
    await new Promise(r => setTimeout(r, 300))
    this._buf = ''

    this._socket.write(cmd + '\r\n')

    return new Promise((resolve, reject) => {
      let output = ''
      let done   = false

      const timer = setTimeout(() => {
        if (done) return
        done = true
        reject(new Error(`Command timed out (${timeoutMs}ms): ${cmd}`))
      }, timeoutMs)

      const check = () => {
        if (done) return
        const buf = this._buf

        // Pagination — accumulate, clear buf, send space for next page
        if (this.moreRegex.test(buf)) {
          output   += buf.replace(this.moreRegex, '')
          this._buf = ''
          this._socket.write(this.moreResponse)
          setTimeout(check, 250)
          return
        }

        // CLI prompt — command complete
        if (this.promptRegex.test(buf)) {
          output += buf.replace(this.promptRegex, '')
          done = true
          clearTimeout(timer)
          const cleaned = output
            .replace(new RegExp(`^[^\\n]*${this._escapeRegex(cmd)}[^\\n]*\\n`), '')
            .replace(/\r/g, '')
            .trim()
          resolve(cleaned)
          return
        }

        setTimeout(check, 60)
      }

      setTimeout(check, 150)
    })
  }

  /**
   * Execute arbitrary command (BaseDriver interface).
   */
  async exec(cmd) {
    return this.runCommand(cmd)
  }

  // ── Login handshake ────────────────────────────────────────────────────────

  _waitLogin(timer, resolve, reject) {
    const start    = Date.now()
    const deadline = this.connectTimeout - 500

    const check = () => {
      if (Date.now() - start > deadline) {
        clearTimeout(timer)
        reject(new Error('Login handshake timeout — no prompt received'))
        return
      }

      const buf = this._buf

      if (this.loginPromptRegex.test(buf)) {
        this._buf = ''
        this._socket.write((this.device.mgmtUsername || 'admin') + '\r\n')
        this._waitPassword(timer, resolve, reject)
        return
      }

      if (this.passPromptRegex.test(buf)) {
        // Device skipped username prompt (already in password stage)
        this._buf = ''
        this._socket.write((this.password || '') + '\r\n')
        this._waitPrompt(timer, resolve, reject)
        return
      }

      if (this.promptRegex.test(buf)) {
        // Already at CLI (no login required — session reuse / no auth)
        clearTimeout(timer)
        this._buf      = ''
        this.connected = true
        resolve()
        return
      }

      setTimeout(check, 80)
    }
    setTimeout(check, 200)
  }

  _waitPassword(timer, resolve, reject) {
    const start    = Date.now()
    const deadline = 8_000

    const check = () => {
      if (Date.now() - start > deadline) {
        clearTimeout(timer)
        reject(new Error('Password prompt timeout'))
        return
      }

      const buf = this._buf

      if (this.passPromptRegex.test(buf)) {
        this._buf = ''
        this._socket.write((this.password || '') + '\r\n')
        this._waitPrompt(timer, resolve, reject)
        return
      }

      setTimeout(check, 80)
    }
    setTimeout(check, 200)
  }

  _waitPrompt(timer, resolve, reject) {
    const start    = Date.now()
    const deadline = 8_000

    const check = () => {
      if (Date.now() - start > deadline) {
        clearTimeout(timer)
        reject(new Error('CLI prompt not received after login'))
        return
      }

      const buf = this._buf

      if (/[Ii]nvalid|[Aa]ccess [Dd]enied|[Bb]ad pass|[Aa]uth.*fail/i.test(buf)) {
        clearTimeout(timer)
        reject(new Error('Authentication failed'))
        return
      }

      if (this.promptRegex.test(buf)) {
        clearTimeout(timer)
        this._buf      = ''
        this.connected = true
        resolve()
        return
      }

      setTimeout(check, 80)
    }
    setTimeout(check, 200)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Strip IAC (0xFF) Telnet negotiation bytes from raw buffer.
   * IAC sequences: FF XX or FF XX YY
   */
  _stripIac(buf) {
    let out = ''
    let i   = 0
    while (i < buf.length) {
      const b = buf[i]
      if (b === 0xFF) {
        const cmd = buf[i + 1]
        // IAC DO/DONT/WILL/WONT (3-byte) or IAC SB … SE (variable)
        if (cmd === 0xFA) {
          // Subnegotiation — skip until IAC SE (FF F0)
          i += 2
          while (i < buf.length && !(buf[i] === 0xFF && buf[i+1] === 0xF0)) i++
          i += 2
        } else {
          i += 3 // skip IAC + cmd + option
        }
      } else {
        out += String.fromCharCode(b)
        i++
      }
    }
    return out
  }

  /** Strip pagination prompts and trailing CLI prompt from output string */
  _stripPrompts(text) {
    return text
      .replace(this.moreRegex, '')
      .replace(this.promptRegex, '')
  }

  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}
