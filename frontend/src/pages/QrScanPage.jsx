import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import {
  QrCode, Loader2, CheckCircle, AlertCircle, ArrowLeft,
  Camera, Hash, MapPin, Wifi, WifiOff, Clock, RefreshCw,
  ChevronRight, Box, Cable, UserRound,
} from 'lucide-react'
import { api } from '../lib/api'

// ── Parse QR URL ─────────────────────────────────────────────────────────────
function parseQrUrl(text) {
  try {
    const url = new URL(text)
    const parts = url.pathname.split('/').filter(Boolean)
    const scanIdx = parts.findIndex(p => p === 'scan' || p === 'qr')
    if (scanIdx >= 0 && parts.length >= scanIdx + 3) {
      return { type: parts[scanIdx + 1], id: parts[scanIdx + 2] }
    }
  } catch {}
  const m = text.match(/^(odc|odp|customer):(.+)$/)
  if (m) return { type: m[1], id: m[2] }
  return null
}

// ── Fetch data lengkap berdasarkan tipe ──────────────────────────────────────
async function fetchNodeInfo(type, id) {
  switch (type) {
    case 'odc':      return api.get(`/odc/${id}`)
    case 'odp':      return api.get(`/odp/${id}`)
    case 'customer': return api.get(`/customers/${id}`)
    default:         throw new Error('Tipe tidak dikenal')
  }
}

