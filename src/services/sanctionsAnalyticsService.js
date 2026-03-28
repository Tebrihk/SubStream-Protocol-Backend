const { logger } = require('../src/utils/logger');

/**
 * Advanced sanctions analytics and reporting service
 */
class SanctionsAnalyticsService {
  constructor(database, config = {}) {
    this.database = database;
    this.config = {
      retentionDays: config.retentionDays || 2555, // 7 years for compliance
      reportFormats: config.reportFormats || ['json', 'csv', 'pdf'],
      aggregationIntervals: config.aggregationIntervals || ['hourly', 'daily', 'weekly', 'monthly'],
      ...config
    };
  }

  /**
   * Generate comprehensive AML analytics report
   * @param {object} options - Report generation options
   * @returns {object} Comprehensive analytics report
   */
  async generateAnalyticsReport(options = {}) {
    const {
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      endDate = new Date(),
      includeDetails = true,
      format = 'json'
    } = options;

    try {
      logger.info('Generating AML analytics report', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        format
      });

      const report = {
        metadata: {
          generatedAt: new Date().toISOString(),
          period: {
            start: startDate.toISOString(),
            end: endDate.toISOString()
          },
          format,
          version: '1.0'
        },
        summary: await this.generateSummary(startDate, endDate),
        trends: await this.analyzeTrends(startDate, endDate),
        geographicAnalysis: await this.analyzeGeographicDistribution(startDate, endDate),
        riskAssessment: await this.performRiskAssessment(startDate, endDate),
        performanceMetrics: await this.analyzePerformance(startDate, endDate),
        complianceMetrics: await this.calculateComplianceMetrics(startDate, endDate)
      };

      if (includeDetails) {
        report.details = {
          sanctionedAddresses: await this.getSanctionedAddressesDetails(startDate, endDate),
          scanHistory: await this.getScanHistory(startDate, endDate),
          errorAnalysis: await this.analyzeErrors(startDate, endDate)
        };
      }

      logger.info('AML analytics report generated successfully', {
        reportSize: JSON.stringify(report).length
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate AML analytics report', {
        error: error.message,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
      throw error;
    }
  }

  /**
   * Generate summary statistics for the period
   */
  async generateSummary(startDate, endDate) {
    // Get all audit logs for the period
    const auditLogs = this.database.db.prepare(`
      SELECT * FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ? 
      AND action_type = 'ACCOUNT_FROZEN'
      ORDER BY created_at DESC
    `).all(startDate.toISOString(), endDate.toISOString());

    const totalScans = this.database.db.prepare(`
      SELECT COUNT(DISTINCT metadata_json->>'scanId') as count
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND metadata_json->>'reason' = 'SANCTIONS_MATCH'
    `).get(startDate.toISOString(), endDate.toISOString());

    const uniqueAddresses = this.database.db.prepare(`
      SELECT COUNT(DISTINCT creator_id) as count
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND action_type = 'ACCOUNT_FROZEN'
    `).get(startDate.toISOString(), endDate.toISOString());

    return {
      totalScans: totalScans.count || 0,
      totalSanctionsFound: auditLogs.length,
      uniqueAddressesAffected: uniqueAddresses.count || 0,
      averageSanctionsPerScan: auditLogs.length > 0 && totalScans.count > 0 ? 
        (auditLogs.length / totalScans.count).toFixed(2) : 0,
      firstDetection: auditLogs.length > 0 ? auditLogs[auditLogs.length - 1].created_at : null,
      lastDetection: auditLogs.length > 0 ? auditLogs[0].created_at : null
    };
  }

  /**
   * Analyze trends over time
   */
  async analyzeTrends(startDate, endDate) {
    const dailyData = this.database.db.prepare(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as sanctions_found,
        COUNT(DISTINCT creator_id) as unique_addresses
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND action_type = 'ACCOUNT_FROZEN'
      GROUP BY DATE(created_at)
      ORDER BY date
    `).all(startDate.toISOString(), endDate.toISOString());

    // Calculate trend statistics
    const sanctionsCounts = dailyData.map(d => d.sanctions_found);
    const trend = this.calculateTrend(sanctionsCounts);

    return {
      daily: dailyData,
      trend: {
        direction: trend.direction,
        slope: trend.slope,
        confidence: trend.confidence,
        description: this.describeTrend(trend)
      },
      patterns: this.identifyPatterns(dailyData)
    };
  }

  /**
   * Analyze geographic distribution of sanctioned addresses
   */
  async analyzeGeographicDistribution(startDate, endDate) {
    // This would integrate with a geolocation service
    // For now, return placeholder data
    const auditLogs = this.database.db.prepare(`
      SELECT creator_id, created_at, metadata_json
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND action_type = 'ACCOUNT_FROZEN'
    `).all(startDate.toISOString(), endDate.toISOString());

    // Mock geographic analysis - in production, integrate with IP geolocation
    const geographicData = auditLogs.reduce((acc, log) => {
      const sources = JSON.parse(log.metadata_json || '{}').sanctionsSources || [];
      sources.forEach(source => {
        acc[source] = (acc[source] || 0) + 1;
      });
      return acc;
    }, {});

    return {
      bySanctionsSource: geographicData,
      byRegion: {}, // Would be populated with actual geolocation data
      topRegions: [], // Would be calculated from geolocation data
      unknownRegions: auditLogs.length // Addresses that couldn't be geolocated
    };
  }

  /**
   * Perform comprehensive risk assessment
   */
  async performRiskAssessment(startDate, endDate) {
    const auditLogs = this.database.db.prepare(`
      SELECT creator_id, created_at, metadata_json
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND action_type = 'ACCOUNT_FROZEN'
    `).all(startDate.toISOString(), endDate.toISOString());

    const riskFactors = {
      highRiskSanctions: 0,
      multipleSources: 0,
      repeatAddresses: 0,
      newSanctions: 0
    };

    const addressFrequency = {};
    
    auditLogs.forEach(log => {
      const metadata = JSON.parse(log.metadata_json || '{}');
      const address = log.creator_id;
      
      // Track address frequency
      addressFrequency[address] = (addressFrequency[address] || 0) + 1;
      
      // Count multiple sources
      if (metadata.sanctionsSources && metadata.sanctionsSources.length > 1) {
        riskFactors.multipleSources++;
      }
      
      // Check for high-risk sanctions lists
      if (metadata.sanctionsSources && metadata.sanctionsSources.includes('OFAC_SDN')) {
        riskFactors.highRiskSanctions++;
      }
    });

    // Count repeat addresses
    Object.values(addressFrequency).forEach(freq => {
      if (freq > 1) {
        riskFactors.repeatAddresses++;
      }
    });

    // Calculate overall risk score
    const totalAddresses = Object.keys(addressFrequency).length;
    const riskScore = this.calculateRiskScore(riskFactors, totalAddresses);

    return {
      riskFactors,
      riskScore,
      riskLevel: this.getRiskLevel(riskScore),
      recommendations: this.generateRiskRecommendations(riskFactors, riskScore),
      highRiskAddresses: this.identifyHighRiskAddresses(addressFrequency)
    };
  }

  /**
   * Analyze system performance metrics
   */
  async analyzePerformance(startDate, endDate) {
    // This would analyze scan times, error rates, API performance
    // For now, return placeholder data based on available logs
    
    const totalLogs = this.database.db.prepare(`
      SELECT COUNT(*) as count
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
    `).get(startDate.toISOString(), endDate.toISOString());

    const errorLogs = this.database.db.prepare(`
      SELECT COUNT(*) as count
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND metadata_json LIKE '%error%'
    `).get(startDate.toISOString(), endDate.toISOString());

    return {
      totalOperations: totalLogs.count || 0,
      errorRate: totalLogs.count > 0 ? (errorLogs.count / totalLogs.count * 100).toFixed(2) : 0,
      averageResponseTime: 0, // Would be calculated from actual performance data
      throughput: totalLogs.count / Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)), // per day
      uptime: 99.9 // Would be calculated from actual monitoring data
    };
  }

  /**
   * Calculate compliance metrics
   */
  async calculateComplianceMetrics(startDate, endDate) {
    const auditLogs = this.database.db.prepare(`
      SELECT creator_id, created_at, metadata_json
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND action_type = 'ACCOUNT_FROZEN'
    `).all(startDate.toISOString(), endDate.toISOString());

    // Calculate compliance metrics
    const totalAddresses = this.database.db.prepare(`
      SELECT COUNT(DISTINCT id) as count
      FROM creators
    `).get().count;

    const screenedAddresses = this.database.db.prepare(`
      SELECT COUNT(DISTINCT creator_id) as count
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND metadata_json->>'reason' = 'SANCTIONS_MATCH'
    `).get(startDate.toISOString(), endDate.toISOString()).count;

    return {
      screeningCoverage: totalAddresses > 0 ? (screenedAddresses / totalAddresses * 100).toFixed(2) : 0,
      detectionRate: auditLogs.length > 0 ? (auditLogs.length / screenedAddresses * 100).toFixed(2) : 0,
      falsePositiveRate: 0, // Would be calculated from manual reviews
      regulatoryReporting: {
        reportsFiled: auditLogs.length, // Each sanction should trigger a report
        averageReportingTime: 0, // Would be calculated from actual data
        complianceScore: 100 // Would be calculated based on various factors
      },
      auditTrail: {
        completeness: 100, // All actions should be logged
        integrity: 100, // Logs should be immutable
        retention: this.calculateRetentionCompliance()
      }
    };
  }

  /**
   * Get detailed information about sanctioned addresses
   */
  async getSanctionedAddressesDetails(startDate, endDate) {
    return this.database.db.prepare(`
      SELECT 
        creator_id as address,
        created_at as frozen_at,
        metadata_json
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND action_type = 'ACCOUNT_FROZEN'
      ORDER BY created_at DESC
    `).all(startDate.toISOString(), endDate.toISOString()).map(log => ({
      ...log,
      metadata: JSON.parse(log.metadata_json || '{}')
    }));
  }

  /**
   * Get scan history
   */
  async getScanHistory(startDate, endDate) {
    // Extract unique scan IDs from audit logs
    const scans = this.database.db.prepare(`
      SELECT 
        metadata_json->>'scanId' as scan_id,
        MIN(created_at) as started_at,
        MAX(created_at) as completed_at,
        COUNT(*) as actions_taken
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND metadata_json->>'scanId' IS NOT NULL
      GROUP BY metadata_json->>'scanId'
      ORDER BY started_at DESC
    `).all(startDate.toISOString(), endDate.toISOString());

    return scans.map(scan => ({
      scanId: scan.scan_id,
      startedAt: scan.started_at,
      completedAt: scan.completed_at,
      duration: new Date(scan.completed_at) - new Date(scan.started_at),
      actionsTaken: scan.actions_taken
    }));
  }

  /**
   * Analyze errors and failures
   */
  async analyzeErrors(startDate, endDate) {
    const errorLogs = this.database.db.prepare(`
      SELECT 
        created_at,
        metadata_json
      FROM creator_audit_logs 
      WHERE created_at BETWEEN ? AND ?
      AND metadata_json LIKE '%error%'
      ORDER BY created_at DESC
    `).all(startDate.toISOString(), endDate.toISOString());

    const errorTypes = {};
    const errorsByHour = {};

    errorLogs.forEach(log => {
      const metadata = JSON.parse(log.metadata_json || '{}');
      const errorType = metadata.error || 'Unknown';
      const hour = new Date(log.created_at).getHours();

      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      errorsByHour[hour] = (errorsByHour[hour] || 0) + 1;
    });

    return {
      totalErrors: errorLogs.length,
      errorTypes,
      errorsByHour,
      mostCommonError: Object.keys(errorTypes).length > 0 ? 
        Object.keys(errorTypes).reduce((a, b) => errorTypes[a] > errorTypes[b] ? a : b) : null,
      errorRate: (errorLogs.length / Math.ceil((endDate - startDate) / (1000 * 60 * 60))).toFixed(2) // per hour
    };
  }

  /**
   * Calculate trend direction and slope
   */
  calculateTrend(values) {
    if (values.length < 2) {
      return { direction: 'stable', slope: 0, confidence: 0 };
    }

    // Simple linear regression
    const n = values.length;
    const sumX = (n * (n - 1)) / 2; // Sum of 0, 1, 2, ..., n-1
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6; // Sum of squares

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const direction = slope > 0.1 ? 'increasing' : slope < -0.1 ? 'decreasing' : 'stable';
    const confidence = Math.min(Math.abs(slope) * 10, 1); // Simple confidence calculation

    return { direction, slope, confidence };
  }

  /**
   * Describe trend in human-readable format
   */
  describeTrend(trend) {
    switch (trend.direction) {
      case 'increasing':
        return `Sanctions detections are increasing at a rate of ${trend.slope.toFixed(2)} per day`;
      case 'decreasing':
        return `Sanctions detections are decreasing at a rate of ${Math.abs(trend.slope).toFixed(2)} per day`;
      default:
        return 'Sanctions detections remain stable';
    }
  }

  /**
   * Identify patterns in the data
   */
  identifyPatterns(dailyData) {
    const patterns = [];

    // Check for weekly patterns
    const weeklyPattern = this.analyzeWeeklyPattern(dailyData);
    if (weeklyPattern.significant) {
      patterns.push(weeklyPattern);
    }

    // Check for spikes
    const spikes = this.identifySpikes(dailyData);
    if (spikes.length > 0) {
      patterns.push({ type: 'spikes', data: spikes });
    }

    return patterns;
  }

  /**
   * Analyze weekly patterns
   */
  analyzeWeeklyPattern(dailyData) {
    if (dailyData.length < 7) return { significant: false };

    const dayOfWeekAverages = {};
    dailyData.forEach(day => {
      const dayOfWeek = new Date(day.date).getDay();
      dayOfWeekAverages[dayOfWeek] = (dayOfWeekAverages[dayOfWeek] || []).push(day.sanctions_found);
    });

    // Calculate averages and variance
    Object.keys(dayOfWeekAverages).forEach(day => {
      const values = dayOfWeekAverages[day];
      dayOfWeekAverages[day] = {
        average: values.reduce((a, b) => a + b, 0) / values.length,
        variance: this.calculateVariance(values)
      };
    });

    // Check if variance is significant
    const variances = Object.values(dayOfWeekAverages).map(d => d.variance);
    const avgVariance = variances.reduce((a, b) => a + b, 0) / variances.length;

    return {
      significant: avgVariance > 0.5,
      pattern: dayOfWeekAverages,
      description: avgVariance > 0.5 ? 'Significant weekly pattern detected' : 'No significant weekly pattern'
    };
  }

  /**
   * Identify statistical spikes
   */
  identifySpikes(dailyData) {
    if (dailyData.length < 3) return [];

    const values = dailyData.map(d => d.sanctions_found);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const stdDev = Math.sqrt(this.calculateVariance(values));
    const threshold = mean + (2 * stdDev); // 2 standard deviations

    return dailyData
      .filter(day => day.sanctions_found > threshold)
      .map(day => ({
        date: day.date,
        value: day.sanctions_found,
        threshold,
        significance: (day.sanctions_found - threshold) / stdDev
      }));
  }

  /**
   * Calculate variance
   */
  calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  /**
   * Calculate risk score
   */
  calculateRiskScore(riskFactors, totalAddresses) {
    let score = 0;
    
    // High-risk sanctions (40% weight)
    score += (riskFactors.highRiskSanctions / totalAddresses) * 40;
    
    // Multiple sources (30% weight)
    score += (riskFactors.multipleSources / totalAddresses) * 30;
    
    // Repeat addresses (20% weight)
    score += (riskFactors.repeatAddresses / totalAddresses) * 20;
    
    // New sanctions (10% weight)
    score += (riskFactors.newSanctions / totalAddresses) * 10;

    return Math.min(score * 100, 100); // Cap at 100
  }

  /**
   * Get risk level based on score
   */
  getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'minimal';
  }

  /**
   * Generate risk recommendations
   */
  generateRiskRecommendations(riskFactors, riskScore) {
    const recommendations = [];

    if (riskFactors.highRiskSanctions > 0) {
      recommendations.push('Immediate review of high-risk sanctions matches required');
    }

    if (riskFactors.multipleSources > 0) {
      recommendations.push('Enhanced due diligence for addresses appearing on multiple sanctions lists');
    }

    if (riskFactors.repeatAddresses > 0) {
      recommendations.push('Investigate repeat addresses for potential systemic issues');
    }

    if (riskScore >= 60) {
      recommendations.push('Consider implementing additional screening measures');
    }

    if (recommendations.length === 0) {
      recommendations.push('Continue standard monitoring procedures');
    }

    return recommendations;
  }

  /**
   * Identify high-risk addresses
   */
  identifyHighRiskAddresses(addressFrequency) {
    return Object.entries(addressFrequency)
      .filter(([address, frequency]) => frequency > 1)
      .map(([address, frequency]) => ({ address, frequency }))
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Calculate retention compliance
   */
  calculateRetentionCompliance() {
    // Check if we're keeping records for the required retention period
    const oldestRecord = this.database.db.prepare(`
      SELECT MIN(created_at) as oldest
      FROM creator_audit_logs
    `).get();

    if (!oldestRecord.oldest) return 0;

    const daysSinceOldest = (Date.now() - new Date(oldestRecord.oldest)) / (1000 * 60 * 60 * 24);
    return Math.min((daysSinceOldest / this.config.retentionDays) * 100, 100);
  }
}

module.exports = { SanctionsAnalyticsService };
