import { useState } from 'react';
import { testScraper } from '../../utils/socialListeningApi';

export default function ScraperTestModal({ onClose }) {
  const [platform, setPlatform] = useState('instagram');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleTest = async (e) => {
    e.preventDefault();

    if (!query.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await testScraper(platform, query, limit);
      setResult(response);
    } catch (err) {
      console.error('Test scraper error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadJSON = () => {
    if (!result) return;

    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${platform}_scraper_test_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        maxWidth: '1200px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        {/* Header */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>Test Scraper</h2>
            <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
              View raw JSON output from Instagram and TikTok scrapers
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#999',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px'
            }}
            onMouseOver={(e) => e.target.style.background = '#f0f0f0'}
            onMouseOut={(e) => e.target.style.background = 'none'}
          >
            ×
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '24px', borderBottom: '1px solid #e0e0e0' }}>
          <form onSubmit={handleTest} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: '0 0 150px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Platform
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              >
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Search Query
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g., #travel, @username, keyword"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <div style={{ flex: '0 0 100px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Limit
              </label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value))}
                min="1"
                max="50"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '2px solid #e0e0e0',
                  borderRadius: '6px',
                  fontSize: '14px'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="btn-primary"
              style={{
                padding: '10px 24px',
                whiteSpace: 'nowrap'
              }}
            >
              {loading ? (
                <>
                  <span style={{ marginRight: '8px' }}>🔄</span>
                  Testing...
                </>
              ) : (
                <>
                  <span style={{ marginRight: '8px' }}>🧪</span>
                  Test Scraper
                </>
              )}
            </button>
          </form>

          {error && (
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: '#f8d7da',
              border: '1px solid #f5c2c7',
              borderRadius: '6px',
              color: '#842029',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {result ? (
            <div>
              {/* Result Summary */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                padding: '16px',
                background: '#f0f9ff',
                border: '1px solid #0066cc',
                borderRadius: '8px'
              }}>
                <div>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                    Platform: <strong>{result.platform}</strong> | Query: <strong>{result.query}</strong>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '600', color: '#0066cc' }}>
                    Found {result.count} results
                  </div>
                </div>
                <button
                  onClick={downloadJSON}
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                  </svg>
                  Download JSON
                </button>
              </div>

              {/* Sample Data Preview */}
              {result.sample && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>Sample Result (1 of {result.count})</h3>
                  <div style={{
                    background: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '8px',
                    padding: '16px',
                    maxHeight: '200px',
                    overflow: 'auto'
                  }}>
                    <pre style={{
                      margin: 0,
                      fontSize: '12px',
                      fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}>
                      {JSON.stringify(result.sample, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              {/* Full Data */}
              <div>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>
                  Complete Data Structure ({result.count} items)
                </h3>
                <div style={{
                  background: '#282c34',
                  border: '1px solid #dee2e6',
                  borderRadius: '8px',
                  padding: '16px',
                  maxHeight: '500px',
                  overflow: 'auto'
                }}>
                  <pre style={{
                    margin: 0,
                    fontSize: '12px',
                    fontFamily: 'Monaco, Consolas, "Courier New", monospace',
                    color: '#abb2bf',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              color: '#999'
            }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="#ddd" style={{ marginBottom: '16px' }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <h3 style={{ margin: '0 0 8px 0', color: '#999' }}>No Results Yet</h3>
              <p style={{ margin: 0, fontSize: '14px' }}>
                Enter a search query and click "Test Scraper" to see the raw JSON output
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e0e0e0',
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
