const { logger } = require('../src/utils/logger');
const { AMLEmailTemplates } = require('../src/utils/amlEmailTemplates');

/**
 * Enhanced AML scanner worker with additional monitoring and reporting capabilities
 */
class EnhancedAMLScannerWorker {
  constructor(baseWorker, config = {}) {
    this.baseWorker = baseWorker;
    this.config = {
      weeklyReportEnabled: config.weeklyReportEnabled || false,
      weeklyReportDay: config.weeklyReportDay || 1, // Monday = 1
      weeklyReportHour: config.weeklyReportHour || 9, // 9 AM
      healthCheckInterval: config.healthCheckInterval || 5 * 60 * 1000, // 5 minutes
      alertThresholds: {
        errorRate: config.alertThresholds?.errorRate || 0.1, // 10%
        scanFailureRate: config.alertThresholds?.scanFailureRate || 0.05, // 5%
        apiFailureRate: config.alertThresholds?.apiFailureRate || 0.2, // 20%
        ...config.alertThresholds
      },
      ...config
    };
    
    this.healthStatus = {
      lastHealthCheck: null,
      consecutiveFailures: 0,
      lastScanSuccess: true,
      apiStatus: 'unknown',
      databaseStatus: 'unknown'
    };
    
    this.weeklyStats = {
      scans: [],
      errors: [],
      sanctionsFound: 0,
      accountsFrozen: 0
    };
    
    this.healthCheckTimer = null;
    this.weeklyReportTimer = null;
  }

  /**
   * Start enhanced monitoring
   */
  async startEnhancedMonitoring() {
    logger.info('Starting enhanced AML monitoring', {
      weeklyReports: this.config.weeklyReportEnabled,
      healthCheckInterval: this.config.healthCheckInterval
    });

    // Start health checks
    this.startHealthChecks();
    
    // Start weekly reports if enabled
    if (this.config.weeklyReportEnabled) {
      this.startWeeklyReports();
    }

    // Override base worker's runDailyScan to add enhanced logging
    this.enhanceDailyScanning();
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Run initial health check
    this.performHealthCheck();
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    try {
      const healthCheck = {
        timestamp: new Date().toISOString(),
        scannerStatus: this.baseWorker.isRunning ? 'running' : 'stopped',
        lastScanTime: this.baseWorker.getScanStats().lastScanTime,
        errorRate: this.calculateErrorRate(),
        apiStatus: await this.checkAPIHealth(),
        databaseStatus: await this.checkDatabaseHealth(),
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime()
      };

      this.healthStatus.lastHealthCheck = healthCheck;

      // Check for alert conditions
      await this.checkAlertConditions(healthCheck);

      logger.debug('AML health check completed', healthCheck);

    } catch (error) {
      this.healthStatus.consecutiveFailures++;
      logger.error('AML health check failed', {
        error: error.message,
        consecutiveFailures: this.healthStatus.consecutiveFailures
      });

      // Send alert if too many consecutive failures
      if (this.healthStatus.consecutiveFailures >= 3) {
        await this.sendHealthAlert({
          issueType: 'HEALTH_CHECK_FAILURE',
          severity: 'critical',
          description: `Health check failed ${this.healthStatus.consecutiveFailures} times consecutively`,
          impact: 'System monitoring may be compromised',
          actions: [
            'Check system logs for detailed error information',
            'Verify system resources (memory, CPU, disk)',
            'Restart AML scanner if necessary',
            'Contact technical support if issues persist'
          ]
        });
      }
    }
  }

