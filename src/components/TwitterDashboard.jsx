export default function TwitterDashboard({ 
  analytics = {}, 
  query, 
  mock = false 
}) {
  // Default analytics structure if empty
  const defaultAnalytics = {
    total_tweets: 0,
    avg_sentiment: 0,
    sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
    top_hashtags: [],
    engagement_stats: { avg_likes: 0, avg_retweets: 0, total_engagement: 0 },
    top_influencers: []
  };

  const data = { ...defaultAnalytics, ...analytics };

  // Helper functions
  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getSentimentColor = (score) => {
    if (score > 0.1) return '#10b981'; // green
    if (score < -0.1) return '#ef4444'; // red
    return '#6b7280'; // gray
  };

  const getSentimentLabel = (score) => {
    if (score > 0.1) return 'Positive';
    if (score < -0.1) return 'Negative';
    return 'Neutral';
  };

  const getSentimentEmoji = (score) => {
    if (score > 0.1) return '😊';
    if (score < -0.1) return '😞';
    return '😐';
  };

  if (data.total_tweets === 0) {
    return null;
  }

  return (
    <div className="results-wrapper">
      <div className="domain-results">
        {mock && (
          <div style={{ 
            background: '#f9f9f9', 
            padding: '12px 20px', 
            borderBottom: '1px solid #e5e5e5',
            fontSize: '13px',
            color: '#666'
          }}>
            🔧 Demo Mode - Sample data for demonstration
          </div>
        )}
        
        <div className="results-header">
          <h3>Analytics Summary</h3>
        </div>
        
        <div className="results-container">
          <div className="domain-card">
            <div className="domain-card-header">
              <h4>Twitter Analytics Overview</h4>
              <span className="domain-status">
                {getSentimentEmoji(data.avg_sentiment)} {getSentimentLabel(data.avg_sentiment)}
              </span>
            </div>
            
            <div className="domain-info-grid">
              <div className="info-section">
                <h5>Tweet Metrics</h5>
                <div className="info-row">
                  <span className="info-label">Total Tweets</span>
                  <span className="info-value">{formatNumber(data.total_tweets)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Average Sentiment</span>
                  <span className="info-value">{data.avg_sentiment.toFixed(2)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Positive Tweets</span>
                  <span className="info-value">{data.sentiment_distribution.positive}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Negative Tweets</span>
                  <span className="info-value">{data.sentiment_distribution.negative}</span>
                </div>
              </div>
              
              <div className="info-section">
                <h5>Engagement Stats</h5>
                <div className="info-row">
                  <span className="info-label">Avg Likes</span>
                  <span className="info-value">{formatNumber(data.engagement_stats.avg_likes)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Avg Retweets</span>
                  <span className="info-value">{formatNumber(data.engagement_stats.avg_retweets)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Total Engagement</span>
                  <span className="info-value">{formatNumber(data.engagement_stats.total_engagement)}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Neutral Tweets</span>
                  <span className="info-value">{data.sentiment_distribution.neutral}</span>
                </div>
              </div>
              
              {data.top_hashtags.length > 0 && (
                <div className="info-section">
                  <h5>Top Hashtags</h5>
                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    {data.top_hashtags.slice(0, 10).map((hashtag, index) => (
                      <span key={index} style={{ 
                        display: 'inline-block', 
                        background: '#f5f5f5', 
                        padding: '2px 8px', 
                        margin: '2px 4px 2px 0', 
                        fontSize: '12px',
                        borderRadius: '2px'
                      }}>
                        {hashtag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {data.top_influencers.length > 0 && (
            <div className="domain-card">
              <div className="domain-card-header">
                <h4>Top Influencers</h4>
                <span className="domain-status">{data.top_influencers.length} users</span>
              </div>
              
              <div className="domain-info-grid">
                {data.top_influencers.slice(0, 3).map((influencer, index) => (
                  <div key={index} className="info-section">
                    <h5>#{index + 1} @{influencer.username}</h5>
                    <div className="info-row">
                      <span className="info-label">Name</span>
                      <span className="info-value">
                        {influencer.name} {influencer.verified && '✅'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Followers</span>
                      <span className="info-value">{formatNumber(influencer.followers)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}