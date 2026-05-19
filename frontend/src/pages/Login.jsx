import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Eye, EyeOff, Wifi, AlertCircle, Loader2 } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
  const from       = location.state?.from?.pathname ?? '/'

  const [form, setForm]       = useState({ username: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  
  // Check for session expired from URL param
  const isExpired = new URLSearchParams(location.search).get('expired') === '1'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) {
      setError('Username dan password wajib diisi')
      return
    }
    setError('')
    setLoading(true)
    try {
      await login(form.username, form.password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message ?? 'Login gagal, periksa kembali kredensial Anda')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[var(--bg-primary)]">

      {/* ── Left panel (desktop) ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[var(--bg-secondary)] flex-col items-center justify-center p-12">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: 'linear-gradient(var(--accent) 1px, transparent 1px), linear-gradient(90deg, var(--accent) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />
        {/* Glow orb */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full"
          style={{ background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)' }}
        />

        <div className="relative z-10 text-center max-w-sm">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--accent)', boxShadow: '0 0 24px var(--accent-glow)' }}>
              <Wifi size={26} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="text-left">
              <p className="text-xl font-bold text-[var(--text-primary)]">InfraManager</p>
              <p className="text-xs text-[var(--text-muted)] tracking-wider uppercase">Network Operations</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-3">
            Kelola infrastruktur jaringan<br />dari satu dasbor
          </h2>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            Monitor perangkat, kelola FTTH, pantau alert, dan analisis trafik jaringan secara real-time.
          </p>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2 justify-center mt-8">
            {['FTTH Mapping', 'Device Monitor', 'VLAN & IPAM', 'Alert System', 'Topology'].map(f => (
              <span key={f} className="px-3 py-1 rounded-full text-xs border border-[var(--border)] text-[var(--text-secondary)]">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right panel (form) ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--accent)' }}>
            <Wifi size={22} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-lg font-bold text-[var(--text-primary)]">InfraManager</p>
            <p className="text-[10px] text-[var(--text-muted)] tracking-wider uppercase">Network Operations</p>
          </div>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Selamat datang</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Masuk ke akun Anda untuk melanjutkan</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Session Expired Warning */}
            {isExpired && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
                <AlertCircle size={16} className="shrink-0" />
                <span>Sesi Anda telah berakhir. Silakan masuk kembali.</span>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <AlertCircle size={16} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Username */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                Username
              </label>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && document.getElementById('pwd-input').focus()}
                placeholder="Masukkan username"
                className="w-full px-4 py-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                Password
              </label>
              <div className="relative">
                <input
                  id="pwd-input"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="Masukkan password"
                  className="w-full px-4 py-2.5 pr-11 rounded-lg bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] text-sm outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', boxShadow: loading ? 'none' : '0 0 16px var(--accent-glow)' }}
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Masuk...</>
              ) : (
                'Masuk'
              )}
            </button>
          </form>

          {/* Role info hint */}
          <div className="mt-8 p-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] space-y-1.5">
            <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Akun Demo</p>
            {[
              { user: 'admin',   pass: 'admin1234',   role: 'Admin',      color: '#f87171' },
              { user: 'teknisi', pass: 'teknisi1234', role: 'Teknisi',    color: '#fb923c' },
              { user: 'viewer',  pass: 'viewer1234',  role: 'Viewer',     color: '#4ade80' },
            ].map(a => (
              <button
                key={a.user}
                type="button"
                onClick={() => setForm({ username: a.user, password: a.pass })}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md hover:bg-[var(--bg-card)] transition-colors text-left group"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">{a.user}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border" style={{ color: a.color, borderColor: a.color + '40', background: a.color + '12' }}>{a.role}</span>
                </div>
                <span className="font-mono text-[10px] text-[var(--text-muted)]">{a.pass}</span>
              </button>
            ))}
            <p className="text-[10px] text-[var(--text-muted)] pt-1">Klik baris untuk mengisi form otomatis</p>
          </div>
        </div>
      </div>
    </div>
  )
}
