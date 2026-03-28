const { AMLScannerWorker } = require('../src/services/amlScannerWorker');
const { AppDatabase } = require('../src/db/appDatabase');
const { SanctionsListService } = require('../src/services/sanctionsListService');

describe('AML Scanner Worker', () => {
  let amlWorker;
  let database;
  let mockSanctionsService;
  let mockConfig;

  beforeEach(() => {
    // Create in-memory database for testing
    database = new AppDatabase(':memory:');
    
    // Mock sanctions service
    mockSanctionsService = {
      batchCheckAddresses: jest.fn(),
      getCacheStats: jest.fn().mockReturnValue({ size: 0, timeout: 3600000 })
    };

    // Mock config
    mockConfig = {
      scanInterval: 1000, // 1 second for fast testing
      batchSize: 5,
      complianceOfficerEmail: 'test@compliance.com',
      maxRetries: 2
    };

    // Create AML worker with mocked dependencies
    amlWorker = new AMLScannerWorker(database, mockConfig);
    amlWorker.sanctionsService = mockSanctionsService;
  });

  afterEach(async () => {
    if (amlWorker && amlWorker.isRunning) {
      await amlWorker.stop();
    }
    if (database) {
      database.db.close();
    }
  });

  describe('Initialization', () => {
    test('should initialize with correct configuration', () => {
      expect(amlWorker.config.scanInterval).toBe(1000);
      expect(amlWorker.config.batchSize).toBe(5);
      expect(amlWorker.isRunning).toBe(false);
    });

    test('should have correct initial statistics', () => {
      const stats = amlWorker.getScanStats();
      expect(stats.totalScans).toBe(0);
      expect(stats.sanctionsFound).toBe(0);
      expect(stats.accountsFrozen).toBe(0);
      expect(stats.errors).toBe(0);
    });
  });

  describe('Address Retrieval', () => {
    beforeEach(() => {
      // Seed test data
      database.ensureCreator('GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ');
      database.ensureCreator('GABEEXAMPLEADDRESSOFACREATORXXXXXXXXXXXXXXXXXX');
      
      // Add subscriptions
      database.createOrActivateSubscription('GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ', 'GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ');
      database.createOrActivateSubscription('GABEEXAMPLEADDRESSOFACREATORXXXXXXXXXXXXXXXXXX', 'GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ');
    });

    test('should retrieve all unique addresses', async () => {
      const addresses = await amlWorker.getAllAddresses();
      
      expect(addresses).toContain('GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ');
      expect(addresses).toContain('GABEEXAMPLEADDRESSOFACREATORXXXXXXXXXXXXXXXXXX');
      expect(addresses.length).toBeGreaterThanOrEqual(2);
    });

    test('should handle empty database gracefully', async () => {
      const emptyDb = new AppDatabase(':memory:');
      const emptyWorker = new AMLScannerWorker(emptyDb, mockConfig);
      
      const addresses = await emptyWorker.getAllAddresses();
      expect(addresses).toEqual([]);
      
      emptyDb.db.close();
    });
  });

  describe('Sanctions Processing', () => {
    beforeEach(() => {
      // Seed test data
      database.ensureCreator('SANCTIONED_ADDRESS_1');
      database.ensureCreator('CLEAN_ADDRESS_1');
    });

    test('should process sanctioned addresses correctly', async () => {
      // Mock sanctions check results
      const mockResults = new Map([
        ['SANCTIONED_ADDRESS_1', { isSanctioned: true, sources: ['OFAC_SDN'], details: {} }],
        ['CLEAN_ADDRESS_1', { isSanctioned: false, sources: [], details: {} }]
      ]);

      mockSanctionsService.batchCheckAddresses.mockResolvedValue(mockResults);

      await amlWorker.runDailyScan();

      // Verify sanctions were found and processed
      const stats = amlWorker.getScanStats();
      expect(stats.sanctionsFound).toBe(1);
      expect(stats.accountsFrozen).toBe(1);
      expect(stats.totalScans).toBe(1);

      // Verify audit log was created
      const auditLogs = database.listAuditLogsByCreatorId('SANCTIONED_ADDRESS_1');
      const freezeLog = auditLogs.find(log => log.actionType === 'ACCOUNT_FROZEN');
      expect(freezeLog).toBeDefined();
      expect(freezeLog.metadata.reason).toBe('SANCTIONS_MATCH');
    });

    test('should handle clean addresses correctly', async () => {
      const mockResults = new Map([
        ['CLEAN_ADDRESS_1', { isSanctioned: false, sources: [], details: {} }]
      ]);

      mockSanctionsService.batchCheckAddresses.mockResolvedValue(mockResults);

      await amlWorker.runDailyScan();

      const stats = amlWorker.getScanStats();
      expect(stats.sanctionsFound).toBe(0);
      expect(stats.accountsFrozen).toBe(0);
    });

    test('should handle errors gracefully', async () => {
      mockSanctionsService.batchCheckAddresses.mockRejectedValue(new Error('API Error'));

      await amlWorker.runDailyScan();

      const stats = amlWorker.getScanStats();
      expect(stats.errors).toBe(1);
      expect(stats.totalScans).toBe(1);
    });
  });

  describe('Account Freezing', () => {
    test('should freeze sanctioned accounts', async () => {
      const sanctionsCheck = {
        isSanctioned: true,
        sources: ['OFAC_SDN'],
        details: { list: 'SDN' }
      };

      const frozen = await amlWorker.freezeAccount('TEST_ADDRESS', sanctionsCheck, 'test_scan_1');

      expect(frozen).toBe(true);

      // Verify audit log
      const auditLogs = database.listAuditLogsByCreatorId('TEST_ADDRESS');
      const freezeLog = auditLogs.find(log => log.actionType === 'ACCOUNT_FROZEN');
      expect(freezeLog).toBeDefined();
      expect(freezeLog.metadata.reason).toBe('SANCTIONS_MATCH');
      expect(freezeLog.metadata.scanId).toBe('test_scan_1');
    });

    test('should create notification for frozen accounts', async () => {
      const sanctionsCheck = {
        isSanctioned: true,
        sources: ['OFAC_SDN'],
        details: { list: 'SDN' }
      };

      await amlWorker.freezeAccount('TEST_ADDRESS', sanctionsCheck, 'test_scan_1');

      // Verify notification was created
      const notifications = database.listNotificationsByCreatorId('TEST_ADDRESS');
      const freezeNotification = notifications.find(n => n.type === 'ACCOUNT_FROZEN');
      expect(freezeNotification).toBeDefined();
      expect(freezeNotification.message).toContain('frozen due to compliance requirements');
    });
  });

  describe('Account Status Checking', () => {
    test('should correctly identify frozen accounts', async () => {
      // First freeze an account
      await amlWorker.freezeAccount('FROZEN_ADDRESS', {
        isSanctioned: true,
        sources: ['OFAC_SDN'],
        details: {}
      }, 'test_scan');

      const isFrozen = amlWorker.isAccountFrozen('FROZEN_ADDRESS');
      expect(isFrozen).toBe(true);

      const isNotFrozen = amlWorker.isAccountFrozen('OTHER_ADDRESS');
      expect(isNotFrozen).toBe(false);
    });

    test('should retrieve all frozen accounts', async () => {
      // Freeze multiple accounts
      await amlWorker.freezeAccount('FROZEN_1', { isSanctioned: true, sources: ['OFAC'], details: {} }, 'scan1');
      await amlWorker.freezeAccount('FROZEN_2', { isSanctioned: true, sources: ['EU'], details: {} }, 'scan2');

      const frozenAccounts = amlWorker.getFrozenAccounts();
      
      expect(frozenAccounts.length).toBe(2);
      expect(frozenAccounts.map(acc => acc.address)).toContain('FROZEN_1');
      expect(frozenAccounts.map(acc => acc.address)).toContain('FROZEN_2');
    });
  });

  describe('Manual Scan Trigger', () => {
    test('should trigger manual scan successfully', async () => {
      mockSanctionsService.batchCheckAddresses.mockResolvedValue(new Map());

      const result = await amlWorker.triggerImmediateScan();

      expect(result.success).toBe(true);
      expect(result.scanId).toMatch(/^manual_scan_/);
      expect(result.stats).toBeDefined();
    });

    test('should handle manual scan failures', async () => {
      mockSanctionsService.batchCheckAddresses.mockRejectedValue(new Error('Service unavailable'));

      const result = await amlWorker.triggerImmediateScan();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service unavailable');
    });
  });

  describe('Statistics Tracking', () => {
    test('should update statistics correctly', async () => {
      const mockResults = new Map([
        ['SANCTIONED_1', { isSanctioned: true, sources: ['OFAC'], details: {} }],
        ['SANCTIONED_2', { isSanctioned: true, sources: ['EU'], details: {} }],
        ['CLEAN_1', { isSanctioned: false, sources: [], details: {} }]
      ]);

      mockSanctionsService.batchCheckAddresses.mockResolvedValue(mockResults);

      await amlWorker.runDailyScan();

      const stats = amlWorker.getScanStats();
      expect(stats.totalScans).toBe(1);
      expect(stats.sanctionsFound).toBe(2);
      expect(stats.accountsFrozen).toBe(2);
      expect(stats.lastScanTime).toBeDefined();
    });
  });
});

