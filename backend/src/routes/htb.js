import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { authenticate, requireRole } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

// ── Preset Port Generator Helper ──────────────────────────────────────────────

export function generatePresetPorts(modelType, foVariant = 'ABB', customPorts = []) {
  if (modelType === 'CUSTOM' && Array.isArray(customPorts) && customPorts.length > 0) {
    return customPorts.map((p, idx) => ({
      portType: p.portType || 'LAN',
      portIndex: p.portIndex || (idx + 1),
      label: p.label || `${p.portType || 'LAN'}-${idx + 1}`,
      wavelength: p.portType === 'FO' ? (p.wavelength || '1310') : null,
      role: p.role || 'UNUSED',
      status: 'AVAILABLE',
      connectedToType: 'NONE',
    }))
  }

  if (modelType === 'SINGLE_1FO_1LAN') {
    const isSideB = String(foVariant).toUpperCase() === 'B'
    return [
      {
        portType: 'FO',
        portIndex: 1,
        label: isSideB ? 'FO-1 (B/1550)' : 'FO-1 (A/1310)',
        wavelength: isSideB ? '1550' : '1310',
        role: 'UNUSED',
        status: 'AVAILABLE',
        connectedToType: 'NONE',
      },
      {
        portType: 'LAN',
        portIndex: 1,
        label: 'LAN-1',
        wavelength: null,
        role: 'UNUSED',
        status: 'AVAILABLE',
        connectedToType: 'NONE',
      },
    ]
  }

  if (modelType === 'SWITCH_6FO_2LAN') {
    // 6 FO (3x A [1310nm], 3x B [1550nm]) + 2 LAN - ALL UNUSED BY DEFAULT
    const ports = []
    for (let i = 1; i <= 3; i++) {
      ports.push({
        portType: 'FO',
        portIndex: i,
        label: `FO-${i} (A/1310)`,
        wavelength: '1310',
        role: 'UNUSED',
        status: 'AVAILABLE',
        connectedToType: 'NONE',
      })
    }
    for (let i = 4; i <= 6; i++) {
      ports.push({
        portType: 'FO',
        portIndex: i,
        label: `FO-${i} (B/1550)`,
        wavelength: '1550',
        role: 'UNUSED',
        status: 'AVAILABLE',
        connectedToType: 'NONE',
      })
    }
    ports.push(
      { portType: 'LAN', portIndex: 1, label: 'LAN-1', wavelength: null, role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
      { portType: 'LAN', portIndex: 2, label: 'LAN-2', wavelength: null, role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
    )
    return ports
  }

  // Default: SWITCH_3FO_2LAN - ALL UNUSED BY DEFAULT
  const variant = String(foVariant).toUpperCase() === 'AAB' ? 'AAB' : 'ABB'
  const ports = []
  if (variant === 'AAB') {
    ports.push(
      { portType: 'FO', portIndex: 1, label: 'FO-1 (A/1310)', wavelength: '1310', role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
      { portType: 'FO', portIndex: 2, label: 'FO-2 (A/1310)', wavelength: '1310', role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
      { portType: 'FO', portIndex: 3, label: 'FO-3 (B/1550)', wavelength: '1550', role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
    )
  } else {
    // ABB
    ports.push(
      { portType: 'FO', portIndex: 1, label: 'FO-1 (A/1310)', wavelength: '1310', role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
      { portType: 'FO', portIndex: 2, label: 'FO-2 (B/1550)', wavelength: '1550', role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
      { portType: 'FO', portIndex: 3, label: 'FO-3 (B/1550)', wavelength: '1550', role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
    )
  }
  ports.push(
    { portType: 'LAN', portIndex: 1, label: 'LAN-1', wavelength: null, role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
    { portType: 'LAN', portIndex: 2, label: 'LAN-2', wavelength: null, role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
  )
  return ports
}

// ── GET /api/htb-boxes (List with stats) ───────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { q, modelType, status } = req.query
    const where = {}

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { powerNotes: { contains: q, mode: 'insensitive' } },
      ]
    }
    if (modelType) where.modelType = modelType
    if (status) where.status = status

    const boxes = await prisma.htbBox.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        ports: {
          orderBy: [{ portType: 'asc' }, { portIndex: 'asc' }],
          include: {
            customers: {
              select: { id: true, name: true, customerId: true, connectionStatus: true, pppoeUsername: true },
            },
          },
        },
        uplinkHtb: { select: { id: true, name: true } },
        uplinkCustomer: { select: { id: true, name: true, customerId: true, address: true, phone: true } },
        hostCustomer: { select: { id: true, name: true, customerId: true, address: true, phone: true } },
        _count: {
          select: {
            customers: true,
            downlinkBoxes: true,
          },
        },
      },
    })

    // Compute port summary per box
    const result = boxes.map(b => {
      const totalPorts = b.ports.length
      const foPorts = b.ports.filter(p => p.portType === 'FO')
      const lanPorts = b.ports.filter(p => p.portType === 'LAN')
      const usedPorts = b.ports.filter(p => (p.role && p.role !== 'UNUSED') || p.customers.length > 0).length
      const freePorts = totalPorts - usedPorts

      return {
        ...b,
        stats: {
          totalPorts,
          foCount: foPorts.length,
          lanCount: lanPorts.length,
          usedPorts,
          freePorts,
        },
      }
    })

    res.json(result)
  } catch (err) {
    console.error('Error fetching HTB boxes:', err)
    res.status(500).json({ error: 'Gagal mengambil data HTB Box' })
  }
})

// ── GET /api/htb-boxes/:id (Detail with ports & relations) ─────────────────────
router.get('/:id', async (req, res) => {
  try {
    const box = await prisma.htbBox.findUnique({
      where: { id: req.params.id },
      include: {
        ports: {
          orderBy: [{ portType: 'asc' }, { portIndex: 'asc' }],
          include: {
            customers: {
              select: {
                id: true,
                name: true,
                customerId: true,
                phone: true,
                address: true,
                pppoeUsername: true,
                connectionStatus: true,
                packageName: true,
                cpeType: true,
              },
            },
          },
        },
        uplinkHtb: {
          select: { id: true, name: true, modelType: true, address: true, lat: true, lng: true },
        },
        downlinkBoxes: {
          select: { id: true, name: true, modelType: true, uplinkPortLabel: true, address: true },
        },
        uplinkCustomer: {
          select: {
            id: true,
            name: true,
            customerId: true,
            phone: true,
            address: true,
            onuSn: true,
            rxPower: true,
            connectionStatus: true,
            odp: { select: { id: true, name: true } },
          },
        },
        hostCustomer: {
          select: { id: true, name: true, customerId: true, phone: true, address: true },
        },
      },
    })

    if (!box) return res.status(404).json({ error: 'HTB Box tidak ditemukan' })
    res.json(box)
  } catch (err) {
    console.error('Error fetching HTB box detail:', err)
    res.status(500).json({ error: 'Gagal mengambil detail HTB Box' })
  }
})

// ── POST /api/htb-boxes (Create box + auto-generate ports) ─────────────────────
router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  try {
    const {
      name,
      code,
      address,
      lat,
      lng,
      modelType = 'SWITCH_3FO_2LAN',
      foVariant = 'ABB',
      mountType = 'POLE',
      powerSource = 'HOST_CUSTOMER_PLN',
      hostCustomerId,
      hasUpsBattery = false,
      powerNotes,
      uplinkType = 'CUSTOMER_ONU',
      uplinkHtbId,
      uplinkPortLabel,
      uplinkCustomerId,
      uplinkOnuPort,
      uplinkLocalPort,
      fiberLength,
      cableLabel,
      notes,
      customPorts,
    } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nama HTB Box wajib diisi' })
    }

    // Check unique name
    const existing = await prisma.htbBox.findUnique({ where: { name: name.trim() } })
    if (existing) {
      return res.status(409).json({ error: `Nama HTB Box "${name.trim()}" sudah digunakan` })
    }

    // Generate ports based on preset (all start clean as UNUSED)
    const portsToCreate = generatePresetPorts(modelType, foVariant, customPorts)

    // Only mark uplink if user explicitly specified uplinkLocalPort
    if (uplinkLocalPort && uplinkLocalPort !== 'NONE') {
      const targetPort = portsToCreate.find(p =>
        p.label === uplinkLocalPort ||
        p.label.startsWith(uplinkLocalPort) ||
        `${p.portType}-${p.portIndex}` === uplinkLocalPort
      )
      if (targetPort) {
        targetPort.role = 'UPLINK'
        targetPort.status = 'CONNECTED'
        targetPort.connectedToType = uplinkType === 'CUSTOMER_ONU' ? 'ONU_UPLINK' : 'HTB_BOX'
      }
    }

    const newBox = await prisma.$transaction(async (tx) => {
      const box = await tx.htbBox.create({
        data: {
          name: name.trim(),
          code: code ? code.trim() : null,
          address: address || null,
          lat: lat !== undefined && lat !== null && lat !== '' ? parseFloat(lat) : null,
          lng: lng !== undefined && lng !== null && lng !== '' ? parseFloat(lng) : null,
          modelType,
          foVariant: foVariant || null,
          mountType: mountType || 'POLE',
          powerSource,
          hostCustomerId: hostCustomerId || null,
          hasUpsBattery: Boolean(hasUpsBattery),
          powerNotes: powerNotes || null,
          uplinkType,
          uplinkHtbId: uplinkType === 'HTB' ? (uplinkHtbId || null) : null,
          uplinkPortLabel: uplinkType === 'HTB' ? (uplinkPortLabel || null) : null,
          uplinkCustomerId: uplinkType === 'CUSTOMER_ONU' ? (uplinkCustomerId || null) : null,
          uplinkOnuPort: uplinkType === 'CUSTOMER_ONU' ? (uplinkOnuPort || 'LAN 1') : null,
          fiberLength: fiberLength ? parseFloat(fiberLength) : null,
          cableLabel: cableLabel || null,
          notes: notes || null,
          ports: {
            create: portsToCreate,
          },
        },
        include: {
          ports: true,
        },
      })
      return box
    })

    res.status(201).json(newBox)
  } catch (err) {
    console.error('Error creating HTB box:', err)
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Nama atau kode HTB Box sudah ada' })
    }
    res.status(500).json({ error: 'Gagal membuat HTB Box: ' + err.message })
  }
})

