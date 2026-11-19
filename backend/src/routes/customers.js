import ExcelJS from 'exceljs'
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { triggerCustomerSync } from '../lib/customerSync.js'
import { createRemoteSession, closeRemoteSession, getRemoteSession } from '../lib/remoteProxy.js'
import { createNatRemoteSession, closeNatRemoteSession, getNatRemoteSession } from '../lib/remoteProxyNatV2.js'
import { findCustomerInterface, getDirectCustomerTraffic } from '../lib/directTraffic.js'
import { createDriver } from '../drivers/registry.js'
import { withDriver } from '../drivers/BaseDriver.js'

const router = Router()
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function syncOdpUsedPorts(odpId, tx = prisma) {
  if (!odpId) return
  const splitterCount = await tx.splitterInstance.count({ where: { odpId } })
  let count = 0
  if (splitterCount > 0) {
    count = await tx.splitterPort.count({
      where: {
        splitterInstance: { odpId },
        connectionStatus: 'CONNECTED',
        connectedToType: { in: ['CUSTOMER', 'ODP'] }
      }
    })
  } else {
    const custCount = await tx.customer.count({ where: { odpId } })
    const dlCount = await tx.odp.count({ where: { uplinkOdpId: odpId } })
    count = custCount + dlCount
  }
  await tx.odp.update({ where: { id: odpId }, data: { usedPorts: count } })
}

/**
 * Resolve splitterPortId ke SplitterPort.id yang valid.
 * Frontend bisa mengirim format "splitterInstanceId:portNum" (dari OdpPortSelector)
 * atau langsung UUID SplitterPort. Return null jika tidak ditemukan.
 */
export async function resolvePortId(raw) {
  if (!raw) return null
  const str = String(raw).trim()
  if (str.includes(':')) {
    const [instanceId, portNumStr] = str.split(':')
    const port = await prisma.splitterPort.findFirst({
      where: { splitterInstanceId: instanceId, portNumber: parseInt(portNumStr, 10) },
      select: { id: true, portNumber: true },
    })
    return port?.id ?? null
  }
  try {
    const port = await prisma.splitterPort.findUnique({
      where: { id: str },
      select: { id: true, portNumber: true },
    })
    return port?.id ?? null
  } catch {
    return null
  }
}

/**
 * Auto-resolve splitterPortId jika hanya odpId dan odpPort yang diberikan.
 */
export async function autoResolveSplitterPort(odpId, odpPort, splitterPortId) {
  if (splitterPortId) {
    const resolved = await resolvePortId(splitterPortId)
    if (resolved) return resolved
  }
  if (odpId && odpPort) {
    // Prioritaskan splitter simetris (PLC drop pelanggan) jika ada
    const portSym = await prisma.splitterPort.findFirst({
      where: {
        splitterInstance: { 
          odpId,
          splitterType: { category: 'SYMMETRIC' }
        },
        portNumber: parseInt(odpPort, 10),
        portType: { not: 'PASS_THROUGH' },
      },
      select: { id: true }
    })
    if (portSym) return portSym.id

    const port = await prisma.splitterPort.findFirst({
      where: {
        splitterInstance: { odpId },
        portNumber: parseInt(odpPort, 10),
        portType: { not: 'PASS_THROUGH' },
      },
      orderBy: { splitterInstance: { sequenceOrder: 'desc' } },
      select: { id: true }
    })
    return port?.id ?? null
  }
  return null
}

/**
 * Claim sebuah SplitterPort untuk customer tertentu.
 * Set connectionStatus=CONNECTED, connectedToType='CUSTOMER', connectedToId=customerId
 */
export async function claimSplitterPort(splitterPortId, customerId, tx = prisma) {
  if (!splitterPortId) return
  await tx.splitterPort.update({
    where: { id: splitterPortId },
    data: {
      connectionStatus: 'CONNECTED',
      connectedToType:  'CUSTOMER',
      connectedToId:    customerId,
    },
  })
}

/**
 * Lepas SplitterPort — reset ke AVAILABLE jika masih terhubung ke customer ini.
 * Pakai customerId sebagai guard agar tidak melepas port milik customer lain.
 */
export async function releaseSplitterPort(splitterPortId, customerId, tx = prisma) {
  if (!splitterPortId) return
  await tx.splitterPort.updateMany({
    where: {
      id:              splitterPortId,
      connectedToId:   customerId,   // hanya lepas jika memang milik customer ini
      connectedToType: 'CUSTOMER',
    },
    data: {
      connectionStatus: 'AVAILABLE',
      connectedToType:  null,
      connectedToId:    null,
    },
  })
}

/**
 * Memastikan sebuah port ODP / SplitterPort belum digunakan oleh pelanggan lain atau ODP downlink.
 * Melempar error dengan status 409 jika port konflik.
 */
