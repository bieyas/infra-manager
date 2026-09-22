/**
 * BaseDriver — abstract contract for all device drivers.
 *
 * Every driver MUST implement:
 *   connect()           → Promise<void>
 *   disconnect()        → Promise<void>
 *   getStatus()         → Promise<StatusResult>
 *   getInterfaces()     → Promise<InterfaceResult[]>
 *
 * Every driver MAY implement (returns null if unsupported):
 *   getIpAddresses()    → Promise<IpResult[]>
 *   getRoutes()         → Promise<RouteResult[]>
 *   getNeighbors()      → Promise<NeighborResult[]>
 *   getResource()       → Promise<ResourceResult>
 *   exec(cmd, params)   → Promise<any>
 *
 * Drivers are instantiated per-request (not singletons).
 * The caller is responsible for calling connect() then disconnect().
 *
 * Use withDriver(device, fn) helper to handle lifecycle automatically.
 */

export class BaseDriver {
  /**
   * @param {object} device  — Prisma Device record (includes mgmt fields)
   * @param {string} [password] — decrypted mgmtPassword (never stored)
   * @param {string} [community] — decrypted snmpCommunity
   */
  constructor(device, { password, community } = {}) {
    this.device    = device
    this.password  = password
    this.community = community
    this.connected = false
  }

  /** Driver human-readable name, e.g. "Mikrotik RouterOS API" */
  static get driverName() { return 'BaseDriver' }

  /** Capabilities this driver supports */
  static get capabilities() {
    return {
      interfaces:  false,
      ipAddresses: false,
      routes:      false,
      neighbors:   false,
      pppoeSessions: false,
      pppSecrets:  false,
      resource:    false,
      exec:        false,
    }
  }

  async connect()    { throw new Error(`${this.constructor.driverName}: connect() not implemented`) }
  async disconnect() { this.connected = false }

  async getStatus()      { return null }
  async getInterfaces()  { return null }
  async getIpAddresses() { return null }
  async getRoutes()      { return null }
  async getNeighbors()   { return null }
  async getResource()    { return null }
  async exec(_cmd, _params) { return null }
}

/**
 * Convenience wrapper — connects, runs fn(driver), disconnects (even on error).
 * Returns the result of fn(driver).
 */
export async function withDriver(driver, fn) {
  await driver.connect()
  try {
    return await fn(driver)
  } finally {
    await driver.disconnect().catch(() => {})
  }
}
