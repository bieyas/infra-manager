#!/usr/bin/env node
/**
 * ETL CLI Runner
 * Jalankan pipeline dari command line.
 *
 * Usage:
 *   node src/etl/run.js                          # Jalankan semua source
 *   node src/etl/run.js --source billing_main    # Source tertentu
 *   node src/etl/run.js --file ./data/DataPelangan.json  # Dari file lokal
 *   node src/etl/run.js --dry-run                # Dry run (tidak simpan ke DB)
 *   node src/etl/run.js --source billing_main --dry-run
 */

import { runPipeline } from './pipeline.js'

// ── Parse CLI args ────────────────────────────────────────────────────────────

const args     = process.argv.slice(2)
const getArg   = (flag) => {
  const idx = args.indexOf(flag)
  return idx !== -1 ? args[idx + 1] ?? true : null
}

const sourceId = getArg('--source') || null
const fromFile = getArg('--file')   || null
const dryRun   = args.includes('--dry-run') || args.includes('--dry')

// ── Run ───────────────────────────────────────────────────────────────────────

;(async () => {
  try {
    const report = await runPipeline({ sourceId, fromFile, dryRun })

    // Exit code 1 jika ada error
    const hasError = Array.isArray(report)
      ? report.some(r => r.error)
      : report?.error

    process.exit(hasError ? 1 : 0)
  } catch (e) {
    console.error('[etl] Fatal error:', e.message)
    process.exit(1)
  }
})()
