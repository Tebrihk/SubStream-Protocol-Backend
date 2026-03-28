# AML/Sanctions Watchlist Auto-Scanner

This document describes the AML (Anti-Money Laundering) and Sanctions Watchlist Auto-Scanner implementation for the SubStream Protocol Backend. This system automatically screens all Stellar addresses against global sanctions lists and takes appropriate compliance actions when matches are found.

## Overview

The AML scanner is a critical compliance feature that:
- Automatically scans all creator and subscriber Stellar addresses daily
- Cross-references addresses against global sanctions lists (OFAC, EU, UN, UK)
- Automatically freezes accounts that match sanctions lists
- Notifies compliance officers of any sanctions matches
- Maintains comprehensive audit trails for compliance reporting

## Architecture

### Core Components

1. **SanctionsListService** (`src/services/sanctionsListService.js`)
   - Handles communication with sanctions list APIs
   - Manages caching of sanctions check results
   - Supports batch processing for efficiency

2. **AMLScannerWorker** (`src/services/amlScannerWorker.js`)
   - Background worker that runs daily scans
   - Processes sanctions matches and freezes accounts
   - Sends compliance notifications
   - Maintains scan statistics

3. **AML Middleware** (`middleware/amlCheck.js`)
   - Real-time address checking for API requests
   - Blocks access from frozen accounts
   - Special handling for subscription endpoints

4. **AML Routes** (`routes/aml.js`)
   - Management endpoints for AML operations
   - Statistics and monitoring endpoints
   - Manual scan triggering

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable/disable AML scanner
AML_ENABLED=true

# Scan frequency (in milliseconds) - default: daily (86400000)
AML_SCAN_INTERVAL_MS=86400000

# Batch size for processing addresses
AML_BATCH_SIZE=50

# Maximum retries for failed operations
AML_MAX_RETRIES=3

# Compliance officer email for notifications
COMPLIANCE_OFFICER_EMAIL=compliance@yourcompany.com

# Sanctions list API keys (obtain from respective authorities)
OFAC_API_KEY=your-ofac-api-key
EU_SANCTIONS_API_KEY=your-eu-sanctions-api-key
UN_SANCTIONS_API_KEY=your-un-sanctions-api-key
UK_SANCTIONS_API_KEY=your-uk-sanctions-api-key

