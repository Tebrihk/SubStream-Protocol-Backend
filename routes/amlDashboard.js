const express = require('express');
const { logger } = require('../src/utils/logger');
const { SanctionsAnalyticsService } = require('../src/services/sanctionsAnalyticsService');

/**
 * Create enhanced AML dashboard routes
 * @param {object} dependencies - Service dependencies
 * @returns {express.Router}
 */
function createAMLDashboardRoutes(dependencies = {}) {
  const router = express.Router();
  const amlScannerWorker = dependencies.amlScannerWorker;
  const database = dependencies.database;

  if (!database) {
    throw new Error('Database dependency required for AML dashboard');
  }

  const analyticsService = new SanctionsAnalyticsService(database);

  /**
   * Get comprehensive AML dashboard overview
   * GET /api/aml/dashboard
   */
  router.get('/dashboard', async (req, res) => {
    try {
      if (!amlScannerWorker) {
        return res.status(503).json({
          success: false,
          error: 'AML scanner not enabled'
        });
      }

      const { period = '30d' } = req.query;
      const startDate = getStartDate(period);
      const endDate = new Date();

      // Get comprehensive analytics
      const analytics = await analyticsService.generateAnalyticsReport({
        startDate,
        endDate,
        includeDetails: false // Summary view
      });

      // Get current scanner status
      const scannerStatus = amlScannerWorker.getScanStats();

      // Combine into dashboard view
      const dashboard = {
        metadata: {
          period,
          generatedAt: new Date().toISOString(),
          scannerVersion: '1.0.0'
        },
        overview: {
          ...scannerStatus,
          ...analytics.summary,
          healthStatus: 'healthy' // Would be determined from actual health checks
        },
        trends: analytics.trends,
        risk: analytics.riskAssessment,
        performance: analytics.performanceMetrics,
        compliance: analytics.complianceMetrics
      };

      return res.status(200).json({
        success: true,
        data: dashboard
      });

    } catch (error) {
      logger.error('Error generating AML dashboard', {
        error: error.message,
        period: req.query.period,
        traceId: req.logger?.fields?.traceId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to generate dashboard'
      });
    }
  });

  /**
   * Get detailed analytics report
   * GET /api/aml/analytics
   */
  router.get('/analytics', async (req, res) => {
    try {
      if (!amlScannerWorker) {
        return res.status(503).json({
          success: false,
          error: 'AML scanner not enabled'
        });
      }

      const {
        period = '30d',
        format = 'json',
        includeDetails = 'true'
      } = req.query;

      const startDate = getStartDate(period);
      const endDate = new Date();

      const analytics = await analyticsService.generateAnalyticsReport({
        startDate,
        endDate,
        includeDetails: includeDetails === 'true',
        format
      });

      // Handle different response formats
      if (format === 'csv') {
        const csv = convertToCSV(analytics);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="aml_analytics_${period}.csv"`);
        return res.status(200).send(csv);
      }

      return res.status(200).json({
        success: true,
        data: analytics
      });

    } catch (error) {
      logger.error('Error generating AML analytics', {
        error: error.message,
        period: req.query.period,
        format: req.query.format,
        traceId: req.logger?.fields?.traceId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to generate analytics'
      });
    }
  });

  /**
   * Get real-time monitoring data
   * GET /api/aml/monitoring
   */
  router.get('/monitoring', async (req, res) => {
    try {
      if (!amlScannerWorker) {
        return res.status(503).json({
          success: false,
          error: 'AML scanner not enabled'
        });
      }

      const monitoring = {
        timestamp: new Date().toISOString(),
        scanner: {
          status: amlScannerWorker.isRunning ? 'running' : 'stopped',
          lastScan: amlScannerWorker.getScanStats().lastScanTime,
          nextScan: amlScannerWorker.getScanStats().nextScanTime,
          uptime: process.uptime()
        },
        system: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          platform: process.platform,
          nodeVersion: process.version
        },
        performance: {
          scansPerHour: calculateScansPerHour(amlScannerWorker),
          averageScanTime: calculateAverageScanTime(amlScannerWorker),
          errorRate: calculateErrorRate(amlScannerWorker),
          throughput: calculateThroughput(amlScannerWorker)
        },
        alerts: await getActiveAlerts(database),
        recentActivity: await getRecentActivity(database, 24) // Last 24 hours
      };

      return res.status(200).json({
        success: true,
        data: monitoring
      });

    } catch (error) {
      logger.error('Error getting monitoring data', {
        error: error.message,
        traceId: req.logger?.fields?.traceId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to get monitoring data'
      });
    }
  });

  /**
   * Get compliance reports
   * GET /api/aml/compliance-reports
   */
  router.get('/compliance-reports', async (req, res) => {
    try {
      const { period = '30d', type = 'summary' } = req.query;
      const startDate = getStartDate(period);
      const endDate = new Date();

      let report;

      switch (type) {
        case 'detailed':
          report = await generateDetailedComplianceReport(database, startDate, endDate);
          break;
        case 'regulatory':
          report = await generateRegulatoryReport(database, startDate, endDate);
          break;
        case 'summary':
        default:
          report = await generateSummaryComplianceReport(database, startDate, endDate);
          break;
      }

      return res.status(200).json({
        success: true,
        data: report
      });

    } catch (error) {
      logger.error('Error generating compliance report', {
        error: error.message,
        type: req.query.type,
        period: req.query.period,
        traceId: req.logger?.fields?.traceId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to generate compliance report'
      });
    }
  });

  /**
   * Export data in various formats
   * GET /api/aml/export
   */
  router.get('/export', async (req, res) => {
    try {
      const {
        period = '30d',
        format = 'json',
        type = 'all'
      } = req.query;

      const startDate = getStartDate(period);
      const endDate = new Date();

      let data;
      let filename;
      let contentType;

      switch (type) {
        case 'sanctions':
          data = await exportSanctionsData(database, startDate, endDate);
          filename = `sanctions_export_${period}.${format}`;
          break;
        case 'scans':
          data = await exportScanData(database, startDate, endDate);
          filename = `scans_export_${period}.${format}`;
          break;
        case 'audit':
          data = await exportAuditData(database, startDate, endDate);
          filename = `audit_export_${period}.${format}`;
          break;
        case 'all':
        default:
          data = await exportAllData(database, startDate, endDate);
          filename = `aml_export_${period}.${format}`;
          break;
      }

      // Format response
      if (format === 'csv') {
        contentType = 'text/csv';
        data = convertToCSV(data);
      } else if (format === 'xml') {
        contentType = 'application/xml';
        data = convertToXML(data);
      } else {
        contentType = 'application/json';
        data = JSON.stringify(data, null, 2);
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(data);

    } catch (error) {
      logger.error('Error exporting AML data', {
        error: error.message,
        period: req.query.period,
        format: req.query.format,
        type: req.query.type,
        traceId: req.logger?.fields?.traceId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to export data'
      });
    }
  });

  return router;
}

/**
 * Helper functions for dashboard routes
 */

function getStartDate(period) {
  const now = new Date();
  switch (period) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '1y':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function calculateScansPerHour(worker) {
  const stats = worker.getScanStats();
  if (!stats.lastScanTime) return 0;
  
  const hoursSinceLastScan = (Date.now() - new Date(stats.lastScanTime)) / (1000 * 60 * 60);
  return hoursSinceLastScan > 0 ? (1 / hoursSinceLastScan).toFixed(2) : 0;
}

function calculateAverageScanTime(worker) {
  // This would be calculated from actual scan timing data
  // For now, return a placeholder
  return 45.5; // seconds
}

function calculateErrorRate(worker) {
  const stats = worker.getScanStats();
  if (stats.totalScans === 0) return 0;
  return ((stats.errors / stats.totalScans) * 100).toFixed(2);
}

function calculateThroughput(worker) {
  const stats = worker.getScanStats();
  const addressesPerScan = 100; // Would be calculated from actual data
  return stats.totalScans > 0 ? (addressesPerScan * stats.totalScans).toFixed(0) : 0;
}

async function getActiveAlerts(database) {
  // This would query an alerts table
  // For now, return placeholder data
  return [];
}

async function getRecentActivity(database, hours) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  return database.db.prepare(`
    SELECT 
      action_type,
      entity_id,
      timestamp,
      metadata_json
    FROM creator_audit_logs 
    WHERE created_at > ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(cutoff.toISOString()).map(log => ({
    type: log.action_type,
    entityId: log.entity_id,
    timestamp: log.timestamp,
    metadata: JSON.parse(log.metadata_json || '{}')
  }));
}

async function generateDetailedComplianceReport(database, startDate, endDate) {
  const analytics = new SanctionsAnalyticsService(database);
  return await analytics.generateAnalyticsReport({
    startDate,
    endDate,
    includeDetails: true
  });
}

async function generateRegulatoryReport(database, startDate, endDate) {
  // Generate report specifically for regulatory filing
  const sanctions = database.db.prepare(`
    SELECT 
      creator_id as address,
      created_at as detection_date,
      metadata_json
    FROM creator_audit_logs 
    WHERE created_at BETWEEN ? AND ?
    AND action_type = 'ACCOUNT_FROZEN'
    ORDER BY created_at ASC
  `).all(startDate.toISOString(), endDate.toISOString());

  return {
    reportType: 'regulatory',
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    totalSanctions: sanctions.length,
    sanctions: sanctions.map(s => ({
      ...s,
      metadata: JSON.parse(s.metadata_json || '{}')
    })),
    filingRequirements: {
      suspiciousActivityReport: sanctions.length > 0,
      currencyTransactionReport: false, // Would depend on transaction amounts
      annualReport: new Date().getMonth() === 0 // January
    }
  };
}

async function generateSummaryComplianceReport(database, startDate, endDate) {
  const analytics = new SanctionsAnalyticsService(database);
  const fullReport = await analytics.generateAnalyticsReport({
    startDate,
    endDate,
    includeDetails: false
  });

  return {
    reportType: 'summary',
    period: { start: startDate.toISOString(), end: endDate.toISOString() },
    summary: fullReport.summary,
    riskLevel: fullReport.riskAssessment.riskLevel,
    complianceScore: fullReport.complianceMetrics.regulatoryReporting.complianceScore,
    recommendations: fullReport.riskAssessment.recommendations
  };
}

async function exportSanctionsData(database, startDate, endDate) {
  return database.db.prepare(`
    SELECT 
      creator_id as address,
      created_at as frozen_at,
      metadata_json as metadata
    FROM creator_audit_logs 
    WHERE created_at BETWEEN ? AND ?
    AND action_type = 'ACCOUNT_FROZEN'
    ORDER BY created_at DESC
  `).all(startDate.toISOString(), endDate.toISOString());
}

async function exportScanData(database, startDate, endDate) {
  // Extract scan information from metadata
  const scans = database.db.prepare(`
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
    ...scan,
    duration: new Date(scan.completed_at) - new Date(scan.started_at)
  }));
}

async function exportAuditData(database, startDate, endDate) {
  return database.db.prepare(`
    SELECT *
    FROM creator_audit_logs 
    WHERE created_at BETWEEN ? AND ?
    ORDER BY created_at DESC
  `).all(startDate.toISOString(), endDate.toISOString());
}

async function exportAllData(database, startDate, endDate) {
  return {
    sanctions: await exportSanctionsData(database, startDate, endDate),
    scans: await exportScanData(database, startDate, endDate),
    audit: await exportAuditData(database, startDate, endDate)
  };
}

function convertToCSV(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];
    
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  } else {
    // Convert object to CSV
    const headers = Object.keys(data);
    const values = headers.map(header => {
      const value = data[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      return `"${String(value).replace(/"/g, '""')}"`;
    });
    return [headers.join(','), values.join(',')].join('\n');
  }
}

function convertToXML(data) {
  // Simple XML conversion - in production, use a proper XML library
  function objectToXML(obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let xml = '';
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;
      
      if (Array.isArray(value)) {
        xml += `${spaces}<${key}>\n`;
        value.forEach(item => {
          if (typeof item === 'object') {
            xml += objectToXML(item, indent + 1);
          } else {
            xml += `${spaces}  <item>${item}</item>\n`;
          }
        });
        xml += `${spaces}</${key}>\n`;
      } else if (typeof value === 'object') {
        xml += `${spaces}<${key}>\n`;
        xml += objectToXML(value, indent + 1);
        xml += `${spaces}</${key}>\n`;
      } else {
        xml += `${spaces}<${key}>${value}</${key}>\n`;
      }
    }
    
    return xml;
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>\n<data>\n${objectToXML(data, 1)}</data>`;
}

module.exports = { createAMLDashboardRoutes };
