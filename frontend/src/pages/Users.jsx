import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users as UsersIcon, Plus, Search, Edit2, Trash2, Key, Shield,
  Loader2, X, Save, AlertTriangle, CheckCircle, Eye,
} from 'lucide-react'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import clsx from 'clsx'

const ROLE_OPTIONS = [
  { value: 'ADMIN',      label: 'Administrator', desc: 'Akses penuh ke semua fitur',       color: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
  { value: 'TECHNICIAN', label: 'Teknisi',       desc: 'CRUD perangkat & FTTH, tanpa user management', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  { value: 'VIEWER',     label: 'Viewer',        desc: 'Hanya bisa melihat data (read-only)',         color: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
]

const ROLE_MAP = Object.fromEntries(ROLE_OPTIONS.map(r => [r.value, r]))

function RoleBadge({ role }) {
  const r = ROLE_MAP[role] || ROLE_MAP.VIEWER
  return (
    <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full border', r.color)}>
      {r.label}
    </span>
  )
}

/* ── Modal wrapper ────────────────────────────────────────────────────────── */
function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h3 className="text-sm font-bold text-primary">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--bg-secondary)] text-muted hover:text-primary transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/* ── Delete confirmation ──────────────────────────────────────────────────── */
function ConfirmModal({ open, onClose, onConfirm, user, loading }) {
  if (!open) return null
  return (
    <Modal open={open} onClose={onClose} title="Hapus User">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20">
          <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-rose-400">Tindakan ini tidak dapat dibatalkan</p>
            <p className="text-[11px] text-muted mt-1">
              User <strong className="text-primary">@{user?.username}</strong> ({user?.name}) akan dihapus beserta semua data terkait.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>Batal</Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={loading} icon={loading ? Loader2 : Trash2}>
            {loading ? 'Menghapus...' : 'Hapus User'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function Users() {
  const { user: currentUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')

  // Modal state
  const [formOpen, setFormOpen] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [resetTarget, setResetTarget] = useState(null)
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'VIEWER' })
  const [resetPw, setResetPw] = useState('')

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (filterRole) params.set('role', filterRole)
      const data = await api.get(`/users?${params}`)
      setUsers(data)
    } catch (e) {
      toast.error(e.message || 'Gagal memuat data user')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filterRole])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const openCreate = () => {
    setEditUser(null)
    setForm({ username: '', name: '', password: '', role: 'VIEWER' })
    setFormOpen(true)
  }

  const openEdit = (u) => {
    setEditUser(u)
    setForm({ username: u.username, name: u.name, password: '', role: u.role })
    setFormOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setSaving(true)
      if (editUser) {
        const body = { name: form.name, role: form.role }
        if (form.password) body.password = form.password
        await api.patch(`/users/${editUser.id}`, body)
        toast.success('User berhasil diperbarui')
      } else {
        await api.post('/users', form)
        toast.success(`User @${form.username} berhasil dibuat`)
      }
      setFormOpen(false)
      fetchUsers()
    } catch (e) {
      // Tampilkan detail validasi jika ada (422)
      const detail = e.body?.errors?.[0]?.msg || e.body?.error || e.message || 'Gagal menyimpan user'
      toast.error(detail)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      setSaving(true)
      await api.delete(`/users/${deleteTarget.id}`)
      toast.success(`User @${deleteTarget.username} berhasil dihapus`)
      setDeleteTarget(null)
      fetchUsers()
    } catch (e) {
      toast.error(e.body?.error || e.message || 'Gagal menghapus user')
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (resetPw.length < 6) { toast.error('Password minimal 6 karakter'); return }
    try {
      setSaving(true)
      await api.post(`/users/${resetTarget.id}/reset-password`, { password: resetPw })
      toast.success(`Password @${resetTarget.username} berhasil direset`)
      setResetTarget(null)
      setResetPw('')
    } catch (e) {
      toast.error(e.body?.error || e.message || 'Gagal reset password')
    } finally {
      setSaving(false)
    }
  }

  const formatDate = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="p-3 md:p-6 animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-primary flex items-center gap-2">
            <UsersIcon size={20} className="accent-text" />
            Manajemen User
          </h1>
          <p className="text-xs text-muted mt-0.5">Kelola akun pengguna dan hak akses</p>
        </div>
        <Button variant="primary" size="sm" icon={Plus} onClick={openCreate}>
          Tambah User
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex-1 max-w-xs">
          <Input
            icon={Search}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari user..."
          />
        </div>
        <select
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:border-[var(--accent)]"
        >
          <option value="">Semua Role</option>
          {ROLE_OPTIONS.map(r => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>

      {/* User Table */}
      <Card>
        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-[var(--accent)]" size={20} />
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <UsersIcon size={32} className="mx-auto text-muted mb-2" />
              <p className="text-sm text-muted">Tidak ada user ditemukan</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left">
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">User</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider hidden sm:table-cell">Dibuat</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-muted uppercase tracking-wider text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const isSelf = u.id === currentUser?.id
                    return (
                      <tr key={u.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent-glow)]/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={clsx(
                              'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border',
                              u.role === 'ADMIN'      && 'bg-rose-500/15 border-rose-500/30 text-rose-400',
                              u.role === 'TECHNICIAN' && 'bg-amber-500/15 border-amber-500/30 text-amber-400',
                              u.role === 'VIEWER'     && 'bg-sky-500/15 border-sky-500/30 text-sky-400',
                            )}>
                              {(u.name || u.username)[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <button
                                onClick={() => navigate(`/users/${u.id}`)}
                                className="text-xs font-semibold text-primary truncate hover:text-[var(--accent)] transition-colors text-left"
                              >
                                {u.name}
                                {isSelf && <span className="ml-1 text-[9px] text-[var(--accent)]">(Anda)</span>}
                              </button>
                              <p className="text-[10px] text-muted">@{u.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                        <td className="px-4 py-3 text-xs text-muted hidden sm:table-cell">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => navigate(`/users/${u.id}`)}
                              title="Detail & Permissions"
                              className="p-1.5 rounded-md hover:bg-[var(--accent-glow)] text-muted hover:text-[var(--accent)] transition-colors"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              onClick={() => openEdit(u)}
                              title="Edit"
                              className="p-1.5 rounded-md hover:bg-[var(--bg-secondary)] text-muted hover:text-primary transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => { setResetTarget(u); setResetPw('') }}
                              title="Reset Password"
                              className="p-1.5 rounded-md hover:bg-amber-500/10 text-muted hover:text-amber-400 transition-colors"
                            >
                              <Key size={13} />
                            </button>
                            {!isSelf && (
                              <button
                                onClick={() => setDeleteTarget(u)}
                                title="Hapus"
                                className="p-1.5 rounded-md hover:bg-rose-500/10 text-muted hover:text-rose-400 transition-colors"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Create/Edit Modal ── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editUser ? 'Edit User' : 'Tambah User Baru'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editUser && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">Username</label>
              <Input
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="username"
                required
                minLength={3}
                maxLength={32}
                pattern="^[a-zA-Z0-9_]+$"
              />
              <p className="text-[10px] text-muted">Huruf, angka, dan underscore. Min. 3 karakter.</p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Nama Lengkap</label>
            <Input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nama lengkap"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">
              {editUser ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password'}
            </label>
            <Input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Min. 6 karakter"
              required={!editUser}
              minLength={editUser ? 0 : 6}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-secondary">Role / Hak Akses</label>
            <div className="space-y-2">
              {ROLE_OPTIONS.map(r => (
                <label
                  key={r.value}
                  className={clsx(
                    'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                    form.role === r.value
                      ? 'border-[var(--accent)] bg-[var(--accent-glow)]'
                      : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={form.role === r.value}
                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                    className="mt-0.5 accent-[var(--accent)]"
                  />
                  <div>
                    <p className="text-xs font-semibold text-primary">{r.label}</p>
                    <p className="text-[10px] text-muted">{r.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setFormOpen(false)} type="button">Batal</Button>
            <Button variant="primary" size="sm" icon={saving ? Loader2 : Save} disabled={saving} type="submit">
              {saving ? 'Menyimpan...' : editUser ? 'Simpan Perubahan' : 'Buat User'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── Delete Modal ── */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        user={deleteTarget}
        loading={saving}
      />

      {/* ── Reset Password Modal ── */}
      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`Reset Password @${resetTarget?.username}`}>
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Key size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-muted">
              Set password baru untuk user <strong className="text-primary">@{resetTarget?.username}</strong>. 
              User akan perlu login ulang dengan password baru.
            </p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Password Baru</label>
            <Input
              type="password"
              value={resetPw}
              onChange={e => setResetPw(e.target.value)}
              placeholder="Min. 6 karakter"
              required
              minLength={6}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setResetTarget(null)} type="button">Batal</Button>
            <Button variant="primary" size="sm" icon={saving ? Loader2 : Key} disabled={saving} type="submit">
              {saving ? 'Menyimpan...' : 'Reset Password'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
