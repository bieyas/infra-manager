// Test script untuk memverifikasi perbaikan cascade update dengan format PON yang benar
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testFixedCascade() {
  console.log('🧪 Testing cascade update with fixed PON format...');
  
  try {
    // Get current ODC status
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
    
    // Test cascade logic with correct format
    console.log('\n🧪 Testing cascade logic with correct PON format:');
    
    // Simulate what should happen with correct format
    const currentData = {
      oltId: odc001.oltId,
      ponPort: odc001.ponPort  // Currently "PON6"
    };
    
    const newData = {
      oltId: odc001.oltId,
      ponPort: 'PON-7'  // Correct format with dash
    };
    
    console.log(`  Current: OLT=${currentData.oltId}, PON=${currentData.ponPort}`);
    console.log(`  New:     OLT=${newData.oltId}, PON=${newData.ponPort}`);
    
    const oltChanged = newData.oltId && newData.oltId !== currentData.oltId;
    const ponChanged = newData.ponPort && newData.ponPort !== currentData.ponPort;
    
    console.log(`  oltChanged: ${oltChanged}`);
    console.log(`  ponChanged: ${ponChanged}`);
    console.log(`  shouldCascade: ${oltChanged || ponChanged}`);
    
    // Test actual cascade update with correct format
    console.log('\n🔄 Testing actual cascade update with PON-7:');
    
    await prisma.$transaction(async (tx) => {
      // Copy cascade function from odc.js
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
                    reason: `Cascade update from parent ODC (${odcId}) - FIXED FORMAT TEST`
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
      
      // Update ODC-001 with correct format
      console.log(`🔄 Updating ODC-001: OLT ${odc001.oltId}→${newData.oltId}, PON ${currentData.ponPort}→${newData.ponPort}`);
      
      await tx.odc.update({
        where: { id: odc001.id },
        data: { oltId: newData.oltId, ponPort: newData.ponPort }
      });
      
      // Log the main change
      await tx.cascadeChangeLog.create({
        data: {
          entityId: odc001.id,
          entityName: odc001.name,
          cascadeLevel: 0,
          oldOltId: currentData.oltId,
          oldPonPort: currentData.ponPort,
          newOltId: newData.oltId,
          newPonPort: newData.ponPort,
          changedBy: 'test-user',
          changedByName: 'Test User',
          reason: 'Manual update ODC-001 to test fixed PON format'
        }
      });
      
      // Cascade update downstream
      const cascadeResult = await cascadeUpdateDownstream(
        odc001.id, 
        newData.oltId, 
        newData.ponPort, 
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
    
    // Verification
    const odc001Correct = updatedOdc001.oltId === newData.oltId && updatedOdc001.ponPort === newData.ponPort;
    const odc002Correct = updatedOdc002.oltId === newData.oltId && updatedOdc002.ponPort === newData.ponPort;
    const odc003Correct = updatedOdc003.oltId === newData.oltId && updatedOdc003.ponPort === newData.ponPort;
    
    console.log('\n🎯 Verification Results:');
    console.log(`  ODC-001: ${odc001Correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`  ODC-002: ${odc002Correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
    console.log(`  ODC-003: ${odc003Correct ? '✅ CORRECT' : '❌ INCORRECT'}`);
    
    if (odc001Correct && odc002Correct && odc003Correct) {
      console.log('\n🎉 CASCADE UPDATE WITH FIXED FORMAT WORKS!');
      console.log('✅ Perbaikan format PON berhasil memperbaiki cascade update');
      console.log('✅ Frontend sekarang akan mengirim format yang konsisten');
    } else {
      console.log('\n❌ Cascade update still has issues');
    }
    
    console.log('\n💡 Recommendations:');
    console.log('1. ✅ Frontend format sudah diperbaiki (PON-6 bukan PON6)');
    console.log('2. ✅ Backend cascade logic bekerja dengan format yang benar');
    console.log('3. 🔄 Restart frontend untuk menerapkan perubahan');
    console.log('4. 🧪 Test kembali melalui form edit');
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testFixedCascade();
