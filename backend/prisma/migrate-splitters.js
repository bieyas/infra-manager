// Migration script: Convert old splitter data to new multi-splitter system
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const RATIO_MAP = {
  'R1_2': '1:2',
  'R1_4': '1:4',
  'R1_8': '1:8',
  'R1_16': '1:16',
  'R1_32': '1:32',
}

async function migrateOdcSplitters() {
  console.log('🔧 Migrating ODC splitters...')
  
  // Get ODCs that have old splitterRatio but no new splitters yet
  const odcs = await prisma.odc.findMany({
    where: { 
      splitterRatio: { not: null },
      splitters: { none: {} }  // No splitters yet
    },
    include: { odps: { orderBy: { name: 'asc' } } }
  })
  
  for (const odc of odcs) {
    const code = RATIO_MAP[odc.splitterRatio]
    if (!code) {
      console.log(`  ⚠️  Skipping ${odc.name}: unknown ratio ${odc.splitterRatio}`)
      continue
    }
    
    const splitterType = await prisma.splitterType.findUnique({ where: { code } })
    if (!splitterType) {
      console.log(`  ⚠️  Skipping ${odc.name}: splitter type not found for ${code}`)
      continue
    }
    
    // Build port mappings dari ODPs
    const portMappings = odc.odps.map((odp, index) => ({
      portNum: index + 1,
      assignedTo: odp.id,
      assignedToName: odp.name,
      connectionType: 'ODP',
      fiberLength: null,
    }))
    
    // Create SplitterInstance
    const instance = await prisma.splitterInstance.create({
      data: {
        parentType: 'ODC',
        odcId: odc.id,
        splitterTypeId: splitterType.id,
        sequenceOrder: 1,
        position: 'Default (Migrated)',
        portMappings,
        inputPower: null,
      }
    })
    
    // Create SplitterPorts
    for (let i = 1; i <= splitterType.outputCount; i++) {
      const mapping = portMappings.find(p => p.portNum === i)
      
      await prisma.splitterPort.create({
        data: {
          splitterInstanceId: instance.id,
          portNumber: i,
          portLabel: i === 1 && splitterType.category === 'ASYMMETRIC' ? 'DROP' : 
                     i === 2 && splitterType.category === 'ASYMMETRIC' ? 'PASS' : `Port ${i}`,
          portType: splitterType.category === 'SYMMETRIC' ? 'OUTPUT' : 
                    i === 1 ? 'DROP' : 'PASS_THROUGH',
          connectionStatus: mapping ? 'CONNECTED' : 'AVAILABLE',
          connectedToType: mapping ? 'ODP' : null,
          connectedToId: mapping?.assignedTo || null,
          attenuation: splitterType.category === 'SYMMETRIC' 
            ? splitterType.attEqual 
            : (i === 1 ? splitterType.attLowOut : splitterType.attHighOut),
        }
      })
    }
    
    console.log(`  ✓ ${odc.name}: migrated ${portMappings.length} ODPs to splitter ${code}`)
  }
  
  console.log(`✅ Migrated ${odcs.length} ODCs\n`)
}

async function migrateOdpSplitters() {
  console.log('🔧 Migrating ODP splitters...')
  
  // Get ODPs that have old splitterRatio but no new splitters yet
  const odps = await prisma.odp.findMany({
    where: { 
      splitterRatio: { not: null },
      splitters: { none: {} }  // No splitters yet
    },
    include: { customers: { orderBy: { name: 'asc' } } }
  })
  
  for (const odp of odps) {
    const code = RATIO_MAP[odp.splitterRatio]
    if (!code) {
      console.log(`  ⚠️  Skipping ${odp.name}: unknown ratio ${odp.splitterRatio}`)
      continue
    }
    
    const splitterType = await prisma.splitterType.findUnique({ where: { code } })
    if (!splitterType) {
      console.log(`  ⚠️  Skipping ${odp.name}: splitter type not found for ${code}`)
      continue
    }
    
    // Build port mappings dari Customers
    const portMappings = odp.customers.map((customer, index) => ({
      portNum: index + 1,
      assignedTo: customer.id,
      assignedToName: customer.name,
      connectionType: 'CUSTOMER',
    }))
    
    // Create SplitterInstance
    const instance = await prisma.splitterInstance.create({
      data: {
        parentType: 'ODP',
        odpId: odp.id,
        splitterTypeId: splitterType.id,
        sequenceOrder: 1,
        position: 'Default (Migrated)',
        portMappings,
        inputPower: null,
      }
    })
    
    // Create SplitterPorts dan link ke customers
    for (let i = 1; i <= splitterType.outputCount; i++) {
      const mapping = portMappings.find(p => p.portNum === i)
      
      const port = await prisma.splitterPort.create({
        data: {
          splitterInstanceId: instance.id,
          portNumber: i,
          portLabel: i === 1 && splitterType.category === 'ASYMMETRIC' ? 'DROP' : 
                     i === 2 && splitterType.category === 'ASYMMETRIC' ? 'PASS' : `Port ${i}`,
          portType: splitterType.category === 'SYMMETRIC' ? 'OUTPUT' : 
                    i === 1 ? 'DROP' : 'PASS_THROUGH',
          connectionStatus: mapping ? 'CONNECTED' : 'AVAILABLE',
          connectedToType: mapping ? 'CUSTOMER' : null,
          connectedToId: mapping?.assignedTo || null,
          attenuation: splitterType.category === 'SYMMETRIC' 
            ? splitterType.attEqual 
            : (i === 1 ? splitterType.attLowOut : splitterType.attHighOut),
        }
      })
      
      // Update customer dengan splitterPortId
      if (mapping) {
        await prisma.customer.update({
          where: { id: mapping.assignedTo },
          data: { 
            splitterPortId: port.id,
            odpPort: i  // Update legacy field juga
          }
        })
      }
    }
    
    console.log(`  ✓ ${odp.name}: migrated ${portMappings.length} customers to splitter ${code}`)
  }
  
  console.log(`✅ Migrated ${odps.length} ODPs\n`)
}

async function main() {
  console.log('🚀 Starting splitter migration...\n')
  
  await migrateOdcSplitters()
  await migrateOdpSplitters()
  
  console.log('🎉 Migration complete!')
  console.log('\n📋 Next steps:')
  console.log('  1. Verify migrated data in database')
  console.log('  2. Update frontend forms to use new splitter system')
  console.log('  3. Update backend routes to include splitter data')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
