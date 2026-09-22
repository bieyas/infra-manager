import { Client as SshClient } from 'ssh2'
import { BaseDriver }          from './BaseDriver.js'

/**
 * GenericSshDriver — connects to any device via SSH and runs shell commands.
 * OLT-specific drivers (Huawei, ZTE) extend this class and override
 * the command templates + output parsers.
 */
export class GenericSshDriver extends BaseDriver {
  static get driverName() { return 'Generic SSH' }

  static get capabilities() {
    return {
      interfaces:  true,
      ipAddresses: false,
      routes:      false,
      neighbors:   false,
      resource:    false,
      exec:        true,
    }
  }

  constructor(device, opts) {
    super(device, opts)
    this._client = null
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect() {
    const port    = this.device.mgmtPort || 22
    const timeout = 10_000

    return new Promise((resolve, reject) => {
      const client = new SshClient()
      client
        .on('ready', () => {
          this._client  = client
          this.connected = true
          resolve()
        })
        .on('error', reject)
        .connect({
          host:             this.device.ip,
          port,
          username:         this.device.mgmtUsername || 'admin',
          password:         this.password || '',
          readyTimeout:     timeout,
          keepaliveInterval: 0,
        })
    })
  }

  async disconnect() {
    if (this._client) {
      this._client.end()
      this._client = null
    }
    this.connected = false
  }

  // ── Low-level helper ───────────────────────────────────────────────────────

  /**
   * Execute a single shell command, return stdout string.
   * @param {string} cmd
   * @param {number} [timeoutMs=10000]
   */
  runCommand(cmd, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      if (!this._client) return reject(new Error('Not connected'))

      let output = ''
      const timer = setTimeout(() => reject(new Error(`Command timed out: ${cmd}`)), timeoutMs)

      this._client.exec(cmd, (err, stream) => {
        if (err) { clearTimeout(timer); return reject(err) }

        stream
          .on('data',  chunk => { output += chunk.toString() })
          .stderr.on('data', chunk => { output += chunk.toString() })

        stream.on('close', () => {
          clearTimeout(timer)
          resolve(output.trim())
        })
      })
    })
  }

  // ── Default implementations (override in subclasses) ──────────────────────

  async getStatus() {
    try {
      const out = await this.runCommand('uname -a 2>/dev/null || echo unknown')
      return { alive: true, raw: out }
    } catch (e) {
      return { alive: false, error: e.message }
    }
  }

  async getInterfaces() {
    try {
      const out = await this.runCommand('ip link show 2>/dev/null || ifconfig -a 2>/dev/null')
      return [{ raw: out }]
    } catch (_) {
      return null
    }
  }

  /**
   * Execute an arbitrary command string.
   */
  async exec(cmd, _params) {
    return this.runCommand(cmd)
  }
}
