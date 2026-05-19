import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, User, Shield, Save, Key, Loader2, CheckCircle,
  LayoutDashboard, Server, Layers, Network, Activity, Wifi, Globe,
  AlertTriangle, Tag, Database, Map, Box, Cable, Settings, UserRound,
} from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import clsx from 'clsx'

/* ── Feature permission definitions ─────────────────────────────────────── */
const FEATURE_GROUPS = [
  {
    group: 'Monitoring',
    icon: Activity,
    features: [
      { key: 'dashboard',   label: 'Dashboard',       icon: LayoutDashboard, desc: 'Statistik dan ringkasan sistem' },
      { key: 'devices',     label: 'Devices',         icon: Server,          desc: 'Manajemen perangkat jaringan' },
      { key: 'interfaces',  label: 'Interfaces',      icon: Layers,          desc: 'Monitoring interface perangkat' },
      { key: 'topology',    label: 'Topology',        icon: Network,         desc: 'Peta topologi jaringan' },
      { key: 'traffic',     label: 'Traffic',         icon: Activity,        desc: 'Monitoring traffic bandwidth' },
      { key: 'alerts',      label: 'Alerts',          icon: AlertTriangle,   desc: 'Notifikasi dan peringatan' },
    ],
  },
  {
    group: 'Jaringan',
    icon: Globe,
    features: [
      { key: 'wireless',    label: 'Wireless',        icon: Wifi,            desc: 'Manajemen wireless/AP' },
      { key: 'internet',    label: 'Internet',        icon: Globe,           desc: 'Status koneksi internet' },
      { key: 'vlans',       label: 'VLANs',           icon: Tag,             desc: 'Konfigurasi VLAN' },
      { key: 'ipam',        label: 'IPAM',            icon: Database,        desc: 'IP Address Management' },
    ],
  },
  {
    group: 'FTTH & Distribusi',
    icon: Cable,
    features: [
      { key: 'ftth_map',    label: 'Peta FTTH',       icon: Map,             desc: 'Peta distribusi fiber optik' },
      { key: 'odc',         label: 'ODC',             icon: Box,             desc: 'Optical Distribution Cabinet' },
      { key: 'odp',         label: 'ODP',             icon: Cable,           desc: 'Optical Distribution Point' },
      { key: 'customers',   label: 'Pelanggan',       icon: UserRound,       desc: 'Data pelanggan FTTH' },
    ],
  },
  {
    group: 'Sistem',
    icon: Settings,
    features: [
      { key: 'settings',    label: 'Settings',        icon: Settings,        desc: 'Pengaturan aplikasi' },
      { key: 'user_mgmt',   label: 'User Management', icon: User,            desc: 'Kelola user dan hak akses (ADMIN)' },
    ],
  },
]

const ALL_FEATURE_KEYS = FEATURE_GROUPS.flatMap(g => g.features.map(f => f.key))

