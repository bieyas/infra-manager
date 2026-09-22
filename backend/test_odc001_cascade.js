// Test script untuk ODC-001 cascade update ke OLT-AUFA PON-9
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testOdc001Cascade() {
  console.log('🧪 Testing ODC-001 cascade update to OLT-AUFA PON-9...');
  
  try {
    // Get current data
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
    
    console.log('\n📊 Current Status:');
    console.log(`  ODC-001: OLT=${odc001.oltId}, PON=${odc001.ponPort}`);
    console.log(`  ODC-002: OLT=${odc002.oltId}, PON=${odc002.ponPort} (uplink: ${odc002.uplinkOdcId === odc001.id ? 'ODC-001' : 'Other'})`);
    console.log(`  ODC-003: OLT=${odc003.oltId}, PON=${odc003.ponPort} (uplink: ${odc003.uplinkOdcId === odc001.id ? 'ODC-001' : odc003.uplinkOdcId === odc002.id ? 'ODC-002' : 'Other'})`);
    
    // Get OLT-AUFA ID
    const oltAuha = await prisma.device.findFirst({
      where: { name: 'OLT-AUFA' },
      select: { id: true, name: true }
    });
    
    if (!oltAuha) {
      console.log('❌ OLT-AUFA not found');
      return;
    }
    
    console.log(`\n🎯 Target: OLT=${oltAuha.name} (${oltAuha.id}), PON=PON-9`);
    
    // Perform cascade update using the actual cascade function
    await prisma.$transaction(async (tx) => {
      // Import cascade function (copy from odc.js)
      async function cascadeUpdateDownstream(odcId, newOltId, newPonPort, tx, depth = 0, changedBy = null, changedByName = null) {
        if (depth > 10) {
          console.warn(`Cascade depth exceeded for ODC ${odcId} at depth ${depth}`);
          return { updated: 0, errors: ['Cascade depth exceeded'] };
        }
        
        let totalUpdated = 0;
        const errors = [];
        
        try {
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
          });
          
          for (const downstream of downstreamOdcs) {
            try {
              const oltChanged = newOltId && downstream.oltId !== newOltId;
              const ponChanged = newPonPort && downstream.ponPort !== newPonPort;
              
              if (oltChanged || ponChanged) {
                const oldOltId = downstream.oltId;
                const oldPonPort = downstream.ponPort;
                
                await tx.odc.update({
                  where: { id: downstream.id },
                  data: { 
                    oltId: newOltId || downstream.oltId,
                    ponPort: newPonPort || downstream.ponPort
                  }
                });
                
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
                });
                
                totalUpdated++;
                console.log(`  🔄 Level ${depth + 1}: Updated ${downstream.name}: OLT ${oldOltId}→${newOltId || downstream.oltId}, PON ${oldPonPort}→${newPonPort || downstream.ponPort}`);
              }
              
              const childResult = await cascadeUpdateDownstream(
                downstream.id, 
                newOltId, 
                newPonPort, 
                tx, 
                depth + 1, 
                changedBy, 
                changedByName
              );
              
              totalUpdated += childResult.updated;
              errors.push(...childResult.errors);
              
            } catch (error) {
              const errorMsg = `Failed to update ${downstream.name}: ${error.message}`;
              errors.push(errorMsg);
              console.error(`  ❌ ${errorMsg}`);
            }
          }
          
        } catch (error) {
          errors.push(`Cascade error at depth ${depth}: ${error.message}`);
          console.error(`  ❌ Cascade error at depth ${depth}:`, error);
        }
        
        return { updated: totalUpdated, errors };
      }
      
      // Update ODC-001
      const newOltId = oltAuha.id;
      const newPonPort = 'PON-9';
      
      console.log(`\n🔄 Updating ODC-001: OLT ${odc001.oltId}→${newOltId}, PON ${odc001.ponPort}→${newPonPort}`);
      
      await tx.odc.update({
        where: { id: odc001.id },
        data: { oltId: newOltId, ponPort: newPonPort }
      });
      
      // Log the main change
      await tx.cascadeChangeLog.create({
        data: {
          entityId: odc001.id,
          entityName: odc001.name,
          cascadeLevel: 0,
          oldOltId: odc001.oltId,
          oldPonPort: odc001.ponPort,
          newOltId: newOltId,
          newPonPort: newPonPort,
          changedBy: 'test-user',
          changedByName: 'Test User',
          reason: 'Manual update ODC-001 to OLT-AUFA PON-9'
        }
      });
      
      // Cascade update downstream
      const cascadeResult = await cascadeUpdateDownstream(
        odc001.id, 
        newOltId, 
        newPonPort, 
        tx, 
        0, // depth
        'test-user',
        'Test User'
      );
      
      console.log(`\n✅ Cascade update completed: ${cascadeResult.updated} ODCs updated`);
      if (cascadeResult.errors.length > 0) {
        console.warn(`⚠️ Cascade errors:`, cascadeResult.errors);
      }
    });
    
    // Verify results
    console.log('\n📊 After Update:');
    const updatedOdc001 = await prisma.odc.findUnique({ 
      where: { name: 'ODC-001' },
      select: { id: true, name: true, oltId: true, ponPort: true }
    });
    
    const updatedOdc002 = await prisma.odc.findUnique({ 
      where: { name: 'ODC-002' },
      select: { id: true, name: true, oltId: true, ponPort: true, uplinkOdcId: true }
    });
    
    const updatedOdc003 = await prisma.odc.findUnique({ 
      where: { name: 'ODC-003' },
      select: { id: true, name: true, oltId: true, ponPort: true, uplinkOdcId: true }
    });
    
    console.log(`  ODC-001: OLT=${updatedOdc001.oltId}, PON=${updatedOdc001.ponPort}`);
    console.log(`  ODC-002: OLT=${updatedOdc002.oltId}, PON=${updatedOdc002.ponPort} (uplink: ${updatedOdc002.uplinkOdcId === odc001.id ? 'ODC-001' : 'Other'})`);
    console.log(`  ODC-003: OLT=${updatedOdc003.oltId}, PON=${updatedOdc003.ponPort} (uplink: ${updatedOdc003.uplinkOdcId === odc001.id ? 'ODC-001' : updatedOdc003.uplinkOdcId === odc002.id ? 'ODC-002' : 'Other'})`);
    
    // Check cascade logs
    const cascadeLogs = await prisma.cascadeChangeLog.findMany({
      where: {
        entityId: { in: [odc001.id, odc002.id, odc003.id] }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    
    console.log('\n📋 Recent Cascade Logs:');
    cascadeLogs.forEach(log => {
      const level = log.cascadeLevel === 0 ? 'MAIN' : `Level ${log.cascadeLevel}`;
      console.log(`  ${log.entityName} (${level}): ${log.oldOltId}/${log.oldPonPort} → ${log.newOltId}/${log.newPonPort}`);
    });
    
    // Verification
    const odc001Correct = updatedOdc001.oltId === oltAuha.id && updatedOdc001.ponPort === 'PON-9';
    const odc002Correct = updatedOdc002.oltId === oltAuha.id && updatedOdc002.ponPort === 'PON-9';
    const odc003Correct = updatedOdc003.oltId === oltAuha.id && updatedOdc003.ponPort === 'PON-9';
    
    console.log('\n🎯 Verification Results:');
    console.log(`  ODC-001: ${odc001Correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`  ODC-002: ${odc002Correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`  ODC-003: ${odc003Correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
    
    if (odc001Correct && odc002Correct && odc003Correct) {
      console.log('\n🎉 CASCADE UPDATE TEST PASSED!');
      console.log('✅ ODC-001 berhasil diubah ke OLT-AUFA PON-9');
      console.log('✅ ODC-002 otomatis mengikuti uplink ODC-001');
      console.log('✅ ODC-003 otomatis mengikuti uplinknya');
    } else {
      console.log('\n❌ CASCADE UPDATE TEST FAILED!');
      console.log('Beberapa ODC tidak terupdate dengan benar');
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testOdc001Cascade();