export async function assertPortAvailable({ odpId, odpPort, splitterPortId, excludeCustomerId = null, tx = prisma }) {
  if (!odpId && !splitterPortId) return { available: true, resolvedPortId: null }

  let targetPortId = null
  if (splitterPortId) {
    targetPortId = await resolvePortId(splitterPortId)
  }
  if (!targetPortId && odpId && odpPort) {
    targetPortId = await autoResolveSplitterPort(odpId, odpPort, null)
  }

  // 1. Validasi di tabel SplitterPort
  if (targetPortId) {
    const port = await tx.splitterPort.findUnique({
      where: { id: targetPortId },
      include: {
        splitterInstance: { include: { odp: { select: { id: true, name: true } } } }
      }
    })

    if (port) {
      const odpName = port.splitterInstance?.odp?.name || 'ODP'

      if (port.connectedToType === 'SPLITTER') {
        const err = new Error(`Port ${port.portNumber} pada ODP "${odpName}" adalah internal feeder yang disambung ke Splitter berikutnya dan tidak dapat digunakan untuk pelanggan.`)
        err.status = 409
        throw err
      }

      if (port.portType === 'PASS_THROUGH') {
        const err = new Error(`Port ${port.portNumber} pada ODP "${odpName}" adalah port PASS-THROUGH (feeder) dan tidak dapat digunakan untuk pelanggan.`)
        err.status = 409
        throw err
      }

      if (port.connectionStatus === 'CONNECTED' && port.connectedToType === 'ODP') {
        let childName = 'ODP Lain'
        if (port.connectedToId) {
          const childOdp = await tx.odp.findUnique({ where: { id: port.connectedToId }, select: { name: true } })
          if (childOdp) childName = childOdp.name
        }
        const err = new Error(`Port ${port.portNumber} pada ODP "${odpName}" sudah digunakan sebagai feeder uplink untuk ODP "${childName}".`)
        err.status = 409
        throw err
      }

      if (port.connectionStatus === 'CONNECTED' && port.connectedToType === 'CUSTOMER') {
        if (!excludeCustomerId || port.connectedToId !== excludeCustomerId) {
          let occupantName = 'pelanggan lain'
          if (port.connectedToId) {
            const occCust = await tx.customer.findUnique({ where: { id: port.connectedToId }, select: { name: true, customerId: true } })
            if (occCust) occupantName = `pelanggan ${occCust.name} (${occCust.customerId})`
          }
          const err = new Error(`Port ${port.portNumber} pada ODP "${odpName}" sudah digunakan oleh ${occupantName}. Satu port tidak boleh digunakan oleh lebih dari 1 pelanggan.`)
          err.status = 409
          throw err
        }
      }
    }
  }

  // 2. Validasi numerik di tabel Customer (mencegah duplikasi odpId + odpPort)
  if (odpId && odpPort) {
    const pNum = parseInt(odpPort, 10)
    const existing = await tx.customer.findFirst({
      where: {
        odpId,
        odpPort: pNum,
        ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {})
      },
      select: { id: true, name: true, customerId: true, odp: { select: { name: true } } }
    })

    if (existing) {
      const odpName = existing.odp?.name || 'ODP'
      const err = new Error(`Port ${pNum} pada ODP "${odpName}" sudah digunakan oleh pelanggan ${existing.name} (${existing.customerId}). Satu port tidak boleh digunakan oleh lebih dari 1 pelanggan.`)
      err.status = 409
      throw err
    }
  }

  return { available: true, resolvedPortId: targetPortId }
}


// ── Helper: Extract Coordinates from Maps URL ─────────────────────────────────
function extractCoordsFromUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null
  let m = urlStr.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  m = urlStr.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  m = urlStr.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  return null
}

