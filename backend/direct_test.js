// Direct test untuk port change logic
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testPortChangeLogic() {
  try {
    console.log('🧪 Testing port change logic directly...');
    
    const odcId = 'cmp5wo9hl0002jmftgumek3du'; // ODC-002
    const oldPort = 'cmp5wid7f000hi2zxhv2v2sxp-2';
    const newPort = 'cmp5wid7f000hi2zxhv2v2sxp-1';
    
    // Simulasi data request
    const data = {
      uplinkType: 'odc',
      uplinkOdcId: 'cmp5rofj5000212q4emfvbhj7',
      uplinkPort: newPort,
      portChangeReason: 'Test pindah port dari 2 ke 1'
    };
    
    console.log('📋 Simulasi PATCH request:');
    console.log('  ODC ID:', odcId);
    console.log('  Old Port:', oldPort);
    console.log('  New Port:', newPort);
    console.log('  Request data:', data);
    
    // Jalankan dalam transaction seperti di backend
    await prisma.$transaction(async (tx) => {
      console.log('\n🔍 Inside transaction:');
      
      // Get current ODC data (seperti di backend)
      const currentOdc = await tx.odc.findUnique({
        where: { id: odcId },
        select: { uplinkType: true, uplinkOdcId: true, uplinkPort: true }
      });
      
      console.log('DEBUG: Current ODC data:', {
        id: odcId,
        uplinkType: currentOdc.uplinkType,
        uplinkOdcId: currentOdc.uplinkOdcId,
        uplinkPort: currentOdc.uplinkPort
      });
      console.log('DEBUG: New data:', {
        uplinkType: data.uplinkType,
        uplinkOdcId: data.uplinkOdcId,
        uplinkPort: data.uplinkPort
      });
      
      // Handle port release logic (seperti di backend)
      if (currentOdc.uplinkType === 'odc' && currentOdc.uplinkPort) {
        const shouldReleaseOldPort = 
          (data.uplinkType !== 'odc') ||
          (data.uplinkType === 'odc' && data.uplinkOdcId && data.uplinkOdcId !== currentOdc.uplinkOdcId) ||
          (data.uplinkType === 'odc' && data.uplinkOdcId === currentOdc.uplinkOdcId && 
           data.uplinkPort && data.uplinkPort !== currentOdc.uplinkPort);

        console.log('DEBUG: shouldReleaseOldPort:', shouldReleaseOldPort);
        
        if (shouldReleaseOldPort) {
          const [oldSplitterId, oldPortNumber] = currentOdc.uplinkPort.split('-');
          if (oldSplitterId && oldPortNumber) {
            console.log(`🔧 Releasing old port: ${oldSplitterId}-${oldPortNumber}`);
            
            // Release old port
            const result = await tx.splitterPort.updateMany({
              where: {
                splitterInstanceId: oldSplitterId,
                portNumber: parseInt(oldPortNumber),
                connectedToId: odcId
              },
              data: {
                connectionStatus: 'AVAILABLE',
                connectedToType: null,
                connectedToId: null
              }
            });
            
            console.log(`✅ Released ${result.count} port(s)`);
          }
        }
        
        // Connect new port
        const [newSplitterId, newPortNumber] = newPort.split('-');
        if (newSplitterId && newPortNumber) {
          console.log(`🔧 Connecting new port: ${newSplitterId}-${newPortNumber}`);
          
          const result = await tx.splitterPort.updateMany({
            where: {
              splitterInstanceId: newSplitterId,
              portNumber: parseInt(newPortNumber)
            },
            data: {
              connectionStatus: 'CONNECTED',
              connectedToType: 'ODC',
              connectedToId: odcId
            }
          });
          
          console.log(`✅ Connected ${result.count} port(s)`);
        }
      }
      
      // Update ODC data
      await tx.odc.update({
        where: { id: odcId },
        data: {
          uplinkPort: newPort
        }
      });
      
      console.log('✅ ODC updated');
    });
    
    console.log('\n🎉 Transaction completed!');
    
    // Verify result
    console.log('\n🔍 Verifying result:');
    const finalOdc = await prisma.odc.findUnique({
      where: { id: odcId },
      select: { name: true, uplinkPort: true }
    });
    
    console.log('ODC-002 uplinkPort:', finalOdc.uplinkPort);
    
    const odc001 = await prisma.odc.findUnique({
      where: { name: 'ODC-001' },
      include: {
        splitters: {
          include: { ports: true },
          orderBy: { sequenceOrder: 'asc' }
        }
      }
    });
    
    console.log('\nODC-001 Port Status:');
    odc001.splitters.forEach((splitter, index) => {
      console.log(`\nSplitter ${index + 1} (${splitter.position}):`);
      let connectedCount = 0;
      splitter.ports.forEach(port => {
        const status = port.connectionStatus === 'CONNECTED' ? 'CONNECTED' : 'AVAILABLE';
        const connectedInfo = port.connectionStatus === 'CONNECTED' ? `-> ${port.connectedToType}` : '';
        console.log(`  Port ${port.portNumber}: ${status} ${connectedInfo}`);
        if (port.connectionStatus === 'CONNECTED') connectedCount++;
      });
      console.log(`  Total Connected: ${connectedCount}/${splitter.ports.length}`);
    });
    
  } catch (error) {
    console.error('💥 Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testPortChangeLogic();
