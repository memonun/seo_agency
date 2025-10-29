import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/RedditModule.css';

export default function RedditSearchHistory({ user, refreshTrigger, onLoadHistory }) {
  const [searchHistory, setSearchHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSearch, setExpandedSearch] = useState(null);

  // Fetch search history from database
  const fetchSearchHistory = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from('reddit_analytics_sessions')
        .select(`
          id,
          search_id,
          search_query,
          search_type,
          subreddit,
          username,
          search_description,
          sort_order,
          time_range,
          max_items,
          include_comments,
          include_community_info,
          completed,
          created_at,
          total_posts,
          total_comments,
          total_score,
          avg_score,
          viral_potential,
          avg_sentiment_score
        `)
        .eq('user_id', user.id)
        .eq('completed', true)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching Reddit search history:', error);
        setError('Failed to load search history');
        return;
      }

      setSearchHistory(data || []);
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('Failed to load search history');
    } finally {
      setLoading(false);
    }
  };

  // Fetch history on component mount and when refreshTrigger changes
  useEffect(() => {
    fetchSearchHistory();
  }, [user?.id, refreshTrigger]);

  // Format timestamp for display
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInHours = (now - date) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return 'Just now';
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  // Format number for display
  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
  };

  // Get search type icon
  const getSearchTypeIcon = (searchType) => {
    switch (searchType) {
      case 'subreddit': return '📋';
      case 'search': return '🔍';
      case 'user': return '👤';
      default: return '📊';
    }
  };

  // Get sentiment color
  const getSentimentColor = (sentiment) => {
    if (sentiment > 0.1) return '#22c55e';
    if (sentiment < -0.1) return '#ef4444';
    return '#f59e0b';
  };

  // Get viral potential color
  const getViralColor = (potential) => {
    if (potential >= 70) return '#22c55e';
    if (potential >= 40) return '#f59e0b';
    return '#ef4444';
  };

  // Handle loading history item
  const handleLoadHistory = (historyItem) => {
    const searchData = {
      searchType: historyItem.search_type,
      subreddit: historyItem.subreddit || '',
      query: historyItem.search_query || '',
      username: historyItem.username || '',
      sortOrder: historyItem.sort_order || 'hot',
      timeRange: historyItem.time_range || 'week',
      maxItems: historyItem.max_items || 25,
      includeComments: historyItem.include_comments || false,
      includeCommunityInfo: historyItem.include_community_info !== false
    };

    onLoadHistory(searchData);
  };

  // Toggle expanded view
  const toggleExpanded = (searchId) => {
    setExpandedSearch(expandedSearch === searchId ? null : searchId);
  };

  if (!user) {
    return (
      <div className="reddit-history-container">
        <div className="reddit-history-header">
          <h3>🔍 Reddit Search History</h3>
          <p>Please log in to view your search history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reddit-history-container">
      <div className="reddit-history-header">
        <h3>🔍 Reddit Search History</h3>
        <button 
          onClick={fetchSearchHistory} 
          className="refresh-button"
          disabled={loading}
        >
          {loading ? '⟳' : '🔄'} Refresh
        </button>
      </div>

      {error && (
        <div className="history-error">
          <p>❌ {error}</p>
          <button onClick={fetchSearchHistory} className="retry-button">
            Try Again
          </button>
        </div>
      )}

      {loading && searchHistory.length === 0 && (
        <div className="history-loading">
          <div className="loading-spinner"></div>
          <p>Loading search history...</p>
        </div>
      )}

      {!loading && searchHistory.length === 0 && !error && (
        <div className="history-empty">
          <p>📭 No search history yet</p>
          <p>Your Reddit searches will appear here</p>
        </div>
      )}

      {searchHistory.length > 0 && (
        <div className="reddit-history-list">
          {searchHistory.map((item) => (
            <div key={item.id} className="reddit-history-item">
              <div className="reddit-history-main" onClick={() => handleLoadHistory(item)}>
                <div className="reddit-history-icon">
                  {getSearchTypeIcon(item.search_type)}
                </div>
                
                <div className="reddit-history-content">
                  <div className="reddit-history-title">
                    {item.search_description}
                  </div>
                  
                  <div className="reddit-history-meta">
                    <span className="search-type">{item.search_type}</span>
                    <span className="separator">•</span>
                    <span className="timestamp">{formatTimestamp(item.created_at)}</span>
                    <span className="separator">•</span>
                    <span className="sort-order">{item.sort_order}</span>
                    {item.max_items && (
                      <>
                        <span className="separator">•</span>
                        <span className="max-items">{item.max_items} posts</span>
                      </>
                    )}
                  </div>

                  <div className="reddit-history-stats">
                    {item.total_posts > 0 && (
                      <div className="reddit-history-stat">
                        <span className="reddit-stat-value">{formatNumber(item.total_posts)}</span>
                        <span className="reddit-stat-label">posts</span>
                      </div>
                    )}
                    {item.total_comments > 0 && (
                      <div className="reddit-history-stat">
                        <span className="reddit-stat-value">{formatNumber(item.total_comments)}</span>
                        <span className="reddit-stat-label">comments</span>
                      </div>
                    )}
                    {item.avg_score > 0 && (
                      <div className="reddit-history-stat">
                        <span className="reddit-stat-value">{formatNumber(item.avg_score)}</span>
                        <span className="reddit-stat-label">avg score</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="history-indicators">
                  {item.viral_potential !== null && (
                    <div 
                      className="viral-indicator"
                      style={{ color: getViralColor(item.viral_potential) }}
                      title={`Viral Potential: ${item.viral_potential}%`}
                    >
                      🚀 {item.viral_potential}%
                    </div>
                  )}
                  
                  {item.avg_sentiment_score !== null && (
                    <div 
                      className="sentiment-indicator"
                      style={{ color: getSentimentColor(item.avg_sentiment_score) }}
                      title={`Sentiment: ${item.avg_sentiment_score.toFixed(2)}`}
                    >
                      {item.avg_sentiment_score > 0.1 ? '😊' : 
                       item.avg_sentiment_score < -0.1 ? '😟' : '😐'}
                    </div>
                  )}
                </div>
              </div>

              <div className="history-actions">
                <button 
                  onClick={() => toggleExpanded(item.search_id)}
                  className="expand-button"
                  title={expandedSearch === item.search_id ? 'Show less' : 'Show more'}
                >
                  {expandedSearch === item.search_id ? '▼' : '▶'}
                </button>
                
                <button 
                  onClick={() => handleLoadHistory(item)}
                  className="load-button"
                  title="Load this search"
                >
                  🔄
                </button>
              </div>

              {/* Expanded Details */}
              {expandedSearch === item.search_id && (
                <div className="history-details">
                  <div className="details-grid">
                    {item.search_type === 'subreddit' && item.subreddit && (
                      <div className="detail-item">
                        <span className="detail-label">Subreddit:</span>
                        <span className="detail-value">r/{item.subreddit}</span>
                      </div>
                    )}
                    
                    {item.search_type === 'search' && item.search_query && (
                      <div className="detail-item">
                        <span className="detail-label">Query:</span>
                        <span className="detail-value">"{item.search_query}"</span>
                      </div>
                    )}
                    
                    {item.search_type === 'user' && item.username && (
                      <div className="detail-item">
                        <span className="detail-label">User:</span>
                        <span className="detail-value">u/{item.username}</span>
                      </div>
                    )}
                    
                    <div className="detail-item">
                      <span className="detail-label">Sort:</span>
                      <span className="detail-value">{item.sort_order}</span>
                    </div>
                    
                    {item.time_range && (
                      <div className="detail-item">
                        <span className="detail-label">Time Range:</span>
                        <span className="detail-value">{item.time_range}</span>
                      </div>
                    )}
                    
                    <div className="detail-item">
                      <span className="detail-label">Comments:</span>
                      <span className="detail-value">{item.include_comments ? 'Yes' : 'No'}</span>
                    </div>
                    
                    {item.search_type === 'subreddit' && (
                      <div className="detail-item">
                        <span className="detail-label">Community Info:</span>
                        <span className="detail-value">{item.include_community_info ? 'Yes' : 'No'}</span>
                      </div>
                    )}
                  </div>

                  {/* Additional stats in expanded view */}
                  {(item.total_score > 0 || item.viral_potential > 0) && (
                    <div className="expanded-stats">
                      {item.total_score > 0 && (
                        <div className="expanded-stat">
                          <span className="stat-icon">🏆</span>
                          <span className="stat-text">Total Score: {formatNumber(item.total_score)}</span>
                        </div>
                      )}
                      
                      {item.viral_potential > 0 && (
                        <div className="expanded-stat">
                          <span className="stat-icon">🚀</span>
                          <span className="stat-text">Viral Potential: {item.viral_potential}%</span>
                        </div>
                      )}
                      
                      {item.avg_sentiment_score !== null && (
                        <div className="expanded-stat">
                          <span className="stat-icon">
                            {item.avg_sentiment_score > 0.1 ? '😊' : 
                             item.avg_sentiment_score < -0.1 ? '😟' : '😐'}
                          </span>
                          <span className="stat-text">
                            Sentiment: {item.avg_sentiment_score.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {searchHistory.length >= 20 && (
        <div className="history-footer">
          <p>Showing last 20 searches</p>
        </div>
      )}
    </div>
  );
}