// ── GET /api/customers/resolve-maps-url ───────────────────────────────────────
router.get('/resolve-maps-url', async (req, res, next) => {
  try {
    const rawUrl = (req.query.url || '').trim()
    if (!rawUrl) return res.status(400).json({ error: 'Parameter url diperlukan' })
    
    // Check if it already has coordinates
    let coords = extractCoordsFromUrl(rawUrl)
    if (coords) {
      return res.json({ success: true, lat: coords.lat, lng: coords.lng, resolvedUrl: rawUrl })
    }

    if (!/https?:\/\/([a-zA-Z0-9_-]+\.)*(google\.com|goo\.gl|page\.link)\//i.test(rawUrl)) {
      return res.status(400).json({ error: 'URL harus berupa tautan Google Maps' })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const resp = await fetch(rawUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    clearTimeout(timeout)
    const finalUrl = resp.url || rawUrl
    coords = extractCoordsFromUrl(finalUrl)

    if (!coords) {
      return res.status(422).json({
        error: 'Tidak dapat mengekstrak koordinat dari link Google Maps ini',
        resolvedUrl: finalUrl
      })
    }

    res.json({
      success: true,
      lat: coords.lat,
      lng: coords.lng,
      resolvedUrl: finalUrl
    })
  } catch (err) {
    res.status(500).json({ error: 'Gagal memproses URL: ' + err.message })
  }
})


// ── GET /api/customers/export-coords-excel ────────────────────────────────────
router.get('/export-coords-excel', async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      select: {
        customerId: true,
        name: true,
        pppoeUsername: true,
        phone: true,
        address: true,
        lat: true,
        lng: true,
      },
      orderBy: { customerId: 'asc' },
    })

    const wb = new ExcelJS.Workbook()
    wb.creator = 'InfraManager'
    wb.created = new Date()

    // 1. Sheet Data Pelanggan
    const ws = wb.addWorksheet('Data Pelanggan', {
      views: [{ state: 'frozen', ySplit: 1 }]
    })

    ws.columns = [
      { header: 'ID Pelanggan', key: 'customerId', width: 16 },
      { header: 'Nama Pelanggan', key: 'name', width: 28 },
      { header: 'Username PPPoE', key: 'pppoeUsername', width: 22 },
      { header: 'No. Telepon', key: 'phone', width: 18 },
      { header: 'Alamat', key: 'address', width: 34 },
      { header: 'Latitude', key: 'lat', width: 15 },
      { header: 'Longitude', key: 'lng', width: 15 },
      { header: 'Titik Koordinat / Link Maps (Paling Mudah)', key: 'rawCoord', width: 44 },
      { header: 'Status Saat Ini', key: 'status', width: 22 }
    ]

    const headerRow = ws.getRow(1)
    headerRow.height = 28
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      }
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: 'FFFFFFFF' }
      }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })

    const cellH = headerRow.getCell(8)
    cellH.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' }
    }

    customers.forEach((c, idx) => {
      const hasCoord = c.lat && c.lng
      const row = ws.addRow({
        customerId: c.customerId,
        name: c.name,
        pppoeUsername: c.pppoeUsername || '',
        phone: c.phone || '',
        address: c.address || '',
        lat: c.lat ? Number(c.lat) : '',
        lng: c.lng ? Number(c.lng) : '',
        rawCoord: hasCoord ? `${c.lat}, ${c.lng}` : '',
        status: hasCoord ? 'SUDAH ADA TIKOR' : 'BELUM ADA TIKOR'
      })

      row.height = 20
      row.alignment = { vertical: 'middle' }

      if (idx % 2 === 1) {
        row.eachCell((cell, colNumber) => {
          if (colNumber !== 8) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' }
            }
          }
        })
      }

      const targetCell = row.getCell(8)
      targetCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFBEB' }
      }

      const statusCell = row.getCell(9)
      if (hasCoord) {
        statusCell.font = { color: { argb: 'FF15803D' }, bold: true }
      } else {
        statusCell.font = { color: { argb: 'FFB45309' } }
      }
    })

    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: customers.length + 1, column: 9 }
    }

    // 2. Sheet Panduan
    const guideWs = wb.addWorksheet('Panduan Pengisian')
    guideWs.columns = [
      { header: 'No', width: 6 },
      { header: 'Panduan & Cara Pengisian', width: 70 },
      { header: 'Contoh Input yang Valid', width: 45 }
    ]

    const guideHeader = guideWs.getRow(1)
    guideHeader.height = 26
    guideHeader.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })

    const guides = [
      {
        no: 1,
        desc: 'CARA TERCEPAT: Buka WhatsApp / Google Maps, salin link lokasi lalu paste langsung ke Kolom H (Titik Koordinat / Link Maps).',
        sample: 'https://maps.app.goo.gl/GB9cuMXAU8MKU7ov6'
      },
      {
        no: 2,
        desc: 'Ketik atau paste angka koordinat (Latitude, Longitude) sekaligus di Kolom H.',
        sample: '-7.522185, 112.230038 ATAU -7.522185 112.230038'
      },
      {
        no: 3,
        desc: 'Format koma desimal Indonesia juga didukung secara otomatis.',
        sample: '-7,522185 112,230038'
      },
      {
        no: 4,
        desc: 'Atau jika Anda sudah memiliki data terpisah, Anda dapat mengisi Kolom F (Latitude) dan Kolom G (Longitude).',
        sample: 'Lat: -7.522185 | Lng: 112.230038'
      },
      {
        no: 5,
        desc: 'Kolom ID Pelanggan, Nama, dan Username jangan diubah agar sistem dapat mencocokkan pelanggan secara otomatis.',
        sample: 'Biarkan ID Pelanggan tetap apa adanya'
      },
      {
        no: 6,
        desc: 'Setelah selesai mengisi Excel ini, buka aplikasi web InfraManager -> Menu Pelanggan -> Klik "Import Tikor (Excel)" -> Upload file ini.',
        sample: 'Sistem akan memvalidasi & menampilkan review'
      }
    ]

    guides.forEach(g => {
      const r = guideWs.addRow({ no: g.no, desc: g.desc, sample: g.sample })
      r.height = 36
      r.alignment = { vertical: 'middle', wrapText: true }
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="template_koordinat_pelanggan_jgrt.xlsx"')
    await wb.xlsx.write(res)
    res.end()
  } catch (err) {
    next(err)
  }
})

// ── GET /api/customers/export-coords-template ─────────────────────────────────
router.get('/export-coords-template', async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({
      select: {
        customerId: true,
        name: true,
        pppoeUsername: true,
        phone: true,
        address: true,
        lat: true,
        lng: true,
      },
      orderBy: { customerId: 'asc' },
    })

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return ''
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    const headers = [
      'customer_id',
      'nama_pelanggan',
      'pppoe_username',
      'telepon',
      'alamat',
      'latitude',
      'longitude',
      'titik_koordinat_atau_link_maps',
      'status_data'
    ]

    let csvContent = '\ufeff' + headers.join(',') + '\n'

    // Contoh baris petunjuk
    csvContent += [
      'CONTOH_01',
      '"CONTOH: BISA PASTE LINK GOOGLE MAPS"',
      'user_contoh1',
      '08123456789',
      '"Jl. Raya Contoh No. 1"',
      '',
      '',
      '"https://maps.app.goo.gl/GB9cuMXAU8MKU7ov6"',
      '"(CONTOH - HAPUS/LEWATI BARIS INI)"'
    ].join(',') + '\n'

    csvContent += [
      'CONTOH_02',
      '"CONTOH: BISA KETIK ANGKA LAT,LNG"',
      'user_contoh2',
      '08123456789',
      '"Jl. Raya Contoh No. 2"',
      '-7.522185',
      '112.230037',
      '"-7.522185, 112.230037"',
      '"(CONTOH - HAPUS/LEWATI BARIS INI)"'
    ].join(',') + '\n'

    for (const c of customers) {
      const status = (c.lat && c.lng) ? 'SUDAH_ADA' : 'BELUM_ADA'
      const row = [
        escapeCsv(c.customerId),
        escapeCsv(c.name),
        escapeCsv(c.pppoeUsername || ''),
        escapeCsv(c.phone || ''),
        escapeCsv(c.address || ''),
        escapeCsv(c.lat != null ? c.lat : ''),
        escapeCsv(c.lng != null ? c.lng : ''),
        escapeCsv((c.lat && c.lng) ? `${c.lat}, ${c.lng}` : ''),
        escapeCsv(status)
      ]
      csvContent += row.join(',') + '\n'
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="template_koordinat_pelanggan_jgrt.csv"')
    res.send(csvContent)
  } catch (err) { next(err) }
})

