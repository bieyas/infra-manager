import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

function ratioToCapacity(ratio) {
  const map = { R1_2: 2, R1_4: 4, R1_8: 8, R1_16: 16, R1_32: 32 }
  return map[ratio] || null
}

/** Hitung kapasitas aktual: prioritas splitters[].ports, lalu splitterRatio */
function computeCapacity(odp) {
  if (odp.splitters?.length > 0) {
    const fromPorts = odp.splitters.reduce((sum, s) => {
      const portCount = s.ports?.length ?? s.splitterType?.outputCount ?? 0
      return sum + portCount
    }, 0)
    if (fromPorts > 0) return fromPorts
  }
  return ratioToCapacity(odp.splitterRatio) ?? 0
}

/** After ODP save, sync usedPorts on parent ODC */
async function syncOdcUsedPorts(odcId) {
  if (!odcId) return
  const count = await prisma.odp.count({ where: { odcId } })
  await prisma.odc.update({ where: { id: odcId }, data: { usedPorts: count } })
}

/** After customer save, sync usedPorts on parent ODP */
async function syncOdpUsedPorts(odpId) {
  if (!odpId) return
  const count = await prisma.customer.count({ where: { odpId } })
  await prisma.odp.update({ where: { id: odpId }, data: { usedPorts: count } })
}

/** Recursive cascade update OLT/PON for all downstream ODPs */
async function cascadeUpdateDownstreamOdp(odpId, newOltId, newPonPort, tx, depth = 0, changedBy = null, changedByName = null) {
  // Prevent infinite recursion
  if (depth > 10) {
    console.warn(`Cascade depth exceeded for ODP ${odpId} at depth ${depth}`)
    return { updated: 0, errors: ['Cascade depth exceeded'] }
  }
  
  let totalUpdated = 0
  const errors = []
  
  try {
    // Get all direct downstream ODPs
    const downstreamOdps = await tx.odp.findMany({
      where: { uplinkOdpId: odpId },
      select: { 
        id: true, 
        name: true, 
        oltId: true, 
        ponPort: true,
        uplinkOdpId: true,
        uplinkOdpCore: true
      }
    })
    
    for (const downstream of downstreamOdps) {
      try {
        // Check if OLT/PON needs to be updated
        const oltChanged = newOltId && downstream.oltId !== newOltId
        const ponChanged = newPonPort && downstream.ponPort !== newPonPort
        
        if (oltChanged || ponChanged) {
          const oldOltId = downstream.oltId
          const oldPonPort = downstream.ponPort
          
          // Update OLT/PON for downstream ODP
          await tx.odp.update({
            where: { id: downstream.id },
            data: { 
              oltId: newOltId || downstream.oltId,
              ponPort: newPonPort || downstream.ponPort
            }
          })
          
          // Log the cascade change
          await tx.cascadeChangeLog.create({
            data: {
              entityId: downstream.id,
              entityName: downstream.name,
              cascadeLevel: depth + 1,
              oldOltId: oldOltId,
              oldPonPort: oldPonPort,
              newOltId: newOltId || downstream.oltId,
              newPonPort: newPonPort || downstream.ponPort,
              changedBy: changedBy,
              changedByName: changedByName,
              reason: `Cascade update from parent ODP (${odpId})`
            }
          })
          
          totalUpdated++
          console.log(`Cascade updated ODP ${downstream.name}: OLT ${oldOltId}→${newOltId || downstream.oltId}, PON ${oldPonPort}→${newPonPort || downstream.ponPort}`)
        }
        
        // Recursive call for deeper levels
        const childResult = await cascadeUpdateDownstreamOdp(
          downstream.id, 
          newOltId, 
          newPonPort, 
          tx, 
          depth + 1, 
          changedBy, 
          changedByName
        )
        
        totalUpdated += childResult.updated
        errors.push(...childResult.errors)
        
      } catch (error) {
        const errorMsg = `Failed to update ODP ${downstream.name}: ${error.message}`
        errors.push(errorMsg)
        console.error(errorMsg)
      }
    }
    
  } catch (error) {
    errors.push(`Cascade error at depth ${depth}: ${error.message}`)
    console.error(`Cascade error at depth ${depth}:`, error)
  }
  
  return { updated: totalUpdated, errors }
}

