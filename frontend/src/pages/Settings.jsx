import React, { useState, useEffect, useCallback } from 'react'
import {
  Sun, Moon, Bell, Shield, Database, Clock, Save, MapPin, Image,
  Settings2, User, Key, LogOut, CheckCircle, Network, Copy, AlertTriangle,
} from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { useTheme } from '../context/ThemeContext'
import { useMapSettings } from '../context/MapSettingsContext'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import clsx from 'clsx'

/* ── Toggle ─────────────────────────────────────────────────────────────────── */
function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
      }`}
    >
      <span
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
        style={{ left: checked ? '18px' : '2px' }}
      />
    </button>
  )
}

/* ── Select helper ──────────────────────────────────────────────────────────── */
function Select({ value, onChange, children, className }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={clsx(
        'w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary',
        'focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all',
        className
      )}
    >
      {children}
    </select>
  )
}

/* ── Tab definitions ────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'profile',    label: 'Profil',      icon: User },
  { id: 'appearance', label: 'Tampilan',    icon: Sun },
  { id: 'map',        label: 'Peta',        icon: MapPin },
  { id: 'ftth',       label: 'FTTH',        icon: Settings2 },
  { id: 'nat',        label: 'NAT Remote',  icon: Network },
  { id: 'notif',      label: 'Notifikasi',  icon: Bell },
  { id: 'system',     label: 'Sistem',      icon: Database },
]

const ROLE_LABELS = { ADMIN: 'Administrator', TECHNICIAN: 'Teknisi', VIEWER: 'Viewer' }
const ROLE_COLORS = { ADMIN: 'text-rose-400 bg-rose-500/10', TECHNICIAN: 'text-amber-400 bg-amber-500/10', VIEWER: 'text-sky-400 bg-sky-500/10' }

function buildNftConfig(nat) {
  const source = nat.sourceCidr.trim() || '0.0.0.0/0'
  const wan = nat.wanInterface.trim() || 'eth0'
  const publicPort = nat.publicPort.trim() || '8080'
  const targetIp = nat.targetIp.trim() || '192.168.1.10'
  const targetPort = nat.targetPort.trim() || '80'
  return `# Review sebelum diterapkan pada native server\n\n# Aktifkan IPv4 forwarding\nsysctl -w net.ipv4.ip_forward=1\n\n# DNAT remote access\nnft add table ip infra_manager\nnft 'add chain ip infra_manager prerouting { type nat hook prerouting priority dstnat; policy accept; }'\nnft 'add chain ip infra_manager postrouting { type nat hook postrouting priority srcnat; policy accept; }'\nnft add rule ip infra_manager prerouting iifname "${wan}" ip saddr ${source} tcp dport ${publicPort} dnat to ${targetIp}:${targetPort}\nnft add rule ip infra_manager postrouting oifname "${wan}" ip daddr ${targetIp} tcp dport ${targetPort} masquerade`
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Settings() {
  const { theme, toggle } = useTheme()
  const { settings: mapSettings, setDefaultCenter } = useMapSettings()
  const { user, logout } = useAuth()
  const toast = useToast()

  const [tab, setTab] = useState('profile')
  const [saving, setSaving] = useState(false)

  // ── Profile state ──
  const [profile, setProfile] = useState({ name: '', currentPassword: '', newPassword: '', confirmPassword: '' })

  useEffect(() => {
    if (user) setProfile(p => ({ ...p, name: user.name || '' }))
  }, [user])

  // ── Preferences state ──
  const [prefs, setPrefs] = useState({
    darkMode: theme === 'dark',
    alertEmail: true,
    alertSms: false,
    autoRefresh: true,
    refreshInterval: '30',
    snmpCommunity: 'public',
    retentionDays: '90',
    toastAutoDismiss: true,
    toastDuration: '4',
    photoCompression: true,
    photoQuality: '80',
    maxPhotoSize: '10',
    defaultOdcSplitter: 'R1_8',
    defaultOdpSplitter: 'R1_8',
    defaultMountType: 'pole',
    autoBackup: false,
  })

  const [nat, setNat] = useState({
    enabled: false,
    wanInterface: 'eth0',
    publicHost: '',
    publicPort: '8080',
    targetIp: '',
    targetPort: '80',
    sourceCidr: '',
  })

  const [mapCenter, setMapCenterState] = useState({
    lat: mapSettings.defaultCenter.lat.toString(),
    lng: mapSettings.defaultCenter.lng.toString(),
    zoom: (mapSettings.defaultZoom ?? 15).toString(),
  })

  useEffect(() => {
    const saved = localStorage.getItem('app_settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setPrefs(p => ({ ...p, ...parsed }))
        if (parsed.nat) setNat(n => ({ ...n, ...parsed.nat }))
      } catch {}
    }
  }, [])

  const set = (key, val) => setPrefs(p => ({ ...p, [key]: val }))

  const handleThemeToggle = (val) => {
    set('darkMode', val)
    if ((val && theme !== 'dark') || (!val && theme === 'dark')) toggle()
  }

  // ── Save handlers ──
  const savePrefs = useCallback(() => {
    localStorage.setItem('app_settings', JSON.stringify({ ...prefs, nat }))
    toast.success('Pengaturan tersimpan')
  }, [prefs, nat, toast])

  const copyNatConfig = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildNftConfig(nat))
      toast.success('Konfigurasi nftables berhasil disalin')
    } catch {
      toast.error('Gagal menyalin konfigurasi')
    }
  }, [nat, toast])

  const saveMapCenter = useCallback(() => {
    const lat = parseFloat(mapCenter.lat)
    const lng = parseFloat(mapCenter.lng)
    const zoom = parseInt(mapCenter.zoom) || 15
    if (!isNaN(lat) && !isNaN(lng)) {
      setDefaultCenter(lat, lng, zoom)
      toast.success('Koordinat peta default tersimpan')
    } else {
      toast.error('Latitude/Longitude tidak valid')
    }
  }, [mapCenter, setDefaultCenter, toast])

  const saveProfile = useCallback(async () => {
    try {
      setSaving(true)
      const body = {}
      if (profile.name && profile.name !== user?.name) body.name = profile.name
      if (profile.newPassword) {
        if (profile.newPassword !== profile.confirmPassword) {
          toast.error('Password baru tidak cocok')
          return
        }
        if (!profile.currentPassword) {
          toast.error('Masukkan password saat ini')
          return
        }
        body.currentPassword = profile.currentPassword
        body.newPassword = profile.newPassword
      }
      if (Object.keys(body).length === 0) { toast.info('Tidak ada perubahan'); return }
      await api.patch('/auth/me', body)
      toast.success('Profil berhasil diperbarui')
      setProfile(p => ({ ...p, currentPassword: '', newPassword: '', confirmPassword: '' }))
    } catch (e) {
      toast.error(e.message || 'Gagal menyimpan profil')
    } finally {
      setSaving(false)
    }
  }, [profile, user, toast])

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-3 md:p-6 animate-fade-in max-w-3xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-bold text-primary">Pengaturan</h1>
        <p className="text-xs text-muted mt-0.5">Kelola profil, tampilan, dan konfigurasi aplikasi</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1 border-b border-[var(--border)]">
        {TABS.filter(t => t.id !== 'nat' || user?.role === 'ADMIN').map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-all whitespace-nowrap -mb-px border-b-2',
                tab === t.id
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-glow)]'
                  : 'border-transparent text-muted hover:text-primary hover:bg-[var(--bg-secondary)]'
              )}
            >
              <Icon size={13} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* ── Tab: Profile ────────────────────────────────────────────────── */}
      {tab === 'profile' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <User size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Informasi Akun</span>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex items-center gap-4 py-2">
                <div className="w-14 h-14 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xl font-bold shrink-0">
                  {(user?.name || user?.username || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary">{user?.name || user?.username}</p>
                  <p className="text-xs text-muted">@{user?.username}</p>
                  <span className={clsx('inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full', ROLE_COLORS[user?.role] || 'text-muted bg-[var(--bg-secondary)]')}>
                    {ROLE_LABELS[user?.role] || user?.role}
                  </span>
                </div>
              </div>

              <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-secondary">Nama Lengkap</label>
                  <Input
                    value={profile.name}
                    onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                    className="max-w-sm"
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <Key size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Ganti Password</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Password Saat Ini</label>
                <Input
                  type="password"
                  value={profile.currentPassword}
                  onChange={e => setProfile(p => ({ ...p, currentPassword: e.target.value }))}
                  placeholder="••••••"
                  className="max-w-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-secondary">Password Baru</label>
                  <Input
                    type="password"
                    value={profile.newPassword}
                    onChange={e => setProfile(p => ({ ...p, newPassword: e.target.value }))}
                    placeholder="Min. 6 karakter"
                    className="max-w-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-secondary">Konfirmasi Password</label>
                  <Input
                    type="password"
                    value={profile.confirmPassword}
                    onChange={e => setProfile(p => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Ulangi password baru"
                    className="max-w-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="primary" size="sm" icon={Save} onClick={saveProfile} disabled={saving}>
                  {saving ? 'Menyimpan...' : 'Simpan Profil'}
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <button
                onClick={logout}
                className="flex items-center gap-2 text-xs text-rose-400 hover:text-rose-300 transition-colors py-1"
              >
                <LogOut size={14} />
                Keluar dari akun
              </button>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── Tab: Appearance ─────────────────────────────────────────────── */}
      {tab === 'appearance' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Sun size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Tema</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-xs font-medium text-primary">Dark Mode</p>
                  <p className="text-[10px] text-muted">Tampilan gelap untuk kenyamanan mata</p>
                </div>
                <Toggle checked={prefs.darkMode} onChange={handleThemeToggle} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <Bell size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Toast Notifikasi</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-xs font-medium text-primary">Auto-Dismiss</p>
                  <p className="text-[10px] text-muted">Toast menghilang otomatis setelah beberapa detik</p>
                </div>
                <Toggle checked={prefs.toastAutoDismiss ?? true} onChange={v => set('toastAutoDismiss', v)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Durasi Toast (detik)</label>
                <Input type="number" min="1" max="30" value={prefs.toastDuration} onChange={e => set('toastDuration', e.target.value)} className="max-w-[120px]" />
              </div>
              <Button variant="outline" size="sm" icon={Save} onClick={savePrefs}>Simpan</Button>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── Tab: Map ────────────────────────────────────────────────────── */}
      {tab === 'map' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <MapPin size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Lokasi Default Peta</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <p className="text-[10px] text-muted">Koordinat default saat membuka peta FTTH atau map picker</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-secondary">Latitude</label>
                  <Input type="number" step="any" value={mapCenter.lat} onChange={e => setMapCenterState(c => ({ ...c, lat: e.target.value }))} placeholder="-7.2575" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-secondary">Longitude</label>
                  <Input type="number" step="any" value={mapCenter.lng} onChange={e => setMapCenterState(c => ({ ...c, lng: e.target.value }))} placeholder="112.7521" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-secondary">Zoom</label>
                  <Input type="number" min="1" max="20" value={mapCenter.zoom} onChange={e => setMapCenterState(c => ({ ...c, zoom: e.target.value }))} />
                </div>
              </div>
              <Button variant="outline" size="sm" icon={Save} onClick={saveMapCenter}>Simpan Koordinat</Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <Image size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Upload Foto</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-xs font-medium text-primary">Kompresi Otomatis</p>
                  <p className="text-[10px] text-muted">Kompres foto sebelum diupload</p>
                </div>
                <Toggle checked={prefs.photoCompression ?? true} onChange={v => set('photoCompression', v)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-secondary">Kualitas (1-100)</label>
                  <Input type="number" min="10" max="100" value={prefs.photoQuality} onChange={e => set('photoQuality', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-secondary">Max Size (MB)</label>
                  <Input type="number" min="1" max="50" value={prefs.maxPhotoSize} onChange={e => set('maxPhotoSize', e.target.value)} />
                </div>
              </div>
              <Button variant="outline" size="sm" icon={Save} onClick={savePrefs}>Simpan</Button>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── Tab: FTTH ───────────────────────────────────────────────────── */}
      {tab === 'ftth' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Settings2 size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Default FTTH</span>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Rasio Splitter ODC Default</label>
                <Select value={prefs.defaultOdcSplitter} onChange={v => set('defaultOdcSplitter', v)} className="max-w-xs">
                  <option value="R1_2">1:2 (2 port)</option>
                  <option value="R1_4">1:4 (4 port)</option>
                  <option value="R1_8">1:8 (8 port)</option>
                  <option value="R1_16">1:16 (16 port)</option>
                  <option value="R1_32">1:32 (32 port)</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Rasio Splitter ODP Default</label>
                <Select value={prefs.defaultOdpSplitter} onChange={v => set('defaultOdpSplitter', v)} className="max-w-xs">
                  <option value="R1_2">1:2 (2 port)</option>
                  <option value="R1_4">1:4 (4 port)</option>
                  <option value="R1_8">1:8 (8 port)</option>
                  <option value="R1_16">1:16 (16 port)</option>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Tipe Mounting Default</label>
                <Select value={prefs.defaultMountType} onChange={v => set('defaultMountType', v)} className="max-w-xs">
                  <option value="pole">Tiang (Pole)</option>
                  <option value="wall">Dinding (Wall)</option>
                  <option value="aerial">Aerial</option>
                  <option value="underground">Underground</option>
                  <option value="pedestal">Pedestal</option>
                </Select>
              </div>
              <Button variant="outline" size="sm" icon={Save} onClick={savePrefs}>Simpan</Button>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── Tab: NAT Remote ─────────────────────────────────────────────── */}
      {tab === 'nat' && user?.role === 'ADMIN' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Network size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Remote ONU melalui NAT</span>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                <p className="text-[10px] leading-relaxed text-secondary">NAT membuka port dari internet ke ONU. Batasi sumber dengan CIDR tepercaya, gunakan port publik yang tidak standar, dan terapkan rule hanya setelah diverifikasi di native server.</p>
              </div>
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-xs font-medium text-primary">Konfigurasi aktif</p>
                  <p className="text-[10px] text-muted">Menandai konfigurasi ini siap diterapkan di native server</p>
                </div>
                <Toggle checked={nat.enabled} onChange={v => setNat(n => ({ ...n, enabled: v }))} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><label className="text-xs font-medium text-secondary">Interface WAN</label><Input value={nat.wanInterface} onChange={e => setNat(n => ({ ...n, wanInterface: e.target.value }))} placeholder="eth0" /></div>
                <div className="space-y-1"><label className="text-xs font-medium text-secondary">Host publik / DDNS</label><Input value={nat.publicHost} onChange={e => setNat(n => ({ ...n, publicHost: e.target.value }))} placeholder="remote.example.com" /></div>
                <div className="space-y-1"><label className="text-xs font-medium text-secondary">Port publik</label><Input type="number" min="1024" max="65535" value={nat.publicPort} onChange={e => setNat(n => ({ ...n, publicPort: e.target.value }))} /></div>
                <div className="space-y-1"><label className="text-xs font-medium text-secondary">IP ONU tujuan</label><Input value={nat.targetIp} onChange={e => setNat(n => ({ ...n, targetIp: e.target.value }))} placeholder="192.168.1.10" /></div>
                <div className="space-y-1"><label className="text-xs font-medium text-secondary">Port layanan ONU</label><Input type="number" min="1" max="65535" value={nat.targetPort} onChange={e => setNat(n => ({ ...n, targetPort: e.target.value }))} /></div>
                <div className="space-y-1"><label className="text-xs font-medium text-secondary">Allowlist sumber (CIDR)</label><Input value={nat.sourceCidr} onChange={e => setNat(n => ({ ...n, sourceCidr: e.target.value }))} placeholder="203.0.113.10/32" /></div>
              </div>
              <div className="flex gap-2 pt-1"><Button variant="outline" size="sm" icon={Save} onClick={savePrefs}>Simpan Konfigurasi</Button><Button variant="ghost" size="sm" icon={Copy} onClick={copyNatConfig}>Salin Rule nftables</Button></div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader><Shield size={14} className="accent-text" /><span className="text-sm font-semibold text-primary">Preview Rule</span></CardHeader>
            <CardBody><pre className="overflow-x-auto rounded-lg bg-black/20 p-3 text-[10px] leading-relaxed text-secondary whitespace-pre-wrap break-all">{buildNftConfig(nat)}</pre></CardBody>
          </Card>
        </div>
      )}

      {/* ── Tab: Notifications ──────────────────────────────────────────── */}
      {tab === 'notif' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Bell size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Notifikasi Alert</span>
            </CardHeader>
            <CardBody className="space-y-3">
              {[
                { key: 'alertEmail', label: 'Email Alerts', desc: 'Terima notifikasi alert via email' },
                { key: 'alertSms',   label: 'SMS Alerts',   desc: 'Terima notifikasi alert via SMS' },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between py-1">
                  <div>
                    <p className="text-xs font-medium text-primary">{item.label}</p>
                    <p className="text-[10px] text-muted">{item.desc}</p>
                  </div>
                  <Toggle checked={prefs[item.key]} onChange={v => set(item.key, v)} />
                </div>
              ))}
              <Button variant="outline" size="sm" icon={Save} onClick={savePrefs}>Simpan</Button>
            </CardBody>
          </Card>
        </div>
      )}

      {/* ── Tab: System ─────────────────────────────────────────────────── */}
      {tab === 'system' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Clock size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Polling & Refresh</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-xs font-medium text-primary">Auto Refresh</p>
                  <p className="text-[10px] text-muted">Refresh data secara otomatis</p>
                </div>
                <Toggle checked={prefs.autoRefresh} onChange={v => set('autoRefresh', v)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Interval Refresh (detik)</label>
                <Input value={prefs.refreshInterval} onChange={e => set('refreshInterval', e.target.value)} className="max-w-[120px]" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <Shield size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">SNMP</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">SNMP Community String</label>
                <Input value={prefs.snmpCommunity} onChange={e => set('snmpCommunity', e.target.value)} className="max-w-xs" />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <Database size={14} className="accent-text" />
              <span className="text-sm font-semibold text-primary">Data & Backup</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-secondary">Retensi Data (hari)</label>
                <Input value={prefs.retentionDays} onChange={e => set('retentionDays', e.target.value)} className="max-w-[120px]" />
              </div>
              <div className="flex items-center justify-between py-1">
                <div>
                  <p className="text-xs font-medium text-primary">Auto Backup Harian</p>
                  <p className="text-[10px] text-muted">Backup database otomatis setiap hari</p>
                </div>
                <Toggle checked={prefs.autoBackup ?? false} onChange={v => set('autoBackup', v)} />
              </div>
              <Button variant="outline" size="sm" icon={Save} onClick={savePrefs}>Simpan Semua</Button>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  )
}
