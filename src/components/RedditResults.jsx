import { useState } from 'react';
import '../styles/RedditModule.css';

export default function RedditResults({ 
  data = [], 
  analytics = {}, 
  onClear, 
  searchQuery, 
  searchType 
}) {
  const [sortBy, setSortBy] = useState('score');
  const [filterBy, setFilterBy] = useState('all');
  const [expandedPosts, setExpandedPosts] = useState(new Set());
  const [showComments, setShowComments] = useState(true);

  // Utility functions for data transformation
  const decodeHtml = (html) => {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  };

  const normalizeTimestamp = (timestamp) => {
    // Convert ISO string to Unix timestamp (seconds)
    if (typeof timestamp === 'string') {
      return Math.floor(new Date(timestamp).getTime() / 1000);
    }
    return timestamp;
  };

  const normalizePostData = (item) => {
    // Map new API field names to expected component field names
    return {
      ...item,
      // Core field mappings
      score: item.upVotes || item.score || 0,
      num_comments: item.numberOfComments || item.num_comments || 0,
      author: item.username || item.author || 'unknown',
      subreddit: item.parsedCommunityName || item.subreddit || 'unknown',
      selftext: decodeHtml(item.body || item.selftext || ''),
      created_utc: normalizeTimestamp(item.createdAt || item.created_utc),
      upvote_ratio: item.upVoteRatio || item.upvote_ratio || 0,
      // Additional fields for better display
      title: decodeHtml(item.title || ''),
      post_hint: item.imageUrls?.length > 0 ? 'image' : item.post_hint,
      is_video: item.isVideo || item.is_video || false,
      is_original_content: item.isOriginalContent || item.is_original_content || false,
      over_18: item.over18 || item.over_18 || false,
      total_awards_received: item.totalAwardsReceived || item.total_awards_received || 0,
      gilded: item.gilded || 0,
      domain: item.domain || (item.link ? new URL(item.link).hostname : 'self.' + (item.parsedCommunityName || 'reddit')),
      permalink: item.url ? item.url.replace('https://www.reddit.com', '') : item.permalink || '',
      // Keep original data type
      dataType: item.dataType || 'post'
    };
  };

  // Separate and organize posts vs comments
  const processedData = data.map(normalizePostData);
  const posts = processedData.filter(item => item.dataType === 'post');
  const comments = processedData.filter(item => item.dataType === 'comment');

  // Group comments by their parent post
  const commentsByPost = comments.reduce((acc, comment) => {
    const postId = comment.postId;
    if (!acc[postId]) acc[postId] = [];
    acc[postId].push(comment);
    return acc;
  }, {});

  if (!data || data.length === 0) {
    return (
      <div className="results-container">
        <div className="no-results">
          <h3>No Results Found</h3>
          <p>No Reddit posts were found for your search criteria.</p>
        </div>
      </div>
    );
  }

  // Filter and sort posts (only posts, not comments)
  const filteredAndSortedPosts = posts
    .filter(post => {
      if (filterBy === 'all') return true;
      if (filterBy === 'high-score') return post.score > 100;
      if (filterBy === 'recent') return (Date.now() - post.created_utc * 1000) < 24 * 60 * 60 * 1000;
      if (filterBy === 'popular') return post.num_comments > 50;
      if (filterBy === 'oc') return post.is_original_content;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return (b.score || 0) - (a.score || 0);
        case 'comments':
          return (b.num_comments || 0) - (a.num_comments || 0);
        case 'recent':
          return (b.created_utc || 0) - (a.created_utc || 0);
        case 'ratio':
          return (b.upvote_ratio || 0) - (a.upvote_ratio || 0);
        default:
          return 0;
      }
    });

  const togglePostExpansion = (postId) => {
    const newExpanded = new Set(expandedPosts);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
    } else {
      newExpanded.add(postId);
    }
    setExpandedPosts(newExpanded);
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
  };

  const formatTimeAgo = (timestamp) => {
    const now = Date.now();
    const diff = now - (timestamp * 1000);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    
    if (days > 7) return new Date(timestamp * 1000).toLocaleDateString();
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Recent';
  };

  const getSentimentEmoji = (sentiment) => {
    if (!sentiment) return '😐';
    switch (sentiment.label) {
      case 'positive': return '😊';
      case 'negative': return '😟';
      default: return '😐';
    }
  };

  const getSentimentColor = (sentiment) => {
    if (!sentiment) return '#666';
    switch (sentiment.label) {
      case 'positive': return '#22c55e';
      case 'negative': return '#ef4444';
      default: return '#666';
    }
  };

  const getPostTypeIcon = (post) => {
    if (post.is_video) return '🎥';
    if (post.post_hint === 'image') return '🖼️';
    if (post.url && !post.url.includes('reddit.com')) return '🔗';
    if (post.selftext) return '📝';
    return '💬';
  };

  const truncateText = (text, maxLength = 300) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  return (
    <div className="results-container">
      {/* Results Header */}
      <div className="results-header">
        <div className="results-info">
          <h2>
            Reddit Results: {searchType === 'subreddit' ? `r/${searchQuery}` : 
                           searchType === 'search' ? `"${searchQuery}"` : 
                           `u/${searchQuery}`}
          </h2>
          <p>{filteredAndSortedPosts.length} posts • {comments.length} comments • {data.length} total items</p>
          {comments.length > 0 && (
            <div className="reddit-data-warning">
              ⚠️ <strong>API Usage:</strong> Comments are using {Math.round((comments.length / data.length) * 100)}% of your API limit. 
              Consider disabling comments for more posts.
            </div>
          )}
        </div>
        <button onClick={onClear} className="clear-results-button">
          🗑️ Clear Results
        </button>
      </div>

      {/* Controls */}
      <div className="results-controls">
        <div className="control-group">
          <label>Sort by:</label>
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="control-select"
          >
            <option value="score">📊 Score</option>
            <option value="comments">💬 Comments</option>
            <option value="recent">🕒 Recent</option>
            <option value="ratio">👍 Upvote Ratio</option>
          </select>
        </div>

        <div className="control-group">
          <label>Filter:</label>
          <select 
            value={filterBy} 
            onChange={(e) => setFilterBy(e.target.value)}
            className="control-select"
          >
            <option value="all">All Posts</option>
            <option value="high-score">High Score (100+)</option>
            <option value="recent">Recent (24h)</option>
            <option value="popular">Popular (50+ comments)</option>
            <option value="oc">Original Content</option>
          </select>
        </div>

        {comments.length > 0 && (
          <div className="control-group">
            <label>
              <input
                type="checkbox"
                checked={showComments}
                onChange={(e) => setShowComments(e.target.checked)}
              />
              Show Comments ({comments.length})
            </label>
          </div>
        )}
      </div>

      {/* Export Options */}
      <div className="export-options">
        <button 
          onClick={() => {
            const dataStr = JSON.stringify(filteredAndSortedPosts, null, 2);
            const dataBlob = new Blob([dataStr], {type: 'application/json'});
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `reddit-${searchType}-${searchQuery}-${new Date().toISOString().split('T')[0]}.json`;
            link.click();
          }}
          className="export-button"
        >
          📥 Export JSON
        </button>
        
        <button 
          onClick={() => {
            const csv = [
              'Title,Author,Subreddit,Score,Comments,Created,URL,Sentiment',
              ...filteredAndSortedPosts.map(post => 
                `"${post.title?.replace(/"/g, '""')}","${post.author}","${post.subreddit}",${post.score},${post.num_comments},"${formatTimeAgo(post.created_utc)}","${post.url}","${post.sentiment?.label || 'neutral'}"`
              )
            ].join('\n');
            
            const csvBlob = new Blob([csv], {type: 'text/csv'});
            const url = URL.createObjectURL(csvBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `reddit-${searchType}-${searchQuery}-${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
          }}
          className="export-button"
        >
          📊 Export CSV
        </button>
      </div>

      {/* Reddit-Style Posts List */}
      <div className="posts-list">
        {filteredAndSortedPosts.map((post, index) => {
          const postComments = commentsByPost[post.id] || [];
          return (
          <div key={post.id || index} className="reddit-post-card">
            {/* Reddit Vote Section */}
            <div className="reddit-vote-section">
              <div className="reddit-upvote-arrow">▲</div>
              <div className="reddit-score">{formatNumber(post.score)}</div>
              <div className="reddit-downvote-arrow">▼</div>
              <div className="reddit-upvote-ratio">
                {Math.round((post.upvote_ratio || 0) * 100)}%
              </div>
            </div>

            {/* Reddit Post Content */}
            <div className="reddit-post-content">
              {/* Reddit Post Meta */}
              <div className="reddit-post-meta">
                <span className="reddit-post-type-icon">{getPostTypeIcon(post)}</span>
                <a 
                  href={`https://reddit.com/r/${post.subreddit}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reddit-subreddit-link"
                >
                  r/{post.subreddit}
                </a>
                <span>•</span>
                <a 
                  href={`https://reddit.com/user/${post.author}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reddit-author-link"
                >
                  u/{post.author}
                </a>
                <span>•</span>
                <span className="reddit-post-time">{formatTimeAgo(post.created_utc)}</span>
                
                {/* Reddit Badges */}
                <div className="reddit-post-badges">
                  {post.is_original_content && <span className="reddit-badge oc">OC</span>}
                  {post.spoiler && <span className="reddit-badge spoiler">Spoiler</span>}
                  {post.over_18 && <span className="reddit-badge nsfw">NSFW</span>}
                  {post.total_awards_received > 0 && <span className="reddit-badge">🏆 {post.total_awards_received}</span>}
                </div>
              </div>

              {/* Reddit Post Title */}
              <div className="reddit-post-title">
                <h3>
                  <a 
                    href={`https://reddit.com${post.permalink}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    {post.title}
                  </a>
                </h3>
              </div>

              {/* Reddit Post Text Content */}
              {post.selftext && (
                <div className="reddit-post-text">
                  <p>
                    {expandedPosts.has(post.id) ? post.selftext : truncateText(post.selftext)}
                  </p>
                  {post.selftext.length > 300 && (
                    <button 
                      onClick={() => togglePostExpansion(post.id)}
                      className="expand-button"
                    >
                      {expandedPosts.has(post.id) ? 'Show Less' : 'Show More'}
                    </button>
                  )}
                </div>
              )}

              {/* Reddit External Link */}
              {post.url && !post.url.includes('reddit.com') && (
                <a 
                  href={post.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="reddit-external-link"
                >
                  🔗 {post.domain}
                </a>
              )}

              {/* Reddit Post Footer */}
              <div className="reddit-post-footer">
                <div className="reddit-post-metrics">
                  <div className="reddit-metric">
                    <span>💬</span>
                    <span>{formatNumber(post.num_comments)} comments</span>
                  </div>
                  
                  {post.gilded > 0 && (
                    <div className="reddit-metric">
                      <span>🥇</span>
                      <span>{post.gilded} gold</span>
                    </div>
                  )}
                  
                  <div className="reddit-sentiment-indicator">
                    <span 
                      className="reddit-sentiment-emoji"
                      style={{ color: getSentimentColor(post.sentiment) }}
                    >
                      {getSentimentEmoji(post.sentiment)}
                    </span>
                    <span>{post.sentiment?.label || 'neutral'}</span>
                    {post.sentiment?.score && (
                      <span>({post.sentiment.score > 0 ? '+' : ''}{post.sentiment.score})</span>
                    )}
                  </div>
                </div>

                <div className="reddit-post-actions">
                  <a 
                    href={`https://reddit.com${post.permalink}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="reddit-action-link"
                  >
                    💬 View on Reddit
                  </a>
                  {post.url && !post.url.includes('reddit.com') && (
                    <a 
                      href={post.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="reddit-action-link"
                    >
                      🔗 Original Link
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Comments Section */}
            {showComments && postComments.length > 0 && (
              <div className="reddit-comments-section">
                <div className="reddit-comments-header">
                  <h4>💬 {postComments.length} Comment{postComments.length !== 1 ? 's' : ''}</h4>
                </div>
                <div className="reddit-comments-list">
                  {postComments.slice(0, 3).map((comment, commentIndex) => (
                    <div key={comment.id || commentIndex} className="reddit-comment">
                      <div className="reddit-comment-meta">
                        <a 
                          href={`https://reddit.com/user/${comment.author}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="reddit-comment-author"
                        >
                          u/{comment.author}
                        </a>
                        <span>•</span>
                        <span className="reddit-comment-time">{formatTimeAgo(comment.created_utc)}</span>
                        <span>•</span>
                        <span className="reddit-comment-score">↑ {comment.score || comment.upVotes || 0}</span>
                      </div>
                      <div className="reddit-comment-body">
                        <p>{comment.selftext || decodeHtml(comment.body || '')}</p>
                      </div>
                      {comment.numberOfreplies > 0 && (
                        <div className="reddit-comment-replies">
                          <span>↳ {comment.numberOfreplies} repl{comment.numberOfreplies !== 1 ? 'ies' : 'y'}</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {postComments.length > 3 && (
                    <div className="reddit-show-more-comments">
                      <a 
                        href={`https://reddit.com${post.permalink}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="reddit-view-all-link"
                      >
                        View all {postComments.length} comments on Reddit
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Load More */}
      {filteredAndSortedPosts.length < data.length && (
        <div className="load-more">
          <p>Showing {filteredAndSortedPosts.length} of {data.length} posts</p>
          <p>Adjust filters to see more results</p>
        </div>
      )}
    </div>
  );
}