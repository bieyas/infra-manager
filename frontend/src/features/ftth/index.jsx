import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet'
import TileLayerSwitcher from '../../components/map/TileLayerSwitcher'
import { Layers, Network, X, RefreshCw, Loader2, Cable } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import clsx from 'clsx'

import { LAYER_TYPES, MAP_CENTER, MAP_ZOOM } from './constants'
import { makeSvgIcon, getAncestorIds } from './mapUtils'
import { MapClickHandler, FlyTo } from './MapHandlers'
import LayerPanel from './LayerPanel'
import TreePanel from './TreePanel'
import BottomSheet from './BottomSheet'
import MarkerPopup from './MarkerPopup'
import OdcDetail from '../distribution/OdcDetail'
import OdpDetail from '../distribution/OdpDetail'
import CustomerDetail from '../customers/CustomerDetail'
import { useFtthData, useFtthFilter } from './useFtthData'
import { useMapSettings } from '../../context/MapSettingsContext'
import { useNavigate } from 'react-router-dom'
import { CableLayer, DEFAULT_CABLE_OPTIONS } from './CableLayer'
import CablePanel from './CablePanel'
import { CoverageLayer, DEFAULT_COVERAGE_OPTIONS } from './CoverageLayer'
import DrawCoverageLayer from './DrawCoverageLayer'
import { useOsrmRouting } from './useOsrmRouting'
import { api } from '../../lib/api'
import MarkerClusterGroup from 'react-leaflet-cluster'

// Komponen untuk auto-fit bounds ke area marker
function FitBounds({ nodes }) {
  const map = useMap()
  
  useEffect(() => {
    const nodesWithCoords = nodes.filter(n => n.lat != null && n.lng != null)
    if (nodesWithCoords.length > 0) {
      const bounds = nodesWithCoords.map(n => [n.lat, n.lng])
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 })
    }
  }, [map, nodes])
  
  return null
}

const SHEET_TABS = [
  { id: 'layers', label: 'Layer'    },
  { id: 'tree',   label: 'Hierarki' },
  { id: 'cables', label: 'Kabel'    },
]

