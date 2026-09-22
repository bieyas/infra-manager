import React, { useState, useRef, useCallback, useEffect } from 'react'
import QRCode from 'react-qr-code'
import {
  X, Printer, QrCode, Tag, Cable,
  MapPin, Radio, Users, Zap, Box,
} from 'lucide-react'
import clsx from 'clsx'

// ── QR URL builder ─────────────────────────────────────────────────────────
const BASE_URL = window.location.origin
function qrUrl(type, id) {
  return `${BASE_URL}/scan/${type}/${id}`
}

// ── Label size presets ─────────────────────────────────────────────────────
// Berdasarkan printer label populer di pasaran ISP:
// - Brother QL-800 / QL-820NWB: DK tape, 62mm, 29mm, 17mm
// - Niimbot B1/B21/B3S: 40x30, 60x40, 15x25 (kabel)
// - Epson LabelWorks: 12mm, 18mm, 24mm tape
// - Zebra ZD220/ZD230: 4"x2", 2"x1", 4"x6"
export const LABEL_SIZES = [
  // ── Label ODC/ODP (ditempel di box) ────────────────────────────────────
  {
    id: 'odc_main',
    category: 'box',
    name: '62 × 100 mm',
    desc: 'Brother QL-800 / Niimbot 60×100 — Label utama ODC/ODP',
    mmW: 62, mmH: 100,
    pxW: 234, pxH: 378,
    qrSize: 90,
    font: { title: 14, sub: 9, info: 8 },
  },
  {
    id: 'odc_medium',
    category: 'box',
    name: '60 × 40 mm',
    desc: 'Niimbot B1/B21 — Label ODC/ODP ringkas',
    mmW: 60, mmH: 40,
    pxW: 226, pxH: 151,
    qrSize: 64,
    font: { title: 10, sub: 7, info: 7 },
  },
  {
    id: 'odc_small',
    category: 'box',
    name: '40 × 30 mm',
    desc: 'Niimbot / thermal kecil — Identifikasi ringkas',
    mmW: 40, mmH: 30,
    pxW: 151, pxH: 113,
    qrSize: 50,
    font: { title: 9, sub: 6, info: 6 },
  },
  // ── Label kabel antar ODC-ODP (ditempel di kabel/patch) ────────────────
  {
    id: 'cable_wrap',
    category: 'cable',
    name: '15 × 50 mm (wrap kabel)',
    desc: 'Niimbot / flag label — Label melilit kabel fiber',
    mmW: 15, mmH: 50,
    pxW: 56, pxH: 189,
    qrSize: 40,
    font: { title: 7, sub: 6, info: 6 },
    vertical: true,
  },
  {
    id: 'cable_flag',
    category: 'cable',
    name: '25 × 38 mm (flag)',
    desc: 'Dymo / Brother — Flag label kabel ODC-ODP',
    mmW: 25, mmH: 38,
    pxW: 94, pxH: 143,
    qrSize: 48,
    font: { title: 8, sub: 7, info: 6 },
  },
  // ── Label kabel di ODP (info pelanggan/ONU) ────────────────────────────
  {
    id: 'odp_port',
    category: 'odp_port',
    name: '62 × 29 mm',
    desc: 'Brother DK-22223 / 29mm — Label port ODP → ONU',
    mmW: 62, mmH: 29,
    pxW: 234, pxH: 109,
    qrSize: 55,
    font: { title: 10, sub: 7, info: 7 },
  },
  // ── Label pelanggan (ditempel di rumah/ONT) ────────────────────────────
  {
    id: 'customer',
    category: 'customer',
    name: '80 × 50 mm (pelanggan)',
    desc: 'Zebra ZD220 / thermal biasa — Info layanan pelanggan',
    mmW: 80, mmH: 50,
    pxW: 302, pxH: 189,
    qrSize: 70,
    font: { title: 12, sub: 8, info: 7 },
  },
]

