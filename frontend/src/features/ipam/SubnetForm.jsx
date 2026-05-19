import React, { useState, useMemo } from 'react'
import { X, Check, AlertCircle, Calculator } from 'lucide-react'
import Card, { CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import clsx from 'clsx'
import { parseCidr, cidrsOverlap } from '../../lib/ipcalc'

const EMPTY = { cidr: '', description: '', vlanId: '' }

export default function SubnetForm({ subnet, vlans = [], onSave, onClose, saving }) {
  const [form,   setForm]   = useState(
    subnet ? { cidr: subnet.cidr, description: subnet.description ?? '', vlanId: subnet.vlanId ?? '' }
           : EMPTY
  )
  const [errors, setErrors] = useState({})

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })) }

  // IP Calculator
  const calc = useMemo(() => parseCidr(form.cidr.trim()), [form.cidr])
  const existing = useMemo(() => (subnet ? [subnet] : []), [subnet])
  const conflict = useMemo(() => {
    if (!calc || subnet?.cidr === form.cidr.trim()) return null
    return existing.find(s => s.cidr !== form.cidr.trim() && cidrsOverlap(form.cidr.trim(), s.cidr))
  }, [calc, form.cidr, existing, subnet])

  const validate = () => {
    const e = {}
    if (!form.cidr.trim()) e.cidr = 'CIDR wajib diisi'
    else if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(form.cidr.trim())) e.cidr = 'Format tidak valid (contoh: 10.0.0.0/24)'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave({ cidr: form.cidr.trim(), description: form.description || null, vlanId: form.vlanId || null })
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
          <p className="text-sm font-semibold text-primary">{subnet ? 'Edit Subnet' : 'Tambah Subnet'}</p>
          <Button variant="ghost" size="xs" icon={X} onClick={onClose} />
        </div>
        <CardBody className="space-y-3 pt-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">CIDR *</label>
            <input value={form.cidr} onChange={e => set('cidr', e.target.value)}
              placeholder="10.0.0.0/24" disabled={!!subnet}
              className={clsx(inputCls('cidr'), 'font-mono', subnet && 'opacity-50 cursor-not-allowed')} />
            {errors.cidr && <p className="text-[10px] text-rose-400 flex items-center gap-1"><AlertCircle size={10}/>{errors.cidr}</p>}
          </div>

          {/* IP Calculator Result */}
          {calc && (
            <div className="bg-[var(--surface-2)] rounded-lg p-3 space-y-1.5 text-[11px]">
              <div className="flex items-center gap-1.5 text-muted">
                <Calculator size={11} className="accent-text" />
                <span className="font-medium">IP Calculator</span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono">
                <span className="text-muted">Network:</span>
                <span className="text-primary">{calc.networkStr}</span>
                <span className="text-muted">Broadcast:</span>
                <span className="text-primary">{calc.broadcastStr}</span>
                <span className="text-muted">Netmask:</span>
                <span className="text-primary">{calc.maskStr}</span>
                <span className="text-muted">Usable hosts:</span>
                <span className="text-emerald-400">{calc.usable.toLocaleString()}</span>
                {calc.firstUsable && (
                  <>
                    <span className="text-muted">Range:</span>
                    <span className="text-primary">{calc.rangeStr}</span>
                  </>
                )}
              </div>
              {conflict && (
                <p className="text-[10px] text-rose-400 flex items-center gap-1 pt-1 border-t border-[var(--border)]">
                  <AlertCircle size={10}/>
                  Konflik dengan subnet: {conflict.cidr}
                </p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Deskripsi</label>
            <input value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Nama / keterangan subnet" className={inputCls('description')} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">VLAN</label>
            <select value={form.vlanId} onChange={e => set('vlanId', e.target.value)} className={inputCls('vlanId')}>
              <option value="">— Tidak ada —</option>
              {vlans.map(v => (
                <option key={v.id} value={v.id}>VID {v.vid} — {v.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Batal</Button>
            <Button variant="primary" size="sm" className="flex-1" icon={Check}
              onClick={handleSave} disabled={saving || (conflict && !subnet)}>
              {saving ? 'Menyimpan…' : subnet ? 'Simpan' : 'Buat Subnet'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
