import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { logPortChange } from '../lib/portChangeLogger.js'

const router = Router()
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Recompute usedPorts = count of ODPs linked to this ODC */
async function syncUsedPorts(odcId) {
  const count = await prisma.odp.count({ where: { odcId } })
  await prisma.odc.update({ where: { id: odcId }, data: { usedPorts: count } })
}

/** Map SplitterRatio enum → numeric capacity (legacy) */
function ratioToCapacity(ratio) {
  const map = { R1_2: 2, R1_4: 4, R1_8: 8, R1_16: 16, R1_32: 32 }
  return map[ratio] || null
}

/** Recursive cascade update OLT/PON for downstream ODP chain (ODP → child ODPs) */
async function cascadeUpdateOdpChain(odpId, newOltId, newPonPort, tx, depth, changedBy, changedByName) {
  if (depth > 10) return { updated: 0, errors: ['ODP cascade depth exceeded'] }

  let totalUpdated = 0
  const errors = []

  const childOdps = await tx.odp.findMany({
    where: { uplinkOdpId: odpId },
    select: { id: true, name: true, oltId: true, ponPort: true }
  })

  for (const child of childOdps) {
    try {
      const needsUpdate = (newOltId && child.oltId !== newOltId) || (newPonPort && child.ponPort !== newPonPort)
      if (needsUpdate) {
        const oldOltId = child.oltId
        const oldPonPort = child.ponPort
        await tx.odp.update({
          where: { id: child.id },
          data: { oltId: newOltId || child.oltId, ponPort: newPonPort || child.ponPort }
        })
        await tx.cascadeChangeLog.create({
          data: {
            entityId: child.id, entityName: child.name, cascadeLevel: depth + 1,
            oldOltId, oldPonPort,
            newOltId: newOltId || child.oltId, newPonPort: newPonPort || child.ponPort,
            changedBy, changedByName,
            reason: `Cascade update from parent ODP (${odpId})`
          }
        })
        totalUpdated++
        console.log(`  ↳ Cascade ODP ${child.name}: OLT ${oldOltId}→${newOltId || child.oltId}, PON ${oldPonPort}→${newPonPort || child.ponPort}`)
      }
      const sub = await cascadeUpdateOdpChain(child.id, newOltId, newPonPort, tx, depth + 1, changedBy, changedByName)
      totalUpdated += sub.updated
      errors.push(...sub.errors)
    } catch (err) {
      errors.push(`Failed to update ODP ${child.name}: ${err.message}`)
    }
  }
  return { updated: totalUpdated, errors }
}

/** Cascade OLT/PON to all ODPs connected to an ODC (and their downstream ODP chains) */
async function cascadeUpdateOdpsOfOdc(odcId, newOltId, newPonPort, tx, depth, changedBy, changedByName) {
  let totalUpdated = 0
  const errors = []

  const odps = await tx.odp.findMany({
    where: { odcId },
    select: { id: true, name: true, oltId: true, ponPort: true }
  })

  for (const odp of odps) {
    try {
      const needsUpdate = (newOltId && odp.oltId !== newOltId) || (newPonPort && odp.ponPort !== newPonPort)
      if (needsUpdate) {
        const oldOltId = odp.oltId
        const oldPonPort = odp.ponPort
        await tx.odp.update({
          where: { id: odp.id },
          data: { oltId: newOltId || odp.oltId, ponPort: newPonPort || odp.ponPort }
        })
        await tx.cascadeChangeLog.create({
          data: {
            entityId: odp.id, entityName: odp.name, cascadeLevel: depth + 1,
            oldOltId, oldPonPort,
            newOltId: newOltId || odp.oltId, newPonPort: newPonPort || odp.ponPort,
            changedBy, changedByName,
            reason: `Cascade update from parent ODC (${odcId})`
          }
        })
        totalUpdated++
        console.log(`  ↳ Cascade ODP ${odp.name}: OLT ${oldOltId}→${newOltId || odp.oltId}, PON ${oldPonPort}→${newPonPort || odp.ponPort}`)
      }
      // Also cascade to child ODPs of this ODP
      const sub = await cascadeUpdateOdpChain(odp.id, newOltId, newPonPort, tx, depth + 1, changedBy, changedByName)
      totalUpdated += sub.updated
      errors.push(...sub.errors)
    } catch (err) {
      errors.push(`Failed to update ODP ${odp.name}: ${err.message}`)
    }
  }
  return { updated: totalUpdated, errors }
}