// ── Template renderers ─────────────────────────────────────────────────────
function LabelOdc({ data, size }) {
  const { odc } = data
  const f = size.font
  return (
    <div
      className="bg-white text-black flex flex-col overflow-hidden border border-gray-300"
      style={{ width: size.pxW, height: size.pxH, fontFamily: 'monospace', padding: 6 }}
    >
      {/* Header strip */}
      <div className="flex items-center gap-1 mb-1 pb-1 border-b border-gray-400">
        <div className="bg-black text-white px-1.5 rounded font-bold" style={{ fontSize: f.title - 2 }}>
          {odc.name?.split('-')[0] ?? 'ODC'}
        </div>
        <span className="font-bold truncate flex-1" style={{ fontSize: f.title }}>{odc.name}</span>
      </div>
      <div className="flex gap-2 flex-1">
        {/* QR */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <QRCode value={qrUrl('odc', odc.id)} size={size.qrSize} level="M" />
          <span style={{ fontSize: 6, color: '#666' }}>SCAN INFO</span>
        </div>
        {/* Info */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          {odc.olt && (
            <div style={{ fontSize: f.info }}>
              <span className="text-gray-500">OLT: </span>
              <span className="font-semibold">{odc.olt.name}</span>
            </div>
          )}
          {odc.ponPort && (
            <div style={{ fontSize: f.info }}>
              <span className="text-gray-500">PON: </span>
              <span className="font-semibold font-mono">{odc.ponPort}</span>
            </div>
          )}
          {odc.address && (
            <div style={{ fontSize: f.info }} className="truncate">
              <span className="text-gray-500">Lokasi: </span>{odc.address}
            </div>
          )}
          <div style={{ fontSize: f.info }}>
            <span className="text-gray-500">Kapasitas: </span>
            <span>{odc.usedPorts ?? 0}/{odc.capacity ?? '—'} port</span>
          </div>
          {odc.feederLabel && (
            <div style={{ fontSize: f.info }}>
              <span className="text-gray-500">Feeder: </span>
              <span className="font-mono">{odc.feederLabel}</span>
            </div>
          )}
          {odc.pic && (
            <div style={{ fontSize: f.info }} className="mt-auto text-gray-400">
              PIC: {odc.pic}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function LabelOdp({ data, size }) {
  const { odp } = data
  const f = size.font
  return (
    <div
      className="bg-white text-black flex flex-col overflow-hidden border border-gray-300"
      style={{ width: size.pxW, height: size.pxH, fontFamily: 'monospace', padding: 6 }}
    >
      <div className="flex items-center gap-1 mb-1 pb-1 border-b border-gray-400">
        <div className="bg-gray-800 text-white px-1.5 rounded font-bold" style={{ fontSize: f.title - 2 }}>ODP</div>
        <span className="font-bold truncate flex-1" style={{ fontSize: f.title }}>{odp.name}</span>
      </div>
      <div className="flex gap-2 flex-1">
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <QRCode value={qrUrl('odp', odp.id)} size={size.qrSize} level="M" />
          <span style={{ fontSize: 6, color: '#666' }}>SCAN INFO</span>
        </div>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          {odp.olt && (
            <div style={{ fontSize: f.info }}>
              <span className="text-gray-500">OLT: </span>
              <span className="font-semibold">{odp.olt.name}</span>
            </div>
          )}
          {odp.ponPort && (
            <div style={{ fontSize: f.info }}>
              <span className="text-gray-500">PON: </span>
              <span className="font-semibold font-mono">{odp.ponPort}</span>
            </div>
          )}
          {odp.odc && (
            <div style={{ fontSize: f.info }}>
              <span className="text-gray-500">ODC: </span>
              <span>{odp.odc.name}</span>
            </div>
          )}
          {odp.address && (
            <div style={{ fontSize: f.info }} className="truncate">
              <span className="text-gray-500">Lokasi: </span>{odp.address}
            </div>
          )}
          <div style={{ fontSize: f.info }}>
            <span className="text-gray-500">Port: </span>
            <span>{odp.usedPorts ?? 0}/{odp.capacity ?? '—'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function LabelCable({ data, size }) {
  // Label kabel antar ODC-ODP
  const isOdc = !!data.odc
  const node = data.odc ?? data.odp
  const f = size.font
  if (size.vertical) {
    return (
      <div
        className="bg-white text-black flex flex-col items-center justify-between overflow-hidden border border-gray-300"
        style={{ width: size.pxW, height: size.pxH, fontFamily: 'monospace', padding: 4 }}
      >
        <QRCode value={qrUrl(isOdc ? 'odc' : 'odp', node.id)} size={size.qrSize} level="M" />
        <div className="text-center" style={{ writingMode: 'vertical-rl', fontSize: f.title }}>
          <span className="font-bold">{node.name}</span>
        </div>
        {node.feederLabel && (
          <div style={{ fontSize: f.info, writingMode: 'vertical-rl' }}>{node.feederLabel}</div>
        )}
      </div>
    )
  }
  return (
    <div
      className="bg-white text-black flex items-center gap-2 overflow-hidden border border-gray-300"
      style={{ width: size.pxW, height: size.pxH, fontFamily: 'monospace', padding: 5 }}
    >
      <QRCode value={qrUrl(isOdc ? 'odc' : 'odp', node.id)} size={size.qrSize} level="M" />
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="font-bold truncate" style={{ fontSize: f.title }}>{node.name}</span>
        {node.feederLabel && <span className="font-mono text-gray-600" style={{ fontSize: f.info }}>Feeder: {node.feederLabel}</span>}
        {(node.feederCore || node.feederCores) && (
          <span style={{ fontSize: f.info }}>Core: {node.feederCore ?? node.feederCores}</span>
        )}
        {node.address && <span className="truncate text-gray-500" style={{ fontSize: f.info }}>{node.address}</span>}
      </div>
    </div>
  )
}

function LabelOdpPort({ data, size }) {
  // Label port ODP — info ONU/pelanggan, ditempel di kabel di dalam ODP
  const { odp, port, customer } = data
  const f = size.font
  const qrData = customer
    ? qrUrl('customer', customer.id)
    : qrUrl('odp', odp.id)
  return (
    <div
      className="bg-white text-black flex items-center gap-2 overflow-hidden border border-gray-300"
      style={{ width: size.pxW, height: size.pxH, fontFamily: 'monospace', padding: 5 }}
    >
      <QRCode value={qrData} size={size.qrSize} level="M" />
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="bg-black text-white px-1 rounded font-bold" style={{ fontSize: f.title - 1 }}>
            P{port ?? '?'}
          </span>
          <span className="font-bold truncate" style={{ fontSize: f.title }}>
            {customer?.name ?? 'Kosong'}
          </span>
        </div>
        <span style={{ fontSize: f.info }}>ODP: <span className="font-semibold">{odp.name}</span></span>
        {customer?.serviceStatus && (
          <span style={{ fontSize: f.info }}>
            Status: <span className={customer.serviceStatus === 'ACTIVE' ? 'text-green-700' : 'text-amber-700'}>
              {customer.serviceStatus === 'ACTIVE' ? 'Aktif' : customer.serviceStatus}
            </span>
          </span>
        )}
        {odp.olt && <span style={{ fontSize: f.info }}>OLT: {odp.olt.name} / {odp.ponPort}</span>}
      </div>
    </div>
  )
}

function LabelCustomer({ data, size }) {
  // Label di pelanggan — info ODP
  const { customer, odp } = data
  const f = size.font
  return (
    <div
      className="bg-white text-black flex flex-col overflow-hidden border border-gray-300"
      style={{ width: size.pxW, height: size.pxH, fontFamily: 'monospace', padding: 6 }}
    >
      <div className="flex items-center gap-1 mb-1 pb-1 border-b border-gray-400">
        <span className="font-bold truncate flex-1" style={{ fontSize: f.title }}>{customer?.name}</span>
        {customer?.serviceStatus === 'ACTIVE' && (
          <span className="bg-green-700 text-white px-1 rounded text-[7px]">AKTIF</span>
        )}
      </div>
      <div className="flex gap-2 flex-1">
        <QRCode value={qrUrl('customer', customer?.id)} size={size.qrSize} level="M" />
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          {odp && <div style={{ fontSize: f.info }}>ODP: <span className="font-semibold">{odp.name}</span></div>}
          {customer?.odpPort && <div style={{ fontSize: f.info }}>Port: <span className="font-mono font-semibold">{customer.odpPort}</span></div>}
          {odp?.olt && <div style={{ fontSize: f.info }}>OLT: {odp.olt.name}</div>}
          {odp?.ponPort && <div style={{ fontSize: f.info }}>PON: <span className="font-mono">{odp.ponPort}</span></div>}
          {customer?.address && <div style={{ fontSize: f.info }} className="truncate text-gray-500">{customer.address}</div>}
        </div>
      </div>
    </div>
  )
}

// ── Template registry ──────────────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'label_odc',
    label: 'Label ODC/ODP',
    icon: Box,
    desc: 'QR + OLT/PON + kapasitas. Tempel di box ODC/ODP.',
    compatibleSizes: ['odc_main', 'odc_medium', 'odc_small'],
    categories: ['box'],
    render: (data, size) => data.odc ? <LabelOdc data={data} size={size} /> : <LabelOdp data={data} size={size} />,
  },
  {
    id: 'label_cable',
    label: 'Label Kabel Antar Node',
    icon: Cable,
    desc: 'QR + nomor feeder + core. Tempel/lilit di kabel.',
    compatibleSizes: ['cable_wrap', 'cable_flag'],
    categories: ['cable'],
    render: (data, size) => <LabelCable data={data} size={size} />,
  },
  {
    id: 'label_odp_port',
    label: 'Label Kabel di ODP',
    icon: Tag,
    desc: 'Port + info ONU/pelanggan. Tempel di kabel drop di dalam ODP.',
    compatibleSizes: ['odp_port', 'cable_flag'],
    categories: ['odp_port'],
    render: (data, size) => <LabelOdpPort data={data} size={size} />,
  },
  {
    id: 'label_customer',
    label: 'Label di Pelanggan',
    icon: Users,
    desc: 'QR + info ODP. Tempel di ONT/lokasi pelanggan.',
    compatibleSizes: ['customer', 'odc_medium'],
    categories: ['customer'],
    render: (data, size) => <LabelCustomer data={data} size={size} />,
  },
]

// ── Category badge map ─────────────────────────────────────────────────────
const CAT_INFO = {
  box:      { label: 'Box ODC/ODP', color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  cable:    { label: 'Kabel',       color: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  odp_port: { label: 'Port ODP',    color: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  customer: { label: 'Pelanggan',   color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
}

// ── Print utils ────────────────────────────────────────────────────────────
function triggerPrint(labelRef, size) {
  const el = labelRef.current
  if (!el) return
  const html = el.innerHTML
  const pw = window.open('', '_blank', 'width=600,height=400')
  pw.document.write(`<!DOCTYPE html><html><head>
    <title>Label Print</title>
    <style>
      @page { size: ${size.mmW}mm ${size.mmH}mm; margin: 0; }
      body  { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; }
      * { box-sizing: border-box; }
    </style>
  </head><body>${html}</body></html>`)
  pw.document.close()
  pw.focus()
  setTimeout(() => { pw.print(); pw.close() }, 300)
}

// Print multiple labels (semua port ODP) dalam satu dokumen
function triggerPrintAll(labels, size) {
  const labelHtmlArr = labels.map(html =>
    `<div style="page-break-after:always;display:flex;align-items:center;justify-content:center;width:${size.mmW}mm;height:${size.mmH}mm">${html}</div>`
  )
  const pw = window.open('', '_blank', 'width=700,height=600')
  pw.document.write(`<!DOCTYPE html><html><head>
    <title>Print Semua Label Port</title>
    <style>
      @page { size: ${size.mmW}mm ${size.mmH}mm; margin: 0; }
      body  { margin: 0; padding: 0; }
      * { box-sizing: border-box; }
    </style>
  </head><body>${labelHtmlArr.join('')}</body></html>`)
  pw.document.close()
  pw.focus()
  setTimeout(() => { pw.print(); pw.close() }, 400)
}

// ── Main modal ─────────────────────────────────────────────────────────────
/**
 * Props:
 *   open         — boolean
 *   onClose      — () => void
 *   nodeType     — 'odc' | 'odp'
 *   data         — odc/odp object from useOdcDetail/useOdpDetail
 *   initialPort  — number | 'all' | null
 *                  number → buka langsung ke template label_odp_port, pre-select port ini
 *                  'all'  → buka mode print semua port
 *                  null   → buka ke template label ODC/ODP (default)
 */
export default function LabelPrintModal({ open, onClose, nodeType, data, initialPort = null }) {
  const [templateId, setTemplateId] = useState('label_odc')
  const [sizeId,     setSizeId]     = useState('odc_main')
  const [portIdx,    setPortIdx]    = useState(0)
  // Mobile: tab between 'config' and 'preview'
  const [mobileTab,  setMobileTab]  = useState('config')
  const labelRef    = useRef(null)
  const allLabelRef = useRef([]) // untuk mode print all

  const template = TEMPLATES.find(t => t.id === templateId) ?? TEMPLATES[0]
  const size     = LABEL_SIZES.find(s => s.id === sizeId) ?? LABEL_SIZES[0]

  const renderData = useCallback(() => {
    const base = nodeType === 'odc' ? { odc: data } : { odp: data }
    if (templateId === 'label_odp_port' && nodeType === 'odp') {
      const customers = data?.customers ?? []
      const customer  = customers[portIdx] ?? null
      return { odp: data, port: customer?.odpPort ?? portIdx + 1, customer }
    }
    if (templateId === 'label_customer' && nodeType === 'odp') {
      const customers = data?.customers ?? []
      const customer  = customers[portIdx] ?? null
      return { odp: data, customer }
    }
    return base
  }, [nodeType, data, templateId, portIdx])

  const handleTemplateChange = useCallback((tid) => {
    setTemplateId(tid)
    const t = TEMPLATES.find(x => x.id === tid)
    if (t && !t.compatibleSizes.includes(sizeId)) setSizeId(t.compatibleSizes[0])
  }, [sizeId])

  // Auto-switch template + port ketika initialPort berubah
  useEffect(() => {
    if (!open) return
    if (initialPort !== null && initialPort !== undefined) {
      // port spesifik atau 'all' → pakai template label_odp_port
      setTemplateId('label_odp_port')
      setSizeId('odp_port')
      setMobileTab('preview')
      if (typeof initialPort === 'number') {
        // cari index customer yang punya odpPort == initialPort
        const customers = data?.customers ?? []
        const idx = customers.findIndex(c => c.odpPort === initialPort)
        setPortIdx(idx >= 0 ? idx : 0)
      } else {
        setPortIdx(0)
      }
    } else {
      // null → label ODC/ODP biasa
      setTemplateId(nodeType === 'odc' ? 'label_odc' : 'label_odc')
      setSizeId('odc_main')
      setMobileTab('config')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPort])

  if (!open || !data) return null

  const rd        = renderData()
  const customers = data?.customers ?? []
  const isAllMode = initialPort === 'all'
  // Only show compatible sizes
  const compatSizes = LABEL_SIZES.filter(s => template.compatibleSizes.includes(s.id))

  // ── Print semua port ────────────────────────────────────────────────────
  const handlePrintAll = () => {
    const filledCustomers = customers.filter(c => c.odpPort)
    const labelNodes = filledCustomers.map((c, i) => {
      const rd2 = { odp: data, port: c.odpPort, customer: c }
      // Render to a temp div, grab innerHTML
      const div = document.createElement('div')
      const ReactDOM = window.__RD__ // fallback: gunakan ref trick
      // Simpler: collect refs dari rendered labels
      return allLabelRef.current[i]?.innerHTML ?? ''
    }).filter(Boolean)
    if (labelNodes.length) triggerPrintAll(labelNodes, size)
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-3">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet: full-height on mobile, max-w-3xl on desktop */}
      <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl flex flex-col"
        style={{ maxHeight: '95dvh' }}
      >

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isAllMode
              ? <Printer size={15} className="accent-text shrink-0" />
              : typeof initialPort === 'number'
                ? <Tag size={15} className="accent-text shrink-0" />
                : <QrCode size={15} className="accent-text shrink-0" />
            }
            <h3 className="text-sm font-bold text-primary truncate">
              {isAllMode
                ? `Print Semua Port`
                : typeof initialPort === 'number'
                  ? `Label Port ${initialPort}`
                  : 'Print Label'
              }
            </h3>
            <span className="text-[11px] text-muted truncate">
              — {data?.name}
              {typeof initialPort === 'number' && customers[portIdx] &&
                <span className="ml-1 text-[var(--accent)]">· {customers[portIdx].name}</span>
              }
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-muted hover:text-primary transition-colors shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* ── Mobile tab bar — tersembunyi di mode 'all' & port langsung (langsung preview) ── */}
        <div className={clsx('flex border-b border-[var(--border)] shrink-0 md:hidden', isAllMode || typeof initialPort === 'number' ? 'hidden' : '')}>
          {[
            { id: 'config',  label: 'Pengaturan' },
            { id: 'preview', label: 'Preview' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={clsx(
                'flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px',
                mobileTab === tab.id
                  ? 'border-[var(--accent)] text-[var(--accent)]'
                  : 'border-transparent text-muted hover:text-primary'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Config panel — hidden on mobile when preview tab active */}
          <div className={clsx(
            'shrink-0 border-r border-[var(--border)] overflow-y-auto p-4 space-y-4',
            'w-full md:w-64',
            mobileTab === 'preview' ? 'hidden md:block' : 'block'
          )}>

            {/* Template selection */}
            <div>
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Jenis Label</p>
              <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
                {TEMPLATES.map(t => {
                  const Icon = t.icon
                  const active = templateId === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => handleTemplateChange(t.id)}
                      className={clsx(
                        'text-left px-3 py-2.5 rounded-xl border transition-all',
                        active
                          ? 'border-[var(--accent)] bg-[var(--accent-glow)]'
                          : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Icon size={12} className={active ? 'text-[var(--accent)]' : 'text-muted'} />
                        <span className={clsx('text-[12px] font-semibold leading-tight', active ? 'text-primary' : 'text-secondary')}>
                          {t.label}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted leading-snug line-clamp-2">{t.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Size selection — only compatible sizes, horizontal chips on mobile */}
            <div>
              <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Ukuran</p>
              <div className="flex flex-wrap gap-1.5 md:flex-col md:gap-1">
                {compatSizes.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSizeId(s.id)}
                    className={clsx(
                      'text-left rounded-lg border transition-all',
                      'px-2.5 py-1.5 md:w-full',
                      sizeId === s.id
                        ? 'border-[var(--accent)] bg-[var(--accent-glow)]'
                        : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                    )}
                  >
                    <span className="text-[11px] font-semibold text-primary">{s.name}</span>
                    <span className="hidden md:block text-[9px] text-muted">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Port/customer selector */}
            {(templateId === 'label_odp_port' || templateId === 'label_customer') && customers.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-2">Pelanggan</p>
                <select
                  value={portIdx}
                  onChange={e => setPortIdx(Number(e.target.value))}
                  className="w-full px-2 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]"
                >
                  {customers.map((c, i) => (
                    <option key={c.id} value={i}>Port {c.odpPort ?? i+1} — {c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Printer hint */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/60 p-3">
              <p className="text-[10px] font-semibold text-secondary mb-1">💡 {size.name}</p>
              <p className="text-[10px] text-muted leading-relaxed">{size.desc}</p>
            </div>
          </div>

          {/* Preview panel — hidden on mobile when config tab active */}
          <div className={clsx(
            'flex flex-col flex-1 overflow-hidden',
            mobileTab === 'config' ? 'hidden md:flex' : 'flex'
          )}>
            {/* Preview canvas */}
            <div className="flex-1 flex items-center justify-center bg-[var(--bg-secondary)]/40 overflow-auto p-4 sm:p-6">
              {isAllMode ? (
                /* Mode 'semua': tampilkan semua label port berderet */
                <div className="flex flex-col gap-3 items-center py-2">
                  <p className="text-[10px] text-muted mb-1">Preview {customers.filter(c => c.odpPort).length} label port</p>
                  {customers.filter(c => c.odpPort).map((c, i) => {
                    const rd2 = { odp: data, port: c.odpPort, customer: c }
                    return (
                      <div
                        key={c.id}
                        className="shadow-lg rounded overflow-hidden ring-1 ring-black/10"
                        ref={el => { allLabelRef.current[i] = el }}
                      >
                        <LabelOdpPort data={rd2} size={size} />
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="shadow-2xl rounded overflow-hidden ring-1 ring-black/10">
                  <div ref={labelRef}>
                    {template.render(rd, size)}
                  </div>
                </div>
              )}
            </div>

            {/* Size info bar */}
            <div className="px-4 py-2 bg-[var(--bg-secondary)]/60 border-t border-[var(--border)] flex items-center gap-2 text-[10px] text-muted shrink-0">
              <span className="font-mono text-primary">{size.mmW}×{size.mmH} mm</span>
              <span>·</span>
              <span className="text-[var(--accent)]">{size.pxW}×{size.pxH} px</span>
              <span className="flex-1 truncate text-right hidden sm:block">{size.desc}</span>
            </div>
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="border-t border-[var(--border)] px-4 sm:px-5 py-3 flex items-center gap-2 shrink-0">
          {/* Mobile: "Lihat Preview" shortcut dari config tab */}
          {mobileTab === 'config' && (
            <button
              onClick={() => setMobileTab('preview')}
              className="md:hidden flex-1 py-2.5 text-xs font-medium rounded-xl border border-[var(--border)] text-secondary hover:text-primary transition-colors"
            >
              Lihat Preview →
            </button>
          )}

          <div className="hidden md:block flex-1" />

          <button
            onClick={onClose}
            className="hidden md:block px-3 py-2 text-xs rounded-lg border border-[var(--border)] text-secondary hover:text-primary transition-colors"
          >
            Tutup
          </button>

          <button
            onClick={isAllMode ? handlePrintAll : () => triggerPrint(labelRef, size)}
            className={clsx(
              'flex items-center justify-center gap-1.5 py-2.5 text-xs rounded-xl font-semibold',
              'bg-[var(--accent)] text-white hover:opacity-90 transition-opacity',
              mobileTab === 'config' ? 'md:flex px-4' : 'flex-1 md:flex-none md:px-4'
            )}
          >
            <Printer size={13} />
            {isAllMode ? `Print ${customers.filter(c=>c.odpPort).length} Label` : 'Print Label'}
          </button>
        </div>
      </div>
    </div>
  )
}
