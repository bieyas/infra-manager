import React, { memo } from 'react'
import { Loader2, RefreshCw, Zap } from 'lucide-react'
import { useOltPonPower } from './useDriverSnapshot'

// "1/1/1" → "PON-1"
function ponLabel(port) {
  if (!port) return port
  const m = String(port).match(/(\d+)\/(\d+)\/(\d+)/)
  return m ? `PON-${Number(m[3])}` : port
}

function fmtDbm(v) {
  if (v === null || v === undefined) return '—'
  return `${v.toFixed(2)} dBm`
}

function txColor(dbm) {
  if (dbm === null || dbm === undefined) return 'text-muted'
  if (dbm >= 3) return 'text-emerald-400'
  if (dbm >= 1) return 'text-sky-400'
  if (dbm >= 0) return 'text-amber-400'
  return 'text-rose-400'
}

function txBg(dbm) {
  if (dbm === null || dbm === undefined) return ''
  if (dbm >= 3) return 'bg-emerald-500/5'
  if (dbm >= 1) return 'bg-sky-500/5'
  if (dbm >= 0) return 'bg-amber-500/5'
  return 'bg-rose-500/5'
}

function OltPowerTab({ deviceId, ponPorts }) {
  const { data, loading, error, fetchedAt, fetch: loadPower } = useOltPonPower(deviceId, 'all')

  const ports = data?.ports ?? []

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Zap size={12} className="text-amber-400" />
          <span className="font-medium text-primary">SFP Tx Power per PON</span>
        </div>
        <button
          onClick={loadPower}
          disabled={loading}
          className="flex items-center gap-1 text-[10px] text-muted hover:text-primary transition-colors disabled:opacity-40"
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          {!loading && <span>Refresh</span>}
        </button>
      </div>

      <p className="text-[10px] text-muted">
        Transmit Power (dBm) dari SFP transceiver pada setiap port PON OLT.
        Nilai ini digunakan sebagai power input pada ODC.
      </p>

      {/* Content */}
      {loading && ports.length === 0 ? (
        <div className="py-10 flex flex-col items-center gap-2 text-muted">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-xs">Mengambil SFP power dari OLT…</span>
          <span className="text-[10px] opacity-60">Membaca masing-masing port PON secara berurutan</span>
        </div>
      ) : error ? (
        <div className="py-6 text-center text-rose-400 text-xs">{error}</div>
      ) : ports.length === 0 ? (
        <div className="py-10 text-center">
          <button
            onClick={loadPower}
            className="px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Load SFP Power
          </button>
          <p className="text-[10px] text-muted mt-2">Ambil Tx Power dari setiap PON port</p>
        </div>
      ) : (
        <>
          {/* PON Power table */}
          <div className="border border-[var(--border)] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-3 py-1.5 bg-[var(--surface-2)] border-b border-[var(--border)] text-[9px] text-muted uppercase tracking-wider">
              <span>PON Port</span>
              <span className="text-right min-w-[90px]">Tx Power (dBm)</span>
              <span className="text-right min-w-[70px]">Status</span>
            </div>
            <div className="divide-y divide-[var(--border)]/30">
              {ports.map(p => {
                const pon = ponPorts?.find(pp => pp.port === p.ponPort)
                return (
                  <div
                    key={p.ponPort}
                    className={`grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-3 py-2 transition-colors ${txBg(p.txPower)}`}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono font-medium text-primary">
                        {ponLabel(p.ponPort)}
                      </p>
                      {pon && (
                        <p className="text-[10px] text-muted">
                          {pon.onlineOnu}/{pon.totalOnu} ONU
                        </p>
                      )}
                    </div>
                    <p className={`text-sm font-bold font-mono text-right min-w-[90px] ${txColor(p.txPower)}`}>
                      {fmtDbm(p.txPower)}
                    </p>
                    <p className="text-[10px] text-right min-w-[70px]">
                      {p.txPower != null ? (
                        <span className={`px-2 py-0.5 rounded-full ${
                          p.txPower >= 3 ? 'bg-emerald-500/10 text-emerald-400'
                            : p.txPower >= 1 ? 'bg-sky-500/10 text-sky-400'
                            : p.txPower >= 0 ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-rose-500/10 text-rose-400'
                        }`}>
                          {p.txPower >= 3 ? 'Normal' : p.txPower >= 1 ? 'OK' : p.txPower >= 0 ? 'Low' : 'Critical'}
                        </span>
                      ) : (
                        <span className="text-muted">N/A</span>
                      )}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {fetchedAt && (
            <p className="text-[9px] text-muted text-right">
              Data: {fetchedAt.toLocaleTimeString('id-ID')}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default memo(OltPowerTab)