  /**
   * Check sanctions API health
   */
  async checkAPIHealth() {
    try {
      // Test with a known clean address
      const testResult = await this.baseWorker.sanctionsService.checkAddress('GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ');
      this.healthStatus.apiStatus = testResult ? 'healthy' : 'degraded';
      return this.healthStatus.apiStatus;
    } catch (error) {
      this.healthStatus.apiStatus = 'unhealthy';
      return 'unhealthy';
    }
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth() {
    try {
      // Simple database connectivity test
      this.baseWorker.database.db.prepare('SELECT 1').get();
      this.healthStatus.databaseStatus = 'healthy';
      return 'healthy';
    } catch (error) {
      this.healthStatus.databaseStatus = 'unhealthy';
      return 'unhealthy';
    }
  }

  /**
   * Calculate current error rate
   */
  calculateErrorRate() {
    const stats = this.baseWorker.getScanStats();
    if (stats.totalScans === 0) return 0;
    return stats.errors / stats.totalScans;
  }

  /**
   * Check for alert conditions and send notifications
   */
  async checkAlertConditions(healthCheck) {
    const alerts = [];

    // Check error rate threshold
    if (healthCheck.errorRate > this.config.alertThresholds.errorRate) {
      alerts.push({
        issueType: 'HIGH_ERROR_RATE',
        severity: 'warning',
        description: `Error rate (${(healthCheck.errorRate * 100).toFixed(2)}%) exceeds threshold`,
        impact: 'Some sanctions checks may be failing',
        actions: [
          'Review recent error logs',
          'Check sanctions API connectivity',
          'Verify database performance',
          'Monitor system resources'
        ]
      });
    }

    // Check API status
    if (healthCheck.apiStatus === 'unhealthy') {
      alerts.push({
        issueType: 'API_UNHEALTHY',
        severity: 'critical',
        description: 'Sanctions API is unhealthy',
        impact: 'Real-time sanctions checking is not available',
        actions: [
          'Check API key configuration',
          'Verify API service status',
          'Review API rate limits',
          'Consider fallback procedures'
        ]
      });
    }

    // Check database status
    if (healthCheck.databaseStatus === 'unhealthy') {
      alerts.push({
        issueType: 'DATABASE_UNHEALTHY',
        severity: 'critical',
        description: 'Database connection is unhealthy',
        impact: 'Audit logging and account freezing may fail',
        actions: [
          'Check database connectivity',
          'Verify database server status',
          'Review database logs',
          'Check available disk space'
        ]
      });
    }

    // Check memory usage
    const memoryUsageMB = healthCheck.memoryUsage.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 500) { // 500MB threshold
      alerts.push({
        issueType: 'HIGH_MEMORY_USAGE',
        severity: 'warning',
        description: `Memory usage is high: ${memoryUsageMB.toFixed(2)}MB`,
        impact: 'System performance may be degraded',
        actions: [
          'Monitor memory usage trends',
          'Check for memory leaks',
          'Consider increasing system memory',
          'Restart scanner if necessary'
        ]
      });
    }

    // Send alerts
    for (const alert of alerts) {
      await this.sendHealthAlert({
        ...alert,
        detectedAt: healthCheck.timestamp,
        systemStatus: {
          scanner: healthCheck.scannerStatus,
          api: healthCheck.apiStatus,
          database: healthCheck.databaseStatus,
          lastCheck: healthCheck.timestamp,
          lastApiCheck: healthCheck.timestamp,
          lastDbCheck: healthCheck.timestamp
        }
      });
    }
  }

  /**
   * Send health alert email
   */
  async sendHealthAlert(alertData) {
    try {
      const alertId = `health_alert_${Date.now()}`;
      const emailConfig = AMLEmailTemplates.systemHealthAlert({
        ...alertData,
        alertId,
        complianceOfficerEmail: this.config.complianceOfficerEmail
      });

      // Send email using existing email service
      const { sendEmail } = require('../src/utils/email');
      await sendEmail(emailConfig);

      logger.warn('Health alert sent', {
        alertId,
        issueType: alertData.issueType,
        severity: alertData.severity
      });

    } catch (error) {
      logger.error('Failed to send health alert', {
        error: error.message,
        issueType: alertData.issueType
      });
    }
  }

  /**
   * Start weekly report scheduling
   */
  startWeeklyReports() {
    const scheduleNextReport = () => {
      const now = new Date();
      const nextReport = new Date(now);
      
      // Set to next specified day and hour
      nextReport.setDate(now.getDate() + ((this.config.weeklyReportDay + 7 - now.getDay()) % 7));
      nextReport.setHours(this.config.weeklyReportHour, 0, 0, 0);
      
      // If the time has passed today, schedule for next week
      if (nextReport <= now) {
        nextReport.setDate(nextReport.getDate() + 7);
      }

      const delay = nextReport - now;
      
      this.weeklyReportTimer = setTimeout(async () => {
        await this.sendWeeklyReport();
        scheduleNextReport(); // Schedule next report
      }, delay);

      logger.info('Weekly AML report scheduled', {
        nextReport: nextReport.toISOString(),
        delay: delay
      });
    };

    scheduleNextReport();
  }

