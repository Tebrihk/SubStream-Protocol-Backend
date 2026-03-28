const { logger } = require('../src/utils/logger');

/**
 * Middleware to check if user account is frozen due to AML sanctions
 * @param {object} amlScannerWorker - AML scanner worker instance
 * @returns {import('express').RequestHandler}
 */
function createAMLCheckMiddleware(amlScannerWorker) {
  return (req, res, next) => {
    // Skip AML check if scanner is not enabled
    if (!amlScannerWorker) {
      return next();
    }

    // Extract wallet address from various sources
    const walletAddress = extractWalletAddress(req);
    
    if (!walletAddress) {
      // No wallet address found, proceed normally
      return next();
    }

    try {
      // Check if account is frozen
      const isFrozen = amlScannerWorker.isAccountFrozen(walletAddress);
      
      if (isFrozen) {
        logger.warn('Access denied - account frozen', {
          walletAddress,
          endpoint: req.path,
          method: req.method,
          ip: req.ip,
          traceId: req.logger?.fields?.traceId
        });

        return res.status(403).json({
          success: false,
          error: 'Account frozen due to compliance requirements',
          code: 'ACCOUNT_FROZEN'
        });
      }

      // Account is not frozen, proceed normally
      next();

    } catch (error) {
      logger.error('Error in AML check middleware', {
        walletAddress,
        error: error.message,
        traceId: req.logger?.fields?.traceId
      });

      // Fail safe - allow access but log the error
      next();
    }
  };
}

/**
 * Extract wallet address from request
 * @param {import('express').Request} req 
 * @returns {string|null}
 */
function extractWalletAddress(req) {
  // Check various sources for wallet address
  
  // 1. From query parameters
  if (req.query.walletAddress) {
    return req.query.walletAddress;
  }

  // 2. From request body
  if (req.body?.walletAddress) {
    return req.body.walletAddress;
  }

  // 3. From creator auth token (if available)
  if (req.creator?.id) {
    return req.creator.id;
  }

  // 4. From authorization header (if it's a Stellar address)
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    // Check if token looks like a Stellar public key
    if (token.startsWith('G') && token.length === 56) {
      return token;
    }
  }

  // 5. From custom headers
  if (req.headers['x-wallet-address']) {
    return req.headers['x-wallet-address'];
  }

  return null;
}

/**
 * Middleware to check AML status for subscription endpoints
 * @param {object} amlScannerWorker 
 * @returns {import('express').RequestHandler}
 */
function createSubscriptionAMLCheck(amlScannerWorker) {
  return (req, res, next) => {
    // For subscription endpoints, check both creator and subscriber addresses
    if (!amlScannerWorker) {
      return next();
    }

    const creatorAddress = req.body?.creatorAddress || req.params?.creatorId;
    const subscriberAddress = req.body?.walletAddress || req.query?.walletAddress;

    const addressesToCheck = [creatorAddress, subscriberAddress].filter(Boolean);

    for (const address of addressesToCheck) {
      try {
        const isFrozen = amlScannerWorker.isAccountFrozen(address);
        
        if (isFrozen) {
          logger.warn('Subscription denied - account frozen', {
            creatorAddress,
            subscriberAddress: address,
            endpoint: req.path,
            method: req.method,
            ip: req.ip,
            traceId: req.logger?.fields?.traceId
          });

          return res.status(403).json({
            success: false,
            error: 'Subscription cannot be processed - account frozen due to compliance requirements',
            code: 'ACCOUNT_FROZEN'
          });
        }
      } catch (error) {
        logger.error('Error checking AML status for subscription', {
          address,
          error: error.message,
          traceId: req.logger?.fields?.traceId
        });
        // Continue with other addresses
      }
    }

    next();
  };
}

module.exports = {
  createAMLCheckMiddleware,
  createSubscriptionAMLCheck,
  extractWalletAddress
};
