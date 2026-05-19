import React from 'react'

function ipToLong(ip) {
  const parts = ip.split('.').map(Number)
  return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]
}

function longToIp(long) {
  return [
    (long >>> 24) & 0xff,
    (long >>> 16) & 0xff,
    (long >>> 8) & 0xff,
    long & 0xff
  ].join('.')
}

function parseCidr(cidr) {
  const match = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
  if (!match) return null
  
  const [, a, b, c, d, prefix] = match.map(Number)
  const ip = (a << 24) | (b << 16) | (c << 8) | d
  const mask = prefix === 0 ? 0 : (-1 << (32 - prefix)) >>> 0
  const network = (ip & mask) >>> 0
  const broadcast = network | (~mask >>> 0)
  
  return { network, broadcast, prefix }
}

export default function IpHeatmap({ subnets }) {
  // Group IPs by /24 for visualization
  const blocks = {}
  
  subnets.forEach(subnet => {
    const p = parseCidr(subnet.cidr)
    if (!p) return
    
    const usedIps = new Set(subnet.hosts?.map(h => ipToLong(h.ip)) || [])
    
    // Create /24 blocks
    for (let ip = p.network; ip <= p.broadcast; ip++) {
      const ipStr = longToIp(ip)
      const octets = ipStr.split('.')
      const blockKey = `${octets[0]}.${octets[1]}.${octets[2]}.0/24`
      
      if (!blocks[blockKey]) {
        blocks[blockKey] = { key: blockKey, total: 0, used: 0, ips: [] }
      }
      
      blocks[blockKey].total++
      if (usedIps.has(ip)) {
        blocks[blockKey].used++
      }
    }
  })
  
  const blockArray = Object.values(blocks).sort((a, b) => 
    ipToLong(a.key) - ipToLong(b.key)
  )
  
  return (
    <div className="p-4">
      <div className="space-y-2">
        {blockArray.map(block => {
          const pct = block.total > 0 ? (block.used / block.total) * 100 : 0
          const intensity = Math.min(100, Math.max(0, pct))
          
          return (
            <div key={block.key} className="flex items-center gap-3">
              <span className="font-mono text-xs text-primary w-32">{block.key}</span>
              <div className="flex-1 h-6 bg-[var(--surface-2)] rounded overflow-hidden relative">
                <div 
                  className="h-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 transition-all"
                  style={{ 
                    width: `${intensity}%`,
                    opacity: intensity > 0 ? 1 : 0.3
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
                  {block.used}/{block.total} ({Math.round(pct)}%)
                </span>
              </div>
            </div>
          )
        })}
      </div>
      
      {blockArray.length === 0 && (
        <div className="text-center py-8 text-muted">
          <p className="text-sm">Tidak ada data untuk ditampilkan</p>
          <p className="text-xs mt-1">Tambahkan subnet dan host terlebih dahulu</p>
        </div>
      )}
    </div>
  )
}
