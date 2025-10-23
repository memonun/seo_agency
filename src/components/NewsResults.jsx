import { useState } from 'react'
import './NewsResults.css'

export default function NewsResults({ results }) {
  const [expandedArticles, setExpandedArticles] = useState(new Set())
  const [activeTab, setActiveTab] = useState('overview')

  if (!results || !results.data) {
    return null
  }

  const { data } = results
  
  // Parse sentiment distribution
  const sentimentData = data.sentiment_distribution || {}
  const totalAnalyzed = sentimentData.analyzed_urls || 0
  const positive = sentimentData.positive_news || 0
  const negative = sentimentData.negative_news || 0
  const neutral = sentimentData.neutral_news || 0
  const failed = sentimentData.failed_analyses || 0

  // Calculate percentages
  const positivePercent = totalAnalyzed > 0 ? (positive / totalAnalyzed * 100).toFixed(1) : 0
  const negativePercent = totalAnalyzed > 0 ? (negative / totalAnalyzed * 100).toFixed(1) : 0
  const neutralPercent = totalAnalyzed > 0 ? (neutral / totalAnalyzed * 100).toFixed(1) : 0

  const toggleArticleExpansion = (index) => {
    const newExpanded = new Set(expandedArticles)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedArticles(newExpanded)
  }

  const exportResults = () => {
    const dataStr = JSON.stringify(data, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    
    const exportFileDefaultName = `news-analysis-${new Date().toISOString().slice(0, 10)}.json`
    
    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  return (
    <div className="news-results">
      <div className="results-header">
        <h2>📊 Analysis Results</h2>
        <button className="export-btn" onClick={exportResults}>
          📥 Export JSON
        </button>
      </div>

      <div className="results-tabs">
        <button 
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab ${activeTab === 'articles' ? 'active' : ''}`}
          onClick={() => setActiveTab('articles')}
        >
          Articles ({totalAnalyzed})
        </button>
        <button 
          className={`tab ${activeTab === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveTab('insights')}
        >
          Insights
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="overview-section">
          {/* Sentiment Distribution */}
          <div className="sentiment-card">
            <h3>Sentiment Distribution</h3>
            <div className="sentiment-stats">
              <div className="stat positive">
                <span className="label">Positive</span>
                <span className="value">{positive}</span>
                <span className="percent">{positivePercent}%</span>
              </div>
              <div className="stat negative">
                <span className="label">Negative</span>
                <span className="value">{negative}</span>
                <span className="percent">{negativePercent}%</span>
              </div>
              <div className="stat neutral">
                <span className="label">Neutral</span>
                <span className="value">{neutral}</span>
                <span className="percent">{neutralPercent}%</span>
              </div>
            </div>
            
            {/* Visual Bar Chart */}
            <div className="sentiment-bar">
              {positive > 0 && (
                <div 
                  className="bar-segment positive" 
                  style={{ width: `${positivePercent}%` }}
                  title={`Positive: ${positive}`}
                />
              )}
              {neutral > 0 && (
                <div 
                  className="bar-segment neutral" 
                  style={{ width: `${neutralPercent}%` }}
                  title={`Neutral: ${neutral}`}
                />
              )}
              {negative > 0 && (
                <div 
                  className="bar-segment negative" 
                  style={{ width: `${negativePercent}%` }}
                  title={`Negative: ${negative}`}
                />
              )}
            </div>

            {failed > 0 && (
              <p className="failed-note">
                ⚠️ {failed} article{failed > 1 ? 's' : ''} failed to analyze
              </p>
            )}
          </div>

          {/* Overall Summary */}
          {data.overall_summary && (
            <div className="summary-card">
              <h3>📝 Overall Summary</h3>
              <p>{data.overall_summary}</p>
            </div>
          )}

          {/* Executive Summary */}
          {data.executive_summary && (
            <div className="executive-card">
              <h3>💼 Executive Summary</h3>
              <p>{data.executive_summary}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'articles' && (
        <div className="articles-section">
          {data.individual_analyses && data.individual_analyses.length > 0 ? (
            data.individual_analyses.map((article, index) => (
              <div key={index} className="article-card">
                <div className="article-header">
                  <h4>{article.title || 'Untitled'}</h4>
                  <div className="article-meta">
                    <span className={`sentiment-badge ${article.news_sentiment || 'neutral'}`}>
                      {article.news_sentiment || 'neutral'}
                    </span>
                    <button 
                      className="expand-btn"
                      onClick={() => toggleArticleExpansion(index)}
                    >
                      {expandedArticles.has(index) ? '▼' : '▶'}
                    </button>
                  </div>
                </div>
                
                <a href={article.url} target="_blank" rel="noopener noreferrer" className="article-url">
                  🔗 {article.url}
                </a>

                {expandedArticles.has(index) && article.analysis && (
                  <div className="article-analysis">
                    {article.analysis.angle && (
                      <div className="analysis-item">
                        <strong>Angle:</strong> {article.analysis.angle}
                      </div>
                    )}
                    {article.analysis.tone && (
                      <div className="analysis-item">
                        <strong>Tone:</strong> {article.analysis.tone}
                      </div>
                    )}
                    {article.analysis.key_points && article.analysis.key_points.length > 0 && (
                      <div className="analysis-item">
                        <strong>Key Points:</strong>
                        <ul>
                          {article.analysis.key_points.map((point, i) => (
                            <li key={i}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {article.analysis.target_audience && (
                      <div className="analysis-item">
                        <strong>Target Audience:</strong> {article.analysis.target_audience}
                      </div>
                    )}
                    {article.analysis.crisis_framing && (
                      <div className="analysis-item">
                        <strong>Crisis Framing:</strong> {article.analysis.crisis_framing}
                      </div>
                    )}
                  </div>
                )}

                {article.error && (
                  <div className="article-error">
                    ⚠️ {article.error}
                  </div>
                )}
              </div>
            ))
          ) : (
            <p>No articles analyzed</p>
          )}
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="insights-section">
          {/* Key Findings */}
          {data.key_findings && data.key_findings.length > 0 && (
            <div className="findings-card">
              <h3>🎯 Key Findings</h3>
              <ol className="findings-list">
                {data.key_findings.map((finding, index) => (
                  <li key={index}>{finding}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Keyword Breakdown (for multi-keyword SERP) */}
          {data.sentiment_distribution?.keyword_breakdown && (
            <div className="keyword-breakdown-card">
              <h3>📊 Keyword Breakdown</h3>
              <div className="keyword-stats">
                {Object.entries(data.sentiment_distribution.keyword_breakdown).map(([keyword, stats]) => (
                  <div key={keyword} className="keyword-stat">
                    <h4>{keyword}</h4>
                    <div className="mini-stats">
                      <span className="positive">+{stats.positive}</span>
                      <span className="neutral">~{stats.neutral}</span>
                      <span className="negative">-{stats.negative}</span>
                      <span className="total">Total: {stats.total}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis Context */}
          {results.context && (
            <div className="context-card">
              <h3>🎯 Analysis Context</h3>
              <p>{results.context}</p>
            </div>
          )}

          {/* Analysis Metadata */}
          <div className="metadata-card">
            <h3>ℹ️ Analysis Details</h3>
            <div className="metadata-items">
              <div className="metadata-item">
                <span className="label">Mode:</span>
                <span className="value">{results.mode === 'serp' ? 'SERP Analysis' : 'URL Analysis'}</span>
              </div>
              <div className="metadata-item">
                <span className="label">Input:</span>
                <span className="value">{results.input}</span>
              </div>
              {data.timestamp && (
                <div className="metadata-item">
                  <span className="label">Timestamp:</span>
                  <span className="value">{data.timestamp}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}