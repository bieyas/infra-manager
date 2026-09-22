import React, { useState } from 'react'
import {
  X, User, MapPin, Wifi, Package, Phone, Calendar,
  Network, Hash, Loader2, AlertCircle, ExternalLink, Copy, Router,
} from 'lucide-react'
import Badge from '../../components/ui/Badge'
import { useCustomerDetail, STATUS_CFG, CONNECTION_CFG } from './useCustomers'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'

function Row({ label, value, mono = false }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-[10px] text-muted w-28 shrink-0 pt-0.5">{label}</span>
      <span className={`text-[11px] text-primary break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={11} className="text-[var(--accent)]" />
        <span className="text-[10px] font-semibold text-muted uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </div>
  )
}

function CopyButton({ value, label }) {
  const toast = useToast()

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = value
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const copied = document.execCommand('copy')
        textarea.remove()
        if (!copied) throw new Error('copy command failed')
      }
      toast.success(`${label} berhasil disalin`)
    } catch {
      toast.error(`Gagal menyalin ${label.toLowerCase()}`)
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Salin ${label}`}
      aria-label={`Salin ${label}`}
      className="p-1 rounded text-muted hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-colors shrink-0"
    >
      <Copy size={11} />
    </button>
  )
}

function ActionRow({ label, value, mono = false, action }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[var(--border)] last:border-0">
      <span className="text-[10px] text-muted w-28 shrink-0 pt-0.5">{label}</span>
      <span className={`text-[11px] text-primary break-all flex-1 ${mono ? 'font-mono' : ''}`}>{value}</span>
      {action}
    </div>
  )
}

