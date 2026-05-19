/**
 * ETL Pipeline
 * Orkestrasi semua tahap: Fetch → Parse → Validate → Import
 * Bisa dipanggil dari CLI runner atau dijadwalkan (cron).
 */

import path from 'path'
import fs   from 'fs/promises'
import { fetchSource, fetchFromFile } from './fetcher.js'
import { transformBatch }             from './parser.js'
import { validateBatch }              from './validator.js'
import { importRecords }              from './importer.js'
import config                         from './config.js'

// ── Simpan laporan hasil run ──────────────────────────────────────────────────

async function saveReport(runDir, report) {
  try {
    await fs.mkdir(runDir, { recursive: true })
    await fs.writeFile(
      path.join(runDir, '_report.json'),
      JSON.stringify(report, null, 2)
    )
  } catch {
    // Tidak fatal jika gagal simpan report
  }
}

// ── Cleanup raw files lama ────────────────────────────────────────────────────

async function cleanupOldRaw(rawDir, retentionDays) {
  if (!retentionDays) return
  try {
    const cutoff = Date.now() - retentionDays * 86_400_000
    const sources = await fs.readdir(rawDir).catch(() => [])
    for (const srcDir of sources) {
      const srcPath = path.join(rawDir, srcDir)
      const runs    = await fs.readdir(srcPath).catch(() => [])
      for (const run of runs) {
        const runPath = path.join(srcPath, run)
        const stat    = await fs.stat(runPath).catch(() => null)
        if (stat?.isDirectory() && stat.mtimeMs < cutoff) {
          await fs.rm(runPath, { recursive: true, force: true })
          console.log(`[pipeline] Hapus raw lama: ${runPath}`)
        }
      }
    }
  } catch (e) {
    console.warn('[pipeline] Cleanup raw gagal:', e.message)
  }
}

// ── Run pipeline untuk satu source ───────────────────────────────────────────

export async function runPipeline({
  sourceId    = null,   // Jika null, jalankan semua source yang enabled
  fromFile    = null,   // Path file JSON lokal (bypass fetch dari API)
  dryRun      = config.import.dryRun,
  silent      = false,
} = {}) {
  const startTime = Date.now()
  const rawDir    = path.resolve(config.storage.rawDir)

  if (!silent) console.log('═'.repeat(60))
  if (!silent) console.log(`[pipeline] Mulai ETL — ${new Date().toLocaleString('id-ID')}`)
  if (dryRun  && !silent) console.log('[pipeline] Mode: DRY RUN (tidak ada yang disimpan)')

  // Pilih sources yang akan dijalankan
  let sources = config.sources.filter(s => s.enabled)
  if (sourceId) sources = sources.filter(s => s.id === sourceId)
  if (!sources.length) {
    console.warn('[pipeline] Tidak ada source yang aktif')
    return null
  }

  const allReports = []

  for (const source of sources) {
    if (!silent) console.log(`\n${'─'.repeat(60)}`)
    if (!silent) console.log(`[pipeline] Source: ${source.name} (${source.id})`)

    const report = {
      sourceId:   source.id,
      sourceName: source.name,
      startedAt:  new Date().toISOString(),
      steps: {},
      summary: null,
      error: null,
    }

    let runDir = path.join(rawDir, source.id, 'latest')

    try {
      // ── Step 1: Fetch ─────────────────────────────────────────────────────
      let rawItems
      if (fromFile) {
        const { fetchFromFile: ffFile } = await import('./fetcher.js')
        rawItems = await ffFile(fromFile)
        runDir   = path.dirname(fromFile)
        report.steps.fetch = { source: fromFile, count: rawItems.length }
      } else {
        const fetched = await fetchSource(source, rawDir)
        rawItems = fetched.items
        runDir   = fetched.runDir
        report.steps.fetch = { runDir: fetched.runDir, count: rawItems.length }
      }
      if (!silent) console.log(`[pipeline] ✓ Fetch: ${rawItems.length} record`)

      // ── Step 2: Parse / Transform ─────────────────────────────────────────
      const { records, skipped: parseSkipped } = transformBatch(rawItems, config.fieldMap)
      report.steps.parse = { valid: records.length, skipped: parseSkipped.length }
      if (!silent) console.log(`[pipeline] ✓ Parse: ${records.length} valid, ${parseSkipped.length} dilewati`)

      // Simpan parse errors ke file
      if (parseSkipped.length > 0) {
        await fs.writeFile(
          path.join(runDir, '_parse_errors.json'),
          JSON.stringify(parseSkipped, null, 2)
        )
      }

      // ── Step 3: Validate & Map ────────────────────────────────────────────
      const { valid, invalid } = await validateBatch(records)
      report.steps.validate = { valid: valid.length, invalid: invalid.length }
      if (!silent) console.log(`[pipeline] ✓ Validate: ${valid.length} valid, ${invalid.length} invalid`)

      // Simpan validation errors ke file
      if (invalid.length > 0) {
        await fs.writeFile(
          path.join(runDir, '_validate_errors.json'),
          JSON.stringify(invalid, null, 2)
        )
      }

      // ── Step 4: Import ke DB ──────────────────────────────────────────────
      const summary = await importRecords(valid, {
        mode:       config.import.mode,
        batchSize:  config.import.batchSize,
        dryRun,
      })
      report.steps.import = summary
      report.summary = summary

      if (!silent) {
        console.log(`[pipeline] ✓ Import selesai:`)
        console.log(`           Insert baru : ${summary.inserted}`)
        console.log(`           Update ada  : ${summary.updated}`)
        console.log(`           Dilewati    : ${summary.skipped}`)
        if (summary.errors?.length) console.log(`           Error       : ${summary.errors.length}`)
      }

    } catch (e) {
      report.error = e.message
      console.error(`[pipeline] ✗ Error pada source ${source.id}: ${e.message}`)
    }

    report.finishedAt   = new Date().toISOString()
    report.durationMs   = Date.now() - startTime
    await saveReport(runDir, report)
    allReports.push(report)
  }

  // Cleanup raw lama
  await cleanupOldRaw(rawDir, config.storage.retentionDays)

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
  if (!silent) {
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`[pipeline] Selesai dalam ${durationSec}s`)
  }

  return allReports.length === 1 ? allReports[0] : allReports
}