// ── GET /api/odp  — list all ODPs ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { odcId, oltId, status, search } = req.query

    const where = {}
    if (odcId)  where.odcId  = odcId
    if (oltId)  where.oltId  = oltId
    if (status) where.status = status.toUpperCase()
    if (search) where.OR = [
      { name:    { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ]

    const odps = await prisma.odp.findMany({
      where,
      include: {
        odc: { select: { id: true, name: true } },
        olt: { select: { id: true, name: true, ip: true } },
        uplinkOdp: { select: { id: true, name: true } },
        splitters: {
          include: {
            splitterType: { select: { outputCount: true, name: true, category: true } },
            ports: {
              select: { id: true, portNumber: true, connectionStatus: true, connectedToType: true },
              orderBy: { portNumber: 'asc' },
            },
          },
          orderBy: { sequenceOrder: 'asc' },
        },
        _count: { select: { customers: true } },
      },
      orderBy: { name: 'asc' },
    })

    res.json(odps.map(o => {
      const cap = computeCapacity(o)
      return {
        ...o,
        capacity:      cap,
        available:     cap - o.usedPorts,
        customerCount: o._count.customers,
      }
    }))
  } catch (e) { next(e) }
})

// ── GET /api/odp/customers  — all customers (for FTTH map) ───────────────────
router.get('/customers', async (req, res, next) => {
  try {
    const { odpId, status } = req.query
    const where = {}
    if (odpId)  where.odpId = odpId
    if (status) where.serviceStatus = status.toUpperCase()

    const customers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        customerId: true,
        name: true,
        address: true,
        lat: true,
        lng: true,
        odpId: true,
        serviceStatus: true,
        packageName: true,
        onuSn: true,
      },
      orderBy: { name: 'asc' },
    })
    res.json(customers)
  } catch (e) { next(e) }
})

// ── GET /api/odp/:id ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const odp = await prisma.odp.findUnique({
      where: { id: req.params.id },
      include: {
        odc: { select: { id: true, name: true, oltId: true, ponPort: true } },
        olt: { select: { id: true, name: true, ip: true } },
        uplinkOdp: { select: { id: true, name: true } },
        downlinkOdps: { select: { id: true, name: true, uplinkOdpCore: true, status: true, usedPorts: true, splitterRatio: true } },
        splitters: {
          include: { splitterType: true, ports: { orderBy: { portNumber: 'asc' } } },
          orderBy: { sequenceOrder: 'asc' }
        },
        customers: {
          orderBy: { odpPort: 'asc' },
        },
      },
    })
    if (!odp) return res.status(404).json({ error: 'ODP not found' })

    const cap = computeCapacity(odp)
    res.json({
      ...odp,
      capacity:  cap,
      available: cap - odp.usedPorts,
    })
  } catch (e) { next(e) }
})

