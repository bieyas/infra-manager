import React, { useMemo, useState } from 'react'
import { Polyline, Polygon, Tooltip } from 'react-leaflet'
import clsx from 'clsx'
import { buildCables, CABLE_TYPES, generateCablePolygon, generateCurvedCable } from './mapUtils'
import { Settings2, Eye, EyeOff } from 'lucide-react'

/**
 * Cable display modes
 */
export const CABLE_DISPLAY_MODES = {
  simple: 'simple',       // Basic polylines
  styled: 'styled',       // Styled polylines with different dash patterns
  curved: 'curved',       // Curved polylines
  polygon: 'polygon',     // Polygon cables (customizable width)
}

/**
 * Default cable style options
 */
export const DEFAULT_CABLE_OPTIONS = {
  mode: CABLE_DISPLAY_MODES.styled,
  showLabels: false,
  curvedAmount: 0.2,
  polygonWidth: {
    feeder: 4,        // meters
    distribution: 2,
    drop: 1,
    aerial: 3,
    underground: 2,
    planned: 2,
  },
  opacity: 0.85,
  visibleTypes: Object.keys(CABLE_TYPES).reduce((acc, type) => {
    acc[type] = true
    return acc
  }, {}),
}

/**
 * Individual cable segment component
 */
function CableSegment({ cable, mode, options, selected, onClick }) {
  const { from, to, style, type, isCascade } = cable
  const { curvedAmount, polygonWidth, showLabels } = options
  
  const isSelected = selected === cable.key
  
  // Generate positions based on display mode
  const positions = useMemo(() => {
    switch (mode) {
      case CABLE_DISPLAY_MODES.curved:
        return generateCurvedCable(from, to, curvedAmount)
      case CABLE_DISPLAY_MODES.simple:
      case CABLE_DISPLAY_MODES.styled:
      default:
        return [from, to]
    }
  }, [from, to, mode, curvedAmount])
  
  // Polygon mode - render as filled polygon
  if (mode === CABLE_DISPLAY_MODES.polygon) {
    const width = polygonWidth[type] || 2
    const polygonCoords = generateCablePolygon(from, to, width)
    
    return (
      <Polygon
        positions={polygonCoords}
        pathOptions={{
          fillColor: style.color,
          fillOpacity: options.opacity,
          color: isSelected ? '#ffffff' : style.color,
          weight: isSelected ? 2 : 1,
          stroke: true,
        }}
        eventHandlers={{
          click: () => onClick?.(cable),
        }}
      >
        {showLabels && (
          <Tooltip direction="center" permanent={false}>
            <span className="text-xs font-medium">{style.label}</span>
            {isCascade && <span className="text-xs text-gray-500 ml-1">(Cascade)</span>}
          </Tooltip>
        )}
      </Polygon>
    )
  }
  
  // Polyline mode (simple, styled, curved)
  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: isSelected ? '#ffffff' : style.color,
        weight: isSelected ? style.weight + 2 : style.weight,
        opacity: options.opacity,
        dashArray: mode === CABLE_DISPLAY_MODES.simple ? null : style.dashArray,
        lineCap: style.lineCap,
        lineJoin: 'round',
      }}
      eventHandlers={{
        click: () => onClick?.(cable),
      }}
    >
      {showLabels && (
        <Tooltip direction="center" permanent={false}>
          <span className="text-xs font-medium">{style.label}</span>
          {isCascade && <span className="text-xs text-gray-500 ml-1">(Cascade)</span>}
        </Tooltip>
      )}
    </Polyline>
  )
}

/**
 * Cable Layer - renders all cable connections
 */
export function CableLayer({ nodes, options = DEFAULT_CABLE_OPTIONS, selectedCable, onCableClick }) {
  const cables = useMemo(() => buildCables(nodes), [nodes])
  
  const visibleCables = useMemo(() => {
    return cables.filter(cable => options.visibleTypes[cable.type] !== false)
  }, [cables, options.visibleTypes])
  
  return (
    <>
      {visibleCables.map(cable => (
        <CableSegment
          key={cable.key}
          cable={cable}
          mode={options.mode}
          options={options}
          selected={selectedCable}
          onClick={onCableClick}
        />
      ))}
    </>
  )
}

/**
 * Cable Legend component - shows active cable types and their styles
 */
export function CableLegend({ options, onToggleType }) {
  const activeTypes = useMemo(() => {
    return Object.entries(CABLE_TYPES).filter(([type]) => 
      options.visibleTypes[type] !== false
    )
  }, [options.visibleTypes])
  
  return (
    <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 dark:border-slate-700 p-3 space-y-2">
      <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
        Tipe Kabel
      </h4>
      <div className="space-y-1.5">
        {activeTypes.map(([type, style]) => (
          <button
            key={type}
            onClick={() => onToggleType?.(type)}
            className="flex items-center gap-2 w-full text-left hover:bg-gray-100 dark:hover:bg-slate-700 rounded px-1.5 py-1 transition-colors"
          >
            {/* Line preview */}
            <svg width="24" height="12" className="shrink-0">
              <line
                x1="2" y1="6" x2="22" y2="6"
                stroke={style.color}
                strokeWidth={style.weight}
                strokeDasharray={options.mode !== CABLE_DISPLAY_MODES.simple ? style.dashArray : null}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs text-gray-700 dark:text-gray-300">{style.label}</span>
            {options.visibleTypes[type] === false ? (
              <EyeOff size={12} className="text-gray-400 ml-auto" />
            ) : (
              <Eye size={12} className="text-gray-600 ml-auto" />
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Cable Settings Panel - controls for cable display mode and options
 */
export function CableSettingsPanel({ options, onChange, className }) {
  const [isOpen, setIsOpen] = useState(false)
  
  const handleModeChange = (mode) => {
    onChange?.({ ...options, mode })
  }
  
  const handleToggleLabels = () => {
    onChange?.({ ...options, showLabels: !options.showLabels })
  }
  
  const handleOpacityChange = (opacity) => {
    onChange?.({ ...options, opacity })
  }
  
  return (
    <div className={clsx('bg-white/95 dark:bg-slate-800/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 dark:border-slate-700', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
      >
        <Settings2 size={16} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Pengaturan Kabel</span>
      </button>
      
      {isOpen && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-gray-100 dark:border-slate-700">
          {/* Display Mode */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Mode Tampilan</label>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(CABLE_DISPLAY_MODES).map(([key, value]) => (
                <button
                  key={key}
                  onClick={() => handleModeChange(value)}
                  className={clsx(
                    'px-2 py-1.5 text-xs rounded transition-colors',
                    options.mode === value
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                  )}
                >
                  {key === 'simple' && 'Sederhana'}
                  {key === 'styled' && 'Bertingkat'}
                  {key === 'curved' && 'Melingkar'}
                  {key === 'polygon' && 'Poligon'}
                </button>
              ))}
            </div>
          </div>
          
          {/* Opacity Slider */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
              Transparansi: {Math.round(options.opacity * 100)}%
            </label>
            <input
              type="range"
              min="0.2"
              max="1"
              step="0.1"
              value={options.opacity}
              onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>
          
          {/* Toggle Labels */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.showLabels}
              onChange={handleToggleLabels}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span className="text-xs text-gray-700 dark:text-gray-300">Tampilkan Label</span>
          </label>
        </div>
      )}
    </div>
  )
}

export default CableLayer
