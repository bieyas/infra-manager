import React, { useEffect, useState } from 'react'
import {
  X, User, MapPin, Wifi, Package, Phone, Calendar, ShieldAlert, Zap,
  Network, Hash, Loader2, AlertCircle, ExternalLink, Copy, Router, Activity,
} from 'lucide-react'
import Badge from '../../components/ui/Badge'
import TrafficAreaChart, { formatSpeed } from '../../components/ui/TrafficAreaChart'
import { useCustomerDetail, STATUS_CFG, CONNECTION_CFG } from './useCustomers'
import { useToast } from '../../context/ToastContext'
import { api } from '../../lib/api'

function formatClock(date, withSeconds = false) {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  if (!withSeconds) return `${h}:${m}`
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

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
  const [trafficRange, setTrafficRange] = useState('24h')
  const [trafficMode, setTrafficMode] = useState('history')
  const [liveInterval, setLiveInterval] = useState(2)
  const [trafficSeries, setTrafficSeries] = useState([])
  const [liveSeries, setLiveSeries] = useState([])
  const [livePoint, setLivePoint] = useState(null)
  const [trafficLoading, setTrafficLoading] = useState(false)
  const [trafficError, setTrafficError] = useState(null)
  const sourceDeviceId = c?.sourceDevice?.id

  useEffect(() => {
    let cancelled = false
    if (!c?.pppoeUsername || !c?.sourceDevice) {
      setTrafficSeries([])
      return undefined
    }
    if (trafficMode === 'live') return undefined
    setTrafficLoading(true)
    setTrafficError(null)
    api.get(`/customers/${customerId}/traffic/series?range=${trafficRange}`)
      .then(result => {
        if (cancelled) return
        const mapped = (result.samples || []).map(sample => ({
          time: formatClock(sample.timestamp, false),
          in: Number(sample.inBps || 0) / 1_000_000,
          out: Number(sample.outBps || 0) / 1_000_000,
        }))
        if (mapped.length === 1) {
          const prevTime = formatClock(new Date(result.samples[0].timestamp).getTime() - 5 * 60 * 1000, false)
          mapped.unshift({ time: prevTime, in: mapped[0].in, out: mapped[0].out })
        }
        setTrafficSeries(mapped)
      })
      .catch(e => {
        if (!cancelled) setTrafficError(e.message || 'Grafik trafik tidak tersedia')
      })
      .finally(() => { if (!cancelled) setTrafficLoading(false) })
    return () => {
      cancelled = true
    }
  }, [c?.pppoeUsername, sourceDeviceId, customerId, trafficRange, trafficMode])

  useEffect(() => {
    if (trafficMode !== 'live' || !c?.pppoeUsername || !c?.sourceDevice) return undefined
    let cancelled = false
    let timer
    setLiveSeries([])
    setLivePoint(null)
    const poll = async () => {
      if (document.hidden) return
      try {
        const point = await api.get(`/customers/${customerId}/traffic/live`)
        if (!cancelled) {
          const timestamp = new Date(point.timestamp)
          if (Number.isNaN(timestamp.getTime())) throw new Error('Timestamp data live tidak valid')
          const nextPoint = {
            timestamp: timestamp.getTime(),
            time: formatClock(timestamp, true),
            in: Number(point.inBps || 0) / 1_000_000,
            out: Number(point.outBps || 0) / 1_000_000,
          }
          setLivePoint(nextPoint)
          setLiveSeries(previous => previous.some(item => item.timestamp === nextPoint.timestamp)
            ? previous
            : [...previous, nextPoint].slice(-60))
        }
      } catch (e) {
        if (!cancelled) setTrafficError(e.message || 'Data live tidak tersedia')
      } finally {
        if (!cancelled) timer = setTimeout(poll, liveInterval * 1000)
      }
    }
    setTrafficLoading(true)
    setTrafficError(null)
    poll().finally(() => { if (!cancelled) setTrafficLoading(false) })
    return () => { cancelled = true; clearTimeout(timer) }
  }, [c?.pppoeUsername, sourceDeviceId, customerId, trafficMode, liveInterval])

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
              {/* Critical Infrastructure Gateway Banner (Bridge ONU) */}
              {c.bridgedHtbBoxes?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-start gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-xs text-amber-200">
                    <span className="font-bold text-amber-400 block tracking-wide">
                      ⚠️ PERINGATAN INFRASTRUKTUR (Bridge Gateway)
                    </span>
                    <p className="text-[11px] leading-relaxed">
                      ONU pelanggan ini difungsikan sebagai <b>Bridge Uplink</b> untuk Box HTB:{' '}
                      <b>{c.bridgedHtbBoxes.map(b => b.name).join(', ')}</b>.
                      Jangan mencabut kabel atau mematikan ONU ini di OLT karena akan mematikan seluruh distribusi pelanggan di bawahnya.
                    </p>
                  </div>
                </div>
              )}

              {/* Power Host Warning */}
              {c.hostedHtbBoxes?.length > 0 && (
                <div className="p-3 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center gap-2 text-xs text-blue-300">
                  <Zap className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>
                    Rumah pelanggan ini menjadi sumber catu daya listrik untuk Box HTB: <b>{c.hostedHtbBoxes.map(b => b.name).join(', ')}</b>.
                  </span>
                </div>
              )}
              <Section title="Trafik PPPoE" icon={Activity}>
                {/* Header Controls */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] text-muted font-mono truncate">
                    pppoe-{c.pppoeUsername}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setTrafficMode('history')}
                      className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                        trafficMode === 'history'
                          ? 'bg-[var(--accent-glow)] border-[var(--accent)] text-[var(--accent)]'
                          : 'border-[var(--border)] text-muted hover:text-primary'
                      }`}
                    >
                      Histori
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrafficMode('live')}
                      className={`text-[10px] px-2 py-0.5 rounded border font-medium flex items-center gap-1 ${
                        trafficMode === 'live'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                          : 'border-[var(--border)] text-muted hover:text-primary'
                      }`}
                    >
                      {trafficMode === 'live' && (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                      Live
                    </button>
                    {trafficMode === 'live' && (
                      <select
                        value={liveInterval}
                        onChange={event => setLiveInterval(Number(event.target.value))}
                        className="text-[10px] bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-1.5 py-0.5 text-primary font-mono"
                        aria-label="Interval polling"
                      >
                        <option value={1}>1s</option>
                        <option value={2}>2s</option>
                        <option value={5}>5s</option>
                      </select>
                    )}
                    {trafficMode === 'history' && (
                      <select
                        value={trafficRange}
                        onChange={event => setTrafficRange(event.target.value)}
                        className="text-[10px] bg-[var(--bg-secondary)] border border-[var(--border)] rounded px-1.5 py-0.5 text-primary"
                        aria-label="Rentang grafik"
                      >
                        <option value="1h">1 jam</option>
                        <option value="6h">6 jam</option>
                        <option value="24h">24 jam</option>
                        <option value="7d">7 hari</option>
                        <option value="30d">30 hari</option>
                      </select>
                    )}
                  </div>
                </div>

                {/* Prominent Bandwidth KPIs */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="bg-[var(--bg-secondary)] border border-cyan-500/25 rounded-lg px-2.5 py-1.5 flex flex-col justify-center">
                    <span className="text-[9px] text-cyan-400 font-semibold tracking-wider uppercase">
                      ⬆ Upload (TX)
                    </span>
                    <span className="text-sm font-mono font-bold text-cyan-400 mt-0.5 truncate">
                      {formatSpeed(
                        trafficMode === 'live'
                          ? livePoint?.in ?? 0
                          : trafficSeries[trafficSeries.length - 1]?.in ?? 0
                      )}
                    </span>
                  </div>
                  <div className="bg-[var(--bg-secondary)] border border-amber-500/25 rounded-lg px-2.5 py-1.5 flex flex-col justify-center">
                    <span className="text-[9px] text-amber-400 font-semibold tracking-wider uppercase">
                      ⬇ Download (RX)
                    </span>
                    <span className="text-sm font-mono font-bold text-amber-400 mt-0.5 truncate">
                      {formatSpeed(
                        trafficMode === 'live'
                          ? livePoint?.out ?? 0
                          : trafficSeries[trafficSeries.length - 1]?.out ?? 0
                      )}
                    </span>
                  </div>
                </div>

                {/* Chart Box */}
                <div className="min-h-[185px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] overflow-hidden flex items-center justify-center p-1">
                  {trafficLoading && <Loader2 size={18} className="animate-spin text-[var(--accent)]" />}
                  {!trafficLoading && (trafficMode === 'live' ? Boolean(livePoint) : trafficSeries.length > 0) && (
                    <TrafficAreaChart data={trafficMode === 'live' ? liveSeries : trafficSeries} />
                  )}
                  {!trafficLoading && (trafficMode === 'live' ? !livePoint : trafficSeries.length === 0) && (
                    <span className="text-[10px] text-muted text-center px-4">
                      {trafficError || (trafficMode === 'live' ? 'Menghubungkan ke router untuk data realtime...' : 'Belum ada data sampel histori.')}
                    </span>
                  )}
                </div>
              </Section>

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

              {/* Koneksi FTTH (ODP / PON) */}
              {c.odp && (
                <Section title="Koneksi FTTH (PON)" icon={Network}>
                  <Row label="ODP"        value={c.odp.name} />
                  <Row label="Port ODP"   value={c.odpPort} />
                  {c.splitterPort && (
                    <Row label="Splitter Port" value={`${c.splitterPort.splitterInstance?.splitterType?.name ?? ''} — Port ${c.splitterPort.portNumber}`} />
                  )}
                  {c.odp.olt && <Row label="OLT" value={c.odp.olt.name} />}
                </Section>
              )}

              {/* Koneksi Non-OLT (Box HTB) */}
              {c.htbBox && (
                <Section title="Koneksi Non-OLT (Box HTB)" icon={Network}>
                  <Row label="Box HTB"    value={c.htbBox.name} />
                  <Row label="Port HTB"   value={c.htbPort?.label || `Port ${c.htbPort?.portIndex || '-'}`} />
                  <Row label="Tipe Port"  value={c.htbPort?.portType === 'FO' ? `Optik SC (${c.htbPort.wavelength === '1550' ? '1550nm Side B' : '1310nm Side A'})` : 'Ethernet RJ45 LAN'} />
                  <Row label="Perangkat CPE" value={c.cpeType || 'Router WiFi'} />
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
