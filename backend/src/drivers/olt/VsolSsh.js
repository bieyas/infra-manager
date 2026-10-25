import { Client as SshClient } from 'ssh2'
import { BaseDriver } from '../BaseDriver.js'

const CONNECTION_TIMEOUT_MS = 12_000
const COMMAND_TIMEOUT_MS = 10_000
const PROMPT_RE = /^[\w().:/-]+[>#]\s*$/
const ANSI_RE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g

function cleanTerminalText(value) {
  return value.replace(ANSI_RE, '').replace(/\r/g, '').replace(/[\u0000\u0008]/g, '')
}

function findPrompt(value) {
  const lines = cleanTerminalText(value).split('\n').map(line => line.trim()).filter(Boolean)
  const lastLine = lines.at(-1)
  return lastLine && PROMPT_RE.test(lastLine) ? lastLine : null
}

function parseMemoryStats(value) {
  const stats = {}
  for (const line of cleanTerminalText(value).split('\n')) {
    const match = line.replace(/--More--/g, '').match(/^\s*(.+?)\s*:\s*(-?\d+)\s*$/)
    if (match) stats[match[1].trim()] = Number(match[2])
  }
  return stats
}

function parseEthernetInterface(value, portNumber) {
  const output = cleanTerminalText(value)
  const field = (pattern, fallback = null) => output.match(pattern)?.[1] ?? fallback
  const rate = direction => {
    const match = output.match(new RegExp(
      `Last 60 seconds ${direction}:\\s*([\\d,]+)\\s*packets/sec\\s*([\\d,]+)\\s*bytes/sec`,
      'i',
    ))
    return match
      ? { packetsPerSecond: Number(match[1].replaceAll(',', '')), bytesPerSecond: Number(match[2].replaceAll(',', '')) }
      : null
  }
  const vlanIds = (startLabel, endLabel) => {
    const section = output.match(new RegExp(
      `(?:^|\\n)\\s*${startLabel}\\s*:\\s*([\\s\\S]*?)(?=(?:^|\\n)\\s*${endLabel}\\s*:|(?:^|\\n)\\s*Last 60 seconds|$)`,
      'i',
    ))?.[1] ?? ''
    return [...section.matchAll(/\b\d+\b/g)].map(match => Number(match[0]))
  }

  const input = rate('input')
  const outputRate = rate('output')
  const speed = field(/Current link speed:\s*(\d+)\s*Mbps/i)
  return {
    id: `ge0/${portNumber}`,
    name: `ge0/${portNumber}`,
    type: 'Gigabit Ethernet',
    running: /^up$/i.test(field(/current state\s*:\s*(\w+)/i, '')),
    speedMbps: speed == null ? null : Number(speed),
    duplex: field(/Current link mode:\s*([^,\n]+)/i),
    mtu: Number(field(/Maximum Transmit Unit is\s*(\d+)/i, 0)),
    pvid: Number(field(/PVID:\s*(\d+)/i, 0)) || null,
    linkType: field(/Port link-type:\s*(\w+)/i),
    taggedVlans: vlanIds('Tagged VLAN ID', 'Last 60 seconds'),
    untaggedVlans: vlanIds('Untagged VLAN ID', 'Tagged VLAN ID'),
    input: input
      ? { bytesPerSecond: input.bytesPerSecond, packetsPerSecond: input.packetsPerSecond }
      : null,
    output: outputRate
      ? { bytesPerSecond: outputRate.bytesPerSecond, packetsPerSecond: outputRate.packetsPerSecond }
      : null,
    inputErrors: Number(field(/Input:\s*(\d+)\s*input errors/i, 0)),
    outputErrors: Number(field(/Output:\s*(\d+)\s*output errors/i, 0)),
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    }),
  ]).finally(() => clearTimeout(timer))
}

export class VsolSshDriver extends BaseDriver {
  static get driverName() { return 'VSOL EPON OLT (SSH CLI)' }

  static get capabilities() {
    return {
      interfaces: false,
      ipAddresses: false,
      routes: false,
      neighbors: false,
      resource: false,
      exec: false,
      ethernetInterfaces: true,
      ponPorts: false,
      ponPower: false,
      onuList: false,
      onuDetail: false,
    }
  }