// ── POST /api/customers/bulk-coords ───────────────────────────────────────────
router.post('/bulk-coords', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { rows } = req.body
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Array baris data (rows) wajib disertakan' })
    }

    const parseCoordString = (val) => {
      if (!val || typeof val !== 'string') return null
      const str = val.trim()
      const urlCoords = extractCoordsFromUrl(str)
      if (urlCoords) return urlCoords
      let commaMatch = str.match(/(-?\d+),(\d{4,})[\s,]+(\d+),(\d{4,})/)
      if (commaMatch) {
        return {
          lat: parseFloat(`${commaMatch[1]}.${commaMatch[2]}`),
          lng: parseFloat(`${commaMatch[3]}.${commaMatch[4]}`)
        }
      }
      let dotMatch = str.match(/(-?\d+\.\d+)[\s,]+(\d+\.\d+)/)
      if (dotMatch) {
        return {
          lat: parseFloat(dotMatch[1]),
          lng: parseFloat(dotMatch[2])
        }
      }
      return null
    }

    const allCustomers = await prisma.customer.findMany({
      select: { id: true, customerId: true, name: true, pppoeUsername: true, phone: true }
    })

    const byId = new Map()
    const byName = new Map()
    const byPppoe = new Map()

    for (const c of allCustomers) {
      if (c.customerId) byId.set(c.customerId.trim().toLowerCase(), c)
      if (c.name) byName.set(c.name.trim().toLowerCase(), c)
      if (c.pppoeUsername) byPppoe.set(c.pppoeUsername.trim().toLowerCase(), c)
    }

    let updatedCount = 0
    let skippedCount = 0
    const details = []

    for (let i = 0; i < rows.length; i++) {
      const item = rows[i]
      const rawKey = (item.customerId || item.customer_id || item.idPelanggan || item.name || item.nama || item.pppoeUsername || item.pppoe_username || '').toString().trim()
      if (!rawKey || rawKey.startsWith('CONTOH_')) {
        continue
      }

      const lowerKey = rawKey.toLowerCase()
      const cust = byId.get(lowerKey) || byPppoe.get(lowerKey) || byName.get(lowerKey)

      if (!cust) {
        skippedCount++
        details.push({ row: i + 1, key: rawKey, status: 'NOT_FOUND', message: 'Pelanggan tidak ditemukan di database' })
        continue
      }

      let lat = null
      let lng = null

      if (item.lat != null && item.lng != null && !isNaN(parseFloat(item.lat)) && !isNaN(parseFloat(item.lng))) {
        lat = parseFloat(item.lat)
        lng = parseFloat(item.lng)
      } else {
        const rawTikor = (item.tikor || item.titik_koordinat_atau_link_maps || item.titik_koordinat || item.koordinat || item.mapsUrl || '').toString()
        const parsed = parseCoordString(rawTikor)
        if (parsed) {
          lat = parsed.lat
          lng = parsed.lng
        }
      }

      if (lat == null || lng == null) {
        skippedCount++
        details.push({ row: i + 1, customerId: cust.customerId, name: cust.name, status: 'INVALID_COORDS', message: 'Format titik koordinat kosong atau tidak valid' })
        continue
      }

      await prisma.customer.update({
        where: { id: cust.id },
        data: { lat, lng }
      })

      updatedCount++
      details.push({ row: i + 1, customerId: cust.customerId, name: cust.name, lat, lng, status: 'UPDATED' })
    }

    res.json({
      success: true,
      totalReceived: rows.length,
      updatedCount,
      skippedCount,
      details
    })
  } catch (err) { next(err) }
})

// ── GET /api/customers ────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    void triggerCustomerSync().catch(error => {
      console.error(`[customer-sync] ${error.message}`)
    })
    const { q, status, connectionStatus, odpId, page = '1', limit = '50' } = req.query
    const take = Math.min(parseInt(limit) || 50, 200)
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take

    const where = {}
    if (status) where.serviceStatus = status.toUpperCase()
    if (connectionStatus) where.connectionStatus = connectionStatus.toUpperCase()
    if (odpId)  where.odpId = odpId
    if (q) {
      where.OR = [
        { name:          { contains: q, mode: 'insensitive' } },
        { customerId:    { contains: q, mode: 'insensitive' } },
        { address:       { contains: q, mode: 'insensitive' } },
        { pppoeUsername: { contains: q, mode: 'insensitive' } },
        { onuSn:         { contains: q, mode: 'insensitive' } },
      ]
    }

    const [total, customers] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        include: {
          odp: { select: { id: true, name: true } },
          sourceDevice: { select: { id: true, name: true } },
          htbBox: { select: { id: true, name: true, modelType: true } },
          htbPort: { select: { id: true, portType: true, portIndex: true, label: true, wavelength: true } },
          hostedHtbBoxes: { select: { id: true, name: true } },
          bridgedHtbBoxes: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
        take,
        skip,
      }),
    ])

    res.json({ data: customers, total, page: parseInt(page), limit: take })
  } catch (e) { next(e) }
})

// ── GET /api/customers/stats ──────────────────────────────────────────────────