// ── POST /api/odp ─────────────────────────────────────────────────────────────
router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const {
      name, address, lat, lng,
      uplinkType, odcId, oltId, ponPort,
      uplinkOdpId, uplinkPort,
      feederLabel, feederCores, feederCore, feederPass,
      fiberLength, inputPower,
      splitterRatio, splitters,
      mountType, brand, status, installDate, pic, notes,
    } = req.body

    if (!name) return res.status(400).json({ error: 'name required' })

    // Inherit OLT/PON from parent ODC or ODP if not explicitly provided
    let resolvedOltId  = oltId  || null
    let resolvedPon    = ponPort || null
    if (uplinkType === 'odc' && odcId && (!resolvedOltId || !resolvedPon)) {
      const parentOdc = await prisma.odc.findUnique({ where: { id: odcId }, select: { oltId: true, ponPort: true } })
      if (parentOdc) {
        resolvedOltId = resolvedOltId || parentOdc.oltId
        resolvedPon   = resolvedPon   || parentOdc.ponPort
      }
    }
    if (uplinkType === 'odp' && uplinkOdpId && (!resolvedOltId || !resolvedPon)) {
      const parentOdp = await prisma.odp.findUnique({ where: { id: uplinkOdpId }, select: { oltId: true, ponPort: true } })
      if (parentOdp) {
        resolvedOltId = resolvedOltId || parentOdp.oltId
        resolvedPon   = resolvedPon   || parentOdp.ponPort
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const odp = await tx.odp.create({
        data: {
          name, address,
          lat: lat ? Number(lat) : null,
          lng: lng ? Number(lng) : null,
          uplinkType:  uplinkType || 'odc',
          odcId:       uplinkType === 'odc' ? (odcId || null) : null,
          uplinkOdpId: uplinkType === 'odp' ? (uplinkOdpId || null) : null,
          uplinkPort:  uplinkPort || null,
          oltId:       resolvedOltId,
          ponPort:     resolvedPon,
          feederLabel, feederCore,
          feederCores: feederCores != null ? Number(feederCores) : null,
          feederPass:  feederPass || null,
          fiberLength: fiberLength != null ? Number(fiberLength) : null,
          inputPower:  inputPower != null ? Number(inputPower) : null,
          splitterRatio: splitterRatio || null,
          mountType,   brand,
          status:      status?.toUpperCase() || 'ACTIVE',
          installDate: installDate ? new Date(installDate) : null,
          pic, notes,
        },
        include: {
          odc: { select: { id: true, name: true } },
          olt: { select: { id: true, name: true, ip: true } },
        },
      })

      // Connect the upstream splitter port
      if (uplinkPort) {
        const [splitterId, portNumber] = uplinkPort.split('-')
        if (splitterId && portNumber) {
          await tx.splitterPort.updateMany({
            where: {
              splitterInstanceId: splitterId,
              portNumber: parseInt(portNumber)
            },
            data: {
              connectionStatus: 'CONNECTED',
              connectedToType: 'ODP',
              connectedToId: odp.id
            }
          })
          console.log(`🔗 Connected SplitterPort ${splitterId}:${portNumber} → ODP ${odp.name}`)
        }
      }

      // Create splitters if provided
      if (splitters && splitters.length > 0) {
        const allTypes = await tx.splitterType.findMany()
        for (const sp of splitters) {
          let typeId = sp.splitterTypeId || sp.type?.id
          if (!typeId) continue
          let splitterType = allTypes.find(t => t.id === typeId)
          if (!splitterType) {
            const codeMatch = typeId.match(/R1_(\d+)/)
            const code = codeMatch ? `1:${codeMatch[1]}` : typeId
            splitterType = allTypes.find(t => t.code === code)
          }
          if (!splitterType) continue

          const inst = await tx.splitterInstance.create({
            data: {
              parentType: 'ODP',
              odpId: odp.id,
              splitterTypeId: splitterType.id,
              sequenceOrder: sp.sequenceOrder || 1,
              position: sp.position || 'Slot A',
              portMappings: sp.portMappings || [],
              inputPower: sp.inputPower != null ? Number(sp.inputPower) : null,
            }
          })
          const outputCount = splitterType.outputCount || sp.outputs || 8
          const portData = []
          for (let i = 1; i <= outputCount; i++) {
            const mapping = (sp.portMappings || []).find(p => p.portNum === i)
            portData.push({
              splitterInstanceId: inst.id,
              portNumber: i,
              portLabel: `Port ${i}`,
              portType: 'OUTPUT',
              connectionStatus: mapping ? 'CONNECTED' : 'AVAILABLE',
              connectedToType: mapping?.connectionType || null,
              connectedToId: mapping?.assignedTo || null,
              attenuation: splitterType.category === 'SYMMETRIC'
                ? splitterType.attEqual
                : (i === 1 ? splitterType.attLowOut : splitterType.attHighOut),
            })
          }
          if (portData.length > 0) {
            await tx.splitterPort.createMany({ data: portData })
          }
          console.log(`📦 Created splitter ${splitterType.name} (${outputCount} ports) for ODP ${odp.name}`)
        }
      }

      return odp
    })

    await syncOdcUsedPorts(result.odcId)

    res.status(201).json({ ...result, capacity: ratioToCapacity(result.splitterRatio), available: ratioToCapacity(result.splitterRatio) })
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'ODP name already exists' })
    next(e)
  }
})