/** Recursive cascade update OLT/PON for all downstream ODCs + their ODPs */
async function cascadeUpdateDownstream(odcId, newOltId, newPonPort, tx, depth = 0, changedBy = null, changedByName = null) {
  // Prevent infinite recursion
  if (depth > 10) {
    console.warn(`Cascade depth exceeded for ODC ${odcId} at depth ${depth}`)
    return { updated: 0, errors: ['Cascade depth exceeded'] }
  }
  
  let totalUpdated = 0
  const errors = []
  
  try {
    // ── 1. Update ODPs connected directly to this ODC ──
    const odpResult = await cascadeUpdateOdpsOfOdc(odcId, newOltId, newPonPort, tx, depth, changedBy, changedByName)
    totalUpdated += odpResult.updated
    errors.push(...odpResult.errors)

    // ── 2. Update downstream ODCs (and their ODPs recursively) ──
    const downstreamOdcs = await tx.odc.findMany({
      where: { uplinkOdcId: odcId },
      select: { 
        id: true, 
        name: true, 
        oltId: true, 
        ponPort: true,
        uplinkOdcId: true,
        uplinkPort: true
      }
    })
    
    for (const downstream of downstreamOdcs) {
      try {
        // Check if OLT/PON needs to be updated
        const oltChanged = newOltId && downstream.oltId !== newOltId
        const ponChanged = newPonPort && downstream.ponPort !== newPonPort
        
        if (oltChanged || ponChanged) {
          const oldOltId = downstream.oltId
          const oldPonPort = downstream.ponPort
          
          // Update OLT/PON for downstream ODC
          await tx.odc.update({
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
              reason: `Cascade update from parent ODC (${odcId})`
            }
          })
          
          totalUpdated++
          console.log(`Cascade updated ${downstream.name}: OLT ${oldOltId}→${newOltId || downstream.oltId}, PON ${oldPonPort}→${newPonPort || downstream.ponPort}`)
        }
        
        // Recursive call for deeper levels (ODCs + their ODPs)
        const childResult = await cascadeUpdateDownstream(
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
        const errorMsg = `Failed to update ${downstream.name}: ${error.message}`
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

/** Calculate total outputs from splitters array */
function calculateTotalOutputs(splitters) {
  if (!splitters || splitters.length === 0) return 0
  return splitters.reduce((sum, s) => {
    const type = s.splitterType
    if (!type) return sum
    return sum + type.outputCount
  }, 0)
}

/** Calculate used outputs from splitters port connections */
function calculateUsedOutputs(splitters) {
  if (!splitters || splitters.length === 0) return 0
  let used = 0
  splitters.forEach(s => {
    if (s.ports) {
      used += s.ports.filter(p => p.connectionStatus === 'CONNECTED').length
    }
  })
  return used
}

// ── GET /api/odc  — list all ODCs ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { oltId, status, search } = req.query

    const where = {}
    if (oltId)  where.oltId  = oltId
    if (status) where.status = status.toUpperCase()
    if (search) where.OR = [
      { name:    { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ]

    // Fetch all ODCs (needed to build cores array for cascade connections)
    const allOdcs = await prisma.odc.findMany({
      select: {
        id: true,
        name: true,
        uplinkOdcId: true,
        uplinkCore: true,
        uplinkPort: true,
      },
      where: { 
        uplinkOdcId: { not: null },
        OR: [
          { uplinkCore: { not: null, not: '' } },
          { uplinkPort: { not: null } }
        ]
      },
    })

    // Group child ODCs by their parent
    const childrenByParent = {}
    allOdcs.forEach(child => {
      if (child.uplinkOdcId && (child.uplinkCore && child.uplinkCore !== '' || child.uplinkPort)) {
        if (!childrenByParent[child.uplinkOdcId]) {
          childrenByParent[child.uplinkOdcId] = []
        }
        childrenByParent[child.uplinkOdcId].push({
          id: child.id,
          name: child.name,
          uplinkCore: child.uplinkCore,
          uplinkPort: child.uplinkPort,
        })
      }
    })

    const odcs = await prisma.odc.findMany({
      where,
      include: {
        olt:  { select: { id: true, name: true, ip: true } },
        uplinkOdc: { select: { id: true, name: true } },
        odps: { select: { id: true, name: true, usedPorts: true, splitterRatio: true } },
        splitters: {
          include: {
            splitterType: true,
            ports: {
              select: {
                id: true,
                portNumber: true,
                portLabel: true,
                portType: true,
                connectionStatus: true,
                connectedToType: true,
                connectedToId: true,
                attenuation: true,
                calculatedRxPower: true,
              }
            }
          },
          orderBy: { sequenceOrder: 'asc' }
        },
      },
      orderBy: { name: 'asc' },
    })

    // Compute capacity and availability from new splitters system
    const result = odcs.map(o => {
      const totalOutputs = calculateTotalOutputs(o.splitters)
      const usedOutputs = calculateUsedOutputs(o.splitters)
      
      return {
        ...o,
        cores: childrenByParent[o.id] || [],
        // New splitter-based calculations
        totalOutputs,
        usedOutputs,
        availableOutputs: totalOutputs - usedOutputs,
        // Legacy fields (for backward compatibility)
        capacity: totalOutputs || ratioToCapacity(o.splitterRatio),
        available: (totalOutputs || ratioToCapacity(o.splitterRatio) || 0) - usedOutputs,
      }
    })

    res.json(result)
  } catch (e) { next(e) }
})

// ── GET /api/odc/:id ──────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const odc = await prisma.odc.findUnique({
      where: { id: req.params.id },
      include: {
        olt:  { select: { id: true, name: true, ip: true, ponCount: true } },
        uplinkOdc: { select: { id: true, name: true } },
        odps: {
          include: {
            _count: { select: { customers: true } },
            splitters: {
              include: {
                splitterType: true,
                ports: true,
              }
            }
          },
          orderBy: { name: 'asc' },
        },
        splitters: {
          include: {
            splitterType: true,
            ports: {
              include: {
                customers: { select: { id: true, name: true } }
              }
            },
            inputConnection: {
              include: {
                fromPort: {
                  include: {
                    splitterInstance: {
                      include: {
                        odc: { select: { id: true, name: true } },
                        odp: { select: { id: true, name: true } }
                      }
                    }
                  }
                }
              }
            }
          },
          orderBy: { sequenceOrder: 'asc' }
        },
      },
    })
    if (!odc) return res.status(404).json({ error: 'ODC not found' })

    // Fetch child ODCs that use this ODC as uplink
    const downlinkOdcs = await prisma.odc.findMany({
      where: { 
        uplinkOdcId: req.params.id,
        OR: [
          { uplinkCore: { not: null, not: '' } },
          { uplinkPort: { not: null } }
        ]
      },
      select: { id: true, name: true, uplinkCore: true, uplinkPort: true },
    })

    // Build cores array from downlink ODCs (cascade connections)
    const cores = (downlinkOdcs || [])
      .filter(child => child.uplinkCore && child.uplinkCore !== '')
      .map(child => ({
        coreNo: parseInt(child.uplinkCore),
        usedBy: child.id,
        usedByName: child.name,
      }))
    
    // Calculate splitter-based metrics
    const totalOutputs = calculateTotalOutputs(odc.splitters)
    const usedOutputs = calculateUsedOutputs(odc.splitters)

    res.json({
      ...odc,
      cores,
      downlinkOdcs,
      // New splitter-based metrics
      totalOutputs,
      usedOutputs,
      availableOutputs: totalOutputs - usedOutputs,
      // Legacy fields
      capacity:  totalOutputs || ratioToCapacity(odc.splitterRatio),
      available: (totalOutputs || ratioToCapacity(odc.splitterRatio) || 0) - usedOutputs,
      odps: odc.odps.map(p => ({
        ...p,
        // Calculate ODP outputs from its splitters
        totalOutputs: calculateTotalOutputs(p.splitters),
        usedOutputs: calculateUsedOutputs(p.splitters),
        // Legacy
        capacity:  ratioToCapacity(p.splitterRatio) || calculateTotalOutputs(p.splitters) || 0,
        available: (ratioToCapacity(p.splitterRatio) || calculateTotalOutputs(p.splitters) || 0) - p._count.customers,
        customerCount: p._count.customers,
      })),
    })
  } catch (e) { next(e) }
})

