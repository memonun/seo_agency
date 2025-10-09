export default function DomainAnalyticsResults({ results, onClose }) {
  if (!results || results.length === 0) {
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
        {results.map((domain, index) => (
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
        ))}
      </div>
    </div>
  )
}
