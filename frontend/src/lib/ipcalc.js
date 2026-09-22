// IP Calculator utilities

export function parseCidr(cidr) {
  const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
  if (!match) return null
  
  const [, a, b, c, d, prefix] = match.map(Number)
  if ([a, b, c, d].some(o => o > 255) || prefix > 32) return null
  
  const ip = (a << 24) | (b << 16) | (c << 8) | d
  const mask = prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0
  const network = (ip & mask) >>> 0
  const broadcast = network | (~mask >>> 0)
  const usable = Math.max(0, (1 << (32 - prefix)) - 2)
  
  return {
    ip,
    prefix,
    mask,
    network,
    broadcast,
    usable,
    networkStr: toIp(network),
    broadcastStr: toIp(broadcast),
    maskStr: toIp(mask),
    firstUsable: prefix >= 31 ? null : toIp(network + 1),
    lastUsable: prefix >= 31 ? null : toIp(broadcast - 1),
    rangeStr: prefix >= 31 ? 'N/A' : `${toIp(network + 1)} - ${toIp(broadcast - 1)}`
  }
}

function toIp(num) {
  return [
    (num >>> 24) & 0xff,
    (num >>> 16) & 0xff,
    (num >>> 8) & 0xff,
    num & 0xff
  ].join('.')
}

export function validateCidr(cidr) {
  return parseCidr(cidr) !== null
}

// Check if two CIDRs overlap
export function cidrsOverlap(cidr1, cidr2) {
  const p1 = parseCidr(cidr1)
  const p2 = parseCidr(cidr2)
  if (!p1 || !p2) return false
  
  // Check if either network falls within the other's range
  const net1InNet2 = (p1.network >= p2.network) && (p1.network <= p2.broadcast)
  const net2InNet1 = (p2.network >= p1.network) && (p2.network <= p1.broadcast)
  
  return net1InNet2 || net2InNet1
}