// ── Config per tipe ──────────────────────────────────────────────────────────
const TYPE_INFO = {
  odc:      { label: 'ODC', Icon: Box,        color: 'text-cyan-400',    border: 'border-cyan-500/30',    bg: 'bg-cyan-500/10'    },
  odp:      { label: 'ODP', Icon: Cable,      color: 'text-violet-400',  border: 'border-violet-500/30',  bg: 'bg-violet-500/10'  },
  customer: { label: 'Pelanggan', Icon: UserRound, color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
}

const SERVICE_STATUS = {
  ACTIVE:     { label: 'Aktif',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', Icon: Wifi    },
  SUSPENDED:  { label: 'Isolir',  color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',     Icon: WifiOff },
  TERMINATED: { label: 'Berhenti',color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/30',       Icon: WifiOff },
}

// ── Info rows per tipe ───────────────────────────────────────────────────────
function NodeInfoRows({ type, node }) {
  if (!node) return null

  if (type === 'customer') {
    const svc = SERVICE_STATUS[node.serviceStatus] ?? SERVICE_STATUS.SUSPENDED
    const SvcIcon = svc.Icon
    return (
      <div className="space-y-2 text-xs">
        <Row label="ID Pelanggan" value={node.customerId} mono />
        <Row label="Nama"         value={node.name} bold />
        {node.address && <Row label="Alamat" value={node.address} icon={<MapPin size={11} className="text-muted" />} />}
        {node.pppoeUsername && <Row label="PPPoE" value={node.pppoeUsername} mono />}
        {node.onuSn && <Row label="ONU S/N" value={node.onuSn} mono />}
        {node.odp && <Row label="ODP" value={node.odp.name} />}
        {node.odp?.odc && <Row label="ODC" value={node.odp.odc.name} />}
        <div className="flex items-center gap-2 pt-1">
          <span className="text-muted">Status:</span>
          <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${svc.bg} ${svc.color}`}>
            <SvcIcon size={10} />
            {svc.label}
          </span>
        </div>
      </div>
    )
  }

  if (type === 'odc') {
    return (
      <div className="space-y-2 text-xs">
        <Row label="Nama"    value={node.name} bold />
        {node.location && <Row label="Lokasi" value={node.location} icon={<MapPin size={11} className="text-muted" />} />}
        {node.olt && <Row label="OLT" value={`${node.olt.name} / ${node.ponPort ?? '—'}`} mono />}
        <Row label="Port" value={`${node.usedPorts ?? 0} / ${node.capacity ?? '—'} terpakai`} />
        {node.splitterRatio && <Row label="Splitter" value={node.splitterRatio.replace('R', '').replace('_', ':')} />}
      </div>
    )
  }

  if (type === 'odp') {
    return (
      <div className="space-y-2 text-xs">
        <Row label="Nama"    value={node.name} bold />
        {node.location && <Row label="Lokasi" value={node.location} icon={<MapPin size={11} className="text-muted" />} />}
        {node.odc && <Row label="ODC" value={node.odc.name} />}
        {node.olt && <Row label="OLT" value={`${node.olt.name} / ${node.ponPort ?? '—'}`} mono />}
        <Row label="Port" value={`${node.usedPorts ?? 0} / ${node.capacity ?? '—'} terpakai`} />
        {node.splitterRatio && <Row label="Splitter" value={node.splitterRatio.replace('R', '').replace('_', ':')} />}
      </div>
    )
  }

  return null
}

function Row({ label, value, mono, bold, icon }) {
  if (value == null || value === '') return null
  return (
    <div className="flex items-start gap-2">
      {icon ?? <span className="w-[11px] shrink-0" />}
      <span className="text-muted shrink-0">{label}:</span>
      <span className={`${mono ? 'font-mono' : ''} ${bold ? 'font-semibold text-primary' : 'text-secondary'} break-all`}>
        {value}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function QrScanPage() {
  const navigate      = useNavigate()
  const [params]      = useSearchParams()
  const routeParams   = useParams()
  const scannerRef    = useRef(null)   // Html5Qrcode instance
  const isRunningRef  = useRef(false)  // guard agar tidak start ganda
  const divId         = 'qr-video'

  const [mode,    setMode]    = useState('camera')
  const [status,  setStatus]  = useState('idle')
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)
  const [manual,  setManual]  = useState('')
  const [camReady, setCamReady] = useState(false)

  const stopScanner = useCallback(async () => {
    isRunningRef.current = false
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState()
        if (state === 2) await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch {}
      scannerRef.current = null
    }
  }, [])

  const processText = useCallback(async (text) => {
    const parsed = parseQrUrl(text.trim())
    if (!parsed) {
      setError('Format QR tidak dikenal. Pastikan scan label yang benar.')
      setStatus('error')
      return
    }
    setStatus('loading')
    try {
      const node = await fetchNodeInfo(parsed.type, parsed.id)
      setResult({ ...parsed, node })
      setStatus('found')
    } catch (e) {
      setError(e.message === 'HTTP 404' ? 'Data tidak ditemukan di database.' : (e.message || 'Gagal mengambil data'))
      setStatus('error')
    }
  }, [])

  // Init Html5Qrcode low-level — mount sekali, tidak re-init saat re-render
  useEffect(() => {
    if (mode !== 'camera' || status !== 'idle') return
    if (isRunningRef.current) return

    let html5qr = null

    const start = async () => {
      // Tunggu div siap di DOM
      const el = document.getElementById(divId)
      if (!el) return

      isRunningRef.current = true
      html5qr = new Html5Qrcode(divId)
      scannerRef.current = html5qr

      try {
        await html5qr.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 },
          (decodedText) => {
            if (!isRunningRef.current) return
            stopScanner().then(() => processText(decodedText))
          },
          () => {},
        )
        setCamReady(true)
      } catch (e) {
        isRunningRef.current = false
        scannerRef.current = null
        setError('Tidak dapat mengakses kamera. Periksa izin browser.')
        setStatus('error')
      }
    }

    // Delay kecil agar div sudah mount
    const timer = setTimeout(start, 100)

    return () => {
      clearTimeout(timer)
      stopScanner()
      setCamReady(false)
    }
  }, [mode, status]) // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: /scan/:type/:id
  useEffect(() => {
    const { type, id } = routeParams
    if (type && id) { processText(`${type}:${id}`); return }
    const t = params.get('text')
    if (t) processText(decodeURIComponent(t))
  }, []) // eslint-disable-line

  const handleManualSubmit = (e) => {
    e.preventDefault()
    if (manual.trim()) processText(manual.trim())
  }

  const reset = async () => {
    await stopScanner()
    setCamReady(false)
    setStatus('idle')
    setResult(null)
    setError(null)
    setManual('')
  }

  const goToDetail = () => {
    if (!result) return
    switch (result.type) {
      case 'odc':      return navigate(`/odc?detail=${result.id}`)
      case 'odp':      return navigate(`/odp?detail=${result.id}`)
      case 'customer': return navigate(`/customers?detail=${result.id}`)
    }
  }

  const typeInfo = result ? TYPE_INFO[result.type] : null

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center px-4 py-6 pb-24">

      {/* Header */}
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-5"
        >
          <ArrowLeft size={14} /> Kembali
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent-glow)] border border-[var(--accent)]/20 flex items-center justify-center">
            <QrCode size={20} className="text-[var(--accent)]" />
          </div>
          <div>
            <h1 className="text-base font-bold text-primary">Scan QR Code</h1>
            <p className="text-xs text-muted">Scan label ODC / ODP / Pelanggan</p>
          </div>
        </div>

        {/* Tabs — hanya tampil saat idle */}
        {status === 'idle' && (
          <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] mb-4">
            {[
              { id: 'camera', label: 'Kamera',       icon: Camera },
              { id: 'manual', label: 'Input Manual',  icon: Hash   },
            ].map(m => {
              const Icon = m.icon
              return (
                <button
                  key={m.id}
                  onClick={() => { reset(); setMode(m.id) }}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg transition-all ${
                    mode === m.id
                      ? 'bg-[var(--bg-card)] text-primary shadow-sm border border-[var(--border)]'
                      : 'text-muted hover:text-primary'
                  }`}
                >
                  <Icon size={13} /> {m.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="w-full max-w-md space-y-3">

        {/* ── Camera scanner — div SELALU ada di DOM saat mode camera ── */}
        {mode === 'camera' && (
          <div className={status === 'idle' ? 'block' : 'hidden'}>
            <div className="rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg-card)] qr-scanner-wrap">
              <div id={divId} className="w-full" />
              {!camReady && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted">
                  <Loader2 size={14} className="animate-spin" /> Memulai kamera…
                </div>
              )}
              {camReady && (
                <p className="text-center text-[10px] text-muted py-2.5 px-4 border-t border-[var(--border)]">
                  Arahkan kamera ke QR Code pada label ODC / ODP / Pelanggan
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Manual input ── */}
        {mode === 'manual' && status === 'idle' && (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4 space-y-3">
              <p className="text-xs text-secondary">Tempel atau ketik URL QR / ID node:</p>
              <input
                type="text"
                value={manual}
                onChange={e => setManual(e.target.value)}
                placeholder="https://... atau odc:clxxxxxx"
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)] font-mono"
                autoFocus
              />
              <button
                type="submit"
                disabled={!manual.trim()}
                className="w-full py-2.5 rounded-lg bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Cari Data
              </button>
            </div>
            <p className="text-[10px] text-muted text-center">
              Format: URL penuh dari label, atau{' '}
              <span className="font-mono bg-[var(--bg-secondary)] px-1 rounded">odc:ID</span>
              {' / '}
              <span className="font-mono bg-[var(--bg-secondary)] px-1 rounded">odp:ID</span>
              {' / '}
              <span className="font-mono bg-[var(--bg-secondary)] px-1 rounded">customer:ID</span>
            </p>
          </form>
        )}

        {/* ── Loading ── */}
        {status === 'loading' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-16 h-16 rounded-full bg-[var(--accent-glow)] flex items-center justify-center">
              <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
            </div>
            <p className="text-sm text-muted">Mengambil data…</p>
          </div>
        )}

        {/* ── Result ── */}
        {status === 'found' && result && typeInfo && (
          <div className="space-y-3 animate-fade-in">
            {/* Header card */}
            <div className={`rounded-xl border p-4 ${typeInfo.bg} ${typeInfo.border}`}>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                <span className="text-sm font-semibold text-primary flex-1">Data Ditemukan</span>
                <span className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border border-current ${typeInfo.color} bg-current/10`}>
                  <typeInfo.Icon size={11} />
                  {typeInfo.label}
                </span>
              </div>
              <NodeInfoRows type={result.type} node={result.node} />
            </div>

            {/* Actions */}
            <button
              onClick={goToDetail}
              className="w-full py-3 rounded-xl bg-[var(--accent)] text-white font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              Lihat Detail Lengkap
              <ChevronRight size={16} />
            </button>

            <button
              onClick={reset}
              className="w-full py-2.5 rounded-xl border border-[var(--border)] text-secondary text-sm hover:text-primary hover:border-[var(--accent)]/40 transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={13} />
              Scan Lagi
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {status === 'error' && (
          <div className="space-y-3 animate-fade-in">
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} className="text-rose-400 shrink-0" />
                <span className="text-sm font-semibold text-rose-400">Gagal Membaca QR</span>
              </div>
              <p className="text-xs text-muted leading-relaxed">{error}</p>
            </div>
            <button
              onClick={reset}
              className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
            >
              <RefreshCw size={13} />
              Coba Lagi
            </button>
          </div>
        )}
      </div>

      {/* Override styling Html5Qrcode video container */}
      <style>{`
        .qr-scanner-wrap #qr-video {
          border: none !important;
          padding: 0 !important;
          background: #000 !important;
        }
        .qr-scanner-wrap #qr-video video {
          width: 100% !important;
          border-radius: 0 !important;
          display: block !important;
        }
        .qr-scanner-wrap #qr-video__scan_region {
          background: transparent !important;
        }
        .qr-scanner-wrap #qr-video__scan_region img {
          display: none !important;
        }
        .qr-scanner-wrap #qr-video__dashboard {
          display: none !important;
        }
      `}</style>
    </div>
  )
}