router.get('/stats', async (req, res, next) => {
  try {
    void triggerCustomerSync().catch(error => {
      console.error(`[customer-sync] ${error.message}`)
    })
    const groups = await prisma.customer.groupBy({
      by: ['serviceStatus'],
      _count: { _all: true },
    })
    const stats = { ACTIVE: 0, SUSPENDED: 0, TERMINATED: 0, ONLINE: 0, OFFLINE: 0, UNKNOWN: 0, total: 0 }
    groups.forEach(g => {
      stats[g.serviceStatus] = g._count._all
      stats.total += g._count._all
    })
    const connectionGroups = await prisma.customer.groupBy({
      by: ['connectionStatus'],
      _count: { _all: true },
    })
    connectionGroups.forEach(g => { stats[g.connectionStatus] = g._count._all })
    const [activeOnline, activeOffline] = await Promise.all([
      prisma.customer.count({ where: { serviceStatus: 'ACTIVE', connectionStatus: 'ONLINE' } }),
      prisma.customer.count({ where: { serviceStatus: 'ACTIVE', connectionStatus: 'OFFLINE' } }),
    ])
    stats.ONLINE = activeOnline
    stats.OFFLINE = activeOffline
    const syncDevices = await prisma.device.findMany({
      where: { type: 'ROUTER', vendor: { not: null } },
      select: { id: true, name: true, vendor: true, customerSyncAt: true, customerSyncStatus: true, customerSyncError: true },
    })
    res.json({
      ...stats,
      customerSync: syncDevices
        .filter(device => /mikrotik|routeros/i.test(device.vendor || ''))
        .map(({ id, name, vendor, customerSyncAt, customerSyncStatus, customerSyncError }) => ({
          deviceId: id,
          deviceName: name,
          vendor,
          lastSyncAt: customerSyncAt,
          status: customerSyncStatus || 'PENDING',
          error: customerSyncError,
        })),
    })
  } catch (e) { next(e) }
})

// ── GET /api/customers/:id ────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        odp: {
          include: {
            olt: { select: { id: true, name: true } },
          },
        },
        splitterPort: {
          include: {
            splitterInstance: {
              include: { splitterType: true },
            },
          },
        },
        sourceDevice: { select: { id: true, name: true, ip: true, mgmtPort: true, snmpCommunity: true, snmpVersion: true } },
        htbBox: {
          include: {
            ports: true,
            uplinkHtb: { select: { id: true, name: true } },
          },
        },
        htbPort: true,
        hostedHtbBoxes: { select: { id: true, name: true, modelType: true, address: true } },
        bridgedHtbBoxes: { select: { id: true, name: true, modelType: true, address: true } },
      },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    res.json(customer)
  } catch (e) { next(e) }
})

// ── GET /api/customers/:id/traffic ───────────────────────────────────────────

router.get('/:id/traffic', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        pppoeUsername: true,
        sourceDevice: { select: { id: true, name: true, ip: true, mgmtPort: true, snmpCommunity: true, snmpVersion: true } },
      },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (!customer.pppoeUsername || !customer.sourceDevice) {
      return res.json({ configured: false, reason: 'PPPoE session atau perangkat sumber belum tersedia' })
    }

    const port = await findCustomerInterface({ username: customer.pppoeUsername, device: customer.sourceDevice })
    res.json({
      configured: Boolean(port),
      username: customer.pppoeUsername,
      device: { id: customer.sourceDevice.id, hostname: customer.sourceDevice.name },
      port: port ? {
        id: port.ifIndex,
        name: port.name,
        description: port.description,
        alias: port.alias,
        status: port.operStatus,
      } : null,
    })
  } catch (e) {
    res.status(502).json({ error: 'SNMP error', detail: e.message })
  }
})

// ── GET /api/customers/:id/traffic/series ────────────────────────────────────

router.get('/:id/traffic/series', async (req, res, next) => {
  try {
    const rangeHours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 }[req.query.range] || 24
    const samples = await prisma.customerTrafficSample.findMany({
      where: { customerId: req.params.id, sampledAt: { gte: new Date(Date.now() - rangeHours * 60 * 60 * 1000) } },
      orderBy: { sampledAt: 'asc' },
      select: { sampledAt: true, inBps: true, outBps: true },
    })
    res.json({ intervalSeconds: 300, samples: samples.map(sample => ({ timestamp: sample.sampledAt, inBps: sample.inBps, outBps: sample.outBps })) })
  } catch (e) { next(e) }
})

// ── GET /api/customers/:id/traffic/live ──────────────────────────────────────

router.get('/:id/traffic/live', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        pppoeUsername: true,
        sourceDevice: true,
      },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (!customer.pppoeUsername || !customer.sourceDevice) {
      return res.status(422).json({ error: 'PPPoE session atau perangkat sumber belum tersedia' })
    }

    const device = customer.sourceDevice
    const isMikrotik = /mikrotik|routeros/i.test(device.vendor || '') || device.mgmtProtocol === 'API'

    // 1. MikroTik instant monitor-traffic via RouterOS API (30-40ms response)
    if (isMikrotik) {
      try {
        const driver = createDriver(device)
        const rate = await withDriver(driver, async d => {
          const cleanUser = customer.pppoeUsername.trim()
          const candidateNames = [
            `<pppoe-${cleanUser}>`,
            `pppoe-${cleanUser}`,
            cleanUser,
          ]

          for (const ifaceName of candidateNames) {
            try {
              const mon = await d._cmd('/interface/monitor-traffic', [
                `=interface=${ifaceName}`,
                '=once='
              ])
              if (mon && mon[0]) {
                const rxBps = Number(mon[0]['rx-bits-per-second'] || 0)
                const txBps = Number(mon[0]['tx-bits-per-second'] || 0)
                return {
                  timestamp: new Date().toISOString(),
                  inBps: rxBps,
                  outBps: txBps,
                  source: 'mikrotik-api',
                }
              }
            } catch (_) {}
          }
          return null
        })

        if (rate) {
          res.set('Cache-Control', 'private, max-age=1')
          return res.json(rate)
        }
      } catch (err) {
        console.warn(`[traffic/live:${customer.pppoeUsername}] RouterOS API fallback to SNMP: ${err.message}`)
      }
    }

    // 2. Fallback to SNMP
    const mapping = await findCustomerInterface({ username: customer.pppoeUsername, device })
    const directRate = await getDirectCustomerTraffic({
      username: customer.pppoeUsername,
      device,
      ifIndex: mapping?.ifIndex,
    })
    const rate = directRate?.unavailable ? null : directRate
    if (!rate) return res.status(425).json({ error: 'Menunggu pembacaan SNMP berikutnya' })
    res.set('Cache-Control', 'private, max-age=1')
    res.json({ ...rate, source: 'snmp-realtime' })
  } catch (e) {
    res.status(502).json({ error: 'Traffic error', detail: e.message })
  }
})