// ── POST /api/odc ─────────────────────────────────────────────────────────────
router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const {
      name, address, lat, lng,
      uplinkType, oltId, ponPort,
      uplinkOdcId, uplinkCore, uplinkPort,
      feederLabel, feederCores, feederCore,
      splitterRatio, passthrough, cablesOut,
      mountType, brand, status, installDate, pic, notes, photos,
      splitters, inputPower,
    } = req.body

    if (!name)          return res.status(400).json({ error: 'name required' })
    if (!splitterRatio && (!splitters || splitters.length === 0)) {
      return res.status(400).json({ error: 'splitterRatio or splitters required' })
    }

    // Use transaction to create ODC + splitters
    const odc = await prisma.$transaction(async (tx) => {
      // Create ODC
      const newOdc = await tx.odc.create({
        data: {
          name, address,
          lat: lat ? Number(lat) : null,
          lng: lng ? Number(lng) : null,
          uplinkType:   uplinkType || 'olt',
          oltId:        oltId || null,
          ponPort:      ponPort || null,
          uplinkOdcId:  uplinkOdcId || null,
          uplinkCore:   uplinkCore || null,
          uplinkPort:   uplinkPort || null,
          feederLabel, feederCores: feederCores ? Number(feederCores) : null,
          feederCore,   splitterRatio: splitterRatio || (splitters?.[0]?.splitterTypeId ? `R1_${splitters[0].outputs || 8}` : 'R1_8'),
          passthrough:  passthrough ? Number(passthrough) : null,
          cablesOut:    cablesOut || null,
          mountType,    brand,
          status:       status ? status.toUpperCase() : 'ACTIVE',
          installDate:  installDate ? new Date(installDate) : null,
          pic, notes,   photos: photos || null,
          inputPower:   inputPower !== null && inputPower !== undefined ? Number(inputPower) : null,
        },
        include: { olt: { select: { id: true, name: true, ip: true } } },
      })

      // Create splitters if provided
      if (splitters && splitters.length > 0) {
        // Pre-fetch all splitter types for lookup
        const allTypes = await tx.splitterType.findMany()
        
        for (const splitter of splitters) {
          // Get splitter type info - support both ID and code (e.g., "R1_8", "1:8")
          let typeId = splitter.splitterTypeId || splitter.type?.id
          if (!typeId) continue

          // Try find by ID first, then by code
          let splitterType = allTypes.find(t => t.id === typeId)
          if (!splitterType) {
            // Try find by code - convert R1_8 to 1:8 format
            const codeMatch = typeId.match(/R1_(\d+)/)
            const code = codeMatch ? `1:${codeMatch[1]}` : typeId
            splitterType = allTypes.find(t => t.code === code)
          }

          if (!splitterType) continue
          
          // Use actual database ID
          typeId = splitterType.id

          // Create splitter instance
          const newSplitter = await tx.splitterInstance.create({
            data: {
              parentType: 'ODC',
              odcId: newOdc.id,
              splitterTypeId: typeId,
              sequenceOrder: splitter.sequenceOrder || 1,
              position: splitter.position || 'Slot A',
              portMappings: splitter.portMappings || [],
              inputPower: splitter.inputPower !== null && splitter.inputPower !== undefined 
                ? Number(splitter.inputPower) 
                : null,
            },
            include: { splitterType: true }
          })

          // Create ports for this splitter
          const outputCount = splitterType.outputCount || splitter.outputs || 8
          const portData = []
          for (let i = 1; i <= outputCount; i++) {
            const mapping = (splitter.portMappings || []).find(p => p.portNum === i)
            portData.push({
              splitterInstanceId: newSplitter.id,
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
        }
      }

      // Update upstream ODC port status if connected to another ODC
      if (uplinkType === 'odc' && uplinkOdcId && uplinkPort) {
        // Parse uplinkPort format: "splitterId-portNumber"
        const [splitterId, portNumber] = uplinkPort.split('-')
        if (splitterId && portNumber) {
          // Get old port info for logging
          const oldPort = await tx.splitterPort.findFirst({
            where: {
              splitterInstanceId: splitterId,
              portNumber: parseInt(portNumber)
            }
          })

          await tx.splitterPort.updateMany({
            where: {
              splitterInstanceId: splitterId,
              portNumber: parseInt(portNumber)
            },
            data: {
              connectionStatus: 'CONNECTED',
              connectedToType: 'ODC',
              connectedToId: newOdc.id
            }
          })

          // Log the port change
          await logPortChange({
            entityType: 'ODC',
            entityId: newOdc.id,
            oldPortInfo: oldPort ? {
              splitterId: oldPort.splitterInstanceId,
              portNumber: oldPort.portNumber,
              connectionStatus: oldPort.connectionStatus,
              connectedToType: oldPort.connectedToType,
              connectedToId: oldPort.connectedToId
            } : null,
            newPortInfo: {
              splitterId,
              portNumber: parseInt(portNumber),
              connectionStatus: 'CONNECTED',
              connectedToType: 'ODC',
              connectedToId: newOdc.id
            },
            changeType: 'CREATE',
            changedBy: req.user.id,
            changedByName: req.user.name || req.user.username,
            reason: req.body.portChangeReason || 'ODC created with upstream connection'
          })
        }
      }

      // Return created ODC with splitters
      return tx.odc.findUnique({
        where: { id: newOdc.id },
        include: {
          olt: { select: { id: true, name: true, ip: true } },
          splitters: {
            include: {
              splitterType: true,
              ports: true,
            },
            orderBy: { sequenceOrder: 'asc' }
          }
        }
      })
    })

    // Calculate capacity from splitters
    const totalOutputs = calculateTotalOutputs(odc.splitters)
    const usedOutputs = calculateUsedOutputs(odc.splitters)

    res.status(201).json({ 
      ...odc, 
      capacity: totalOutputs || ratioToCapacity(odc.splitterRatio), 
      available: (totalOutputs || ratioToCapacity(odc.splitterRatio)) - usedOutputs 
    })
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'ODC name already exists' })
    next(e)
  }
})

