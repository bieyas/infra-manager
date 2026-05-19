// Test script for cascade update functionality
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupTestData() {
  console.log('🔧 Setting up test data for cascade update...');
  
  try {
    // Get existing ODCs for testing
    const odc001 = await prisma.odc.findUnique({ where: { name: 'ODC-001' } });
    const odc002 = await prisma.odc.findUnique({ where: { name: 'ODC-002' } });
    
    if (!odc001 || !odc002) {
      console.log('❌ ODC-001 or ODC-002 not found. Creating test data...');
      
      // Create test ODCs
      const testOdc001 = await prisma.odc.create({
        data: {
          name: 'ODC-001',
          address: 'Test Address 1',
          oltId: 'test-olt-1',
          ponPort: 'PON-1',
          uplinkType: 'olt',
          status: 'ACTIVE'
        }
      });
      
      const testOdc002 = await prisma.odc.create({
        data: {
          name: 'ODC-002',
          address: 'Test Address 2',
          oltId: 'test-olt-1',
          ponPort: 'PON-1',
          uplinkType: 'odc',
          uplinkOdcId: testOdc001.id,
          uplinkPort: 'test-splitter-1',
          status: 'ACTIVE'
        }
      });
      
      // Create ODC-003 as downstream of ODC-002
      const testOdc003 = await prisma.odc.create({
        data: {
          name: 'ODC-003',
          address: 'Test Address 3',
          oltId: 'test-olt-1',
          ponPort: 'PON-1',
          uplinkType: 'odc',
          uplinkOdcId: testOdc002.id,
          uplinkPort: 'test-splitter-2',
          status: 'ACTIVE'
        }
      });
      
      console.log('✅ Test data created:');
      console.log(`  ODC-001: ${testOdc001.id} (OLT: test-olt-1, PON: PON-1)`);
      console.log(`  ODC-002: ${testOdc002.id} (downstream of ODC-001)`);
      console.log(`  ODC-003: ${testOdc003.id} (downstream of ODC-002)`);
      
      return { odc001: testOdc001, odc002: testOdc002, odc003: testOdc003 };
    }
    
    // Setup downstream relationship if not exists
    if (odc002.uplinkOdcId !== odc001.id) {
      await prisma.odc.update({
        where: { id: odc002.id },
        data: { uplinkOdcId: odc001.id }
      });
    }
    
    // Create ODC-003 if not exists
    let odc003 = await prisma.odc.findUnique({ where: { name: 'ODC-003' } });
    if (!odc003) {
      odc003 = await prisma.odc.create({
        data: {
          name: 'ODC-003',
          address: 'Test Address 3',
          oltId: odc001.oltId,
          ponPort: odc001.ponPort,
          uplinkType: 'odc',
          uplinkOdcId: odc002.id,
          uplinkPort: 'test-splitter-2',
          status: 'ACTIVE'
        }
      });
    }
    
    console.log('✅ Using existing test data:');
    console.log(`  ODC-001: ${odc001.id} (OLT: ${odc001.oltId}, PON: ${odc001.ponPort})`);
    console.log(`  ODC-002: ${odc002.id} (downstream of ODC-001)`);
    console.log(`  ODC-003: ${odc003.id} (downstream of ODC-002)`);
    
    return { odc001, odc002, odc003 };
    
  } catch (error) {
    console.error('❌ Error setting up test data:', error.message);
    throw error;
  }
}

async function testCascadeUpdate() {
  console.log('\n🧪 Testing cascade update functionality...');
  
  try {
    const { odc001, odc002, odc003 } = await setupTestData();
    
    // Simulate cascade update function
    async function cascadeUpdateDownstream(odcId, newOltId, newPonPort, tx, depth = 0) {
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
                  changedBy: 'test-user',
                  changedByName: 'Test User',
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
              'test-user', 
              'Test User'
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
    
    // Perform cascade update test
    console.log('\n📊 Before cascade update:');
    console.log(`  ODC-001: OLT=${odc001.oltId}, PON=${odc001.ponPort}`);
    console.log(`  ODC-002: OLT=${odc002.oltId}, PON=${odc002.ponPort}`);
    console.log(`  ODC-003: OLT=${odc003.oltId}, PON=${odc003.ponPort}`);
    
    await prisma.$transaction(async (tx) => {
      // Update ODC-001 OLT/PON (use existing OLT)
      const newOltId = 'cmp5rlwmr000aiddr1ui6nsi3'; // OLT-Surabaya-01
      const newPonPort = 'PON-5';
      
      console.log(`\n🔄 Updating ODC-001: OLT ${odc001.oltId}→${newOltId}, PON ${odc001.ponPort}→${newPonPort}`);
      
      await tx.odc.update({
        where: { id: odc001.id },
        data: { oltId: newOltId, ponPort: newPonPort }
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
    console.log('\n📊 After cascade update:');
    const updatedOdc001 = await prisma.odc.findUnique({ where: { id: odc001.id } });
    const updatedOdc002 = await prisma.odc.findUnique({ where: { id: odc002.id } });
    const updatedOdc003 = await prisma.odc.findUnique({ where: { id: odc003.id } });
    
    console.log(`  ODC-001: OLT=${updatedOdc001.oltId}, PON=${updatedOdc001.ponPort}`);
    console.log(`  ODC-002: OLT=${updatedOdc002.oltId}, PON=${updatedOdc002.ponPort}`);
    console.log(`  ODC-003: OLT=${updatedOdc003.oltId}, PON=${updatedOdc003.ponPort}`);
    
    // Check cascade logs
    const cascadeLogs = await prisma.cascadeChangeLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    
    console.log('\n📋 Recent cascade logs:');
    cascadeLogs.forEach(log => {
      console.log(`  ${log.entityName} (Level ${log.cascadeLevel}): ${log.oldOltId}/${log.oldPonPort} → ${log.newOltId}/${log.newPonPort}`);
    });
    
    // Verify expectations
    const success = 
      updatedOdc001.oltId === 'test-olt-2' && updatedOdc001.ponPort === 'PON-5' &&
      updatedOdc002.oltId === 'test-olt-2' && updatedOdc002.ponPort === 'PON-5' &&
      updatedOdc003.oltId === 'test-olt-2' && updatedOdc003.ponPort === 'PON-5';
    
    if (success) {
      console.log('\n🎉 Cascade update test PASSED! All downstream ODCs updated correctly.');
    } else {
      console.log('\n❌ Cascade update test FAILED! Some ODCs not updated correctly.');
    }
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testCascadeUpdate();
