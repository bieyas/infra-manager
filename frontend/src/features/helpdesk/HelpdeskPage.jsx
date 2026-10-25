import React, { useState, useEffect, useRef } from 'react'
import {
  Laptop, Tv, MessageSquare, QrCode, Clock, Shield, Eye,
  RefreshCw, Search, CheckCircle2, Navigation, AlertCircle,
  Radio, UserRound, Phone, LogOut, Square, ExternalLink,
  ChevronRight, Wrench, AlertTriangle, Users, KeyRound, Camera, Send
} from 'lucide-react'
import clsx from 'clsx'

import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import StatusDot from '../../components/ui/StatusDot'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

function getPortalBaseUrl() {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return 'https://portal.fastkho.online'
  }
  return `http://${window.location.hostname}:3392`
}

function getPortalWsUrl() {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    return 'wss://portal.fastkho.online/ws'
  }
  return `ws://${window.location.hostname}:3392/ws`
}

export default function HelpdeskPage() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [activeTab, setActiveTab] = useState('customers') // customers, tickets, staff
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState({ openTickets: 0, totalCustomers: 0, totalTrx: 0, activeHelp: 0 })
  const [customers, setCustomers] = useState([])
  const [tickets, setTickets] = useState([])
  const [staff, setStaff] = useState([])
  const [searchQuery, setSearchQuery] = useState('')

  // Studio Remote Assistance State
  const [liveStudio, setLiveStudio] = useState(null)
  const [studioConnected, setStudioConnected] = useState(false)
  const [customGuideText, setCustomGuideText] = useState('')
  const [remoteStreamReceived, setRemoteStreamReceived] = useState(false)

  // WebSocket & WebRTC
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const [portalToken, setPortalToken] = useState(null)

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }

  // ── 1. INITIALIZE DATA & WS TOKEN ──────────────────────────────────────────
  const fetchAllData = async () => {
    setLoading(true)
    try {
      const [dashRes, custRes, tktRes, stfRes, wsRes] = await Promise.all([
        api.get('/helpdesk/dashboard').catch(() => ({ data: {} })),
        api.get('/helpdesk/customers').catch(() => ({ data: [] })),
        api.get('/helpdesk/tickets').catch(() => ({ data: [] })),
        api.get('/helpdesk/staff').catch(() => ({ data: [] })),
        api.get('/helpdesk/ws-token').catch(() => null)
      ])

      if (dashRes?.data) setStats(dashRes.data)
      if (custRes?.data) setCustomers(custRes.data)
      if (tktRes?.data) setTickets(tktRes.data)
      if (stfRes?.data) setStaff(stfRes.data)
      if (wsRes?.token) setPortalToken(wsRes.token)
    } catch (err) {
      console.error('Failed to load helpdesk data:', err)
      showToast?.({ title: 'Gagal memuat data Helpdesk', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // ── 2. WEBSOCKET REAL-TIME CONNECTION ──────────────────────────────────────
  useEffect(() => {
    if (!portalToken) return

    const wsUrl = getPortalWsUrl()
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'AUTH', token: portalToken }))
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'CUSTOMER_HELP_BADGE') {
          // Re-fetch customer list to update badges
          api.get('/helpdesk/customers').then(res => {
            if (res?.data) setCustomers(res.data)
          })
          api.get('/helpdesk/dashboard').then(res => {
            if (res?.data) setStats(res.data)
          })

          if (msg.status === 'requesting') {
            showToast?.({
              title: `🆘 Bantuan Layar: ${msg.nama_lengkap || msg.pelanggan_id}`,
              type: 'info'
            })
          }

          if (liveStudio && liveStudio.pelanggan_id === msg.pelanggan_id && msg.status === 'closed') {
            setStudioConnected(false)
            setLiveStudio(null)
            stopWebRtc()
          }
        }

        else if (msg.type === 'STAFF_HELP_CONNECTED') {
          setStudioConnected(true)
        }

        else if (msg.type === 'HELP_SESSION_ENDED') {
          setStudioConnected(false)
          setRemoteStreamReceived(false)
          stopWebRtc()
        }

        else if (msg.type === 'WEBRTC_SIGNAL') {
          handleWebRtcSignal(msg)
        }
      } catch (err) {
        console.error('WS Helpdesk error:', err)
      }
    }

    return () => {
      ws.close()
      stopWebRtc()
    }
  }, [portalToken, liveStudio])

  // ── 3. WEBRTC ENGINE (RECEIVER) ─────────────────────────────────────────────
  const stopWebRtc = () => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    setRemoteStreamReceived(false)
  }

  const handleWebRtcSignal = async (msg) => {
    if (msg.stop_screen) {
      setRemoteStreamReceived(false)
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
      return
    }

    if (msg.sdp) {
      if (msg.sdp.type === 'offer') {
        const pc = new RTCPeerConnection(rtcConfig)
        pcRef.current = pc

        pc.ontrack = (event) => {
          if (remoteVideoRef.current && event.streams[0]) {
            remoteVideoRef.current.srcObject = event.streams[0]
            setRemoteStreamReceived(true)
          }
        }

        pc.onicecandidate = (e) => {
          if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'WEBRTC_SIGNAL',
              target_pelanggan_id: liveStudio?.pelanggan_id,
              candidate: e.candidate
            }))
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'WEBRTC_SIGNAL',
            target_pelanggan_id: liveStudio?.pelanggan_id,
            sdp: pc.localDescription
          }))
        }
      }
    } else if (msg.candidate && pcRef.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate))
      } catch (e) {
        console.warn('ICE error', e)
      }
    }
  }

  // ── 4. ACTIONS ──────────────────────────────────────────────────────────────
  const handleOpenStudio = (c) => {
    setLiveStudio(c)
    setStudioConnected(c.help_status === 'active')
    setRemoteStreamReceived(false)
  }

  const handleAcceptHelp = () => {
    if (!liveStudio) return
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'STAFF_ACCEPT_HELP',
        target_pelanggan_id: liveStudio.pelanggan_id
      }))
      setStudioConnected(true)
    } else {
      showToast?.({ title: 'WebSocket belum terhubung', type: 'error' })
    }
  }

  const handleSendVisualGuide = (action, text) => {
    if (!liveStudio) return
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'COBROWSE_POINTER',
        target_pelanggan_id: liveStudio.pelanggan_id,
        action,
        text: text || customGuideText
      }))
      if (action === 'custom') setCustomGuideText('')
      showToast?.({ title: 'Petunjuk visual terkirim ke ponsel pelanggan', type: 'success' })
    }
  }

  const handleEndHelpSession = () => {
    if (!liveStudio) return
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'END_HELP_SESSION',
        target_pelanggan_id: liveStudio.pelanggan_id
      }))
    }
    setStudioConnected(false)
    setLiveStudio(null)
    setRemoteStreamReceived(false)
    stopWebRtc()
    fetchAllData()
  }

  const handleImpersonate = async (pelangganId) => {
    try {
      const res = await api.post(`/helpdesk/impersonate/${pelangganId}`)
      if (res?.success && res.token) {
        const portalUrl = `${getPortalBaseUrl()}/?impersonate_token=${encodeURIComponent(res.token)}`
        window.open(portalUrl, '_blank')
        showToast?.({ title: `Membuka sesi impersonate pelanggan ${pelangganId}`, type: 'success' })
      }
    } catch (err) {
      showToast?.({ title: 'Gagal melakukan impersonate', type: 'error' })
    }
  }

  const handleResetPassword = async (c) => {
    if (!confirm(`Reset password akun pelanggan ${c.nama_lengkap} (ID: ${c.pelanggan_id}) ke default 12345678?`)) return
    try {
      const res = await api.post(`/helpdesk/customers/${c.pelanggan_id}/reset-password`)
      showToast?.({ title: res?.message || 'Password berhasil direset', type: 'success' })
      fetchAllData()
    } catch (err) {
      showToast?.({ title: 'Gagal mereset password', type: 'error' })
    }
  }

  const handleToggleTicket = async (t) => {
    try {
      const newStatus = t.status === 'open' ? 'resolved' : 'open'
      await api.patch(`/helpdesk/tickets/${t.id}`, { status: newStatus })
      showToast?.({ title: `Tiket ${t.ticket_number} ditandai ${newStatus}`, type: 'success' })
      fetchAllData()
    } catch (err) {
      showToast?.({ title: 'Gagal memperbarui tiket', type: 'error' })
    }
  }

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <Laptop size={22} className="accent-text" />
            Helpdesk & Remote Assistance
            <Badge variant="accent" className="mono">PORTAL V1.2</Badge>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Layanan aduan pelanggan mandiri, tiket gangguan teknisi, dan panduan layar interaktif berbasis WebRTC.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={ExternalLink}
            onClick={() => window.open(getPortalBaseUrl(), '_blank')}
          >
            Buka Portal Pelanggan ↗
          </Button>

          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            loading={loading}
            onClick={fetchAllData}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Metrics Row (StatCards) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-glow)] flex items-center justify-center">
              <UserRound size={15} className="text-[var(--accent)]" />
            </div>
            <Badge variant="info">PORTAL</Badge>
          </div>
          <p className="text-2xl font-bold text-primary mt-2 leading-none mono">{stats.totalCustomers || customers.length}</p>
          <p className="text-xs text-muted mt-1">Total Pelanggan Terdaftar</p>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <MessageSquare size={15} className="text-amber-400" />
            </div>
            <Badge variant="warning">OPEN</Badge>
          </div>
          <p className="text-2xl font-bold text-primary mt-2 leading-none mono">
            {tickets.filter(t => t.status === 'open').length}
          </p>
          <p className="text-xs text-muted mt-1">Tiket Aduan Aktif</p>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Shield size={15} className="text-emerald-400" />
            </div>
            <Badge variant="online">ONLINE</Badge>
          </div>
          <p className="text-2xl font-bold text-primary mt-2 leading-none mono">{staff.length}</p>
          <p className="text-xs text-muted mt-1">Teknisi & CS Bertugas</p>
        </div>

        <div className={clsx('stat-card', customers.some(c => c.help_status === 'requesting') && '!border-emerald-500/60 glow-ring')}>
          <div className="flex items-start justify-between">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <Laptop size={15} className="text-emerald-400" />
            </div>
            <Badge variant={customers.some(c => c.help_status === 'requesting') ? 'online' : 'neutral'}>
              {customers.some(c => c.help_status === 'requesting') ? 'LIVE REQUEST' : 'STANDBY'}
            </Badge>
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-2 leading-none mono flex items-center gap-2">
            {customers.filter(c => c.help_status === 'requesting' || c.help_status === 'active').length}
            {customers.some(c => c.help_status === 'requesting') && (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
            )}
          </p>
          <p className="text-xs text-muted mt-1">Permintaan Bantuan Layar</p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('customers')}
          className={clsx(
            'nav-item !rounded-lg py-2 px-3 text-xs font-semibold gap-2 transition-all',
            activeTab === 'customers' && '!text-[var(--accent)] !bg-[var(--accent-glow)]'
          )}
        >
          <UserRound size={15} /> Pelanggan & Bantuan Layar
          {customers.some(c => c.help_status === 'requesting') && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('tickets')}
          className={clsx(
            'nav-item !rounded-lg py-2 px-3 text-xs font-semibold gap-2 transition-all',
            activeTab === 'tickets' && '!text-[var(--accent)] !bg-[var(--accent-glow)]'
          )}
        >
          <MessageSquare size={15} /> Tiket Pengaduan
          <span className="px-1.5 py-0.2 rounded text-[10px] mono bg-[var(--bg-card)] border border-[var(--border)]">
            {tickets.filter(t => t.status === 'open').length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('staff')}
          className={clsx(
            'nav-item !rounded-lg py-2 px-3 text-xs font-semibold gap-2 transition-all',
            activeTab === 'staff' && '!text-[var(--accent)] !bg-[var(--accent-glow)]'
          )}
        >
          <Shield size={15} /> Staf & CS
        </button>
      </div>

      {/* ── TAB 1: CUSTOMER LIST & SCREEN ASSIST ──────────────────────────────── */}
      {activeTab === 'customers' && (
        <Card className="overflow-hidden shadow-xl">
          <CardHeader action={
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari ID / Nama pelanggan..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-white focus:outline-none focus:border-[var(--accent)] w-56 sm:w-64 mono"
              />
            </div>
          }>
            <span className="text-sm font-bold text-white flex items-center gap-2">
              <UserRound size={16} className="accent-text" />
              Daftar Pelanggan Portal & Remote Assistance
            </span>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-[var(--bg-secondary)] text-slate-300 border-b border-[var(--border)] uppercase text-[11px] font-semibold mono">
                <tr>
                  <th className="py-3 px-4">ID Pelanggan</th>
                  <th className="py-3 px-4">Nama Pelanggan</th>
                  <th className="py-3 px-4">Paket & Alamat</th>
                  <th className="py-3 px-4">Status Sandi</th>
                  <th className="py-3 px-4">Bantuan Layar Live</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {customers
                  .filter(c => c.pelanggan_id.includes(searchQuery) || c.nama_lengkap.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map(c => (
                    <tr
                      key={c.id}
                      className={clsx(
                        'hover:bg-[var(--accent-glow)]/40 transition-colors',
                        c.help_status === 'requesting' && 'bg-emerald-950/25'
                      )}
                    >
                      <td className="py-3.5 px-4 mono font-bold text-cyan-400">
                        {c.pelanggan_id}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-white block text-sm">{c.nama_lengkap}</span>
                        <span className="text-xs text-slate-400 mono block mt-0.5">{c.phone || '-'}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="text-white block font-medium">{c.paket_name || '5 Mbps Home'}</span>
                        <span className="text-xs text-slate-400 truncate max-w-[240px] block mt-0.5">{c.alamat || '-'}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        {c.is_custom_password ? (
                          <Badge variant="online" className="text-[11px]">Mandiri</Badge>
                        ) : (
                          <Badge variant="warning" className="text-[11px]">Default 12345678</Badge>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {c.help_status === 'requesting' ? (
                          <button
                            onClick={() => handleOpenStudio(c)}
                            title="Pelanggan Meminta Bantuan Layar — Klik untuk Hubungkan"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30 transition text-xs font-semibold shadow-sm animate-pulse"
                          >
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            <Radio size={14} className="text-emerald-400" />
                            <span>Butuh Bantuan</span>
                          </button>
                        ) : c.help_status === 'active' ? (
                          <button
                            onClick={() => handleOpenStudio(c)}
                            title="Sesi Bantuan Aktif — Buka Studio Kontrol"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 transition text-xs font-semibold shadow-sm group"
                          >
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                            </span>
                            <Tv size={14} className="text-cyan-400 group-hover:scale-110 transition" />
                            <span>Studio Kontrol</span>
                          </button>
                        ) : (
                          <span className="text-slate-500 text-xs flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-600"></span>
                            Standby
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            onClick={() => handleImpersonate(c.pelanggan_id)}
                            title="Buka Portal Pelanggan (Impersonate)"
                            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] hover:border-cyan-500/60 hover:bg-cyan-500/10 text-slate-300 hover:text-cyan-400 transition inline-flex items-center justify-center shadow-sm"
                          >
                            <ExternalLink size={15} />
                          </button>
                          <button
                            onClick={() => handleResetPassword(c)}
                            title="Reset Password Default (12345678)"
                            className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] hover:border-amber-500/60 hover:bg-amber-500/10 text-slate-300 hover:text-amber-400 transition inline-flex items-center justify-center shadow-sm"
                          >
                            <KeyRound size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── TAB 2: TICKETS TABLE ──────────────────────────────────────────────── */}
      {activeTab === 'tickets' && (
        <Card className="overflow-hidden shadow-xl">
          <CardHeader>
            <span className="text-sm font-bold text-white flex items-center gap-2">
              <MessageSquare size={16} className="accent-text" />
              Daftar Tiket Aduan Gangguan Pelanggan
            </span>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-200">
              <thead className="bg-[var(--bg-secondary)] text-slate-300 border-b border-[var(--border)] uppercase text-[11px] font-semibold mono">
                <tr>
                  <th className="py-3 px-4">No. Tiket</th>
                  <th className="py-3 px-4">Pelanggan</th>
                  <th className="py-3 px-4">Kategori & Judul</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Petugas</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {tickets.map(t => (
                  <tr key={t.id} className="hover:bg-[var(--accent-glow)]/40 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-cyan-400">{t.ticket_number}</td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-white block text-sm">{t.nama_lengkap}</span>
                      <span className="text-xs text-slate-400 mono block mt-0.5">ID: {t.pelanggan_id}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-white block text-xs">{t.judul}</span>
                      <span className="text-xs text-slate-400 line-clamp-1 mt-0.5">{t.deskripsi}</span>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={t.status === 'open' ? 'warning' : 'online'}>
                        {t.status === 'open' ? 'OPEN' : 'RESOLVED'}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300">
                      {t.assigned_staff_name || 'Belum ditugaskan'}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant={t.status === 'open' ? 'primary' : 'outline'}
                        size="xs"
                        onClick={() => handleToggleTicket(t)}
                        className="font-medium"
                      >
                        {t.status === 'open' ? 'Tandai Selesai' : 'Buka Kembali'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── TAB 3: STAFF USERS ────────────────────────────────────────────────── */}
      {activeTab === 'staff' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {staff.map(s => (
            <Card key={s.id} className="p-4 flex items-center justify-between hover-glow">
              <div>
                <span className="font-bold text-white text-sm block">{s.nama_lengkap}</span>
                <span className="text-xs accent-text font-mono block">@{s.username}</span>
                <Badge variant="accent" className="mt-1">{s.role}</Badge>
              </div>
              <StatusDot status="online" size="md" />
            </Card>
          ))}
        </div>
      )}

      {/* ── STUDIO MODAL: REMOTE ASSISTANCE & WEBRTC ─────────────────────────── */}
      {liveStudio && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <Card className="max-w-4xl w-full p-6 shadow-2xl space-y-5 flex flex-col max-h-[92vh] overflow-y-auto !bg-slate-900 border-slate-700 glow-ring">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-md shadow-cyan-500/10"
                >
                  <Tv size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Studio Remote Assistance: <span className="text-cyan-300">{liveStudio.nama_lengkap}</span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800">
                      ID: {liveStudio.pelanggan_id}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Paket: <strong className="text-white">{liveStudio.paket_name || '5 Mbps'}</strong> • Alamat: <span className="text-slate-300">{liveStudio.alamat || 'Area Jombang'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setLiveStudio(null)
                  stopWebRtc()
                }}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/40 text-slate-400 hover:text-red-300 flex items-center justify-center transition"
                title="Tutup Studio"
              >
                ✕
              </button>
            </div>

            {/* Connection Status Bar */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-800/80 border border-slate-700">
              <div className="flex items-center gap-3">
                <StatusDot status={studioConnected ? 'online' : 'warning'} pulse={true} size="md" />
                <div>
                  <span className="text-xs font-semibold text-white block">
                    {studioConnected
                      ? '🟢 Sesi Interaktif Terhubung dengan Layar / HP Pelanggan'
                      : '🟡 Pelanggan Menunggu Bantuan — Klik tombol untuk mulai memandu'}
                  </span>
                  <span className="text-[11px] text-slate-300">
                    {studioConnected
                      ? 'Perintah panduan visual & laser pointer dapat langsung dikirim.'
                      : 'Setelah terhubung, pelanggan dapat membagikan layar atau kamera HP.'}
                  </span>
                </div>
              </div>
              {!studioConnected ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={CheckCircle2}
                  onClick={handleAcceptHelp}
                  className="font-bold shadow-md shadow-cyan-500/20"
                >
                  Hubungkan Sesi Sekarang
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="xs"
                  onClick={handleEndHelpSession}
                >
                  Akhiri Sesi Bantuan
                </Button>
              )}
            </div>

            {/* Studio Body: WebRTC Screen Stream & Co-Browsing Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              
              {/* Left: WebRTC Live Screen Viewer */}
              <div className="lg:col-span-7 bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex flex-col justify-between min-h-[340px]">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <Tv size={15} className="text-cyan-400" />
                      <Camera size={15} className="text-emerald-400" />
                      Pantauan Layar & Kamera Pelanggan (Live Stream)
                    </span>
                    {remoteStreamReceived ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 flex items-center gap-1.5 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        LIVE STREAM (60 FPS)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-400 bg-slate-800 border border-slate-700">
                        STANDBY
                      </span>
                    )}
                  </div>

                  <div className="relative rounded-lg overflow-hidden bg-black/90 border border-slate-700 aspect-video flex items-center justify-center">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className={clsx('w-full h-full object-contain', remoteStreamReceived ? 'block' : 'hidden')}
                    />
                    {!remoteStreamReceived && (
                      <div className="text-center p-6 space-y-2.5 max-w-sm mx-auto">
                        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto text-cyan-400">
                          <Radio className="w-6 h-6 animate-pulse" />
                        </div>
                        <p className="text-sm font-semibold text-slate-100">
                          {studioConnected
                            ? 'Menunggu Pelanggan Mengaktifkan Layar / Kamera HP'
                            : 'Klik tombol di atas untuk menghubungkan sesi'}
                        </p>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Pelanggan di HP dapat menekan <strong>"📷 Sorot Lampu Modem"</strong> untuk menunjukkan lampu ONT/Router ke teknisi, atau gunakan <strong>Petunjuk Visual</strong> di sebelah kanan.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-700/80 flex items-center justify-between text-xs text-slate-400 mono">
                  <span>Protokol: WebRTC P2P (Adaptive STUN/WS)</span>
                  <span>Enkripsi: End-to-End TLS / DTLS-SRTP</span>
                </div>
              </div>

              {/* Right: Co-Browsing Laser Pointer & Quick Controls */}
              <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3.5">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Navigation size={15} className="text-cyan-400" /> Petunjuk Visual (Co-Browsing Cepat)
                    </h4>
                    <p className="text-xs text-slate-300 mt-1">
                      Klik salah satu tombol untuk menunjuk langsung elemen di layar smartphone pelanggan:
                    </p>
                  </div>

                  <div className="space-y-2">
                    <button
                      onClick={() => handleSendVisualGuide('point_qris', 'Klik di sini untuk Bayar Sekarang via QRIS 24 Jam')}
                      className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-500/50 text-left text-xs font-medium text-slate-100 flex items-center justify-between transition group shadow-sm"
                    >
                      <span className="flex items-center gap-2.5">
                        <QrCode size={15} className="text-emerald-400" /> 1. Tunjuk Tombol QRIS
                      </span>
                      <span className="text-[11px] font-mono font-medium text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/60 group-hover:bg-emerald-500 group-hover:text-slate-950 transition">
                        Tunjuk 👉
                      </span>
                    </button>

                    <button
                      onClick={() => handleSendVisualGuide('point_bills', 'Rincian dan riwayat tagihan bulanan Anda ada di sini')}
                      className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-amber-500/50 text-left text-xs font-medium text-slate-100 flex items-center justify-between transition group shadow-sm"
                    >
                      <span className="flex items-center gap-2.5">
                        <Clock size={15} className="text-amber-400" /> 2. Tunjuk Menu Tagihan
                      </span>
                      <span className="text-[11px] font-mono font-medium text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/60 group-hover:bg-amber-500 group-hover:text-slate-950 transition">
                        Tunjuk 👉
                      </span>
                    </button>

                    <button
                      onClick={() => handleSendVisualGuide('point_tickets', 'Klik di sini jika ingin mengirim keluhan ke tim teknisi')}
                      className="w-full py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-indigo-500/50 text-left text-xs font-medium text-slate-100 flex items-center justify-between transition group shadow-sm"
                    >
                      <span className="flex items-center gap-2.5">
                        <MessageSquare size={15} className="text-indigo-400" /> 3. Tunjuk Form Aduan Tiket
                      </span>
                      <span className="text-[11px] font-mono font-medium text-indigo-400 bg-indigo-950/50 px-2 py-0.5 rounded border border-indigo-800/60 group-hover:bg-indigo-500 group-hover:text-slate-950 transition">
                        Tunjuk 👉
                      </span>
                    </button>
                  </div>

                  {/* Custom Text Guidance */}
                  <div className="pt-2.5 border-t border-slate-700/80 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-200 block">Kirim Pesan Panduan Khusus</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Contoh: Buka aplikasi BCA Mobile / DANA ya Pak..."
                        value={customGuideText}
                        onChange={e => setCustomGuideText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendVisualGuide('custom')}
                        className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 transition"
                      />
                      <Button
                        variant="primary"
                        size="xs"
                        onClick={() => handleSendVisualGuide('custom')}
                        className="font-semibold shadow-sm"
                      >
                        Kirim
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Impersonate Shortcut */}
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Buka Portal Pelanggan (Impersonate)</span>
                    <span className="text-[11px] text-slate-300">Buka akun di tab baru tanpa login manual</span>
                  </div>
                  <button
                    onClick={() => handleImpersonate(liveStudio.pelanggan_id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 hover:text-white transition text-xs font-semibold shadow-sm"
                    title="Buka sesi pelanggan via impersonate di tab baru"
                  >
                    <ExternalLink size={14} />
                    <span>Buka Tab</span>
                  </button>
                </div>
              </div>

            </div>

          </Card>
        </div>
      )}

    </div>
  )
}
