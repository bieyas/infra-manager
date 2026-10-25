import React, { useState, useEffect, useRef } from 'react'
import {
  Wifi, AlertCircle, CheckCircle2, Clock, QrCode, Download,
  Phone, MessageSquare, User, Shield, LogOut, ArrowLeft,
  Search, RefreshCw, Send, HelpCircle, Laptop, Eye, EyeOff, Radio,
  Tv, MousePointer, XCircle, Play, Square, Sparkles, Navigation,
  LayoutDashboard, Server, Activity, Wrench, ChevronRight, UserRound,
  TrendingUp, TrendingDown, Bell, BellRing, Cable
} from 'lucide-react'
import clsx from 'clsx'

import Badge from './components/ui/Badge'
import Button from './components/ui/Button'
import StatusDot from './components/ui/StatusDot'
import Card, { CardHeader, CardBody } from './components/ui/Card'

const API_BASE = '' // relative to host

function useClock() {
  const [time, setTime] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return time.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function App() {
  const [isAdminView, setIsAdminView] = useState(window.location.pathname.startsWith('/admin'))
  const clock = useClock()
  
  // Customer State
  const [custToken, setCustToken] = useState(localStorage.getItem('aufa_cust_token'))
  const [custProfile, setCustProfile] = useState(null)
  const [custTab, setCustTab] = useState('home') // home, bills, tickets, profile
  const [bills, setBills] = useState([])
  const [qrisModal, setQrisModal] = useState(false)
  const [qrisData, setQrisData] = useState(null)
  
  // Live Assistance State (Customer)
  const [helpState, setHelpState] = useState('idle') // 'idle', 'waiting', 'connected'
  const [activeStaffName, setActiveStaffName] = useState('')
  const [isSharingScreen, setIsSharingScreen] = useState(false)
  const [visualGuidance, setVisualGuidance] = useState(null) // { text, action, timestamp }
  
  // Customer Tickets
  const [myTickets, setMyTickets] = useState([])
  const [newTicketModal, setNewTicketModal] = useState(false)
  const [ticketForm, setTicketForm] = useState({ kategori: 'los_mati', judul: '', deskripsi: '' })

  // Admin State
  const [staffToken, setStaffToken] = useState(localStorage.getItem('aufa_staff_token'))
  const [staffProfile, setStaffProfile] = useState(null)
  const [adminTab, setAdminTab] = useState('customers') // customers, tickets, staff
  const [customerList, setCustomerList] = useState([])
  const [allTickets, setAllTickets] = useState([])
  const [staffList, setStaffList] = useState([])
  const [adminStats, setAdminStats] = useState({ openTickets: 0, totalCustomers: 0, totalTrx: 0, activeHelp: 0 })
  const [searchCust, setSearchCust] = useState('')
  
  // Admin Live Assistance Studio State
  const [liveStudio, setLiveStudio] = useState(null) // target customer object
  const [studioConnected, setStudioConnected] = useState(false)
  const [customGuideText, setCustomGuideText] = useState('')
  const [remoteStreamReceived, setRemoteStreamReceived] = useState(false)

  // WebRTC & WebSocket References
  const wsRef = useRef(null)
  const localStreamRef = useRef(null)
  const pcRef = useRef(null)
  const remoteVideoRef = useRef(null)

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  }

  // Sync route
  useEffect(() => {
    const handlePop = () => setIsAdminView(window.location.pathname.startsWith('/admin'))
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [])

  const navigateTo = (path) => {
    window.history.pushState({}, '', path)
    setIsAdminView(path.startsWith('/admin'))
  }

  // ── 1. WEBSOCKET REAL-TIME ENGINE ──────────────────────────────────────────
  useEffect(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      const activeToken = isAdminView ? staffToken : custToken
      if (activeToken) {
        ws.send(JSON.stringify({ type: 'AUTH', token: activeToken }))
      }
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'CUSTOMER_HELP_BADGE') {
          fetchAdminCustomers()
          fetchAdminStats()
          if (liveStudio && liveStudio.pelanggan_id === msg.pelanggan_id) {
            if (msg.status === 'closed') {
              setStudioConnected(false)
              setLiveStudio(null)
              stopWebRtc()
            }
          }
        }
        else if (msg.type === 'HELP_REQUEST_ACK') {
          setHelpState('waiting')
        }
        else if (msg.type === 'HELP_SESSION_CONNECTED') {
          setHelpState('connected')
          setActiveStaffName(msg.staff_name || 'Tim Support AUFA')
        }
        else if (msg.type === 'STAFF_HELP_CONNECTED') {
          setStudioConnected(true)
        }
        else if (msg.type === 'HELP_SESSION_ENDED') {
          setHelpState('idle')
          setActiveStaffName('')
          setIsSharingScreen(false)
          setVisualGuidance(null)
          setStudioConnected(false)
          setRemoteStreamReceived(false)
          stopWebRtc()
        }
        else if (msg.type === 'COBROWSE_POINTER' || msg.type === 'COBROWSE_GUIDE') {
          setVisualGuidance({
            action: msg.action,
            text: msg.text || 'Petunjuk dari CS',
            timestamp: Date.now()
          })
          if (msg.action === 'point_qris') {
            setCustTab('home')
            setTimeout(() => {
              document.getElementById('qris-section')?.scrollIntoView({ behavior: 'smooth' })
            }, 100)
          } else if (msg.action === 'point_bills') {
            setCustTab('bills')
          } else if (msg.action === 'point_tickets') {
            setCustTab('tickets')
          }
        }
        else if (msg.type === 'WEBRTC_SIGNAL') {
          handleWebRtcSignal(msg)
        }
      } catch (e) {
        console.error('WS Error:', e)
      }
    }

    return () => {
      ws.close()
      stopWebRtc()
    }
  }, [custToken, staffToken, isAdminView, liveStudio])

  // ── 2. WEBRTC ENGINE (SCREEN SHARING) ───────────────────────────────────────
  const stopWebRtc = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop())
      localStreamRef.current = null
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    setIsSharingScreen(false)
    setRemoteStreamReceived(false)
  }

  const handleStartScreenShare = async () => {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        alert('Browser ini menggunakan Mode Panduan Visual (Co-Browsing & Laser Pointer). Sesi panduan langsung CS tetap aktif!')
        return
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      localStreamRef.current = stream
      setIsSharingScreen(true)

      const pc = new RTCPeerConnection(rtcConfig)
      pcRef.current = pc

      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      stream.getVideoTracks()[0].onended = () => {
        handleStopScreenShare()
      }

      pc.onicecandidate = (e) => {
        if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'WEBRTC_SIGNAL',
            target_pelanggan_id: custProfile?.pelanggan_id,
            candidate: e.candidate
          }))
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'WEBRTC_SIGNAL',
          target_pelanggan_id: custProfile?.pelanggan_id,
          sdp: pc.localDescription
        }))
      }
    } catch (err) {
      console.warn('Screen share cancelled/failed:', err)
      setIsSharingScreen(false)
    }
  }

  const handleStopScreenShare = () => {
    stopWebRtc()
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'WEBRTC_SIGNAL',
        target_pelanggan_id: custProfile?.pelanggan_id,
        stop_screen: true
      }))
    }
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
      } else if (msg.sdp.type === 'answer' && pcRef.current) {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp))
      }
    } else if (msg.candidate && pcRef.current) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate))
      } catch (e) {
        console.warn('ICE error', e)
      }
    }
  }

  // ── 3. FETCH DATA ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (custToken && !isAdminView) {
      fetch(`${API_BASE}/api/customer/me`, { headers: { Authorization: `Bearer ${custToken}` } })
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            setCustProfile(d.data)
            if (d.data?.help_session?.status === 'requesting') {
              setHelpState('waiting')
            } else if (d.data?.help_session?.status === 'active') {
              setHelpState('connected')
              setActiveStaffName(d.data?.help_session?.staff_name || 'Tim Support AUFA')
            }
          } else {
            handleCustLogout()
          }
        })
        .catch(console.error)

      fetch(`${API_BASE}/api/customer/bills`, { headers: { Authorization: `Bearer ${custToken}` } })
        .then(r => r.json())
        .then(d => { if (d.success) setBills(d.data || []) })
        .catch(console.error)

      fetch(`${API_BASE}/api/customer/tickets`, { headers: { Authorization: `Bearer ${custToken}` } })
        .then(r => r.json())
        .then(d => { if (d.success) setMyTickets(d.data || []) })
        .catch(console.error)
    }
  }, [custToken, isAdminView])

  const fetchAdminCustomers = () => {
    if (!staffToken) return
    fetch(`${API_BASE}/api/admin/customers`, { headers: { Authorization: `Bearer ${staffToken}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setCustomerList(d.data || []) })
      .catch(console.error)
  }

  const fetchAdminStats = () => {
    if (!staffToken) return
    fetch(`${API_BASE}/api/admin/dashboard`, { headers: { Authorization: `Bearer ${staffToken}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setAdminStats(d.data) })
      .catch(console.error)
  }

  const fetchAdminTickets = () => {
    if (!staffToken) return
    fetch(`${API_BASE}/api/admin/tickets`, { headers: { Authorization: `Bearer ${staffToken}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setAllTickets(d.data || []) })
      .catch(console.error)
  }

  const fetchAdminStaff = () => {
    if (!staffToken) return
    fetch(`${API_BASE}/api/admin/staff`, { headers: { Authorization: `Bearer ${staffToken}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setStaffList(d.data || []) })
      .catch(console.error)
  }

  useEffect(() => {
    if (staffToken && isAdminView) {
      fetchAdminCustomers()
      fetchAdminStats()
      fetchAdminTickets()
      fetchAdminStaff()
    }
  }, [staffToken, isAdminView])

  // ── 4. CUSTOMER ACTIONS ─────────────────────────────────────────────────────
  const handleRequestHelp = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      alert('Koneksi real-time sedang menghubungkan. Coba sebentar lagi.')
      return
    }
    wsRef.current.send(JSON.stringify({
      type: 'CUSTOMER_REQUEST_HELP',
      pelanggan_id: custProfile?.pelanggan_id,
      nama_lengkap: custProfile?.nama_lengkap
    }))
    setHelpState('waiting')
  }

  const handleCancelHelp = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'CUSTOMER_CANCEL_HELP',
        pelanggan_id: custProfile?.pelanggan_id
      }))
    }
    setHelpState('idle')
    stopWebRtc()
  }

  const handleEndHelpSession = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'END_HELP_SESSION',
        target_pelanggan_id: custProfile?.pelanggan_id
      }))
    }
    setHelpState('idle')
    setActiveStaffName('')
    setVisualGuidance(null)
    stopWebRtc()
  }

  const handleOpenQris = async (tagihanId) => {
    setQrisModal(true)
    const res = await fetch(`${API_BASE}/api/customer/qris`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify({ tagihan_id: tagihanId || 'sample-bill-1' })
    }).then(r => r.json())

    if (res.success && res.data) {
      setQrisData(res.data)
    } else {
      setQrisData({
        nominal: 100000,
        periode: 'Oktober 2026',
        qr_string: '00020101021226680014ID.LINKAJA.WWW0118936009110022340123'
      })
    }
  }

  const handleCustLogin = async (e) => {
    e.preventDefault()
    const id = e.target.pelanggan_id.value
    const pass = e.target.password.value
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pelanggan_id: id, password: pass })
    }).then(r => r.json())

    if (res.success) {
      localStorage.setItem('aufa_cust_token', res.token)
      setCustToken(res.token)
      setCustProfile(res.user)
    } else {
      alert(res.message || 'Login gagal')
    }
  }

  const handleCustLogout = () => {
    localStorage.removeItem('aufa_cust_token')
    setCustToken(null)
    setCustProfile(null)
    stopWebRtc()
  }

  const handleSubmitTicket = async (e) => {
    e.preventDefault()
    const res = await fetch(`${API_BASE}/api/customer/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${custToken}` },
      body: JSON.stringify(ticketForm)
    }).then(r => r.json())

    if (res.success) {
      alert('Tiket berhasil dibuat! Nomor: ' + res.ticket.ticket_number)
      setNewTicketModal(false)
      setTicketForm({ kategori: 'los_mati', judul: '', deskripsi: '' })
      fetch(`${API_BASE}/api/customer/tickets`, { headers: { Authorization: `Bearer ${custToken}` } })
        .then(r => r.json())
        .then(d => { if (d.success) setMyTickets(d.data || []) })
    } else {
      alert(res.message || 'Gagal membuat tiket')
    }
  }

  // ── 5. ADMIN ACTIONS ────────────────────────────────────────────────────────
  const handleAdminLogin = async (e) => {
    e.preventDefault()
    const u = e.target.username.value
    const p = e.target.password.value
    const res = await fetch(`${API_BASE}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    }).then(r => r.json())

    if (res.success) {
      localStorage.setItem('aufa_staff_token', res.token)
      setStaffToken(res.token)
      setStaffProfile(res.staff)
    } else {
      alert(res.message || 'Login admin gagal')
    }
  }

  const handleAdminLogout = () => {
    localStorage.removeItem('aufa_staff_token')
    setStaffToken(null)
    setStaffProfile(null)
    stopWebRtc()
  }

  const handleImpersonate = async (pelangganId) => {
    const res = await fetch(`${API_BASE}/api/admin/impersonate/${pelangganId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
      body: JSON.stringify({ reason: 'Dukungan Remote Helpdesk' })
    }).then(r => r.json())

    if (res.success) {
      localStorage.setItem('aufa_cust_token', res.token)
      setCustToken(res.token)
      setCustProfile(res.user)
      navigateTo('/')
    } else {
      alert(res.message || 'Gagal masuk mode impersonate')
    }
  }

  const handleOpenLiveStudio = (cust) => {
    setLiveStudio(cust)
    setStudioConnected(cust.help_status === 'active')
    setRemoteStreamReceived(false)
  }

  const handleAcceptHelpSession = () => {
    if (!liveStudio) return
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'STAFF_ACCEPT_HELP',
        target_pelanggan_id: liveStudio.pelanggan_id
      }))
      setStudioConnected(true)
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
    }
  }

  const handleAdminEndHelpSession = () => {
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
    fetchAdminCustomers()
    fetchAdminStats()
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SPLIT-SCREEN AUTHENTICATION PAGE (INFRA-MANAGER THEME)
  // ═══════════════════════════════════════════════════════════════════════════
  if ((!custToken && !isAdminView) || (!staffToken && isAdminView)) {
    return (
      <div className="min-h-screen flex bg-[var(--bg-primary)]">
        {/* Left Cyber Brand Panel (Desktop) */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[var(--bg-secondary)] flex-col items-center justify-center p-12 border-r border-[var(--border)]">
          {/* Blueprint Grid */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: 'linear-gradient(var(--accent) 1px, transparent 1px), linear-gradient(90deg, var(--accent) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          {/* Cyber Glow Orb */}
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full"
            style={{ background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)' }}
          />

          <div className="relative z-10 text-center max-w-sm">
            {/* Logo */}
            <div className="flex items-center justify-center gap-3 mb-8">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
                style={{ background: 'var(--accent)', boxShadow: '0 0 24px var(--accent-glow)' }}
              >
                <Wifi size={26} className="text-slate-950" strokeWidth={2.5} />
              </div>
              <div className="text-left">
                <p className="text-xl font-bold text-[var(--text-primary)] tracking-tight">AUFA Portal</p>
                <p className="text-[10px] text-[var(--text-muted)] tracking-wider uppercase mono">Customer & Helpdesk</p>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
              Layanan Mandiri & Helpdesk<br />dalam satu ekosistem
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Cek tagihan internet, pembayaran QRIS 24 jam otomatis, aduan gangguan teknisi, dan panduan layar interaktif berbasis WebRTC.
            </p>

            {/* Feature Pills */}
            <div className="flex flex-wrap gap-2 justify-center mt-8">
              {['QRIS 24 Jam', 'Live Remote Assist', 'WebRTC Screen Share', 'Helpdesk Tiket', 'Impersonate Admin'].map(f => (
                <span key={f} className="px-3 py-1 rounded-full text-xs border border-[var(--border)] text-[var(--text-secondary)] bg-[var(--bg-card)]">
                  {f}
                </span>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-[var(--border)] text-[11px] text-[var(--text-muted)] mono">
              Engine Server: PORT 3392 • srv-jgrt
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--accent)', boxShadow: '0 0 16px var(--accent-glow)' }}
            >
              <Wifi size={22} className="text-slate-950" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-lg font-bold text-[var(--text-primary)]">AUFA Portal</p>
              <p className="text-[10px] text-[var(--text-muted)] tracking-wider uppercase mono">Customer & Helpdesk</p>
            </div>
          </div>

          <div className="w-full max-w-sm">
            {/* Tab Selector: Pelanggan vs Staf */}
            <div className="flex p-1 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl mb-6">
              <button
                type="button"
                onClick={() => navigateTo('/')}
                className={clsx(
                  'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  !isAdminView ? 'bg-[var(--accent)] text-slate-950 shadow-sm' : 'text-[var(--text-secondary)] hover:text-white'
                )}
              >
                Pelanggan
              </button>
              <button
                type="button"
                onClick={() => navigateTo('/admin')}
                className={clsx(
                  'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  isAdminView ? 'bg-[var(--accent)] text-slate-950 shadow-sm' : 'text-[var(--text-secondary)] hover:text-white'
                )}
              >
                Staf / Admin
              </button>
            </div>

            {/* CUSTOMER LOGIN FORM */}
            {!isAdminView ? (
              <>
                <div className="mb-6">
                  <h1 className="text-xl font-bold text-[var(--text-primary)]">Masuk Portal Mandiri</h1>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Masukkan ID Pelanggan Anda untuk mengakses layanan</p>
                </div>

                <form onSubmit={handleCustLogin} className="space-y-4">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1 uppercase tracking-wide">
                      ID Pelanggan
                    </label>
                    <input
                      name="pelanggan_id"
                      defaultValue="260300202"
                      placeholder="Contoh: 260300202"
                      required
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-white text-sm mono focus:outline-none focus:border-[var(--accent)] transition"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] mt-1 block">Tercantum pada struk pembayaran internet</span>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1 uppercase tracking-wide">
                      Password
                    </label>
                    <input
                      name="password"
                      type="password"
                      defaultValue="12345678"
                      required
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-white text-sm focus:outline-none focus:border-[var(--accent)] transition"
                    />
                    <span className="text-[10px] text-[var(--accent)] mt-1 block">Password default: 12345678</span>
                  </div>

                  <Button type="submit" variant="primary" size="md" className="w-full mt-2 font-bold">
                    Masuk ke Portal
                  </Button>
                </form>
              </>
            ) : (
              /* ADMIN LOGIN FORM */
              <>
                <div className="mb-6">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-semibold uppercase tracking-wider mb-2">
                    <Shield size={12} /> Area Staf AUFA
                  </div>
                  <h1 className="text-xl font-bold text-[var(--text-primary)]">Masuk Dashboard Helpdesk</h1>
                  <p className="text-xs text-[var(--text-secondary)] mt-1">Khusus Superadmin, CS, dan Teknisi Lapangan</p>
                </div>

                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1 uppercase tracking-wide">
                      Username Staf
                    </label>
                    <input
                      name="username"
                      defaultValue="admin"
                      placeholder="admin / cs1 / teknisi1"
                      required
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-white text-sm mono focus:outline-none focus:border-[var(--accent)] transition"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-[var(--text-secondary)] block mb-1 uppercase tracking-wide">
                      Password
                    </label>
                    <input
                      name="password"
                      type="password"
                      defaultValue="aufa2026"
                      required
                      className="w-full px-3.5 py-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-white text-sm focus:outline-none focus:border-[var(--accent)] transition"
                    />
                  </div>

                  <Button type="submit" variant="primary" size="md" className="w-full mt-2 font-bold">
                    Masuk ke Dashboard Admin
                  </Button>
                </form>
              </>
            )}

            <div className="mt-8 pt-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-muted)]">
              <a href="https://wa.me/6281228240369" target="_blank" className="hover:text-[var(--accent)] transition">
                WhatsApp CS
              </a>
              <span className="mono">v1.2.0 • 2026</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN DASHBOARD & HELPDESK OPERATIONS VIEW (INFRA-MANAGER THEME)
  // ═══════════════════════════════════════════════════════════════════════════
  if (isAdminView) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col">
        {/* TopBar matching infra-manager TopBar.jsx */}
        <header className="h-14 bg-[var(--bg-card)] border-b border-[var(--border)] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          {/* Brand & Breadcrumb */}
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' }}
            >
              <Wifi size={18} className="text-slate-950" strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm tracking-tight text-white">AUFA HELPDESK</span>
                <Badge variant="accent" className="mono">PORT 3392</Badge>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] hidden sm:block">Customer Care, Ticketing & Remote Screen Studio</p>
            </div>
          </div>

          {/* Right Header Utilities: Clock, User Badge, Switch, Logout */}
          <div className="flex items-center gap-3">
            {/* Live Digital Clock */}
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-xs mono text-[var(--text-secondary)]">
              <Clock size={13} className="text-[var(--accent)]" />
              <span>{clock}</span>
            </div>

            <Button
              variant="outline"
              size="xs"
              onClick={() => navigateTo('/')}
              className="hidden sm:inline-flex"
            >
              Tampilan Pelanggan ↗
            </Button>

            {/* Role Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[var(--bg-secondary)] border border-[var(--border)] text-xs">
              <StatusDot status="online" />
              <span className="font-semibold text-white text-xs">{staffProfile?.nama_lengkap || 'Admin'}</span>
              <span className="text-[10px] text-[var(--accent)] uppercase mono">({staffProfile?.role || 'staff'})</span>
            </div>

            <button
              onClick={handleAdminLogout}
              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-[var(--text-muted)] hover:text-rose-400 transition"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Sub-Navigation Tabs matching infra-manager nav style */}
        <div className="bg-[var(--bg-secondary)] border-b border-[var(--border)] px-4 sm:px-6 flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setAdminTab('customers')}
            className={clsx(
              'nav-item !rounded-none !border-b-2 py-3 px-3 text-xs font-semibold gap-2 border-transparent',
              adminTab === 'customers' && '!text-[var(--accent)] !border-[var(--accent)] !bg-[var(--accent-glow)]'
            )}
          >
            <UserRound size={15} /> Pelanggan & Remote Screen
            {customerList.some(c => c.help_status === 'requesting') && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            )}
          </button>
          <button
            onClick={() => setAdminTab('tickets')}
            className={clsx(
              'nav-item !rounded-none !border-b-2 py-3 px-3 text-xs font-semibold gap-2 border-transparent',
              adminTab === 'tickets' && '!text-[var(--accent)] !border-[var(--accent)] !bg-[var(--accent-glow)]'
            )}
          >
            <MessageSquare size={15} /> Tiket Aduan Pelanggan
            <span className="px-1.5 py-0.2 rounded text-[10px] mono bg-[var(--bg-card)] border border-[var(--border)]">
              {allTickets.filter(t => t.status === 'open').length}
            </span>
          </button>
          <button
            onClick={() => setAdminTab('staff')}
            className={clsx(
              'nav-item !rounded-none !border-b-2 py-3 px-3 text-xs font-semibold gap-2 border-transparent',
              adminTab === 'staff' && '!text-[var(--accent)] !border-[var(--accent)] !bg-[var(--accent-glow)]'
            )}
          >
            <Shield size={15} /> Teknisi & CS AUFA
            <span className="px-1.5 py-0.2 rounded text-[10px] mono bg-[var(--bg-card)] border border-[var(--border)]">
              {staffList.length}
            </span>
          </button>
        </div>

        {/* Main Content Area */}
        <main className="p-4 sm:p-6 flex-1 max-w-7xl w-full mx-auto space-y-6">
          {/* Metrics Section using StatCard pattern from infra-manager */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-glow)] flex items-center justify-center">
                  <UserRound size={15} className="text-[var(--accent)]" />
                </div>
                <Badge variant="info">PORTAL</Badge>
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)] mt-2 leading-none mono">{customerList.length}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Total Pelanggan Terdaftar</p>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <MessageSquare size={15} className="text-amber-400" />
                </div>
                <Badge variant="warning">OPEN</Badge>
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)] mt-2 leading-none mono">
                {allTickets.filter(t => t.status === 'open').length}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Tiket Aduan Belum Selesai</p>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Shield size={15} className="text-emerald-400" />
                </div>
                <Badge variant="online">ONLINE</Badge>
              </div>
              <p className="text-2xl font-bold text-[var(--text-primary)] mt-2 leading-none mono">{staffList.length}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Staf & Teknisi Siaga</p>
            </div>

            <div className={clsx('stat-card', customerList.some(c => c.help_status === 'requesting') && '!border-emerald-500/50 glow-ring')}>
              <div className="flex items-start justify-between">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <Laptop size={15} className="text-emerald-400" />
                </div>
                <Badge variant={customerList.some(c => c.help_status === 'requesting') ? 'online' : 'neutral'}>
                  {customerList.some(c => c.help_status === 'requesting') ? 'LIVE REQUEST' : 'STANDBY'}
                </Badge>
              </div>
              <p className="text-2xl font-bold text-emerald-400 mt-2 leading-none mono flex items-center gap-2">
                {customerList.filter(c => c.help_status === 'requesting' || c.help_status === 'active').length}
                {customerList.some(c => c.help_status === 'requesting') && (
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                )}
              </p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Permintaan Bantuan Layar</p>
            </div>
          </div>

          {/* TAB 1: CUSTOMER LIST & LIVE SCREEN ASSIST */}
          {adminTab === 'customers' && (
            <Card className="overflow-hidden shadow-xl">
              <CardHeader action={
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder="Cari ID / Nama..."
                      value={searchCust}
                      onChange={e => setSearchCust(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-xs text-white focus:outline-none focus:border-[var(--accent)] w-52 sm:w-64 mono"
                    />
                  </div>
                  <Button variant="ghost" size="xs" onClick={fetchAdminCustomers}>
                    <RefreshCw size={13} />
                  </Button>
                </div>
              }>
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <UserRound size={16} className="text-[var(--accent)]" />
                  Daftar Pelanggan Portal & Remote Screen Assistance
                </span>
                <span className="text-xs text-[var(--text-muted)] mono">({customerList.length})</span>
              </CardHeader>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                  <thead className="bg-[var(--bg-secondary)]/70 text-[var(--text-muted)] border-b border-[var(--border)] uppercase text-[10px] tracking-wider mono">
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
                    {customerList
                      .filter(c => c.pelanggan_id.includes(searchCust) || c.nama_lengkap.toLowerCase().includes(searchCust.toLowerCase()))
                      .map(c => (
                        <tr
                          key={c.id}
                          className={clsx(
                            'hover:bg-[var(--accent-glow)]/40 transition-colors',
                            c.help_status === 'requesting' && 'bg-emerald-950/20'
                          )}
                        >
                          <td className="py-3 px-4 mono font-bold text-[var(--accent)]">
                            {c.pelanggan_id}
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold text-white block">{c.nama_lengkap}</span>
                            <span className="text-[10px] text-[var(--text-muted)] mono">{c.phone || '-'}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-white block font-medium">{c.paket_name || '5 Mbps Home'}</span>
                            <span className="text-[10px] text-[var(--text-muted)] truncate max-w-[220px] block">{c.alamat || '-'}</span>
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
                                onClick={() => handleOpenLiveStudio(c)}
                                className="px-3 py-1.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[10px] flex items-center gap-1.5 shadow-lg shadow-emerald-500/30 animate-pulse hover:bg-emerald-400 transition"
                              >
                                <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                                🟢 BUTUH PANDUAN LAYAR (KLIK DISINI)
                              </button>
                            ) : c.help_status === 'active' ? (
                              <button
                                onClick={() => handleOpenLiveStudio(c)}
                                className="px-3 py-1.5 rounded-full bg-[var(--accent)] text-slate-950 font-bold text-[10px] flex items-center gap-1.5 shadow-md hover:brightness-110 transition"
                              >
                                <StatusDot status="online" size="sm" />
                                🔵 SESI TERHUBUNG (KONTROL)
                              </button>
                            ) : (
                              <span className="text-[var(--text-muted)] text-[10px]">⚪ Tidak ada permintaan</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right space-x-2">
                            <Button
                              variant="outline"
                              size="xs"
                              icon={Eye}
                              onClick={() => handleImpersonate(c.pelanggan_id)}
                              title="Masuk langsung ke akun pelanggan tanpa password"
                            >
                              Impersonate
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={async () => {
                                if (confirm(`Reset password pelanggan ${c.nama_lengkap} ke 12345678?`)) {
                                  const r = await fetch(`${API_BASE}/api/admin/customers/${c.pelanggan_id}/reset-password`, {
                                    method: 'POST',
                                    headers: { Authorization: `Bearer ${staffToken}` }
                                  }).then(res => res.json())
                                  alert(r.message)
                                  fetchAdminCustomers()
                                }
                              }}
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

          {/* TAB 2: TICKETS TABLE */}
          {adminTab === 'tickets' && (
            <Card className="overflow-hidden shadow-xl">
              <CardHeader action={
                <Button variant="ghost" size="xs" onClick={fetchAdminTickets}>
                  <RefreshCw size={13} />
                </Button>
              }>
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <MessageSquare size={16} className="text-[var(--accent)]" />
                  Daftar Tiket Aduan Gangguan Pelanggan
                </span>
              </CardHeader>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                  <thead className="bg-[var(--bg-secondary)]/70 text-[var(--text-muted)] uppercase text-[10px] mono">
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
                    {allTickets.map(t => (
                      <tr key={t.id} className="hover:bg-[var(--accent-glow)]/40 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-[var(--accent)]">{t.ticket_number}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-white block">{t.nama_lengkap}</span>
                          <span className="text-[10px] text-[var(--text-muted)] mono">ID: {t.pelanggan_id}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-white block">{t.judul}</span>
                          <span className="text-[10px] text-[var(--text-muted)] line-clamp-1">{t.deskripsi}</span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={t.status === 'open' ? 'warning' : 'online'}>
                            {t.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-[var(--text-muted)]">
                          {t.assigned_staff_name || 'Belum ditugaskan'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={async () => {
                              const r = await fetch(`${API_BASE}/api/admin/tickets/${t.id}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
                                body: JSON.stringify({ status: t.status === 'open' ? 'resolved' : 'open' })
                              }).then(res => res.json())
                              alert(r.message)
                              fetchAdminTickets()
                            }}
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

          {/* TAB 3: STAFF USERS */}
          {adminTab === 'staff' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {staffList.map(s => (
                <Card key={s.id} className="p-4 flex items-center justify-between hover-glow">
                  <div>
                    <span className="font-bold text-white text-sm block">{s.nama_lengkap}</span>
                    <span className="text-xs text-[var(--accent)] font-mono block">@{s.username}</span>
                    <Badge variant="accent" className="mt-1">{s.role}</Badge>
                  </div>
                  <StatusDot status="online" size="md" />
                </Card>
              ))}
            </div>
          )}
        </main>

        {/* ── LIVE ASSISTANCE STUDIO MODAL (ADMIN) ────────────────────────── */}
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
                    <p className="text-xs text-[var(--text-muted)]">
                      Paket: {liveStudio.paket_name || '5 Mbps'} • Alamat: {liveStudio.alamat || 'Area Jombang'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setLiveStudio(null)
                    stopWebRtc()
                  }}
                  className="p-1.5 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-white"
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
                    onClick={handleAcceptHelpSession}
                    className="font-bold"
                  >
                    Hubungkan Sesi Sekarang
                  </Button>
                ) : (
                  <Button
                    variant="danger"
                    size="xs"
                    onClick={handleAdminEndHelpSession}
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
                      <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Tv size={14} className="text-[var(--accent)]" /> Pantauan Layar WebRTC (Live Stream)
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
                          <Radio className="w-10 h-10 text-[var(--accent)] mx-auto animate-pulse" />
                          <p className="text-xs font-semibold text-white">
                            {studioConnected
                              ? 'Sesi tersambung! Menunggu pelanggan menekan tombol "Bagikan Layar"'
                              : 'Klik tombol hijau di atas untuk menghubungkan sesi'}
                          </p>
                          <p className="text-[11px] text-[var(--text-muted)] max-w-xs mx-auto">
                            Atau gunakan tombol Petunjuk Visual di sebelah kanan untuk langsung menunjuk tombol di ponsel pelanggan.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-muted)] mono">
                    <span>Protokol: WebRTC P2P (STUN/WebSocket)</span>
                    <span>Enkripsi: TLS / SRTP End-to-End</span>
                  </div>
                </div>

                {/* Right: Co-Browsing Laser Pointer & Quick Controls */}
                <div className="lg:col-span-5 space-y-4 flex flex-col justify-between">
                  <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl p-4 space-y-3">
                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Navigation size={14} className="text-[var(--accent)]" /> Petunjuk Visual (Co-Browsing Cepat)
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)]">
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
                        <span className="text-[10px] text-[var(--accent)] opacity-0 group-hover:opacity-100 transition mono">Kirim 👉</span>
                      </button>

                      <button
                        onClick={() => handleSendVisualGuide('point_bills', 'Rincian dan riwayat tagihan bulanan Anda ada di sini')}
                        className="w-full py-2 px-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--accent-glow)] border border-[var(--border)] text-left text-xs font-semibold text-white flex items-center justify-between transition group"
                      >
                        <span className="flex items-center gap-2">
                          <Clock size={14} className="text-amber-400" /> 2. Tunjuk Menu Tagihan
                        </span>
                        <span className="text-[10px] text-[var(--accent)] opacity-0 group-hover:opacity-100 transition mono">Kirim 👉</span>
                      </button>

                      <button
                        onClick={() => handleSendVisualGuide('point_tickets', 'Klik di sini jika ingin mengirim keluhan ke tim teknisi')}
                        className="w-full py-2 px-3 rounded-lg bg-[var(--bg-card)] hover:bg-[var(--accent-glow)] border border-[var(--border)] text-left text-xs font-semibold text-white flex items-center justify-between transition group"
                      >
                        <span className="flex items-center gap-2">
                          <MessageSquare size={14} className="text-indigo-400" /> 3. Tunjuk Form Aduan Tiket
                        </span>
                        <span className="text-[10px] text-[var(--accent)] opacity-0 group-hover:opacity-100 transition mono">Kirim 👉</span>
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
                      <span className="text-[10px] text-[var(--text-muted)]">Buka sesi pelanggan via impersonate</span>
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

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMER PORTAL VIEW (MOBILE SHELL WITH INFRA-MANAGER THEME)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col items-center">
      {/* Impersonate Warning Banner */}
      {custProfile?.is_impersonated && (
        <div className="w-full bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex items-center justify-between z-50 shadow-md">
          <span className="flex items-center gap-1.5">
            <Eye size={14} /> Mode Impersonate Aktif — Anda login sebagai {custProfile?.nama_lengkap}
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              handleCustLogout()
              navigateTo('/admin')
            }}
            className="!bg-slate-950 !text-white hover:brightness-125"
          >
            Kembali ke Admin
          </Button>
        </div>
      )}

      {/* Visual Guidance Notification from CS */}
      {visualGuidance && (
        <div className="w-full max-w-[440px] px-4 pt-3 z-40 animate-slide-in">
          <div className="bg-[var(--accent)] text-slate-950 p-3 rounded-xl shadow-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-950 animate-ping"></span>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-80 block mono">Panduan dari CS:</span>
                <p className="text-xs font-black">{visualGuidance.text}</p>
              </div>
            </div>
            <button onClick={() => setVisualGuidance(null)} className="text-slate-950/80 hover:text-slate-950 text-xs font-bold">✕</button>
          </div>
        </div>
      )}

      {/* Mobile Shell Frame */}
      <div className="w-full max-w-[440px] min-h-screen flex flex-col bg-[var(--bg-primary)] border-x border-[var(--border)] relative pb-24 shadow-2xl">
        {/* App TopBar */}
        <header className="px-4 py-3 bg-[var(--bg-card)]/90 border-b border-[var(--border)] backdrop-blur sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--accent)', boxShadow: '0 0 10px var(--accent-glow)' }}
            >
              <Wifi size={18} className="text-slate-950" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xs font-bold text-white tracking-tight">AUFA NET</h1>
              <p className="text-[10px] text-[var(--text-muted)] mono">Portal Mandiri</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="xs" onClick={() => navigateTo('/admin')}>
              Admin
            </Button>
            <button onClick={handleCustLogout} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-rose-400" title="Keluar">
              <LogOut size={15} />
            </button>
          </div>
        </header>

        {/* ── TAB 1: HOME ───────────────────────────────────────────────────── */}
        {custTab === 'home' && (
          <div className="p-4 space-y-4 flex-1">
            {/* Account & Service Card */}
            <Card className="p-5 shadow-xl space-y-4 card-glow">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[11px] text-[var(--text-muted)] font-medium">Selamat Datang,</span>
                  <h3 className="text-base font-bold text-white">{custProfile?.nama_lengkap || 'Pelanggan'}</h3>
                  <span className="text-xs text-[var(--accent)] font-mono mt-0.5 block">ID: {custProfile?.pelanggan_id}</span>
                </div>
                <Badge variant="online">
                  <StatusDot status="online" size="sm" />
                  ONLINE
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--border)]">
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] block">Paket Internet</span>
                  <span className="text-xs font-bold text-white block">{custProfile?.cache?.paket_name || '5 Mbps Home'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-[var(--text-muted)] block">Biaya Bulanan</span>
                  <span className="text-xs font-bold text-[var(--accent)] block mono">
                    Rp {Number(custProfile?.cache?.harga_layanan || 100000).toLocaleString('id-ID')}
                  </span>
                </div>
              </div>

              {/* Bayar QRIS Action Button */}
              <div id="qris-section" className={clsx('transition-all duration-300', visualGuidance?.action === 'point_qris' && 'laser-pointer rounded-xl p-0.5')}>
                <Button
                  variant="primary"
                  size="md"
                  icon={QrCode}
                  onClick={() => handleOpenQris(bills[0]?.id)}
                  className="w-full !py-3 text-xs font-bold !bg-[var(--accent)] !text-slate-950 shadow-lg shadow-[var(--accent)]/30"
                >
                  Bayar Sekarang dengan QRIS (24 Jam)
                </Button>
              </div>
            </Card>

            {/* ── LIVE ASSISTANCE STATUS PANEL ──────────────────────────────── */}
            {helpState === 'idle' && (
              <Card className="p-4 flex items-center justify-between gap-3 hover-glow">
                <div>
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Laptop size={14} className="text-[var(--accent)]" /> Bantuan Panduan Layar
                  </h4>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5">CS kami dapat memandu layar Anda secara langsung.</p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRequestHelp}
                  className="font-bold shrink-0"
                >
                  🆘 Bantu Saya
                </Button>
              </Card>
            )}

            {helpState === 'waiting' && (
              <Card className="p-4 space-y-3 !border-amber-500/40 !bg-amber-950/20 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Radio size={16} className="animate-spin" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-300">Menghubungkan ke Tim Support...</h4>
                    <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                      Permintaan Anda sedang dikirim ke monitor Helpdesk Admin AUFA.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleCancelHelp}
                  className="w-full"
                >
                  Batalkan Permintaan
                </Button>
              </Card>
            )}

            {helpState === 'connected' && (
              <Card className="p-4 space-y-3 !border-emerald-500/40 !bg-emerald-950/20 glow-ring">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <StatusDot status="online" pulse={true} size="md" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-300">
                        🟢 Terhubung: {activeStaffName}
                      </h4>
                      <p className="text-[10px] text-[var(--text-secondary)]">Tim Support sedang memandu Anda.</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="xs" onClick={handleEndHelpSession}>
                    Tutup
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {!isSharingScreen ? (
                    <Button
                      variant="success"
                      size="sm"
                      icon={Tv}
                      onClick={handleStartScreenShare}
                      className="font-bold"
                    >
                      Bagikan Layar
                    </Button>
                  ) : (
                    <Button
                      variant="danger"
                      size="sm"
                      icon={Square}
                      onClick={handleStopScreenShare}
                      className="font-bold"
                    >
                      Stop Bagikan
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEndHelpSession}
                  >
                    Selesai Dipandu
                  </Button>
                </div>
              </Card>
            )}

            {/* Quick Feature Grid */}
            <div className="grid grid-cols-2 gap-3">
              <Card
                onClick={() => setCustTab('bills')}
                className="p-4 text-left space-y-2 cursor-pointer hover-glow"
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <Clock size={16} />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Riwayat Tagihan</span>
                  <span className="text-[10px] text-[var(--text-muted)]">Lihat struk pembayaran</span>
                </div>
              </Card>

              <Card
                onClick={() => setCustTab('tickets')}
                className="p-4 text-left space-y-2 cursor-pointer hover-glow"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                  <MessageSquare size={16} />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">Aduan Gangguan</span>
                  <span className="text-[10px] text-[var(--text-muted)]">Kirim tiket ke teknisi</span>
                </div>
              </Card>
            </div>

            {/* Hubungi Layanan WhatsApp */}
            <Card className="p-4 space-y-2">
              <span className="text-xs font-bold text-white block">Layanan Cepat Pelanggan AUFA</span>
              <p className="text-[11px] text-[var(--text-muted)]">Butuh bantuan teknisi datang ke rumah? Hubungi kontak resmi:</p>
              <a
                href="https://wa.me/6281228240369"
                target="_blank"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold hover:bg-emerald-500/20 transition"
              >
                <Phone size={13} /> Chat WhatsApp Resmi
              </a>
            </Card>

          </div>
        )}

        {/* ── TAB 2: BILLS ──────────────────────────────────────────────────── */}
        {custTab === 'bills' && (
          <div className="p-4 space-y-4 flex-1">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Clock size={16} className="text-amber-400" /> Riwayat & Tagihan Internet
            </h2>

            {bills.length === 0 ? (
              <Card className="p-6 text-center space-y-2">
                <CheckCircle2 size={32} className="text-emerald-400 mx-auto" />
                <h3 className="text-xs font-bold text-white">Tidak Ada Tagihan Tertunggak</h3>
                <p className="text-[11px] text-[var(--text-muted)]">Internet Anda aktif lancar untuk periode bulan ini.</p>
              </Card>
            ) : (
              bills.map(b => (
                <Card key={b.id} className="p-4 space-y-3 hover-glow">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-bold text-white block">{b.periode || 'Bulan Ini'}</span>
                      <span className="text-[10px] text-[var(--text-muted)] mono">No: {b.nomor || b.id}</span>
                    </div>
                    <Badge variant={b.status === 'PAID' ? 'online' : 'critical'}>
                      {b.status || 'BELUM BAYAR'}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-[var(--border)]">
                    <span className="text-sm font-bold text-[var(--accent)] mono">
                      Rp {Number(b.nominal || 100000).toLocaleString('id-ID')}
                    </span>
                    {b.status !== 'PAID' && (
                      <Button
                        variant="primary"
                        size="xs"
                        onClick={() => handleOpenQris(b.id)}
                      >
                        Bayar QRIS
                      </Button>
                    )}
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ── TAB 3: TICKETS ────────────────────────────────────────────────── */}
        {custTab === 'tickets' && (
          <div className="p-4 space-y-4 flex-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageSquare size={16} className="text-indigo-400" /> Tiket Aduan Gangguan
              </h2>
              <Button
                variant="primary"
                size="xs"
                onClick={() => setNewTicketModal(true)}
              >
                + Buat Tiket
              </Button>
            </div>

            {myTickets.length === 0 ? (
              <Card className="p-6 text-center space-y-2">
                <p className="text-xs text-[var(--text-muted)]">Belum ada tiket aduan yang Anda kirimkan.</p>
              </Card>
            ) : (
              myTickets.map(t => (
                <Card key={t.id} className="p-4 space-y-2 hover-glow">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="mono text-xs text-[var(--accent)] font-bold block">{t.ticket_number}</span>
                      <h4 className="text-xs font-bold text-white mt-0.5">{t.judul}</h4>
                    </div>
                    <Badge variant={t.status === 'open' ? 'warning' : 'online'}>
                      {t.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2">{t.deskripsi}</p>
                </Card>
              ))
            )}
          </div>
        )}

        {/* ── TAB 4: PROFILE ────────────────────────────────────────────────── */}
        {custTab === 'profile' && (
          <div className="p-4 space-y-4 flex-1">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <User size={16} className="text-[var(--accent)]" /> Profil Akun Portal
            </h2>

            <Card className="p-4 space-y-3 text-xs">
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block uppercase mono">ID Pelanggan</span>
                <span className="mono font-bold text-[var(--accent)]">{custProfile?.pelanggan_id}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block uppercase mono">Nama Lengkap</span>
                <span className="font-bold text-white">{custProfile?.nama_lengkap}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block uppercase mono">Nomor HP / WhatsApp</span>
                <span className="text-[var(--text-secondary)] mono">{custProfile?.phone || '-'}</span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block uppercase mono">Paket Internet</span>
                <span className="text-[var(--text-secondary)]">{custProfile?.cache?.paket_name || '5 Mbps'}</span>
              </div>
            </Card>

            <Button
              variant="danger"
              size="md"
              onClick={handleCustLogout}
              className="w-full font-bold"
            >
              Keluar dari Akun
            </Button>
          </div>
        )}

        {/* ── ICONIC CURVED BOTTOM NAV WITH CENTER FLOATING HERO BUTTON ────── */}
        <nav className="fixed bottom-0 max-w-[440px] w-full z-40">
          <div className="relative flex items-center bg-[var(--bg-card)] border-t border-[var(--border)] h-16 px-2 shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
            
            {/* Left Nav Items */}
            <div className="flex flex-1 justify-around">
              <button
                onClick={() => setCustTab('home')}
                className={clsx(
                  'flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-all',
                  custTab === 'home' ? 'accent-text font-bold' : 'text-muted'
                )}
              >
                <LayoutDashboard
                  size={19}
                  className={clsx('transition-all', custTab === 'home' && 'drop-shadow-[0_0_6px_var(--accent)]')}
                  strokeWidth={custTab === 'home' ? 2.5 : 1.8}
                />
                <span>Beranda</span>
              </button>

              <button
                onClick={() => setCustTab('bills')}
                className={clsx(
                  'flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-all',
                  custTab === 'bills' ? 'accent-text font-bold' : 'text-muted'
                )}
              >
                <Clock
                  size={19}
                  className={clsx('transition-all', custTab === 'bills' && 'drop-shadow-[0_0_6px_var(--accent)]')}
                  strokeWidth={custTab === 'bills' ? 2.5 : 1.8}
                />
                <span>Tagihan</span>
              </button>
            </div>

            {/* Hero Center Button — Notched Floating QRIS Action */}
            <div className="relative flex items-center justify-center mx-2 shrink-0 w-16 h-16 -mt-6">
              <div className="absolute inset-0 rounded-full bg-[var(--bg-card)] border border-[var(--border)] shadow-lg" />
              <button
                onClick={() => handleOpenQris(bills[0]?.id)}
                className={clsx(
                  'relative z-10 w-13 h-13 rounded-full',
                  'bg-[var(--accent)] text-slate-950 shadow-xl shadow-[var(--accent)]/40',
                  'flex items-center justify-center',
                  'active:scale-95 transition-transform'
                )}
                aria-label="Bayar QRIS"
                title="Bayar QRIS 24 Jam"
              >
                <QrCode size={22} strokeWidth={2.2} />
              </button>
            </div>

            {/* Right Nav Items */}
            <div className="flex flex-1 justify-around">
              <button
                onClick={() => setCustTab('tickets')}
                className={clsx(
                  'flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-all',
                  custTab === 'tickets' ? 'accent-text font-bold' : 'text-muted'
                )}
              >
                <MessageSquare
                  size={19}
                  className={clsx('transition-all', custTab === 'tickets' && 'drop-shadow-[0_0_6px_var(--accent)]')}
                  strokeWidth={custTab === 'tickets' ? 2.5 : 1.8}
                />
                <span>Aduan</span>
              </button>

              <button
                onClick={() => setCustTab('profile')}
                className={clsx(
                  'flex flex-col items-center gap-0.5 py-1 text-[10px] font-medium transition-all',
                  custTab === 'profile' ? 'accent-text font-bold' : 'text-muted'
                )}
              >
                <UserRound
                  size={19}
                  className={clsx('transition-all', custTab === 'profile' && 'drop-shadow-[0_0_6px_var(--accent)]')}
                  strokeWidth={custTab === 'profile' ? 2.5 : 1.8}
                />
                <span>Profil</span>
              </button>
            </div>

          </div>
        </nav>

        {/* ── MODAL: QRIS 24 JAM ────────────────────────────────────────────── */}
        {qrisModal && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="max-w-sm w-full p-5 text-center space-y-4 shadow-2xl !bg-[var(--bg-card)] border-[var(--border)] glow-ring">
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <QrCode size={15} className="text-[var(--accent)]" /> Pembayaran QRIS AUFA
                </span>
                <button onClick={() => setQrisModal(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
              </div>

              <div className="bg-white p-4 rounded-xl mx-auto inline-block shadow-inner">
                <div className="w-48 h-48 bg-slate-100 flex flex-col items-center justify-center border-2 border-dashed border-slate-400 rounded-lg relative overflow-hidden">
                  <div className="w-10 h-10 rounded-lg bg-[var(--accent)] text-slate-950 font-black text-xs flex items-center justify-center absolute z-10 shadow">
                    QRIS
                  </div>
                  <div className="grid grid-cols-6 gap-1 opacity-70 p-2">
                    {Array.from({ length: 36 }).map((_, i) => (
                      <div key={i} className={`w-6 h-6 rounded ${i % 3 === 0 ? 'bg-slate-950' : i % 2 === 0 ? 'bg-slate-800' : 'bg-slate-200'}`} />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-xs text-[var(--text-muted)] block">Total Pembayaran</span>
                <span className="text-xl font-black text-[var(--accent)] mono">
                  Rp {Number(qrisData?.nominal || 100000).toLocaleString('id-ID')}
                </span>
                <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[11px] font-semibold border border-emerald-500/20">
                  <Clock size={12} /> Berlaku Aktif Selama 24 Jam
                </div>
              </div>

              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                Scan dengan aplikasi perbankan apa saja (BCA, Mandiri, BRI, BNI) atau e-wallet (GoPay, OVO, ShopeePay, DANA).
              </p>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setQrisModal(false)}
                className="w-full"
              >
                Tutup Jendela
              </Button>
            </Card>
          </div>
        )}

        {/* ── MODAL: BUAT TIKET ADUAN ───────────────────────────────────────── */}
        {newTicketModal && (
          <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="max-w-sm w-full p-5 space-y-4 shadow-2xl !bg-[var(--bg-card)] border-[var(--border)]">
              <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <MessageSquare size={15} className="text-[var(--accent)]" /> Buka Tiket Aduan Gangguan
                </span>
                <button onClick={() => setNewTicketModal(false)} className="text-[var(--text-muted)] hover:text-white">✕</button>
              </div>

              <form onSubmit={handleSubmitTicket} className="space-y-3 text-xs">
                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Kategori Gangguan</label>
                  <select
                    value={ticketForm.kategori}
                    onChange={e => setTicketForm({ ...ticketForm, kategori: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-white focus:outline-none focus:border-[var(--accent)]"
                  >
                    <option value="los_mati">Lampu LOS Merah / Mati Total</option>
                    <option value="lambat">Koneksi Internet Lambat</option>
                    <option value="putus_nyambung">Koneksi Sering Putus-Nyambung</option>
                    <option value="pindah_posisi">Permintaan Geser Router / Kabel</option>
                  </select>
                </div>

                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Judul Ringkas</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Lampu modem merah sejak sore"
                    value={ticketForm.judul}
                    onChange={e => setTicketForm({ ...ticketForm, judul: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-white focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <div>
                  <label className="text-[var(--text-secondary)] font-semibold block mb-1">Penjelasan Gangguan</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Tuliskan kendala Anda secara detail..."
                    value={ticketForm.deskripsi}
                    onChange={e => setTicketForm({ ...ticketForm, deskripsi: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-white focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  className="w-full font-bold mt-2"
                >
                  Kirim Aduan ke Teknisi
                </Button>
              </form>
            </Card>
          </div>
        )}

      </div>
    </div>
  )
}
