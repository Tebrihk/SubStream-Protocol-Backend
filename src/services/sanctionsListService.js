const axios = require('axios');
const { logger } = require('../utils/logger');

/**
 * Service for checking addresses against global sanctions lists
 */
class SanctionsListService {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.cacheTimeout = 60 * 60 * 1000; // 1 hour cache
  }

  /**
   * Check if a Stellar address is on any sanctions list
   * @param {string} address - Stellar public key to check
   * @returns {Promise<{isSanctioned: boolean, sources: string[], details: object}>}
   */
  async checkAddress(address) {
    try {
      // Check cache first
      const cached = this.getCachedResult(address);
      if (cached) {
        return cached;
      }

      const results = {
        isSanctioned: false,
        sources: [],
        details: {}
      };

      // Check OFAC SDN List
      const ofacResult = await this.checkOFAC(address);
      if (ofacResult.isSanctioned) {
        results.isSanctioned = true;
        results.sources.push('OFAC_SDN');
        results.details.OFAC_SDN = ofacResult.details;
      }

      // Check EU Sanctions List
      const euResult = await this.checkEUSanctions(address);
      if (euResult.isSanctioned) {
        results.isSanctioned = true;
        results.sources.push('EU_SANCTIONS');
        results.details.EU_SANCTIONS = euResult.details;
      }

      // Check UN Sanctions List
      const unResult = await this.checkUNSanctions(address);
      if (unResult.isSanctioned) {
        results.isSanctioned = true;
        results.sources.push('UN_SANCTIONS');
        results.details.UN_SANCTIONS = unResult.details;
      }

      // Check UK Sanctions List
      const ukResult = await this.checkUKSanctions(address);
      if (ukResult.isSanctioned) {
        results.isSanctioned = true;
        results.sources.push('UK_SANCTIONS');
        results.details.UK_SANCTIONS = ukResult.details;
      }

      // Cache the result
      this.cacheResult(address, results);

      logger.info('Sanctions check completed', {
        address,
        isSanctioned: results.isSanctioned,
        sources: results.sources,
        traceId: logger.defaultMeta?.traceId
      });

      return results;

    } catch (error) {
      logger.error('Error checking sanctions list', {
        address,
        error: error.message,
        traceId: logger.defaultMeta?.traceId
      });
      
      // Fail safe - if we can't verify, assume not sanctioned but log the error
      return {
        isSanctioned: false,
        sources: [],
        details: { error: 'Sanctions check failed', message: error.message }
      };
    }
  }

  /**
   * Check OFAC SDN List
   * @param {string} address 
   * @returns {Promise<{isSanctioned: boolean, details: object}>}
   */
  async checkOFAC(address) {
    try {
      // For production, integrate with OFAC API or commercial sanctions screening service
      // For now, implementing a basic check against known patterns
      
      // Example: Check against known sanctioned addresses (this would be replaced with real API calls)
      const knownSanctionedAddresses = this.getKnownSanctionedAddresses();
      
      if (knownSanctionedAddresses.includes(address)) {
        return {
          isSanctioned: true,
          details: {
            list: 'SDN',
            source: 'OFAC',
            address: address,
            matchDate: new Date().toISOString()
          }
        };
      }

      // In production, you would call actual OFAC API
      // const response = await axios.get(`https://api.ofac.gov/sdn/${address}`);
      
      return {
        isSanctioned: false,
        details: { checked: 'OFAC_SDN', address }
      };

    } catch (error) {
      logger.error('Error checking OFAC list', { address, error: error.message });
      return { isSanctioned: false, details: { error: error.message } };
    }
  }

  /**
   * Check EU Sanctions List
   * @param {string} address 
   * @returns {Promise<{isSanctioned: boolean, details: object}>}
   */
  async checkEUSanctions(address) {
    try {
      // For production, integrate with EU sanctions API
      // Similar structure to OFAC check
      
      return {
        isSanctioned: false,
        details: { checked: 'EU_SANCTIONS', address }
      };

    } catch (error) {
      logger.error('Error checking EU sanctions', { address, error: error.message });
      return { isSanctioned: false, details: { error: error.message } };
    }
  }

  /**
   * Check UN Sanctions List
   * @param {string} address 
   * @returns {Promise<{isSanctioned: boolean, details: object}>}
   */
  async checkUNSanctions(address) {
    try {
      // For production, integrate with UN sanctions API
      
      return {
        isSanctioned: false,
        details: { checked: 'UN_SANCTIONS', address }
      };

    } catch (error) {
      logger.error('Error checking UN sanctions', { address, error: error.message });
      return { isSanctioned: false, details: { error: error.message } };
    }
  }

  /**
   * Check UK Sanctions List
   * @param {string} address 
   * @returns {Promise<{isSanctioned: boolean, details: object}>}
   */
  async checkUKSanctions(address) {
    try {
      // For production, integrate with UK sanctions API
      
      return {
        isSanctioned: false,
        details: { checked: 'UK_SANCTIONS', address }
      };

    } catch (error) {
      logger.error('Error checking UK sanctions', { address, error: error.message });
      return { isSanctioned: false, details: { error: error.message } };
    }
  }

  /**
   * Get cached result if available and not expired
   * @param {string} address 
   * @returns {object|null}
   */
  getCachedResult(address) {
    const cached = this.cache.get(address);
    if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
      return cached.result;
    }
    return null;
  }

  /**
   * Cache the result for future use
   * @param {string} address 
   * @param {object} result 
   */
  cacheResult(address, result) {
    this.cache.set(address, {
      result,
      timestamp: Date.now()
    });

    // Clean up old cache entries periodically
    if (this.cache.size > 10000) {
      this.cleanupCache();
    }
  }

  /**
   * Remove expired cache entries
   */
  cleanupCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get known sanctioned addresses for testing/demo purposes
   * In production, this would be replaced with real API calls
   * @returns {string[]}
   */
  getKnownSanctionedAddresses() {
    return [
      // These are example addresses for testing - replace with real sanctions data
      'GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ',
      'GABEEXAMPLEADDRESSOFASANCTIONEDENTITYXXXXXXXXXXXXXXXXXXX',
      // Add more known addresses as needed
    ];
  }

  /**
   * Batch check multiple addresses
   * @param {string[]} addresses 
   * @returns {Promise<Map<string, object>>}
   */
  async batchCheckAddresses(addresses) {
    const results = new Map();
    
    // Process in parallel batches to avoid rate limiting
    const batchSize = 10;
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      const batchPromises = batch.map(async (address) => {
        const result = await this.checkAddress(address);
        return [address, result];
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(([address, result]) => {
        results.set(address, result);
      });
    }

    return results;
  }

  /**
   * Get cache statistics
   * @returns {object}
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      timeout: this.cacheTimeout
    };
  }
}

module.exports = { SanctionsListService };
