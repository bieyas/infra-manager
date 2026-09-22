// Test script untuk ODP cascade update
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupOdpTestData() {
  console.log('🔧 Setting up test data for ODP cascade update...');
  
  try {
    // Get existing ODCs for testing
    const odc001 = await prisma.odc.findUnique({ where: { name: 'ODC-001' } });
    const odc002 = await prisma.odc.findUnique({ where: { name: 'ODC-002' } });
    
    if (!odc001 || !odc002) {
      console.log('❌ ODC-001 or ODC-002 not found');
      return null;
    }
    
    // Create test ODPs if not exist
    let odp001 = await prisma.odp.findUnique({ where: { name: 'ODP-001' } });
    let odp002 = await prisma.odp.findUnique({ where: { name: 'ODP-002' } });
    let odp003 = await prisma.odp.findUnique({ where: { name: 'ODP-003' } });
    
    if (!odp001) {
      odp001 = await prisma.odp.create({
        data: {
          name: 'ODP-001',
          address: 'Test ODP Address 1',
          odcId: odc001.id,
          oltId: odc001.oltId,
          ponPort: odc001.ponPort,
          splitterRatio: 'R1_8',
          status: 'ACTIVE'
        }
      });
    }
    
    if (!odp002) {
      odp002 = await prisma.odp.create({
        data: {
          name: 'ODP-002',
          address: 'Test ODP Address 2',
          odcId: odc001.id,
          oltId: odc001.oltId,
          ponPort: odc001.ponPort,
          uplinkOdpId: odp001.id,
          splitterRatio: 'R1_8',
          status: 'ACTIVE'
        }
      });
    }
    
    if (!odp003) {
      odp003 = await prisma.odp.create({
        data: {
          name: 'ODP-003',
          address: 'Test ODP Address 3',
          odcId: odc001.id,
          oltId: odc001.oltId,
          ponPort: odc001.ponPort,
          uplinkOdpId: odp001.id,
          splitterRatio: 'R1_8',
          status: 'ACTIVE'
        }
      });
    }
    
    // Update uplink relationships if needed
    if (odp002.uplinkOdpId !== odp001.id) {
      await prisma.odp.update({
        where: { id: odp002.id },
        data: { uplinkOdpId: odp001.id }
      });
    }
    
    if (odp003.uplinkOdpId !== odp002.id) {
      await prisma.odp.update({
        where: { id: odp003.id },
        data: { uplinkOdpId: odp002.id }
      });
    }
    
    console.log('✅ Test ODP data ready:');
    console.log(`  ODP-001: ${odp001.id} (ODC: ${odc001.name})`);
    console.log(`  ODP-002: ${odp002.id} (uplink: ODP-001)`);
    console.log(`  ODP-003: ${odp003.id} (uplink: ODP-002)`);
    
    return { odp001, odp002, odp003 };
    
  } catch (error) {
    console.error('❌ Error setting up test data:', error.message);
    throw error;
  }
}

