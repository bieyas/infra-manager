import React, { useState, useEffect, useMemo } from 'react'
import { 
  Plus, Trash2, Zap, GitBranch, ChevronDown, ChevronUp, 
  Check, X, AlertTriangle, Layers, Sparkles, User, Radio, ArrowRight 
} from 'lucide-react'
import { api } from '../../lib/api'
import { SIMETRIS_SPLITTER_RATIO_OPTIONS, ASIMETRIS_SPLITTER_RATIO_OPTIONS } from './formHelpers'

// Constants for optical loss budget
const SPLICE_LOSS = 0.2 // dB per fusion splice inside ODP box

/**
 * SplitterManager - Component untuk mengelola multiple splitters dalam satu box ODP
 * 
 * Features:
 * - 1-Click Quick Presets (PLC 1:8, PLC 1:16, FBT 20:80, Hybrid 20:80 + 1:8)
 * - Accurate cascading optical power calculation (FBT drop branch to PLC input)
 * - Visualisasi port dengan nama & status pelanggan (Customer Mapping)
 * - Optical margin health alerts (Class B+/C+ GPON compliance)
 */
export function SplitterManager({ 
  splitters = [], 
  onChange, 
  inputPower = null,
  customers = [],
  parentType = 'ODP',
  availableOutputs = [],
  readOnly = false,
  legacySplitterRatio = null,
  onLegacyChange = null
}) {
  const [splitterTypes, setSplitterTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedSplitter, setExpandedSplitter] = useState(null)

  // Calculate theoretical attenuation for symmetric splitters (Formula: 3.5 + 10*log10(N) dB)
  const calculateAttenuation = (ratio) => {
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
    ...ASIMETRIS_SPLITTER_RATIO_OPTIONS.map(o => {
      const parts = o.value.split(':')
      const lowPct = parseInt(parts[0], 10)
      return {
        id: o.value,
        code: o.value,
        name: `FBT ${o.label}`,
        category: 'ASYMMETRIC',
        outputCount: 2,
        attEqual: null,
        attLowOut: lowPct <= 5 ? 20 - lowPct : (lowPct <= 10 ? 10.5 : (lowPct <= 20 ? 7.2 : 5.4)),
        attHighOut: lowPct <= 10 ? 0.6 : (lowPct <= 20 ? 1.1 : 1.6),
      }
    })
  ]

  const fetchSplitterTypes = async () => {
    try {
      const data = await api.get('/splitter-types')
      if (!data || data.length === 0) return buildFallbackTypes()
      return data
    } catch (e) {
      console.warn('SplitterManager: fallback ke data lokal —', e.message)
      return buildFallbackTypes()
    }
  }

  useEffect(() => {
    fetchSplitterTypes().then(types => {
      setSplitterTypes(types)
      setLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Optical Health Margin Helper
  const getOpticalMargin = (power) => {
    if (power === null || power === undefined) {
      return { status: 'UNKNOWN', label: 'N/A', badgeClass: 'bg-muted/20 text-muted border-transparent' }
    }
    if (power > -8.0) {
      return { status: 'OVERLOAD', label: 'Overload (> -8 dBm)', badgeClass: 'bg-amber-500/20 text-amber-500 border-amber-500/40' }
    }
    if (power >= -24.0) {
      return { status: 'OPTIMAL', label: 'Optimal (Bagus)', badgeClass: 'bg-emerald-500/20 text-emerald-500 border-emerald-500/40' }
    }
    if (power >= -27.0) {
      return { status: 'MARGINAL', label: 'Marginal (-24 ~ -27 dBm)', badgeClass: 'bg-amber-500/20 text-amber-500 border-amber-500/40' }
    }
    return { status: 'CRITICAL', label: 'Kritis (< -27 dBm)', badgeClass: 'bg-rose-500/20 text-rose-500 border-rose-500/40' }
  }

  // Calculate total outputs, ports, and cascading power budget
  const summary = useMemo(() => {
    let totalOutputs = 0
    let currentFeederPower = inputPower
    const powerAtEachSplitter = []
    let hasCriticalMargin = false

    const computedSplitters = splitters.map((splitter, index) => {
      const type = splitterTypes.find(t => t.id === splitter.splitterTypeId || t.code === splitter.splitterTypeId) || splitter.type
      if (!type) return { ...splitter, outputs: 0, ports: [] }

      const outputs = type.outputCount || splitter.outputs || 8
      totalOutputs += outputs

      // Determine input power for this splitter:
      // Index 0 receives inputPower from feeder cable
      // Index > 0: if previous splitter was ASYMMETRIC (like Hybrid FBT 20:80 + PLC 1:8),
      // the PLC is fed by Splitter 1's DROP port (Port 1) minus 0.2 dB splice loss!
      let inputAtThisSplitter = null
      let inputSourceLabel = 'Input Feeder ODP'
      
      if (index === 0) {
        inputAtThisSplitter = inputPower
      } else {
        const prev = powerAtEachSplitter[index - 1]
        if (prev?.isAsym) {
          if (type.category === 'SYMMETRIC') {
            // Local drop branch spliced to PLC
            inputAtThisSplitter = prev.dropPortPower !== null 
              ? parseFloat((prev.dropPortPower - SPLICE_LOSS).toFixed(2)) 
              : null
            inputSourceLabel = `Splitter ${prev.sequence} Drop (Port 1: ${prev.dropPortPower?.toFixed(1) ?? 'N/A'} dBm) - ${SPLICE_LOSS} dB splice`
          } else {
            // Asymmetric to asymmetric cascade (feeder pass continuation)
            inputAtThisSplitter = prev.passPortPower !== null 
              ? parseFloat((prev.passPortPower - SPLICE_LOSS).toFixed(2)) 
              : null
            inputSourceLabel = `Splitter ${prev.sequence} Pass (Port 2: ${prev.passPortPower?.toFixed(1) ?? 'N/A'} dBm) - ${SPLICE_LOSS} dB splice`
          }
        } else {
          inputAtThisSplitter = currentFeederPower
        }
      }

      // Calculate output power for each port
      const ports = Array.from({ length: outputs }, (_, i) => {
        const portNum = i + 1
        const attenuation = type.category === 'ASYMMETRIC' 
          ? (portNum === 1 ? (type.attLowOut ?? 7.0) : (type.attHighOut ?? 1.0))
          : (type.attEqual ?? calculateAttenuation(outputs))
        
        const outputPower = inputAtThisSplitter !== null 
          ? parseFloat((inputAtThisSplitter - attenuation).toFixed(2))
          : null

        if (outputPower !== null && outputPower < -27.0) {
          hasCriticalMargin = true
        }

        // For asymmetric, determine port type
        const portType = type.category === 'ASYMMETRIC'
          ? (portNum === 1 ? 'DROP' : 'PASS_THROUGH')
          : 'OUTPUT'

        // Check if port is connected to a customer or backend port mapping
        const backendPort = splitter.ports?.find(p => p.portNumber === portNum)
        const isFbtPort1 = type.category === 'ASYMMETRIC' && portNum === 1
        const nextSplitter = splitters[index + 1]
        const isSplitterUplink = isFbtPort1 && nextSplitter && (splitter.fbtPort1Mode !== 'CUSTOMER_DROP' && backendPort?.connectedToType !== 'CUSTOMER')

        const matchedCustomer = !isSplitterUplink ? customers.find(c => 
          c.splitterPortId === backendPort?.id || 
          backendPort?.connectedToId === c.id ||
          (!c.splitterPortId && String(c.odpPort) === String(portNum) && (type.category === 'SYMMETRIC' || splitters.length === 1))
        ) : null

        const isOdpConnected = backendPort?.connectionStatus === 'CONNECTED' && backendPort?.connectedToType === 'ODP'
        const isCustomerConnected = !!matchedCustomer || (backendPort?.connectionStatus === 'CONNECTED' && backendPort?.connectedToType === 'CUSTOMER')
        const isConnected = isSplitterUplink || isCustomerConnected || isOdpConnected || backendPort?.connectionStatus === 'CONNECTED'

        const connectedToName = isSplitterUplink
          ? `Uplink ${nextSplitter.position || 'Slot B'}`
          : matchedCustomer 
          ? matchedCustomer.name 
          : isOdpConnected
          ? 'Feeder ODP'
          : backendPort?.connectedToType === 'CUSTOMER'
          ? 'Pelanggan'
          : (backendPort?.connectedToId ? 'Terkoneksi' : null)

        const portLabel = isSplitterUplink
          ? `Port 1 (Spliced ke ${nextSplitter.position || 'Slot B'})`
          : (portType === 'DROP' ? 'DROP (Lokal)' : portType === 'PASS_THROUGH' ? 'PASS (Feeder)' : `Port ${portNum}`)

        return {
          id: backendPort?.id || `port-${splitter.id}-${portNum}`,
          portNumber: portNum,
          portLabel,
          portType,
          attenuation,
          inputPower: inputAtThisSplitter,
          outputPower,
          connectedTo: connectedToName,
          connectionStatus: isConnected ? 'CONNECTED' : (backendPort?.connectionStatus || 'AVAILABLE'),
          connectedToType: isSplitterUplink ? 'SPLITTER' : (matchedCustomer ? 'CUSTOMER' : (backendPort?.connectedToType || (isOdpConnected ? 'ODP' : null))),
          connectedToId: isSplitterUplink ? (nextSplitter.id || null) : (matchedCustomer?.id || backendPort?.connectedToId || null),
          customer: matchedCustomer || null
        }
      })

      const isAsym = type.category === 'ASYMMETRIC'
      powerAtEachSplitter.push({
        sequence: splitter.sequenceOrder || (index + 1),
        isAsym,
        inputPower: inputAtThisSplitter,
        inputSourceLabel,
        dropPortPower: isAsym && ports.length >= 1 ? ports[0].outputPower : null,
        passPortPower: isAsym && ports.length >= 2 ? ports[1].outputPower : null,
        outputPower: isAsym && ports.length >= 2 ? ports[1].outputPower : (ports[0]?.outputPower || null)
      })

      if (isAsym && ports.length >= 2) {
        currentFeederPower = ports[1].outputPower
      }

      return {
        ...splitter,
        type,
        outputs,
        ports,
        inputSourceLabel,
        inputCalculatedPower: inputAtThisSplitter
      }
    })

    const totalDropOutputs = computedSplitters.reduce((sum, s) => {
      const activeDrop = s.ports.filter(p => p.portType !== 'PASS_THROUGH' && p.connectedToType !== 'SPLITTER').length
      return sum + activeDrop
    }, 0)

    const usedCount = computedSplitters.reduce((sum, s) => {
      return sum + s.ports.filter(p => p.connectionStatus === 'CONNECTED' && p.connectedToType !== 'SPLITTER').length
    }, 0)

    return {
      totalOutputs: totalDropOutputs > 0 ? totalDropOutputs : totalOutputs,
      usedOutputs: usedCount,
      availableOutputs: (totalDropOutputs > 0 ? totalDropOutputs : totalOutputs) - usedCount,
      computedSplitters,
      powerAtEachSplitter,
      hasCriticalMargin
    }
  }, [splitters, splitterTypes, inputPower, customers])

  // Apply Quick Preset
  const applyPreset = (presetName) => {
    if (readOnly) return

    if (presetName === 'PLC_1_8') {
      const t = splitterTypes.find(t => (t.code === '1:8' || t.name?.includes('1:8')) && t.category === 'SYMMETRIC') || {
        id: '1:8', code: '1:8', name: 'PLC 1:8', category: 'SYMMETRIC', outputCount: 8, attEqual: 10.5
      }
      const newSplitters = [{
        id: `sp-${Date.now()}`,
        splitterTypeId: t.id,
        category: 'SYMMETRIC',
        sequenceOrder: 1,
        position: 'Slot A',
        portMappings: [],
        inputPower: inputPower,
        outputs: 8,
        type: t
      }]
      onChange(newSplitters)
      if (onLegacyChange) onLegacyChange('R1_8')
      setExpandedSplitter(newSplitters[0].id)
    } else if (presetName === 'PLC_1_16') {
      const t = splitterTypes.find(t => (t.code === '1:16' || t.name?.includes('1:16')) && t.category === 'SYMMETRIC') || {
        id: '1:16', code: '1:16', name: 'PLC 1:16', category: 'SYMMETRIC', outputCount: 16, attEqual: 13.8
      }
      const newSplitters = [{
        id: `sp-${Date.now()}`,
        splitterTypeId: t.id,
        category: 'SYMMETRIC',
        sequenceOrder: 1,
        position: 'Slot A',
        portMappings: [],
        inputPower: inputPower,
        outputs: 16,
        type: t
      }]
      onChange(newSplitters)
      if (onLegacyChange) onLegacyChange('R1_16')
      setExpandedSplitter(newSplitters[0].id)
    } else if (presetName === 'FBT_20_80') {
      const t = splitterTypes.find(t => (t.code === '20:80' || t.name?.includes('20:80')) && t.category === 'ASYMMETRIC') || {
        id: '20:80', code: '20:80', name: 'FBT 20:80', category: 'ASYMMETRIC', outputCount: 2, attLowOut: 7.2, attHighOut: 1.1
      }
      const newSplitters = [{
        id: `sp-${Date.now()}`,
        splitterTypeId: t.id,
        category: 'ASYMMETRIC',
        sequenceOrder: 1,
        position: 'Slot A (FBT)',
        portMappings: [],
        inputPower: inputPower,
        outputs: 2,
        type: t
      }]
      onChange(newSplitters)
      setExpandedSplitter(newSplitters[0].id)
    } else if (presetName === 'HYBRID_20_80_1_8') {
      const t1 = splitterTypes.find(t => (t.code === '20:80' || t.name?.includes('20:80')) && t.category === 'ASYMMETRIC') || {
        id: '20:80', code: '20:80', name: 'FBT 20:80', category: 'ASYMMETRIC', outputCount: 2, attLowOut: 7.2, attHighOut: 1.1
      }
      const t2 = splitterTypes.find(t => (t.code === '1:8' || t.name?.includes('1:8')) && t.category === 'SYMMETRIC') || {
        id: '1:8', code: '1:8', name: 'PLC 1:8', category: 'SYMMETRIC', outputCount: 8, attEqual: 10.5
      }
      const now = Date.now()
      const newSplitters = [
        {
          id: `sp-${now}-1`,
          splitterTypeId: t1.id,
          category: 'ASYMMETRIC',
          sequenceOrder: 1,
          position: 'Slot A (FBT Feeder/Drop)',
          portMappings: [],
          inputPower: inputPower,
          outputs: 2,
          type: t1
        },
        {
          id: `sp-${now}-2`,
          splitterTypeId: t2.id,
          category: 'SYMMETRIC',
          sequenceOrder: 2,
          position: 'Slot B (PLC Drop Pelanggan)',
          portMappings: [],
          inputPower: null,
          outputs: 8,
          type: t2
        }
      ]
      onChange(newSplitters)
      if (onLegacyChange) onLegacyChange('R1_8')
      setExpandedSplitter(newSplitters[1].id)
    }
  }

  // Add individual splitter
  const addSplitter = (category) => {
    const typesInCategory = splitterTypes.filter(t => t.category === category)
    if (typesInCategory.length === 0) return

    const defaultType = typesInCategory[0]
    const outputCount = defaultType.outputCount || (category === 'ASYMMETRIC' ? 2 : 8)
    const newSplitter = {
      id: `temp-${Date.now()}`,
      splitterTypeId: defaultType.id,
      category,
      sequenceOrder: splitters.length + 1,
      position: `Slot ${String.fromCharCode(65 + splitters.length)}`,
      portMappings: [],
      inputPower: null,
      outputs: outputCount,
      type: defaultType
    }

    const updated = [...splitters, newSplitter]
    onChange(updated)
    setExpandedSplitter(newSplitter.id)
  }

  // Remove splitter
  const removeSplitter = (splitterId) => {
    const updated = splitters.filter(s => s.id !== splitterId)
    updated.forEach((s, i) => s.sequenceOrder = i + 1)
    onChange(updated)
    if (expandedSplitter === splitterId) setExpandedSplitter(null)
  }

  // Update splitter
  const updateSplitter = (splitterId, updates) => {
    const updated = splitters.map(s => {
      if (s.id !== splitterId) return s
      const merged = { ...s, ...updates }
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
      newMappings = currentMappings.filter(p => p.portNum !== portNum)
    } else {
      newMappings = [...currentMappings, {
        portNum,
        assignedTo: connectedTo?.id || null,
        assignedToName: connectedTo?.name || null,
        connectionType: connectedTo?.type || null
      }]
    }

    updateSplitter(splitterId, { portMappings: newMappings })
  }

  if (loading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-4 bg-[var(--bg-hover)] rounded w-1/4 mb-4"></div>
        <div className="h-20 bg-[var(--bg-hover)] rounded"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Layers size={16} className="text-[var(--accent)]" />
            Konfigurasi Splitter
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Total Output: <span className="font-semibold text-primary">{summary.totalOutputs}</span> | 
            Terpakai: <span className="font-semibold text-amber-500">{summary.usedOutputs}</span> | 
            Tersedia: <span className="font-semibold text-emerald-500">{summary.availableOutputs}</span>
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => addSplitter('SYMMETRIC')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border border-blue-500/30 transition-colors"
            >
              <Plus size={14} />
              + PLC Simetris
            </button>
            <button
              type="button"
              onClick={() => addSplitter('ASYMMETRIC')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 transition-colors"
            >
              <Plus size={14} />
              + FBT Asimetris
            </button>
          </div>
        )}
      </div>

      {/* Quick Presets Toolbar */}
      {!readOnly && (
        <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/50">
          <div className="flex items-center gap-1.5 text-xs font-medium text-secondary mb-2">
            <Sparkles size={14} className="text-amber-400" />
            <span>Preset Topologi Cepat:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyPreset('PLC_1_8')}
              className="px-2.5 py-1 text-xs rounded-md bg-[var(--bg-card)] hover:bg-[var(--accent-glow)]/20 border border-[var(--border)] hover:border-[var(--accent)] text-primary transition-colors flex items-center gap-1.5"
              title="1 Splitter PLC 1:8 simetris standar ODP end-point"
            >
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              PLC 1:8 Standar
            </button>
            <button
              type="button"
              onClick={() => applyPreset('PLC_1_16')}
              className="px-2.5 py-1 text-xs rounded-md bg-[var(--bg-card)] hover:bg-[var(--accent-glow)]/20 border border-[var(--border)] hover:border-[var(--accent)] text-primary transition-colors flex items-center gap-1.5"
              title="1 Splitter PLC 1:16 simetris untuk area pemukiman padat"
            >
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              PLC 1:16 Besar
            </button>
            <button
              type="button"
              onClick={() => applyPreset('FBT_20_80')}
              className="px-2.5 py-1 text-xs rounded-md bg-[var(--bg-card)] hover:bg-[var(--accent-glow)]/20 border border-[var(--border)] hover:border-[var(--accent)] text-primary transition-colors flex items-center gap-1.5"
              title="1 Splitter FBT 20:80 untuk percabangan cascade"
            >
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              FBT 20:80 Cascade
            </button>
            <button
              type="button"
              onClick={() => applyPreset('HYBRID_20_80_1_8')}
              className="px-2.5 py-1 text-xs rounded-md bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/40 text-purple-400 font-medium transition-colors flex items-center gap-1.5"
              title="FBT 20:80 + PLC 1:8 internal cascade (Standar ISP FTTH Indonesia)"
            >
              <span className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-400 to-blue-400" />
              Hybrid (20:80 + 1:8)
            </button>
          </div>
        </div>
      )}

      {/* Optical Power Budget & Cascade Preview */}
      {inputPower !== null && (
        <div className="card p-3.5 bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-purple-500/5 border border-blue-500/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-amber-400" />
              <span className="text-xs font-semibold text-primary">Simulasi Power Budget & Distribusi Optik</span>
            </div>
            <span className="text-[11px] text-muted">Berdasarkan redaman splitter & splice -0.2 dB</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <div className="p-2 rounded bg-[var(--bg-card)]/80 border border-[var(--border)]">
              <div className="text-[10px] text-muted uppercase tracking-wider">Input Daya Feeder</div>
              <div className="text-sm font-bold text-primary mt-0.5">
                {inputPower.toFixed(2)} dBm
              </div>
              <div className="text-[10px] text-muted mt-0.5">Dari OLT / ODP Hulu</div>
            </div>

            {summary.powerAtEachSplitter.map((p, idx) => (
              <div key={idx} className="p-2 rounded bg-[var(--bg-card)]/80 border border-[var(--border)]">
                <div className="text-[10px] text-muted uppercase tracking-wider">
                  Splitter {p.sequence} {p.isAsym ? '(FBT)' : '(PLC)'}
                </div>
                {p.isAsym ? (
                  <div className="mt-0.5 space-y-0.5">
                    <div className="text-xs flex justify-between">
                      <span className="text-purple-400">Port 1 (Drop):</span>
                      <span className="font-semibold">{p.dropPortPower !== null ? `${p.dropPortPower.toFixed(2)} dBm` : 'N/A'}</span>
                    </div>
                    <div className="text-xs flex justify-between">
                      <span className="text-amber-400">Port 2 (Pass):</span>
                      <span className="font-semibold">{p.passPortPower !== null ? `${p.passPortPower.toFixed(2)} dBm` : 'N/A'}</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-0.5">
                    <div className="text-sm font-bold text-primary">
                      {p.outputPower !== null ? `${p.outputPower.toFixed(2)} dBm` : 'N/A'}
                    </div>
                    <div className="text-[10px] text-muted truncate">Input: {p.inputPower !== null ? `${p.inputPower.toFixed(2)} dBm` : 'N/A'}</div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Warning banner if critical optical power is detected */}
          {summary.hasCriticalMargin && (
            <div className="mt-3 flex items-center gap-2 p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs">
              <AlertTriangle size={15} className="shrink-0" />
              <span>
                <strong>Perhatian Redaman:</strong> Daya output pada beberapa port lebih rendah dari -27.0 dBm (batas sensitivitas ONU). Pelanggan berisiko mengalami sinyal lemah / LOS.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Splitters List */}
      <div className="space-y-3">
        {summary.computedSplitters.map((splitter) => (
          <div 
            key={splitter.id}
            className={`card overflow-hidden transition-all border ${
              expandedSplitter === splitter.id ? 'ring-2 ring-[var(--accent)] border-[var(--accent)]' : 'border-[var(--border)]'
            }`}
          >
            {/* Splitter Item Header */}
            <div 
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
              onClick={() => setExpandedSplitter(expandedSplitter === splitter.id ? null : splitter.id)}
            >
              <div className="flex items-center gap-3">
                <div className={`
                  w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm
                  ${splitter.type?.category === 'SYMMETRIC' 
                    ? 'bg-blue-500/20 text-blue-500 border border-blue-500/30' 
                    : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'}
                `}>
                  {splitter.sequenceOrder}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-primary">
                      {splitter.type?.name || 'Splitter'}
                    </span>
                    <span className={`
                      text-[10px] px-2 py-0.5 rounded-full font-semibold border
                      ${splitter.type?.category === 'SYMMETRIC'
                        ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                        : 'bg-purple-500/10 text-purple-400 border-purple-500/30'}
                    `}>
                      {splitter.type?.category === 'SYMMETRIC' ? 'PLC Simetris' : 'FBT Asimetris'}
                    </span>
                    {splitter.position && (
                      <span className="text-[11px] text-muted bg-[var(--bg-secondary)] px-2 py-0.5 rounded">
                        {splitter.position}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{splitter.outputs} Port Output</span>
                    <span>•</span>
                    <span>
                      {splitter.type?.category === 'SYMMETRIC' 
                        ? `Redaman: -${splitter.type?.attEqual ?? 10.5} dB (sama)`
                        : `Port 1 (Drop): -${splitter.type?.attLowOut ?? 7.0} dB | Port 2 (Pass): -${splitter.type?.attHighOut ?? 1.0} dB`
                      }
                    </span>
                    {splitter.inputCalculatedPower !== null && (
                      <>
                        <span>•</span>
                        <span className="text-primary font-medium">Input: {splitter.inputCalculatedPower.toFixed(2)} dBm</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">
                  {splitter.ports?.filter(p => p.connectionStatus === 'CONNECTED').length || 0}/{splitter.outputs} terhubung
                </span>
                {expandedSplitter === splitter.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSplitter(splitter.id)
                    }}
                    className="p-1.5 rounded-md hover:bg-rose-500/10 text-rose-500 transition-colors ml-1"
                    title="Hapus Splitter"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Splitter Expanded Body */}
            {expandedSplitter === splitter.id && (
              <div className="border-t border-[var(--border)] p-4 space-y-4 bg-[var(--bg-card)]">
                {/* Configuration inputs */}
                {!readOnly && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1.5">Tipe Splitter</label>
                      <select
                        value={splitter.splitterTypeId}
                        onChange={(e) => updateSplitter(splitter.id, { splitterTypeId: e.target.value })}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      >
                        {splitterTypes
                          .filter(t => t.category === splitter.category)
                          .map(t => (
                            <option key={t.id} value={t.id}>
                              {t.name} {t.category === 'SYMMETRIC' 
                                ? `(- ${t.attEqual} dB)` 
                                : `(- ${t.attLowOut} dB drop / - ${t.attHighOut} dB pass)`
                              }
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-secondary mb-1.5">Posisi / Label Slot</label>
                      <input
                        value={splitter.position || ''}
                        onChange={(e) => updateSplitter(splitter.id, { position: e.target.value })}
                        placeholder="Contoh: Slot A, Tray Bawah"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] text-primary focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                      />
                    </div>
                  </div>
                )}

                {/* Opsi Fungsi Port 1 untuk Splitter Asimetris (FBT) */}
                {splitter.type?.category === 'ASYMMETRIC' && splitters.length > 1 && (
                  <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-semibold text-primary flex items-center gap-1.5">
                        <GitBranch size={14} className="text-sky-400" />
                        <span>Fungsi Port 1 (Cabang Drop):</span>
                      </div>
                      <p className="text-[10px] text-muted mt-0.5">
                        {splitter.fbtPort1Mode === 'CUSTOMER_DROP'
                          ? 'Port 1 dijadikan drop pelanggan langsung (kapasitas ODP bertambah 1 port)'
                          : 'Port 1 di-splicing langsung ke input Splitter berikutnya (Standar Hybrid ODP)'}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-1 bg-[var(--bg-card)] p-0.5 rounded-lg border border-[var(--border)] shrink-0">
                        <button
                          type="button"
                          onClick={() => updateSplitter(splitter.id, { fbtPort1Mode: 'UPLINK_SLOT_B' })}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                            splitter.fbtPort1Mode !== 'CUSTOMER_DROP'
                              ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40 font-bold shadow-sm'
                              : 'text-muted hover:text-primary'
                          }`}
                        >
                          🔗 Spliced ke Slot B
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSplitter(splitter.id, { fbtPort1Mode: 'CUSTOMER_DROP' })}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                            splitter.fbtPort1Mode === 'CUSTOMER_DROP'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-bold shadow-sm'
                              : 'text-muted hover:text-primary'
                          }`}
                        >
                          👤 Drop Pelanggan
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Ports Matrix Display */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-secondary uppercase tracking-wider">
                      Port Output & Distribusi Pelanggan
                    </label>
                    <span className="text-[11px] text-muted">
                      Klik port untuk toggle status koneksi
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2.5">
                    {splitter.ports?.map((port) => {
                      const margin = getOpticalMargin(port.outputPower)
                      const isPass = port.portType === 'PASS_THROUGH'
                      const isSplitterUplink = port.connectedToType === 'SPLITTER'

                      return (
                        <div
                          key={port.portNumber}
                          className={`
                            relative p-2.5 rounded-lg border text-center transition-all flex flex-col justify-between min-h-[92px]
                            ${isSplitterUplink
                              ? 'border-sky-500/50 bg-sky-500/10'
                              : port.connectionStatus === 'CONNECTED' 
                              ? (port.connectedToType === 'ODP'
                                  ? 'border-purple-500/50 bg-purple-500/15' 
                                  : 'border-emerald-500/50 bg-emerald-500/10')
                              : isPass 
                                ? 'border-purple-500/40 bg-purple-500/10' 
                                : 'border-[var(--border)] bg-[var(--bg-secondary)]/60 hover:border-[var(--accent)]'}
                            ${!readOnly && !isSplitterUplink ? 'cursor-pointer hover:shadow-sm' : ''}
                          `}
                          onClick={() => !readOnly && !isSplitterUplink && togglePortConnection(splitter.id, port.portNumber, null)}
                        >
                          <div>
                            {/* Top Badge: Label & Port Type */}
                            <div className="text-[10px] text-muted font-medium truncate mb-1">
                              {port.portLabel}
                            </div>
                            
                            {/* Port Number */}
                            <div className="text-base font-bold text-primary flex items-center justify-center gap-1">
                              <span>Port {port.portNumber}</span>
                            </div>
                          </div>

                          <div>
                            {/* Output Power Badge */}
                            {port.outputPower !== null ? (
                              <div className={`
                                mt-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-block max-w-full truncate
                                ${margin.badgeClass}
                              `} title={`Redaman optik: -${port.attenuation} dB | Status: ${margin.label}`}>
                                {port.outputPower.toFixed(1)} dBm
                              </div>
                            ) : (
                              <div className="mt-1 text-[10px] text-muted">N/A</div>
                            )}

                            {/* Connected Customer / Downlink / Internal Splitter Badge */}
                            {port.connectionStatus === 'CONNECTED' && (
                              <div className={`mt-1.5 flex items-center justify-center gap-1 text-[10px] font-medium ${
                                isSplitterUplink ? 'text-sky-400' : port.connectedToType === 'ODP' ? 'text-purple-400' : 'text-emerald-500'
                              }`}>
                                {isSplitterUplink ? (
                                  <GitBranch size={10} className="shrink-0" />
                                ) : port.connectedToType === 'ODP' ? (
                                  <Radio size={10} className="shrink-0" />
                                ) : (
                                  <User size={10} className="shrink-0" />
                                )}
                                <span className="truncate max-w-[70px]" title={port.connectedTo}>
                                  {port.connectedTo}
                                </span>
                              </div>
                            )}

                            {/* Pass through indication */}
                            {isPass && port.connectionStatus !== 'CONNECTED' && (
                              <div className="mt-1 text-[9px] text-purple-400 font-medium">
                                Feeder Out
                              </div>
                            )}
                          </div>

                          {/* Top-Right Indicator Pill */}
                          <div className={`
                            absolute -top-1 -right-1 w-4 h-4 rounded-full text-[8px] flex items-center justify-center font-bold text-white shadow-sm
                            ${isSplitterUplink
                              ? 'bg-sky-500'
                              : port.connectionStatus === 'CONNECTED'
                              ? (port.connectedToType === 'ODP' ? 'bg-purple-600' : 'bg-emerald-500')
                              : port.portType === 'DROP' 
                                ? 'bg-blue-500' 
                                : isPass 
                                  ? 'bg-purple-500' 
                                  : 'bg-gray-400'}
                          `}>
                            {isSplitterUplink ? 'U' : port.portType === 'DROP' ? 'D' : isPass ? 'P' : port.portNumber}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Customer Details List in Splitter */}
                {splitter.ports?.some(p => p.customer) && (
                  <div className="mt-2 p-2.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)]">
                    <span className="text-xs font-semibold text-secondary flex items-center gap-1.5 mb-1.5">
                      <User size={13} className="text-emerald-500" />
                      Pelanggan Terhubung di Splitter Ini:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {splitter.ports.filter(p => p.customer).map(p => (
                        <div key={p.portNumber} className="text-xs p-1.5 rounded bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-primary">Port {p.portNumber}:</span>{' '}
                            <span className="text-emerald-500 font-medium">{p.customer.name}</span>
                            {p.customer.customerId && (
                              <span className="text-[10px] text-muted ml-1">({p.customer.customerId})</span>
                            )}
                          </div>
                          {p.customer.rxPower != null && (
                            <span className="text-[10px] font-mono font-semibold text-primary bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded">
                              {p.customer.rxPower} dBm
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Empty State */}
        {splitters.length === 0 && (
          <div className="card p-8 text-center border-dashed">
            <div className="w-12 h-12 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mx-auto mb-3 text-muted">
              <GitBranch size={24} />
            </div>
            <p className="text-sm font-semibold text-primary mb-1">Belum Ada Splitter di Box ODP Ini</p>
            <p className="text-xs text-muted mb-4 max-w-sm mx-auto">
              Pilih salah satu preset topologi cepat di bawah atau tambahkan splitter secara manual.
            </p>
            {!readOnly && (
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset('PLC_1_8')}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors shadow-sm"
                >
                  Preset PLC 1:8
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('HYBRID_20_80_1_8')}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors shadow-sm"
                >
                  Preset Hybrid (20:80 + 1:8)
                </button>
                <button
                  type="button"
                  onClick={() => addSplitter('SYMMETRIC')}
                  className="px-3.5 py-2 text-xs font-medium rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)] border border-[var(--border)] text-primary transition-colors"
                >
                  + Kustom Manual
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