// ── PATCH /api/odp/:id ────────────────────────────────────────────────────────
router.patch('/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const old = await tx.odp.findUnique({ 
        where: { id: req.params.id }, 
        select: { odcId: true, oltId: true, ponPort: true, uplinkPort: true, uplinkOdpId: true, uplinkType: true } 
      })
      if (!old) return res.status(404).json({ error: 'ODP not found' })

      const allowed = [
        'name','address','lat','lng','uplinkType','odcId','oltId','ponPort',
        'uplinkOdpId','uplinkPort',
        'feederLabel','feederCores','feederCore','feederPass',
        'fiberLength','inputPower','splitterRatio','splitters',
        'mountType','brand','status','installDate','pic','notes',
      ]
      const data = {}
      for (const k of allowed) {
        if (req.body[k] !== undefined) {
          if (k === 'lat' || k === 'lng') data[k] = req.body[k] !== null ? Number(req.body[k]) : null
          else if (k === 'feederCores' || k === 'fiberLength' || k === 'inputPower') data[k] = req.body[k] != null ? Number(req.body[k]) : null
          else if (k === 'status')        data[k] = req.body[k].toUpperCase()
          else if (k === 'installDate')   data[k] = req.body[k] ? new Date(req.body[k]) : null
          else if (k === 'splitters') continue // handled separately
          else data[k] = req.body[k]
        }
      }

      // Inherit OLT/PON if odcId changed
      if (data.odcId && !data.oltId) {
        const parentOdc = await tx.odc.findUnique({ where: { id: data.odcId }, select: { oltId: true, ponPort: true } })
        if (parentOdc) { data.oltId = parentOdc.oltId; data.ponPort = parentOdc.ponPort }
      }
      // Inherit OLT/PON if uplinkOdpId changed
      if (data.uplinkOdpId && !data.oltId) {
        const parentOdp = await tx.odp.findUnique({ where: { id: data.uplinkOdpId }, select: { oltId: true, ponPort: true } })
        if (parentOdp) { data.oltId = parentOdp.oltId; data.ponPort = parentOdp.ponPort }
      }

      // ── Release old splitter port if port changed ──
      const newUplinkPort = data.uplinkPort !== undefined ? data.uplinkPort : old.uplinkPort
      if (old.uplinkPort && old.uplinkPort !== newUplinkPort) {
        const [oldSplitterId, oldPortNumber] = old.uplinkPort.split('-')
        if (oldSplitterId && oldPortNumber) {
          await tx.splitterPort.updateMany({
            where: {
              splitterInstanceId: oldSplitterId,
              portNumber: parseInt(oldPortNumber),
              connectedToId: req.params.id
            },
            data: {
              connectionStatus: 'AVAILABLE',
              connectedToType: null,
              connectedToId: null
            }
          })
          console.log(`🔓 Released SplitterPort ${oldSplitterId}:${oldPortNumber} from ODP ${req.params.id}`)
        }
      }

      // ── Connect new splitter port ──
      if (newUplinkPort && newUplinkPort !== old.uplinkPort) {
        const [newSplitterId, newPortNumber] = newUplinkPort.split('-')
        if (newSplitterId && newPortNumber) {
          await tx.splitterPort.updateMany({
            where: {
              splitterInstanceId: newSplitterId,
              portNumber: parseInt(newPortNumber)
            },
            data: {
              connectionStatus: 'CONNECTED',
              connectedToType: 'ODP',
              connectedToId: req.params.id
            }
          })
          console.log(`🔗 Connected SplitterPort ${newSplitterId}:${newPortNumber} → ODP ${req.params.id}`)
        }
      }

      // Update ODP
      const odp = await tx.odp.update({
        where: { id: req.params.id },
        data,
        include: {
          odc: { select: { id: true, name: true } },
          olt: { select: { id: true, name: true, ip: true } },
        },
      })

      // ── Sync splitters if provided ──
      const splitters = req.body.splitters
      if (splitters !== undefined) {
        const existingSplitters = await tx.splitterInstance.findMany({
          where: { odpId: req.params.id },
          include: { ports: true }
        })
        const allTypes = await tx.splitterType.findMany()
        const resolveST = (tid) => {
          if (!tid) return null
          let st = allTypes.find(t => t.id === tid)
          if (!st) {
            const m = tid.match(/R1_(\d+)/)
            const code = m ? `1:${m[1]}` : tid
            st = allTypes.find(t => t.code === code)
          }
          return st
        }

        const newSplitters = splitters.filter(s => !s.id || s.id.startsWith('temp-') || s.id.startsWith('legacy-'))
        const updateSplitters = splitters.filter(s => s.id && !s.id.startsWith('temp-') && !s.id.startsWith('legacy-'))
        const updateIds = updateSplitters.map(s => s.id)
        const deleteSplitters = existingSplitters.filter(s => !updateIds.includes(s.id))

        // Delete removed
        for (const sp of deleteSplitters) {
          await tx.splitterInstance.delete({ where: { id: sp.id } })
        }

        // Update existing
        for (const sp of updateSplitters) {
          const splitterType = resolveST(sp.splitterTypeId || sp.type?.id)
          if (!splitterType) continue
          await tx.splitterInstance.update({
            where: { id: sp.id },
            data: {
              splitterTypeId: splitterType.id,
              sequenceOrder: sp.sequenceOrder || 1,
              position: sp.position || 'Slot A',
              portMappings: sp.portMappings || [],
              inputPower: sp.inputPower != null ? Number(sp.inputPower) : null,
            }
          })
          await tx.splitterPort.deleteMany({ where: { splitterInstanceId: sp.id } })
          const outputCount = splitterType.outputCount || sp.outputs || 8
          const portData = []
          for (let i = 1; i <= outputCount; i++) {
            const mapping = (sp.portMappings || []).find(p => p.portNum === i)
            portData.push({
              splitterInstanceId: sp.id, portNumber: i, portLabel: `Port ${i}`, portType: 'OUTPUT',
              connectionStatus: mapping ? 'CONNECTED' : 'AVAILABLE',
              connectedToType: mapping?.connectionType || null, connectedToId: mapping?.assignedTo || null,
              attenuation: splitterType.category === 'SYMMETRIC'
                ? splitterType.attEqual : (i === 1 ? splitterType.attLowOut : splitterType.attHighOut),
            })
          }
          if (portData.length > 0) await tx.splitterPort.createMany({ data: portData })
        }

        // Create new
        for (const sp of newSplitters) {
          const splitterType = resolveST(sp.splitterTypeId || sp.type?.id)
          if (!splitterType) continue
          const inst = await tx.splitterInstance.create({
            data: {
              parentType: 'ODP', odpId: req.params.id,
              splitterTypeId: splitterType.id,
              sequenceOrder: sp.sequenceOrder || 1,
              position: sp.position || 'Slot A',
              portMappings: sp.portMappings || [],
              inputPower: sp.inputPower != null ? Number(sp.inputPower) : null,
            }
          })
          const outputCount = splitterType.outputCount || sp.outputs || 8
          const portData = []
          for (let i = 1; i <= outputCount; i++) {
            const mapping = (sp.portMappings || []).find(p => p.portNum === i)
            portData.push({
              splitterInstanceId: inst.id, portNumber: i, portLabel: `Port ${i}`, portType: 'OUTPUT',
              connectionStatus: mapping ? 'CONNECTED' : 'AVAILABLE',
              connectedToType: mapping?.connectionType || null, connectedToId: mapping?.assignedTo || null,
              attenuation: splitterType.category === 'SYMMETRIC'
                ? splitterType.attEqual : (i === 1 ? splitterType.attLowOut : splitterType.attHighOut),
            })
          }
          if (portData.length > 0) await tx.splitterPort.createMany({ data: portData })
          console.log(`📦 Created splitter ${splitterType.name} (${outputCount} ports) for ODP ${req.params.id}`)
        }
      }

      // Handle OLT/PON cascade updates (using pre-update 'old' values)
      const oltChanged = data.oltId && data.oltId !== old.oltId
      const ponChanged = data.ponPort && data.ponPort !== old.ponPort
      
      if (oltChanged || ponChanged) {
        const newOltId = data.oltId || old.oltId
        const newPonPort = data.ponPort || old.ponPort
        
        console.log(`🔄 Starting cascade update for ODP ${req.params.id}: OLT ${old.oltId}→${newOltId}, PON ${old.ponPort}→${newPonPort}`)
        
        // Update all downstream recursively
        const cascadeResult = await cascadeUpdateDownstreamOdp(
          req.params.id, 
          newOltId, 
          newPonPort, 
          tx, 
          0, // depth
          req.user.id,
          req.user.name || req.user.username
        )
        
        console.log(`✅ Cascade update completed: ${cascadeResult.updated} ODPs updated`)
        if (cascadeResult.errors.length > 0) {
          console.warn(`⚠️ Cascade errors:`, cascadeResult.errors)
        }
      }

      // Sync both old and new ODC usedPorts
      await syncOdcUsedPorts(old.odcId)
      if (data.odcId && data.odcId !== old.odcId) await syncOdcUsedPorts(data.odcId)

      return odp
    })

    res.json({ ...result, capacity: ratioToCapacity(result.splitterRatio), available: ratioToCapacity(result.splitterRatio) - result.usedPorts })
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'ODP name already exists' })
    next(e)
  }
})