// ── PATCH /api/htb-boxes/:id (Update box details) ─────────────────────────────
router.patch('/:id', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  try {
    const { id } = req.params
    const {
      name,
      code,
      address,
      lat,
      lng,
      mountType,
      powerSource,
      hostCustomerId,
      hasUpsBattery,
      powerNotes,
      uplinkType,
      uplinkHtbId,
      uplinkPortLabel,
      uplinkCustomerId,
      uplinkOnuPort,
      fiberLength,
      cableLabel,
      status,
      notes,
    } = req.body

    const existing = await prisma.htbBox.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'HTB Box tidak ditemukan' })

    const data = {}
    if (name !== undefined) data.name = name.trim()
    if (code !== undefined) data.code = code ? code.trim() : null
    if (address !== undefined) data.address = address || null
    if (lat !== undefined) data.lat = lat !== null && lat !== '' ? parseFloat(lat) : null
    if (lng !== undefined) data.lng = lng !== null && lng !== '' ? parseFloat(lng) : null
    if (mountType !== undefined) data.mountType = mountType
    if (powerSource !== undefined) data.powerSource = powerSource
    if (hostCustomerId !== undefined) data.hostCustomerId = hostCustomerId || null
    if (hasUpsBattery !== undefined) data.hasUpsBattery = Boolean(hasUpsBattery)
    if (powerNotes !== undefined) data.powerNotes = powerNotes || null
    if (uplinkType !== undefined) data.uplinkType = uplinkType
    if (uplinkHtbId !== undefined) data.uplinkHtbId = uplinkHtbId || null
    if (uplinkPortLabel !== undefined) data.uplinkPortLabel = uplinkPortLabel || null
    if (uplinkCustomerId !== undefined) data.uplinkCustomerId = uplinkCustomerId || null
    if (uplinkOnuPort !== undefined) data.uplinkOnuPort = uplinkOnuPort || null
    if (fiberLength !== undefined) data.fiberLength = fiberLength ? parseFloat(fiberLength) : null
    if (cableLabel !== undefined) data.cableLabel = cableLabel || null
    if (status !== undefined) data.status = status
    if (notes !== undefined) data.notes = notes || null

    const updated = await prisma.htbBox.update({
      where: { id },
      data,
      include: {
        ports: {
          orderBy: [{ portType: 'asc' }, { portIndex: 'asc' }],
          include: {
            customers: { select: { id: true, name: true, customerId: true } },
          },
        },
      },
    })

    res.json(updated)
  } catch (err) {
    console.error('Error updating HTB box:', err)
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Nama atau kode HTB Box sudah digunakan' })
    }
    res.status(500).json({ error: 'Gagal memperbarui HTB Box' })
  }
})

