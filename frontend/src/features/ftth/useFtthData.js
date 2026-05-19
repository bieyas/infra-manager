import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../../lib/api.js'

export function useFtthData() {
  const [odcs, setOdcs] = useState([])
  const [odps, setOdps] = useState([])
  const [olts, setOlts] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [odcRes, odpRes, devRes, custRes] = await Promise.all([
        api.get('/odc'),
        api.get('/odp'),
        api.get('/devices?type=olt'),
        api.get('/odp/customers').catch(() => []), // may not exist yet
      ])
      setOdcs(odcRes || [])
      setOdps(odpRes || [])
      setOlts(devRes || [])
      setCustomers(custRes || [])
    } catch (err) {
      setError(err.message || 'Gagal memuat data FTTH')
      console.error('Error fetching FTTH data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Build flat nodes array for map markers
  const ftthNodes = useMemo(() => {
    // OLT nodes — real devices with coordinates
    const oltNodes = olts
      .filter(d => d.lat && d.lng)
      .map(d => ({
        id: d.id,
        type: 'olt',
        name: d.name,
        lat: d.lat,
        lng: d.lng,
        address: d.location || '',
        status: (d.status || 'active').toLowerCase(),
        ip: d.ip,
        ponCount: d.ponCount,
        capacity: d.ponCount || null,
        usedPorts: null,
        utilization: null,
      }))

    // ODC nodes
    const odcNodes = odcs.map(o => {
      const total = o.totalOutputs || getCapacity(o.splitterRatio)
      const used = o.usedOutputs ?? o.usedPorts ?? 0
      return {
        id: o.id,
        type: 'odc',
        name: o.name,
        lat: o.lat,
        lng: o.lng,
        address: o.address,
        status: (o.status || 'active').toLowerCase(),
        capacity: total,
        usedPorts: used,
        utilization: calcUtil(used, total),
        oltId: o.oltId,
        olt: o.olt,
        ponPort: o.ponPort,
        uplinkType: o.uplinkType,
        uplinkOdcId: o.uplinkOdcId,
        splitterRatio: o.splitterRatio,
        feederCore: o.feederCore,
        feederLabel: o.feederLabel,
      }
    })

    // ODP nodes
    const odpNodes = odps.map(o => {
      const total = o.totalOutputs || getCapacity(o.splitterRatio)
      const used = o.usedOutputs ?? o.usedPorts ?? 0
      return {
        id: o.id,
        type: 'odp',
        name: o.name,
        lat: o.lat,
        lng: o.lng,
        address: o.address,
        status: (o.status || 'active').toLowerCase(),
        capacity: total,
        usedPorts: used,
        utilization: calcUtil(used, total),
        odcId: o.odcId,
        odc: o.odc,
        uplinkOdpId: o.uplinkOdpId,
        uplinkOdp: o.uplinkOdp,
        uplinkType: o.uplinkType,
        oltId: o.oltId,
        ponPort: o.ponPort,
        splitterRatio: o.splitterRatio,
        customerCount: o.customerCount ?? o._count?.customers ?? 0,
      }
    })

    // Customer / ONU nodes
    const custNodes = customers
      .filter(c => c.lat && c.lng)
      .map(c => ({
        id: c.id,
        type: 'onu',
        name: c.name,
        lat: c.lat,
        lng: c.lng,
        address: c.address || '',
        status: (c.serviceStatus || 'active').toLowerCase(),
        odpId: c.odpId,
        customerId: c.customerId,
        capacity: null,
        usedPorts: null,
        utilization: null,
      }))

    return [...oltNodes, ...odcNodes, ...odpNodes, ...custNodes]
      .filter(n => n.lat && n.lng)
  }, [olts, odcs, odps, customers])

  // Build tree: OLT → ODC → ODP (with cascade) → Customer
  const treeData = useMemo(() => {
    const oltMap = {}

    // Initialize OLT nodes
    olts.forEach(d => {
      oltMap[d.id] = {
        id: d.id,
        type: 'olt',
        name: d.name,
        lat: d.lat,
        lng: d.lng,
        status: (d.status || 'active').toLowerCase(),
        children: [],
      }
    })

    // Build ODP lookup by odcId and uplinkOdpId
    const odpsByOdc = {}
    const odpsByUplink = {}
    odps.forEach(o => {
      if (o.odcId) {
        if (!odpsByOdc[o.odcId]) odpsByOdc[o.odcId] = []
        odpsByOdc[o.odcId].push(o)
      }
      if (o.uplinkOdpId) {
        if (!odpsByUplink[o.uplinkOdpId]) odpsByUplink[o.uplinkOdpId] = []
        odpsByUplink[o.uplinkOdpId].push(o)
      }
    })

    // Customer lookup by odpId
    const custByOdp = {}
    customers.forEach(c => {
      if (c.odpId) {
        if (!custByOdp[c.odpId]) custByOdp[c.odpId] = []
        custByOdp[c.odpId].push(c)
      }
    })

    // Recursive build ODP subtree (handles cascade)
    const buildOdpTree = (odp) => {
      const total = odp.totalOutputs || getCapacity(odp.splitterRatio)
      const used = odp.usedOutputs ?? odp.usedPorts ?? 0
      const children = []

      // Cascaded downstream ODPs
      const downOdps = odpsByUplink[odp.id] || []
      downOdps.forEach(d => children.push(buildOdpTree(d)))

      // Customer children
      const custs = custByOdp[odp.id] || []
      custs.forEach(c => {
        children.push({
          id: c.id,
          type: 'onu',
          name: c.name,
          lat: c.lat,
          lng: c.lng,
          status: (c.serviceStatus || 'active').toLowerCase(),
          children: [],
        })
      })

      return {
        id: odp.id,
        type: 'odp',
        name: odp.name,
        lat: odp.lat,
        lng: odp.lng,
        status: (odp.status || 'active').toLowerCase(),
        utilization: calcUtil(used, total),
        capacity: total,
        usedPorts: used,
        children,
      }
    }

    // Build ODC branches
    odcs.forEach(odc => {
      const oltKey = odc.oltId || 'unknown'
      if (!oltMap[oltKey]) {
        oltMap[oltKey] = {
          id: oltKey,
          type: 'olt',
          name: odc.olt?.name || oltKey,
          lat: odc.lat,
          lng: odc.lng,
          status: 'active',
          children: [],
        }
      }

      const total = odc.totalOutputs || getCapacity(odc.splitterRatio)
      const used = odc.usedOutputs ?? odc.usedPorts ?? 0

      // Only direct ODPs (not cascaded from another ODP)
      const directOdps = (odpsByOdc[odc.id] || []).filter(o => !o.uplinkOdpId)
      const odpChildren = directOdps.map(buildOdpTree)

      oltMap[oltKey].children.push({
        id: odc.id,
        type: 'odc',
        name: odc.name,
        lat: odc.lat,
        lng: odc.lng,
        status: (odc.status || 'active').toLowerCase(),
        utilization: calcUtil(used, total),
        capacity: total,
        usedPorts: used,
        children: odpChildren,
      })
    })

    return Object.values(oltMap)
  }, [olts, odcs, odps, customers])

  return {
    olts,
    odcs,
    odps,
    customers,
    ftthNodes,
    treeData,
    loading,
    error,
    refetch: fetchData,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCapacity(ratio) {
  const map = { R1_2: 2, R1_4: 4, R1_8: 8, R1_16: 16, R1_32: 32 }
  return map[ratio] || 8
}

function calcUtil(used, capacity) {
  if (!capacity) return 0
  return Math.min(100, Math.round((used / capacity) * 100))
}

// ── Filter hook ──────────────────────────────────────────────────────────────

export function useFtthFilter(nodes, filters) {
  return useMemo(() => {
    const { type, status, utilization, oltId, search } = filters || {}
    return nodes.filter(node => {
      if (type && type !== 'all' && node.type !== type) return false
      if (status && status !== 'all' && node.status !== status) return false
      if (oltId && node.oltId !== oltId) return false
      if (utilization === 'high' && (node.utilization == null || node.utilization < 80)) return false
      if (utilization === 'medium' && (node.utilization == null || node.utilization < 50 || node.utilization >= 80)) return false
      if (utilization === 'low' && (node.utilization == null || node.utilization >= 50)) return false
      if (search) {
        const q = search.toLowerCase()
        const match = (node.name || '').toLowerCase().includes(q) ||
                      (node.address || '').toLowerCase().includes(q) ||
                      (node.id || '').toLowerCase().includes(q)
        if (!match) return false
      }
      return true
    })
  }, [nodes, filters])
}
