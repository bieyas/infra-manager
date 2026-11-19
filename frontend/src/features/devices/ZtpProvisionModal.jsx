import React, { useState, useMemo, useEffect } from 'react'
import {
  Zap, Loader2, CheckCircle2, AlertCircle, Search, User,
  MapPin, Shield, Radio, X, Copy, Check
} from 'lucide-react'
import Button from '../../components/ui/Button'
import Badge from '../../components/ui/Badge'
import { api } from '../../lib/api'

export default function ZtpProvisionModal({
  deviceId,
  onu,
  unassignedCustomers = [],
  odps = [],
  onClose,
  onSuccess,
}) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    onu.suggestedCustomer?.id || onu.matchedCustomer?.id || ''
  )
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedOdpId, setSelectedOdpId] = useState(
    onu.matchedCustomer?.odp?.id || onu.matchedCustomer?.odpId || ''
  )
  const [odpPort, setOdpPort] = useState(
    onu.matchedCustomer?.odpPort || ''
  )
  const [splitterPortId, setSplitterPortId] = useState(
    onu.matchedCustomer?.splitterPortId || ''
  )
  const [selectedOdpDetail, setSelectedOdpDetail] = useState(null)
  const [loadingOdpDetail, setLoadingOdpDetail] = useState(false)

  const [srvProfileId, setSrvProfileId] = useState(609)
  const [description, setDescription] = useState(
    onu.name && onu.name !== 'N/A'
      ? onu.name
      : onu.suggestedCustomer?.name
        ? onu.suggestedCustomer.name.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 24)
        : ''
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  // Fetch detail ODP saat dipilih untuk membaca port terpakai vs kosong
  useEffect(() => {
    if (!selectedOdpId) {
      setSelectedOdpDetail(null)
      return
    }
    let cancelled = false
    setLoadingOdpDetail(true)
    api.get(`/odp/${selectedOdpId}`)
      .then(d => {
        if (!cancelled) setSelectedOdpDetail(d)
      })
      .catch(() => {
        if (!cancelled) setSelectedOdpDetail(null)
      })
      .finally(() => {
        if (!cancelled) setLoadingOdpDetail(false)
      })
    return () => { cancelled = true }
  }, [selectedOdpId])

  // Filtered customer list for autocomplete
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return unassignedCustomers.slice(0, 30)
    const q = customerSearch.toLowerCase()
    return unassignedCustomers.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.pppoeUsername && c.pppoeUsername.toLowerCase().includes(q)) ||
      (c.customerId && c.customerId.toLowerCase().includes(q))
    ).slice(0, 30)
  }, [unassignedCustomers, customerSearch])

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return unassignedCustomers.find(c => c.id === selectedCustomerId) || onu.matchedCustomer
  }, [unassignedCustomers, selectedCustomerId, onu.matchedCustomer])

  const handleSelectCustomer = (c) => {
    setSelectedCustomerId(c.id)
    const clean = (c.name || c.pppoeUsername || '')
      .replace(/[^a-zA-Z0-9_\-]/g, '')
      .slice(0, 24)
    setDescription(clean)
    if (c.odpId) {
      setSelectedOdpId(c.odpId)
      if (c.odpPort) setOdpPort(c.odpPort)
      if (c.splitterPortId) setSplitterPortId(c.splitterPortId)
    }
  }

  const handleCopyMac = () => {
    if (onu.mac) {
      navigator.clipboard.writeText(onu.mac)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handlePortSelect = (port, splitter) => {
    setOdpPort(port.portNumber)
    setSplitterPortId(port.id || `${splitter.id}:${port.portNumber}`)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const payload = {
        ponPort: onu.port,
        onuId: onu.onuId,
        mac: onu.mac,
        description: description.trim() || undefined,
        srvProfileId: Number(srvProfileId) || 609,
        customerId: selectedCustomerId || undefined,
        odpId: selectedOdpId || undefined,
        odpPort: odpPort ? Number(odpPort) : undefined,
        splitterPortId: splitterPortId || undefined,
      }

      const res = await api.post(`/driver/${deviceId}/olt/provision`, payload)
      if (onSuccess) onSuccess(res)
      onClose()
    } catch (err) {
      setError(err.message || 'Gagal melakukan provisioning ONU')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative bg-[var(--bg-card)] border border-[var(--border)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center font-bold">
              <Zap size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary">Aktivasi ZTP · One-Click Provisioning</h3>
              <p className="text-[11px] text-muted">Registrasi ONU ke OLT & Mapping ke Data Pelanggan</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary transition-colors p-1 rounded-lg hover:bg-[var(--surface)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* ONU Hardware Info Card */}
        <div className="px-5 py-3 bg-[var(--surface)] border-b border-[var(--border)] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="space-y-0.5">
            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Port & ONU ID</span>
            <div className="font-mono font-bold text-primary flex items-center gap-1.5">
              <Radio size={13} className="text-[var(--accent)]" />
              <span>{onu.port}:{onu.onuId}</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">MAC Address / SN</span>
            <div className="flex items-center gap-1 font-mono font-bold text-primary">
              <span>{onu.mac || '—'}</span>
              <button
                type="button"
                onClick={handleCopyMac}
                className="text-muted hover:text-primary p-0.5 rounded transition-colors"
                title="Salin MAC"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          <div className="space-y-0.5">
            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Status OLT</span>
            <div>
              <Badge variant="warning" size="xs">Autofind (Unprovisioned)</Badge>
            </div>
          </div>
        </div>

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Customer Selection Section */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-primary flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <User size={13} className="text-[var(--accent)]" />
                Tautkan ke Pelanggan
              </span>
              {selectedCustomer && (
                <span className="text-[10px] text-muted">
                  ID: <span className="font-mono text-primary">{selectedCustomer.customerId || selectedCustomer.id}</span>
                </span>
              )}
            </label>

            {/* Quick search input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-muted" />
              <input
                type="text"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Cari nama pelanggan atau username PPPoE..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)]"
              />
            </div>

            {/* Suggestions list */}
            <div className="max-h-32 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]/40 text-xs">
              {filteredCustomers.length === 0 ? (
                <div className="p-3 text-center text-muted text-[11px]">
                  Tidak ada pelanggan yang cocok
                </div>
              ) : (
                filteredCustomers.map(c => {
                  const isSelected = selectedCustomerId === c.id
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectCustomer(c)}
                      className={`w-full px-3 py-2 text-left flex items-center justify-between hover:bg-[var(--accent-glow)] transition-colors ${
                        isSelected ? 'bg-[var(--accent)]/15 border-l-2 border-[var(--accent)]' : ''
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className={`font-medium truncate ${isSelected ? 'text-[var(--accent)] font-semibold' : 'text-primary'}`}>
                          {c.name || c.pppoeUsername}
                        </p>
                        <p className="text-[10px] text-muted truncate">
                          PPPoE: <span className="font-mono">{c.pppoeUsername}</span>
                          {c.packageName ? ` · ${c.packageName}` : ''}
                        </p>
                      </div>
                      {isSelected ? (
                        <CheckCircle2 size={15} className="text-[var(--accent)] shrink-0" />
                      ) : (
                        <span className="text-[10px] text-muted font-mono">{c.customerId || ''}</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* ODP Distribution Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <MapPin size={13} className="text-amber-400" />
                ODP Distribusi & Port Splitter
              </label>
              {loadingOdpDetail && (
                <span className="text-[10px] text-muted flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Memuat port...
                </span>
              )}
            </div>

            <select
              value={selectedOdpId}
              onChange={e => {
                setSelectedOdpId(e.target.value)
                setOdpPort('')
                setSplitterPortId('')
              }}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-primary focus:outline-none focus:border-[var(--accent)]"
            >
              <option value="">— Belum ditautkan ke ODP —</option>
              {odps.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name} {o.ponPort ? `(${o.ponPort})` : ''} · {o.usedPorts ?? 0} terpakai
                </option>
              ))}
            </select>

            {/* Port Picker Visual saat ODP dipilih */}
            {selectedOdpDetail && (
              <div className="p-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)]/60 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-medium text-primary">Pilih Port Splitter Tersedia:</span>
                  <span className="text-[10px] text-muted">
                    {odpPort ? `Terpilih: Port ${odpPort}` : 'Belum memilih port'}
                  </span>
                </div>

                {selectedOdpDetail.splitters && selectedOdpDetail.splitters.length > 0 ? (
                  selectedOdpDetail.splitters.map(splitter => {
                    const sName = splitter.name || splitter.type?.name || splitter.splitterType?.name || `Slot ${splitter.slotNumber || 1}`
                    const ports = splitter.ports || []

                    return (
                      <div key={splitter.id} className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] text-muted">
                          <span className="font-semibold text-secondary">{sName}</span>
                          <span>{splitter.ratio || splitter.splitterType?.ratio || ''}</span>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                          {ports.map(p => {
                            const isPass = p.portType === 'PASS_THROUGH'
                            const isSplitterUplink = p.connectedToType === 'SPLITTER'
                            const isChildOdp = p.connectionStatus === 'CONNECTED' && p.connectedToType === 'ODP'
                            const isCustomer = p.connectionStatus === 'CONNECTED' && p.connectedToType === 'CUSTOMER'
                            const isCurrentSelected = (splitterPortId && splitterPortId === p.id) || (odpPort === p.portNumber)
                            const isOccupied = isPass || isSplitterUplink || isChildOdp || isCustomer

                            let occupantName = ''
                            if (isSplitterUplink) {
                              occupantName = 'Feeder Internal ke Slot B'
                            } else if (isCustomer) {
                              const cust = selectedOdpDetail.customers?.find(c => c.id === p.connectedToId || c.splitterPortId === p.id)
                              occupantName = cust?.name || 'Pelanggan'
                            } else if (isChildOdp) {
                              const child = selectedOdpDetail.downlinkOdps?.find(d => d.id === p.connectedToId)
                              occupantName = child?.name ? `Feeder ${child.name}` : 'Feeder ODP'
                            }

                            return (
                              <button
                                key={p.id || p.portNumber}
                                type="button"
                                disabled={isOccupied}
                                onClick={() => handlePortSelect(p, splitter)}
                                title={
                                  isSplitterUplink
                                    ? 'Port 1 (Drop) — Feeder internal ke Slot B (tidak untuk pelanggan)'
                                    : isOccupied 
                                    ? `Terpakai: ${occupantName || 'Terkoneksi'}` 
                                    : `Port ${p.portNumber} (Kosong)`
                                }
                                className={`
                                  py-1.5 px-1 rounded text-center text-[10px] font-mono font-medium transition-all border relative
                                  ${isCurrentSelected
                                    ? 'bg-[var(--accent)] text-white border-[var(--accent)] ring-2 ring-[var(--accent)]/30 font-bold scale-105'
                                    : isOccupied
                                      ? isSplitterUplink
                                        ? 'bg-sky-500/10 text-sky-400/50 border-sky-500/20 cursor-not-allowed opacity-75'
                                        : isPass
                                        ? 'bg-purple-900/20 text-purple-400/60 border-purple-800/30 cursor-not-allowed opacity-60'
                                        : isChildOdp
                                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20 cursor-not-allowed opacity-75'
                                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20 cursor-not-allowed opacity-75'
                                      : 'bg-[var(--bg-card)] text-secondary border-[var(--border)] hover:border-[var(--accent)] hover:text-primary hover:bg-[var(--accent-glow)]'
                                  }
                                `}
                              >
                                <span>{p.portNumber}</span>
                                {isSplitterUplink && <span className="block text-[6.5px] leading-none text-sky-300">SPLICE</span>}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  /* Fallback mode port jika ODP lama belum memiliki relasi splitters */
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
                    {Array.from({ length: selectedOdpDetail.capacity || 8 }).map((_, idx) => {
                      const pNum = idx + 1
                      const isOccupied = (selectedOdpDetail.customers || []).some(c => c.odpPort === pNum)
                      const isCurrentSelected = odpPort === pNum

                      return (
                        <button
                          key={pNum}
                          type="button"
                          disabled={isOccupied}
                          onClick={() => {
                            setOdpPort(pNum)
                            setSplitterPortId('')
                          }}
                          className={`
                            py-1.5 px-1 rounded text-center text-[10px] font-mono font-medium transition-all border
                            ${isCurrentSelected
                              ? 'bg-[var(--accent)] text-white border-[var(--accent)] font-bold'
                              : isOccupied
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 cursor-not-allowed opacity-75'
                                : 'bg-[var(--bg-card)] text-secondary border-[var(--border)] hover:border-[var(--accent)] hover:text-primary'
                            }
                          `}
                        >
                          {pNum}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* OLT Description & Service Profile */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-primary">
                Deskripsi OLT (Nama)
              </label>
              <input
                type="text"
                maxLength="30"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Misal: Rini / AanKhumaidi"
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-primary font-mono focus:outline-none focus:border-[var(--accent)]"
              />
              <p className="text-[9px] text-muted">Akan disimpan di running-config OLT</p>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-primary flex items-center gap-1">
                <Shield size={12} className="text-indigo-400" />
                Service Profile
              </label>
              <select
                value={srvProfileId}
                onChange={e => setSrvProfileId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] text-xs text-primary focus:outline-none focus:border-[var(--accent)]"
              >
                <option value="609">609 (XSF609-Joss - Default)</option>
                <option value="610">610 (TESTJOGOROTO)</option>
                <option value="611">611 (PELANGGAN-TEST)</option>
                <option value="800">800 (JGRT-CUST-800)</option>
              </select>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-2 border-t border-[var(--border)] shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              Batal
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              icon={loading ? Loader2 : Zap}
              disabled={loading}
              className={loading ? 'opacity-70' : 'bg-[var(--accent)] text-white'}
            >
              {loading ? 'Mengaktivasi di OLT...' : '⚡ Konfirmasi & Aktivasi ZTP'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