// ── DELETE /api/htb-boxes/:id (Delete with safeguard) ─────────────────────────
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const { id } = req.params

    const box = await prisma.htbBox.findUnique({
      where: { id },
      include: {
        customers: { select: { id: true, name: true } },
        downlinkBoxes: { select: { id: true, name: true } },
        ports: {
          include: {
            customers: { select: { id: true, name: true } },
          },
        },
      },
    })

    if (!box) return res.status(404).json({ error: 'HTB Box tidak ditemukan' })

    const activeCustomers = box.customers.length
    if (activeCustomers > 0) {
      return res.status(409).json({
        error: `Tidak dapat menghapus HTB Box "${box.name}" karena masih memiliki ${activeCustomers} pelanggan terhubung.`,
      })
    }

    if (box.downlinkBoxes.length > 0) {
      const downNames = box.downlinkBoxes.map(b => b.name).join(', ')
      return res.status(409).json({
        error: `Tidak dapat menghapus HTB Box "${box.name}" karena menjadi sumber uplink untuk box lain: ${downNames}.`,
      })
    }

    await prisma.htbBox.delete({ where: { id } })
    res.json({ message: `HTB Box "${box.name}" berhasil dihapus` })
  } catch (err) {
    console.error('Error deleting HTB box:', err)
    res.status(500).json({ error: 'Gagal menghapus HTB Box' })
  }
})