// ── DELETE /api/odp/:id ───────────────────────────────────────────────────────
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const odp = await prisma.odp.findUnique({ 
      where: { id: req.params.id }, 
      select: { name: true, odcId: true, uplinkPort: true } 
    })
    if (!odp) return res.status(404).json({ error: 'ODP not found' })

    await prisma.$transaction(async (tx) => {
      // Release the upstream splitter port this ODP is connected to
      if (odp.uplinkPort) {
        const [splitterId, portNumber] = odp.uplinkPort.split('-')
        if (splitterId && portNumber) {
          await tx.splitterPort.updateMany({
            where: {
              splitterInstanceId: splitterId,
              portNumber: parseInt(portNumber),
              connectedToId: req.params.id
            },
            data: {
              connectionStatus: 'AVAILABLE',
              connectedToType: null,
              connectedToId: null
            }
          })
          console.log(`🔓 Released upstream SplitterPort ${splitterId}:${portNumber} from ODP ${odp.name}`)
        }
      }

      // Release any other splitter ports connected to this ODP (fallback for data without uplinkPort)
      const connectedPorts = await tx.splitterPort.findMany({
        where: { connectedToType: 'ODP', connectedToId: req.params.id }
      })

      if (connectedPorts.length > 0) {
        await tx.splitterPort.updateMany({
          where: { connectedToType: 'ODP', connectedToId: req.params.id },
          data: {
            connectionStatus: 'AVAILABLE',
            connectedToType: null,
            connectedToId: null
          }
        })

        console.log(`🔓 Released ${connectedPorts.length} port(s) connected to ODP ${odp.name}`)
      }

      // Delete the ODP
      await tx.odp.delete({ where: { id: req.params.id } })
    })

    await syncOdcUsedPorts(odp.odcId)
    res.status(204).end()
  } catch (e) { next(e) }
})

export default router
