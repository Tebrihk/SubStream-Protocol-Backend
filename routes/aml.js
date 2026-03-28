const express = require('express');
const { logger } = require('../src/utils/logger');

/**
 * Create AML compliance routes
 * @param {object} dependencies - Service dependencies
 * @returns {express.Router}
 */
function createAMLRoutes(dependencies = {}) {
  const router = express.Router();
  const amlScannerWorker = dependencies.amlScannerWorker;

  /**
   * Get AML scan statistics
   * GET /api/aml/stats
   */
  router.get('/stats', async (req, res) => {
    try {
      if (!amlScannerWorker) {
        return res.status(503).json({
          success: false,
          error: 'AML scanner not enabled'
        });
      }

      const stats = amlScannerWorker.getScanStats();
      return res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Error fetching AML stats', {
        error: error.message,
        traceId: req.logger?.fields?.traceId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch AML statistics'
      });
    }
  });

  /**
   * Trigger immediate AML scan (admin only)
   * POST /api/aml/scan
   */
  router.post('/scan', async (req, res) => {
    try {
      if (!amlScannerWorker) {
        return res.status(503).json({
          success: false,
          error: 'AML scanner not enabled'
        });
      }

      const result = await amlScannerWorker.triggerImmediateScan();
      
      if (result.success) {
        return res.status(200).json({
          success: true,
          data: {
            scanId: result.scanId,
            stats: result.stats
          }
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Error triggering AML scan', {
        error: error.message,
        traceId: req.logger?.fields?.traceId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to trigger AML scan'
      });
    }
  });

  /**
   * Check if an address is frozen
   * GET /api/aml/check/:address
   */
  router.get('/check/:address', async (req, res) => {
    try {
      const { address } = req.params;

      if (!amlScannerWorker) {
        return res.status(503).json({
          success: false,
          error: 'AML scanner not enabled'
        });
      }

      const isFrozen = amlScannerWorker.isAccountFrozen(address);
      
      return res.status(200).json({
        success: true,
        data: {
          address,
          isFrozen,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error checking address freeze status', {
        address: req.params.address,
        error: error.message,
        traceId: req.logger?.fields?.traceId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to check address status'
      });
    }
  });

  /**
   * Get all frozen accounts
   * GET /api/aml/frozen
   */
  router.get('/frozen', async (req, res) => {
    try {
      if (!amlScannerWorker) {
        return res.status(503).json({
          success: false,
          error: 'AML scanner not enabled'
        });
      }

      const frozenAccounts = amlScannerWorker.getFrozenAccounts();
      
      return res.status(200).json({
        success: true,
        data: {
          accounts: frozenAccounts,
          count: frozenAccounts.length,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Error fetching frozen accounts', {
        error: error.message,
        traceId: req.logger?.fields?.traceId
      });

      return res.status(500).json({
        success: false,
        error: 'Failed to fetch frozen accounts'
      });
    }
  });

  return router;
}

module.exports = { createAMLRoutes };
