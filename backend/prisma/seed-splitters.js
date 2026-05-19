// Seeder for SplitterType lookup table
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const SPLITTER_TYPES = [
  // === SYMMETRIC (PLC) ===
  // Formula: attEqual ≈ 3.5 + 10*log10(N) dB
  { code: '1:2',   name: 'PLC 1:2',   category: 'SYMMETRIC', outputCount: 2,   attEqual: 3.5,  maxInsertionLoss: 4.0,  uniformity: 0.5, description: 'Splitter simetris 1 input ke 2 output, redaman ~3.5 dB' },
  { code: '1:4',   name: 'PLC 1:4',   category: 'SYMMETRIC', outputCount: 4,   attEqual: 7.0,  maxInsertionLoss: 7.5,  uniformity: 0.8, description: 'Splitter simetris 1 input ke 4 output, redaman ~7.0 dB' },
  { code: '1:8',   name: 'PLC 1:8',   category: 'SYMMETRIC', outputCount: 8,   attEqual: 10.5, maxInsertionLoss: 11.0, uniformity: 1.0, description: 'Splitter simetris 1 input ke 8 output, redaman ~10.5 dB' },
  { code: '1:16',  name: 'PLC 1:16',  category: 'SYMMETRIC', outputCount: 16,  attEqual: 14.0, maxInsertionLoss: 14.8, uniformity: 1.2, description: 'Splitter simetris 1 input ke 16 output, redaman ~14.0 dB' },
  { code: '1:32',  name: 'PLC 1:32',  category: 'SYMMETRIC', outputCount: 32,  attEqual: 17.0, maxInsertionLoss: 17.8, uniformity: 1.5, description: 'Splitter simetris 1 input ke 32 output, redaman ~17.0 dB' },
  { code: '1:64',  name: 'PLC 1:64',  category: 'SYMMETRIC', outputCount: 64,  attEqual: 21.0, maxInsertionLoss: 21.5, uniformity: 2.0, description: 'Splitter simetris 1 input ke 64 output, redaman ~21.0 dB' },
  
  // === ASYMMETRIC (FBT) ===
  // Port 1 = low output (drop), Port 2 = high output (pass-through)
  { code: '1:99',   name: 'FBT 1:99',   category: 'ASYMMETRIC', outputCount: 2, attLowOut: 20.0, attHighOut: 0.5, description: 'Splitter asimetris 1% ke drop port (redaman 20 dB), 99% pass-through (redaman 0.5 dB)' },
  { code: '2:98',   name: 'FBT 2:98',   category: 'ASYMMETRIC', outputCount: 2, attLowOut: 17.0, attHighOut: 0.5, description: 'Splitter asimetris 2% ke drop port (redaman 17 dB), 98% pass-through (redaman 0.5 dB)' },
  { code: '3:97',   name: 'FBT 3:97',   category: 'ASYMMETRIC', outputCount: 2, attLowOut: 15.0, attHighOut: 0.5, description: 'Splitter asimetris 3% ke drop port (redaman 15 dB), 97% pass-through (redaman 0.5 dB)' },
  { code: '4:96',   name: 'FBT 4:96',   category: 'ASYMMETRIC', outputCount: 2, attLowOut: 14.0, attHighOut: 0.6, description: 'Splitter asimetris 4% ke drop port (redaman 14 dB), 96% pass-through (redaman 0.6 dB)' },
  { code: '5:95',   name: 'FBT 5:95',   category: 'ASYMMETRIC', outputCount: 2, attLowOut: 13.0, attHighOut: 0.6, description: 'Splitter asimetris 5% ke drop port (redaman 13 dB), 95% pass-through (redaman 0.6 dB)' },
  { code: '10:90',  name: 'FBT 10:90',  category: 'ASYMMETRIC', outputCount: 2, attLowOut: 10.0, attHighOut: 0.7, description: 'Splitter asimetris 10% ke drop port (redaman 10 dB), 90% pass-through (redaman 0.7 dB)' },
  { code: '15:85',  name: 'FBT 15:85',  category: 'ASYMMETRIC', outputCount: 2, attLowOut: 8.0,  attHighOut: 0.8, description: 'Splitter asimetris 15% ke drop port (redaman 8 dB), 85% pass-through (redaman 0.8 dB)' },
  { code: '20:80',  name: 'FBT 20:80',  category: 'ASYMMETRIC', outputCount: 2, attLowOut: 7.0,  attHighOut: 1.0, description: 'Splitter asimetris 20% ke drop port (redaman 7 dB), 80% pass-through (redaman 1.0 dB)' },
  { code: '25:75',  name: 'FBT 25:75',  category: 'ASYMMETRIC', outputCount: 2, attLowOut: 6.0,  attHighOut: 1.2, description: 'Splitter asimetris 25% ke drop port (redaman 6 dB), 75% pass-through (redaman 1.2 dB)' },
  { code: '30:70',  name: 'FBT 30:70',  category: 'ASYMMETRIC', outputCount: 2, attLowOut: 5.0,  attHighOut: 1.5, description: 'Splitter asimetris 30% ke drop port (redaman 5 dB), 70% pass-through (redaman 1.5 dB)' },
  { code: '35:65',  name: 'FBT 35:65',  category: 'ASYMMETRIC', outputCount: 2, attLowOut: 4.5,  attHighOut: 2.0, description: 'Splitter asimetris 35% ke drop port (redaman 4.5 dB), 65% pass-through (redaman 2.0 dB)' },
  { code: '40:60',  name: 'FBT 40:60',  category: 'ASYMMETRIC', outputCount: 2, attLowOut: 4.0,  attHighOut: 2.2, description: 'Splitter asimetris 40% ke drop port (redaman 4.0 dB), 60% pass-through (redaman 2.2 dB)' },
  { code: '45:55',  name: 'FBT 45:55',  category: 'ASYMMETRIC', outputCount: 2, attLowOut: 3.5,  attHighOut: 3.0, description: 'Splitter asimetris 45% ke drop port (redaman 3.5 dB), 55% pass-through (redaman 3.0 dB)' },
  { code: '50:50',  name: 'FBT 50:50',  category: 'ASYMMETRIC', outputCount: 2, attLowOut: 3.0,  attHighOut: 3.0, description: 'Splitter simetris seimbang 50:50 (redaman 3 dB kedua port)' },
]

async function main() {
  console.log('🌱 Seeding SplitterTypes...')
  
  for (const type of SPLITTER_TYPES) {
    await prisma.splitterType.upsert({
      where: { code: type.code },
      update: type,
      create: type,
    })
    console.log(`  ✓ ${type.name}`)
  }
  
  console.log(`✅ Seeded ${SPLITTER_TYPES.length} splitter types`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
