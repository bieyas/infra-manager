import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// ── Helpers ───────────────────────────────────────────────────────────────────

function ratioToCapacity(ratio) {
  if (!ratio) return null
  const map = { R1_2: 2, R1_4: 4, R1_8: 8, R1_16: 16, R1_32: 32, '1:2': 2, '1:4': 4, '1:8': 8, '1:16': 16, '1:32': 32 }
  if (map[ratio]) return map[ratio]
  const m = String(ratio).match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : null
}

/** Hitung kapasitas aktual: prioritas splitters[].ports, lalu splitterRatio */
/** Helper untuk parse uplinkPort baik format compound (splitterId-portNum) atau simple (portNum) */
async function parseUplinkPort(uplinkPort, uplinkOdpId, tx) {
  if (!uplinkPort) return { splitterId: null, portNumber: null };
  const str = String(uplinkPort).trim();
  if (str.includes('-')) {
    const [sId, pNum] = str.split('-');
    return { splitterId: sId, portNumber: parseInt(pNum, 10) };
  }
  if (str.includes(':')) {
    const [sId, pNum] = str.split(':');
    return { splitterId: sId, portNumber: parseInt(pNum, 10) };
  }
  try {
    const directPort = await tx.splitterPort.findUnique({
      where: { id: str },
      select: { splitterInstanceId: true, portNumber: true }
    });
    if (directPort) {
      return { splitterId: directPort.splitterInstanceId, portNumber: directPort.portNumber };
    }
  } catch {}

  if (uplinkOdpId) {
    const parentSplitter = await tx.splitterInstance.findFirst({
      where: { odpId: uplinkOdpId },
      orderBy: { sequenceOrder: 'asc' }
    });
    if (parentSplitter) {
      const pNum = parseInt(str, 10);
      if (!isNaN(pNum)) return { splitterId: parentSplitter.id, portNumber: pNum };
    }
  }
  return { splitterId: null, portNumber: null };
}

function computeCapacity(odp) {
  if (odp.splitters?.length > 0) {
    const fromPorts = odp.splitters.reduce((sum, s) => {
      if (s.ports?.length > 0) {
        const dropPorts = s.ports.filter(p => p.portType !== 'PASS_THROUGH' && p.connectedToType !== 'SPLITTER').length
        return sum + dropPorts
      }
      const isAsym = s.splitterType?.category === 'ASYMMETRIC'
      return sum + (isAsym ? 0 : (s.splitterType?.outputCount ?? 0))
    }, 0)
    if (fromPorts > 0) return fromPorts
  }
  return ratioToCapacity(odp.splitterRatio) ?? 0
}

const SPLICE_LOSS = 0.2

function calcAttenuation(outputs) {
  if (!outputs || outputs <= 1) return 0
  return parseFloat((3.5 + 10 * Math.log10(outputs)).toFixed(2))
}

