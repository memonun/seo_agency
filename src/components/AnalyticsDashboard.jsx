import { useState } from 'react'
import './AnalyticsDashboard.css'

export default function AnalyticsDashboard({ user }) {
  const [selectedPeriod, setSelectedPeriod] = useState('7d')
  const [selectedPlatforms, setSelectedPlatforms] = useState(['all'])

  return (
    <div className="analytics-dashboard">
      <div className="dashboard-header">
        <h1>📊 Analytics Dashboard</h1>
        <p>Unified insights from all your data sources</p>
      </div>

      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="filter-group">
          <label>Time Period</label>
          <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label>Platforms</label>
          <div className="platform-filters">
            <button className={selectedPlatforms.includes('all') ? 'active' : ''}>All</button>
            <button className={selectedPlatforms.includes('seo') ? 'active' : ''}>SEO</button>
            <button className={selectedPlatforms.includes('youtube') ? 'active' : ''}>YouTube</button>
            <button className={selectedPlatforms.includes('twitter') ? 'active' : ''}>Twitter</button>
            <button className={selectedPlatforms.includes('news') ? 'active' : ''}>News</button>
            <button className={selectedPlatforms.includes('social') ? 'active' : ''}>Social</button>
          </div>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-icon">📈</span>
            <span className="metric-trend positive">+12.5%</span>
          </div>
          <div className="metric-value">247.3K</div>
          <div className="metric-label">Total Impressions</div>
          <div className="metric-sources">SEO + YouTube + Social</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-icon">😊</span>
            <span className="metric-trend positive">+5.2%</span>
          </div>
          <div className="metric-value">72%</div>
          <div className="metric-label">Positive Sentiment</div>
          <div className="metric-sources">News + Twitter + Social</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-icon">🎯</span>
            <span className="metric-trend neutral">0%</span>
          </div>
          <div className="metric-value">8.7K</div>
          <div className="metric-label">Keywords Tracked</div>
          <div className="metric-sources">SEO + News Analysis</div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-icon">🚨</span>
            <span className="metric-trend negative">-2.1%</span>
          </div>
          <div className="metric-value">3</div>
          <div className="metric-label">Critical Alerts</div>
          <div className="metric-sources">All Sources</div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="charts-grid">
        <div className="chart-card large">
          <h3>Cross-Platform Engagement Trends</h3>
          <div className="chart-placeholder">
            <p>📊 Line chart showing engagement across all platforms</p>
            <div className="mock-chart">
              <div className="chart-lines">
                <div className="chart-line youtube">YouTube</div>
                <div className="chart-line twitter">Twitter</div>
                <div className="chart-line seo">SEO Traffic</div>
                <div className="chart-line news">News Mentions</div>
              </div>
            </div>
          </div>
        </div>

        <div className="chart-card">
          <h3>Sentiment Distribution</h3>
          <div className="chart-placeholder">
            <p>🎯 Pie chart of sentiment analysis</p>
            <div className="mock-pie">
              <div className="pie-segment positive" style={{width: '72%'}}>72%</div>
              <div className="pie-segment neutral" style={{width: '20%'}}>20%</div>
              <div className="pie-segment negative" style={{width: '8%'}}>8%</div>
            </div>
          </div>
        </div>

        <div className="chart-card">
          <h3>Top Performing Content</h3>
          <div className="content-list">
            <div className="content-item">
              <span className="platform-badge youtube">YT</span>
              <span className="content-title">Product Launch Video</span>
              <span className="content-metric">125K views</span>
            </div>
            <div className="content-item">
              <span className="platform-badge twitter">TW</span>
              <span className="content-title">Thread on AI trends</span>
              <span className="content-metric">8.2K engagements</span>
            </div>
            <div className="content-item">
              <span className="platform-badge seo">SEO</span>
              <span className="content-title">Ultimate Guide Blog</span>
              <span className="content-metric">Position #1</span>
            </div>
            <div className="content-item">
              <span className="platform-badge news">NEWS</span>
              <span className="content-title">Press Release Coverage</span>
              <span className="content-metric">47 mentions</span>
            </div>
          </div>
        </div>
      </div>

      {/* Insights Section */}
      <div className="insights-section">
        <h2>🎯 AI-Powered Insights</h2>
        <div className="insights-grid">
          <div className="insight-card">
            <div className="insight-icon">🔥</div>
            <div className="insight-content">
              <h4>Trending Topic Alert</h4>
              <p>Your brand mentions increased 340% around "AI integration" - consider creating content on this topic.</p>
              <div className="insight-source">Source: Twitter + News Analysis</div>
            </div>
          </div>

          <div className="insight-card">
            <div className="insight-icon">⚠️</div>
            <div className="insight-content">
              <h4>Sentiment Shift Detected</h4>
              <p>Negative sentiment rising in social media comments about pricing. Review recent changes.</p>
              <div className="insight-source">Source: Social Listening + YouTube Comments</div>
            </div>
          </div>

          <div className="insight-card">
            <div className="insight-icon">💡</div>
            <div className="insight-content">
              <h4>Content Gap Opportunity</h4>
              <p>Competitors ranking for "best practices 2024" but you're not. High search volume detected.</p>
              <div className="insight-source">Source: SEO + SERP Analysis</div>
            </div>
          </div>

          <div className="insight-card">
            <div className="insight-icon">📈</div>
            <div className="insight-content">
              <h4>Viral Potential</h4>
              <p>Your TikTok content format is showing 5x higher engagement. Apply to other platforms.</p>
              <div className="insight-source">Source: Social Media Analytics</div>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="alerts-section">
        <h2>🚨 Real-Time Alerts</h2>
        <div className="alerts-list">
          <div className="alert-item critical">
            <span className="alert-time">2 min ago</span>
            <span className="alert-icon">🔴</span>
            <span className="alert-text">Crisis detected: Negative news article published by major outlet</span>
            <button className="alert-action">View & Respond</button>
          </div>
          <div className="alert-item warning">
            <span className="alert-time">1 hour ago</span>
            <span className="alert-icon">🟡</span>
            <span className="alert-text">Competitor launched new campaign targeting your keywords</span>
            <button className="alert-action">Analyze</button>
          </div>
          <div className="alert-item info">
            <span className="alert-time">3 hours ago</span>
            <span className="alert-icon">🔵</span>
            <span className="alert-text">YouTube video reached 100K views milestone</span>
            <button className="alert-action">Celebrate</button>
          </div>
        </div>
      </div>
    </div>
  )
}