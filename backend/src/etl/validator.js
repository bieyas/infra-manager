/**
 * ETL Validator & Mapper
 * - Cek duplikat antar record dalam satu batch
 * - Resolve referensi ODP (nama → id) dari database
 * - Validasi field wajib
 */

import prisma from '../lib/prisma.js'

// ── Resolve ODP dari DB ───────────────────────────────────────────────────────

async function buildOdpIndex() {
  const odps = await prisma.odp.findMany({ select: { id: true, name: true } })
  const index = {}
  for (const odp of odps) {
    index[odp.name.toLowerCase().trim()] = odp.id
    index[odp.id] = odp.id  // juga support langsung pakai ID
  }
  return index
}

// ── Validasi satu record ──────────────────────────────────────────────────────

function validateRecord(rec, odpIndex) {
  const errors = []

  if (!rec.customerId) errors.push('customerId wajib diisi')
  if (!rec.name)       errors.push('name wajib diisi')

  // Resolve ODP
  let odpId   = null
  let odpPort = rec._odpPort ?? null

  if (rec._odpRef) {
    const key = rec._odpRef.toLowerCase().trim()
    odpId = odpIndex[key] ?? null
    if (!odpId) {
      errors.push(`ODP tidak ditemukan: "${rec._odpRef}"`)
    }
  }

  // Validasi IP format
  if (rec.ipAddress && !/^(\d{1,3}\.){3}\d{1,3}$/.test(rec.ipAddress)) {
    errors.push(`IP address tidak valid: "${rec.ipAddress}"`)
  }

  // Hapus field internal
  const { _odpRef, _odpPort, ...clean } = rec

  return {
    valid: errors.length === 0,
    errors,
    record: {
      ...clean,
      odpId,
      odpPort,
    },
  }
}

// ── Validate batch ────────────────────────────────────────────────────────────

export async function validateBatch(records) {
  console.log(`[validator] Memvalidasi ${records.length} record...`)

  const odpIndex = await buildOdpIndex()
  console.log(`[validator] ODP index: ${Object.keys(odpIndex).length / 2} entri`)

  const valid    = []
  const invalid  = []
  const seenIds  = new Set()
  const dupIds   = new Set()

  for (const rec of records) {
    const id = rec.customerId

    // Cek duplikat dalam batch
    if (seenIds.has(id)) {
      dupIds.add(id)
      invalid.push({ record: rec, errors: [`Duplikat customerId dalam batch: ${id}`] })
      continue
    }
    seenIds.add(id)

    const { valid: isValid, errors, record } = validateRecord(rec, odpIndex)

    if (isValid) {
      valid.push(record)
    } else {
      invalid.push({ record: rec, errors })
    }
  }

  if (dupIds.size > 0) {
    console.warn(`[validator] ${dupIds.size} customerId duplikat dalam batch: ${[...dupIds].slice(0, 5).join(', ')}`)
  }

  const odpResolved   = valid.filter(r => r.odpId !== null).length
  const odpUnresolved = valid.filter(r => r._odpRef && r.odpId === null).length

  console.log(`[validator] Valid: ${valid.length} | Invalid: ${invalid.length}`)
  console.log(`[validator] ODP resolved: ${odpResolved} | Tidak ditemukan: ${odpUnresolved}`)

  return { valid, invalid }
}