// ── PATCH /api/odc/:id ────────────────────────────────────────────────────────
router.patch('/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res, next) => {
  try {
    const { splitters, inputPower, ...otherFields } = req.body
    
    const allowed = [
      'name','address','lat','lng','uplinkType','oltId','ponPort',
      'uplinkOdcId','uplinkCore','uplinkPort',
      'feederLabel','feederCores','feederCore',
      'splitterRatio','passthrough','cablesOut',
      'mountType','brand','status','installDate','pic','notes','photos',
    ]
    const data = {}
    for (const k of allowed) {
      if (otherFields[k] !== undefined) {
        if (k === 'lat' || k === 'lng' || k === 'feederCores' || k === 'passthrough')
          data[k] = otherFields[k] !== null ? Number(otherFields[k]) : null
        else if (k === 'status') data[k] = otherFields[k].toUpperCase()
        else if (k === 'installDate') data[k] = otherFields[k] ? new Date(otherFields[k]) : null
        else data[k] = otherFields[k]
      }
    }
    
    // Handle inputPower
    if (inputPower !== undefined) {
      data.inputPower = inputPower !== null ? Number(inputPower) : null
    }

    // Use transaction for ODC update + splitters sync
    const odc = await prisma.$transaction(async (tx) => {
      // Capture current state BEFORE update for cascade detection & port release
      const currentOdc = await tx.odc.findUnique({
        where: { id: req.params.id },
        select: { oltId: true, ponPort: true, uplinkType: true, uplinkOdcId: true, uplinkPort: true }
      })

      // Update ODC basic fields
      await tx.odc.update({
        where: { id: req.params.id },
        data,
      })

      // Handle splitters array if provided
      if (splitters !== undefined) {
        // Get existing splitters
        const existingSplitters = await tx.splitterInstance.findMany({
          where: { odcId: req.params.id },
          include: { ports: true }
        })

        // Pre-fetch all splitter types for lookup
        const allTypes = await tx.splitterType.findMany()
        
        // Helper to resolve splitter type
        const resolveSplitterType = (typeId) => {
          if (!typeId) return null
          // Try find by ID first
          let st = allTypes.find(t => t.id === typeId)
          if (!st) {
            // Try find by code - convert R1_8 to 1:8 format
            const codeMatch = typeId.match(/R1_(\d+)/)
            const code = codeMatch ? `1:${codeMatch[1]}` : typeId
            st = allTypes.find(t => t.code === code)
          }
          return st
        }
        
        // Split into new, update, delete
        const newSplitters = splitters.filter(s => !s.id || s.id.startsWith('temp-') || s.id.startsWith('legacy-'))
        const updateSplitters = splitters.filter(s => s.id && !s.id.startsWith('temp-') && !s.id.startsWith('legacy-'))
        const updateIds = updateSplitters.map(s => s.id)
        const deleteSplitters = existingSplitters.filter(s => !updateIds.includes(s.id))

        // Delete removed splitters
        for (const splitter of deleteSplitters) {
          await tx.splitterInstance.delete({ where: { id: splitter.id } })
        }

        // Update existing splitters
        for (const splitter of updateSplitters) {
          const rawTypeId = splitter.splitterTypeId || splitter.type?.id
          const splitterType = resolveSplitterType(rawTypeId)
          if (!splitterType) continue
          const typeId = splitterType.id

          // Update splitter instance
          await tx.splitterInstance.update({
            where: { id: splitter.id },
            data: {
              splitterTypeId: typeId,
              sequenceOrder: splitter.sequenceOrder || 1,
              position: splitter.position || 'Slot A',
              portMappings: splitter.portMappings || [],
              inputPower: splitter.inputPower !== null && splitter.inputPower !== undefined 
                ? Number(splitter.inputPower) 
                : null,
            }
          })

          // Delete old ports
          await tx.splitterPort.deleteMany({ where: { splitterInstanceId: splitter.id } })

          // Create new ports
          const outputCount = splitterType.outputCount || splitter.outputs || 8
          const portData = []
          for (let i = 1; i <= outputCount; i++) {
            const mapping = (splitter.portMappings || []).find(p => p.portNum === i)
            portData.push({
              splitterInstanceId: splitter.id,
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
        }

        // Create new splitters
        for (const splitter of newSplitters) {
          const rawTypeId = splitter.splitterTypeId || splitter.type?.id
          const splitterType = resolveSplitterType(rawTypeId)
          if (!splitterType) continue
          const typeId = splitterType.id

          const newSplitter = await tx.splitterInstance.create({
            data: {
              parentType: 'ODC',
              odcId: req.params.id,
              splitterTypeId: typeId,
              sequenceOrder: splitter.sequenceOrder || 1,
              position: splitter.position || 'Slot A',
              portMappings: splitter.portMappings || [],
              inputPower: splitter.inputPower !== null && splitter.inputPower !== undefined 
                ? Number(splitter.inputPower) 
                : null,
            }
          })

          // Create ports
          const outputCount = splitterType.outputCount || splitter.outputs || 8
          const portData = []
          for (let i = 1; i <= outputCount; i++) {
            const mapping = (splitter.portMappings || []).find(p => p.portNum === i)
            portData.push({
              splitterInstanceId: newSplitter.id,
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
        }
      }

      // Handle upstream ODC port changes (using pre-update currentOdc captured above)
      if (currentOdc.uplinkType === 'odc' && currentOdc.uplinkPort) {
        const shouldReleaseOldPort = 
          // Changing uplink type away from ODC (only if explicitly sent)
          (data.uplinkType && data.uplinkType !== 'odc') ||
          // Changing to different ODC
          (data.uplinkOdcId && data.uplinkOdcId !== currentOdc.uplinkOdcId) ||
          // Changing to different port on same ODC
          (data.uplinkPort && data.uplinkPort !== currentOdc.uplinkPort)

        if (shouldReleaseOldPort) {
          const [oldSplitterId, oldPortNumber] = currentOdc.uplinkPort.split('-')
          if (oldSplitterId && oldPortNumber) {
            // Get old port info for logging
            const oldPort = await tx.splitterPort.findFirst({
              where: {
                splitterInstanceId: oldSplitterId,
                portNumber: parseInt(oldPortNumber)
              }
            })
            
            // Release old port
            await tx.splitterPort.updateMany({
              where: {
                splitterInstanceId: oldSplitterId,
                portNumber: parseInt(oldPortNumber),
                connectedToId: req.params.id // Only release if connected to this ODC
              },
              data: {
                connectionStatus: 'AVAILABLE',
                connectedToType: null,
                connectedToId: null
              }
            })
            
            // Log port release
            await logPortChange({
              entityType: 'ODC',
              entityId: req.params.id,
              oldPortInfo: oldPort ? {
                splitterId: oldPort.splitterInstanceId,
                portNumber: oldPort.portNumber,
                connectionStatus: oldPort.connectionStatus,
                connectedToType: oldPort.connectedToType,
                connectedToId: oldPort.connectedToId
              } : null,
              newPortInfo: null,
              changeType: 'UPDATE',
              changedBy: req.user.id,
              changedByName: req.user.name || req.user.username,
              reason: data.portChangeReason || 'ODC upstream port released'
            })
          }
        }
      }

      // Handle new port connection
      const effectiveUplinkType = data.uplinkType || currentOdc.uplinkType
      const effectiveUplinkOdcId = data.uplinkOdcId || currentOdc.uplinkOdcId
      if (effectiveUplinkType === 'odc' && effectiveUplinkOdcId && data.uplinkPort && data.uplinkPort !== currentOdc.uplinkPort) {
        // Parse new uplinkPort format: "splitterId-portNumber"
        const [newSplitterId, newPortNumber] = data.uplinkPort.split('-')
        if (newSplitterId && newPortNumber) {
          // Get new port info for logging
          const newPort = await tx.splitterPort.findFirst({
            where: {
              splitterInstanceId: newSplitterId,
              portNumber: parseInt(newPortNumber)
            }
          })

          // Connect new port
          await tx.splitterPort.updateMany({
            where: {
              splitterInstanceId: newSplitterId,
              portNumber: parseInt(newPortNumber)
            },
            data: {
              connectionStatus: 'CONNECTED',
              connectedToType: 'ODC',
              connectedToId: req.params.id
            }
          })

          // Log new port connection
          await logPortChange({
            entityType: 'ODC',
            entityId: req.params.id,
            oldPortInfo: null,
            newPortInfo: {
              splitterId: newSplitterId,
              portNumber: parseInt(newPortNumber),
              connectionStatus: 'CONNECTED',
              connectedToType: 'ODC',
              connectedToId: req.params.id
            },
            changeType: 'UPDATE',
            changedBy: req.user.id,
            changedByName: req.user.name || req.user.username,
            reason: data.portChangeReason || 'ODC upstream port connected'
          })
        }
      }

      // Handle OLT/PON cascade updates (using pre-update values captured above)
      const oltChanged = data.oltId && data.oltId !== currentOdc.oltId
      const ponChanged = data.ponPort && data.ponPort !== currentOdc.ponPort
      
      if (oltChanged || ponChanged) {
        const newOltId = data.oltId || currentOdc.oltId
        const newPonPort = data.ponPort || currentOdc.ponPort
        
        console.log(`🔄 Starting cascade update for ODC ${req.params.id}: OLT ${currentOdc.oltId}→${newOltId}, PON ${currentOdc.ponPort}→${newPonPort}`)
        
        // Update all downstream recursively
        const cascadeResult = await cascadeUpdateDownstream(
          req.params.id, 
          newOltId, 
          newPonPort, 
          tx, 
          0, // depth
          req.user.id,
          req.user.name || req.user.username
        )
        
        console.log(`✅ Cascade update completed: ${cascadeResult.updated} ODCs+ODPs updated`)
        if (cascadeResult.errors.length > 0) {
          console.warn(`⚠️ Cascade errors:`, cascadeResult.errors)
        }
      }

      // Return updated ODC with splitters
      return tx.odc.findUnique({
        where: { id: req.params.id },
        include: {
          olt: { select: { id: true, name: true, ip: true } },
          splitters: {
            include: {
              splitterType: true,
              ports: true,
            },
            orderBy: { sequenceOrder: 'asc' }
          }
        }
      })
    })

    // Calculate capacity from splitters
    const totalOutputs = calculateTotalOutputs(odc.splitters)
    const usedOutputs = calculateUsedOutputs(odc.splitters)

    res.json({ 
      ...odc, 
      capacity: totalOutputs || ratioToCapacity(odc.splitterRatio), 
      available: (totalOutputs || ratioToCapacity(odc.splitterRatio)) - usedOutputs 
    })
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'ODC not found' })
    if (e.code === 'P2002') return res.status(409).json({ error: 'ODC name already exists' })
    next(e)
  }
})

// ── DELETE /api/odc/:id ───────────────────────────────────────────────────────
router.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    // Check for connected ODPs
    const odpCount = await prisma.odp.count({ where: { odcId: req.params.id } })
    
    // Check for downstream ODCs
    const downlinkOdcCount = await prisma.odc.count({ 
      where: { 
        uplinkOdcId: req.params.id,
        OR: [
          { uplinkCore: { not: null, not: '' } },
          { uplinkPort: { not: null } }
        ]
      }
    })
    
    // Prevent deletion if there are connected ODPs or downstream ODCs
    if (odpCount > 0 && downlinkOdcCount > 0) {
      return res.status(409).json({ 
        error: `Tidak dapat menghapus ODC yang memiliki ${odpCount} ODP dan ${downlinkOdcCount} ODC downstream terhubung. Hapus ODP dan ODC downstream terlebih dahulu.` 
      })
    } else if (odpCount > 0) {
      return res.status(409).json({ 
        error: `Tidak dapat menghapus ODC yang memiliki ${odpCount} ODP terhubung. Hapus ODP terlebih dahulu.` 
      })
    } else if (downlinkOdcCount > 0) {
      return res.status(409).json({ 
        error: `Tidak dapat menghapus ODC yang memiliki ${downlinkOdcCount} ODC downstream terhubung. Hapus ODC downstream terlebih dahulu.` 
      })
    }
    
    await prisma.$transaction(async (tx) => {
      // Get ODC data before deletion for port release
      const odcToDelete = await tx.odc.findUnique({
        where: { id: req.params.id },
        select: { name: true, uplinkType: true, uplinkOdcId: true, uplinkPort: true }
      })

      // Release uplink port on parent ODC if connected
      if (odcToDelete?.uplinkType === 'odc' && odcToDelete.uplinkPort) {
        const [splitterId, portNumber] = odcToDelete.uplinkPort.split('-')
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

          console.log(`🔓 Released port ${splitterId}-${portNumber} (was connected to ${odcToDelete.name})`)

          // Log port release
          await logPortChange({
            entityType: 'ODC',
            entityId: req.params.id,
            oldPortInfo: {
              splitterId,
              portNumber: parseInt(portNumber),
              connectionStatus: 'CONNECTED',
              connectedToType: 'ODC',
              connectedToId: req.params.id
            },
            newPortInfo: null,
            changeType: 'DELETE',
            changedBy: req.user.id,
            changedByName: req.user.name || req.user.username,
            reason: `ODC ${odcToDelete.name} deleted — uplink port released`
          })
        }
      }

      // Delete the ODC
      await tx.odc.delete({ where: { id: req.params.id } })
    })

    res.status(204).end()
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'ODC not found' })
    next(e)
  }
})

export default router