# Cache timeout for sanctions results (default: 1 hour)
SANCTIONS_CACHE_TIMEOUT_MS=3600000
```

### API Integration

The system is designed to integrate with official sanctions list APIs:

- **OFAC (US Treasury)**: Special Designated Nationals List
- **European Union**: EU Sanctions List
- **United Nations**: UN Sanctions List
- **United Kingdom**: UK Sanctions List

> **Note**: The current implementation includes mock data for testing. In production, you'll need to:
> 1. Obtain API keys from the respective authorities
> 2. Update the `checkOFAC()`, `checkEUSanctions()`, etc. methods to call real APIs
> 3. Handle rate limits and API authentication properly

## How It Works

### 1. Daily Scanning Process

1. **Address Collection**: The worker retrieves all unique Stellar addresses from:
   - Creator accounts (`creators` table)
   - Active subscriber accounts (`subscriptions` table)

2. **Batch Screening**: Addresses are checked in batches against sanctions lists:
   ```javascript
   const sanctionsResults = await sanctionsService.batchCheckAddresses(addresses);
   ```

3. **Results Processing**: For each address:
   - If sanctioned: Freeze account and log the action
   - If clean: No action required

4. **Compliance Reporting**: If sanctions are found:
   - Send email to compliance officer
   - Create detailed audit logs
   - Update scan statistics

### 2. Real-time Protection

The AML middleware checks addresses in real-time for:
- CDN token requests (`/api/cdn/*`)
- Creator operations (`/api/creator/*`)
- Subscription activities (`/api/subscription/*`)
- Payout operations (`/api/payouts/*`)

If a frozen account attempts to access these endpoints, they receive a 403 response with:
```json
{
  "success": false,
  "error": "Account frozen due to compliance requirements",
  "code": "ACCOUNT_FROZEN"
}
```

### 3. Account Freezing Process

When a sanctions match is found:

1. **Audit Log**: Create immutable audit log entry
2. **User Notification**: Add notification to user's account
3. **Access Blocking**: Middleware blocks all API access
4. **Compliance Alert**: Email notification to compliance officer

## API Endpoints

### Management Endpoints

#### Get AML Statistics
```http
GET /api/aml/stats
```

Response:
```json
{
  "success": true,
  "data": {
    "totalScans": 42,
    "sanctionsFound": 3,
    "accountsFrozen": 3,
    "lastScanTime": "2024-01-15T10:30:00.000Z",
    "errors": 0,
    "isRunning": true,
    "nextScanTime": "2024-01-16T10:30:00.000Z",
    "cacheStats": {
      "size": 1250,
      "timeout": 3600000
    }
  }
}
```

#### Trigger Manual Scan
```http
POST /api/aml/scan
```

Response:
```json
{
  "success": true,
  "data": {
    "scanId": "manual_scan_1642248600000",
    "stats": { ... }
  }
}
```

#### Check Address Status
```http
GET /api/aml/check/:address
```

Response:
```json
{
  "success": true,
  "data": {
    "address": "GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ",
    "isFrozen": false,
    "timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

#### Get All Frozen Accounts
```http
GET /api/aml/frozen
```

Response:
```json
{
  "success": true,
  "data": {
    "accounts": [
      {
        "address": "GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ",
        "frozenAt": "2024-01-15T10:30:00.000Z",
        "reason": {
          "reason": "SANCTIONS_MATCH",
          "scanId": "aml_scan_1642248600000",
          "sanctionsSources": ["OFAC_SDN"],
          "automatedAction": true
        }
      }
    ],
    "count": 1,
    "timestamp": "2024-01-15T12:00:00.000Z"
  }
}
```

## Database Schema

The AML scanner uses existing database tables:

### Audit Logs
Sanctions actions are logged in `creator_audit_logs`:
```sql
INSERT INTO creator_audit_logs (
  id, creator_id, action_type, entity_type, entity_id,
  timestamp, ip_address, metadata_json, created_at
) VALUES (
  ?, ?, 'ACCOUNT_FROZEN', 'USER', ?, ?, ?, ?, ?
);
```

### Notifications
User notifications are stored in `notifications` table:
```sql
INSERT INTO notifications (
  id, creator_id, type, message, metadata_json, timestamp, read
) VALUES (?, ?, 'ACCOUNT_FROZEN', ?, ?, ?, 0);
```

## Monitoring and Health Checks

The AML scanner status is included in the health check endpoint:
```http
GET /health
```

Response includes:
```json
{
  "services": {
    "aml": "Running"  // or "Stopped", "Not Enabled", "Error"
  }
}
```

## Compliance Features

### Audit Trail
All AML actions create comprehensive audit logs:
- **Immutable records**: Cannot be modified or deleted
- **Complete metadata**: Sanctions sources, scan IDs, timestamps
- **IP tracking**: Records source of actions (automated vs manual)

### Reporting
Compliance officers receive detailed reports:
- **Summary statistics**: Total scans, sanctions found, accounts frozen
- **Detailed breakdown**: Each sanctioned address with sources and details
- **Audit information**: Complete compliance trail

### False Positives
The system includes safeguards for false positives:
- **Multiple source verification**: Requires matches from multiple sanctions lists
- **Manual review process**: Compliance officers can review and unfreeze accounts
- **Appeal process**: Documented procedure for addressing false positives

## Testing

### Unit Tests
Run the comprehensive test suite:
```bash
npm test amlScanner.test.js
```

### Test Coverage
The tests cover:
- ✅ Address retrieval and processing
- ✅ Sanctions checking and caching
- ✅ Account freezing mechanics
- ✅ Audit log creation
- ✅ Statistics tracking
- ✅ Error handling
- ✅ Manual scan triggering
- ✅ Cache management

### Mock Data
For testing, the system includes mock sanctioned addresses:
```javascript
getKnownSanctionedAddresses() {
  return [
    'GD5DJQDKEZCHR3BVVXZB4H5QGQDQZQZQZQZQZQZQZQZQZQZQZQZQZQ',
    'GABEEXAMPLEADDRESSOFASANCTIONEDENTITYXXXXXXXXXXXXXXXXXXX'
  ];
}
```

## Production Deployment

### Pre-deployment Checklist

1. **API Keys**: Obtain production API keys from sanctions authorities
2. **Rate Limits**: Configure appropriate rate limits for sanctions APIs
3. **Email Setup**: Ensure compliance officer email notifications work
4. **Monitoring**: Set up alerts for AML scanner failures
5. **Backup**: Regular database backups for compliance records

### Security Considerations

1. **API Key Security**: Store API keys securely (environment variables)
2. **Data Privacy**: Sanctions check results are sensitive compliance data
3. **Access Control**: AML management endpoints should be admin-only
4. **Audit Integrity**: Ensure audit logs cannot be tampered with

### Performance Optimization

1. **Batch Processing**: Configure appropriate batch sizes
2. **Caching**: Tune cache timeout for your use case
3. **Database Indexing**: Ensure proper indexes on address columns
4. **Rate Limiting**: Implement rate limiting on sanctions APIs

## Troubleshooting

### Common Issues

1. **Scanner Not Starting**
   - Check `AML_ENABLED=true` in environment
   - Verify database connection
   - Check logs for initialization errors

2. **No Sanctions Results**
   - Verify API keys are valid
   - Check sanctions API connectivity
   - Review test addresses are actually sanctioned

3. **High Error Rate**
   - Check sanctions API rate limits
   - Verify network connectivity
   - Review error logs for specific issues

4. **Performance Issues**
   - Reduce `AML_BATCH_SIZE` if memory constrained
   - Increase cache timeout for better performance
   - Consider database optimization

### Logs and Monitoring

Monitor these log messages:
- `Starting AML scan` - Scan initiation
- `Sanctions match found` - Sanctions detected
- `Account frozen` - Account freeze action
- `Compliance report sent` - Notification sent

## Legal and Compliance

### Regulatory Requirements

This system helps meet these regulatory requirements:
- **Bank Secrecy Act (BSA)**: AML program requirements
- **USA PATRIOT Act**: Sanctions screening obligations
- **EU AML Directives**: European AML requirements
- **FATF Recommendations**: International AML standards

### Documentation Requirements

Maintain these compliance documents:
- **AML Program Policy**: Overall compliance framework
- **Risk Assessment**: AML risk evaluation
- **Training Records**: Staff compliance training
- **Audit Reports**: Regular compliance audit results

### Record Retention

Follow these retention guidelines:
- **Audit Logs**: 7 years minimum
- **Sanctions Checks**: 5 years minimum
- **Compliance Reports**: 5 years minimum
- **Account Actions**: 7 years minimum

## Future Enhancements

### Planned Features

1. **Enhanced API Integration**: Direct integration with more sanctions lists
2. **Machine Learning**: Pattern recognition for suspicious activity
3. **Real-time Alerts**: WebSocket notifications for compliance team
4. **Advanced Reporting**: Automated regulatory report generation
5. **Geographic Risk**: Country-based risk assessment

### Integration Opportunities

1. **Blockchain Analytics**: Integration with chain analysis tools
2. **Identity Verification**: Integration with KYC providers
3. **Risk Scoring**: Dynamic risk assessment based on activity patterns
4. **Regulatory Reporting**: Direct submission to regulatory authorities

## Support

For questions or issues related to the AML scanner:

1. **Technical Issues**: Check logs and troubleshooting section
2. **Compliance Questions**: Consult your compliance officer
3. **API Integration**: Refer to sanctions authority documentation
4. **Security Concerns**: Report to security team immediately

---

**⚠️ Important**: This is a critical compliance system. Any modifications should be reviewed by your compliance team and legal counsel before deployment to production.
