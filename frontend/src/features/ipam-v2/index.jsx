import React, { useState, useMemo, useCallback, memo, useEffect, lazy, Suspense } from 'react'
import {
  Search, Plus, Network, RefreshCw, Loader2, AlertCircle, X,
  ChevronRight, Pencil, Trash2, Server, Tag, ScanLine,
  TreePine, List, Activity, History, CheckCircle
} from 'lucide-react'
import Card, { CardHeader, CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import ProgressBar from '../../components/ui/ProgressBar'
import ConfirmModal from '../../components/ui/ConfirmModal'

const SubnetTree  = lazy(() => import('./SubnetTree'))
const IpHeatmap   = lazy(() => import('./IpHeatmap'))
const AuditLogPanel = lazy(() => import('./AuditLogPanel'))

// ─── Auth ────────────────────────────────────────────────────────────────────
function getAuthHeaders() {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  }
}

async function apiFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...getAuthHeaders(), ...(opts.headers || {}) } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

// ─── CIDR Utils ──────────────────────────────────────────────────────────────
function ipToLong(ip) {
  const p = ip.split('.').map(Number)
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
}
function longToIp(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff].join('.')
}
function parseCidr(cidr) {
  if (!cidr) return null
  const m = cidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
  if (!m) return null
  const [, a, b, c, d, pr] = m.map(Number)
  if ([a, b, c, d].some(o => o > 255) || pr > 32) return null
  const mask      = pr === 0 ? 0 : ((-1 << (32 - pr)) >>> 0)
  const network   = (ipToLong(`${a}.${b}.${c}.${d}`) & mask) >>> 0
  const broadcast = (network | (~mask >>> 0)) >>> 0
  const usable    = Math.max(0, (1 << (32 - pr)) - 2)
  return {
    prefix: pr, mask, network, broadcast, usable,
    networkStr:   longToIp(network),
    broadcastStr: longToIp(broadcast),
    maskStr:      longToIp(mask),
    rangeStr: pr >= 31 ? 'N/A' : `${longToIp(network + 1)} – ${longToIp(broadcast - 1)}`
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────
const VIEW_MODES = { LIST: 'list', TREE: 'tree', HEATMAP: 'heatmap' }
const ASSIGNMENT_TYPES = [
  { key: 'static',   label: 'Static',    color: 'blue'   },
  { key: 'dhcp',     label: 'DHCP',      color: 'green'  },
  { key: 'reserved', label: 'Reserved',  color: 'amber'  },
  { key: 'infra',    label: 'Infra',     color: 'purple' },
  { key: 'customer', label: 'Customer',  color: 'cyan'   }
]

// ─── Hooks ───────────────────────────────────────────────────────────────────
function useDebounce(value, delay = 200) {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

function useIpamStats(subnets) {
  return useMemo(() => {
    let totalIps = 0, usedIps = 0
    subnets.forEach(s => {
      const p = parseCidr(s.cidr)
      if (p) { totalIps += p.usable; usedIps += s._count?.hosts || 0 }
    })
    return {
      totalSubnets: subnets.length,
      totalIps,
      usedIps,
      utilization: totalIps > 0 ? Math.round((usedIps / totalIps) * 100) : 0,
      vlanCount: new Set(subnets.map(s => s.vlanId).filter(Boolean)).size
    }
  }, [subnets])
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
const StatCard = memo(function StatCard({ icon: Icon, value, label, colorClass = 'text-[var(--accent)]', loading }) {
  return (
    <div className="bg-[var(--bg-secondary)] rounded-xl p-4 flex flex-col gap-1 border border-[var(--border)]/50">
      <Icon size={14} className={colorClass} />
      <p className="text-2xl font-bold text-primary leading-none mt-1">
        {loading ? <Loader2 size={18} className="animate-spin text-muted" /> : value}
      </p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  )
})

// ─── ViewToggle ───────────────────────────────────────────────────────────────
const ViewToggle = memo(function ViewToggle({ mode, onChange }) {
  const ITEMS = [
    { key: VIEW_MODES.LIST,    label: 'LIST',    Icon: List     },
    { key: VIEW_MODES.TREE,    label: 'TREE',    Icon: TreePine },
    { key: VIEW_MODES.HEATMAP, label: 'MAP',     Icon: Activity }
  ]
  return (
    <div className="flex bg-[var(--surface-2)] rounded-lg p-0.5">
      {ITEMS.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all
            ${mode === key ? 'bg-[var(--accent)] text-white shadow-sm' : 'text-muted hover:text-primary'}`}
        >
          <Icon size={11} />{label}
        </button>
      ))}
    </div>
  )
})

// ─── HostRow ─────────────────────────────────────────────────────────────────
const HostRow = memo(function HostRow({ host, onEdit, onDelete }) {
  const atype = ASSIGNMENT_TYPES.find(t => t.key === host.assignmentType)
  const statusColor = host.status === 'ACTIVE' ? 'bg-emerald-400' :
                      host.status === 'RESERVED' ? 'bg-amber-400' : 'bg-rose-400'
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded group hover:bg-[var(--surface-2)]/60 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
        <span className="font-mono text-xs text-primary tabular-nums">{host.ip}</span>
        {host.hostname && <span className="text-[10px] text-muted truncate">{host.hostname}</span>}
        {host.mac && <span className="text-[10px] text-muted font-mono hidden sm:inline">{host.mac}</span>}
        {host.discovered && <Badge variant="online" className="text-[8px] shrink-0">auto</Badge>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {atype && <Badge variant={atype.color} className="text-[8px]">{atype.label}</Badge>}
        {host.vlan && <Badge variant="neutral" className="text-[8px]">S-{host.vlan.vid}</Badge>}
        {host.cvid && <Badge variant="neutral" className="text-[8px] font-mono">C-{host.cvid}</Badge>}
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
          <button onClick={() => onEdit?.(host)} className="p-0.5 text-muted hover:text-primary transition-colors">
            <Pencil size={11} />
          </button>
          <button onClick={() => onDelete?.(host)} className="p-0.5 text-muted hover:text-rose-400 transition-colors">
            <Trash2 size={11} />
          </button>
        </div>
      </div>
    </div>
  )
})

// ─── SubnetRow ────────────────────────────────────────────────────────────────
const SubnetRow = memo(function SubnetRow({ subnet, vlanMap, onEdit, onDelete, onScan, onAddHost, scanning }) {
  const [expanded, setExpanded]   = useState(false)
  const [hosts,    setHosts]      = useState(null) // null = not loaded
  const [loading,  setLoading]    = useState(false)
  const [hostErr,  setHostErr]    = useState(null)

  const vlan  = vlanMap[subnet.vlanId]
  const total = parseCidr(subnet.cidr)?.usable || 0
  const used  = subnet._count?.hosts || 0
  const pct   = total > 0 ? Math.round((used / total) * 100) : 0

  const handleToggle = useCallback(async () => {
    if (!expanded && hosts === null) {
      setLoading(true)
      setHostErr(null)
      try {
        const data = await apiFetch(`/api/ipam/v2/hosts?subnetId=${subnet.id}&limit=200`)
        setHosts(data)
      } catch (e) {
        setHostErr(e.message)
        setHosts([])
      }
      setLoading(false)
    }
    setExpanded(v => !v)
  }, [expanded, hosts, subnet.id])

  const refreshHosts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(`/api/ipam/v2/hosts?subnetId=${subnet.id}&limit=200`)
      setHosts(data)
    } catch {}
    setLoading(false)
  }, [subnet.id])

  const [deleteHostTarget, setDeleteHostTarget] = useState(null)

  const confirmDeleteHost = useCallback(async () => {
    if (!deleteHostTarget) return
    try {
      await apiFetch(`/api/ipam/v2/hosts/${deleteHostTarget.id}`, { method: 'DELETE' })
      setHosts(h => h.filter(x => x.id !== deleteHostTarget.id))
    } catch (e) { alert(e.message) }
    setDeleteHostTarget(null)
  }, [deleteHostTarget])

  return (
    <>
      <tr
        onClick={handleToggle}
        className="border-b border-[var(--border)]/50 hover:bg-[var(--accent)]/5 transition-colors group cursor-pointer"
      >
        {/* Expand icon */}
        <td className="px-3 py-2.5 w-5">
          <ChevronRight size={12} className={`text-muted transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
        </td>

        {/* CIDR / Description */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono font-semibold text-xs text-primary">{subnet.cidr}</span>
            {subnet.gateway && (
              <span className="text-[9px] text-muted font-mono">gw:{subnet.gateway}</span>
            )}
            {subnet.parentId && <Badge variant="neutral" className="text-[8px]">child</Badge>}
          </div>
          {subnet.description && (
            <p className="text-[10px] text-muted truncate max-w-[200px] mt-0.5">{subnet.description}</p>
          )}
        </td>

        {/* VLAN */}
        <td className="px-3 py-2.5">
          {vlan ? (
            <Badge variant={vlan.color ?? 'neutral'} className="text-[10px]">
              VID {vlan.vid} · {vlan.name}
            </Badge>
          ) : (
            <span className="text-muted text-[10px]">—</span>
          )}
          {subnet.vlanInterfaces?.length > 0 && (
            <div className="flex flex-wrap gap-0.5 mt-1">
              {subnet.vlanInterfaces.map(iface => (
                <span key={iface.id} className="text-[8px] text-muted bg-[var(--surface-2)] px-1 py-0.5 rounded font-mono">
                  {iface.device.name}:{iface.name}
                </span>
              ))}
            </div>
          )}
        </td>

        {/* Utilization */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <ProgressBar
              value={used}
              max={Math.max(total, 1)}
              className="w-16"
              color={pct > 80 ? 'danger' : pct > 60 ? 'warning' : 'success'}
            />
            <span className="text-[10px] text-muted tabular-nums whitespace-nowrap">
              {used}/{total}
              <span className={`ml-1 font-medium ${pct > 80 ? 'text-rose-400' : pct > 60 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {pct}%
              </span>
            </span>
          </div>
        </td>

        {/* Actions */}
        <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onScan?.(subnet)}
              disabled={scanning === subnet.id}
              title="Scan subnet"
              className="p-1 rounded text-muted hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-40"
            >
              {scanning === subnet.id
                ? <Loader2 size={12} className="animate-spin" />
                : <ScanLine size={12} />}
            </button>
            <button
              onClick={() => onAddHost?.(subnet)}
              title="Tambah host"
              className="p-1 rounded text-muted hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
            >
              <Plus size={12} />
            </button>
            <button
              onClick={() => onEdit?.(subnet)}
              className="p-1 rounded text-muted hover:text-primary hover:bg-[var(--surface-2)] transition-colors"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onDelete?.(subnet)}
              className="p-1 rounded text-muted hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded hosts */}
      {expanded && (
        <tr>
          <td colSpan={5} className="px-4 py-2 bg-[var(--bg-secondary)]/40 border-b border-[var(--border)]/50">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-muted font-medium uppercase tracking-wider">
                Hosts ({hosts?.length ?? 0})
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAddHost?.(subnet)}
                  className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
                >
                  <Plus size={10} /> Tambah
                </button>
                <button onClick={refreshHosts} className="text-muted hover:text-primary">
                  <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {loading && (
              <div className="flex items-center gap-2 py-2 text-muted text-xs">
                <Loader2 size={12} className="animate-spin" /> Memuat hosts...
              </div>
            )}
            {hostErr && (
              <p className="text-[10px] text-rose-400 py-1">{hostErr}</p>
            )}
            {!loading && hosts !== null && hosts.length === 0 && (
              <p className="text-[10px] text-muted italic py-1">
                Belum ada host. Klik + Tambah untuk menambahkan.
              </p>
            )}
            {!loading && hosts?.length > 0 && (
              <div className="space-y-0.5">
                {hosts.map(h => (
                  <HostRow key={h.id} host={h} onDelete={setDeleteHostTarget} />
                ))}
              </div>
            )}
            <ConfirmModal
              isOpen={!!deleteHostTarget}
              onClose={() => setDeleteHostTarget(null)}
              onConfirm={confirmDeleteHost}
              title="Hapus Host"
              message={`Hapus host ${deleteHostTarget?.ip}${deleteHostTarget?.hostname ? ` (${deleteHostTarget.hostname})` : ''}? Aksi ini tidak dapat dibatalkan.`}
              variant="danger"
              confirmText="Hapus"
            />
          </td>
        </tr>
      )}
    </>
  )
})

// ─── SubnetModal ──────────────────────────────────────────────────────────────
function SubnetModal({ subnet, vlans, parentOptions, existingCidrs, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    cidr:         subnet?.cidr         || '',
    description:  subnet?.description  || '',
    vlanId:       subnet?.vlanId       || '',
    parentId:     subnet?.parentId     || '',
    gateway:      subnet?.gateway      || '',
    poolStart:    subnet?.poolStart    || '',
    poolEnd:      subnet?.poolEnd      || '',
    dnsPrimary:   subnet?.dnsPrimary   || '',
    dnsSecondary: subnet?.dnsSecondary || '',
    notes:        subnet?.notes        || ''
  })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const calc    = useMemo(() => parseCidr(form.cidr.trim()), [form.cidr])
  const overlap = useMemo(() => {
    if (!calc || subnet) return null
    return existingCidrs.find(c => {
      if (c === form.cidr.trim()) return false
      const p = parseCidr(c)
      if (!p) return false
      return (calc.network >= p.network && calc.network <= p.broadcast) ||
             (p.network >= calc.network && p.network <= calc.broadcast)
    })
  }, [calc, form.cidr, existingCidrs, subnet])

  const handleSubmit = e => {
    e.preventDefault()
    if (!calc) return alert('Format CIDR tidak valid')
    if (overlap) return alert(`CIDR overlap dengan ${overlap}`)
    const payload = { ...form }
    ;['vlanId','parentId','gateway','poolStart','poolEnd','dnsPrimary','dnsSecondary','notes']
      .forEach(k => { if (payload[k] === '') payload[k] = null })
    onSave(payload)
  }

  const inputCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)] transition-colors"

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 bg-[var(--bg-primary)] rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <span className="font-semibold text-primary">{subnet ? 'Edit Subnet' : 'Tambah Subnet'}</span>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={18} /></button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto">
          {/* CIDR */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">CIDR <span className="text-rose-400">*</span></label>
            <input value={form.cidr} onChange={set('cidr')} placeholder="192.168.1.0/24"
              disabled={!!subnet} className={`${inputCls} font-mono ${subnet ? 'opacity-60' : ''}`} required />
            {calc ? (
              <div className="text-[10px] text-muted bg-[var(--surface-2)]/60 rounded p-2 space-y-0.5">
                <div className="grid grid-cols-2 gap-x-4">
                  <span>Network: <b className="text-primary font-mono">{calc.networkStr}</b></span>
                  <span>Broadcast: <b className="text-primary font-mono">{calc.broadcastStr}</b></span>
                  <span>Mask: <b className="text-primary font-mono">{calc.maskStr}</b></span>
                  <span>Usable: <b className="text-emerald-400 font-mono">{calc.usable.toLocaleString()}</b></span>
                </div>
                <div>Range: <span className="font-mono text-primary">{calc.rangeStr}</span></div>
              </div>
            ) : form.cidr && (
              <p className="text-[10px] text-rose-400">Format tidak valid (contoh: 10.0.0.0/24)</p>
            )}
            {overlap && <p className="text-[10px] text-rose-400">⚠ Overlap dengan {overlap}</p>}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Deskripsi</label>
            <input value={form.description} onChange={set('description')} placeholder="Nama / keterangan subnet" className={inputCls} />
          </div>

          {/* VLAN + Parent */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">S-VLAN</label>
              <select value={form.vlanId} onChange={set('vlanId')} className={inputCls}>
                <option value="">— Pilih VLAN —</option>
                {vlans.map(v => <option key={v.id} value={v.id}>VID {v.vid} — {v.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">Parent Subnet</label>
              <select value={form.parentId} onChange={set('parentId')} className={inputCls}>
                <option value="">— Root —</option>
                {parentOptions.map(s => <option key={s.id} value={s.id}>{s.cidr}</option>)}
              </select>
            </div>
          </div>

          {/* Gateway */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Gateway</label>
            <input value={form.gateway} onChange={set('gateway')} placeholder="192.168.1.1" className={`${inputCls} font-mono`} />
          </div>

          {/* Pool */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">Pool Start</label>
              <input value={form.poolStart} onChange={set('poolStart')} placeholder="192.168.1.10" className={`${inputCls} font-mono`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">Pool End</label>
              <input value={form.poolEnd} onChange={set('poolEnd')} placeholder="192.168.1.250" className={`${inputCls} font-mono`} />
            </div>
          </div>

          {/* DNS */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">DNS Primary</label>
              <input value={form.dnsPrimary} onChange={set('dnsPrimary')} placeholder="8.8.8.8" className={`${inputCls} font-mono`} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">DNS Secondary</label>
              <input value={form.dnsSecondary} onChange={set('dnsSecondary')} placeholder="8.8.4.4" className={`${inputCls} font-mono`} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Catatan</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Catatan tambahan..."
              className={`${inputCls} resize-none`} />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-secondary hover:text-primary transition-colors">
              Batal
            </button>
            <button type="submit" disabled={saving || !form.cidr || !!overlap}
              className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50 transition-opacity">
              {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              {subnet ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── HostModal ────────────────────────────────────────────────────────────────
function HostModal({ host, subnet, vlans, onSave, onClose, saving }) {
  const [form, setForm] = useState({
    ip:             host?.ip             || '',
    hostname:       host?.hostname       || '',
    mac:            host?.mac            || '',
    vlanId:         host?.vlanId         || '',
    cvid:           host?.cvid           || '',
    assignmentType: host?.assignmentType || 'static',
    assignedTo:     host?.assignedTo     || '',
    status:         host?.status         || 'ACTIVE',
    notes:          host?.notes          || ''
  })
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = e => {
    e.preventDefault()
    const payload = { ...form, subnetId: subnet.id }
    ;['vlanId','mac','hostname','assignedTo','notes'].forEach(k => {
      if (payload[k] === '') payload[k] = null
    })
    payload.cvid = payload.cvid ? parseInt(payload.cvid) : null
    onSave(payload)
  }

  const inputCls = "w-full bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-primary outline-none focus:border-[var(--accent)] transition-colors"

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm mx-4 bg-[var(--bg-primary)] rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div>
            <span className="font-semibold text-primary">{host ? 'Edit Host' : 'Tambah Host'}</span>
            <span className="text-[10px] text-muted ml-2 font-mono">{subnet.cidr}</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3 overflow-y-auto">
          {/* IP */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">IP Address <span className="text-rose-400">*</span></label>
            <input value={form.ip} onChange={set('ip')} placeholder="192.168.1.10"
              disabled={!!host} className={`${inputCls} font-mono ${host ? 'opacity-60' : ''}`} required />
          </div>

          {/* Hostname + MAC */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">Hostname</label>
              <input value={form.hostname} onChange={set('hostname')} placeholder="server-01" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">MAC</label>
              <input value={form.mac} onChange={set('mac')} placeholder="AA:BB:CC:DD:EE:FF" className={`${inputCls} font-mono`} />
            </div>
          </div>

          {/* VLAN */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">S-VLAN Override</label>
              <select value={form.vlanId} onChange={set('vlanId')} className={inputCls}>
                <option value="">— Ikut subnet —</option>
                {vlans.map(v => <option key={v.id} value={v.id}>VID {v.vid}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">C-VID (QnQ)</label>
              <input value={form.cvid} onChange={set('cvid')} type="number" min="1" max="4094"
                placeholder="1–4094" className={`${inputCls} font-mono`} />
            </div>
          </div>

          {/* Assignment Type + Status */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">Tipe</label>
              <select value={form.assignmentType} onChange={set('assignmentType')} className={inputCls}>
                {ASSIGNMENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">Status</label>
              <select value={form.status} onChange={set('status')} className={inputCls}>
                <option value="ACTIVE">Active</option>
                <option value="RESERVED">Reserved</option>
                <option value="DEPRECATED">Deprecated</option>
              </select>
            </div>
          </div>

          {/* Assigned To */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Assigned To</label>
            <input value={form.assignedTo} onChange={set('assignedTo')} placeholder="Nama pelanggan / tujuan" className={inputCls} />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Catatan</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} className={`${inputCls} resize-none`} />
          </div>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-secondary hover:text-primary transition-colors">
              Batal
            </button>
            <button type="submit" disabled={saving || !form.ip}
              className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              {host ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function IpamPage() {
  const [subnets,  setSubnets]  = useState([])
  const [vlans,    setVlans]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [viewMode, setViewMode] = useState(VIEW_MODES.LIST)

  // Filters
  const [searchRaw,    setSearchRaw]    = useState('')
  const [vlanFilter,   setVlanFilter]   = useState('')
  const [levelFilter,  setLevelFilter]  = useState('')
  const [usageFilter,  setUsageFilter]  = useState('all')
  const search = useDebounce(searchRaw)

  // Modals
  const [subnetModal,    setSubnetModal]    = useState(null) // null | 'add' | subnet obj
  const [hostModal,      setHostModal]      = useState(null) // null | { subnet, host? }
  const [auditTarget,    setAuditTarget]    = useState(null)
  const [saving,         setSaving]         = useState(false)
  const [scanning,       setScanning]       = useState(null) // subnet.id currently scanning
  const [deleteConfirm,  setDeleteConfirm]  = useState(null) // subnet to delete
  const [editConfirm,    setEditConfirm]    = useState(null) // subnet to edit (pending confirm)

  // Load Data
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [subnetsData, vlansData] = await Promise.all([
        apiFetch('/api/ipam/v2/subnets?includeStats=true'),
        apiFetch('/api/vlans')
      ])
      setSubnets(subnetsData)
      setVlans(vlansData)
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const vlanMap = useMemo(() => Object.fromEntries(vlans.map(v => [v.id, v])), [vlans])
  const stats   = useIpamStats(subnets)
  const existingCidrs = useMemo(() => subnets.map(s => s.cidr), [subnets])

  // Filter
  const filtered = useMemo(() => {
    return subnets.filter(s => {
      if (search) {
        const q = search.toLowerCase()
        if (!(s.cidr.includes(q) ||
              (s.description ?? '').toLowerCase().includes(q) ||
              (s.gateway ?? '').toLowerCase().includes(q) ||
              (vlanMap[s.vlanId]?.name ?? '').toLowerCase().includes(q) ||
              String(vlanMap[s.vlanId]?.vid ?? '').includes(q))) return false
      }
      if (vlanFilter && s.vlanId !== vlanFilter) return false
      if (levelFilter === 'root' && s.parentId) return false
      if (levelFilter === 'child' && !s.parentId) return false
      if (usageFilter !== 'all') {
        const p = parseCidr(s.cidr)
        const pct = p && p.usable > 0 ? (s._count?.hosts || 0) / p.usable * 100 : 0
        if (usageFilter === 'low'    && pct >= 30)           return false
        if (usageFilter === 'medium' && (pct < 30 || pct > 70)) return false
        if (usageFilter === 'high'   && pct <= 70)           return false
      }
      return true
    }).sort((a, b) => {
      if (!a.parentId && b.parentId) return -1
      if (a.parentId && !b.parentId) return 1
      return ipToLong(a.cidr.split('/')[0]) - ipToLong(b.cidr.split('/')[0])
    })
  }, [subnets, search, vlanFilter, levelFilter, usageFilter, vlanMap])

  const hasFilters = searchRaw || vlanFilter || levelFilter || usageFilter !== 'all'

  // Handlers
  const handleSaveSubnet = async (payload) => {
    setSaving(true)
    try {
      const isEdit = !!subnetModal?.id
      const url    = isEdit ? `/api/ipam/v2/subnets/${subnetModal.id}` : '/api/ipam/v2/subnets'
      await apiFetch(url, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setSubnetModal(null)
      loadData()
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  const handleDeleteSubnet = (subnet) => setDeleteConfirm(subnet)

  const confirmDeleteSubnet = async () => {
    if (!deleteConfirm) return
    try {
      await apiFetch(`/api/ipam/v2/subnets/${deleteConfirm.id}`, { method: 'DELETE' })
      setDeleteConfirm(null)
      loadData()
    } catch (e) {
      alert(e.message)
      setDeleteConfirm(null)
    }
  }

  const handleEditSubnet = (subnet) => setEditConfirm(subnet)

  const confirmEditSubnet = () => {
    setSubnetModal(editConfirm)
    setEditConfirm(null)
  }

  const handleScan = async (subnet) => {
    setScanning(subnet.id)
    try {
      const data = await apiFetch('/api/ipam/v2/scan', {
        method: 'POST',
        body: JSON.stringify({ subnetId: subnet.id, method: 'ping' })
      })
      if (data?.discovered?.length > 0) {
        alert(`✅ Scan ${subnet.cidr}: ${data.discovered.length} host baru ditemukan.`)
        loadData()
      } else {
        alert(`Scan ${subnet.cidr}: tidak ada host baru ditemukan.`)
      }
    } catch (e) { alert(e.message) }
    setScanning(null)
  }

  const handleSaveHost = async (payload) => {
    setSaving(true)
    try {
      const isEdit = !!hostModal?.host?.id
      const url    = isEdit ? `/api/ipam/v2/hosts/${hostModal.host.id}` : '/api/ipam/v2/hosts'
      await apiFetch(url, { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
      setHostModal(null)
      loadData()
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  const selectCls = "bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-xs text-primary px-2 py-1.5 outline-none focus:border-[var(--accent)] transition-colors"

  return (
    <div className="p-4 space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Network}  value={stats.totalSubnets}           label="Subnets"     loading={loading} />
        <StatCard icon={Server}   value={stats.totalIps.toLocaleString()} label="Total IPs" colorClass="text-cyan-400" loading={loading} />
        <StatCard icon={Activity} value={`${stats.utilization}%`}      label="Utilisasi"
          colorClass={stats.utilization > 80 ? 'text-rose-400' : stats.utilization > 60 ? 'text-amber-400' : 'text-emerald-400'} loading={loading} />
        <StatCard icon={Tag}      value={stats.vlanCount}               label="VLANs"      colorClass="text-purple-400" loading={loading} />
      </div>

      {/* Main */}
      <Card>
        <CardHeader
          action={
            <div className="flex items-center gap-2">
              <ViewToggle mode={viewMode} onChange={setViewMode} />
              <button onClick={loadData} disabled={loading} title="Refresh"
                className="p-1.5 text-muted hover:text-primary transition-colors disabled:opacity-40 rounded-lg hover:bg-[var(--surface-2)]">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={() => setAuditTarget('all')} title="Audit Log"
                className="p-1.5 text-muted hover:text-primary transition-colors rounded-lg hover:bg-[var(--surface-2)]">
                <History size={14} />
              </button>
              <Button variant="primary" size="sm" icon={Plus} onClick={() => setSubnetModal('add')}>
                <span className="hidden sm:inline">Tambah Subnet</span>
              </Button>
            </div>
          }
        >
          <Network size={16} className="text-[var(--accent)]" />
          <span className="text-base font-semibold text-primary">IP Address Management</span>
          <Badge variant="neutral">{filtered.length}</Badge>
        </CardHeader>

        {/* Filters */}
        <div className="px-4 py-3 border-b border-[var(--border)]/50 space-y-2">
          <div className="flex items-center gap-2 bg-[var(--surface-2)] rounded-lg px-3 py-2">
            <Search size={13} className="text-muted shrink-0" />
            <input
              type="text"
              value={searchRaw}
              onChange={e => setSearchRaw(e.target.value)}
              placeholder="Cari CIDR, deskripsi, gateway, VLAN..."
              className="flex-1 bg-transparent text-sm text-primary placeholder-muted outline-none"
            />
            {searchRaw && (
              <button onClick={() => setSearchRaw('')} className="text-muted hover:text-primary">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={vlanFilter} onChange={e => setVlanFilter(e.target.value)} className={selectCls}>
              <option value="">Semua VLAN</option>
              {vlans.map(v => <option key={v.id} value={v.id}>VID {v.vid} — {v.name}</option>)}
            </select>
            <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)} className={selectCls}>
              <option value="">Semua Level</option>
              <option value="root">Root Only</option>
              <option value="child">Child Only</option>
            </select>
            <select value={usageFilter} onChange={e => setUsageFilter(e.target.value)} className={selectCls}>
              <option value="all">Semua Utilisasi</option>
              <option value="low">Rendah (&lt;30%)</option>
              <option value="medium">Sedang (30–70%)</option>
              <option value="high">Tinggi (&gt;70%)</option>
            </select>
            {hasFilters && (
              <button onClick={() => { setSearchRaw(''); setVlanFilter(''); setLevelFilter(''); setUsageFilter('all') }}
                className="text-xs text-muted hover:text-primary underline transition-colors">
                Reset
              </button>
            )}
          </div>
        </div>

        <CardBody className="p-0">
          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3 text-muted">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-sm">Memuat data IPAM...</span>
            </div>
          ) : error ? (
            <div className="m-4 p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={16} /><span className="font-medium">{error}</span>
              </div>
              <button onClick={loadData} className="text-xs underline hover:no-underline">Coba lagi</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted">
              <Network size={32} className="mx-auto mb-3 opacity-20" />
              <p className="text-sm">{hasFilters ? 'Tidak ada subnet yang cocok' : 'Belum ada subnet'}</p>
              {!hasFilters && (
                <button onClick={() => setSubnetModal('add')}
                  className="mt-2 text-xs text-[var(--accent)] hover:underline">
                  Tambah subnet pertama
                </button>
              )}
            </div>
          ) : viewMode === VIEW_MODES.LIST ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[var(--surface-2)]/40">
                    <th className="w-5 px-3 py-2" />
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted uppercase tracking-wider">CIDR / Deskripsi</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted uppercase tracking-wider">S-VLAN</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted uppercase tracking-wider">Utilisasi</th>
                    <th className="px-3 py-2 text-left text-[10px] font-medium text-muted uppercase tracking-wider w-28">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <SubnetRow
                      key={s.id}
                      subnet={s}
                      vlanMap={vlanMap}
                      scanning={scanning}
                      onEdit={handleEditSubnet}
                      onDelete={handleDeleteSubnet}
                      onScan={handleScan}
                      onAddHost={sub => setHostModal({ subnet: sub })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : viewMode === VIEW_MODES.TREE ? (
            <Suspense fallback={<div className="p-8 text-center text-muted"><Loader2 className="animate-spin inline mr-2" />Loading...</div>}>
              <SubnetTree subnets={filtered} vlanMap={vlanMap} />
            </Suspense>
          ) : (
            <Suspense fallback={<div className="p-8 text-center text-muted"><Loader2 className="animate-spin inline mr-2" />Loading...</div>}>
              <IpHeatmap subnets={filtered} />
            </Suspense>
          )}
        </CardBody>
      </Card>

      {/* Modals */}
      {subnetModal && (
        <SubnetModal
          subnet={subnetModal === 'add' ? null : subnetModal}
          vlans={vlans}
          parentOptions={subnets.filter(s => !s.parentId && s.id !== subnetModal?.id)}
          existingCidrs={existingCidrs}
          onSave={handleSaveSubnet}
          onClose={() => setSubnetModal(null)}
          saving={saving}
        />
      )}

      {hostModal && (
        <HostModal
          host={hostModal.host || null}
          subnet={hostModal.subnet}
          vlans={vlans}
          onSave={handleSaveHost}
          onClose={() => setHostModal(null)}
          saving={saving}
        />
      )}

      {auditTarget && (
        <Suspense fallback={null}>
          <AuditLogPanel onClose={() => setAuditTarget(null)} />
        </Suspense>
      )}

      {/* Confirm delete subnet */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDeleteSubnet}
        title="Hapus Subnet"
        message={`Hapus subnet ${deleteConfirm?.cidr}${deleteConfirm?.description ? ` (${deleteConfirm.description})` : ''}? Semua host di dalamnya juga akan terhapus.`}
        variant="danger"
        confirmText="Hapus"
      />

      {/* Confirm edit subnet */}
      <ConfirmModal
        isOpen={!!editConfirm}
        onClose={() => setEditConfirm(null)}
        onConfirm={confirmEditSubnet}
        title="Edit Subnet"
        message={`Edit subnet ${editConfirm?.cidr}${editConfirm?.description ? ` — ${editConfirm.description}` : ''}? Perubahan CIDR tidak diizinkan, hanya metadata yang dapat diubah.`}
        variant="info"
        confirmText="Lanjutkan Edit"
      />
    </div>
  )
}
