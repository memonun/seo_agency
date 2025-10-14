import { useState } from 'react';

export default function TwitterResults({ 
  data = [], 
  analytics = {}, 
  onClear, 
  searchQuery 
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [tweetsPerPage] = useState(10);

  // Simple pagination without complex filtering
  const totalPages = Math.ceil(data.length / tweetsPerPage);
  const startIndex = (currentPage - 1) * tweetsPerPage;
  const currentTweets = data.slice(startIndex, startIndex + tweetsPerPage);

  // Helper functions
  const formatNumber = (num) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSentimentColor = (sentiment) => {
    switch (sentiment.label) {
      case 'positive': return '#10b981'; // green
      case 'negative': return '#ef4444'; // red
      case 'neutral': return '#6b7280'; // gray
      default: return '#6b7280';
    }
  };

  const getSentimentEmoji = (sentiment) => {
    switch (sentiment.label) {
      case 'positive': return '😊';
      case 'negative': return '😞';
      case 'neutral': return '😐';
      default: return '😐';
    }
  };

  const getSentimentLabel = (score) => {
    if (score > 0.1) return 'Positive';
    if (score < -0.1) return 'Negative';
    return 'Neutral';
  };

  // Export functionality
  const exportToCSV = () => {
    const headers = [
      'Tweet ID', 'Content', 'Author', 'Author Name', 'Verified', 'Followers',
      'Likes', 'Retweets', 'Replies', 'Views', 'Sentiment', 'Sentiment Score', 
      'Hashtags', 'Reply Count', 'Created At', 'URL'
    ];
    
    const csvData = data.map(tweet => [
      tweet.id,
      `"${tweet.text.replace(/"/g, '""')}"`,
      tweet.author.username,
      `"${tweet.author.name || 'Unknown'}"`,
      tweet.author.verified ? 'Yes' : 'No',
      tweet.author.followers || 0,
      tweet.metrics.likes,
      tweet.metrics.retweets,
      tweet.metrics.replies,
      tweet.metrics.views || 0,
      tweet.sentiment.label,
      tweet.sentiment.score,
      `"${(tweet.hashtags || []).join(', ')}"`,
      (tweet.replies && tweet.replies.length) || 0,
      tweet.created_at,
      tweet.url
    ]);
    
    const csvContent = [headers, ...csvData]
      .map(row => row.join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twitter-analytics-${searchQuery}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    const exportData = {
      metadata: {
        query: searchQuery,
        timestamp: new Date().toISOString(),
        total_tweets: data.length,
        export_version: '2.0'
      },
      analytics,
      tweets: data,
      summary: {
        total_engagement: data.reduce((sum, tweet) => sum + (tweet.metrics.likes + tweet.metrics.retweets), 0),
        avg_sentiment: data.length > 0 ? 
          (data.reduce((sum, tweet) => sum + tweet.sentiment.score, 0) / data.length).toFixed(2) : 0,
        sentiment_distribution: {
          positive: data.filter(t => t.sentiment.label === 'positive').length,
          negative: data.filter(t => t.sentiment.label === 'negative').length,
          neutral: data.filter(t => t.sentiment.label === 'neutral').length
        },
        total_replies: data.reduce((sum, tweet) => sum + (tweet.replies ? tweet.replies.length : 0), 0),
        verified_authors: data.filter(t => t.author.verified).length
      }
    };
    
    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twitter-analytics-${searchQuery}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportReplies = () => {
    // Flatten all replies from all tweets
    const allReplies = data.flatMap(tweet => 
      (tweet.replies || []).map(reply => ({
        original_tweet_id: tweet.id,
        original_author: tweet.author.username,
        original_text: tweet.text,
        reply_id: reply.id,
        reply_author: reply.author.username,
        reply_author_name: reply.author.name,
        reply_text: reply.text,
        reply_likes: reply.metrics.likes,
        reply_retweets: reply.metrics.retweets,
        reply_sentiment_label: reply.sentiment.label,
        reply_sentiment_score: reply.sentiment.score,
        reply_engagement: reply.engagement,
        reply_created_at: reply.created_at
      }))
    );

    if (allReplies.length === 0) {
      alert('No replies found in the current results');
      return;
    }

    const exportData = {
      metadata: {
        query: searchQuery,
        timestamp: new Date().toISOString(),
        total_replies: allReplies.length,
        export_type: 'replies'
      },
      replies: allReplies,
      summary: {
        total_replies: allReplies.length,
        avg_reply_engagement: allReplies.length > 0 ? 
          Math.floor(allReplies.reduce((sum, r) => sum + r.reply_engagement, 0) / allReplies.length) : 0,
        reply_sentiment_distribution: {
          positive: allReplies.filter(r => r.reply_sentiment_label === 'positive').length,
          negative: allReplies.filter(r => r.reply_sentiment_label === 'negative').length,
          neutral: allReplies.filter(r => r.reply_sentiment_label === 'neutral').length
        }
      }
    };

    const jsonContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `twitter-replies-${searchQuery}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!data || data.length === 0) {
    return (
      <div className="no-results">
        <p>No tweets found for this search.</p>
      </div>
    );
  }

  return (
    <div className="results-wrapper">
      <div className="domain-results">
        <div className="results-header">
          <h3>Twitter Results ({data.length} tweets)</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={exportToCSV} className="export-btn">
              📊 <span className="file-icon">CSV</span>
            </button>
            <button onClick={exportToJSON} className="export-btn">
              📋 <span className="file-icon">JSON</span>
            </button>
            {data.some(tweet => tweet.replies && tweet.replies.length > 0) && (
              <button onClick={exportReplies} className="export-btn">
                💬 <span className="file-icon">Replies</span>
              </button>
            )}
            <button onClick={onClear} className="close-btn">×</button>
          </div>
        </div>
        
        <div className="results-container">
          {currentTweets.map((tweet) => (
            <div key={tweet.id} className="domain-card">
              <div className="domain-card-header">
                <h4>@{tweet.author.username}</h4>
                <span className="domain-status">
                  {getSentimentEmoji(tweet.sentiment)} {getSentimentLabel(tweet.sentiment.score)}
                </span>
              </div>
              
              <div className="domain-info-grid">
                <div className="info-section">
                  <h5>Tweet Content</h5>
                  <p style={{ fontSize: '14px', lineHeight: '1.5', marginBottom: '16px' }}>
                    {tweet.text}
                  </p>
                  
                  {tweet.hashtags.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      {tweet.hashtags.map((hashtag, index) => (
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
                  )}
                </div>
                
                <div className="info-section">
                  <h5>Engagement Metrics</h5>
                  <div className="info-row">
                    <span className="info-label">Likes</span>
                    <span className="info-value">{formatNumber(tweet.metrics.likes)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Retweets</span>
                    <span className="info-value">{formatNumber(tweet.metrics.retweets)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Replies</span>
                    <span className="info-value">{formatNumber(tweet.metrics.replies)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Followers</span>
                    <span className="info-value">{formatNumber(tweet.author.followers)}</span>
                  </div>
                </div>
                
                <div className="info-section">
                  <h5>Tweet Details</h5>
                  <div className="info-row">
                    <span className="info-label">Author</span>
                    <span className="info-value">
                      {tweet.author.name} {tweet.author.verified && '✅'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Date</span>
                    <span className="info-value">{formatDate(tweet.created_at)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Sentiment Score</span>
                    <span className="info-value">{tweet.sentiment.score}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Action</span>
                    <span className="info-value">
                      <a 
                        href={tweet.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ color: '#000', textDecoration: 'underline' }}
                      >
                        View Tweet
                      </a>
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Replies Section */}
              {tweet.replies && tweet.replies.length > 0 && (
                <div style={{ 
                  marginTop: '15px',
                  padding: '12px',
                  background: '#f8f9fa',
                  borderRadius: '6px',
                  border: '1px solid #e5e5e5'
                }}>
                  <h6 style={{ 
                    margin: '0 0 10px 0',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: '#333'
                  }}>
                    📱 Replies ({tweet.replies.length})
                  </h6>
                  {tweet.replies.slice(0, 3).map((reply, replyIndex) => (
                    <div key={replyIndex} style={{
                      marginBottom: '8px',
                      fontSize: '12px',
                      padding: '8px',
                      background: '#fff',
                      borderRadius: '4px',
                      border: '1px solid #e0e0e0'
                    }}>
                      <div style={{ 
                        fontWeight: '500',
                        marginBottom: '4px',
                        color: '#007bff'
                      }}>
                        @{reply.author.username}
                      </div>
                      <div style={{ 
                        color: '#333',
                        lineHeight: '1.4',
                        marginBottom: '4px'
                      }}>
                        {reply.text.length > 100 ? `${reply.text.substring(0, 100)}...` : reply.text}
                      </div>
                      <div style={{ 
                        color: '#666',
                        fontSize: '11px',
                        display: 'flex',
                        gap: '8px'
                      }}>
                        <span>👍 {reply.metrics.likes}</span>
                        <span>🔁 {reply.metrics.retweets}</span>
                        <span>{getSentimentEmoji({label: reply.sentiment.label})}</span>
                      </div>
                    </div>
                  ))}
                  {tweet.replies.length > 3 && (
                    <div style={{ 
                      fontSize: '11px',
                      color: '#666',
                      textAlign: 'center',
                      marginTop: '8px'
                    }}>
                      ... and {tweet.replies.length - 3} more replies
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {/* Simple pagination */}
          {totalPages > 1 && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginTop: '20px',
              fontSize: '13px',
              color: '#666'
            }}>
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="secondary-btn"
              >
                Previous
              </button>
              
              <span>Page {currentPage} of {totalPages}</span>
              
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="secondary-btn"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}