import React, { useState } from 'react'
import { X, Check, AlertCircle } from 'lucide-react'
import Card, { CardBody } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import clsx from 'clsx'
import { COLOR_OPTS, COLOR_CLASS } from './constants'

const EMPTY_FORM = { vid: '', name: '', description: '', color: 'neutral', status: 'ACTIVE' }

export default function VlanForm({ vlan, onSave, onClose, saving }) {
  const [form,   setForm]   = useState(
    vlan ? { vid: vlan.vid, name: vlan.name, description: vlan.description ?? '', color: vlan.color ?? 'neutral', status: vlan.status ?? 'ACTIVE' }
         : EMPTY_FORM
  )
  const [errors, setErrors] = useState({})

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const validate = () => {
    const e = {}
    if (!form.vid || isNaN(Number(form.vid)) || Number(form.vid) < 1 || Number(form.vid) > 4094)
      e.vid = 'VLAN ID harus 1–4094'
    if (!form.name.trim()) e.name = 'Nama wajib diisi'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave({ ...form, vid: Number(form.vid) })
  }

  const inputCls = (field) => clsx(
    'w-full bg-[var(--bg-secondary)] border rounded-lg text-sm text-primary px-3 py-2',
    'focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 transition-all',
    errors[field] ? 'border-rose-500' : 'border-[var(--border)]'
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <Card className="relative w-full md:max-w-md md:rounded-xl rounded-t-2xl rounded-b-none md:rounded-b-xl animate-slide-in">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border)]">
          <span className="text-sm font-semibold text-primary">
            {vlan ? 'Edit VLAN' : 'Tambah VLAN'}
          </span>
          <Button variant="ghost" size="xs" icon={X} onClick={onClose} />
        </div>

        <CardBody className="space-y-3 pt-3">
          <div className="grid grid-cols-2 gap-3">
            {/* VLAN ID */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">VLAN ID *</label>
              <input
                type="number" min="1" max="4094"
                value={form.vid}
                onChange={e => set('vid', e.target.value)}
                disabled={!!vlan}
                className={clsx(inputCls('vid'), vlan && 'opacity-50 cursor-not-allowed')}
              />
              {errors.vid && (
                <p className="text-[10px] text-rose-400 flex items-center gap-1">
                  <AlertCircle size={10} />{errors.vid}
                </p>
              )}
            </div>

            {/* Color tag */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-secondary">Color Tag</label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COLOR_OPTS.map(c => (
                  <button
                    key={c}
                    onClick={() => set('color', c)}
                    className={clsx(
                      'w-5 h-5 rounded-full border-2 transition-all',
                      COLOR_CLASS[c],
                      form.color === c ? 'border-[var(--accent)] scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Nama *</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="mis. Corporate LAN"
              className={inputCls('name')}
            />
            {errors.name && (
              <p className="text-[10px] text-rose-400 flex items-center gap-1">
                <AlertCircle size={10} />{errors.name}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Deskripsi</label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Opsional"
              className={inputCls('description')}
            />
          </div>

          {/* Status */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-secondary">Status</label>
            <div className="flex gap-2">
              {['ACTIVE', 'INACTIVE'].map(s => (
                <button key={s} onClick={() => set('status', s)}
                  className={clsx(
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                    form.status === s
                      ? s === 'ACTIVE'
                        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                        : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                      : 'border-[var(--border)] text-muted hover:text-primary'
                  )}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Batal</Button>
            <Button variant="primary" size="sm" className="flex-1" icon={Check}
              onClick={handleSave} disabled={saving}>
              {saving ? 'Menyimpan…' : vlan ? 'Simpan' : 'Buat VLAN'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
