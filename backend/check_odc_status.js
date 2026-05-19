// Check status ODC-002 and ODC-003 after ODC-001 changes
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkOdcStatus() {
  console.log('🔍 Checking ODC-002 and ODC-003 status after ODC-001 changes...');
  
  try {
    // Get all ODCs
    const odc001 = await prisma.odc.findUnique({ 
      where: { name: 'ODC-001' },
      select: { id: true, name: true, oltId: true, ponPort: true }
    });
    
    const odc002 = await prisma.odc.findUnique({ 
      where: { name: 'ODC-002' },
      select: { id: true, name: true, oltId: true, ponPort: true, uplinkOdcId: true }
    });
    
    const odc003 = await prisma.odc.findUnique({ 
      where: { name: 'ODC-003' },
      select: { id: true, name: true, oltId: true, ponPort: true, uplinkOdcId: true }
    });
    
    if (!odc001 || !odc002 || !odc003) {
      console.log('❌ One or more ODCs not found');
      return;
    }
    
    console.log('\n📊 Current ODC Status:');
    console.log(`  ODC-001: OLT=${odc001.oltId}, PON=${odc001.ponPort}`);
    console.log(`  ODC-002: OLT=${odc002.oltId}, PON=${odc002.ponPort} (uplink: ${odc002.uplinkOdcId === odc001.id ? 'ODC-001' : 'Other'})`);
    console.log(`  ODC-003: OLT=${odc003.oltId}, PON=${odc003.ponPort} (uplink: ${odc003.uplinkOdcId === odc001.id ? 'ODC-001' : odc003.uplinkOdcId === odc002.id ? 'ODC-002' : 'Other'})`);
    
    // Get OLT names for better readability
    const oltNames = {};
    const uniqueOltIds = [odc001.oltId, odc002.oltId, odc003.oltId].filter(id => id);
    
    for (const oltId of uniqueOltIds) {
      const olt = await prisma.device.findUnique({
        where: { id: oltId },
        select: { id: true, name: true }
      });
      if (olt) {
        oltNames[oltId] = olt.name;
      }
    }
    
    console.log('\n📊 Detailed Status with OLT Names:');
    console.log(`  ODC-001: OLT=${oltNames[odc001.oltId]} (${odc001.oltId}), PON=${odc001.ponPort}`);
    console.log(`  ODC-002: OLT=${oltNames[odc002.oltId]} (${odc002.oltId}), PON=${odc002.ponPort} (uplink: ${odc002.uplinkOdcId === odc001.id ? 'ODC-001' : 'Other'})`);
    console.log(`  ODC-003: OLT=${oltNames[odc003.oltId]} (${odc003.oltId}), PON=${odc003.ponPort} (uplink: ${odc003.uplinkOdcId === odc001.id ? 'ODC-001' : odc003.uplinkOdcId === odc002.id ? 'ODC-002' : 'Other'})`);
    
    // Check recent cascade logs
    console.log('\n📋 Recent Cascade Logs (last 10):');
    const cascadeLogs = await prisma.cascadeChangeLog.findMany({
      where: {
        entityId: { in: [odc001.id, odc002.id, odc003.id] }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    if (cascadeLogs.length === 0) {
      console.log('  No cascade logs found');
    } else {
      cascadeLogs.forEach(log => {
        const level = log.cascadeLevel === 0 ? 'MAIN' : `Level ${log.cascadeLevel}`;
        console.log(`  ${log.entityName} (${level}): ${log.oldOltId}/${log.oldPonPort} → ${log.newOltId}/${log.newPonPort}`);
        console.log(`    Time: ${log.createdAt.toLocaleString()}`);
        console.log(`    User: ${log.changedByName || log.changedBy}`);
        console.log(`    Reason: ${log.reason}`);
        console.log('');
      });
    }
    
    // Verification
    console.log('\n🎯 Cascade Verification:');
    const odc001Correct = odc001.oltId && odc001.ponPort === 'PON-6';
    const odc002Correct = odc002.oltId === odc001.oltId && odc002.ponPort === odc001.ponPort;
    const odc003Correct = odc003.oltId === odc001.oltId && odc003.ponPort === odc001.ponPort;
    
    console.log(`  ODC-001: ${odc001Correct ? '✅ CORRECT (PON-6)' : '❌ INCORRECT'}`);
    console.log(`  ODC-002: ${odc002Correct ? '✅ CORRECT (follows ODC-001)' : '❌ INCORRECT'}`);
    console.log(`  ODC-003: ${odc003Correct ? '✅ CORRECT (follows ODC-001)' : '❌ INCORRECT'}`);
    
    if (odc001Correct && odc002Correct && odc003Correct) {
      console.log('\n🎉 CASCADE UPDATE WORKING PERFECTLY!');
      console.log('✅ ODC-001 successfully changed to PON-6');
      console.log('✅ ODC-002 automatically followed ODC-001');
      console.log('✅ ODC-003 automatically followed ODC-001');
    } else {
      console.log('\n⚠️ CASCADE UPDATE ISSUES DETECTED:');
      if (!odc001Correct) console.log('❌ ODC-001 not set to PON-6');
      if (!odc002Correct) console.log('❌ ODC-002 not following ODC-001');
      if (!odc003Correct) console.log('❌ ODC-003 not following ODC-001');
    }
    
    // Show hierarchy
    console.log('\n🌳 Current Hierarchy:');
    console.log(`  ODC-001 (${oltNames[odc001.oltId] || odc001.oltId}, PON-${odc001.ponPort})`);
    console.log(`  ├── ODC-002 (${oltNames[odc002.oltId] || odc002.oltId}, PON-${odc002.ponPort})`);
    console.log(`  └── ODC-003 (${oltNames[odc003.oltId] || odc003.oltId}, PON-${odc003.ponPort})`);
    
  } catch (error) {
    console.error('💥 Check failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkOdcStatus();