function computeSplitterPortPowers(splitters, baseInputPower, allTypes) {
  const sorted = [...splitters].sort((a, b) => (a.sequenceOrder || 1) - (b.sequenceOrder || 1))
  const powerAtEachSplitter = []
  let currentFeederPower = baseInputPower != null ? Number(baseInputPower) : null

  return sorted.map((sp, idx) => {
    let typeId = sp.splitterTypeId || sp.type?.id
    let splitterType = allTypes.find(t => t.id === typeId || t.code === typeId)
    if (!splitterType && typeId) {
      const codeMatch = String(typeId).match(/R1_(\d+)/)
      const code = codeMatch ? `1:${codeMatch[1]}` : typeId
      splitterType = allTypes.find(t => t.code === code)
    }

    const isAsym = splitterType?.category === 'ASYMMETRIC'
    const outputCount = splitterType?.outputCount || sp.outputs || (isAsym ? 2 : 8)

    let inputAtThisSplitter = null
    if (idx === 0) {
      inputAtThisSplitter = sp.inputPower != null ? Number(sp.inputPower) : (baseInputPower != null ? Number(baseInputPower) : null)
    } else {
      const prev = powerAtEachSplitter[idx - 1]
      if (prev?.isAsym) {
        if (!isAsym) {
          inputAtThisSplitter = prev.dropPortPower !== null
            ? parseFloat((prev.dropPortPower - SPLICE_LOSS).toFixed(2))
            : null
        } else {
          inputAtThisSplitter = prev.passPortPower !== null
            ? parseFloat((prev.passPortPower - SPLICE_LOSS).toFixed(2))
            : null
        }
      } else {
        inputAtThisSplitter = sp.inputPower != null ? Number(sp.inputPower) : currentFeederPower
      }
    }

    const portPowers = []
    const ports = []
    for (let i = 1; i <= outputCount; i++) {
      const att = isAsym
        ? (i === 1 ? (splitterType?.attLowOut ?? 7.0) : (splitterType?.attHighOut ?? 1.0))
        : (splitterType?.attEqual ?? calcAttenuation(outputCount))
      
      const calcOut = inputAtThisSplitter !== null
        ? parseFloat((inputAtThisSplitter - att).toFixed(2))
        : null

      portPowers.push(calcOut)
      ports.push({
        portNumber: i,
        attenuation: att,
        outputPower: calcOut,
        portType: isAsym ? (i === 1 ? 'DROP' : 'PASS_THROUGH') : 'OUTPUT',
        portLabel: isAsym ? (i === 1 ? 'Port 1 (Drop)' : 'Port 2 (Pass)') : `Port ${i}`
      })
    }

    powerAtEachSplitter.push({
      sequence: sp.sequenceOrder || (idx + 1),
      isAsym,
      inputPower: inputAtThisSplitter,
      dropPortPower: isAsym && portPowers.length >= 1 ? portPowers[0] : null,
      passPortPower: isAsym && portPowers.length >= 2 ? portPowers[1] : null,
    })

    if (isAsym && portPowers.length >= 2) {
      currentFeederPower = portPowers[1]
    }

    return {
      ...sp,
      splitterType,
      inputPower: inputAtThisSplitter,
      calculatedPorts: ports
    }
  })
}

