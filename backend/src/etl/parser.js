/**
 * ETL Parser / Transformer
 * Mengubah raw record dari API external menjadi shape yang sesuai model Customer.
 * Gunakan fieldMap dari config untuk mapping field.
 */

// ── Status normalization ──────────────────────────────────────────────────────

const STATUS_MAP = {
  active:      'ACTIVE',
  aktif:       'ACTIVE',
  enabled:     'ACTIVE',
  '1':         'ACTIVE',
  suspended:   'SUSPENDED',
  suspend:     'SUSPENDED',
  isolir:      'SUSPENDED',
  disabled:    'SUSPENDED',
  '2':         'SUSPENDED',
  terminated:  'TERMINATED',
  inactive:    'TERMINATED',
  nonaktif:    'TERMINATED',
  berhenti:    'TERMINATED',
  '0':         'TERMINATED',
}

function normalizeStatus(raw) {
  if (!raw) return 'ACTIVE'
  const key = String(raw).toLowerCase().trim()
  return STATUS_MAP[key] ?? 'ACTIVE'
}

// ── Date normalization ────────────────────────────────────────────────────────

function normalizeDate(raw) {
  if (!raw) return null
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

// ── Number normalization ──────────────────────────────────────────────────────

function normalizeInt(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = parseInt(String(raw).replace(/\D/g, ''), 10)
  return isNaN(n) ? null : n
}

function normalizeFloat(raw) {
  if (raw === null || raw === undefined || raw === '') return null
  const n = parseFloat(String(raw).replace(/,/, '.'))
  return isNaN(n) ? null : n
}

// ── Normalisasi nomor telepon ─────────────────────────────────────────────────
// Terima format: 6281xxx, 081xxx, 081-xxx, +6281xxx
// Output: 08xxxxxxxx (format lokal tanpa +62)

function normalizePhone(raw) {
  if (!raw) return null
  let s = String(raw).trim().replace(/[\s\-().]/g, '')
  if (!s) return null
  // Hilangkan +62 atau 62 di depan
  if (s.startsWith('+62')) s = '0' + s.slice(3)
  else if (s.startsWith('62') && s.length >= 11) s = '0' + s.slice(2)
  // Pastikan mulai 0
  if (!s.startsWith('0')) s = '0' + s
  // Minimal 9 digit, maksimal 15 digit
  if (s.length < 9 || s.length > 15) return null
  return s
}

// ── Ekstrak lat/lng dari field 'tikor' (titik koordinat) ─────────────────────
// Format 1: "-7.5221852, 112.236892"  (titik desimal)
// Format 2: "-7,5221852, 112,236892"  (koma desimal format Indonesia)
// Format 3: "-7,5160097, 112,2333227" (koma ganda — koma desimal + koma separator)
// Format 4: "https://maps.app.goo.gl/..." (URL — tidak di-resolve)
// Format 5: DMS, Plus Code — tidak didukung

function parseTikor(tikor) {
  if (!tikor || typeof tikor !== 'string') return { lat: null, lng: null, unparseable: false }
  const val = tikor.trim()
  if (!val || val === '-') return { lat: null, lng: null, unparseable: false }
  if (val.startsWith('http')) return { lat: null, lng: null, unparseable: false }

  // Strategi 1: Format dengan titik desimal — "-7.5221852, 112.236892"
  // Tangkap dua bilangan float yang dipisah koma+spasi atau spasi
  let m = val.match(/^(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/)
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2])
    if (lat >= -15 && lat <= 10 && lng >= 90 && lng <= 145)
      return { lat, lng, unparseable: false }
  }

  // Strategi 2: Format koma-desimal Indonesia — "-7,4633517, 112,1558213"
  // Pola: -digit,digit+ WAJIB DIIKUTI koma+spasi atau akhir, lalu digit,digit+
  // Tangkap: dua token yang masing-masing berisi angka dengan koma sebagai desimal
  m = val.match(/^(-?\d+),(\d+)[,\s]+(\d+),(\d+)/)
  if (m) {
    const lat = parseFloat(`${m[1]}.${m[2]}`)
    const lng = parseFloat(`${m[3]}.${m[4]}`)
    if (lat >= -15 && lat <= 10 && lng >= 90 && lng <= 145)
      return { lat, lng, unparseable: false }
  }

  // Strategi 3: Format campuran — "-7.5054868,112.233597,758" (ada altitude)
  m = val.match(/^(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2])
    if (lat >= -15 && lat <= 10 && lng >= 90 && lng <= 145)
      return { lat, lng, unparseable: false }
  }

  return { lat: null, lng: null, unparseable: true }
}