async function testOdpCascade() {
  console.log('\n🧪 Testing ODP cascade update functionality...');
  
  try {
    const testData = await setupOdpTestData();
    if (!testData) return;
    
    const { odp001, odp002, odp003 } = testData;
    
    // Get current data
    const currentOdp001 = await prisma.odp.findUnique({ 
      where: { id: odp001.id },
      select: { id: true, name: true, oltId: true, ponPort: true }
    });
    
    const currentOdp002 = await prisma.odp.findUnique({ 
      where: { id: odp002.id },
      select: { id: true, name: true, oltId: true, ponPort: true, uplinkOdpId: true }
    });
    
    const currentOdp003 = await prisma.odp.findUnique({ 
      where: { id: odp003.id },
      select: { id: true, name: true, oltId: true, ponPort: true, uplinkOdpId: true }
    });
    
    console.log('\n📊 Current Status:');
    console.log(`  ODP-001: OLT=${currentOdp001.oltId}, PON=${currentOdp001.ponPort}`);
    console.log(`  ODP-002: OLT=${currentOdp002.oltId}, PON=${currentOdp002.ponPort} (uplink: ${currentOdp002.uplinkOdpId === odp001.id ? 'ODP-001' : 'Other'})`);
    console.log(`  ODP-003: OLT=${currentOdp003.oltId}, PON=${currentOdp003.ponPort} (uplink: ${currentOdp003.uplinkOdpId === odp002.id ? 'ODP-002' : currentOdp003.uplinkOdpId === odp001.id ? 'ODP-001' : 'Other'})`);
    
    // Get OLT-AUFA for testing
    const oltAuha = await prisma.device.findFirst({
      where: { name: 'OLT-AUFA' },
      select: { id: true, name: true }
    });
    
    if (!oltAuha) {
      console.log('❌ OLT-AUFA not found');
      return;
    }
    
    console.log(`\n🎯 Target: OLT=${oltAuha.name} (${oltAuha.id}), PON=PON-20`);
    
    // Perform cascade update test
    await prisma.$transaction(async (tx) => {
      // Copy cascade function from odp.js
      async function cascadeUpdateDownstreamOdp(odpId, newOltId, newPonPort, tx, depth = 0, changedBy = null, changedByName = null) {
        if (depth > 10) {
          console.warn(`Cascade depth exceeded for ODP ${odpId} at depth ${depth}`);
          return { updated: 0, errors: ['Cascade depth exceeded'] };
        }
        
        let totalUpdated = 0;
        const errors = [];
        
        try {
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
          });
          
          for (const downstream of downstreamOdps) {
            try {
              const oltChanged = newOltId && downstream.oltId !== newOltId;
              const ponChanged = newPonPort && downstream.ponPort !== newPonPort;
              
              if (oltChanged || ponChanged) {
                const oldOltId = downstream.oltId;
                const oldPonPort = downstream.ponPort;
                
                await tx.odp.update({
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
                    reason: `Cascade update from parent ODP (${odpId})`
                  }
                });
                
                totalUpdated++;
                console.log(`  🔄 Level ${depth + 1}: Updated ODP ${downstream.name}: OLT ${oldOltId}→${newOltId || downstream.oltId}, PON ${oldPonPort}→${newPonPort || downstream.ponPort}`);
              }
              
              const childResult = await cascadeUpdateDownstreamOdp(
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
              const errorMsg = `Failed to update ODP ${downstream.name}: ${error.message}`;
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
      
      // Update ODP-001 OLT/PON
      const newOltId = oltAuha.id;
      const newPonPort = 'PON-20';
      
      console.log(`\n🔄 Updating ODP-001: OLT ${currentOdp001.oltId}→${newOltId}, PON ${currentOdp001.ponPort}→${newPonPort}`);
      
      await tx.odp.update({
        where: { id: odp001.id },
        data: { oltId: newOltId, ponPort: newPonPort }
      });
      
      // Log the main change
      await tx.cascadeChangeLog.create({
        data: {
          entityId: odp001.id,
          entityName: odp001.name,
          cascadeLevel: 0,
          oldOltId: currentOdp001.oltId,
          oldPonPort: currentOdp001.ponPort,
          newOltId: newOltId,
          newPonPort: newPonPort,
          changedBy: 'test-user',
          changedByName: 'Test User',
          reason: 'Manual update ODP-001 to OLT-AUFA PON-20'
        }
      });
      
      // Cascade update downstream
      const cascadeResult = await cascadeUpdateDownstreamOdp(
        odp001.id, 
        newOltId, 
        newPonPort, 
        tx, 
        0, // depth
        'test-user',
        'Test User'
      );
      
      console.log(`\n✅ Cascade update completed: ${cascadeResult.updated} ODPs updated`);
      if (cascadeResult.errors.length > 0) {
        console.warn(`⚠️ Cascade errors:`, cascadeResult.errors);
      }
    });
    
    // Verify results
    console.log('\n📊 After Update:');
    const updatedOdp001 = await prisma.odp.findUnique({ 
      where: { id: odp001.id },
      select: { id: true, name: true, oltId: true, ponPort: true }
    });
    
    const updatedOdp002 = await prisma.odp.findUnique({ 
      where: { id: odp002.id },
      select: { id: true, name: true, oltId: true, ponPort: true, uplinkOdpId: true }
    });
    
    const updatedOdp003 = await prisma.odp.findUnique({ 
      where: { id: odp003.id },
      select: { id: true, name: true, oltId: true, ponPort: true, uplinkOdpId: true }
    });
    
    console.log(`  ODP-001: OLT=${updatedOdp001.oltId}, PON=${updatedOdp001.ponPort}`);
    console.log(`  ODP-002: OLT=${updatedOdp002.oltId}, PON=${updatedOdp002.ponPort} (uplink: ${updatedOdp002.uplinkOdpId === odp001.id ? 'ODP-001' : 'Other'})`);
    console.log(`  ODP-003: OLT=${updatedOdp003.oltId}, PON=${updatedOdp003.ponPort} (uplink: ${updatedOdp003.uplinkOdpId === odp002.id ? 'ODP-002' : updatedOdp003.uplinkOdpId === odp001.id ? 'ODP-001' : 'Other'})`);
    
    // Check cascade logs
    const cascadeLogs = await prisma.cascadeChangeLog.findMany({
      where: {
        entityId: { in: [odp001.id, odp002.id, odp003.id] }
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
    const odp001Correct = updatedOdp001.oltId === oltAuha.id && updatedOdp001.ponPort === 'PON-20';
    const odp002Correct = updatedOdp002.oltId === oltAuha.id && updatedOdp002.ponPort === 'PON-20';
    const odp003Correct = updatedOdp003.oltId === oltAuha.id && updatedOdp003.ponPort === 'PON-20';
    
    console.log('\n🎯 Verification Results:');
    console.log(`  ODP-001: ${odp001Correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`  ODP-002: ${odp002Correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`  ODP-003: ${odp003Correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
    
    if (odp001Correct && odp002Correct && odp003Correct) {
      console.log('\n🎉 ODP CASCADE UPDATE TEST PASSED!');
      console.log('✅ ODP-001 berhasil diubah ke OLT-AUFA PON-20');
      console.log('✅ ODP-002 otomatis mengikuti uplink ODP-001');
      console.log('✅ ODP-003 otomatis mengikuti uplinknya'); 
    } else {
      console.log('\n❌ ODP CASCADE UPDATE TEST FAILED!');
      console.log('Beberapa ODP tidak terupdate dengan benar');
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testOdpCascade();
