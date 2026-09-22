// ── Fiber core color catalog (Standar APJII - TIA/EIA-598-C) ──
export const FIBER_CORES = [
  { value: 'core-1',  label: 'Core 1',  color: '#2563eb', name: 'Biru' },      // Blue
  { value: 'core-2',  label: 'Core 2',  color: '#f97316', name: 'Oranye' },   // Orange
  { value: 'core-3',  label: 'Core 3',  color: '#16a34a', name: 'Hijau' },     // Green
  { value: 'core-4',  label: 'Core 4',  color: '#8b4513', name: 'Coklat' },    // Brown
  { value: 'core-5',  label: 'Core 5',  color: '#64748b', name: 'Abu-abu' },  // Slate/Grey
  { value: 'core-6',  label: 'Core 6',  color: '#f8fafc', name: 'Putih' },     // White
  { value: 'core-7',  label: 'Core 7',  color: '#dc2626', name: 'Merah' },    // Red
  { value: 'core-8',  label: 'Core 8',  color: '#0f172a', name: 'Hitam' },    // Black
  { value: 'core-9',  label: 'Core 9',  color: '#facc15', name: 'Kuning' },    // Yellow
  { value: 'core-10', label: 'Core 10', color: '#8b5cf6', name: 'Ungu' },     // Violet
  { value: 'core-11', label: 'Core 11', color: '#ec4899', name: 'Pink' },      // Rose/Pink
  { value: 'core-12', label: 'Core 12', color: '#06b6d4', name: 'Aqua' },     // Aqua
]

/** Generate PON list from OLT ponCount field */
export function getPonList(olt) {
  if (!olt) return []
  const count = olt.ponCount ?? 8 // default 8 jika tidak diset
  return Array.from({ length: count }, (_, i) => ({
    value: `PON-${i + 1}`,
    label: `PON-${i + 1}`,
  }))
}

/**
 * Generate suggested ODC name from OLT, PON, location abbreviation, and sequence.
 * Format: ODC-{OLT_ABBR}-{PON}-{LOC_ABBR}-{SEQ}
 * Example: ODC-ZTE01-P3-RNGKT-01
 */
export function suggestOdcName({ oltName, ponPort, address, existingNames = [] }) {
  const oltAbbr = oltName
    ? oltName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)
    : 'OLT'

  const ponAbbr = ponPort
    ? `P${ponPort.replace(/[^0-9]/g, '').slice(-1) || '1'}`
    : 'P1'

  const locAbbr = address
    ? address
        .split(/[\s,./]+/)
        .filter(w => w.length > 2)
        .slice(0, 2)
        .map(w => w.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4))
        .join('')
        .slice(0, 6) || 'LOC'
    : 'LOC'

  // Find next sequence number not already in use
  let seq = 1
  while (true) {
    const candidate = `ODC-${oltAbbr}-${ponAbbr}-${locAbbr}-${String(seq).padStart(2, '0')}`
    if (!existingNames.includes(candidate)) return candidate
    seq++
  }
}

/**
 * Generate suggested ODP name from ODC name and sequence letter/number.
 * Format: ODP-{ODC_SUFFIX}-{SEQ}
 * Example: ODC-ZTE01-P3-RNGKT-01 → ODP-ZTE01-P3-RNGKT-01-A
 */
export function suggestOdpName({ odcName, existingNames = [] }) {
  const base = odcName
    ? odcName.replace(/^ODC-/, '')
    : 'DIST'

  // Try A, B, C … Z, then A2, B2 …
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let round = 1
  while (true) {
    for (const letter of letters) {
      const suffix = round === 1 ? letter : `${letter}${round}`
      const candidate = `ODP-${base}-${suffix}`
      if (!existingNames.includes(candidate)) return candidate
    }
    round++
  }
}

// Simetris splitter ratio options
export const SIMETRIS_SPLITTER_RATIO_OPTIONS = [
  { value: '1:2', label: '1:2' },
  { value: '1:4', label: '1:4' },
  { value: '1:8', label: '1:8' },
  { value: '1:16', label: '1:16' },
  { value: '1:32', label: '1:32' },
  { value: '1:64', label: '1:64' },
]

// Asimetris splitter ratio options
export const ASIMETRIS_SPLITTER_RATIO_OPTIONS = [
  { value: '1:99', label: '1:99' },
  { value: '2:98', label: '2:98' },
  { value: '3:97', label: '3:97' },
  { value: '4:96', label: '4:96' },
  { value: '5:95', label: '5:95' },
  { value: '6:94', label: '6:94' },
  { value: '7:93', label: '7:93' },
  { value: '8:92', label: '8:92' },
  { value: '9:91', label: '9:91' },
  { value: '10:90', label: '10:90' },
  { value: '15:85', label: '15:85' },
  { value: '20:80', label: '20:80' },
  { value: '25:75', label: '25:75' },
  { value: '30:70', label: '30:70' },
  { value: '35:65', label: '35:65' },
  { value: '40:60', label: '40:60' },
  { value: '45:55', label: '45:55' },
  { value: '50:50', label: '50:50' },
]