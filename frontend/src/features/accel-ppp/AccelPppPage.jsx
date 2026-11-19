import React, { useState, useMemo } from 'react'
import {
  Cpu,
  RefreshCw,
  Power,
  RotateCcw,
  Zap,
  UserCheck,
  Server,
  Layers,
  Search,
  Plus,
  Trash2,
  Edit2,
  Play,
  Square,
  Activity,
  Sliders,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Wifi,
  Radio,
  FileText,
  Shield,
  Gauge
} from 'lucide-react'
import { useAccelPpp } from './useAccelPpp'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import Input from '../../components/ui/Input'
import ProgressBar from '../../components/ui/ProgressBar'
import ConfirmModal from '../../components/ui/ConfirmModal'
import { useToast } from '../../context/ToastContext'
import { useAuth } from '../../context/AuthContext'

export default function AccelPppPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const toast = useToast()

  const {
    status,
    sessions,
    secrets,
    loading,
    refreshing,
    refetch,
    changeShaper,
    terminateSession,
    saveSecret,
    deleteSecret,
    labDial,
    labDisconnect,
    serviceAction,
    toggleModule,
  } = useAccelPpp()

  const isModuleEnabled = status?.moduleConfig?.enabled ?? true
  const isServiceActive = status?.serviceActive ?? false

  const [activeTab, setActiveTab] = useState('sessions')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Shaper Modal State
  const [shaperModalOpen, setShaperModalOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  const [shaperRate, setShaperRate] = useState('20480/10240')

  // Secret Modal State
  const [secretModalOpen, setSecretModalOpen] = useState(false)
  const [secretForm, setSecretForm] = useState({
    username: '',
    password: '',
    ipOrPool: '*',
    rateLimit: '10240/5120',
  })
  const [isEditingSecret, setIsEditingSecret] = useState(false)

  // Terminate Modal State
  const [terminateModalOpen, setTerminateModalOpen] = useState(false)
  const [sessionToTerminate, setSessionToTerminate] = useState(null)

  // Delete Secret Modal State
  const [deleteSecretModalOpen, setDeleteSecretModalOpen] = useState(false)
  const [secretToDelete, setSecretToDelete] = useState(null)

  // Module Toggle Confirm Modal
  const [toggleModalOpen, setToggleModalOpen] = useState(false)

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    if (!searchQuery) return sessions
    const q = searchQuery.toLowerCase()
    return sessions.filter(s =>
      s.username?.toLowerCase().includes(q) ||
      s.ifname?.toLowerCase().includes(q) ||
      s.ip?.toLowerCase().includes(q) ||
      s.callingSid?.toLowerCase().includes(q)
    )
  }, [sessions, searchQuery])

  // Filtered Secrets
  const filteredSecrets = useMemo(() => {
    if (!searchQuery) return secrets
    const q = searchQuery.toLowerCase()
    return secrets.filter(s =>
      s.username?.toLowerCase().includes(q) ||
      s.rateLimit?.toLowerCase().includes(q) ||
      s.ipOrPool?.toLowerCase().includes(q)
    )
  }, [secrets, searchQuery])

  // Handlers
  const handleToggleModule = async () => {
    try {
      setActionLoading(true)
      const targetState = !isModuleEnabled
      await toggleModule(targetState)
      toast.success(`Modul Accel-PPP berhasil ${targetState ? 'diaktifkan' : 'dinonaktifkan'}`)
      setToggleModalOpen(false)
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah status modul')
    } finally {
      setActionLoading(false)
    }
  }

  const handleServiceAction = async (action) => {
    try {
      setActionLoading(true)
      await serviceAction(action)
      toast.success(`Aksi ${action} Accel-PPP berhasil`)
    } catch (err) {
      toast.error(err.message || `Gagal menjalankan aksi ${action}`)
    } finally {
      setActionLoading(false)
    }
  }

  const handleOpenShaper = (session) => {
    setSelectedSession(session)
    setShaperRate(session.rateLimit !== '-' ? session.rateLimit : '20480/10240')
    setShaperModalOpen(true)
  }

  const handleSubmitShaper = async (e) => {
    e.preventDefault()
    if (!selectedSession || !shaperRate) return
    try {
      setActionLoading(true)
      await changeShaper(selectedSession.ifname, shaperRate)
      toast.success(`Shaper ${selectedSession.ifname} (${selectedSession.username}) diubah ke ${shaperRate}`)
      setShaperModalOpen(false)
    } catch (err) {
      toast.error(err.message || 'Gagal mengubah kecepatan shaper')
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmTerminate = async () => {
    if (!sessionToTerminate) return
    try {
      setActionLoading(true)
      await terminateSession(sessionToTerminate.ifname, sessionToTerminate.username)
      toast.success(`Sesi ${sessionToTerminate.username} (${sessionToTerminate.ifname}) berhasil diputuskan`)
      setTerminateModalOpen(false)
      setSessionToTerminate(null)
    } catch (err) {
      toast.error(err.message || 'Gagal memutuskan sesi')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSaveSecret = async (e) => {
    e.preventDefault()
    try {
      setActionLoading(true)
      await saveSecret(secretForm)
      toast.success(`Akun PPPoE ${secretForm.username} berhasil disimpan`)
      setSecretModalOpen(false)
      setSecretForm({ username: '', password: '', ipOrPool: '*', rateLimit: '10240/5120' })
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan akun')
    } finally {
      setActionLoading(false)
    }
  }

  const handleConfirmDeleteSecret = async () => {
    if (!secretToDelete) return
    try {
      setActionLoading(true)
      await deleteSecret(secretToDelete)
      toast.success(`Akun ${secretToDelete} berhasil dihapus`)
      setDeleteSecretModalOpen(false)
      setSecretToDelete(null)
    } catch (err) {
      toast.error(err.message || 'Gagal menghapus akun')
    } finally {
      setActionLoading(false)
    }
  }

  const handleLabDial = async (username = 'test10m', password = 'aufa123') => {
    try {
      setActionLoading(true)
      await labDial(username, password)
      toast.success(`Simulasi dial PPPoE (${username}) berhasil dijalankan`)
    } catch (err) {
      toast.error(err.message || 'Gagal menjalankan simulasi dial')
    } finally {
      setActionLoading(false)
    }
  }

  const handleLabDisconnect = async () => {
    try {
      setActionLoading(true)
      await labDisconnect()
      toast.success('Simulasi klien lab berhasil diputus')
    } catch (err) {
      toast.error(err.message || 'Gagal memutus simulasi lab')
    } finally {
      setActionLoading(false)
    }
  }

  // If module is disabled and not admin, show disabled state
  if (!isModuleEnabled && !isAdmin) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4 text-amber-400">
          <Power size={32} />
        </div>
        <h2 className="text-xl font-bold text-primary mb-2">Modul Accel-PPP Dinonaktifkan</h2>
        <p className="text-sm text-muted max-w-md">
          Modul BNG Accel-PPP saat ini sedang dinonaktifkan oleh Administrator jaringan. Hubungi tim admin NOC untuk informasi lebih lanjut.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Top Header Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white">
              <Cpu size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-primary tracking-tight">Accel-PPP (Linux BNG)</h1>
                <Badge variant={isServiceActive ? 'online' : 'offline'}>
                  {isServiceActive ? 'Service Active' : 'Service Inactive'}
                </Badge>
                {!isModuleEnabled && (
                  <Badge variant="warning">Modul Nonaktif</Badge>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5">
                High-Performance Broadband Network Gateway dengan Dynamic TC Linux Shaping
              </p>
            </div>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            loading={refreshing}
            onClick={() => refetch()}
          >
            Segarkan
          </Button>

          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                icon={RotateCcw}
                loading={actionLoading}
                onClick={() => handleServiceAction('reload')}
                title="Reload Konfigurasi Accel-PPP"
              >
                Reload
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={Power}
                loading={actionLoading}
                onClick={() => handleServiceAction('restart')}
                title="Restart Service Accel-PPP"
              >
                Restart
              </Button>
              <Button
                variant={isModuleEnabled ? 'danger' : 'primary'}
                size="sm"
                icon={Power}
                onClick={() => setToggleModalOpen(true)}
              >
                {isModuleEnabled ? 'Nonaktifkan Modul' : 'Aktifkan Modul'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Metrics Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active Sessions */}
        <Card className="p-4 border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Sesi Aktif</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <UserCheck size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{status?.stats?.activeSessions ?? sessions.length}</span>
            <span className="text-xs text-emerald-400 font-medium">PPPoE Klien</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Uptime: {status?.stats?.uptime || '-'}</span>
          </div>
        </Card>

        {/* Card 2: IP Pool Usage */}
        <Card className="p-4 border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Alokasi IP Pool</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Layers size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">
              {status?.pool?.used ?? 0}
              <span className="text-sm font-normal text-muted"> / {status?.pool?.total ?? 241}</span>
            </span>
            <span className="text-xs text-cyan-400 font-medium">{status?.pool?.usage ?? '0%'}</span>
          </div>
          <div className="mt-2">
            <ProgressBar
              value={status?.pool?.total ? Math.round(((status?.pool?.used ?? 0) / status.pool.total) * 100) : 0}
              className="h-1.5"
            />
          </div>
        </Card>

        {/* Card 3: Discovery Packets */}
        <Card className="p-4 border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Discovery PPPoE</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Radio size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{status?.stats?.pppoePadi ?? 0}</span>
            <span className="text-xs text-muted">PADI diterima</span>
          </div>
          <div className="mt-2 text-[11px] text-muted flex items-center justify-between">
            <span>PADO Terkirim:</span>
            <span className="font-semibold text-primary">{status?.stats?.pppoePado ?? 0}</span>
          </div>
        </Card>

        {/* Card 4: Engine Performance */}
        <Card className="p-4 border border-[var(--border)]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted uppercase tracking-wider">Resource Engine</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Activity size={16} />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{status?.stats?.cpu ?? '0%'}</span>
            <span className="text-xs text-muted">CPU Load</span>
          </div>
          <div className="mt-2 text-[11px] text-muted flex items-center justify-between">
            <span>RAM (RSS):</span>
            <span className="font-semibold text-primary">{status?.stats?.memRss ?? '0 MB'}</span>
          </div>
        </Card>
      </div>

      {/* ── Navigation Tabs ── */}
      <div className="flex border-b border-[var(--border)] gap-2">
        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'sessions'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          <UserCheck size={14} />
          <span>Sesi Aktif & Shaper ({sessions.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('secrets')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'secrets'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          <Shield size={14} />
          <span>Database Akun ({secrets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('lab')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'lab'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          <Zap size={14} />
          <span>Lab Simulator Klien</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'config'
              ? 'border-[var(--accent)] text-[var(--accent)]'
              : 'border-transparent text-muted hover:text-primary'
          }`}
        >
          <Sliders size={14} />
          <span>Pengaturan & Info Sistem</span>
        </button>
      </div>

      {/* ── Tab Content ── */}
      {/* ── TAB 1: SESI AKTIF & SHAPER ── */}
      {activeTab === 'sessions' && (
        <Card className="border border-[var(--border)] overflow-hidden">
          <CardHeader
            action={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    placeholder="Cari sesi atau IP..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>
            }
          >
            <div className="flex items-center gap-2">
              <Gauge size={16} className="text-[var(--accent)]" />
              <h2 className="text-sm font-bold text-primary">Daftar Sesi PPPoE & Live Shaper</h2>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-secondary)] text-muted uppercase text-[10px] tracking-wider border-y border-[var(--border)]">
                <tr>
                  <th className="py-2.5 px-4">Interface</th>
                  <th className="py-2.5 px-4">Username</th>
                  <th className="py-2.5 px-4">IP Address</th>
                  <th className="py-2.5 px-4">MAC / Calling-SID</th>
                  <th className="py-2.5 px-4">Rate-Limit (Down/Up)</th>
                  <th className="py-2.5 px-4">Uptime</th>
                  <th className="py-2.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted">
                      Tidak ada sesi PPPoE aktif saat ini.
                    </td>
                  </tr>
                ) : (
                  filteredSessions.map((session, idx) => (
                    <tr key={idx} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-primary">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          {session.ifname}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-primary">
                        {session.username}
                      </td>
                      <td className="py-3 px-4 font-mono text-cyan-400">
                        {session.ip}
                      </td>
                      <td className="py-3 px-4 font-mono text-muted text-[11px]">
                        {session.callingSid}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          {session.rateLimit}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-muted">
                        {session.uptime}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <Button
                          variant="outline"
                          size="xs"
                          icon={Sliders}
                          onClick={() => handleOpenShaper(session)}
                          title="Ubah kecepatan bandwidth on-the-fly"
                        >
                          Ubah Shaper
                        </Button>
                        <Button
                          variant="danger"
                          size="xs"
                          icon={Square}
                          onClick={() => {
                            setSessionToTerminate(session)
                            setTerminateModalOpen(true)
                          }}
                          title="Putus koneksi sesi"
                        >
                          Putus
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── TAB 2: MANAJEMEN AKUN (SECRETS) ── */}
      {activeTab === 'secrets' && (
        <Card className="border border-[var(--border)] overflow-hidden">
          <CardHeader
            action={
              <div className="flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={() => {
                    setIsEditingSecret(false)
                    setSecretForm({ username: '', password: '', ipOrPool: '*', rateLimit: '10240/5120' })
                    setSecretModalOpen(true)
                  }}
                >
                  Tambah Akun
                </Button>
              </div>
            }
          >
            <div className="flex items-center gap-2">
              <Lock size={16} className="text-[var(--accent)]" />
              <h2 className="text-sm font-bold text-primary">Database Akun (/etc/ppp/chap-secrets)</h2>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--bg-secondary)] text-muted uppercase text-[10px] tracking-wider border-y border-[var(--border)]">
                <tr>
                  <th className="py-2.5 px-4">Username</th>
                  <th className="py-2.5 px-4">Password</th>
                  <th className="py-2.5 px-4">IP / Pool</th>
                  <th className="py-2.5 px-4">Profil Shaper Default</th>
                  <th className="py-2.5 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredSecrets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted">
                      Belum ada akun chap-secrets yang terdaftar.
                    </td>
                  </tr>
                ) : (
                  filteredSecrets.map((sec, idx) => (
                    <tr key={idx} className="hover:bg-[var(--bg-secondary)]/50 transition-colors">
                      <td className="py-3 px-4 font-semibold text-primary">
                        {sec.username}
                      </td>
                      <td className="py-3 px-4 font-mono text-muted">
                        ••••••••
                      </td>
                      <td className="py-3 px-4 font-mono text-cyan-400">
                        {sec.ipOrPool}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-mono font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                          {sec.rateLimit}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={Edit2}
                          onClick={() => {
                            setIsEditingSecret(true)
                            setSecretForm(sec)
                            setSecretModalOpen(true)
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="danger"
                          size="xs"
                          icon={Trash2}
                          onClick={() => {
                            setSecretToDelete(sec.username)
                            setDeleteSecretModalOpen(true)
                          }}
                        >
                          Hapus
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── TAB 3: LAB SIMULATOR & PENGUJIAN ── */}
      {activeTab === 'lab' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-5 border border-[var(--border)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white">
                <Zap size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-primary">Simulasi Dial PPPoE Klien</h3>
                <p className="text-xs text-muted">
                  Jalankan dial client dari network namespace <code>ns-client</code> melalui antarmuka <code>veth-accel</code>.
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-xs font-semibold text-primary block">Pilih Akun Uji Coba</label>
              <div className="grid grid-cols-2 gap-2">
                {['test10m', 'test20m', 'test50m', 'gamer'].map(uname => (
                  <button
                    key={uname}
                    onClick={() => handleLabDial(uname, 'aufa123')}
                    disabled={actionLoading}
                    className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-all text-xs font-medium"
                  >
                    <span>{uname}</span>
                    <Play size={12} className="text-emerald-400" />
                  </button>
                ))}
              </div>

              <div className="pt-3 flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  icon={Square}
                  loading={actionLoading}
                  onClick={handleLabDisconnect}
                  className="w-full"
                >
                  Putus Koneksi Lab (Kill pppd)
                </Button>
              </div>
            </div>
          </Card>

          <Card className="p-5 border border-[var(--border)] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
                <Wifi size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-primary">Petunjuk & Status Lab</h3>
                <p className="text-xs text-muted">Informasi isolasi keamanan dan verifikasi shaper</p>
              </div>
            </div>

            <div className="text-xs text-muted space-y-2.5">
              <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                <div className="flex items-center gap-1.5 text-primary font-semibold mb-1">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>Isolasi Jaringan Terjamin</span>
                </div>
                <p>
                  Daemon Accel-PPP hanya mendengarkan pada antarmuka <code>veth-accel</code> dan VLAN <code>enp0s25.99</code>. Traffic lab tidak akan bocor ke router fisik Jogoroto.
                </p>
              </div>

              <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                <div className="flex items-center gap-1.5 text-primary font-semibold mb-1">
                  <Activity size={14} className="text-cyan-400" />
                  <span>Pengujian Shaper Linux TC</span>
                </div>
                <p>
                  Ketika kecepatan diubah via tombol <strong>Ubah Shaper</strong>, Accel-PPP secara instan memperbarui filter <code>tbf</code> downstream dan <code>police</code> upstream di Linux kernel tanpa disconnect!
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── TAB 4: PENGATURAN & INFO SISTEM ── */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          <Card className="p-5 border border-[var(--border)]">
            <h3 className="text-sm font-bold text-primary mb-3">Kontrol Integrasi Modul</h3>
            <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
              <div>
                <p className="text-xs font-semibold text-primary">Aktifkan Modul Accel-PPP di Infra-Manager</p>
                <p className="text-xs text-muted mt-0.5">
                  Jika dinonaktifkan, menu navigasi akan disembunyikan dan akses API non-admin akan dikunci.
                </p>
              </div>
              <Button
                variant={isModuleEnabled ? 'danger' : 'primary'}
                size="sm"
                onClick={() => setToggleModalOpen(true)}
              >
                {isModuleEnabled ? 'Nonaktifkan' : 'Aktifkan'}
              </Button>
            </div>
          </Card>

          <Card className="border border-[var(--border)] overflow-hidden">
            <CardHeader>
              <h3 className="text-sm font-bold text-primary">Antarmuka PPPoE Listener (accel-cmd pppoe interface show)</h3>
            </CardHeader>
            <div className="p-4 bg-[var(--bg-secondary)] font-mono text-xs text-primary whitespace-pre-wrap overflow-x-auto">
              {status?.interfaces || 'Tidak ada antarmuka yang terdaftar atau daemon nonaktif.'}
            </div>
          </Card>
        </div>
      )}

      {/* ── MODALS ── */}
      {/* 1. Modal Shaper Dynamic Change */}
      {shaperModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-primary">Ubah Kecepatan Shaper (Dynamic)</h3>
              </div>
              <button onClick={() => setShaperModalOpen(false)} className="text-muted hover:text-primary">✕</button>
            </div>

            <form onSubmit={handleSubmitShaper} className="space-y-4">
              <div className="text-xs space-y-1">
                <span className="text-muted">Target Interface:</span>
                <p className="font-mono font-bold text-primary">{selectedSession?.ifname} ({selectedSession?.username})</p>
              </div>

              <div>
                <label className="text-xs font-semibold text-primary block mb-1">Preset Kecepatan (Down / Up)</label>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[
                    { label: '10M / 5M', val: '10240/5120' },
                    { label: '20M / 10M', val: '20480/10240' },
                    { label: '30M / 15M', val: '30720/15360' },
                    { label: '50M / 25M', val: '51200/25600' },
                  ].map(p => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setShaperRate(p.val)}
                      className={`px-3 py-1.5 text-xs rounded-lg border text-center transition-all ${
                        shaperRate === p.val
                          ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)] font-bold'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] text-muted'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <label className="text-xs font-semibold text-primary block mb-1">Custom Rate Limit (kbps Down / kbps Up)</label>
                <input
                  type="text"
                  value={shaperRate}
                  onChange={e => setShaperRate(e.target.value)}
                  placeholder="20480/10240"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary font-mono focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShaperModalOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={actionLoading}>
                  Terapkan Perubahan
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal Add / Edit Secret */}
      {secretModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
              <div className="flex items-center gap-2">
                <Shield size={18} className="text-[var(--accent)]" />
                <h3 className="text-sm font-bold text-primary">
                  {isEditingSecret ? 'Edit Akun PPPoE' : 'Tambah Akun PPPoE'}
                </h3>
              </div>
              <button onClick={() => setSecretModalOpen(false)} className="text-muted hover:text-primary">✕</button>
            </div>

            <form onSubmit={handleSaveSecret} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-primary block mb-1">Username PPPoE</label>
                <input
                  type="text"
                  value={secretForm.username}
                  onChange={e => setSecretForm({ ...secretForm, username: e.target.value })}
                  placeholder="contoh: user01@fastkho"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  required
                  disabled={isEditingSecret}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-primary block mb-1">Password</label>
                <input
                  type="text"
                  value={secretForm.password}
                  onChange={e => setSecretForm({ ...secretForm, password: e.target.value })}
                  placeholder="Password akun"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-primary block mb-1">IP Address / Pool</label>
                <input
                  type="text"
                  value={secretForm.ipOrPool}
                  onChange={e => setSecretForm({ ...secretForm, ipOrPool: e.target.value })}
                  placeholder="* (otomatis dari pool) atau IP spesifik"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary font-mono focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-primary block mb-1">Profil Bandwidth (Down/Up)</label>
                <input
                  type="text"
                  value={secretForm.rateLimit}
                  onChange={e => setSecretForm({ ...secretForm, rateLimit: e.target.value })}
                  placeholder="10240/5120"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary font-mono focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <Button type="button" variant="ghost" size="sm" onClick={() => setSecretModalOpen(false)}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" size="sm" loading={actionLoading}>
                  Simpan Akun
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal Terminate Session */}
      <ConfirmModal
        open={terminateModalOpen}
        title="Putuskan Sesi PPPoE"
        message={`Apakah Anda yakin ingin memutuskan sesi untuk ${sessionToTerminate?.username} pada antarmuka ${sessionToTerminate?.ifname}?`}
        confirmLabel="Putuskan Sesi"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleConfirmTerminate}
        onCancel={() => {
          setTerminateModalOpen(false)
          setSessionToTerminate(null)
        }}
      />

      {/* 4. Modal Delete Secret */}
      <ConfirmModal
        open={deleteSecretModalOpen}
        title="Hapus Akun PPPoE"
        message={`Apakah Anda yakin ingin menghapus akun "${secretToDelete}" dari database chap-secrets?`}
        confirmLabel="Hapus Akun"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleConfirmDeleteSecret}
        onCancel={() => {
          setDeleteSecretModalOpen(false)
          setSecretToDelete(null)
        }}
      />

      {/* 5. Modal Toggle Module */}
      <ConfirmModal
        open={toggleModalOpen}
        title={isModuleEnabled ? "Nonaktifkan Modul Accel-PPP?" : "Aktifkan Modul Accel-PPP?"}
        message={isModuleEnabled
          ? "Modul akan disembunyikan dari sidebar navigasi dan endpoint dibatasi hanya untuk Administrator."
          : "Modul akan diaktifkan kembali dan dapat diakses dari menu navigasi."
        }
        confirmLabel={isModuleEnabled ? "Nonaktifkan" : "Aktifkan"}
        variant={isModuleEnabled ? "danger" : "primary"}
        loading={actionLoading}
        onConfirm={handleToggleModule}
        onCancel={() => setToggleModalOpen(false)}
      />
    </div>
  )
}
