import { useState } from 'react'

export default function TwitterResultsSeparated({ data, analytics, globalAnalytics }) {
  const [expandedSections, setExpandedSections] = useState({
    account: false,
    keyword: true,  // Default expand keyword
    hashtag: false
  })
  
  const [expandedTweets, setExpandedTweets] = useState(new Set())
  const [currentPages, setCurrentPages] = useState({
    account: 1,
    keyword: 1,
    hashtag: 1
  })
  
  const tweetsPerPage = 10
  
  // Toggle section expansion
  const toggleSection = (sectionType) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionType]: !prev[sectionType]
    }))
  }
  
  // Toggle tweet replies expansion
  const toggleTweetReplies = (tweetId) => {
    setExpandedTweets(prev => {
      const newSet = new Set(prev)
      if (newSet.has(tweetId)) {
        newSet.delete(tweetId)
      } else {
        newSet.add(tweetId)
      }
      return newSet
    })
  }
  
  // Get sentiment emoji
  const getSentimentEmoji = (sentiment) => {
    if (!sentiment) return '😐'
    if (sentiment.label === 'positive') return '😊'
    if (sentiment.label === 'negative') return '😔'
    return '😐'
  }
  
  // Render a search section (account, keyword, or hashtag)
  const renderSearchSection = (searchType, searchData) => {
    if (!searchData) return null
    
    const { tweets, count, analytics: sectionAnalytics, parametersUsed } = searchData
    const isExpanded = expandedSections[searchType]
    const currentPage = currentPages[searchType]
    const totalPages = Math.ceil(tweets.length / tweetsPerPage)
    const startIndex = (currentPage - 1) * tweetsPerPage
    const currentTweets = tweets.slice(startIndex, startIndex + tweetsPerPage)
    
    // Get section icon and title
    const getSectionInfo = () => {
      switch(searchType) {
        case 'account':
          return { 
            icon: '👤', 
            title: `Account: ${searchData.username}`,
            color: '#1DA1F2'
          }
        case 'keyword':
          return { 
            icon: '🔍', 
            title: `Keyword: "${searchData.query}"`,
            color: '#17BF63'
          }
        case 'hashtag':
          return { 
            icon: '#️⃣', 
            title: `Hashtags: ${searchData.tags.join(' ')}`,
            color: '#E1306C'
          }
        default:
          return { icon: '📝', title: 'Search', color: '#657786' }
      }
    }
    
    const { icon, title, color } = getSectionInfo()
    
    return (
      <div className="search-section" style={{ 
        marginBottom: '20px',
        border: `2px solid ${color}`,
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#fff'
      }}>
        {/* Section Header */}
        <div 
          className="section-header"
          onClick={() => toggleSection(searchType)}
          style={{
            padding: '16px 20px',
            backgroundColor: `${color}10`,
            borderBottom: isExpanded ? `1px solid ${color}30` : 'none',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            transition: 'background-color 0.2s'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>{icon}</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', color: '#14171A' }}>{title}</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#657786' }}>
                {count} tweets • {sectionAnalytics.totalEngagement?.toLocaleString() || 0} total engagement
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* Mini Analytics */}
            <div style={{ 
              display: 'flex', 
              gap: '16px',
              fontSize: '13px',
              color: '#536471'
            }}>
              {searchType === 'account' && (
                <>
                  <span>📊 {sectionAnalytics.avgEngagement} avg</span>
                  <span>👥 {(sectionAnalytics.followerCount / 1000000).toFixed(1)}M followers</span>
                  <span>📅 {sectionAnalytics.postingFrequency?.toFixed(1)} tweets/day</span>
                </>
              )}
              {searchType === 'keyword' && (
                <>
                  <span>🎯 {(sectionAnalytics.totalReach / 1000000).toFixed(1)}M reach</span>
                  <span>💭 {(sectionAnalytics.avgSentiment * 100).toFixed(0)}% positive</span>
                  <span>⭐ {sectionAnalytics.topInfluencers?.length || 0} influencers</span>
                </>
              )}
              {searchType === 'hashtag' && (
                <>
                  <span>{sectionAnalytics.trending ? '🔥 Trending' : '📈 Active'}</span>
                  <span>💫 {(sectionAnalytics.viralPotential * 100).toFixed(1)}% viral</span>
                  <span>🕐 Peak: {sectionAnalytics.peakHour}:00</span>
                </>
              )}
            </div>
            
            {/* Expand/Collapse Arrow */}
            <span style={{ 
              fontSize: '20px',
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.3s'
            }}>
              ▼
            </span>
          </div>
        </div>
        
        {/* Expanded Content */}
        {isExpanded && (
          <div className="section-content" style={{ padding: '20px' }}>
            {/* Parameters Used */}
            <div style={{
              padding: '12px',
              backgroundColor: '#F7F9FA',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#536471'
            }}>
              <strong>Search Parameters:</strong> {' '}
              {Object.entries(parametersUsed || {})
                .filter(([_, value]) => value !== null && value !== false)
                .map(([key, value]) => `${key}: ${value}`)
                .join(' • ')
              }
            </div>
            
            {/* Tweets */}
            {currentTweets.length > 0 ? (
              <>
                {currentTweets.map(tweet => (
                  <div key={tweet.id} className="tweet-card" style={{
                    padding: '16px',
                    borderBottom: '1px solid #E1E8ED',
                    marginBottom: '12px'
                  }}>
                    <div className="tweet-header" style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '12px'
                    }}>
                      <div>
                        <strong>@{tweet.author.username}</strong>
                        {tweet.author.verified && ' ✓'}
                        <span style={{ marginLeft: '8px', color: '#657786', fontSize: '13px' }}>
                          • {new Date(tweet.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ fontSize: '20px' }}>
                        {getSentimentEmoji(tweet.sentiment)}
                      </div>
                    </div>
                    
                    <div className="tweet-text" style={{ 
                      marginBottom: '12px',
                      lineHeight: '1.5'
                    }}>
                      {tweet.text}
                    </div>
                    
                    <div className="tweet-metrics" style={{
                      display: 'flex',
                      gap: '20px',
                      fontSize: '13px',
                      color: '#536471'
                    }}>
                      <span>❤️ {tweet.metrics.likes.toLocaleString()}</span>
                      <span>🔁 {tweet.metrics.retweets.toLocaleString()}</span>
                      <span>💬 {tweet.metrics.replies.toLocaleString()}</span>
                      {tweet.metrics.views > 0 && (
                        <span>👁️ {tweet.metrics.views.toLocaleString()}</span>
                      )}
                    </div>
                    
                    {/* Tweet Actions */}
                    <div style={{ marginTop: '12px' }}>
                      <a 
                        href={tweet.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{
                          color: color,
                          textDecoration: 'none',
                          fontSize: '13px',
                          marginRight: '16px'
                        }}
                      >
                        View on X →
                      </a>
                      
                      {tweet.replies && tweet.replies.length > 0 && (
                        <button
                          onClick={() => toggleTweetReplies(tweet.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: color,
                            cursor: 'pointer',
                            fontSize: '13px'
                          }}
                        >
                          {expandedTweets.has(tweet.id) ? 'Hide' : 'Show'} {tweet.replies.length} replies
                        </button>
                      )}
                    </div>
                    
                    {/* Replies (if expanded) */}
                    {expandedTweets.has(tweet.id) && tweet.replies && (
                      <div style={{
                        marginTop: '12px',
                        paddingLeft: '20px',
                        borderLeft: `2px solid ${color}30`
                      }}>
                        {tweet.replies.map((reply, idx) => (
                          <div key={idx} style={{
                            padding: '8px',
                            marginBottom: '8px',
                            backgroundColor: '#F7F9FA',
                            borderRadius: '8px',
                            fontSize: '13px'
                          }}>
                            <strong>@{reply.author.username}:</strong> {reply.text}
                            <div style={{ marginTop: '4px', color: '#657786' }}>
                              ❤️ {reply.metrics.likes} • {getSentimentEmoji(reply.sentiment)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="pagination" style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '8px',
                    marginTop: '20px'
                  }}>
                    <button
                      onClick={() => setCurrentPages(prev => ({
                        ...prev,
                        [searchType]: Math.max(1, currentPage - 1)
                      }))}
                      disabled={currentPage === 1}
                      style={{
                        padding: '6px 12px',
                        border: `1px solid ${color}`,
                        backgroundColor: currentPage === 1 ? '#F7F9FA' : '#fff',
                        borderRadius: '6px',
                        cursor: currentPage === 1 ? 'default' : 'pointer'
                      }}
                    >
                      Previous
                    </button>
                    
                    <span style={{ padding: '6px 12px' }}>
                      Page {currentPage} of {totalPages}
                    </span>
                    
                    <button
                      onClick={() => setCurrentPages(prev => ({
                        ...prev,
                        [searchType]: Math.min(totalPages, currentPage + 1)
                      }))}
                      disabled={currentPage === totalPages}
                      style={{
                        padding: '6px 12px',
                        border: `1px solid ${color}`,
                        backgroundColor: currentPage === totalPages ? '#F7F9FA' : '#fff',
                        borderRadius: '6px',
                        cursor: currentPage === totalPages ? 'default' : 'pointer'
                      }}
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p style={{ textAlign: 'center', color: '#657786' }}>
                No tweets found for this search
              </p>
            )}
          </div>
        )}
      </div>
    )
  }
  
  return (
    <div className="twitter-results-separated">
      {/* Global Analytics Bar */}
      {globalAnalytics && (
        <div style={{
          padding: '16px',
          backgroundColor: '#1DA1F2',
          color: '#fff',
          borderRadius: '12px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '20px' }}>
            <div>
              <strong>Total Fetched:</strong> {globalAnalytics.totalTweetsFetched}
            </div>
            <div>
              <strong>Unique Tweets:</strong> {globalAnalytics.uniqueTweets}
            </div>
            <div>
              <strong>Overlap:</strong> {globalAnalytics.overlapPercentage}%
            </div>
            <div>
              <strong>Search Types:</strong> {globalAnalytics.searchTypesUsed?.join(', ')}
            </div>
            <div>
              <strong>Overall Sentiment:</strong> {(globalAnalytics.overallSentiment * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      )}
      
      {/* Search Sections */}
      {data?.account && renderSearchSection('account', data.account)}
      {data?.keyword && renderSearchSection('keyword', data.keyword)}
      {data?.hashtag && renderSearchSection('hashtag', data.hashtag)}
      
      {/* No Results Message */}
      {!data?.account && !data?.keyword && !data?.hashtag && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#657786' }}>
          No search results to display
        </div>
      )}
    </div>
  )
}