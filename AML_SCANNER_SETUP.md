# AML Scanner Quick Setup Guide

This guide will help you quickly set up and configure the AML/Sanctions Watchlist Auto-Scanner for the SubStream Protocol Backend.

## 🚀 Quick Start

### 1. Environment Configuration

Add these environment variables to your `.env` file:

```bash
# Enable AML Scanner
AML_ENABLED=true

# Basic Configuration
AML_SCAN_INTERVAL_MS=86400000          # Daily scan (24 hours)
AML_BATCH_SIZE=50                      # Process 50 addresses at once
AML_MAX_RETRIES=3                      # Max retry attempts
COMPLIANCE_OFFICER_EMAIL=your-email@company.com

# Sanctions API Keys (required for production)
OFAC_API_KEY=your-ofac-api-key
EU_SANCTIONS_API_KEY=your-eu-sanctions-api-key
UN_SANCTIONS_API_KEY=your-un-sanctions-api-key
UK_SANCTIONS_API_KEY=your-uk-sanctions-api-key

# Cache Configuration
SANCTIONS_CACHE_TIMEOUT_MS=3600000     # 1 hour cache

# Enhanced Monitoring (optional)
AML_WEEKLY_REPORT_ENABLED=true
AML_WEEKLY_REPORT_DAY=1                # Monday (1-7, Sunday=0)
AML_WEEKLY_REPORT_HOUR=9               # 9 AM
AML_HEALTH_CHECK_INTERVAL=300000       # 5 minutes
```

### 2. API Key Setup

