import React, { useState, useEffect, useMemo } from 'react'
import { Plus, Trash2, Zap, GitBranch, ChevronDown, ChevronUp, Check, X, AlertTriangle } from 'lucide-react'
import { api } from '../../lib/api'
import { SIMETRIS_SPLITTER_RATIO_OPTIONS, ASIMETRIS_SPLITTER_RATIO_OPTIONS } from './formHelpers'

// Constants for power budget calculation
const FIBER_LOSS_PER_KM = 0.35 // dB/km at 1490nm
const CONNECTOR_LOSS = 0.5 // dB per connector

/**
 * SplitterManager - Component untuk mengelola multiple splitters dalam satu box ODC/ODP
 * 
 * Features:
 * - Tambah/hapus multiple splitters (simetris & asimetris)
 * - Custom port mapping
 * - Power budget calculation preview
 * - Visualisasi port dengan status connection
 */
export function SplitterManager({ 
  splitters = [], 
  onChange, 
  inputPower = null,
  parentType = 'ODC', // 'ODC' | 'ODP'
  availableOutputs = [], // List of available downstream nodes for connection
  readOnly = false 
}) {
  const [splitterTypes, setSplitterTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedSplitter, setExpandedSplitter] = useState(null)

  // Calculate theoretical attenuation for symmetric splitters
  const calculateAttenuation = (ratio) => {
    // Formula: 3.5 + 10*log10(N) dB
    return parseFloat((3.5 + 10 * Math.log10(ratio)).toFixed(1))
  }

  const buildFallbackTypes = () => [
    ...SIMETRIS_SPLITTER_RATIO_OPTIONS.map(o => ({
      id: o.value,
      code: o.value,
      name: `PLC ${o.label}`,
      category: 'SYMMETRIC',
      outputCount: parseInt(o.value.split(':')[1]),
      attEqual: calculateAttenuation(parseInt(o.value.split(':')[1])),
      attLowOut: null,
      attHighOut: null,
    })),
    ...ASIMETRIS_SPLITTER_RATIO_OPTIONS.map(o => ({
      id: o.value,
      code: o.value,
      name: `FBT ${o.label}`,
      category: 'ASYMMETRIC',
      outputCount: 2,
      attEqual: null,
      attLowOut: parseInt(o.value.split(':')[0]) <= 5 ? 20 - parseInt(o.value.split(':')[0]) : 10,
      attHighOut: 0.5,
    }))
  ]

  const fetchSplitterTypes = async () => {
    try {
      const data = await api.get('/splitter-types')
      // Jika API return kosong (tabel belum di-seed), pakai fallback lokal
      if (!data || data.length === 0) return buildFallbackTypes()
      return data
    } catch (e) {
      console.warn('SplitterManager: fallback ke data lokal —', e.message)
      return buildFallbackTypes()
    }
  }

  // Fetch splitter types from backend
  useEffect(() => {
    fetchSplitterTypes().then(types => {
      setSplitterTypes(types)
      setLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate total outputs and power budget
  const summary = useMemo(() => {
    let totalOutputs = 0
    let currentPower = inputPower
    const powerAtEachSplitter = []

    const computedSplitters = splitters.map((splitter, index) => {
      const type = splitterTypes.find(t => t.id === splitter.splitterTypeId)
      if (!type) return { ...splitter, outputs: 0, ports: [] }

      const outputs = type.outputCount
      totalOutputs += outputs

      // Calculate power at this splitter's input
      const inputAtThisSplitter = currentPower
      
      // Calculate output power for each port
      const ports = Array.from({ length: outputs }, (_, i) => {
        const portNum = i + 1
        const attenuation = type.category === 'SYMMETRIC' 
          ? type.attEqual 
          : (portNum === 1 ? type.attLowOut : type.attHighOut)
        
        const outputPower = inputAtThisSplitter !== null 
          ? parseFloat((inputAtThisSplitter - attenuation).toFixed(2))
          : null

        // For asymmetric, determine port type
        const portType = type.category === 'ASYMMETRIC'
          ? (portNum === 1 ? 'DROP' : 'PASS_THROUGH')
          : 'OUTPUT'

        // Check if port is connected from backend data
        const backendPort = splitter.ports?.find(p => p.portNumber === portNum)
        const isConnected = backendPort?.connectionStatus === 'CONNECTED'
        const connectedToName = isConnected ? 
          (backendPort.connectedToType === 'ODC' ? 'ODC' : 
           backendPort.connectedToType === 'ODP' ? 'ODP' : 'Device') : null

        return {
          portNumber: portNum,
          portLabel: portType === 'DROP' ? 'DROP (Lokal)' : 
                     portType === 'PASS_THROUGH' ? 'PASS (Lanjut)' : `Port ${portNum}`,
          portType,
          attenuation,
          inputPower: inputAtThisSplitter,
          outputPower,
          connectedTo: connectedToName,
          connectionStatus: backendPort?.connectionStatus || 'AVAILABLE',
          connectedToType: backendPort?.connectedToType || null,
          connectedToId: backendPort?.connectedToId || null
        }
      })

      // For asymmetric pass-through, update current power for next splitter
      if (type.category === 'ASYMMETRIC' && ports.length >= 2) {
        currentPower = ports[1].outputPower // Pass-through port power
      } else {
        currentPower = null // Can't cascade symmetric splitters directly
      }

      powerAtEachSplitter.push({
        sequence: splitter.sequenceOrder,
        inputPower: inputAtThisSplitter,
        outputPower: currentPower
      })

      return {
        ...splitter,
        type,
        outputs,
        ports
      }
    })

    return {
      totalOutputs,
      usedOutputs: splitters.reduce((sum, s) => sum + (s.portMappings?.length || 0), 0),
      availableOutputs: totalOutputs - splitters.reduce((sum, s) => sum + (s.portMappings?.length || 0), 0),
      computedSplitters,
      powerAtEachSplitter
    }
  }, [splitters, splitterTypes, inputPower])

  // Add new splitter
  const addSplitter = (category) => {
    const typesInCategory = splitterTypes.filter(t => t.category === category)
    if (typesInCategory.length === 0) {
      console.warn('SplitterManager: tidak ada tipe splitter untuk kategori', category)
      return
    }

    const defaultType = typesInCategory[0]
    const outputCount = defaultType.outputCount || (category === 'ASYMMETRIC' ? 2 : 8)
    const newSplitter = {
      id: `temp-${Date.now()}`,
      splitterTypeId: defaultType.id,
      category,
      sequenceOrder: splitters.length + 1,
      position: `Slot ${String.fromCharCode(65 + splitters.length)}`, // A, B, C...
      portMappings: [],
      inputPower: null,
      outputs: outputCount,
      type: {
        id: defaultType.id,
        code: defaultType.code,
        name: defaultType.name,
        category: defaultType.category,
        outputCount: outputCount,
        attEqual: defaultType.attEqual,
        attLowOut: defaultType.attLowOut,
        attHighOut: defaultType.attHighOut,
      }
    }

    onChange([...splitters, newSplitter])
    setExpandedSplitter(newSplitter.id)
  }

  // Remove splitter
  const removeSplitter = (splitterId) => {
    const updated = splitters.filter(s => s.id !== splitterId)
    // Recalculate sequence orders
    updated.forEach((s, i) => s.sequenceOrder = i + 1)
    onChange(updated)
    if (expandedSplitter === splitterId) setExpandedSplitter(null)
  }

  // Update splitter — saat splitterTypeId berubah, sinkronkan type & outputs
  const updateSplitter = (splitterId, updates) => {
    const updated = splitters.map(s => {
      if (s.id !== splitterId) return s
      const merged = { ...s, ...updates }
      // Jika type berubah, update embedded type object sekalian
      if (updates.splitterTypeId && updates.splitterTypeId !== s.splitterTypeId) {
        const newType = splitterTypes.find(t => t.id === updates.splitterTypeId)
        if (newType) {
          merged.type = newType
          merged.outputs = newType.outputCount
        }
      }
      return merged
    })
    onChange(updated)
  }

  // Toggle port connection
  const togglePortConnection = (splitterId, portNum, connectedTo) => {
    const splitter = splitters.find(s => s.id === splitterId)
    if (!splitter) return

    const currentMappings = splitter.portMappings || []
    const existingIndex = currentMappings.findIndex(p => p.portNum === portNum)

    let newMappings
    if (existingIndex >= 0) {
      // Disconnect
      newMappings = currentMappings.filter(p => p.portNum !== portNum)
    } else {
      // Connect
      newMappings = [...currentMappings, {
        portNum,
        assignedTo: connectedTo?.id || null,
        assignedToName: connectedTo?.name || null,
        connectionType: connectedTo?.type || null
      }]
    }

    updateSplitter(splitterId, { portMappings: newMappings })
  }

  // Get power color class
  const getPowerColorClass = (power) => {
    if (power === null) return 'text-gray-400'
    if (power >= -15) return 'text-emerald-500'
    if (power >= -25) return 'text-amber-500'
    return 'text-rose-500'
  }

  // Get power status text
  const getPowerStatus = (power) => {
    if (power === null) return 'Unknown'
    if (power >= -15) return 'Sangat Baik'
    if (power >= -25) return 'Baik'
    if (power >= -27) return 'Marginal'
    return 'Buruk'
  }

  if (loading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="h-20 bg-gray-200 rounded"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-primary">Konfigurasi Splitter</h3>
          <p className="text-xs text-muted">
            Total Output: <span className="font-medium text-primary">{summary.totalOutputs}</span> | 
            Terpakai: <span className="font-medium text-primary">{summary.usedOutputs}</span> | 
            Tersedia: <span className="font-medium text-emerald-500">{summary.availableOutputs}</span>
          </p>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addSplitter('SYMMETRIC')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-colors"
            >
              <Plus size={14} />
              PLC Simetris
            </button>
            <button
              type="button"
              onClick={() => addSplitter('ASYMMETRIC')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-colors"
            >
              <Plus size={14} />
              FBT Asimetris
            </button>
          </div>
        )}
      </div>

      {/* Power Budget Summary */}
      {inputPower !== null && (
        <div className="card p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} className="text-blue-500" />
            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Preview Power Budget</span>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="text-xs">
              <span className="text-muted">Input OLT:</span>
              <span className={`ml-1 font-semibold ${getPowerColorClass(inputPower)}`}>
                {inputPower.toFixed(1)} dBm
              </span>
            </div>
            {summary.powerAtEachSplitter.map((p, i) => (
              <React.Fragment key={i}>
                <GitBranch size={12} className="text-muted self-center" />
                <div className="text-xs">
                  <span className="text-muted">Setelah Splitter {p.sequence}:</span>
                  <span className={`ml-1 font-semibold ${getPowerColorClass(p.outputPower)}`}>
                    {p.outputPower !== null ? `${p.outputPower.toFixed(1)} dBm` : 'N/A'}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Splitter List */}
      <div className="space-y-3">
        {summary.computedSplitters.map((splitter) => (
          <div 
            key={splitter.id}
            className={`card overflow-hidden transition-all ${
              expandedSplitter === splitter.id ? 'ring-2 ring-[var(--accent)]' : ''
            }`}
          >
            {/* Splitter Header */}
            <div 
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--bg-hover)]"
              onClick={() => setExpandedSplitter(expandedSplitter === splitter.id ? null : splitter.id)}
            >
              <div className="flex items-center gap-3">
                <div className={`
                  w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold
                  ${splitter.type?.category === 'SYMMETRIC' 
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' 
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'}
                `}>
                  {splitter.sequenceOrder}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-primary">
                      {splitter.type?.name || 'Unknown Splitter'}
                    </span>
                    <span className={`
                      text-[10px] px-1.5 py-0.5 rounded font-medium
                      ${splitter.type?.category === 'SYMMETRIC'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30'
                        : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30'}
                    `}>
                      {splitter.type?.category === 'SYMMETRIC' ? 'PLC' : 'FBT'}
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    {splitter.outputs} output • 
                    {splitter.type?.category === 'SYMMETRIC' 
                      ? `-${splitter.type?.attEqual} dB semua port`
                      : `-${splitter.type?.attLowOut} dB drop / -${splitter.type?.attHighOut} dB pass`
                    }
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">
                  {splitter.portMappings?.length || 0}/{splitter.outputs} terhubung
                </span>
                {expandedSplitter === splitter.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSplitter(splitter.id)
                    }}
                    className="p-1.5 rounded hover:bg-rose-100 text-rose-500 transition-colors ml-2"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Expanded Content */}
            {expandedSplitter === splitter.id && (
              <div className="border-t border-[var(--border)] p-4 space-y-4">
                {/* Splitter Type Selector */}
                {!readOnly && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1.5">Tipe Splitter</label>
                      <select
                        value={splitter.splitterTypeId}
                        onChange={(e) => updateSplitter(splitter.id, { splitterTypeId: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]"
                      >
                        {splitterTypes
                          .filter(t => t.category === splitter.category)
                          .map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name} {t.category === 'SYMMETRIC' 
                                ? `(-${t.attEqual} dB)` 
                                : `(-${t.attLowOut}/${t.attHighOut} dB)`
                              }
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1.5">Posisi/Slot</label>
                      <input
                        value={splitter.position}
                        onChange={(e) => updateSplitter(splitter.id, { position: e.target.value })}
                        placeholder="Misal: Slot A, Rack 1"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]"
                      />
                    </div>
                  </div>
                )}

                {/* Ports Grid */}
                <div>
                  <label className="block text-xs font-medium text-secondary mb-2">Port Output</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
                    {splitter.ports?.map((port) => (
                      <div
                        key={port.portNumber}
                        className={`
                          relative p-3 rounded-lg border text-center cursor-pointer transition-all
                          ${port.connectionStatus === 'CONNECTED' 
                            ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20' 
                            : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--accent)]'}
                          ${!readOnly && 'hover:shadow-sm'}
                        `}
                        onClick={() => !readOnly && togglePortConnection(splitter.id, port.portNumber, null)}
                      >
                        <div className="text-[10px] text-muted mb-1">{port.portLabel}</div>
                        <div className="text-lg font-bold text-primary">{port.portNumber}</div>
                        
                        {/* Power Badge */}
                        {port.outputPower !== null && (
                          <div className={`
                            mt-1 text-[10px] font-medium px-1.5 py-0.5 rounded
                            ${port.outputPower >= -15 ? 'bg-emerald-100 text-emerald-700' :
                              port.outputPower >= -25 ? 'bg-amber-100 text-amber-700' :
                              'bg-rose-100 text-rose-700'}
                          `}>
                            {port.outputPower.toFixed(1)} dBm
                          </div>
                        )}

                        {/* Connection Status */}
                        {port.connectionStatus === 'CONNECTED' && (
                          <div className="mt-1 flex items-center justify-center gap-1 text-[10px] text-emerald-600">
                            <Check size={10} />
                            <span className="truncate max-w-[60px]">{port.connectedTo}</span>
                          </div>
                        )}

                        {/* Port Type Badge for Asymmetric */}
                        {port.portType !== 'OUTPUT' && (
                          <div className={`
                            absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold
                            ${port.portType === 'DROP' 
                              ? 'bg-purple-500 text-white' 
                              : 'bg-amber-500 text-white'}
                          `}>
                            {port.portType === 'DROP' ? 'D' : 'P'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Port Assignment Info */}
                {splitter.portMappings?.length > 0 && (
                  <div className="text-xs text-muted">
                    <span className="font-medium">Terhubung ke:</span>
                    <ul className="mt-1 space-y-1">
                      {splitter.portMappings.map((mapping, idx) => (
                        <li key={idx} className="flex items-center gap-1">
                          <span className="font-medium">Port {mapping.portNum}</span>
                          <span>→</span>
                          <span>{mapping.assignedToName || mapping.assignedTo}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Empty State */}
        {splitters.length === 0 && (
          <div className="card p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mx-auto mb-3">
              <GitBranch size={24} className="text-muted" />
            </div>
            <p className="text-sm text-secondary mb-1">Belum ada splitter</p>
            <p className="text-xs text-muted mb-4">
              Tambahkan splitter PLC (simetris) atau FBT (asimetris)
            </p>
            {!readOnly && (
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => addSplitter('SYMMETRIC')}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                >
                  + PLC Simetris
                </button>
                <button
                  type="button"
                  onClick={() => addSplitter('ASYMMETRIC')}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors"
                >
                  + FBT Asimetris
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default SplitterManager