export default function FtthMapPage() {
  const navigate = useNavigate()
  const { settings } = useMapSettings()
  const { ftthNodes, treeData, olts, odcs, odps, customers, loading, error, refetch } = useFtthData()
  
  const [layers,     setLayers]     = useState({ 
    mikrotik: true, 
    olt: true, 
    odc: true, 
    odp: true, 
    closure: true, 
    onu: true,
    edges: true,
    coverage: false,
  })
  const [selected,   setSelected]   = useState(null)
  const [detailNode, setDetailNode] = useState(null)
  const [flyTarget,  setFlyTarget]  = useState(null)
  const [sidePanel,  setSidePanel]  = useState('layers')
  const [search,     setSearch]     = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterUtil, setFilterUtil]     = useState('all')
  const [cableOptions, setCableOptions] = useState(DEFAULT_CABLE_OPTIONS)
  const [coverageOptions, setCoverageOptions] = useState(DEFAULT_COVERAGE_OPTIONS)
  const [manualZones, setManualZones] = useState([])

  const sheetApiRef = useRef(null)
  const markerRefs = useRef(new Map()) // Store marker refs for auto-popup

  // Filter nodes
  const filters = useMemo(() => ({
    status: filterStatus !== 'all' ? filterStatus : undefined,
    utilization: filterUtil !== 'all' ? filterUtil : undefined,
    search: search || undefined,
  }), [filterStatus, filterUtil, search])
  const nodes = useFtthFilter(ftthNodes, filters)

  // OSRM routing — aktif hanya saat coverage + showOdp aktif
  const osrmEnabled = layers.coverage && coverageOptions.showOdp
  const { routes: osrmRoutes } = useOsrmRouting(nodes, osrmEnabled)

  // Fetch manual zones dari DB saat coverage layer diaktifkan
  useEffect(() => {
    if (!layers.coverage) return
    api.get('/coverage-zones').then(setManualZones).catch(() => {})
  }, [layers.coverage])

  // ── Derived ──────────────────────────────────────────────────────────────
  const visibleNodes = useMemo(() => nodes.filter(n => {
    if (!layers[n.type]) return false
    return true
  }), [nodes, layers])

  const ancestorIds = useMemo(
    () => selected ? getAncestorIds(selected, nodes) : new Set(),
    [selected, nodes]
  )
  
  // ── Handlers ─────────────────────────────────────────────────────────────
  // Left click - close context menu
  const handleMapClick = useCallback(() => {
    setContextMenu(null)
  }, [])
  
  // Toggle cable type visibility
  const handleToggleCableType = useCallback((type) => {
    setCableOptions(prev => ({
      ...prev,
      visibleTypes: {
        ...prev.visibleTypes,
        [type]: prev.visibleTypes[type] === false ? true : false
      }
    }))
  }, [])
  
  const handleMarkerClick = useCallback((node) => {
    setSelected(node.id)
    setFlyTarget(node)
    setSidePanel('tree')
    sheetApiRef.current?.applySnap('half')
  }, [])

  const handleEditClick = (node) => {
    if (node.type === 'odc') {
      navigate(`/odc/${node.id}/edit`)
    } else {
      navigate(`/odp/${node.id}/edit`)
    }
  }

  const handleDelete = (id) => {
    // Form sekarang sudah handle delete via modal konfirmasi
    refetch()
  }

  const handleSelectResult = (n) => { 
    setFlyTarget(n) 
    setSelected(n.id)
    // Auto-open popup after fly
    setTimeout(() => {
      const marker = markerRefs.current.get(n.id)
      if (marker && marker.getElement()) {
        marker.openPopup()
      }
    }, 1100)
  }
  const handleTreeSelect   = (n) => { 
    setFlyTarget(n) 
    setSelected(n.id)
    // Auto-open popup for this node after fly animation starts
    setTimeout(() => {
      const marker = markerRefs.current.get(n.id)
      if (marker && marker.getElement()) {
        marker.openPopup()
      }
    }, 1100) // Wait for fly animation (duration: 1s)
  }
  const toggleLayer        = (id) => setLayers(prev => ({ ...prev, [id]: !prev[id] }))

  // ── Shared panel content ──────────────────────────────────────────────────
  const panelContent = useMemo(() => {
    switch (sidePanel ?? 'layers') {
      case 'layers':
        return (
          <LayerPanel
            nodes={nodes}
            layers={layers}
            onToggle={toggleLayer}
            search={search}
            onSearch={setSearch}
            onAdd={() => {}}
            onSelectResult={handleSelectResult}
            filterStatus={filterStatus}
            onFilterStatus={setFilterStatus}
            filterUtil={filterUtil}
            onFilterUtil={setFilterUtil}
            coverageOptions={coverageOptions}
            onCoverageChange={setCoverageOptions}
          />
        )
      case 'tree':
        return (
          <TreePanel
            treeData={treeData}
            selectedId={selected}
            ancestorIds={ancestorIds}
            onSelect={handleTreeSelect}
          />
        )
      case 'cables':
        return (
          <CablePanel
            options={cableOptions}
            onChange={setCableOptions}
            onToggleType={handleToggleCableType}
          />
        )
      default:
        return null
    }
  }, [sidePanel, nodes, layers, search, treeData, selected, ancestorIds, cableOptions, handleToggleCableType, filterStatus, filterUtil])

  // ── Panel toggle button ───────────────────────────────────────────────────
  const panelBtn = (id, Icon, title) => (
    <button
      onClick={() => setSidePanel(p => p === id ? null : id)}
      title={title}
      className={clsx(
        'w-8 h-8 rounded-lg flex items-center justify-center shadow-lg transition-all border',
        sidePanel === id
          ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
          : 'bg-card-var text-secondary border-[var(--border)] hover:border-[var(--accent)]'
      )}
    >
      <Icon size={14} />
    </button>
  )

  return (
    <div className="relative w-full h-[calc(100vh-3.5rem)] flex overflow-hidden">

      {/* ── Desktop: Left Sidebar Container ── */}
      <div className="hidden md:flex absolute top-3 left-3 z-[1000] flex-col gap-2">
        {/* Toggle Buttons Row - 3 buttons */}
        <div className="flex gap-1.5">
          {panelBtn('layers', Layers,  'Layer & Filter')}
          {panelBtn('tree',   Network, 'Hierarki Jaringan')}
          {panelBtn('cables', Cable,   'Pengaturan Kabel')}
        </div>

        {/* Collapsible Panel - appears below buttons */}
        {sidePanel && (
          <div className="w-64 flex flex-col bg-card-var border border-[var(--border)] shadow-xl rounded-lg overflow-hidden max-h-[calc(100vh-8rem)]">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50 shrink-0">
              <span className="text-xs font-semibold text-primary">
                {sidePanel === 'layers' ? 'Layer & Filter' : sidePanel === 'tree' ? 'Hierarki Jaringan' : 'Pengaturan Kabel'}
              </span>
              <button onClick={() => setSidePanel(null)} className="text-muted hover:text-primary transition-colors p-0.5 hover:bg-[var(--accent-glow)] rounded">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>{panelContent}</div>
          </div>
        )}
      </div>

      {/* ── Mobile: bottom sheet ── */}
      <BottomSheet
        activeTab={sidePanel ?? 'layers'}
        onTabChange={setSidePanel}
        tabs={SHEET_TABS}
        sheetApiRef={sheetApiRef}
      >
        {panelContent}
      </BottomSheet>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        <MapContainer
          center={settings?.defaultCenter ? [settings.defaultCenter.lat, settings.defaultCenter.lng] : MAP_CENTER}
          zoom={settings?.defaultZoom || MAP_ZOOM}
          style={{ height: '100%', width: '100%', background: '#0f172a' }}
          zoomControl={false}
        >
          <TileLayerSwitcher defaultLayer="street" />

          <MapClickHandler onMapClick={handleMapClick} />
          {flyTarget && <FlyTo target={flyTarget} />}
          <FitBounds nodes={nodes} />
          
          {/* Zoom control repositioned */}
          <div className="leaflet-control-container">
            <div className="leaflet-bottom leaflet-right" style={{ bottom: '90px', right: '10px' }}>
              {/* Custom controls will be rendered here via CSS */}
            </div>
          </div>

          {/* Coverage Area — render sebelum kabel agar di bawah */}
          {layers.coverage && (
            <CoverageLayer
              nodes={nodes}
              options={{ ...coverageOptions, enabled: true }}
              osrmRoutes={osrmRoutes}
              manualZones={manualZones}
            />
          )}

          {/* Draw Tool — render selalu agar bisa aktifkan saat coverage on */}
          {layers.coverage && (
            <DrawCoverageLayer
              nodes={nodes}
              zones={manualZones}
              onZonesChange={setManualZones}
            />
          )}

          {/* Cables / Edges */}
          {layers.edges && (
            <CableLayer
              nodes={nodes}
              options={cableOptions}
            />
          )}

          {/* Markers with clustering */}
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={40}
            disableClusteringAtZoom={16}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
          >
            {visibleNodes.map(node => {
              const isNodeAncestor = ancestorIds.has(node.id)
              
              return (
                <Marker
                  key={node.id}
                  ref={(ref) => {
                    if (ref) markerRefs.current.set(node.id, ref)
                  }}
                  position={[node.lat, node.lng]}
                  icon={makeSvgIcon(node.type, {
                    active: selected === node.id,
                    utilization: node.utilization,
                  })}
                  opacity={selected && selected !== node.id && !isNodeAncestor ? 0.4 : 1}
                  zIndexOffset={selected === node.id ? 100 : 0}
                  eventHandlers={{ 
                    click: () => handleMarkerClick(node),
                    popupclose: () => {
                      // Clean up ref if needed
                    }
                  }}
                >
                <Popup 
                  minWidth={180}
                  closeButton={false}
                >
                  <MarkerPopup 
                    node={node} 
                    ftthNodes={ftthNodes}
                    onEdit={() => handleEditClick(node)} 
                    onDetail={() => setDetailNode(node)}
                    onNavigate={(path) => navigate(path)}
                    onDelete={() => handleDelete(node.id)}
                    onClose={() => {
                      const marker = markerRefs.current.get(node.id)
                      if (marker) marker.closePopup()
                    }}
                  />
                </Popup>
              </Marker>
            )})}
          </MarkerClusterGroup>
        </MapContainer>

        {/* Legend - Bottom Left */}
        {/* <div className="absolute bottom-20 md:bottom-3 left-3 z-[1000] hidden md:flex flex-col gap-1 px-2.5 py-2 rounded-lg bg-[var(--bg-secondary)]/90 backdrop-blur-sm border border-[var(--border)]">
          <p className="text-[9px] text-muted uppercase tracking-wider mb-0.5">Utilisasi</p>
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="text-secondary">&lt;50%</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            <span className="text-secondary">50-80%</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
            <span className="text-secondary">&gt;80%</span>
          </div>
        </div> */}

      </div>

      {/* ── Modals ── */}
      {detailNode?.type === 'odc' && (
        <OdcDetail
          odcId={detailNode.id}
          onClose={() => setDetailNode(null)}
          onEdit={() => { navigate(`/odc/${detailNode.id}/edit`); setDetailNode(null) }}
        />
      )}
      {detailNode?.type === 'odp' && (
        <OdpDetail
          odpId={detailNode.id}
          onClose={() => setDetailNode(null)}
          onEdit={() => { navigate(`/odp/${detailNode.id}/edit`); setDetailNode(null) }}
        />
      )}
      {detailNode?.type === 'onu' && (
        <CustomerDetail
          customerId={detailNode.id}
          onClose={() => setDetailNode(null)}
        />
      )}
    </div>
  )
}
