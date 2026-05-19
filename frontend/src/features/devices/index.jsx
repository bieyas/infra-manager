import React, { useState, useMemo } from 'react'
import { Loader2, WifiOff, AlertCircle, Activity } from 'lucide-react'
import Button from '../../components/ui/Button'
import DeviceCard from './DeviceCard'
import DeviceDetail from './DeviceDetail'
import DeviceToolbar from './DeviceToolbar'
import DeviceForm from './DeviceForm'
import { useDevices, createDevice, updateDevice, deleteDevice, syncUplinks } from './useDevices'
import { probeAll } from './useProbe'

export default function DevicesPage() {
  const [search,    setSearch]   = useState('')
  const [filter,    setFilter]   = useState('All')
  const [selected,  setSelected] = useState(null)
  const [formState,   setFormState]   = useState(null) // null | { mode: 'add' | 'edit', device? }
  const [saveError,   setSaveError]   = useState('')
  const [deleteId,    setDeleteId]    = useState(null)  // id being deleted (for loading state)
  const [confirmDel,  setConfirmDel]  = useState(null)  // device to confirm delete
  const [probing,     setProbing]     = useState(false)
  const [probeSum,    setProbeSum]    = useState(null)  // { online, offline, total }

  const { devices, loading, error, useMock, refetch } = useDevices()

  // Filter match: pill "Online" matches normalized status 'online' etc.
  const FILTER_MAP = { All: null, Online: 'online', Warning: 'warning', Offline: 'offline' }

  const filtered = useMemo(() => devices.filter(d => {
    const targetStatus = FILTER_MAP[filter]
    const matchStatus = !targetStatus || d.status === targetStatus
    const matchSearch = !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.ip.includes(search)
    return matchStatus && matchSearch
  }), [devices, search, filter])

  const stats = useMemo(() => ({
    online:  devices.filter(d => d.status === 'online').length,
    warning: devices.filter(d => d.status === 'warning').length,
    offline: devices.filter(d => d.status === 'offline').length,
    total:   devices.length,
  }), [devices])

  const handleProbeAll = async () => {
    setProbing(true)
    setProbeSum(null)
    try {
      const r = await probeAll()
      setProbeSum(r)
      await refetch()
    } catch (err) {
      setSaveError(err.message ?? 'Probe gagal')
    } finally {
      setProbing(false)
    }
  }

  const handleDelete = async (device) => {
    setConfirmDel(null)
    setDeleteId(device.id)
    try {
      await deleteDevice(device.id)
      if (selected?.id === device.id) setSelected(null)
      await refetch()
    } catch (err) {
      setSaveError(err.message ?? 'Gagal menghapus device')
    } finally {
      setDeleteId(null)
    }
  }

  const handleSave = async (formData, uplinks = []) => {
    setSaveError('')
    try {
      let saved
      if (formState.mode === 'add') {
        saved = await createDevice(formData)
      } else {
        saved = await updateDevice(formState.device.id, formData)
      }
      // Sync uplinks: delete removed, create new
      if (saved?.id && uplinks.length > 0) {
        await syncUplinks(saved.id, uplinks)
      }
      setFormState(null)
      await refetch()
      return saved
    } catch (err) {
      setSaveError(err.message ?? 'Gagal menyimpan device')
      return null
    }
  }

  return (
    <div className="p-3 md:p-4 space-y-3 animate-fade-in">
      {/* Mock data warning */}
      {useMock && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
          <WifiOff size={13} />
          <span>Menggunakan data mock — backend tidak terhubung</span>
        </div>
      )}

      {/* Probe summary */}
      {probeSum && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-xs">
          <Activity size={12} className="text-[var(--accent)]" />
          <span className="text-secondary">
            Probe selesai: <span className="text-emerald-400 font-medium">{probeSum.online} online</span>
            {' '}&bull;{' '}
            <span className="text-rose-400 font-medium">{probeSum.offline} offline</span>
            {' '}dari {probeSum.total} device
          </span>
          <button onClick={() => setProbeSum(null)} className="ml-auto text-muted hover:text-primary">×</button>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
          <AlertCircle size={13} />
          <span>{saveError}</span>
        </div>
      )}

      <DeviceToolbar
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilter={setFilter}
        stats={stats}
        onRefresh={refetch}
        onProbeAll={handleProbeAll}
        probing={probing}
        onAdd={() => { setSaveError(''); setFormState({ mode: 'add' }) }}
      />

      {loading ? (
        <div className="py-16 flex flex-col items-center gap-3 text-muted">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-sm">Memuat perangkat…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted text-sm">
          Tidak ada perangkat yang sesuai filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(device => (
            <DeviceCard
              key={device.id}
              device={device}
              onClick={() => setSelected(device)}
              onEdit={() => { setSaveError(''); setFormState({ mode: 'edit', device }) }}
              onDelete={() => setConfirmDel(device)}
              deleting={deleteId === device.id}
            />
          ))}
        </div>
      )}

      {selected && (
        <DeviceDetail
          device={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {formState && (
        <DeviceForm
          device={formState.device}
          onSave={handleSave}
          onClose={() => { setFormState(null); setSaveError('') }}
        />
      )}

      {/* ── Delete confirm dialog ── */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDel(null)} />
          <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 w-full max-w-sm shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10">
                <AlertCircle size={18} className="text-rose-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-primary">Hapus Device?</p>
                <p className="text-xs text-muted mt-1">
                  <span className="font-mono text-primary">{confirmDel.name}</span> ({confirmDel.ip}) akan dihapus permanen
                  beserta semua interface, alert, dan link topologi terkait.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDel(null)}>
                Batal
              </Button>
              <Button variant="danger" size="sm" className="flex-1" onClick={() => handleDelete(confirmDel)}>
                Ya, Hapus
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
