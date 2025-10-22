export default function DomainAnalyticsResults({ results, onClose, enhancedData = null }) {
  // Helper functions for organic search calculations
  const calculateAvgCpc = (etv, totalKeywords) => {
    return totalKeywords > 0 ? etv / totalKeywords : 0
  }

  const calculateEstimatedVisitors = (etv, avgCpc) => {
    return avgCpc > 0 ? (etv / 12) / avgCpc : 0
  }

  // Handle original format (array of domains) - PRESERVE BACKWARD COMPATIBILITY
  if (results && Array.isArray(results)) {
    if (results.length === 0) {
      return (
        <div className="domain-results">
          <div className="results-header">
            <h3>No Results Found</h3>
            <button onClick={onClose} className="close-btn">×</button>
          </div>
          <p className="history-empty">No domains match your search criteria.</p>
        </div>
      )
    }

    return (
      <div className="domain-results">
        <div className="results-header">
          <h3>Domain Analytics Results ({results.length})</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="results-container">
          {results.map((domain, index) => {
            // Calculate metrics for this domain
            const avgCpc = calculateAvgCpc(domain.organic.etv, domain.organic.count)
            const estimatedVisitors = calculateEstimatedVisitors(domain.organic.etv, avgCpc)
            
            return (
            <div key={index} className="domain-card">
              <div className="domain-card-header">
                <h4>{domain.domain}</h4>
                <span className="domain-status">Active</span>
              </div>

              <div className="domain-info-grid">
                {/* Dates Section */}
                <div className="info-section">
                  <h5>Domain Information</h5>
                  <div className="info-row">
                    <span className="info-label">Created:</span>
                    <span className="info-value">
                      {domain.created ? new Date(domain.created).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Expires:</span>
                    <span className="info-value">
                      {domain.expires ? new Date(domain.expires).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Last Updated:</span>
                    <span className="info-value">
                      {domain.updated ? new Date(domain.updated).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Backlinks Section */}
                <div className="info-section">
                  <h5>Backlinks</h5>
                  <div className="info-row">
                    <span className="info-label">Total Backlinks:</span>
                    <span className="info-value">{domain.backlinks.total.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Referring Domains:</span>
                    <span className="info-value">{domain.backlinks.referringDomains.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Referring IPs:</span>
                    <span className="info-value">{domain.backlinks.referringIps.toLocaleString()}</span>
                  </div>
                </div>

                {/* Organic Search Section */}
                <div className="info-section">
                  <h5>Organic Search</h5>
                  <div className="info-row">
                    <span className="info-label">Position 1:</span>
                    <span className="info-value">{domain.organic.pos1.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Position 2-3:</span>
                    <span className="info-value">{domain.organic.pos2_3.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Position 4-10:</span>
                    <span className="info-value">{domain.organic.pos4_10.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Est. Traffic Value:</span>
                    <span className="info-value">${domain.organic.etv.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Total Keywords:</span>
                    <span className="info-value">{domain.organic.count.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Avg CPC:</span>
                    <span className="info-value">
                      {avgCpc > 0 ? `$${avgCpc.toFixed(2)}` : 'N/A'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Est. Visitors/Month:</span>
                    <span className="info-value">
                      {estimatedVisitors > 0 ? Math.round(estimatedVisitors).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Paid Search Section */}
                <div className="info-section">
                  <h5>Paid Search</h5>
                  <div className="info-row">
                    <span className="info-label">Position 1:</span>
                    <span className="info-value">{domain.paid.pos1.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Position 2-3:</span>
                    <span className="info-value">{domain.paid.pos2_3.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Position 4-10:</span>
                    <span className="info-value">{domain.paid.pos4_10.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Est. Traffic Value:</span>
                    <span className="info-value">${domain.paid.etv.toLocaleString()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Total Keywords:</span>
                    <span className="info-value">{domain.paid.count.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
            )
          })}
        </div>

        {/* ENHANCED DATA SECTION - Only show if available */}
        {enhancedData && <EnhancedAnalysisSection enhancedData={enhancedData} />}
      </div>
    )
  }

  // Handle case where no results
  return (
    <div className="domain-results">
      <div className="results-header">
        <h3>No Results Found</h3>
        <button onClick={onClose} className="close-btn">×</button>
      </div>
      <p className="history-empty">No domain analytics data available.</p>
    </div>
  )
}

// Enhanced Analysis Component - Separate from original
function EnhancedAnalysisSection({ enhancedData }) {
  // Helper function to get status indicator
  const getStatusIndicator = (status) => {
    return status === 'fulfilled' ? '✅' : '❌'
  }

  // Helper function to format numbers
  const formatNumber = (num) => {
    return num ? num.toLocaleString() : 'N/A'
  }

  if (!enhancedData || !enhancedData.domain) {
    return null
  }

  return (
    <div className="enhanced-analysis-section">
      <div className="enhanced-header">
        <h3>🚀 Enhanced Analysis: {enhancedData.domain}</h3>
      </div>

      {/* Endpoint Status Overview */}
      <div className="endpoint-status-overview">
        <h4>Additional Data Sources Status</h4>
        <div className="status-grid">
          <span>{getStatusIndicator(enhancedData.endpointStatus.bulkTraffic)} Traffic Estimation</span>
          <span>{getStatusIndicator(enhancedData.endpointStatus.competitors)} Competitors</span>
          <span>{getStatusIndicator(enhancedData.endpointStatus.relevantPages)} Top Pages</span>
          <span>{getStatusIndicator(enhancedData.endpointStatus.backlinks)} Enhanced Backlinks</span>
          <span>{getStatusIndicator(enhancedData.endpointStatus.domainMetrics)} Keywords</span>
        </div>
      </div>

      <div className="comprehensive-results-container">

        {/* Traffic Estimation Section */}
        {enhancedData.endpointStatus.bulkTraffic === 'fulfilled' && enhancedData.trafficEstimation.length > 0 && (
          <div className="info-section traffic-section">
            <h5>🚀 Traffic Estimation</h5>
            {enhancedData.trafficEstimation.map((traffic, idx) => (
              <div key={idx} className="traffic-data">
                <div className="info-row">
                  <span className="info-label">Organic ETV:</span>
                  <span className="info-value">${formatNumber(traffic.trafficEstimation.organicEtv)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Organic Traffic:</span>
                  <span className="info-value">{formatNumber(traffic.trafficEstimation.organicTraffic)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Organic Clicks:</span>
                  <span className="info-value">{formatNumber(traffic.trafficEstimation.organicClicks)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Monthly Visits:</span>
                  <span className="info-value">{formatNumber(traffic.trafficEstimation.monthlyVisits)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Monthly Clicks:</span>
                  <span className="info-value">{formatNumber(traffic.trafficEstimation.monthlyClicks)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Paid ETV:</span>
                  <span className="info-value">${formatNumber(traffic.trafficEstimation.paidEtv)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Competitors Section */}
        {enhancedData.endpointStatus.competitors === 'fulfilled' && enhancedData.competitors.length > 0 && (
          <div className="info-section competitors-section">
            <h5>🏆 Top Competitors</h5>
            <div className="competitors-list">
              {enhancedData.competitors.slice(0, 10).map((competitor, idx) => (
                <div key={idx} className="competitor-card">
                  <div className="competitor-header">
                    <span className="competitor-domain">{competitor.domain}</span>
                    <span className="competitor-avg-pos">Avg Pos: {competitor.avgPosition?.toFixed(1) || 'N/A'}</span>
                  </div>
                  <div className="competitor-metrics">
                    <span>Overlap: {formatNumber(competitor.overlapScore)}%</span>
                    <span>Intersections: {formatNumber(competitor.intersections)}</span>
                    <span>Keywords: {formatNumber(competitor.fullDomainMetrics.organicKeywords)}</span>
                    <span>Traffic: ${formatNumber(competitor.fullDomainMetrics.organicCost)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Pages Section */}
        {enhancedData.endpointStatus.relevantPages === 'fulfilled' && enhancedData.relevantPages.length > 0 && (
          <div className="info-section pages-section">
            <h5>📄 Top Performing Pages</h5>
            <div className="pages-list">
              {enhancedData.relevantPages.slice(0, 10).map((page, idx) => (
                <div key={idx} className="page-card">
                  <div className="page-url">{page.page}</div>
                  <div className="page-title">{page.title}</div>
                  <div className="page-metrics">
                    <span>Keywords: {formatNumber(page.metrics.organicKeywords)}</span>
                    <span>Traffic: {formatNumber(page.metrics.organicTraffic)}</span>
                    <span>Value: ${formatNumber(page.metrics.organicCost)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enhanced Backlinks Section */}
        {enhancedData.endpointStatus.backlinks === 'fulfilled' && Object.keys(enhancedData.backlinks).length > 0 && (
          <div className="info-section backlinks-section">
            <h5>🔗 Enhanced Backlink Profile</h5>
            <div className="backlinks-grid">
              <div className="info-row">
                <span className="info-label">Total Backlinks:</span>
                <span className="info-value">{formatNumber(enhancedData.backlinks.totalBacklinks)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Referring Domains:</span>
                <span className="info-value">{formatNumber(enhancedData.backlinks.totalReferringDomains)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Authority Score:</span>
                <span className="info-value">{formatNumber(enhancedData.backlinks.authorityScore)}/100</span>
              </div>
              <div className="info-row">
                <span className="info-label">Trust Flow:</span>
                <span className="info-value">{formatNumber(enhancedData.backlinks.trustFlow)}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Monthly Growth:</span>
                <span className="info-value">{formatNumber(enhancedData.backlinks.backlinkGrowth?.monthlyGrowth) || 'N/A'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Enhanced Backlinks Access Denied Message */}
        {enhancedData.endpointStatus.backlinks === 'rejected' && enhancedData.errors.backlinks?.includes('Access denied') && (
          <div className="info-section backlinks-section">
            <h5>🔗 Enhanced Backlink Profile</h5>
            <div className="access-denied-message">
              <p>⚠️ Enhanced backlink analysis requires a separate DataForSEO Backlinks subscription.</p>
              <p>Using standard backlink data from domain analytics instead.</p>
              <a href="https://app.dataforseo.com/backlinks-subscription" target="_blank" rel="noopener noreferrer">
                Upgrade to unlock detailed backlink analysis →
              </a>
            </div>
          </div>
        )}

        {/* Keywords For Site Section - TABLE FORMAT */}
        {enhancedData.endpointStatus.domainMetrics === 'fulfilled' && enhancedData.domainMetrics.length > 0 && (
          <div className="info-section keywords-section">
            <h5>🎯 All Keywords This Domain Ranks For</h5>
            <div className="keywords-table-container">
              <table className="keywords-table">
                <thead>
                  <tr>
                    <th>Keyword</th>
                    <th>Search Volume</th>
                    <th>CPC</th>
                    <th>Competition</th>
                    <th>Intent</th>
                    <th>Language</th>
                    <th>Difficulty</th>
                  </tr>
                </thead>
                <tbody>
                  {enhancedData.domainMetrics.slice(0, 20).map((keyword, idx) => (
                    <tr key={idx}>
                      <td className="keyword-cell">{keyword.keyword}</td>
                      <td className="number-cell">{formatNumber(keyword.searchVolume)}/mo</td>
                      <td className="currency-cell">
                        {keyword.cpc ? `$${keyword.cpc.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="competition-cell">
                        <span className={`competition-badge ${(keyword.competitionLevel || 'N/A').toLowerCase().replace('/', '')}`}>
                          {keyword.competitionLevel || 'N/A'}
                        </span>
                      </td>
                      <td className="intent-cell">{keyword.searchIntent}</td>
                      <td className="language-cell">{keyword.detectedLanguage}</td>
                      <td className="difficulty-cell">
                        {keyword.difficulty > 0 ? keyword.difficulty : 'N/A'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {enhancedData.domainMetrics.length > 20 && (
              <p className="keywords-note">Showing top 20 of {enhancedData.domainMetrics.length} keywords</p>
            )}
          </div>
        )}

        {/* Error Messages Section */}
        {Object.values(enhancedData.errors).some(error => error) && (
          <div className="info-section errors-section">
            <h5>⚠️ Endpoint Errors</h5>
            <div className="errors-list">
              {Object.entries(enhancedData.errors).map(([endpoint, error]) => 
                error && (
                  <div key={endpoint} className="error-item">
                    <strong>{endpoint}:</strong> {error}
                  </div>
                )
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