  constructor(device, opts) {
    super(device, opts)
    this._client = null
    this._stream = null
    this._buffer = ''
    this._pagerPagesSent = 0
    this._closedError = null
    this.prompt = null
  }

  async connect() {
    const host = this.device.ip
    const port = this.device.mgmtPort ?? 22
    const client = new SshClient()
    this._client = client

    client.on('error', error => {
      this._closedError ||= error
    })

    try {
      await withTimeout(new Promise((resolve, reject) => {
        client.once('ready', resolve)
        client.once('error', reject)
        client.connect({
          host,
          port,
          username: this.device.mgmtUsername || 'admin',
          password: this.password || '',
          readyTimeout: CONNECTION_TIMEOUT_MS,
          keepaliveInterval: 0,
        })
      }), CONNECTION_TIMEOUT_MS + 1_000, 'SSH connection timed out')

      const stream = await withTimeout(new Promise((resolve, reject) => {
        client.shell({ term: 'vt100', cols: 160, rows: 50 }, (error, shell) => {
          if (error) return reject(error)
          resolve(shell)
        })
      }), CONNECTION_TIMEOUT_MS, 'SSH shell request timed out')

      this._stream = stream
      stream.on('data', chunk => {
        this._buffer += chunk.toString()
        this._advancePager()
      })
      stream.on('error', error => { this._closedError ||= error })
      stream.on('close', () => {
        this._closedError ||= new Error('SSH shell closed')
      })

      this.prompt = await this._waitForPrompt(CONNECTION_TIMEOUT_MS, 'VSOL CLI prompt not received')
      this.connected = true
    } catch (error) {
      await this.disconnect()
      throw new Error(`VSOL SSH connection failed to ${host}:${port}: ${error.message}`)
    }
  }

  async disconnect() {
    this._stream?.close()
    this._stream = null
    this._client?.end()
    this._client = null
    this._buffer = ''
    this.prompt = null
    this.connected = false
  }

  async getStatus() {
    const output = await this._runReadOnly('show memory')
    const sysName = this.prompt?.replace(/[>#]\s*$/, '') || null
    return {
      sysName,
      platform: this.device.model || 'VSOL EPON OLT',
      protocol: 'ssh-cli',
      memoryStats: parseMemoryStats(output),
    }
  }

  async getEthernetInterfaces() {
    const vlanOutput = await this._runReadOnly('show interface vlan')
    const portNumbers = [...new Set(
      [...vlanOutput.matchAll(/\bge0\/(\d+)\b/gi)].map(match => Number(match[1])),
    )].sort((a, b) => a - b)

    if (portNumbers.length === 0) {
      throw new Error('No Gigabit Ethernet ports found in VLAN output')
    }

    const interfaces = []
    for (const portNumber of portNumbers) {
      const output = await this._runReadOnly(`show interface gigabitethernet 0/${portNumber}`)
      interfaces.push(parseEthernetInterface(output, portNumber))
    }
    return interfaces
  }

  async _runReadOnly(command) {
    if (!this.connected || !this._stream) throw new Error('Not connected')
    this._buffer = ''
    this._pagerPagesSent = 0
    this._stream.write(`${command}\r\n`)
    const prompt = await this._waitForPrompt(COMMAND_TIMEOUT_MS, `VSOL command timed out: ${command}`)
    const output = cleanTerminalText(this._buffer)
    const withoutPrompt = output.replace(new RegExp(`${escapeRegExp(prompt)}\\s*$`), '')
    return withoutPrompt
      .replace(new RegExp(`^\\s*${escapeRegExp(command)}\\s*`), '')
      .trim()
  }

  _advancePager() {
    const pages = cleanTerminalText(this._buffer).match(/--More--/g)?.length ?? 0
    while (this._pagerPagesSent < pages) {
      this._pagerPagesSent += 1
      this._stream.write(' ')
    }
  }

  _waitForPrompt(timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
      const finish = (callback, value) => {
        clearInterval(interval)
        clearTimeout(timeout)
        callback(value)
      }
      const check = () => {
        if (this._closedError) return finish(reject, this._closedError)
        const prompt = findPrompt(this._buffer)
        if (prompt) finish(resolve, prompt)
      }
      const interval = setInterval(check, 50)
      const timeout = setTimeout(() => finish(reject, new Error(timeoutMessage)), timeoutMs)
      check()
    })
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