// ── Ekstrak kecepatan (angka) dari nama paket ─────────────────────────────────
// Contoh: "15 Mbps Shared" → 15, "5 Mbps Shared" → 5

function parsePackageSpeed(paket) {
  if (!paket) return null
  const m = String(paket).match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

// ── Get field dari raw object dengan dot-path ────────────────────────────────

function get(obj, path) {
  if (!path) return undefined
  return path.split('.').reduce((acc, key) => acc?.[key], obj)
}

// ── Transform satu record ────────────────────────────────────────────────────

export function transformRecord(raw, fieldMap) {
  const g = (field) => fieldMap[field] ? get(raw, fieldMap[field]) : undefined

  const customerId = String(g('customerId') ?? '').trim()
  if (!customerId) return null  // Skip record tanpa ID

  // Ekstrak lat/lng dari field tikor jika lat/lng tidak dimapping langsung
  let lat = normalizeFloat(g('lat'))
  let lng = normalizeFloat(g('lng'))
  if ((lat === null || lng === null) && fieldMap._tikor) {
    const tikorRaw = get(raw, fieldMap._tikor)
    const coords   = parseTikor(tikorRaw)
    if (lat === null) lat = coords.lat
    if (lng === null) lng = coords.lng
  }


  // Ekstrak package speed dari nama paket jika tidak dimapping langsung
  let packageSpeed = normalizeInt(g('packageSpeed'))
  if (packageSpeed === null) {
    const paketRaw = fieldMap.packageName ? get(raw, fieldMap.packageName) : null
    packageSpeed   = parsePackageSpeed(paketRaw)
  }

  // Gabungkan info extra ke notes: kode wilayah + tikor mentah jika tidak bisa di-parse
  const kodeWilayah  = fieldMap._kode  ? String(get(raw, fieldMap._kode)  ?? '').trim() : ''
  const tikorRaw2    = fieldMap._tikor ? String(get(raw, fieldMap._tikor) ?? '').trim() : ''
  const notesArr     = [
    kodeWilayah ? `area:${kodeWilayah}` : '',
    // Simpan tikor asli di notes jika tidak bisa di-parse (misal URL Google Maps)
    (tikorRaw2 && (lat === null || lng === null)) ? `tikor:${tikorRaw2}` : '',
  ].filter(Boolean)

  const record = {
    customerId,
    name:          String(g('name') ?? '').trim() || null,
    phone:         normalizePhone(fieldMap.phone ? get(raw, fieldMap.phone) : null),
    address:       String(g('address') ?? '').trim() || null,
    lat,
    lng,
    onuSn:         String(g('onuSn') ?? '').trim() || null,
    onuIndex:      String(g('onuIndex') ?? '').trim() || null,
    packageName:   String(g('packageName') ?? '').trim() || null,
    packageSpeed,
    vlan:          normalizeInt(g('vlan')),
    ipAddress:     String(g('ipAddress') ?? '').trim() || null,
    pppoeUsername: String(g('pppoeUsername') ?? '').trim() || null,
    installerName: String(g('installerName') ?? '').trim() || null,
    installDate:   normalizeDate(g('installDate')),
    serviceStatus: normalizeStatus(g('serviceStatus')),
    notes:         notesArr.join(' | ') || null,

    // Referensi ODP (akan di-resolve di validator)
    _odpRef:  String(g('_odpRef') ?? '').trim() || null,
    _odpPort: normalizeInt(g('_odpPort')),
  }

  return record
}

// ── Transform batch records ──────────────────────────────────────────────────

export function transformBatch(rawItems, fieldMap) {
  const results  = []
  const skipped  = []

  for (let i = 0; i < rawItems.length; i++) {
    const rec = transformRecord(rawItems[i], fieldMap)
    if (!rec) {
      skipped.push({ index: i, reason: 'customerId kosong', raw: rawItems[i] })
    } else if (!rec.name) {
      skipped.push({ index: i, reason: 'name kosong', raw: rawItems[i] })
    } else {
      results.push(rec)
    }
  }

  console.log(`[parser] Transform: ${results.length} valid, ${skipped.length} dilewati`)
  if (skipped.length > 0) {
    skipped.slice(0, 5).forEach(s =>
      console.warn(`  [parser] Skip #${s.index}: ${s.reason}`)
    )
    if (skipped.length > 5) console.warn(`  [parser] ... dan ${skipped.length - 5} lainnya`)
  }

  return { records: results, skipped }
}
