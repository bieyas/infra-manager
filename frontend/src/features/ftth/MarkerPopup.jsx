import React from 'react'
import {
  Edit2, ExternalLink, X,
  Server, Radio, Layers, Box, User,
  Activity, Cable, Navigation,
} from 'lucide-react'
import clsx from 'clsx'
import { MARKER_CFG } from './constants'

// ── Helpers ──────────────────────────────────────────────────────────────────

function utilColor(u) {
  if (u >= 80) return '#ef4444'
  if (u >= 50) return '#f59e0b'
  return '#10b981'
}

function statusDot(status) {
  const map = {
    active:      '#10b981',
    inactive:    '#6b7280',
    maintenance: '#f59e0b',
    suspended:   '#f97316',
    terminated:  '#ef4444',
  }
  return map[status?.toLowerCase()] ?? '#6b7280'
}

// Satu baris info: ikon + label + nilai
function InfoRow({ icon: Icon, label, value, mono = false }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-center gap-1.5 text-[10px] leading-none">
      <Icon size={9} className="shrink-0 text-gray-400" />
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className={clsx('text-gray-800 font-medium truncate', mono && 'font-mono')}>
        {value}
      </span>
    </div>
  )
}

// Tombol aksi kecil
function ActionBtn({ onClick, href, title, icon: Icon, variant = 'default', className = '' }) {
  const base = 'inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors shrink-0'
  const variants = {
    default: 'bg-gray-100 hover:bg-gray-200 text-gray-600',
    primary: 'bg-blue-50 hover:bg-blue-100 text-blue-600',
    green:   'bg-emerald-50 hover:bg-emerald-100 text-emerald-600',
    red:     'bg-red-50 hover:bg-red-100 text-red-500',
  }
  const cls = clsx(base, variants[variant], className)
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={cls}>
        <Icon size={12} />
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} title={title} className={cls}>
      <Icon size={12} />
    </button>
  )
}

// ── Komponen info per tipe ────────────────────────────────────────────────────

function OltInfo({ node }) {
  return (
    <>
      <InfoRow icon={Server}   label="IP"        value={node.ip}       mono />
      <InfoRow icon={Radio}    label="PON ports" value={node.ponCount} />
      <InfoRow icon={Activity} label="Status"    value={node.status}   />
    </>
  )
}

function OdcInfo({ node, ftthNodes }) {
  const olt = ftthNodes?.find(n => n.id === node.oltId && n.type === 'olt')
  return (
    <>
      <InfoRow icon={Server} label="OLT"      value={olt?.name || node.olt?.name} />
      <InfoRow icon={Radio}  label="PON"      value={node.ponPort} mono />
      <InfoRow icon={Cable}  label="Splitter" value={node.splitterRatio ? `1:${node.splitterRatio.replace('R1_', '')}` : null} />
      <InfoRow icon={Box}    label="Core"     value={node.feederCore ? `Core ${node.feederCore}` : null} />
    </>
  )
}

function OdpInfo({ node, ftthNodes }) {
  const odc = ftthNodes?.find(n => n.id === node.odcId && n.type === 'odc')
  return (
    <>
      <InfoRow icon={Layers} label="ODC"      value={odc?.name || node.odc?.name} />
      <InfoRow icon={Cable}  label="Splitter" value={node.splitterRatio ? `1:${node.splitterRatio.replace('R1_', '')}` : null} />
      <InfoRow icon={User}   label="Pelanggan" value={node.customerCount > 0 ? `${node.customerCount} aktif` : null} />
    </>
  )
}