// ── PATCH /api/htb-boxes/:id/ports/:portId (Update port role & configuration) ─
router.patch('/:id/ports/:portId', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  try {
    const { id, portId } = req.params
    const {
      role,
      status,
      label,
      wavelength,
      isReversePoe,
      connectedToType,
      targetHtbId,
      targetPortLabel,
      notes,
    } = req.body

    const port = await prisma.htbPort.findFirst({
      where: { id: portId, htbBoxId: id },
      include: { customers: true },
    })

    if (!port) return res.status(404).json({ error: 'Port HTB tidak ditemukan' })

    // Prevent changing role to UNUSED if a customer is still linked
    if (role === 'UNUSED' && port.customers.length > 0) {
      return res.status(409).json({
        error: `Port "${port.label}" masih digunakan oleh pelanggan "${port.customers[0].name}". Lepaskan sambungan pelanggan terlebih dahulu.`,
      })
    }

    const data = {}
    if (role !== undefined) data.role = role
    if (status !== undefined) data.status = status
    if (label !== undefined) data.label = label
    if (wavelength !== undefined) data.wavelength = wavelength
    if (isReversePoe !== undefined) data.isReversePoe = Boolean(isReversePoe)
    if (connectedToType !== undefined) data.connectedToType = connectedToType
    if (targetHtbId !== undefined) data.targetHtbId = targetHtbId || null
    if (targetPortLabel !== undefined) data.targetPortLabel = targetPortLabel || null
    if (notes !== undefined) data.notes = notes || null

    // Auto set status based on role/connection
    if (role === 'UPLINK' || connectedToType === 'ONU_UPLINK') {
      const box = await prisma.htbBox.findUnique({ where: { id } })
      // Reset any existing UPLINK port on this box so there is never duplicate uplinks
      await prisma.htbPort.updateMany({
        where: { htbBoxId: id, id: { not: portId }, role: 'UPLINK' },
        data: { role: 'UNUSED', status: 'AVAILABLE', connectedToType: 'NONE' },
      })
      data.status = 'CONNECTED'
      data.role = 'UPLINK'
      data.connectedToType = (box && box.uplinkType === 'CUSTOMER_ONU') ? 'ONU_UPLINK' : 'HTB_BOX'
    } else if (role === 'CASCADE' || connectedToType === 'HTB_BOX') {
      data.status = 'CONNECTED'
      data.role = 'CASCADE'
      data.connectedToType = 'HTB_BOX'
    } else if (role === 'LOCAL_AP') {
      data.status = 'CONNECTED'
      data.role = 'LOCAL_AP'
      data.connectedToType = 'LOCAL_AP'
    } else if (role === 'UNUSED' && (!port.customers || port.customers.length === 0)) {
      data.status = 'AVAILABLE'
      data.connectedToType = 'NONE'
      data.targetHtbId = null
      data.targetPortLabel = null
    }

    const updated = await prisma.htbPort.update({
      where: { id: portId },
      data,
      include: {
        customers: { select: { id: true, name: true, customerId: true } },
      },
    })

    res.json(updated)
  } catch (err) {
    console.error('Error updating HTB port:', err)
    res.status(500).json({ error: 'Gagal memperbarui port HTB' })
  }
})

export default router