  /**
   * Send weekly compliance report
   */
  async sendWeeklyReport() {
    try {
      const weekEnd = new Date();
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 7);

      const weeklyData = {
        weekStart: weekStart.toLocaleDateString(),
        weekEnd: weekEnd.toLocaleDateString(),
        complianceOfficerEmail: this.config.complianceOfficerEmail,
        weeklyStats: this.calculateWeeklyStats(),
        previousWeekStats: this.calculatePreviousWeekStats(),
        recommendations: this.generateRecommendations()
      };

      const emailConfig = AMLEmailTemplates.weeklySummary(weeklyData);
      
      const { sendEmail } = require('../src/utils/email');
      await sendEmail(emailConfig);

      logger.info('Weekly AML report sent', {
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString()
      });

      // Reset weekly stats
      this.weeklyStats = {
        scans: [],
        errors: [],
        sanctionsFound: 0,
        accountsFrozen: 0
      };

    } catch (error) {
      logger.error('Failed to send weekly report', {
        error: error.message
      });
    }
  }

  /**
   * Calculate weekly statistics
   */
  calculateWeeklyStats() {
    const stats = this.baseWorker.getScanStats();
    return {
      totalScans: this.weeklyStats.scans.length,
      addressesScanned: this.weeklyStats.scans.reduce((total, scan) => total + (scan.addressCount || 0), 0),
      sanctionsFound: this.weeklyStats.sanctionsFound,
      accountsFrozen: this.weeklyStats.accountsFrozen,
      successRate: this.weeklyStats.scans.length > 0 ? 
        ((this.weeklyStats.scans.length - this.weeklyStats.errors.length) / this.weeklyStats.scans.length * 100).toFixed(2) : 100,
      avgScanTime: this.weeklyStats.scans.length > 0 ?
        (this.weeklyStats.scans.reduce((total, scan) => total + (scan.duration || 0), 0) / this.weeklyStats.scans.length / 1000).toFixed(2) : 0,
      falsePositiveRate: 0 // Would be calculated based on manual reviews
    };
  }

  /**
   * Calculate previous week statistics (placeholder)
   */
  calculatePreviousWeekStats() {
    // In a real implementation, this would pull historical data
    return {
      totalScans: 0,
      addressesScanned: 0,
      sanctionsFound: 0,
      accountsFrozen: 0,
      successRate: 100,
      avgScanTime: 0,
      falsePositiveRate: 0
    };
  }

  /**
   * Generate recommendations based on weekly stats
   */
  generateRecommendations() {
    const recommendations = [];
    const stats = this.calculateWeeklyStats();

    if (stats.successRate < 95) {
      recommendations.push('Review error logs and address recurring scan failures');
    }

    if (stats.avgScanTime > 300) { // 5 minutes
      recommendations.push('Consider optimizing scan performance or reducing batch size');
    }

    if (stats.sanctionsFound > 0) {
      recommendations.push('Review all sanctions matches and update risk assessment procedures');
    }

    if (recommendations.length === 0) {
      recommendations.push('System operating normally - continue regular monitoring');
    }

    return recommendations;
  }

  /**
   * Enhance daily scanning with additional logging
   */
  enhanceDailyScanning() {
    const originalRunDailyScan = this.baseWorker.runDailyScan.bind(this.baseWorker);
    
    this.baseWorker.runDailyScan = async (...args) => {
      const scanStart = Date.now();
      const scanId = `enhanced_scan_${scanStart}`;
      
      try {
        logger.info('Enhanced AML scan started', { scanId });
        
        const result = await originalRunDailyScan(...args);
        
        const scanDuration = Date.now() - scanStart;
        const stats = this.baseWorker.getScanStats();
        
        // Record scan in weekly stats
        this.weeklyStats.scans.push({
          scanId,
          timestamp: new Date().toISOString(),
          duration: scanDuration,
          addressCount: result?.totalAddresses || 0,
          sanctionsFound: result?.sanctionsFound || 0
        });
        
        this.weeklyStats.sanctionsFound += result?.sanctionsFound || 0;
        this.weeklyStats.accountsFrozen += result?.accountsFrozen || 0;
        
        logger.info('Enhanced AML scan completed', {
          scanId,
          duration: scanDuration,
          sanctionsFound: result?.sanctionsFound || 0,
          accountsFrozen: result?.accountsFrozen || 0
        });
        
        this.healthStatus.lastScanSuccess = true;
        this.healthStatus.consecutiveFailures = 0;
        
        return result;
        
      } catch (error) {
        const scanDuration = Date.now() - scanStart;
        
        this.weeklyStats.errors.push({
          scanId,
          timestamp: new Date().toISOString(),
          duration: scanDuration,
          error: error.message
        });
        
        this.healthStatus.lastScanSuccess = false;
        this.healthStatus.consecutiveFailures++;
        
        logger.error('Enhanced AML scan failed', {
          scanId,
          duration: scanDuration,
          error: error.message,
          consecutiveFailures: this.healthStatus.consecutiveFailures
        });
        
        throw error;
      }
    };
  }

  /**
   * Get enhanced status including health information
   */
  getEnhancedStatus() {
    return {
      ...this.baseWorker.getScanStats(),
      healthStatus: this.healthStatus,
      weeklyStats: this.calculateWeeklyStats(),
      config: {
        weeklyReportEnabled: this.config.weeklyReportEnabled,
        healthCheckInterval: this.config.healthCheckInterval,
        alertThresholds: this.config.alertThresholds
      }
    };
  }

  /**
   * Stop enhanced monitoring
   */
  async stopEnhancedMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    if (this.weeklyReportTimer) {
      clearTimeout(this.weeklyReportTimer);
      this.weeklyReportTimer = null;
    }
    
    logger.info('Enhanced AML monitoring stopped');
  }
}

module.exports = { EnhancedAMLScannerWorker };