// ── GET /api/customers/:id/traffic/graph ─────────────────────────────────────

router.get('/:id/traffic/graph', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { pppoeUsername: true, sourceDevice: { select: { name: true, ip: true } } },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (!customer.pppoeUsername || !customer.sourceDevice) {
      return res.status(422).json({ error: 'PPPoE session atau perangkat sumber belum tersedia' })
    }

    const rangeHours = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 }[req.query.range] || 24
    const samples = await prisma.customerTrafficSample.findMany({
      where: { customerId: req.params.id, sampledAt: { gte: new Date(Date.now() - rangeHours * 60 * 60 * 1000) } },
      orderBy: { sampledAt: 'asc' },
      select: { sampledAt: true, inBps: true, outBps: true },
    })
    res.set('Cache-Control', 'private, max-age=60')
    res.json({ intervalSeconds: 300, samples: samples.map(sample => ({ timestamp: sample.sampledAt, inBps: sample.inBps, outBps: sample.outBps })) })
  } catch (e) {
    res.status(502).json({ error: 'Traffic error', detail: e.message })
  }
})

// ── Temporary remote ONU access ──────────────────────────────────────────────

router.post('/:id/remote-session', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  let usingNatV2 = false
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        ipAddress: true,
        onuSn: true,
        onuIndex: true,
        odp: { select: { olt: { select: { vendor: true, model: true } } } },
      },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })
    if (!customer.ipAddress) return res.status(422).json({ error: 'IP ONU belum tersedia' })

    const publicUrl = process.env.REMOTE_PROXY_PUBLIC_URL || `${req.protocol}://${req.hostname}`
    const targetPort = Number(process.env.REMOTE_PROXY_TARGET_PORT || 80)
    const proxySettings = await prisma.remoteOnuSetting.findUnique({ where: { id: 'remote-onu' } })
    if (proxySettings?.version === 'v2') {
      usingNatV2 = true
      const session = await createNatRemoteSession({
        targetHost: customer.ipAddress,
        targetPort,
        ownerId: req.user.id,
        customerId: req.params.id,
        publicUrl,
        sourceCidr: proxySettings.natSourceCidr,
        ingressInterface: proxySettings.natIngressInterface,
      })
      if (process.env.REMOTE_PROXY_DIAGNOSTICS !== 'false') {
        const userAgent = String(req.headers['user-agent'] || '')
        console.info('[remote-diag]', JSON.stringify({
          event: 'session-created',
          session: session.id.slice(0, 8),
          version: 'v2',
          platform: /android|iphone|ipad|ipod|mobile/i.test(userAgent) ? 'mobile' : /windows|macintosh|linux|x11/i.test(userAgent) ? 'desktop' : 'unknown',
          userAgent: userAgent.slice(0, 240),
          onuIp: customer.ipAddress,
          onuModel: 'unknown (not stored)',
          onuSerialSuffix: customer.onuSn ? customer.onuSn.slice(-4) : null,
          onuIndex: customer.onuIndex,
          oltVendor: customer.odp?.olt?.vendor || null,
          oltModel: customer.odp?.olt?.model || null,
        }))
      }
      return res.status(201).json(session)
    }

    const session = await createRemoteSession({
      targetHost: customer.ipAddress,
      targetPort,
      ownerId: req.user.id,
      customerId: req.params.id,
      publicUrl,
      onuSerial: customer.onuSn,
      onuIndex: customer.onuIndex,
      oltVendor: customer.odp?.olt?.vendor,
      oltModel: customer.odp?.olt?.model,
      clientUserAgent: req.headers['user-agent'],
    })
    res.status(201).json(session)
  } catch (e) {
    if (usingNatV2) {
      const validationError = /^(IP ONU|NAT v2 hanya mendukung|Port ONU|Interface ingress|Allowlist|Port NAT|REMOTE_PROXY_PUBLIC_URL)/i.test(e.message)
      return res.status(validationError ? 422 : 503).json({ error: e.message })
    }
    if (/IP ONU|Port ONU|port range|Jumlah sesi|Gagal membuka|PUBLIC_URL/.test(e.message)) {
      return res.status(422).json({ error: e.message })
    }
    next(e)
  }
})

router.get('/:id/remote-session/:sessionId', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  const session = getNatRemoteSession(req.params.sessionId, req.user.id, req.params.id)
    || getRemoteSession(req.params.sessionId, req.user.id, req.params.id)
  if (!session) return res.status(404).json({ error: 'Remote session expired or not found' })
  res.json(session)
})