/** After customer save or cascade change, sync usedPorts on parent ODP */
async function syncOdpUsedPorts(odpId, tx = prisma) {
  if (!odpId) return
  const splitterCount = await tx.splitterInstance.count({ where: { odpId } })
  let count = 0
  if (splitterCount > 0) {
    count = await tx.splitterPort.count({
      where: {
        splitterInstance: { odpId },
        connectionStatus: 'CONNECTED',
        connectedToType: { in: ['CUSTOMER', 'ODP'] }
      }
    })
  } else {
    const custCount = await tx.customer.count({ where: { odpId } })
    const dlCount = await tx.odp.count({ where: { uplinkOdpId: odpId } })
    count = custCount + dlCount
  }
  await tx.odp.update({ where: { id: odpId }, data: { usedPorts: count } })
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
    const { oltId, status, search } = req.query

    const where = {}
    if (oltId)  where.oltId  = oltId
    if (status) where.status = status.toUpperCase()
    if (search) where.OR = [
      { name:    { contains: search, mode: 'insensitive' } },
      { address: { contains: search, mode: 'insensitive' } },
    ]

    const odps = await prisma.odp.findMany({
      where,
      include: {
        olt: { select: { id: true, name: true, ip: true } },
        uplinkOdp: { select: { id: true, name: true } },
        downlinkOdps: { select: { id: true, name: true, uplinkPort: true, uplinkOdpCore: true, status: true, usedPorts: true } },
        customers: { select: { id: true, name: true, odpPort: true, splitterPortId: true, serviceStatus: true } },
        splitters: {
          include: {
            splitterType: { select: { outputCount: true, name: true, category: true } },
            ports: {
              select: { id: true, portNumber: true, portLabel: true, portType: true, connectionStatus: true, connectedToType: true, connectedToId: true, outputPower: true },
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
      uplinkType, oltId, ponPort,
      uplinkOdpId, uplinkPort,
      feederLabel, feederCores, feederCore, feederPass,
      fiberLength, inputPower,
      splitterRatio, splitters,
      mountType, brand, status, installDate, pic, notes,
    } = req.body

    if (!name) return res.status(400).json({ error: 'name required' })

    // Inherit OLT/PON from parent ODP if cascade and not explicitly provided
    let resolvedOltId  = oltId  || null
    let resolvedPon    = ponPort || null
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
          uplinkType:  uplinkType || 'olt',
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
          olt: { select: { id: true, name: true, ip: true } },
        },
      })

      // Connect the upstream splitter port
      if (uplinkPort) {
        const { splitterId, portNumber } = await parseUplinkPort(uplinkPort, uplinkOdpId, tx)
        if (splitterId && portNumber) {
          await tx.splitterPort.updateMany({
            where: {
              splitterInstanceId: splitterId,
              portNumber: portNumber
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
        const computed = computeSplitterPortPowers(splitters, odp.inputPower, allTypes)
        const createdInstances = []
        for (const sp of computed) {
          if (!sp.splitterType) continue
          const inst = await tx.splitterInstance.create({
            data: {
              parentType: 'ODP',
              odpId: odp.id,
              splitterTypeId: sp.splitterType.id,
              sequenceOrder: sp.sequenceOrder || 1,
              position: sp.position || (sp.sequenceOrder === 2 ? 'Slot B' : 'Slot A'),
              portMappings: sp.portMappings || [],
              inputPower: sp.inputPower != null ? Number(sp.inputPower) : null,
            }
          })
          createdInstances.push({ sp, inst })
        }

        for (let idx = 0; idx < createdInstances.length; idx++) {
          const { sp, inst } = createdInstances[idx]
          const nextItem = createdInstances[idx + 1]
          const isAsym = sp.splitterType.category === 'ASYMMETRIC'

          const portData = sp.calculatedPorts.map(cp => {
            const mapping = (sp.portMappings || []).find(p => p.portNum === cp.portNumber)
            const isFbtPort1 = isAsym && cp.portNumber === 1
            const feedToNext = isFbtPort1 && nextItem && sp.fbtPort1Mode !== 'CUSTOMER_DROP' && mapping?.connectionType !== 'CUSTOMER'

            let connStatus = mapping ? 'CONNECTED' : 'AVAILABLE'
            let toType = mapping?.connectionType || null
            let toId = mapping?.assignedTo || null
            let label = cp.portLabel

            if (feedToNext) {
              connStatus = 'CONNECTED'
              toType = 'SPLITTER'
              toId = nextItem.inst.id
              label = `Port 1 (Spliced ke ${nextItem.sp.position || 'Slot B'})`
            }

            return {
              splitterInstanceId: inst.id,
              portNumber: cp.portNumber,
              portLabel: label,
              portType: cp.portType,
              connectionStatus: connStatus,
              connectedToType: toType,
              connectedToId: toId,
              attenuation: cp.attenuation,
              outputPower: cp.outputPower,
            }
          })
          if (portData.length > 0) {
            await tx.splitterPort.createMany({ data: portData })
          }
          console.log(`📦 Created splitter ${sp.splitterType.name} (${portData.length} ports) for ODP ${odp.name}`)
        }
        // Sync odp.splitterRatio if primary symmetric splitter exists
        const primarySym = computed.find(s => s.splitterType?.category === "SYMMETRIC")
        if (primarySym) {
          const ratioKey = `R1_${primarySym.splitterType.outputCount}`
          await tx.odp.update({
            where: { id: odp.id },
            data: { splitterRatio: ratioKey }
          })
          odp.splitterRatio = ratioKey
        }
      }

      // Sync usedPorts for upstream ODP and current ODP
      if (odp.uplinkOdpId) {
        await syncOdpUsedPorts(odp.uplinkOdpId, tx)
      }
      await syncOdpUsedPorts(odp.id, tx)

      return odp
    })

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
        select: { oltId: true, ponPort: true, uplinkPort: true, uplinkOdpId: true, uplinkType: true } 
      })
      if (!old) return res.status(404).json({ error: 'ODP not found' })

      const allowed = [
        'name','address','lat','lng','uplinkType','oltId','ponPort',
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

      // Inherit OLT/PON if uplinkOdpId changed
      if (data.uplinkOdpId && data.uplinkOdpId !== old.uplinkOdpId) {
        const parentOdp = await tx.odp.findUnique({ where: { id: data.uplinkOdpId }, select: { oltId: true, ponPort: true } })
        if (parentOdp) {
          if (!data.oltId) data.oltId = parentOdp.oltId
          if (!data.ponPort) data.ponPort = parentOdp.ponPort
        }
      }

      // ?? Uplink change handling (move uplink ODP or change port) ??
      const uplinkChanged = 
        (data.uplinkType !== undefined && data.uplinkType !== old.uplinkType) ||
        (data.uplinkOdpId !== undefined && data.uplinkOdpId !== old.uplinkOdpId) ||
        (data.uplinkPort !== undefined && data.uplinkPort !== old.uplinkPort)

      if (uplinkChanged) {
        // 1. Release any upstream ports currently connected to this ODP
        await tx.splitterPort.updateMany({
          where: {
            connectedToId: req.params.id,
            connectedToType: "ODP"
          },
          data: {
            connectionStatus: "AVAILABLE",
            connectedToType: null,
            connectedToId: null
          }
        })
        console.log(`?? Released all upstream SplitterPorts previously connected to ODP ${req.params.id}`)

        // 2. Connect new upstream port if new uplink is "odp"
        const targetUplinkType = data.uplinkType !== undefined ? data.uplinkType : old.uplinkType
        const targetUplinkOdpId = data.uplinkOdpId !== undefined ? data.uplinkOdpId : old.uplinkOdpId
        const targetUplinkPort = data.uplinkPort !== undefined ? data.uplinkPort : old.uplinkPort

        if (targetUplinkType === "odp" && targetUplinkOdpId && targetUplinkPort) {
          const { splitterId: newSplitterId, portNumber: newPortNumber } = await parseUplinkPort(targetUplinkPort, targetUplinkOdpId, tx)
          if (newSplitterId && newPortNumber) {
            await tx.splitterPort.updateMany({
              where: {
                splitterInstanceId: newSplitterId,
                portNumber: newPortNumber
              },
              data: {
                connectionStatus: "CONNECTED",
                connectedToType: "ODP",
                connectedToId: req.params.id
              }
            })
            console.log(`?? Connected SplitterPort ${newSplitterId}:${newPortNumber} ? ODP ${req.params.id}`)
          }
        }
      }

      const odp = await tx.odp.update({
        where: { id: req.params.id },
        data,
        include: {
          olt: { select: { id: true, name: true, ip: true } },
        },
      })

      // ── Sync splitters if provided ──
      const splitters = req.body.splitters
      const effInputPower = data.inputPower !== undefined ? data.inputPower : odp.inputPower

      if (splitters !== undefined) {
        const existingSplitters = await tx.splitterInstance.findMany({
          where: { odpId: req.params.id },
          include: { ports: true }
        })
        const allTypes = await tx.splitterType.findMany()
        const computed = computeSplitterPortPowers(splitters, effInputPower, allTypes)

        const newSplitters = computed.filter(s => !s.id || String(s.id).startsWith('temp-') || String(s.id).startsWith('legacy-'))
        const updateSplitters = computed.filter(s => s.id && !String(s.id).startsWith('temp-') && !String(s.id).startsWith('legacy-'))
        const updateIds = updateSplitters.map(s => s.id)
        const deleteSplitters = existingSplitters.filter(s => !updateIds.includes(s.id))

        // Delete removed
        for (const sp of deleteSplitters) {
          await tx.splitterInstance.delete({ where: { id: sp.id } })
        }

        // Update existing
        for (const sp of updateSplitters) {
          if (!sp.splitterType) continue
          await tx.splitterInstance.update({
            where: { id: sp.id },
            data: {
              splitterTypeId: sp.splitterType.id,
              sequenceOrder: sp.sequenceOrder || 1,
              position: sp.position || 'Slot A',
              portMappings: sp.portMappings || [],
              inputPower: sp.inputPower != null ? Number(sp.inputPower) : null,
            }
          })
          // Preserve existing connectionStatus and connectedTo if port was already linked
          const oldPorts = existingSplitters.find(s => s.id === sp.id)?.ports || []
          await tx.splitterPort.deleteMany({ where: { splitterInstanceId: sp.id } })
          const isAsym = sp.splitterType.category === 'ASYMMETRIC'
          const nextItem = computed.find(s => (s.sequenceOrder || 1) > (sp.sequenceOrder || 1))

          const portData = sp.calculatedPorts.map(cp => {
            const oldPort = oldPorts.find(p => p.portNumber === cp.portNumber)
            const mapping = (sp.portMappings || []).find(p => p.portNum === cp.portNumber)
            const isFbtPort1 = isAsym && cp.portNumber === 1
            const feedToNext = isFbtPort1 && nextItem && sp.fbtPort1Mode !== 'CUSTOMER_DROP' && mapping?.connectionType !== 'CUSTOMER' && oldPort?.connectedToType !== 'CUSTOMER'

            let connStatus = oldPort?.connectionStatus || (mapping ? 'CONNECTED' : 'AVAILABLE')
            let toType = oldPort?.connectedToType || mapping?.connectionType || null
            let toId = oldPort?.connectedToId || mapping?.assignedTo || null
            let label = cp.portLabel

            if (feedToNext) {
              connStatus = 'CONNECTED'
              toType = 'SPLITTER'
              toId = nextItem.id
              label = `Port 1 (Spliced ke ${nextItem.position || 'Slot B'})`
            } else if (isFbtPort1 && sp.fbtPort1Mode === 'CUSTOMER_DROP' && toType === 'SPLITTER') {
              connStatus = 'AVAILABLE'
              toType = null
              toId = null
              label = 'Port 1 (Drop Pelanggan)'
            }

            return {
              splitterInstanceId: sp.id,
              portNumber: cp.portNumber,
              portLabel: label,
              portType: cp.portType,
              connectionStatus: connStatus,
              connectedToType: toType,
              connectedToId: toId,
              attenuation: cp.attenuation,
              outputPower: cp.outputPower,
            }
          })
          if (portData.length > 0) await tx.splitterPort.createMany({ data: portData })
        }

        // Create new
        for (const sp of newSplitters) {
          if (!sp.splitterType) continue
          const inst = await tx.splitterInstance.create({
            data: {
              parentType: 'ODP', odpId: req.params.id,
              splitterTypeId: sp.splitterType.id,
              sequenceOrder: sp.sequenceOrder || 1,
              position: sp.position || 'Slot A',
              portMappings: sp.portMappings || [],
              inputPower: sp.inputPower != null ? Number(sp.inputPower) : null,
            }
          })
          const portData = sp.calculatedPorts.map(cp => {
            const mapping = (sp.portMappings || []).find(p => p.portNum === cp.portNumber)
            return {
              splitterInstanceId: inst.id,
              portNumber: cp.portNumber,
              portLabel: cp.portLabel,
              portType: cp.portType,
              connectionStatus: mapping ? 'CONNECTED' : 'AVAILABLE',
              connectedToType: mapping?.connectionType || null,
              connectedToId: mapping?.assignedTo || null,
              attenuation: cp.attenuation,
              outputPower: cp.outputPower,
            }
          })
          if (portData.length > 0) await tx.splitterPort.createMany({ data: portData })
          console.log(`📦 Created splitter ${sp.splitterType.name} (${portData.length} ports) for ODP ${req.params.id}`)
        }
        // Sync odp.splitterRatio if primary symmetric splitter exists
        const primarySym = computed.find(s => s.splitterType?.category === "SYMMETRIC")
        if (primarySym) {
          const ratioKey = `R1_${primarySym.splitterType.outputCount}`
          await tx.odp.update({
            where: { id: req.params.id },
            data: { splitterRatio: ratioKey }
          })
          odp.splitterRatio = ratioKey
        }
      } else if (data.inputPower !== undefined) {
        // splitters not provided, but inputPower changed -> recalculate outputPower for all ports
        const existing = await tx.splitterInstance.findMany({
          where: { odpId: req.params.id },
          include: { splitterType: true, ports: true },
          orderBy: { sequenceOrder: 'asc' }
        })
        if (existing.length > 0) {
          const allTypes = await tx.splitterType.findMany()
          const computed = computeSplitterPortPowers(existing, data.inputPower, allTypes)
          for (const sp of computed) {
            await tx.splitterInstance.update({
              where: { id: sp.id },
              data: { inputPower: sp.inputPower != null ? Number(sp.inputPower) : null }
            })
            for (const cp of sp.calculatedPorts) {
              await tx.splitterPort.updateMany({
                where: { splitterInstanceId: sp.id, portNumber: cp.portNumber },
                data: { attenuation: cp.attenuation, outputPower: cp.outputPower }
              })
            }
          }
        }
      }

      // Sync usedPorts for old and target uplink ODPs and current ODP
      if (uplinkChanged) {
        if (old.uplinkOdpId) await syncOdpUsedPorts(old.uplinkOdpId, tx)
        const targetOdpId = data.uplinkOdpId !== undefined ? data.uplinkOdpId : old.uplinkOdpId
        if (targetOdpId) await syncOdpUsedPorts(targetOdpId, tx)
      }
      await syncOdpUsedPorts(req.params.id, tx)

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
      select: { name: true, uplinkPort: true, uplinkOdpId: true } 
    })
    if (!odp) return res.status(404).json({ error: 'ODP not found' })

    await prisma.$transaction(async (tx) => {
      // 1. Release upstream splitter port this ODP is connected to
      if (odp.uplinkPort) {
        const { splitterId, portNumber } = await parseUplinkPort(odp.uplinkPort, odp.uplinkOdpId, tx)
        if (splitterId && portNumber) {
          await tx.splitterPort.updateMany({
            where: {
              splitterInstanceId: splitterId,
              portNumber: portNumber,
              connectedToId: req.params.id
            },
            data: {
              connectionStatus: 'AVAILABLE',
              connectedToType: null,
              connectedToId: null
            }
          })
        }
      }

      // Release any other splitter ports connected to this ODP
      await tx.splitterPort.updateMany({
        where: { connectedToId: req.params.id, connectedToType: 'ODP' },
        data: {
          connectionStatus: 'AVAILABLE',
          connectedToType: null,
          connectedToId: null
        }
      })

      // 2. Detach customers gracefully (avoid FK error on splitterPortId)
      await tx.customer.updateMany({
        where: { odpId: req.params.id },
        data: {
          odpId: null,
          odpPort: null,
          splitterPortId: null
        }
      })

      // 3. Detach child ODPs
      await tx.odp.updateMany({
        where: { uplinkOdpId: req.params.id },
        data: {
          uplinkOdpId: null,
          uplinkPort: null
        }
      })

      // 4. Delete the ODP (splitters and ports cascade automatically via DB schema)
      await tx.odp.delete({ where: { id: req.params.id } })
      if (odp.uplinkOdpId) {
        await syncOdpUsedPorts(odp.uplinkOdpId, tx)
      }
      console.log(`🗑️ Deleted ODP ${odp.name} and unlinked all customer/cascade relations`)
    })

    res.status(204).end()
  } catch (e) { next(e) }
})

export default router
