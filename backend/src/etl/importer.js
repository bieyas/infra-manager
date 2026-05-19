/**
 * ETL Importer
 * Upsert record Customer ke database dalam batch.
 * Setelah import, sync usedPorts pada ODP terkait.
 */

import prisma from '../lib/prisma.js'

// ── Sync usedPorts ODP setelah import ────────────────────────────────────────

async function syncOdpUsedPorts(odpIds) {
  if (!odpIds.size) return
  for (const odpId of odpIds) {
    const count = await prisma.customer.count({ where: { odpId } })
    await prisma.odp.update({ where: { id: odpId }, data: { usedPorts: count } })
  }
  console.log(`[importer] Sync usedPorts: ${odpIds.size} ODP`)
}

// ── Upsert satu batch ke DB ───────────────────────────────────────────────────

async function upsertBatch(batch, mode) {
  const inserted  = []
  const updated   = []
  const skipped   = []
  const errors    = []

  for (const rec of batch) {
    try {
      const { customerId, ...data } = rec

      if (mode === 'insert_only') {
        const exists = await prisma.customer.findUnique({
          where: { customerId },
          select: { id: true },
        })
        if (exists) {
          skipped.push(customerId)
          continue
        }
        await prisma.customer.create({ data: { customerId, ...data } })
        inserted.push(customerId)
      } else {
        // upsert (default)
        const result = await prisma.customer.upsert({
          where:  { customerId },
          create: { customerId, ...data },
          update: data,
        })
        // Prisma upsert tidak bilang create/update, cek dari createdAt ≈ updatedAt
        const isNew = result.createdAt.getTime() === result.updatedAt.getTime()
        if (isNew) inserted.push(customerId)
        else updated.push(customerId)
      }
    } catch (e) {
      errors.push({ customerId: rec.customerId, error: e.message })
    }
  }

  return { inserted, updated, skipped, errors }
}

// ── Main import function ──────────────────────────────────────────────────────

export async function importRecords(records, { mode = 'upsert', batchSize = 50, dryRun = false } = {}) {
  if (records.length === 0) {
    console.log('[importer] Tidak ada record untuk diimport')
    return { inserted: 0, updated: 0, skipped: 0, errors: [] }
  }

  console.log(`[importer] Import ${records.length} record (mode: ${mode}${dryRun ? ', DRY RUN' : ''})`)

  if (dryRun) {
    console.log('[importer] [DRY RUN] Tidak ada yang disimpan ke database')
    console.log('[importer] [DRY RUN] Contoh record pertama:')
    console.log(JSON.stringify(records[0], null, 2))
    return {
      inserted: 0, updated: 0, skipped: records.length,
      errors: [], dryRun: true,
    }
  }

  const totals    = { inserted: [], updated: [], skipped: [], errors: [] }
  const affectedOdpIds = new Set()

  // Proses per batch
  for (let i = 0; i < records.length; i += batchSize) {
    const batch    = records.slice(i, i + batchSize)
    const batchNum = Math.floor(i / batchSize) + 1
    const total    = Math.ceil(records.length / batchSize)

    process.stdout.write(`  [importer] Batch ${batchNum}/${total}... `)
    const result = await upsertBatch(batch, mode)
    console.log(`insert:${result.inserted.length} update:${result.updated.length} skip:${result.skipped.length} err:${result.errors.length}`)

    totals.inserted.push(...result.inserted)
    totals.updated.push(...result.updated)
    totals.skipped.push(...result.skipped)
    totals.errors.push(...result.errors)

    // Kumpulkan ODP yang perlu di-sync
    batch.forEach(r => { if (r.odpId) affectedOdpIds.add(r.odpId) })
  }

  // Sync usedPorts
  await syncOdpUsedPorts(affectedOdpIds)

  const summary = {
    inserted: totals.inserted.length,
    updated:  totals.updated.length,
    skipped:  totals.skipped.length,
    errors:   totals.errors,
  }

  if (totals.errors.length > 0) {
    console.warn(`[importer] ${totals.errors.length} error:`)
    totals.errors.slice(0, 5).forEach(e =>
      console.warn(`  ${e.customerId}: ${e.error}`)
    )
  }

  return summary
}
