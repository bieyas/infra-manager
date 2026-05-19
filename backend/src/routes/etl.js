/**
 * ETL API Routes
 * Trigger dan monitor pipeline import dari REST API.
 *
 * POST /api/etl/run          — Jalankan pipeline (semua source atau tertentu)
 * POST /api/etl/run/:sourceId — Jalankan source tertentu
 * GET  /api/etl/status        — Status run terakhir
 * GET  /api/etl/raw           — List raw file yang tersimpan
 */

import { Router } from 'express'
import fs         from 'fs/promises'
import path       from 'path'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// ── State sederhana (in-memory) untuk tracking run aktif ─────────────────────

let activeRun  = null  // { startedAt, sourceId, dryRun }
let lastReport = null  // Report dari run terakhir

// ── POST /api/etl/run ─────────────────────────────────────────────────────────

router.post('/run', requireRole('ADMIN'), async (req, res) => {
  if (activeRun) {
    return res.status(409).json({
      error: 'Pipeline sedang berjalan',
      startedAt: activeRun.startedAt,
    })
  }

  const { sourceId = null, dryRun = false, fromFile = null } = req.body

  activeRun = { startedAt: new Date().toISOString(), sourceId, dryRun }
  res.json({ message: 'Pipeline dimulai', ...activeRun })

  // Jalankan async, jangan await di request handler
  try {
    const { runPipeline } = await import('../etl/pipeline.js')
    lastReport = await runPipeline({ sourceId, dryRun, fromFile })
  } catch (e) {
    lastReport = { error: e.message, finishedAt: new Date().toISOString() }
  } finally {
    activeRun = null
  }
})

// ── POST /api/etl/run/:sourceId ───────────────────────────────────────────────

router.post('/run/:sourceId', requireRole('ADMIN'), async (req, res) => {
  if (activeRun) {
    return res.status(409).json({ error: 'Pipeline sedang berjalan' })
  }

  const { sourceId } = req.params
  const { dryRun = false } = req.body

  activeRun = { startedAt: new Date().toISOString(), sourceId, dryRun }
  res.json({ message: 'Pipeline dimulai', ...activeRun })

  try {
    const { runPipeline } = await import('../etl/pipeline.js')
    lastReport = await runPipeline({ sourceId, dryRun })
  } catch (e) {
    lastReport = { error: e.message, finishedAt: new Date().toISOString() }
  } finally {
    activeRun = null
  }
})

// ── GET /api/etl/status ───────────────────────────────────────────────────────

router.get('/status', requireRole('ADMIN', 'TECHNICIAN'), (req, res) => {
  res.json({
    running:    !!activeRun,
    activeRun,
    lastReport,
  })
})

// ── GET /api/etl/sources ──────────────────────────────────────────────────────

router.get('/sources', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  try {
    const { default: config } = await import('../etl/config.js')
    res.json(config.sources.map(s => ({
      id:      s.id,
      name:    s.name,
      enabled: s.enabled,
      url:     s.url,
    })))
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── GET /api/etl/raw ──────────────────────────────────────────────────────────

router.get('/raw', requireRole('ADMIN'), async (req, res) => {
  try {
    const { default: config } = await import('../etl/config.js')
    const rawDir = path.resolve(config.storage.rawDir)
    const result = []

    const srcDirs = await fs.readdir(rawDir).catch(() => [])
    for (const srcDir of srcDirs) {
      const srcPath = path.join(rawDir, srcDir)
      const runs    = await fs.readdir(srcPath).catch(() => [])
      for (const run of runs) {
        const runPath  = path.join(srcPath, run)
        const metaPath = path.join(runPath, '_meta.json')
        try {
          const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'))
          result.push(meta)
        } catch {
          result.push({ sourceId: srcDir, runDir: runPath, runName: run })
        }
      }
    }

    result.sort((a, b) => (b.fetchedAt ?? '').localeCompare(a.fetchedAt ?? ''))
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

export default router