const ROLE_OPTIONS = [
  { value: 'ADMIN',      label: 'Administrator', color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  { value: 'TECHNICIAN', label: 'Teknisi',       color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { value: 'VIEWER',     label: 'Viewer',        color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
]
const ROLE_MAP = Object.fromEntries(ROLE_OPTIONS.map(r => [r.value, r]))

/* ── Checkbox component ─────────────────────────────────────────────────── */
function FeatureCheckbox({ feature, checked, onChange, disabled }) {
  const Icon = feature.icon
  return (
    <label
      className={clsx(
        'flex items-start gap-3 p-3 rounded-lg border transition-all',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        checked
          ? 'border-[var(--accent)] bg-[var(--accent-glow)]'
          : 'border-[var(--border)] hover:border-[var(--accent)]/40'
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 accent-[var(--accent)] w-3.5 h-3.5"
      />
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <Icon size={14} className={clsx('shrink-0 mt-0.5', checked ? 'text-[var(--accent)]' : 'text-muted')} />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">{feature.label}</p>
          <p className="text-[10px] text-muted">{feature.desc}</p>
        </div>
      </div>
    </label>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function UserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const toast = useToast()

  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Editable fields
  const [name, setName] = useState('')
  const [role, setRole] = useState('VIEWER')
  const [permissions, setPermissions] = useState({})

  // Reset password
  const [resetPw, setResetPw] = useState('')
  const [resetOpen, setResetOpen] = useState(false)

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.get(`/users/${id}`)
      setUserData(data)
      setName(data.name || '')
      setRole(data.role)
      if (data.permissions && typeof data.permissions === 'object') {
        setPermissions(data.permissions)
      } else {
        const defaults = {}
        ALL_FEATURE_KEYS.forEach(k => { defaults[k] = true })
        setPermissions(defaults)
      }
    } catch (e) {
      toast.error(e.message || 'Gagal memuat data user')
      navigate('/users')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => { fetchUser() }, [fetchUser])

  const toggleFeature = (key, val) => {
    setPermissions(p => ({ ...p, [key]: val }))
  }

  const toggleGroup = (group, val) => {
    setPermissions(p => {
      const next = { ...p }
      group.features.forEach(f => { next[f.key] = val })
      return next
    })
  }

  const isGroupChecked = (group) => group.features.every(f => permissions[f.key])
  const isGroupPartial = (group) => group.features.some(f => permissions[f.key]) && !isGroupChecked(group)

  const selectAll = () => {
    const next = {}
    ALL_FEATURE_KEYS.forEach(k => { next[k] = true })
    setPermissions(next)
  }

  const deselectAll = () => {
    const next = {}
    ALL_FEATURE_KEYS.forEach(k => { next[k] = false })
    setPermissions(next)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await api.patch(`/users/${id}`, { name, role, permissions })
      toast.success('User berhasil diperbarui')
      fetchUser()
    } catch (e) {
      toast.error(e.message || 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      await api.post(`/users/${id}/reset-password`, { password: resetPw })
      toast.success('Password berhasil direset')
      setResetOpen(false)
      setResetPw('')
    } catch (e) {
      toast.error(e.message || 'Gagal reset password')
    } finally {
      setSaving(false)
    }
  }

  const isSelf = userData?.id === currentUser?.id
  const isAdmin = role === 'ADMIN'
  const enabledCount = ALL_FEATURE_KEYS.filter(k => permissions[k]).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-[var(--accent)]" size={24} />
      </div>
    )
  }

  if (!userData) return null

  const formatDate = (d) => new Date(d).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const roleInfo = ROLE_MAP[userData.role] || ROLE_MAP.VIEWER

  return (
    <div className="p-3 md:p-6 animate-fade-in max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate('/users')}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-primary transition-colors mb-4"
      >
        <ArrowLeft size={14} />
        Kembali ke daftar user
      </button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xl font-bold shrink-0">
            {(userData.name || userData.username)[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-lg font-bold text-primary">{userData.name}</h1>
            <p className="text-xs text-muted">@{userData.username}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border', roleInfo.color)}>
                {roleInfo.label}
              </span>
              {isSelf && <span className="text-[10px] text-[var(--accent)] font-medium">(Akun Anda)</span>}
            </div>
          </div>
        </div>
        <Button variant="primary" size="sm" icon={saving ? Loader2 : Save} onClick={handleSave} disabled={saving}>
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column — User info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <User size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Informasi User</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Nama Lengkap</label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Username</label>
                <Input value={userData.username} disabled className="opacity-60" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Role</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  disabled={isSelf}
                  className={clsx(
                    'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary',
                    'focus:outline-none focus:border-[var(--accent)] transition-all',
                    isSelf && 'opacity-60 cursor-not-allowed'
                  )}
                >
                  {ROLE_OPTIONS.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
                {isSelf && <p className="text-[10px] text-muted">Tidak bisa mengubah role sendiri</p>}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border)]">
                <div>
                  <p className="text-[10px] text-muted">Dibuat</p>
                  <p className="text-xs text-primary">{formatDate(userData.createdAt)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted">Diperbarui</p>
                  <p className="text-xs text-primary">{formatDate(userData.updatedAt)}</p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Reset password */}
          <Card>
            <CardHeader>
              <Key size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Reset Password</span>
            </CardHeader>
            <CardBody>
              {resetOpen ? (
                <form onSubmit={handleResetPassword} className="space-y-3">
                  <Input
                    type="password"
                    value={resetPw}
                    onChange={e => setResetPw(e.target.value)}
                    placeholder="Password baru (min. 6 karakter)"
                    required
                    minLength={6}
                  />
                  <div className="flex gap-2">
                    <Button variant="primary" size="sm" icon={saving ? Loader2 : Key} disabled={saving} type="submit">
                      {saving ? 'Menyimpan...' : 'Simpan'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setResetOpen(false)} type="button">Batal</Button>
                  </div>
                </form>
              ) : (
                <Button variant="outline" size="sm" icon={Key} onClick={() => setResetOpen(true)}>
                  Reset Password
                </Button>
              )}
            </CardBody>
          </Card>
        </div>

        {/* Right column — Permissions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <Shield size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Akses Fitur</span>
              <span className="ml-auto text-[10px] text-muted">{enabledCount}/{ALL_FEATURE_KEYS.length} fitur aktif</span>
            </CardHeader>
            <CardBody className="space-y-5">
              {/* Hint for ADMIN */}
              {isAdmin && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
                  <Shield size={14} className="text-rose-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted">
                    Role <strong className="text-rose-400">Administrator</strong> memiliki akses penuh ke semua fitur.
                    Pengaturan checkbox di bawah akan diabaikan untuk role ini.
                  </p>
                </div>
              )}

              {/* Quick actions */}
              <div className="flex items-center gap-2">
                <button onClick={selectAll} className="text-[11px] text-[var(--accent)] hover:underline">
                  Pilih semua
                </button>
                <span className="text-muted text-[10px]">•</span>
                <button onClick={deselectAll} className="text-[11px] text-muted hover:text-primary hover:underline">
                  Hapus semua
                </button>
              </div>

              {/* Feature groups */}
              {FEATURE_GROUPS.map(group => {
                const GroupIcon = group.icon
                const allChecked = isGroupChecked(group)
                const partial = isGroupPartial(group)
                return (
                  <div key={group.group}>
                    {/* Group header with toggle */}
                    <label className="flex items-center gap-2 mb-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={el => { if (el) el.indeterminate = partial }}
                        onChange={e => toggleGroup(group, e.target.checked)}
                        disabled={isAdmin}
                        className="accent-[var(--accent)] w-3.5 h-3.5"
                      />
                      <GroupIcon size={13} className="text-muted group-hover:text-primary transition-colors" />
                      <span className="text-xs font-bold text-primary">{group.group}</span>
                      <span className="text-[10px] text-muted ml-1">
                        ({group.features.filter(f => permissions[f.key]).length}/{group.features.length})
                      </span>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-5">
                      {group.features.map(feature => (
                        <FeatureCheckbox
                          key={feature.key}
                          feature={feature}
                          checked={isAdmin || !!permissions[feature.key]}
                          onChange={val => toggleFeature(feature.key, val)}
                          disabled={isAdmin}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  )
}