router.delete('/:id/remote-session/:sessionId', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const closedNat = await closeNatRemoteSession(req.params.sessionId, req.user.id, req.params.id)
    if (!closedNat) closeRemoteSession(req.params.sessionId, req.user.id, req.params.id)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

// ── POST /api/customers ───────────────────────────────────────────────────────

router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const {
      customerId, name, phone, address, lat, lng,
      odpId, odpPort, splitterPortId,
      distributionType, htbBoxId, htbPortId, cpeType,
      onuSn, onuIndex, rxPower, txPower,
      packageName, packageSpeed, vlan, ipAddress, pppoeUsername, pppoePassword,
      installerName, installDate, contractExpiry,
      serviceStatus, notes,
    } = req.body

    if (!customerId) return res.status(400).json({ error: 'customerId wajib diisi' })
    if (!name)       return res.status(400).json({ error: 'name wajib diisi' })

    // Resolve format "instanceId:portNum" → SplitterPort UUID
    // Validasi defensif: pastikan port tidak sedang dipakai pelanggan lain / ODP lain
    let resolvedPortId = null
    try {
      if (distributionType !== 'HTB') {
        const check = await assertPortAvailable({
          odpId: odpId || null,
          odpPort: odpPort ? parseInt(odpPort, 10) : null,
          splitterPortId: splitterPortId || null,
          excludeCustomerId: null,
        })
        resolvedPortId = check.resolvedPortId
      }
      if (distributionType === 'HTB' && htbPortId) {
        await assertHtbPortAvailable({ htbBoxId, htbPortId, excludeCustomerId: null })
      }
    } catch (err) {
      if (err.status === 409) return res.status(409).json({ error: err.message })
      throw err
    }

    const customer = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.create({
        data: {
          customerId, name, phone: phone || null, address,
          lat: lat ? parseFloat(lat) : null,
          lng: lng ? parseFloat(lng) : null,
          distributionType: distributionType || 'ODP',
          odpId:          distributionType === 'HTB' ? null : (odpId || null),
          odpPort:        distributionType === 'HTB' ? null : (odpPort ? parseInt(odpPort) : null),
          splitterPortId: distributionType === 'HTB' ? null : (resolvedPortId || null),
          htbBoxId:       distributionType === 'HTB' ? (htbBoxId || null) : null,
          htbPortId:      distributionType === 'HTB' ? (htbPortId || null) : null,
          cpeType:        cpeType || null,
          onuSn:          onuSn || null,
          onuIndex:       onuIndex || null,
          rxPower:        rxPower != null ? parseFloat(rxPower) : null,
          txPower:        txPower != null ? parseFloat(txPower) : null,
          packageName:    packageName || null,
          packageSpeed:   packageSpeed ? parseInt(packageSpeed) : null,
          vlan:           vlan ? parseInt(vlan) : null,
          ipAddress:      ipAddress || null,
          pppoeUsername:  pppoeUsername || null,
          pppoePassword:  pppoePassword || null,
          installerName:  installerName || null,
          installDate:    installDate ? new Date(installDate) : null,
          contractExpiry: contractExpiry ? new Date(contractExpiry) : null,
          serviceStatus:  serviceStatus || 'ACTIVE',
          notes:          notes || null,
        },
      })
      if (distributionType !== 'HTB') {
        await claimSplitterPort(resolvedPortId || null, c.id, tx)
        await syncOdpUsedPorts(odpId || null, tx)
      } else if (htbPortId) {
        await claimHtbPort(htbPortId, c.id, tx)
      }
      return c
    })

    res.status(201).json(customer)
  } catch (e) {
    if (e.code === 'P2002') {
      const field = e.meta?.target?.[0] ?? 'field'
      return res.status(409).json({ error: `Nilai ${field} sudah digunakan` })
    }
    next(e)
  }
})

// ── PATCH /api/customers/:id ──────────────────────────────────────────────────

