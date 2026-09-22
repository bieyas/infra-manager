import React, { useState } from 'react'
import { X, Check, AlertCircle } from 'lucide-react'
import Card, { CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import clsx from 'clsx'

const EMPTY = { ip: '', hostname: '', mac: '', status: 'ACTIVE', notes: '', cvid: '', vlanId: '' }
const STATUSES = ['ACTIVE', 'RESERVED', 'SUSPENDED']

export default function HostForm({ host, subnetCidr, subnetVlanId, vlans = [], onSave, onClose, saving }) {
  const [form,   setForm]   = useState(
    host ? { ip: host.ip, hostname: host.hostname ?? '', mac: host.mac ?? '',
             status: host.status ?? 'ACTIVE', notes: host.notes ?? '',
             cvid: host.cvid != null ? String(host.cvid) : '',
             vlanId: host.vlanId ?? '' }
         : { ...EMPTY, vlanId: subnetVlanId ?? '' }
  )
  const vlanMap = Object.fromEntries(vlans.map(v => [v.id, v]))
  const [errors, setErrors] = useState({})

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })) }

  const validate = () => {
    const e = {}
    if (!form.ip.trim()) e.ip = 'IP wajib diisi'
    else if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(form.ip.trim())) e.ip = 'Format IP tidak valid'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave({ ip: form.ip.trim(), hostname: form.hostname || null,
             mac: form.mac || null, status: form.status, notes: form.notes || null,
             cvid: form.cvid !== '' ? Number(form.cvid) : null,
             vlanId: form.vlanId || null })
  }

  const inputCls = (f) => clsx(
    'w-full bg-[var(--bg-secondary)] border rounded-lg text-xs text-primary px-3 py-2',
    'focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all',
    errors[f] ? 'border-rose-500' : 'border-[var(--border)]'
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full max-w-md mx-4 animate-fade-in">
        <div className="flex items-center justify-between px-4 pt-4 pb-0">
          <div>
            <p className="text-sm font-semibold text-primary">{host ? 'Edit Host' : 'Tambah Host'}</p>
            {subnetCidr && <p className="text-[10px] text-muted font-mono">{subnetCidr}</p>}
          </div>
          <Button variant="ghost" size="xs" icon={X} onClick={onClose} />
        </div>
        <CardBody className="space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">IP Address *</label>
              <input value={form.ip} onChange={e => set('ip', e.target.value)}
                placeholder="10.0.0.10" disabled={!!host}
                className={clsx(inputCls('ip'), 'font-mono', host && 'opacity-50 cursor-not-allowed')} />
              {errors.ip && <p className="text-[10px] text-rose-400 flex items-center gap-1"><AlertCircle size={10}/>{errors.ip}</p>}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">Status</label>
              <div className="flex flex-col gap-1 pt-0.5">
                {STATUSES.map(s => (
                  <button key={s} onClick={() => set('status', s)}
                    className={clsx(
                      'px-2 py-1 rounded text-[10px] font-medium border transition-all text-left',
                      form.status === s
                        ? s === 'ACTIVE'   ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : s === 'RESERVED' ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                        : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                        : 'border-[var(--border)] text-muted hover:text-primary'
                    )}>{s}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Hostname</label>
            <input value={form.hostname} onChange={e => set('hostname', e.target.value)}
              placeholder="mis. router-core-01" className={inputCls('hostname')} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">MAC Address</label>
            <input value={form.mac} onChange={e => set('mac', e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF" className={clsx(inputCls('mac'), 'font-mono uppercase')} />
          </div>
          {/* S-VLAN Selection */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">S-VLAN (Service VLAN)</label>
            <select value={form.vlanId} onChange={e => set('vlanId', e.target.value)} className={inputCls('vlanId')}>
              {subnetVlanId && vlanMap[subnetVlanId] && (
                <option value={subnetVlanId}>Ikut VLAN subnet (VID {vlanMap[subnetVlanId].vid})</option>
              )}
              <option value="">— Tidak ada S-VLAN —</option>
              {vlans.map(v => (
                <option key={v.id} value={v.id}>VID {v.vid} — {v.name}</option>
              ))}
            </select>
            <p className="text-[9px] text-muted">Pilih "Ikut VLAN subnet" atau VLAN lain untuk trunk</p>
          </div>
          {/* C-VLAN */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">C-VLAN (Customer VLAN)</label>
            <input value={form.cvid} onChange={e => set('cvid', e.target.value)}
              type="number" min="1" max="4094" placeholder="Inner tag (mis. 100)"
              className={clsx(inputCls('cvid'), 'font-mono')} />
            <p className="text-[9px] text-muted">Isi jika pakai QnQ (double tagging), kosongkan jika single tag</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Catatan</label>
            <input value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Opsional" className={inputCls('notes')} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Batal</Button>
            <Button variant="primary" size="sm" className="flex-1" icon={Check}
              onClick={handleSave} disabled={saving}>
              {saving ? 'Menyimpan…' : host ? 'Simpan' : 'Tambah Host'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
