import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedSplitterTypes() {
  console.log('🌱 Seeding splitter types...')

  const splitterTypes = [
    // Symmetric PLC Splitters
    {
      code: '1:2',
      name: 'PLC 1:2',
      category: 'SYMMETRIC',
      inputCount: 1,
      outputCount: 2,
      attEqual: 3.5,
      attLowOut: null,
      attHighOut: null,
      maxInsertionLoss: 4.0,
      uniformity: 0.5,
      description: 'Planar Lightwave Circuit splitter 1:2',
      isActive: true
    },
    {
      code: '1:4',
      name: 'PLC 1:4',
      category: 'SYMMETRIC',
      inputCount: 1,
      outputCount: 4,
      attEqual: 7.0,
      attLowOut: null,
      attHighOut: null,
      maxInsertionLoss: 7.5,
      uniformity: 0.8,
      description: 'Planar Lightwave Circuit splitter 1:4',
      isActive: true
    },
    {
      code: '1:8',
      name: 'PLC 1:8',
      category: 'SYMMETRIC',
      inputCount: 1,
      outputCount: 8,
      attEqual: 10.5,
      attLowOut: null,
      attHighOut: null,
      maxInsertionLoss: 11.0,
      uniformity: 1.0,
      description: 'Planar Lightwave Circuit splitter 1:8',
      isActive: true
    },
    {
      code: '1:16',
      name: 'PLC 1:16',
      category: 'SYMMETRIC',
      inputCount: 1,
      outputCount: 16,
      attEqual: 14.0,
      attLowOut: null,
      attHighOut: null,
      maxInsertionLoss: 14.5,
      uniformity: 1.2,
      description: 'Planar Lightwave Circuit splitter 1:16',
      isActive: true
    },
    {
      code: '1:32',
      name: 'PLC 1:32',
      category: 'SYMMETRIC',
      inputCount: 1,
      outputCount: 32,
      attEqual: 17.0,
      attLowOut: null,
      attHighOut: null,
      maxInsertionLoss: 17.5,
      uniformity: 1.5,
      description: 'Planar Lightwave Circuit splitter 1:32',
      isActive: true
    },
    // Asymmetric FBT Splitters
    {
      code: '1:2-70-30',
      name: 'FBT 1:2 (70/30)',
      category: 'ASYMMETRIC',
      inputCount: 1,
      outputCount: 2,
      attEqual: null,
      attLowOut: 5.0,  // 30% output
      attHighOut: 2.0, // 70% output
      maxInsertionLoss: 5.5,
      uniformity: null,
      description: 'Fused Biconic Taper splitter 1:2 (70/30)',
      isActive: true
    },
    {
      code: '1:2-80-20',
      name: 'FBT 1:2 (80/20)',
      category: 'ASYMMETRIC',
      inputCount: 1,
      outputCount: 2,
      attEqual: null,
      attLowOut: 7.0,  // 20% output
      attHighOut: 1.0, // 80% output
      maxInsertionLoss: 7.5,
      uniformity: null,
      description: 'Fused Biconic Taper splitter 1:2 (80/20)',
      isActive: true
    },
    {
      code: '1:2-90-10',
      name: 'FBT 1:2 (90/10)',
      category: 'ASYMMETRIC',
      inputCount: 1,
      outputCount: 2,
      attEqual: null,
      attLowOut: 10.0, // 10% output
      attHighOut: 0.5, // 90% output
      maxInsertionLoss: 10.5,
      uniformity: null,
      description: 'Fused Biconic Taper splitter 1:2 (90/10)',
      isActive: true
    },
    {
      code: '1:4-ASYM',
      name: 'FBT 1:4 (50/25/15/10)',
      category: 'ASYMMETRIC',
      inputCount: 1,
      outputCount: 4,
      attEqual: null,
      attLowOut: 10.0, // 10% output
      attHighOut: 3.0, // 50% output
      maxInsertionLoss: 10.5,
      uniformity: null,
      description: 'Fused Biconic Taper splitter 1:4 (50/25/15/10)',
      isActive: true
    }
  ]

  for (const splitterType of splitterTypes) {
    await prisma.splitterType.upsert({
      where: { code: splitterType.code },
      update: splitterType,
      create: splitterType
    })
  }

  console.log('✅ Splitter types seeded')
}

async function main() {
  try {
    await seedSplitterTypes()
    console.log('🎉 Splitter types seeding complete!')
  } catch (error) {
    console.error('❌ Error seeding splitter types:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()
