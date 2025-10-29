import { useState } from 'react';
import '../styles/RedditModule.css';

export default function RedditDashboard({ 
  analytics = {}, 
  searchQuery, 
  searchType, 
  mock = false 
}) {
  const [activeTab, setActiveTab] = useState('overview');

  if (!analytics || Object.keys(analytics).length === 0) {
    return (
      <div className="reddit-dashboard-container">
        <div className="reddit-dashboard-header">
          <h2>📊 Reddit Analytics Dashboard</h2>
          <p>No analytics data available</p>
        </div>
      </div>
    );
  }

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
  };

  const getSentimentColor = (sentiment) => {
    if (sentiment > 0.1) return '#22c55e';
    if (sentiment < -0.1) return '#ef4444';
    return '#f59e0b';
  };

  const getSentimentLabel = (sentiment) => {
    if (sentiment > 0.1) return 'Positive';
    if (sentiment < -0.1) return 'Negative';
    return 'Neutral';
  };

  const getViralPotentialColor = (potential) => {
    if (potential >= 70) return '#22c55e';
    if (potential >= 40) return '#f59e0b';
    return '#ef4444';
  };

  const getViralPotentialLabel = (potential) => {
    if (potential >= 70) return 'High';
    if (potential >= 40) return 'Medium';
    return 'Low';
  };

  return (
    <div className="reddit-dashboard-container">
      {/* Dashboard Header */}
      <div className="reddit-dashboard-header">
        <div className="reddit-dashboard-title">
          <h2>📊 Reddit Analytics Dashboard</h2>
          {mock && <span className="reddit-mock-badge">Demo Mode</span>}
          <p className="reddit-dashboard-subtitle">
            Analysis for {searchType === 'subreddit' ? `r/${searchQuery}` : 
                        searchType === 'search' ? `"${searchQuery}"` : 
                        `u/${searchQuery}`}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="reddit-dashboard-tabs">
        <button 
          className={`reddit-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📈 Overview
        </button>
        <button 
          className={`reddit-tab ${activeTab === 'engagement' ? 'active' : ''}`}
          onClick={() => setActiveTab('engagement')}
        >
          💬 Engagement
        </button>
        <button 
          className={`reddit-tab ${activeTab === 'sentiment' ? 'active' : ''}`}
          onClick={() => setActiveTab('sentiment')}
        >
          😊 Sentiment
        </button>
        <button 
          className={`reddit-tab ${activeTab === 'community' ? 'active' : ''}`}
          onClick={() => setActiveTab('community')}
        >
          👥 Community
        </button>
      </div>

      {/* Tab Content */}
      <div className="reddit-dashboard-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="tab-content">
            <div className="reddit-metrics-grid">
              <div className="reddit-metric-card primary">
                <div className="reddit-metric-icon">📊</div>
                <div className="reddit-metric-content">
                  <div className="reddit-metric-value">{formatNumber(analytics.totalPosts || 0)}</div>
                  <div className="reddit-metric-label">Total Posts</div>
                </div>
              </div>

              <div className="reddit-metric-card">
                <div className="reddit-metric-icon">💬</div>
                <div className="reddit-metric-content">
                  <div className="reddit-metric-value">{formatNumber(analytics.totalComments || 0)}</div>
                  <div className="reddit-metric-label">Total Comments</div>
                </div>
              </div>

              <div className="reddit-metric-card">
                <div className="reddit-metric-icon">🏆</div>
                <div className="reddit-metric-content">
                  <div className="reddit-metric-value">{formatNumber(analytics.totalScore || 0)}</div>
                  <div className="reddit-metric-label">Total Score</div>
                </div>
              </div>

              <div className="reddit-metric-card">
                <div className="reddit-metric-icon">📈</div>
                <div className="reddit-metric-content">
                  <div className="reddit-metric-value">{formatNumber(analytics.avgScore || 0)}</div>
                  <div className="reddit-metric-label">Avg Score</div>
                </div>
              </div>

              <div className="reddit-metric-card">
                <div className="reddit-metric-icon">💭</div>
                <div className="reddit-metric-content">
                  <div className="reddit-metric-value">{formatNumber(analytics.avgCommentsPerPost || 0)}</div>
                  <div className="reddit-metric-label">Avg Comments/Post</div>
                </div>
              </div>

              <div className="reddit-metric-card">
                <div className="reddit-metric-icon">🔥</div>
                <div className="reddit-metric-content">
                  <div className="reddit-metric-value">{formatNumber(analytics.topPostScore || 0)}</div>
                  <div className="reddit-metric-label">Top Post Score</div>
                </div>
              </div>
            </div>

            {/* Viral Potential */}
            <div className="reddit-viral-potential">
              <h3>🚀 Viral Potential</h3>
              <div className="reddit-viral-meter">
                <div 
                  className="reddit-viral-fill" 
                  style={{ 
                    width: `${analytics.viralPotential || 0}%`
                  }}
                ></div>
              </div>
              <div className="reddit-viral-info">
                <span className="reddit-viral-percentage">{analytics.viralPotential || 0}%</span>
                <span className="reddit-viral-label">
                  {getViralPotentialLabel(analytics.viralPotential || 0)} Potential
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Engagement Tab */}
        {activeTab === 'engagement' && (
          <div className="tab-content">
            <div className="engagement-metrics">
              <div className="metric-row">
                <div className="metric-item">
                  <span className="metric-icon">👍</span>
                  <span className="metric-text">Average Score: <strong>{formatNumber(analytics.avgScore || 0)}</strong></span>
                </div>
                <div className="metric-item">
                  <span className="metric-icon">💬</span>
                  <span className="metric-text">Comments per Post: <strong>{formatNumber(analytics.avgCommentsPerPost || 0)}</strong></span>
                </div>
                <div className="metric-item">
                  <span className="metric-icon">🏆</span>
                  <span className="metric-text">Highest Score: <strong>{formatNumber(analytics.topPostScore || 0)}</strong></span>
                </div>
              </div>
            </div>

            {/* Peak Activity */}
            {analytics.peakHour !== null && (
              <div className="insight-card">
                <h3>⏰ Peak Activity</h3>
                <p>Most posts are created around <strong>{analytics.peakHour}:00</strong></p>
                <small>This indicates when the community is most active</small>
              </div>
            )}

            {/* Top Authors */}
            {analytics.topAuthors && analytics.topAuthors.length > 0 && (
              <div className="insight-card">
                <h3>👑 Most Active Authors</h3>
                <div className="top-list">
                  {analytics.topAuthors.slice(0, 5).map((author, index) => (
                    <div key={author.username} className="list-item">
                      <span className="rank">#{index + 1}</span>
                      <span className="username">u/{author.username}</span>
                      <span className="count">{author.posts} posts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sentiment Tab */}
        {activeTab === 'sentiment' && (
          <div className="tab-content">
            {/* Overall Sentiment */}
            <div className="sentiment-overview">
              <div className="sentiment-main">
                <div className="sentiment-circle">
                  <div 
                    className="sentiment-fill"
                    style={{ color: getSentimentColor(analytics.avgSentiment || 0) }}
                  >
                    {analytics.avgSentiment > 0 ? '😊' : analytics.avgSentiment < 0 ? '😟' : '😐'}
                  </div>
                </div>
                <div className="sentiment-info">
                  <div 
                    className="sentiment-score"
                    style={{ color: getSentimentColor(analytics.avgSentiment || 0) }}
                  >
                    {getSentimentLabel(analytics.avgSentiment || 0)}
                  </div>
                  <div className="sentiment-value">
                    Score: {(analytics.avgSentiment || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            {/* Sentiment Breakdown */}
            {analytics.sentimentBreakdown && (
              <div className="insight-card">
                <h3>📊 Sentiment Distribution</h3>
                <div className="sentiment-breakdown">
                  <div className="sentiment-bar">
                    <div className="sentiment-item positive">
                      <span className="sentiment-emoji">😊</span>
                      <span className="sentiment-label">Positive</span>
                      <span className="sentiment-count">{analytics.sentimentBreakdown.positive || 0}</span>
                    </div>
                    <div className="sentiment-item neutral">
                      <span className="sentiment-emoji">😐</span>
                      <span className="sentiment-label">Neutral</span>
                      <span className="sentiment-count">{analytics.sentimentBreakdown.neutral || 0}</span>
                    </div>
                    <div className="sentiment-item negative">
                      <span className="sentiment-emoji">😟</span>
                      <span className="sentiment-label">Negative</span>
                      <span className="sentiment-count">{analytics.sentimentBreakdown.negative || 0}</span>
                    </div>
                  </div>

                  {/* Sentiment percentages */}
                  <div className="sentiment-percentages">
                    {(() => {
                      const total = (analytics.sentimentBreakdown.positive || 0) + 
                                   (analytics.sentimentBreakdown.neutral || 0) + 
                                   (analytics.sentimentBreakdown.negative || 0);
                      if (total === 0) return null;
                      
                      return (
                        <div className="percentage-bars">
                          <div 
                            className="percentage-bar positive"
                            style={{ width: `${(analytics.sentimentBreakdown.positive / total) * 100}%` }}
                          />
                          <div 
                            className="percentage-bar neutral"
                            style={{ width: `${(analytics.sentimentBreakdown.neutral / total) * 100}%` }}
                          />
                          <div 
                            className="percentage-bar negative"
                            style={{ width: `${(analytics.sentimentBreakdown.negative / total) * 100}%` }}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Community Tab */}
        {activeTab === 'community' && (
          <div className="tab-content">
            {/* Top Subreddits */}
            {analytics.topSubreddits && analytics.topSubreddits.length > 0 && (
              <div className="insight-card">
                <h3>🏠 Top Subreddits</h3>
                <div className="top-list">
                  {analytics.topSubreddits.slice(0, 5).map((subreddit, index) => (
                    <div key={subreddit.name} className="list-item">
                      <span className="rank">#{index + 1}</span>
                      <span className="subreddit-name">r/{subreddit.name}</span>
                      <span className="count">{subreddit.posts} posts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Community Insights */}
            <div className="insight-card">
              <h3>🔍 Community Insights</h3>
              <div className="insights-list">
                {analytics.totalPosts > 50 && (
                  <div className="insight-item">
                    <span className="insight-icon">📈</span>
                    <span className="insight-text">
                      High activity community with {analytics.totalPosts} posts analyzed
                    </span>
                  </div>
                )}
                
                {analytics.avgCommentsPerPost > 20 && (
                  <div className="insight-item">
                    <span className="insight-icon">💬</span>
                    <span className="insight-text">
                      Very engaged community with high comment activity
                    </span>
                  </div>
                )}
                
                {analytics.viralPotential > 60 && (
                  <div className="insight-item">
                    <span className="insight-icon">🚀</span>
                    <span className="insight-text">
                      High viral potential - content tends to spread quickly
                    </span>
                  </div>
                )}
                
                {analytics.avgSentiment > 0.3 && (
                  <div className="insight-item">
                    <span className="insight-icon">😊</span>
                    <span className="insight-text">
                      Positive community atmosphere with uplifting content
                    </span>
                  </div>
                )}
                
                {analytics.avgSentiment < -0.3 && (
                  <div className="insight-item">
                    <span className="insight-icon">😟</span>
                    <span className="insight-text">
                      Community tends toward critical or negative discussions
                    </span>
                  </div>
                )}

                {/* Default insight if no special conditions */}
                {!(analytics.totalPosts > 50 || analytics.avgCommentsPerPost > 20 || 
                   analytics.viralPotential > 60 || Math.abs(analytics.avgSentiment) > 0.3) && (
                  <div className="insight-item">
                    <span className="insight-icon">📊</span>
                    <span className="insight-text">
                      Standard community engagement patterns observed
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}