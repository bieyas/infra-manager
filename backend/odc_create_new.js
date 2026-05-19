// Fungsi createOdc yang diperbarui dengan logika update port status
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

    // Use transaction to create ODC + splitters + update upstream port
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
              position: splitter.position || null,
              portMappings: splitter.portMappings || [],
              inputPower: splitter.inputPower ? Number(splitter.inputPower) : null,
            },
            include: {
              splitterType: true,
              ports: true,
            },
            orderBy: { sequenceOrder: 'asc' }
          })

          // Create ports for this splitter
          const outputs = splitterType.outputCount
          const portData = []
          for (let i = 1; i <= outputs; i++) {
            const mapping = (splitter.portMappings || []).find(p => p.portNum === i)
            portData.push({
              splitterInstanceId: newSplitter.id,
              portNumber: i,
              portLabel: mapping?.portLabel || `Port ${i}`,
              portType: 'OUTPUT',
              connectionStatus: 'AVAILABLE',
              connectedToType: null,
              connectedToId: null,
              attenuation: mapping?.attenuation ? Number(mapping.attenuation) : null,
              calculatedRxPower: null,
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
        }
      }

      return newOdc
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