router.patch('/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const existing = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { odpId: true, splitterPortId: true },
    })
    if (!existing) return res.status(404).json({ error: 'Customer not found' })

    const {
      customerId, name, phone, address, lat, lng,
      odpId, odpPort, splitterPortId,
      distributionType, htbBoxId, htbPortId, cpeType,
      onuSn, onuIndex, rxPower, txPower,
      packageName, packageSpeed, vlan, ipAddress, pppoeUsername, pppoePassword,
      installerName, installDate, contractExpiry,
      serviceStatus, notes,
    } = req.body

    const oldSplitterPortId = existing.splitterPortId
    const targetOdpId = odpId !== undefined ? odpId : existing.odpId
    const targetOdpPort = odpPort !== undefined ? odpPort : existing.odpPort

    let resolvedNewPortId = null
    if (splitterPortId !== undefined) {
      resolvedNewPortId = await resolvePortId(splitterPortId)
    } else if (existing.splitterPortId && (odpId !== undefined || odpPort !== undefined)) {
      resolvedNewPortId = null
    } else {
      resolvedNewPortId = existing.splitterPortId
    }

    if (!resolvedNewPortId && targetOdpId && targetOdpPort) {
      resolvedNewPortId = await autoResolveSplitterPort(targetOdpId, targetOdpPort, null)
    }
    const newSplitterPortId = resolvedNewPortId

    const data = {}
    if (customerId    !== undefined) data.customerId    = customerId
    if (name          !== undefined) data.name          = name
    if (phone         !== undefined) data.phone         = phone || null
    if (address       !== undefined) data.address       = address
    if (lat           !== undefined) data.lat           = lat ? parseFloat(lat) : null
    if (lng           !== undefined) data.lng           = lng ? parseFloat(lng) : null
    if (distributionType !== undefined) data.distributionType = distributionType
    if (htbBoxId      !== undefined) data.htbBoxId      = htbBoxId || null
    if (htbPortId     !== undefined) data.htbPortId     = htbPortId || null
    if (cpeType       !== undefined) data.cpeType       = cpeType || null
    if (odpId         !== undefined) data.odpId         = odpId || null
    if (odpPort       !== undefined) data.odpPort       = odpPort ? parseInt(odpPort) : null
    if (splitterPortId !== undefined) data.splitterPortId = resolvedNewPortId || null
    if (onuSn         !== undefined) data.onuSn         = onuSn || null
    if (onuIndex      !== undefined) data.onuIndex      = onuIndex || null
    if (rxPower       !== undefined) data.rxPower       = rxPower != null ? parseFloat(rxPower) : null
    if (txPower       !== undefined) data.txPower       = txPower != null ? parseFloat(txPower) : null
    if (packageName   !== undefined) data.packageName   = packageName || null
    if (packageSpeed  !== undefined) data.packageSpeed  = packageSpeed ? parseInt(packageSpeed) : null
    if (vlan          !== undefined) data.vlan          = vlan ? parseInt(vlan) : null
    if (ipAddress     !== undefined) data.ipAddress     = ipAddress || null
    if (pppoeUsername !== undefined) data.pppoeUsername = pppoeUsername || null
    if (pppoePassword !== undefined) data.pppoePassword = pppoePassword || null
    if (installerName !== undefined) data.installerName = installerName || null
    if (installDate   !== undefined) data.installDate   = installDate ? new Date(installDate) : null
    if (contractExpiry !== undefined) data.contractExpiry = contractExpiry ? new Date(contractExpiry) : null
    if (serviceStatus !== undefined) data.serviceStatus = serviceStatus
    if (notes         !== undefined) data.notes         = notes || null
    // Validasi defensif: pastikan port baru tidak sedang dipakai pelanggan lain / ODP lain
    const portNeedsCheck = odpId !== undefined || odpPort !== undefined || splitterPortId !== undefined
    if (portNeedsCheck && (targetOdpId || newSplitterPortId) && distributionType !== 'HTB') {
      try {
        await assertPortAvailable({
          odpId: targetOdpId || null,
          odpPort: targetOdpPort ? parseInt(targetOdpPort, 10) : null,
          splitterPortId: newSplitterPortId || null,
          excludeCustomerId: req.params.id,
        })
      } catch (err) {
        if (err.status === 409) return res.status(409).json({ error: err.message })
        throw err
      }
    }

    if (htbPortId !== undefined && htbPortId && htbPortId !== existing.htbPortId) {
      try {
        await assertHtbPortAvailable({
          htbBoxId: htbBoxId || existing.htbBoxId,
          htbPortId,
          excludeCustomerId: req.params.id,
        })
      } catch (err) {
        if (err.status === 409) return res.status(409).json({ error: err.message })
        throw err
      }
    }

    const customer = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.update({ where: { id: req.params.id }, data })

      // Lepas port ODP lama jika berbeda
      if (portChanged && oldSplitterPortId) {
        await releaseSplitterPort(oldSplitterPortId, req.params.id, tx)
      }
      // Claim port ODP baru
      if (portChanged && newSplitterPortId) {
        await claimSplitterPort(newSplitterPortId, req.params.id, tx)
      }

      // Handle HTB port change
      if (htbPortId !== undefined && htbPortId !== existing.htbPortId) {
        if (existing.htbPortId) {
          await releaseHtbPort(existing.htbPortId, tx)
        }
        if (htbPortId) {
          await claimHtbPort(htbPortId, req.params.id, tx)
        }
      }

      // Sync usedPorts ODP lama dan baru
      const oldOdp = existing.odpId
      const newOdp = data.odpId !== undefined ? (data.odpId || null) : existing.odpId
      if (oldOdp && oldOdp !== newOdp) await syncOdpUsedPorts(oldOdp, tx)
      if (newOdp) await syncOdpUsedPorts(newOdp, tx)

      return c
    })

    res.json(customer)
  } catch (e) {
    if (e.code === 'P2002') {
      const field = e.meta?.target?.[0] ?? 'field'
      return res.status(409).json({ error: `Nilai ${field} sudah digunakan` })
    }
    next(e)
  }
})

// ── DELETE /api/customers/:id ─────────────────────────────────────────────────

router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      select: { odpId: true, splitterPortId: true, htbPortId: true, name: true },
    })
    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    // Safeguard: Check if this customer is a Bridge Gateway for an HTB Box
    const bridgeBox = await prisma.htbBox.findFirst({
      where: { uplinkCustomerId: req.params.id },
      select: { name: true },
    })
    if (bridgeBox) {
      return res.status(409).json({
        error: `Tidak dapat menghapus pelanggan "${customer.name}" karena ONU-nya saat ini menjadi Bridge Uplink untuk Box HTB "${bridgeBox.name}". Pindahkan sumber uplink Box HTB tersebut terlebih dahulu.`
      })
    }

    await prisma.$transaction(async (tx) => {
      // 1. Release SplitterPort jika ada
      if (customer.splitterPortId) {
        await releaseSplitterPort(customer.splitterPortId, req.params.id, tx)
      }
      await tx.splitterPort.updateMany({
        where: { connectedToId: req.params.id },
        data: { connectionStatus: "AVAILABLE", connectedToType: null, connectedToId: null }
      })

      // 2. Release HTB port jika ada
      if (customer.htbPortId) {
        await releaseHtbPort(customer.htbPortId, tx)
      }

      // 3. Delete customer
      await tx.customer.delete({ where: { id: req.params.id } })

      // 4. Sync ODP usedPorts
      if (customer.odpId) {
        await syncOdpUsedPorts(customer.odpId, tx)
      }
    })

    res.status(204).end()
  } catch (e) { next(e) }
})

export default router
