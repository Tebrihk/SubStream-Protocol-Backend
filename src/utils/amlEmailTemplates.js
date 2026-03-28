const { logger } = require('../src/utils/logger');

/**
 * Enhanced email templates for AML compliance notifications
 */
class AMLEmailTemplates {
  /**
   * Generate compliance officer notification email for sanctions matches
   * @param {object} data - Sanctions scan data
   * @returns {object} Email configuration
   */
  static sanctionsAlert(data) {
    const subject = `🚨 AML Sanctions Alert - ${data.summary.sanctionsFound} Sanctioned Addresses Found`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>AML Sanctions Alert</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #dc3545; color: white; padding: 20px; border-radius: 5px; }
        .content { padding: 20px; background: #f8f9fa; margin: 20px 0; border-radius: 5px; }
        .alert { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 10px 0; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-number { font-size: 2em; font-weight: bold; color: #dc3545; }
        .address-list { max-height: 400px; overflow-y: auto; }
        .address-item { background: white; margin: 10px 0; padding: 15px; border-radius: 5px; border-left: 4px solid #dc3545; }
        .footer { margin-top: 30px; padding: 20px; background: #e9ecef; border-radius: 5px; font-size: 0.9em; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f8f9fa; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚨 AML Sanctions Alert</h1>
        <p>Automatic sanctions screening has detected flagged addresses</p>
    </div>

    <div class="content">
        <h2>Scan Summary</h2>
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${data.summary.sanctionsFound}</div>
                <div>Sanctions Found</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.summary.accountsFrozen}</div>
                <div>Accounts Frozen</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.summary.totalAddresses}</div>
                <div>Addresses Scanned</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${new Date(data.scanId.split('_')[2]).toLocaleDateString()}</div>
                <div>Scan Date</div>
            </div>
        </div>

        <div class="alert">
            <strong>⚠️ Immediate Action Required:</strong> ${data.summary.sanctionsFound} address(es) have been automatically frozen due to sanctions matches.
        </div>

        <h2>Sanctioned Addresses</h2>
        <div class="address-list">
            ${data.sanctionedAddresses.map(addr => `
                <div class="address-item">
                    <h3>${addr.address}</h3>
                    <p><strong>Sources:</strong> ${addr.sources.join(', ')}</p>
                    <p><strong>Detected:</strong> ${new Date(addr.timestamp).toLocaleString()}</p>
                    <details>
                        <summary>View Details</summary>
                        <pre>${JSON.stringify(addr.details, null, 2)}</pre>
                    </details>
                </div>
            `).join('')}
        </div>

        <h2>Recommended Actions</h2>
        <ol>
            <li>Review the sanctioned addresses and their associated accounts</li>
            <li>Verify the sanctions matches with official sources</li>
            <li>Document your review and decision process</li>
            <li>Update internal risk assessments as needed</li>
            <li>Consider filing required regulatory reports</li>
        </ol>

        <h2>Historical Context</h2>
        <table>
            <tr>
                <th>Metric</th>
                <th>Current</th>
                <th>Previous 30 Days</th>
            </tr>
            <tr>
                <td>Total Scans</td>
                <td>${data.scanStats.totalScans}</td>
                <td>${data.scanStats.totalScans - 1}</td>
            </tr>
            <tr>
                <td>Total Sanctions Found</td>
                <td>${data.scanStats.sanctionsFound}</td>
                <td>${data.scanStats.sanctionsFound - data.summary.sanctionsFound}</td>
            </tr>
            <tr>
                <td>Total Accounts Frozen</td>
                <td>${data.scanStats.accountsFrozen}</td>
                <td>${data.scanStats.accountsFrozen - data.summary.accountsFrozen}</td>
            </tr>
        </table>
    </div>

    <div class="footer">
        <p><strong>Important:</strong> This is an automated compliance notification. All actions have been logged in the audit trail.</p>
        <p>Scan ID: ${data.scanId} | Generated: ${new Date().toISOString()}</p>
        <p>If you believe this is a false positive, please contact the compliance team immediately.</p>
    </div>
</body>
</html>`;

    return {
      to: data.complianceOfficerEmail,
      subject,
      html,
      text: `
AML SANCTIONS ALERT - IMMEDIATE ACTION REQUIRED

Scan Summary:
- Sanctions Found: ${data.summary.sanctionsFound}
- Accounts Frozen: ${data.summary.accountsFrozen}
- Total Addresses Scanned: ${data.summary.totalAddresses}
- Scan ID: ${data.scanId}

Sanctioned Addresses:
${data.sanctionedAddresses.map(addr => `
Address: ${addr.address}
Sources: ${addr.sources.join(', ')}
Detected: ${new Date(addr.timestamp).toLocaleString()}
`).join('\n')}

Recommended Actions:
1. Review sanctioned addresses and associated accounts
2. Verify sanctions matches with official sources
3. Document review and decision process
4. Update internal risk assessments
5. Consider filing required regulatory reports

This is an automated compliance notification. All actions have been logged.
Scan ID: ${data.scanId} | Generated: ${new Date().toISOString()}
      `
    };
  }

  /**
   * Generate weekly compliance summary report
   * @param {object} data - Weekly statistics
   * @returns {object} Email configuration
   */
  static weeklySummary(data) {
    const subject = `📊 Weekly AML Compliance Summary - ${new Date().toLocaleDateString()}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Weekly AML Compliance Summary</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 20px; border-radius: 5px; }
        .content { padding: 20px; background: #f8f9fa; margin: 20px 0; border-radius: 5px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: white; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
        .stat-number { font-size: 2em; font-weight: bold; color: #007bff; }
        .chart-placeholder { background: #e9ecef; height: 200px; display: flex; align-items: center; justify-content: center; border-radius: 5px; margin: 20px 0; }
        .footer { margin-top: 30px; padding: 20px; background: #e9ecef; border-radius: 5px; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Weekly AML Compliance Summary</h1>
        <p>Period: ${data.weekStart} to ${data.weekEnd}</p>
    </div>

    <div class="content">
        <h2>Weekly Overview</h2>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${data.weeklyStats.totalScans}</div>
                <div>Total Scans</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.weeklyStats.addressesScanned}</div>
                <div>Addresses Scanned</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.weeklyStats.sanctionsFound}</div>
                <div>Sanctions Found</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${data.weeklyStats.accountsFrozen}</div>
                <div>Accounts Frozen</div>
            </div>
        </div>

        <h2>Compliance Health</h2>
        <div class="chart-placeholder">
            [Compliance metrics chart would be displayed here]
        </div>

        <h2>Key Metrics</h2>
        <table>
            <tr><th>Metric</th><th>This Week</th><th>Last Week</th><th>Trend</th></tr>
            <tr>
                <td>Scan Success Rate</td>
                <td>${data.weeklyStats.successRate}%</td>
                <td>${data.previousWeekStats.successRate}%</td>
                <td>${data.weeklyStats.successRate > data.previousWeekStats.successRate ? '📈' : '📉'}</td>
            </tr>
            <tr>
                <td>Average Scan Time</td>
                <td>${data.weeklyStats.avgScanTime}s</td>
                <td>${data.previousWeekStats.avgScanTime}s</td>
                <td>${data.weeklyStats.avgScanTime < data.previousWeekStats.avgScanTime ? '📈' : '📉'}</td>
            </tr>
            <tr>
                <td>False Positive Rate</td>
                <td>${data.weeklyStats.falsePositiveRate}%</td>
                <td>${data.previousWeekStats.falsePositiveRate}%</td>
                <td>${data.weeklyStats.falsePositiveRate < data.previousWeekStats.falsePositiveRate ? '📈' : '📉'}</td>
            </tr>
        </table>

        <h2>Recommendations</h2>
        <ul>
            ${data.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
    </div>

    <div class="footer">
        <p>This is an automated weekly compliance summary. For detailed analysis, access the compliance dashboard.</p>
        <p>Generated: ${new Date().toISOString()}</p>
    </div>
</body>
</html>`;

    return {
      to: data.complianceOfficerEmail,
      subject,
      html,
      text: `
WEEKLY AML COMPLIANCE SUMMARY
Period: ${data.weekStart} to ${data.weekEnd}

Weekly Statistics:
- Total Scans: ${data.weeklyStats.totalScans}
- Addresses Scanned: ${data.weeklyStats.addressesScanned}
- Sanctions Found: ${data.weeklyStats.sanctionsFound}
- Accounts Frozen: ${data.weeklyStats.accountsFrozen}

Key Metrics:
- Scan Success Rate: ${data.weeklyStats.successRate}%
- Average Scan Time: ${data.weeklyStats.avgScanTime}s
- False Positive Rate: ${data.weeklyStats.falsePositiveRate}%

Recommendations:
${data.recommendations.map(rec => `- ${rec}`).join('\n')}

Generated: ${new Date().toISOString()}
      `
    };
  }

  /**
   * Generate system health alert for AML scanner issues
   * @param {object} data - Health alert data
   * @returns {object} Email configuration
   */
  static systemHealthAlert(data) {
    const subject = `⚠️ AML Scanner Health Alert - ${data.issueType}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>AML Scanner Health Alert</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .alert-critical { background: #dc3545; color: white; padding: 20px; border-radius: 5px; }
        .alert-warning { background: #ffc107; color: #000; padding: 20px; border-radius: 5px; }
        .content { padding: 20px; background: #f8f9fa; margin: 20px 0; border-radius: 5px; }
        .footer { margin-top: 30px; padding: 20px; background: #e9ecef; border-radius: 5px; font-size: 0.9em; }
    </style>
</head>
<body>
    <div class="${data.severity === 'critical' ? 'alert-critical' : 'alert-warning'}">
        <h1>⚠️ AML Scanner Health Alert</h1>
        <p>Issue detected: ${data.issueType}</p>
    </div>

    <div class="content">
        <h2>Issue Details</h2>
        <p><strong>Type:</strong> ${data.issueType}</p>
        <p><strong>Severity:</strong> ${data.severity}</p>
        <p><strong>Detected:</strong> ${new Date(data.detectedAt).toLocaleString()}</p>
        <p><strong>Description:</strong> ${data.description}</p>

        <h2>Impact Assessment</h2>
        <p>${data.impact}</p>

        <h2>Recommended Actions</h2>
        <ol>
            ${data.actions.map(action => `<li>${action}</li>`).join('')}
        </ol>

        <h2>System Status</h2>
        <table>
            <tr><th>Component</th><th>Status</th><th>Last Check</th></tr>
            <tr><td>AML Scanner Worker</td><td>${data.systemStatus.scanner}</td><td>${new Date(data.systemStatus.lastCheck).toLocaleString()}</td></tr>
            <tr><td>Sanctions API</td><td>${data.systemStatus.api}</td><td>${new Date(data.systemStatus.lastApiCheck).toLocaleString()}</td></tr>
            <tr><td>Database</td><td>${data.systemStatus.database}</td><td>${new Date(data.systemStatus.lastDbCheck).toLocaleString()}</td></tr>
        </table>
    </div>

    <div class="footer">
        <p>This is an automated system health alert. Please investigate immediately.</p>
        <p>Alert ID: ${data.alertId} | Generated: ${new Date().toISOString()}</p>
    </div>
</body>
</html>`;

    return {
      to: data.complianceOfficerEmail,
      subject,
      html,
      text: `
AML SCANNER HEALTH ALERT - ${data.severity.toUpperCase()}

Issue Details:
- Type: ${data.issueType}
- Severity: ${data.severity}
- Detected: ${new Date(data.detectedAt).toLocaleString()}
- Description: ${data.description}

Impact Assessment:
${data.impact}

Recommended Actions:
${data.actions.map((action, i) => `${i + 1}. ${action}`).join('\n')}

System Status:
- AML Scanner Worker: ${data.systemStatus.scanner}
- Sanctions API: ${data.systemStatus.api}
- Database: ${data.systemStatus.database}

Alert ID: ${data.alertId} | Generated: ${new Date().toISOString()}
      `
    };
  }
}

module.exports = { AMLEmailTemplates };