#### OFAC (US Treasury)
1. Visit [OFAC API Portal](https://ofac-api.treasury.gov/)
2. Register for an API key
3. Add the key to `OFAC_API_KEY`

#### European Union Sanctions
1. Visit [EU Sanctions API](https://webgate.ec.europa.eu/fsd/)
2. Request API access
3. Add the key to `EU_SANCTIONS_API_KEY`

#### United Nations Sanctions
1. Visit [UN Sanctions API](https://scsanctions.un.org/)
2. Register for API access
3. Add the key to `UN_SANCTIONS_API_KEY`

#### United Kingdom Sanctions
1. Visit [UK Sanctions API](https://www.gov.uk/government/publications/the-uk-sanctions-list)
2. Request API access
3. Add the key to `UK_SANCTIONS_API_KEY`

### 3. Start the Application

```bash
# Install dependencies
npm install

# Start the development server
npm run dev

# Or start production server
npm start
```

### 4. Verify Setup

Check that the AML scanner is running:

```bash
curl http://localhost:3000/health
```

You should see `"aml": "Running"` in the services section.

## 📊 Dashboard Access

Once running, you can access the AML dashboard at:

- **Main Dashboard**: `http://localhost:3000/api/aml-dashboard/dashboard`
- **Analytics**: `http://localhost:3000/api/aml-dashboard/analytics`
- **Real-time Monitoring**: `http://localhost:3000/api/aml-dashboard/monitoring`
- **Compliance Reports**: `http://localhost:3000/api/aml-dashboard/compliance-reports`

## 🔧 Configuration Options

### Scan Frequency
- **Hourly**: `AML_SCAN_INTERVAL_MS=3600000`
- **Daily**: `AML_SCAN_INTERVAL_MS=8640000` (default)
- **Weekly**: `AML_SCAN_INTERVAL_MS=604800000`

### Batch Processing
- **Small Batches**: `AML_BATCH_SIZE=10` (slower but less memory)
- **Medium Batches**: `AML_BATCH_SIZE=50` (default)
- **Large Batches**: `AML_BATCH_SIZE=100` (faster but more memory)

### Alert Thresholds
```bash
AML_ERROR_RATE_THRESHOLD=0.1           # 10% error rate
AML_SCAN_FAILURE_THRESHOLD=0.05        # 5% scan failure rate
AML_API_FAILURE_THRESHOLD=0.2          # 20% API failure rate
```

## 🧪 Testing

### Run Tests
```bash
# Run AML scanner tests
npm test amlScanner.test.js

# Run all tests
npm test
```

### Test with Known Sanctioned Addresses
The system includes test addresses for development:

```javascript
// These addresses will trigger sanctions in development mode
const testAddresses = [
  'GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ',
  'GABEEXAMPLEADDRESSOFASANCTIONEDENTITYXXXXXXXXXXXXXXXXXXX'
];
```

## 📈 Monitoring

### Health Checks
```bash
# Basic health check
curl http://localhost:3000/health

# AML-specific status
curl http://localhost:3000/api/aml/stats
```

### Log Monitoring
Watch for these important log messages:

```bash
# Scan initiation
"Starting daily AML scan"

# Sanctions detected
"Sanctions match found - account frozen"

# System health
"AML health check completed"

# Weekly reports
"Weekly AML report sent"
```

### Metrics to Monitor
- **Scan Success Rate**: Should be >95%
- **API Response Time**: Should be <2 seconds
- **Memory Usage**: Monitor for memory leaks
- **Error Rate**: Should be <5%

## 🚨 Production Deployment

### Pre-deployment Checklist

1. **API Keys**: Ensure all sanctions API keys are valid
2. **Email Setup**: Verify compliance officer email works
3. **Database Backup**: Ensure regular backups are configured
4. **Monitoring**: Set up alerting for AML scanner failures
5. **Security**: Protect AML endpoints with authentication

### Security Considerations

1. **API Key Security**
   ```bash
   # Use environment variables, never commit API keys
   export OFAC_API_KEY="your-key-here"
   ```

2. **Endpoint Protection**
   - AML endpoints should require admin authentication
   - Consider IP whitelisting for compliance team
   - Use HTTPS in production

3. **Data Protection**
   - Sanctions data is sensitive compliance information
   - Ensure audit logs are immutable
   - Regular security audits of AML system

### Performance Optimization

1. **Database Indexing**
   ```sql
   -- Add indexes for better performance
   CREATE INDEX idx_audit_logs_created_at ON creator_audit_logs(created_at);
   CREATE INDEX idx_audit_logs_action_type ON creator_audit_logs(action_type);
   ```

2. **Caching Strategy**
   - Increase cache timeout for stable environments
   - Monitor cache hit rates
   - Consider Redis for distributed caching

3. **Resource Management**
   - Monitor memory usage during large scans
   - Configure appropriate batch sizes
   - Set up horizontal scaling if needed

## 📞 Support

### Common Issues

#### Scanner Not Starting
```bash
# Check if AML is enabled
echo $AML_ENABLED

# Check logs
npm start 2>&1 | grep -i aml
```

#### API Key Issues
```bash
# Test API connectivity
curl -H "Authorization: Bearer $OFAC_API_KEY" \
     https://api.ofac.gov/sdn/TEST_ADDRESS
```

#### High Memory Usage
```bash
# Reduce batch size
AML_BATCH_SIZE=25 npm start

# Monitor memory
node --inspect index.js
```

### Getting Help

1. **Check Logs**: Review application logs for error messages
2. **Verify Configuration**: Ensure all environment variables are set
3. **Test APIs**: Verify sanctions API connectivity
4. **Monitor Resources**: Check system resources (memory, CPU, disk)

### Contact Information

- **Technical Support**: Create an issue in the repository
- **Compliance Questions**: Contact your compliance officer
- **Security Issues**: Report to security team immediately

## 📚 Additional Resources

- [Complete Documentation](./AML_SCANNER_README.md)
- [API Reference](./routes/amlDashboard.js)
- [Test Suite](./amlScanner.test.js)
- [Configuration Guide](./src/config.js)

---

**⚠️ Important**: This is a critical compliance system. Ensure proper testing and review before deploying to production.
