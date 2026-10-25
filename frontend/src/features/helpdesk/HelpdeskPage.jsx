import React, { useState, useEffect, useRef } from 'react'
import {
  Laptop, Tv, MessageSquare, QrCode, Clock, Shield, Eye,
  RefreshCw, Search, CheckCircle2, Navigation, AlertCircle,
  Radio, UserRound, Phone, LogOut, Square, ExternalLink,
  ChevronRight, Wrench, AlertTriangle, Users
} from 'lucide-react'
import clsx from 'clsx'

import Badge from '../../components/ui/Badge'
import Button from '../../components/ui/Button'
import StatusDot from '../../components/ui/StatusDot'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'

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

    const wsUrl = `ws://${window.location.hostname}:3392/ws`
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
        const portalUrl = `http://${window.location.hostname}:3392/?impersonate_token=${encodeURIComponent(res.token)}`
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
            onClick={() => window.open(`http://${window.location.hostname}:3392/`, '_blank')}
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
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="bg-[var(--bg-secondary)]/70 text-muted border-b border-[var(--border)] uppercase text-[10px] mono">
                <tr>
                  <th className="py-2.5 px-4">ID Pelanggan</th>
                  <th className="py-2.5 px-4">Nama Pelanggan</th>
                  <th className="py-2.5 px-4">Paket & Alamat</th>
                  <th className="py-2.5 px-4">Status Password</th>
                  <th className="py-2.5 px-4">Bantuan Layar Live</th>
                  <th className="py-2.5 px-4 text-right">Aksi Manajemen</th>
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
                        c.help_status === 'requesting' && 'bg-emerald-950/20'
                      )}
                    >
                      <td className="py-3 px-4 mono font-bold accent-text">
                        {c.pelanggan_id}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-white block">{c.nama_lengkap}</span>
                        <span className="text-[10px] text-muted mono">{c.phone || '-'}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-white block font-medium">{c.paket_name || '5 Mbps Home'}</span>
                        <span className="text-[10px] text-muted truncate max-w-[220px] block">{c.alamat || '-'}</span>
                      </td>
                      <td className="py-3 px-4">
                        {c.is_custom_password ? (
                          <Badge variant="online">Mandiri</Badge>
                        ) : (
                          <Badge variant="warning">Default 12345678</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {c.help_status === 'requesting' ? (
                          <button
                            onClick={() => handleOpenStudio(c)}
                            className="px-3 py-1.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] flex items-center gap-1.5 shadow-lg shadow-emerald-500/30 animate-pulse hover:bg-emerald-400 transition"
                          >
                            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                            🟢 BUTUH PANDUAN LAYAR (KLIK DISINI)
                          </button>
                        ) : c.help_status === 'active' ? (
                          <button
                            onClick={() => handleOpenStudio(c)}
                            className="px-3 py-1.5 rounded-full bg-[var(--accent)] text-slate-950 font-bold text-[10px] flex items-center gap-1.5 shadow-md hover:brightness-110 transition"
                          >
                            <StatusDot status="online" size="sm" />
                            🔵 SESI TERHUBUNG (KONTROL)
                          </button>
                        ) : (
                          <span className="text-muted text-[10px]">⚪ Tidak ada permintaan</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <Button
                          variant="outline"
                          size="xs"
                          icon={Eye}
                          onClick={() => handleImpersonate(c.pelanggan_id)}
                          title="Buka sesi akun pelanggan di tab baru"
                        >
                          Impersonate
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleResetPassword(c)}
                        >
                          Reset
                        </Button>
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
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="bg-[var(--bg-secondary)]/70 text-muted uppercase text-[10px] mono">
                <tr>
                  <th className="py-2.5 px-4">No. Tiket</th>
                  <th className="py-2.5 px-4">Pelanggan</th>
                  <th className="py-2.5 px-4">Kategori & Judul</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Petugas</th>
                  <th className="py-2.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {tickets.map(t => (
                  <tr key={t.id} className="hover:bg-[var(--accent-glow)]/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold accent-text">{t.ticket_number}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-white block">{t.nama_lengkap}</span>
                      <span className="text-[10px] text-muted mono">ID: {t.pelanggan_id}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-white block">{t.judul}</span>
                      <span className="text-[10px] text-muted line-clamp-1">{t.deskripsi}</span>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant={t.status === 'open' ? 'warning' : 'online'}>
                        {t.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-muted">
                      {t.assigned_staff_name || 'Belum ditugaskan'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => handleToggleTicket(t)}
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
          <Card className="max-w-4xl w-full p-6 shadow-2xl space-y-5 flex flex-col max-h-[92vh] overflow-y-auto !bg-[var(--bg-card)] border-[var(--border)] glow-ring">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: 'var(--accent)', boxShadow: '0 0 16px var(--accent-glow)' }}
                >
                  <Laptop size={20} className="text-slate-950" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Studio Remote Assistance: {liveStudio.nama_lengkap}
                    <Badge variant="accent" className="mono">ID: {liveStudio.pelanggan_id}</Badge>
                  </h3>
                  <p className="text-xs text-muted">
                    Paket: {liveStudio.paket_name || '5 Mbps'} • Alamat: {liveStudio.alamat || 'Area Jombang'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setLiveStudio(null)
                  stopWebRtc()
                }}
                className="p-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-muted hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Connection Status Bar */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border)]">
              <div className="flex items-center gap-2.5">
                <StatusDot status={studioConnected ? 'online' : 'warning'} pulse={true} size="md" />
                <span className="text-xs font-semibold text-white">
                  {studioConnected
                    ? '🟢 Sesi Interaktif Aktif Terhubung dengan Pelanggan'
                    : '🟡 Pelanggan Meminta Bantuan — Klik tombol untuk menghubungkan'}
                </span>
              </div>
              {!studioConnected ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={CheckCircle2}
                  onClick={handleAcceptHelp}
                  className="font-bold"
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
              <div className="lg:col-span-7 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 flex flex-col justify-between min-h-[320px]">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-primary flex items-center gap-1.5">
                      <Tv size={14} className="accent-text" /> Pantauan Layar WebRTC (Live Stream)
                    </span>
                    {remoteStreamReceived && (
                      <Badge variant="online" className="mono">LIVE 60FPS</Badge>
                    )}
                  </div>

                  <div className="relative rounded-lg overflow-hidden bg-black/60 border border-[var(--border)] aspect-video flex items-center justify-center">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className={clsx('w-full h-full object-contain', remoteStreamReceived ? 'block' : 'hidden')}
                    />
                    {!remoteStreamReceived && (
                      <div className="text-center p-6 space-y-2">
                        <Radio className="w-10 h-10 accent-text mx-auto animate-pulse" />
                        <p className="text-xs font-semibold text-white">
                          {studioConnected
                            ? 'Sesi tersambung! Menunggu pelanggan menekan tombol "Bagikan Layar"'
                            : 'Klik tombol di atas untuk menghubungkan sesi'}
                        </p>
                        <p className="text-[11px] text-muted max-w-xs mx-auto">
                          Atau gunakan tombol Petunjuk Visual di sebelah kanan untuk langsung menunjuk tombol di ponsel pelanggan.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-muted mono">
                  <span>Protokol: WebRTC P2P (STUN/WebSocket)</span>
                  <span>Enkripsi: TLS / SRTP End-to-End</span>
                </div>
              </div>

              {/* Right: Co-Browsing Laser Pointer & Quick Controls */}
              <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Navigation size={14} className="accent-text" /> Petunjuk Visual (Co-Browsing Cepat)
                  </h4>
                  <p className="text-[11px] text-muted">
                    Klik salah satu tombol untuk menunjuk langsung elemen di layar smartphone pelanggan:
                  </p>

                  <div className="space-y-2">
                    <button
                      onClick={() => handleSendVisualGuide('point_qris', 'Klik di sini untuk Bayar Sekarang via QRIS 24 Jam')}
                      className="w-full py-2 px-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--accent-glow)] border border-[var(--border)] text-left text-xs font-semibold text-white flex items-center justify-between transition group"
                    >
                      <span className="flex items-center gap-2">
                        <QrCode size={14} className="text-emerald-400" /> 1. Tunjuk Tombol QRIS
                      </span>
                      <span className="text-[10px] accent-text opacity-0 group-hover:opacity-100 transition mono">Kirim 👉</span>
                    </button>

                    <button
                      onClick={() => handleSendVisualGuide('point_bills', 'Rincian dan riwayat tagihan bulanan Anda ada di sini')}
                      className="w-full py-2 px-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--accent-glow)] border border-[var(--border)] text-left text-xs font-semibold text-white flex items-center justify-between transition group"
                    >
                      <span className="flex items-center gap-2">
                        <Clock size={14} className="text-amber-400" /> 2. Tunjuk Menu Tagihan
                      </span>
                      <span className="text-[10px] accent-text opacity-0 group-hover:opacity-100 transition mono">Kirim 👉</span>
                    </button>

                    <button
                      onClick={() => handleSendVisualGuide('point_tickets', 'Klik di sini jika ingin mengirim keluhan ke tim teknisi')}
                      className="w-full py-2 px-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--accent-glow)] border border-[var(--border)] text-left text-xs font-semibold text-white flex items-center justify-between transition group"
                    >
                      <span className="flex items-center gap-2">
                        <MessageSquare size={14} className="text-indigo-400" /> 3. Tunjuk Form Aduan Tiket
                      </span>
                      <span className="text-[10px] accent-text opacity-0 group-hover:opacity-100 transition mono">Kirim 👉</span>
                    </button>
                  </div>

                  {/* Custom Text Guidance */}
                  <div className="pt-2 border-t border-[var(--border)] space-y-1.5">
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block">Kirim Pesan Panduan Khusus</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Contoh: Buka aplikasi BCA Mobile ya Pak..."
                        value={customGuideText}
                        onChange={e => setCustomGuideText(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-xs text-white focus:outline-none focus:border-[var(--accent)]"
                      />
                      <Button
                        variant="primary"
                        size="xs"
                        onClick={() => handleSendVisualGuide('custom')}
                      >
                        Kirim
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Impersonate Shortcut */}
                <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-white block">Mode Kendali Langsung?</span>
                    <span className="text-[10px] text-muted">Buka sesi pelanggan via impersonate</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={Eye}
                    onClick={() => handleImpersonate(liveStudio.pelanggan_id)}
                  >
                    Impersonate
                  </Button>
                </div>
              </div>

            </div>

          </Card>
        </div>
      )}

    </div>
  )
}