export default function CustomerDetail({ customerId, onClose }) {
  const { data: c, loading, error } = useCustomerDetail(customerId)
  const toast = useToast()
  const [remoteLoading, setRemoteLoading] = useState(false)

  const openRemoteOnu = async () => {
    const popup = window.open('about:blank', '_blank')
    if (popup) {
      popup.opener = null
      popup.document.title = 'Menyiapkan Remote ONU'
      popup.document.body.innerHTML = '<p style="font-family:sans-serif;padding:24px">Menyiapkan koneksi remote ONU...</p>'
    }
    try {
      setRemoteLoading(true)
      const session = await api.post(`/customers/${customerId}/remote-session`, {})
      if (!popup) {
        await navigator.clipboard?.writeText(session.url)
        toast.info('Popup diblokir. URL remote sudah disalin jika browser mengizinkan.')
      } else {
        popup.location.replace(session.url)
      }
      toast.success(`Remote ONU aktif selama ${Math.ceil((new Date(session.expiresAt) - Date.now()) / 60000)} menit`)
    } catch (e) {
      popup?.close()
      toast.error(e.message || 'Gagal membuka remote ONU')
    } finally {
      setRemoteLoading(false)
    }
  }

  const statusCfg = STATUS_CFG[c?.serviceStatus] ?? STATUS_CFG.ACTIVE
  const connectionCfg = CONNECTION_CFG[c?.connectionStatus] ?? CONNECTION_CFG.UNKNOWN

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-glow)] border border-[var(--accent)]/30 flex items-center justify-center shrink-0">
              <User size={16} className="text-[var(--accent)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-primary leading-tight">
                {loading ? 'Memuat...' : (c?.name ?? '—')}
              </p>
              {c?.customerId && (
                <p className="text-[10px] text-muted font-mono">{c.customerId}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {c && (
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${connectionCfg.bg} ${connectionCfg.color}`}>
                  {connectionCfg.label}
                </span>
              </div>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[var(--bg-secondary)] transition-colors">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-rose-400 text-xs">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {c && (
            <>
              {/* Info Umum */}
              <Section title="Info Pelanggan" icon={User}>
                <Row label="ID Pelanggan"   value={c.customerId} mono />
                <Row label="Nama"           value={c.name} />
                <Row label="Terakhir online" value={c.connectionLastSeen ? new Date(c.connectionLastSeen).toLocaleString('id-ID') : null} />
                <Row label="Terakhir dicek" value={c.connectionLastChecked ? new Date(c.connectionLastChecked).toLocaleString('id-ID') : null} />
                {c.phone && (
                  <div className="flex items-start gap-2 py-1.5 border-b border-[var(--border)]">
                    <span className="text-[10px] text-muted w-28 shrink-0 pt-0.5">Telepon / HP</span>
                    <a href={`tel:${c.phone}`} className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1">
                      <Phone size={9} />{c.phone}
                    </a>
                  </div>
                )}
                <Row label="Alamat"         value={c.address} />
                {(c.lat && c.lng) && (
                  <div className="flex items-start gap-2 py-1.5 border-b border-[var(--border)]">
                    <span className="text-[10px] text-muted w-28 shrink-0 pt-0.5">Koordinat</span>
                    <a
                      href={`https://www.google.com/maps?q=${c.lat},${c.lng}`}
                      target="_blank" rel="noreferrer"
                      className="text-[11px] text-[var(--accent)] hover:underline flex items-center gap-1"
                    >
                      {c.lat.toFixed(6)}, {c.lng.toFixed(6)}
                      <ExternalLink size={9} />
                    </a>
                  </div>
                )}
              </Section>

              {/* Paket Layanan */}
              <Section title="Paket Layanan" icon={Package}>
                <Row label="Paket"          value={c.packageName} />
                <Row label="Kecepatan"      value={c.packageSpeed ? `${c.packageSpeed} Mbps` : null} />
                <Row label="VLAN"           value={c.vlan} mono />
                <ActionRow
                  label="IP Address"
                  value={c.ipAddress}
                  mono
                  action={(
                    <button
                      type="button"
                      title="Buka remote ONU sementara"
                      aria-label="Buka remote ONU"
                      onClick={openRemoteOnu}
                      disabled={remoteLoading}
                      className="p-1 rounded text-muted hover:text-[var(--accent)] hover:bg-[var(--bg-secondary)] transition-colors shrink-0 disabled:opacity-50"
                    >
                      {remoteLoading ? <Loader2 size={12} className="animate-spin" /> : <Router size={12} />}
                    </button>
                  )}
                />
                <ActionRow
                  label="PPPoE Username"
                  value={c.pppoeUsername}
                  mono
                  action={<CopyButton value={c.pppoeUsername} label="PPPoE Username" />}
                />
                <ActionRow
                  label="PPPoE Password"
                  value={c.pppoePassword}
                  mono
                  action={<CopyButton value={c.pppoePassword} label="PPPoE Password" />}
                />
              </Section>

              {/* ONU / Jaringan */}
              <Section title="ONU & Jaringan" icon={Wifi}>
                <Row label="ONU Serial"     value={c.onuSn} mono />
                <Row label="ONU Index"      value={c.onuIndex} mono />
                <Row label="RX Power"       value={c.rxPower != null ? `${c.rxPower} dBm` : null} mono />
                <Row label="TX Power"       value={c.txPower != null ? `${c.txPower} dBm` : null} mono />
              </Section>

              {/* Koneksi FTTH */}
              {c.odp && (
                <Section title="Koneksi FTTH" icon={Network}>
                  {c.odp.odc && <Row label="ODC"    value={c.odp.odc.name} />}
                  <Row label="ODP"        value={c.odp.name} />
                  <Row label="Port ODP"   value={c.odpPort} />
                  {c.splitterPort && (
                    <Row label="Splitter Port" value={`${c.splitterPort.splitterInstance?.splitterType?.name ?? ''} — Port ${c.splitterPort.portNumber}`} />
                  )}
                  {c.odp.olt && <Row label="OLT" value={c.odp.olt.name} />}
                </Section>
              )}

              {/* Instalasi */}
              <Section title="Instalasi" icon={Calendar}>
                <Row label="Teknisi"        value={c.installerName} />
                <Row label="Tgl Pasang"     value={c.installDate ? new Date(c.installDate).toLocaleDateString('id-ID') : null} />
                <Row label="Kontrak Sampai" value={c.contractExpiry ? new Date(c.contractExpiry).toLocaleDateString('id-ID') : null} />
              </Section>

              {/* Catatan */}
              {c.notes && (
                <Section title="Catatan" icon={Hash}>
                  <p className="text-[11px] text-primary whitespace-pre-wrap">{c.notes}</p>
                </Section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
