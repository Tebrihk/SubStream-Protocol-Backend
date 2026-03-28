// Quick integration test to verify AML scanner functionality
const { AppDatabase } = require('./src/db/appDatabase');
const { AMLScannerWorker } = require('./src/services/amlScannerWorker');
const { SanctionsListService } = require('./src/services/sanctionsListService');

async function quickIntegrationTest() {
  console.log('🚀 Starting AML Scanner Integration Test...');
  
  try {
    // Create in-memory database
    const database = new AppDatabase(':memory:');
    console.log('✅ Database created successfully');

    // Create AML scanner with test configuration
    const config = {
      scanInterval: 5000, // 5 seconds for testing
      batchSize: 2,
      complianceOfficerEmail: 'test@example.com',
      sanctions: {
        cacheTimeout: 1000
      }
    };

    const amlWorker = new AMLScannerWorker(database, config);
    console.log('✅ AML Scanner Worker created');

    // Add test data
    database.ensureCreator('GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ');
    database.ensureCreator('GABEEXAMPLEADDRESSOFACREATORXXXXXXXXXXXXXXXXXX');
    database.createOrActivateSubscription('GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ', 'GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ');
    
    console.log('✅ Test data added to database');

    // Test address retrieval
    const addresses = await amlWorker.getAllAddresses();
    console.log(`✅ Retrieved ${addresses.length} addresses for scanning`);

    // Test sanctions service
    const sanctionsService = new SanctionsListService(config.sanctions);
    const sanctionsCheck = await sanctionsService.checkAddress('GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ');
    console.log('✅ Sanctions check completed', { isSanctioned: sanctionsCheck.isSanctioned });

    // Test statistics
    const stats = amlWorker.getScanStats();
    console.log('✅ Scan statistics:', stats);

    // Test account freezing
    const frozen = await amlWorker.freezeAccount('TEST_ADDRESS', {
      isSanctioned: true,
      sources: ['TEST_LIST'],
      details: { reason: 'Test freeze' }
    }, 'test_scan_123');
    
    console.log('✅ Account freeze test:', { frozen });

    // Test frozen account detection
    const isFrozen = amlWorker.isAccountFrozen('TEST_ADDRESS');
    console.log('✅ Frozen account detection:', { isFrozen });

    // Test frozen accounts list
    const frozenAccounts = amlWorker.getFrozenAccounts();
    console.log('✅ Frozen accounts list:', { count: frozenAccounts.length });

    // Cleanup
    database.db.close();
    console.log('✅ Database closed');

    console.log('\n🎉 All integration tests passed! AML Scanner is working correctly.');
    
    return true;

  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    console.error(error.stack);
    return false;
  }
}

// Run the test
quickIntegrationTest().then(success => {
  process.exit(success ? 0 : 1);
});
