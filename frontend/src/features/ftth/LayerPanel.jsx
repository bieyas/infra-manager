import React from 'react'
import { Search, Plus, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { LAYER_TYPES, MARKER_CFG } from './constants'

// ── Sub-komponen reusable ────────────────────────────────────────────────────

function SectionHeader({ color, label }) {
  return (
    <p className="flex items-center gap-2 text-[11px] font-semibold text-muted uppercase tracking-widest mb-2">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      {label}
    </p>
  )
}

function LayerToggle({ lt, active, onToggle, count }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onToggle(lt.id) }}
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      className={clsx(
      'w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-all text-left',
      active
        ? 'bg-[var(--accent-glow)]/40 text-primary'
        : 'text-secondary hover:bg-[var(--accent-glow)]/20'
      )}
    >
      {/* Color dot + toggle track */}
      <div className="relative shrink-0 w-8 h-4 rounded-full transition-all duration-200"
      style={{ background: active ? lt.color : 'var(--border)' }}>
      <span
        className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-all duration-200"
        style={{ left: active ? '17px' : '2px' }}
      />
      </div>

      <span className="text-[12px] leading-none flex-1 truncate">{lt.label}</span>

      {count != null && (
      <span className={clsx(
        'text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0 leading-none',
        active
          ? 'bg-[var(--accent-glow)] text-primary'
          : 'bg-[var(--bg-secondary)] text-muted'
      )}>
        {count}
      </span>
      )}
    </button>
  )
}

function Divider() {
  return <div className="border-t border-[var(--border)] my-3" />
}

// ── Custom mini-toggle (lebih reliable dari native checkbox di panel kecil) ──
function MiniToggle({ checked, onChange, color = '#06b6d4', label }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-all text-left hover:bg-[var(--accent-glow)]/20"
    >
      <div
        className="relative shrink-0 w-7 h-3.5 rounded-full transition-all duration-200"
        style={{ background: checked ? color : 'var(--border)' }}
      >
        <span
          className="absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow-sm transition-all duration-200"
          style={{ left: checked ? '15px' : '2px' }}
        />
      </div>
      <span className={clsx('text-[11px] leading-none', checked ? 'text-primary' : 'text-muted')}>
        {label}
      </span>
    </button>
  )
}