function OnuInfo({ node, ftthNodes }) {
  const odp = ftthNodes?.find(n => n.id === node.odpId && n.type === 'odp')
  const statusLabel = { active: 'Aktif', suspended: 'Suspend', terminated: 'Terminasi' }
  return (
    <>
      <InfoRow icon={Layers} label="ODP"    value={odp?.name} />
      <InfoRow icon={User}   label="ID"     value={node.customerId} mono />
      <InfoRow icon={Activity} label="Layanan" value={statusLabel[node.status] ?? node.status} />
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MarkerPopup({ node, onDetail, onEdit, onClose, onNavigate, ftthNodes }) {
  const cfg      = MARKER_CFG[node.type] ?? {}
  const gmapsUrl = node.lat && node.lng
    ? `https://www.google.com/maps?q=${node.lat},${node.lng}`
    : null

  // Rute navigasi per tipe
  const editPath = node.type === 'odc'  ? `/odc/${node.id}/edit`
    : node.type === 'odp'               ? `/odp/${node.id}/edit`
    : node.type === 'onu'               ? `/customers/${node.id}/edit`
    : null

  const detailPath = node.type === 'odc'  ? `/odc/${node.id}`
    : node.type === 'odp'                 ? `/odp/${node.id}/edit`
    : node.type === 'olt'                 ? `/devices/${node.id}`
    : node.type === 'onu'                 ? `/customers`
    : null

  const showUtil = node.utilization != null && node.capacity > 0

  return (
    <div className="min-w-[180px] max-w-[220px] font-sans">

      {/* ── Header ── */}
      <div className="flex items-start gap-2 mb-2">
        {/* Type badge */}
        <span
          className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase text-white shrink-0 leading-none mt-0.5"
          style={{ background: cfg.color }}
        >
          {node.type}
        </span>

        {/* Name + status dot */}
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold text-gray-900 leading-tight truncate" title={node.name}>
            {node.name}
          </p>
          {node.address && (
            <p className="text-[10px] text-gray-400 truncate mt-0.5" title={node.address}>
              {node.address}
            </p>
          )}
        </div>

        {/* Status dot */}
        <span
          className="w-2 h-2 rounded-full shrink-0 mt-1"
          style={{ background: statusDot(node.status) }}
          title={node.status}
        />

        {/* Close */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 rounded text-gray-300 hover:text-gray-500 transition-colors -mr-0.5 -mt-0.5"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* ── Info rows per tipe ── */}
      <div className="space-y-1 mb-2">
        {node.type === 'olt' && <OltInfo node={node} />}
        {node.type === 'odc' && <OdcInfo node={node} ftthNodes={ftthNodes} />}
        {node.type === 'odp' && <OdpInfo node={node} ftthNodes={ftthNodes} />}
        {node.type === 'onu' && <OnuInfo node={node} ftthNodes={ftthNodes} />}
      </div>

      {/* ── Utilization bar — hanya ODC & ODP ── */}
      {showUtil && (
        <div className="mb-2">
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-[9px] text-gray-400">Utilisasi port</span>
            <span
              className="text-[9px] font-semibold"
              style={{ color: utilColor(node.utilization) }}
            >
              {node.usedPorts}/{node.capacity} ({node.utilization}%)
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${node.utilization}%`,
                background: utilColor(node.utilization),
              }}
            />
          </div>
        </div>
      )}

      {/* ── Divider ── */}
      <div className="border-t border-gray-100 pt-1.5">

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-1">
          {/* Detail modal — semua tipe via onDetail callback ke parent */}
          {onDetail && (
            <ActionBtn
              onClick={() => onDetail(node)}
              icon={node.type === 'onu' ? User : ExternalLink}
              title={node.type === 'onu' ? 'Detail pelanggan' : 'Lihat detail'}
              variant="default"
            />
          )}

          {/* Buka halaman — OLT ke devices, ODC ke detail, ONU ke daftar pelanggan */}
          {detailPath && onNavigate && node.type !== 'odp' && (
            <ActionBtn
              onClick={() => onNavigate(detailPath)}
              icon={Layers}
              title={node.type === 'onu' ? 'Daftar pelanggan' : 'Halaman detail'}
              variant="primary"
            />
          )}

          {/* Edit langsung */}
          {editPath && onNavigate && node.type !== 'olt' && (
            <ActionBtn
              onClick={() => onNavigate(editPath)}
              icon={Edit2}
              title="Edit"
              variant="primary"
            />
          )}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Google Maps */}
          {gmapsUrl && (
            <ActionBtn
              href={gmapsUrl}
              icon={Navigation}
              title="Buka di Google Maps"
              variant="green"
            />
          )}
        </div>
      </div>
    </div>
  )
}
