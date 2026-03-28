const { AppDatabase } = require('../db/appDatabase');
const { SanctionsListService } = require('./sanctionsListService');
const { logger } = require('../utils/logger');
const { sendEmail } = require('../utils/email');

/**
 * Background worker for AML/Sanctions screening of Stellar addresses
 */
class AMLScannerWorker {
  constructor(database, config = {}) {
    this.database = database;
    this.config = {
      scanInterval: config.scanInterval || 24 * 60 * 60 * 1000, // Daily
      batchSize: config.batchSize || 50,
      complianceOfficerEmail: config.complianceOfficerEmail || process.env.COMPLIANCE_OFFICER_EMAIL,
      maxRetries: config.maxRetries || 3,
      ...config
    };
    
    this.sanctionsService = new SanctionsListService(config.sanctions);
    this.isRunning = false;
    this.scanTimer = null;
    this.scanStats = {
      totalScans: 0,
      sanctionsFound: 0,
      accountsFrozen: 0,
      lastScanTime: null,
      errors: 0
    };
  }

  /**
   * Start the AML scanner worker
   */
  async start() {
    if (this.isRunning) {
      logger.warn('AML Scanner Worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting AML Scanner Worker', {
      scanInterval: this.config.scanInterval,
      batchSize: this.config.batchSize
    });

    // Run initial scan after a short delay
    setTimeout(() => this.runDailyScan(), 5000);

    // Schedule regular scans
    this.scanTimer = setInterval(() => {
      this.runDailyScan().catch(error => {
        logger.error('Scheduled AML scan failed', { error: error.message });
      });
    }, this.config.scanInterval);

    logger.info('AML Scanner Worker started successfully');
  }

  /**
   * Stop the AML scanner worker
   */
  async stop() {
    this.isRunning = false;
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    logger.info('AML Scanner Worker stopped');
  }

  /**
   * Run daily AML scan of all addresses
   */
  async runDailyScan() {
    if (!this.isRunning) {
      return;
    }

    const scanId = `aml_scan_${Date.now()}`;
    logger.info('Starting daily AML scan', { scanId });

    try {
      const startTime = Date.now();
      
      // Get all creator and subscriber addresses
      const addresses = await this.getAllAddresses();
      logger.info('Retrieved addresses for AML scan', { 
        scanId, 
        addressCount: addresses.length 
      });

      // Batch check addresses against sanctions lists
      const sanctionsResults = await this.sanctionsService.batchCheckAddresses(addresses);
      
      // Process results and take action
      const scanResults = await this.processSanctionsResults(sanctionsResults, scanId);
      
      // Update statistics
      this.updateScanStats(scanResults);
      
      const duration = Date.now() - startTime;
      logger.info('AML scan completed', {
        scanId,
        duration,
        totalAddresses: addresses.length,
        sanctionsFound: scanResults.sanctionsFound,
        accountsFrozen: scanResults.accountsFrozen
      });

      // Send compliance report if needed
      if (scanResults.sanctionsFound > 0) {
        await this.sendComplianceReport(scanResults);
      }

    } catch (error) {
      this.scanStats.errors++;
      logger.error('AML scan failed', { 
        scanId, 
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Get all creator and subscriber addresses from the database
   * @returns {Promise<string[]>}
   */
  async getAllAddresses() {
    const addresses = new Set();

    try {
      // Get all creator addresses
      const creators = this.database.db.prepare('SELECT id FROM creators').all();
      creators.forEach(creator => addresses.add(creator.id));

      // Get all subscriber wallet addresses
      const subscribers = this.database.db.prepare(
        'SELECT DISTINCT wallet_address FROM subscriptions WHERE active = 1'
      ).all();
      subscribers.forEach(sub => addresses.add(sub.wallet_address));

      // Get addresses from other relevant tables if needed
      // For example, from comments, payouts, etc.

      return Array.from(addresses);

    } catch (error) {
      logger.error('Error retrieving addresses from database', { error: error.message });
      throw error;
    }
  }

  /**
   * Process sanctions results and take appropriate actions
   * @param {Map<string, object>} sanctionsResults 
   * @param {string} scanId 
   * @returns {Promise<object>}
   */
  async processSanctionsResults(sanctionsResults, scanId) {
    const results = {
      sanctionsFound: 0,
      accountsFrozen: 0,
      sanctionedAddresses: [],
      errors: 0
    };

    for (const [address, sanctionsCheck] of sanctionsResults.entries()) {
      try {
        if (sanctionsCheck.isSanctioned) {
          results.sanctionsFound++;
          results.sanctionedAddresses.push({
            address,
            sources: sanctionsCheck.sources,
            details: sanctionsCheck.details,
            timestamp: new Date().toISOString()
          });

          // Freeze the account
          const frozen = await this.freezeAccount(address, sanctionsCheck, scanId);
          if (frozen) {
            results.accountsFrozen++;
          }

          // Log the sanctions match
          logger.warn('Sanctions match found - account frozen', {
            scanId,
            address,
            sources: sanctionsCheck.sources,
            frozen
          });
        }
      } catch (error) {
        results.errors++;
        logger.error('Error processing sanctions result for address', {
          scanId,
          address,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Freeze a sanctioned account
   * @param {string} address 
   * @param {object} sanctionsCheck 
   * @param {string} scanId 
   * @returns {Promise<boolean>}
   */
  async freezeAccount(address, sanctionsCheck, scanId) {
    try {
      // Create audit log entry
      const auditEntry = {
        creatorId: address, // Use address as creatorId for audit purposes
        actionType: 'ACCOUNT_FROZEN',
        entityType: 'USER',
        entityId: address,
        timestamp: new Date().toISOString(),
        ipAddress: 'AML_SCANNER',
        metadata: {
          reason: 'SANCTIONS_MATCH',
          scanId,
          sanctionsSources: sanctionsCheck.sources,
          sanctionsDetails: sanctionsCheck.details,
          automatedAction: true
        }
      };

      this.database.insertAuditLog(auditEntry);

      // Add notification to the user (if they can access it)
      try {
        this.database.insertNotification({
          creatorId: address,
          type: 'ACCOUNT_FROZEN',
          message: 'Your account has been frozen due to compliance requirements. Please contact support.',
          metadata: {
            reason: 'SANCTIONS_MATCH',
            sources: sanctionsCheck.sources,
            scanId
          }
        });
      } catch (notificationError) {
        logger.warn('Failed to create notification for frozen account', {
          address,
          error: notificationError.message
        });
      }

      // In a real implementation, you would also:
      // 1. Block API access for this address
      // 2. Freeze any associated funds
      // 3. Cancel active subscriptions
      // 4. Block new subscriptions

      return true;

    } catch (error) {
      logger.error('Error freezing account', {
        address,
        scanId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Send compliance report to compliance officer
   * @param {object} scanResults 
   */
  async sendComplianceReport(scanResults) {
    if (!this.config.complianceOfficerEmail) {
      logger.warn('No compliance officer email configured - skipping report');
      return;
    }

    try {
      const reportData = {
        scanId: scanResults.scanId || `aml_scan_${Date.now()}`,
        timestamp: new Date().toISOString(),
        summary: {
          totalAddresses: scanResults.totalAddresses || 0,
          sanctionsFound: scanResults.sanctionsFound,
          accountsFrozen: scanResults.accountsFrozen,
          errors: scanResults.errors
        },
        sanctionedAddresses: scanResults.sanctionedAddresses || [],
        scanStats: this.scanStats
      };

      // Send email notification
      await sendEmail({
        to: this.config.complianceOfficerEmail,
        subject: `🚨 AML Sanctions Alert - ${scanResults.sanctionsFound} Sanctioned Addresses Found`,
        template: 'aml_compliance_report',
        data: reportData
      });

      logger.info('Compliance report sent', {
        recipient: this.config.complianceOfficerEmail,
        sanctionsFound: scanResults.sanctionsFound
      });

    } catch (error) {
      logger.error('Failed to send compliance report', {
        error: error.message,
        complianceOfficerEmail: this.config.complianceOfficerEmail
      });
    }
  }

  /**
   * Update scan statistics
   * @param {object} scanResults 
   */
  updateScanStats(scanResults) {
    this.scanStats.totalScans++;
    this.scanStats.sanctionsFound += scanResults.sanctionsFound;
    this.scanStats.accountsFrozen += scanResults.accountsFrozen;
    this.scanStats.lastScanTime = new Date().toISOString();
  }

  /**
   * Get current scan statistics
   * @returns {object}
   */
  getScanStats() {
    return {
      ...this.scanStats,
      isRunning: this.isRunning,
      nextScanTime: this.scanTimer ? new Date(Date.now() + this.config.scanInterval).toISOString() : null,
      cacheStats: this.sanctionsService.getCacheStats()
    };
  }

  /**
   * Trigger an immediate scan (for manual/admin use)
   * @returns {Promise<object>}
   */
  async triggerImmediateScan() {
    const scanId = `manual_scan_${Date.now()}`;
    logger.info('Manual AML scan triggered', { scanId });

    try {
      await this.runDailyScan();
      return {
        success: true,
        scanId,
        stats: this.getScanStats()
      };
    } catch (error) {
      logger.error('Manual AML scan failed', { scanId, error: error.message });
      return {
        success: false,
        scanId,
        error: error.message
      };
    }
  }

  /**
   * Check if an address is currently frozen
   * @param {string} address 
   * @returns {boolean}
   */
  isAccountFrozen(address) {
    try {
      const auditLogs = this.database.listAuditLogsByCreatorId(address);
      const freezeLog = auditLogs.find(log => 
        log.actionType === 'ACCOUNT_FROZEN' && 
        log.metadata?.reason === 'SANCTIONS_MATCH'
      );
      return !!freezeLog;
    } catch (error) {
      logger.error('Error checking if account is frozen', { address, error: error.message });
      return false;
    }
  }

  /**
   * Get all frozen accounts
   * @returns {Array<{address: string, frozenAt: string, reason: object}>}
   */
  getFrozenAccounts() {
    try {
      // This is a simplified approach - in production you might want a dedicated table
      const allCreators = this.database.db.prepare('SELECT id FROM creators').all();
      const frozenAccounts = [];

      for (const creator of allCreators) {
        const auditLogs = this.database.listAuditLogsByCreatorId(creator.id);
        const freezeLog = auditLogs.find(log => 
          log.actionType === 'ACCOUNT_FROZEN' && 
          log.metadata?.reason === 'SANCTIONS_MATCH'
        );
        
        if (freezeLog) {
          frozenAccounts.push({
            address: creator.id,
            frozenAt: freezeLog.timestamp,
            reason: freezeLog.metadata
          });
        }
      }

      return frozenAccounts;

    } catch (error) {
      logger.error('Error retrieving frozen accounts', { error: error.message });
      return [];
    }
  }
}

module.exports = { AMLScannerWorker };