// ── Slider row dengan label + nilai live ─────────────────────────────────────
function RadiusSlider({ label, value, min, max, step, color, onChange, unit = 'm' }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-secondary font-medium">{label}</span>
        <span
          className="text-[11px] font-mono px-1.5 py-0.5 rounded leading-none"
          style={{ background: `${color}20`, color }}
        >
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => { e.stopPropagation(); onChange(Number(e.target.value)) }}
        onClick={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchMove={e => e.stopPropagation()}
        className="w-full cursor-pointer"
        style={{
          accentColor: color,
          height: '4px',
          WebkitAppearance: 'none',
          appearance: 'none',
          background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, var(--border) ${pct}%, var(--border) 100%)`,
          borderRadius: '9999px',
          outline: 'none',
        }}
      />
      <div className="flex justify-between">
        <span className="text-[9px] text-muted">{min} {unit}</span>
        <span className="text-[9px] text-muted">{max} {unit}</span>
      </div>
    </div>
  )
}

// ── Panel sub-opsi Coverage — komponen terisolasi ────────────────────────────
function CoverageOptions({ options, onChange }) {
  const set = (key, val) => onChange({ ...options, [key]: val })

  return (
    <div
      className="mt-2 mx-0.5 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/60"
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
      onClick={e => e.stopPropagation()}
    >
      {/* Sliders */}
      <div className="p-3 space-y-4">
        <RadiusSlider
          label="Radius ODC"
          value={options.odcRadius}
          min={50} max={1000} step={50}
          color="#06b6d4"
          onChange={val => set('odcRadius', val)}
        />
        <RadiusSlider
          label="Radius ODP"
          value={options.odpRadius}
          min={25} max={500} step={25}
          color="#8b5cf6"
          onChange={val => set('odpRadius', val)}
        />
      </div>

      {/* Opacity slider */}
      <div className="px-3 pb-3">
        <RadiusSlider
          label="Transparansi"
          value={Math.round(options.opacity * 100)}
          min={5} max={60} step={5}
          unit="%"
          color="#6b7280"
          onChange={val => set('opacity', val / 100)}
        />
      </div>

      {/* Toggle options */}
      <div className="border-t border-[var(--border)] py-1">
        <MiniToggle
          checked={!!options.showOdp}
          onChange={val => set('showOdp', val)}
          color="#8b5cf6"
          label="Sertakan coverage ODP"
        />
        <MiniToggle
          checked={!!options.mergeOverlapping}
          onChange={val => set('mergeOverlapping', val)}
          color="#06b6d4"
          label="Gabung area yang overlap"
        />
        <MiniToggle
          checked={!!options.colorByUtilization}
          onChange={val => set('colorByUtilization', val)}
          color="#10b981"
          label="Warna berdasar utilisasi"
        />
      </div>

    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function LayerPanel({
  nodes,
  layers,
  onToggle,
  search,
  onSearch,
  onAdd,
  onSelectResult,
  filterStatus,
  onFilterStatus,
  filterUtil,
  onFilterUtil,
  coverageOptions,
  onCoverageChange,
}) {
  const searchResults = search
    ? nodes.filter(n =>
      n.name.toLowerCase().includes(search.toLowerCase()) ||
      n.id.toLowerCase().includes(search.toLowerCase()) ||
      (n.address || '').toLowerCase().includes(search.toLowerCase())
      ).slice(0, 8)
    : []

  const countOf = (type) => nodes.filter(n => n.type === type).length

  return (
    <div className="p-3 space-y-1 pb-4">

      {/* ── Search ── */}
      <div className="relative mb-3">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Cari ID, nama, alamat…"
          className="w-full pl-8 pr-3 py-2 text-[12px] rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-primary placeholder:text-muted focus:outline-none focus:border-[var(--accent)] transition-colors"
        />
      </div>

      {/* ── Search results ── */}
      {searchResults.length > 0 && (
        <div className="rounded-lg border border-[var(--border)] overflow-hidden mb-3">
          {searchResults.map((n, i) => (
            <button
              key={n.id}
              onClick={() => onSelectResult(n)}
              className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[var(--accent-glow)] transition-colors text-left',
                i > 0 && 'border-t border-[var(--border)]'
              )}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: MARKER_CFG[n.type]?.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-primary truncate leading-tight">{n.name}</p>
                <p className="text-[10px] text-muted truncate leading-tight mt-0.5">{n.address || '—'}</p>
              </div>
              <span className="text-[10px] uppercase font-medium px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-muted shrink-0">
                {n.type}
              </span>
              <ChevronRight size={12} className="text-muted shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* ── Filter ── */}
      {(onFilterStatus || onFilterUtil) && (
        <>
          <SectionHeader color="#6b7280" label="Filter" />
          <div className="flex gap-2 mb-1">
            {onFilterStatus && (
              <select
                value={filterStatus || 'all'}
                onChange={e => onFilterStatus(e.target.value)}
                className="flex-1 text-[11px] px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-primary focus:outline-none focus:border-[var(--accent)] transition-colors"
              >
                <option value="all">Semua Status</option>
                <option value="active">Aktif</option>
                <option value="inactive">Non-aktif</option>
                <option value="maintenance">Maintenance</option>
              </select>
            )}
            {onFilterUtil && (
              <select
                value={filterUtil || 'all'}
                onChange={e => onFilterUtil(e.target.value)}
                className="flex-1 text-[11px] px-2 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-primary focus:outline-none focus:border-[var(--accent)] transition-colors"
              >
                <option value="all">Utilisasi</option>
                <option value="high">Tinggi (&gt;80%)</option>
                <option value="medium">Sedang (50–80%)</option>
                <option value="low">Rendah (&lt;50%)</option>
              </select>
            )}
          </div>
          <Divider />
        </>
      )}

      {/* ── Core Network ── */}
      <SectionHeader color="#3b82f6" label="Core Network" />
      <div className="space-y-0.5 mb-1">
        {LAYER_TYPES.filter(lt => lt.category === 'core').map(lt => (
          <LayerToggle key={lt.id} lt={lt} active={!!layers[lt.id]} onToggle={onToggle} count={countOf(lt.id)} />
        ))}
      </div>

      <Divider />

      {/* ── Distribusi ── */}
      <SectionHeader color="#06b6d4" label="Distribusi" />
      <div className="space-y-0.5 mb-1">
        {LAYER_TYPES.filter(lt => lt.category === 'distribution').map(lt => (
          <LayerToggle key={lt.id} lt={lt} active={!!layers[lt.id]} onToggle={onToggle} count={countOf(lt.id)} />
        ))}
      </div>

      <Divider />

      {/* ── Akses Pelanggan ── */}
      <SectionHeader color="#8b5cf6" label="Akses Pelanggan" />
      <div className="space-y-0.5 mb-1">
        {LAYER_TYPES.filter(lt => lt.category === 'access').map(lt => (
          <LayerToggle key={lt.id} lt={lt} active={!!layers[lt.id]} onToggle={onToggle} count={countOf(lt.id)} />
        ))}
      </div>

      <Divider />

      {/* ── Koneksi ── */}
      <SectionHeader color="#6b7280" label="Koneksi" />
      <div className="space-y-0.5 mb-1">
        {LAYER_TYPES.filter(lt => lt.category === 'connections' || !lt.category).map(lt => (
          <LayerToggle key={lt.id} lt={lt} active={!!layers[lt.id]} onToggle={onToggle} count={null} />
        ))}
      </div>

      <Divider />

      {/* ── Area Coverage ── */}
      <SectionHeader color="#06b6d4" label="Area Coverage" />
      <div className="space-y-0.5">
        {LAYER_TYPES.filter(lt => lt.category === 'coverage').map(lt => (
          <LayerToggle key={lt.id} lt={lt} active={!!layers[lt.id]} onToggle={onToggle} count={null} />
        ))}
      </div>

      {/* Coverage sub-options — hanya tampil saat aktif */}
      {layers.coverage && coverageOptions && onCoverageChange && (
        <CoverageOptions options={coverageOptions} onChange={onCoverageChange} />
      )}

      {/* ── Add button ── */}
      {/* <div className="pt-4 space-y-2">
        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-[var(--accent)] text-white text-[12px] font-medium hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <Plus size={13} />
          Tambah Entitas Baru
        </button>
        <p className="text-[10px] text-muted text-center leading-relaxed">
          atau klik-kanan di peta untuk<br />tambah di lokasi tertentu
        </p>
      </div> */}

      </div>
  )
}
