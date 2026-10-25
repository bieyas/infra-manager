import crypto from 'node:crypto'

const reservedPorts = new Set()

export function allocateRemotePort(minPort, maxPort) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const port = minPort + crypto.randomInt(Math.max(1, maxPort - minPort + 1))
    if (reservedPorts.has(port)) continue
    reservedPorts.add(port)
    return port
  }
  throw new Error('Port remote penuh')
}

export function releaseRemotePort(port) {
  reservedPorts.delete(port)
}