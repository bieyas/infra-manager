// Debug script untuk investigasi cascade update issue
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugCascadeIssue() {
  console.log('🔍 Investigating cascade update issue...');
  
  try {
    // 1. Get current ODC status
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
    
    console.log('\n📊 Current Status:');
    console.log(`  ODC-001: OLT=${odc001.oltId}, PON=${odc001.ponPort}`);
    console.log(`  ODC-002: OLT=${odc002.oltId}, PON=${odc002.ponPort} (uplink: ${odc002.uplinkOdcId === odc001.id ? 'ODC-001' : 'Other'})`);
    console.log(`  ODC-003: OLT=${odc003.oltId}, PON=${odc003.ponPort} (uplink: ${odc003.uplinkOdcId === odc001.id ? 'ODC-001' : odc003.uplinkOdcId === odc002.id ? 'ODC-002' : 'Other'})`);
    
    // 2. Check cascade logs for recent activity
    console.log('\n📋 Recent Cascade Logs (last 5 minutes):');
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentLogs = await prisma.cascadeChangeLog.findMany({
      where: {
        createdAt: { gte: fiveMinutesAgo }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    if (recentLogs.length === 0) {
      console.log('  No cascade logs in last 5 minutes');
    } else {
      recentLogs.forEach(log => {
        console.log(`  ${log.entityName} (${log.cascadeLevel === 0 ? 'MAIN' : `Level ${log.cascadeLevel}`}): ${log.oldOltId}/${log.oldPonPort} → ${log.newOltId}/${log.newPonPort}`);
        console.log(`    Time: ${log.createdAt.toLocaleString()}`);
        console.log(`    User: ${log.changedByName || log.changedBy}`);
        console.log('');
      });
    }
    
    // 3. Simulate cascade condition check
    console.log('\n🧪 Simulating cascade condition check:');
    
    // Simulate what backend should detect
    const currentData = {
      oltId: odc001.oltId,
      ponPort: odc001.ponPort
    };
    
    const newData = {
      oltId: odc001.oltId, // Same OLT
      ponPort: 'PON-6'     // Different PON format
    };
    
    console.log(`  Current: OLT=${currentData.oltId}, PON=${currentData.ponPort}`);
    console.log(`  New:     OLT=${newData.oltId}, PON=${newData.ponPort}`);
    
    const oltChanged = newData.oltId && newData.oltId !== currentData.oltId;
    const ponChanged = newData.ponPort && newData.ponPort !== currentData.ponPort;
    
    console.log(`  oltChanged: ${oltChanged}`);
    console.log(`  ponChanged: ${ponChanged}`);
    console.log(`  shouldCascade: ${oltChanged || ponChanged}`);
    
    // 4. Test different PON formats
    console.log('\n🔍 Testing different PON formats:');
    const ponFormats = ['PON6', 'PON-6', 'pon6', 'pon-6'];
    
    for (const format of ponFormats) {
      const changed = format && format !== currentData.ponPort;
      console.log(`  "${format}" vs "${currentData.ponPort}": ${changed ? '✅ CHANGE DETECTED' : '❌ NO CHANGE'}`);
    }
    
    // 5. Check if ODC-001 was actually updated recently
    console.log('\n🕐 Checking recent ODC-001 updates:');
    const recentOdcUpdate = await prisma.odc.findMany({
      where: {
        id: odc001.id,
        updatedAt: { gte: fiveMinutesAgo }
      },
      select: { updatedAt: true }
    });
    
    if (recentOdcUpdate.length > 0) {
      console.log(`  ODC-001 was updated at: ${recentOdcUpdate[0].updatedAt.toLocaleString()}`);
    } else {
      console.log('  ODC-001 was not updated in last 5 minutes');
    }
    
    // 6. Manual test cascade logic
    console.log('\n🧪 Manual test cascade logic:');
    
    // Simulate the exact cascade function logic
    async function testCascadeLogic(odcId, newOltId, newPonPort) {
      console.log(`  Testing cascade for ODC ${odcId}: OLT ${odc001.oltId}→${newOltId}, PON ${odc001.ponPort}→${newPonPort}`);
      
      // Get downstream ODCs
      const downstreamOdcs = await prisma.odc.findMany({
        where: { uplinkOdcId: odcId },
        select: { 
          id: true, 
          name: true, 
          oltId: true, 
          ponPort: true,
          uplinkOdcId: true,
          uplinkPort: true
        }
      });
      
      console.log(`  Found ${downstreamOdcs.length} downstream ODCs:`);
      downstreamOdcs.forEach(downstream => {
        const oltChanged = newOltId && downstream.oltId !== newOltId;
        const ponChanged = newPonPort && downstream.ponPort !== newPonPort;
        const shouldUpdate = oltChanged || ponChanged;
        
        console.log(`    ${downstream.name}: OLT ${downstream.oltId}→${newOltId} (${oltChanged ? 'CHANGE' : 'SAME'}), PON ${downstream.ponPort}→${newPonPort} (${ponChanged ? 'CHANGE' : 'SAME'}) - ${shouldUpdate ? '✅ UPDATE' : '❌ SKIP'}`);
      });
      
      return downstreamOdcs.length;
    }
    
    const downstreamCount = await testCascadeLogic(odc001.id, odc001.oltId, 'PON-6');
    console.log(`  Total downstream ODCs: ${downstreamCount}`);
    
    // 7. Check backend error logs (if any)
    console.log('\n📝 Checking for potential issues:');
    
    if (odc001.ponPort === 'PON6' && odc002.ponPort === 'PON-15') {
      console.log('  ⚠️ ISSUE DETECTED: ODC-001 has PON6 but downstream has PON-15');
      console.log('  🔍 This suggests cascade update did not trigger');
      console.log('  💡 Possible causes:');
      console.log('     - Frontend sent "PON6" instead of "PON-6"');
      console.log('     - Backend condition logic failed');
      console.log('     - Transaction rolled back');
    }
    
    console.log('\n🎯 Investigation Summary:');
    console.log('  1. ODC-001 status: Changed to PON6');
    console.log('  2. Downstream status: Still at PON-15');
    console.log('  3. Cascade logs: No recent activity');
    console.log('  4. Expected behavior: Downstream should follow ODC-001');
    console.log('  5. Root cause: Cascade update not triggered');
    
  } catch (error) {
    console.error('💥 Debug failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

debugCascadeIssue();