describe('Sanctions List Service', () => {
  let sanctionsService;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {
      cacheTimeout: 1000 // 1 second for testing
    };
    sanctionsService = new SanctionsListService(mockConfig);
  });

  describe('Address Checking', () => {
    test('should check address against sanctions lists', async () => {
      const result = await sanctionsService.checkAddress('TEST_ADDRESS');

      expect(result).toHaveProperty('isSanctioned');
      expect(result).toHaveProperty('sources');
      expect(result).toHaveProperty('details');
      expect(Array.isArray(result.sources)).toBe(true);
    });

    test('should cache results', async () => {
      const address = 'CACHE_TEST_ADDRESS';
      
      // First call
      await sanctionsService.checkAddress(address);
      const cacheStats1 = sanctionsService.getCacheStats();
      expect(cacheStats1.size).toBe(1);

      // Second call should use cache
      await sanctionsService.checkAddress(address);
      const cacheStats2 = sanctionsService.getCacheStats();
      expect(cacheStats2.size).toBe(1);
    });

    test('should handle batch address checking', async () => {
      const addresses = ['ADDR1', 'ADDR2', 'ADDR3'];
      
      const results = await sanctionsService.batchCheckAddresses(addresses);

      expect(results.size).toBe(3);
      expect(results.has('ADDR1')).toBe(true);
      expect(results.has('ADDR2')).toBe(true);
      expect(results.has('ADDR3')).toBe(true);
    });
  });

  describe('Cache Management', () => {
    test('should clean up expired cache entries', async () => {
      // Add entries to cache
      await sanctionsService.checkAddress('ADDR1');
      await sanctionsService.checkAddress('ADDR2');
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Add new entry to trigger cleanup
      await sanctionsService.checkAddress('ADDR3');
      
      const cacheStats = sanctionsService.getCacheStats();
      expect(cacheStats.size).toBe(1); // Only the new entry should remain
    });

    test('should provide cache statistics', () => {
      const stats = sanctionsService.getCacheStats();
      
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('timeout');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.timeout).toBe('number');
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      // Mock a network error scenario
      const originalTimeout = sanctionsService.cacheTimeout;
      sanctionsService.cacheTimeout = 0; // Disable cache for this test
      
      const result = await sanctionsService.checkAddress('ERROR_ADDRESS');
      
      // Should fail safe - not sanctioned but with error details
      expect(result.isSanctioned).toBe(false);
      expect(result.details).toHaveProperty('error');
      
      sanctionsService.cacheTimeout = originalTimeout;
    });
  });
});
