import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { saveYouTubeResults, loadYouTubeResults } from '../utils/searchCache'

// Backend endpoints - environment aware
const getYouTubeSearchApi = () => import.meta.env.DEV 
  ? 'http://localhost:3001/api/youtube-search'
  : '/api/youtube-search'

const getYouTubeChannelSearchApi = () => import.meta.env.DEV 
  ? 'http://localhost:3001/api/youtube-channel-search'
  : '/api/youtube-channel-search'

export default function YouTubeContents({ user, keyword, searchId, email, searchType = 'videos', filters, onFilterChange, onNewSearch }) {
  const [loading, setLoading] = useState(true)
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [error, setError] = useState('')
  const [expandedCards, setExpandedCards] = useState(new Set())
  const [analysisData, setAnalysisData] = useState({}) // Cache for analysis results
  const [overallSummary, setOverallSummary] = useState('') // Overall summary across all videos
  const [showFilters, setShowFilters] = useState(false)
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false)

  // Filter handling functions (using props)
  const resetFilters = () => {
    const defaultFilters = {
      upload_date_filter: null,
      sort_by_filter: 'relevance',
      geo_filter: 'US',
      content_type_filter: 'video'
    }
    Object.keys(defaultFilters).forEach(key => {
      onFilterChange(key, defaultFilters[key])
    })
  }

  // Content type helper functions
  const getContentTypeIcon = (contentType) => {
    switch (contentType) {
      case 'shorts': return '⚡'
      case 'live': return '🔴'
      case 'channel': return '👤'
      case 'playlist': return '📋'
      default: return '🎬'
    }
  }

  const getContentTypeLabel = (contentType) => {
    switch (contentType) {
      case 'shorts': return 'Short'
      case 'live': return 'Live'
      case 'channel': return 'Channel'
      case 'playlist': return 'Playlist'
      default: return 'Video'
    }
  }

  const getContentTypeBadgeStyle = (contentType) => {
    switch (contentType) {
      case 'shorts': 
        return { background: '#ff6b35', color: 'white' }
      case 'live': 
        return { background: '#dc3545', color: 'white' }
      case 'channel': 
        return { background: '#6f42c1', color: 'white' }
      case 'playlist': 
        return { background: '#20c997', color: 'white' }
      default: 
        return { background: '#0d6efd', color: 'white' }
    }
  }

  // Helper function to parse markdown-style bold text
  const parseTextWithFormatting = (text) => {
    if (!text) return text
    
    // Split by bold markers (**text**)
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        // Remove the ** markers and wrap in strong tag
        const boldText = part.slice(2, -2)
        return <strong key={i}>{boldText}</strong>
      }
      return part
    })
  }

  // Function to render formatted summary with bullet points
  const renderFormattedSummary = (summaryText) => {
    if (!summaryText) return <p>No summary available</p>
    
    // Check for error messages
    if (summaryText.startsWith('⚠️')) {
      return <p className="error-text">{summaryText}</p>
    }

    // Split the summary into sections
    const sections = summaryText.split(/\n\n/)
    const elements = []
    
    sections.forEach((section, index) => {
      if (section.startsWith('Summary:')) {
        // Render summary paragraph
        const summaryContent = section.replace('Summary:', '').trim()
        elements.push(
          <div key={`summary-${index}`} className="summary-section">
            <h5>Summary:</h5>
            <p>{parseTextWithFormatting(summaryContent)}</p>
          </div>
        )
      } else if (section.startsWith('Key Takeaways:')) {
        // Parse and render bullet points with header
        const lines = section.split('\n')
        const bulletPoints = []
        
        lines.forEach((line) => {
          if (line.startsWith('* ')) {
            bulletPoints.push(line.substring(2).trim())
          }
        })
        
        if (bulletPoints.length > 0) {
          elements.push(
            <div key={`takeaways-${index}`} className="takeaways-section">
              <h5>Key Takeaways:</h5>
              <ul className="takeaways-list">
                {bulletPoints.map((point, pointIndex) => (
                  <li key={pointIndex}>{parseTextWithFormatting(point)}</li>
                ))}
              </ul>
            </div>
          )
        }
      } else if (section.trim()) {
        // Check if this section contains bullet points without a header
        const lines = section.split('\n')
        const hasBulletPoints = lines.some(line => line.trim().startsWith('* '))
        
        if (hasBulletPoints) {
          // This section contains bullet points
          const bulletPoints = []
          const nonBulletText = []
          
          lines.forEach((line) => {
            if (line.trim().startsWith('* ')) {
              bulletPoints.push(line.trim().substring(2).trim())
            } else if (line.trim()) {
              nonBulletText.push(line.trim())
            }
          })
          
          // Add any non-bullet text first
          if (nonBulletText.length > 0) {
            elements.push(
              <p key={`text-${index}`}>{parseTextWithFormatting(nonBulletText.join(' '))}</p>
            )
          }
          
          // Add bullet points
          if (bulletPoints.length > 0) {
            elements.push(
              <ul key={`bullets-${index}`} className="takeaways-list">
                {bulletPoints.map((point, pointIndex) => (
                  <li key={pointIndex}>{parseTextWithFormatting(point)}</li>
                ))}
              </ul>
            )
          }
        } else {
          // Regular paragraph without bullet points
          elements.push(
            <p key={`section-${index}`}>{parseTextWithFormatting(section)}</p>
          )
        }
      }
    })
    
    return <div className="formatted-summary">{elements}</div>
  }

  const fetchYoutubeContent = async () => {
    try {
      setLoading(true)
      setError('')

      const isChannelSearch = searchType === 'channel'
      console.log(`Calling backend API for YouTube ${isChannelSearch ? 'channel' : 'video'} search + summarization`)

      // Generate search_id if not provided
      const effectiveSearchId = searchId || uuidv4()

      // Choose the appropriate API endpoint
      const apiEndpoint = isChannelSearch ? getYouTubeChannelSearchApi() : getYouTubeSearchApi()

      // Call backend endpoint
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keyword,
          user_id: user.id,
          search_id: effectiveSearchId,
          email: email,
          filters: filters
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `API request failed: ${response.status}`)
      }

      const data = await response.json()

      // Check database save status and log for debugging
      if (data.databaseSave) {
        console.log('📊 Database Save Status:', data.databaseSave)
        if (data.databaseSave.status === 'success') {
          console.log('✅ Channel analytics saved to database successfully')
        } else {
          console.warn('⚠️ Database save failed:', data.databaseSave.error)
          // Optional: Show a non-blocking notification to user
          // Could implement a toast notification here
        }
      }

      if (data.status !== 'success' || !data.videos || data.videos.length === 0) {
        setError(isChannelSearch ? 'No videos found for this channel' : 'No YouTube videos found for this keyword')
        setLoading(false)
        return
      }

      // Extract videos and summaries from response
      const videoResults = data.videos
      const overallSummaryData = data.overallSummary || ''

      // Display videos with summaries
      setYoutubeVideos(videoResults)
      setOverallSummary(overallSummaryData)

      // Populate analysis data from summaries
      const analysisDataFromBackend = {}
      videoResults.forEach((video, index) => {
        analysisDataFromBackend[index] = {
          summary: video.summary || 'No summary available',
          video_name: video.title,
          url: video.url,
          video_id: video.video_id
        }
      })
      setAnalysisData(analysisDataFromBackend)
      setHasInitiallyLoaded(true) // Mark as initially loaded for auto-refetch

      // Save results to localStorage
      saveYouTubeResults(user.id, {
        keyword,
        searchId,
        email,
        searchType,
        videos: videoResults,
        analysisData: analysisDataFromBackend,
        overallSummary: overallSummaryData
      })
    } catch (err) {
      console.error('Error fetching YouTube content:', err)

      let errorMessage = err.message || 'An error occurred while fetching YouTube videos'

      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        errorMessage = 'Network error: Unable to connect to API. Please check your connection.'
      }

      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  // Auto-refetch when filters change (after initial load)
  useEffect(() => {
    if (hasInitiallyLoaded && keyword) {
      const timeoutId = setTimeout(() => {
        fetchYoutubeContent()
      }, 500) // 500ms debounce
      return () => clearTimeout(timeoutId)
    }
  }, [filters])

  useEffect(() => {
    if (!keyword) {
      setError('No keyword provided. Please enter a keyword to search.')
      setLoading(false)
      return
    }

    // Check if we have cached data for this user
    const cachedData = loadYouTubeResults(user.id)

    if (cachedData && cachedData.keyword === keyword && cachedData.searchType === searchType) {
      // Load from cache if keyword and search type match
      setYoutubeVideos(cachedData.videos || [])
      setAnalysisData(cachedData.analysisData || {})
      setOverallSummary(cachedData.overallSummary || '')
      setLoading(false)
    } else {
      // No cache, different keyword, or different search type - fetch fresh data
      fetchYoutubeContent()
    }
  }, [keyword, searchType, user.id])

  const handleRetry = () => {
    fetchYoutubeContent()
  }

  const toggleExpand = (video, index) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const copyLink = (url) => {
    navigator.clipboard.writeText(url)
      .then(() => alert('Link copied to clipboard!'))
      .catch(err => console.error('Failed to copy:', err))
  }

  if (loading) {
    const isChannelSearch = searchType === 'channel'
    return (
      <div className="youtube-contents-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>{isChannelSearch ? 'Analyzing channel videos...' : 'Searching and analyzing YouTube videos...'}</p>
          <small style={{ marginTop: '10px', color: '#666' }}>
            {isChannelSearch 
              ? `Fetching recent videos from "${keyword}" and generating summaries`
              : `Fetching 10 videos for "${keyword}" and generating summaries`
            }
          </small>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="youtube-contents-container">
        <div className="error-container">
          <div className="message error">
            {error}
          </div>
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
            {keyword && (
              <button onClick={handleRetry} className="primary-btn">
                Retry Analysis
              </button>
            )}
            {onNewSearch && (
              <button onClick={onNewSearch} className="secondary-btn">
                New Search
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="youtube-contents-container">
      <div className="youtube-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>{searchType === 'channel' ? 'YouTube Channel Analysis' : 'YouTube Content Analysis'}</h2>
        <div className="header-actions" style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setShowFilters(!showFilters)} 
            className="secondary-btn"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {onNewSearch && (
            <button onClick={onNewSearch} className="secondary-btn">
              New Search
            </button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="youtube-filters-panel" style={{
          background: '#f8f9fa',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #e9ecef'
        }}>
          <div className="filters-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px',
            marginBottom: '15px'
          }}>
            {/* Upload Date Filter */}
            <div className="filter-group">
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                Upload Date:
              </label>
              <select 
                value={filters.upload_date_filter || ''} 
                onChange={(e) => onFilterChange('upload_date_filter', e.target.value || null)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="">Any time</option>
                <option value="hour">Past hour</option>
                <option value="today">Today</option>
                <option value="week">This week</option>
                <option value="month">This month</option>
                <option value="year">This year</option>
              </select>
            </div>

            {/* Sort By Filter */}
            <div className="filter-group">
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                Sort By:
              </label>
              <select 
                value={filters.sort_by_filter} 
                onChange={(e) => onFilterChange('sort_by_filter', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="relevance">Relevance</option>
                <option value="date">Upload date</option>
                <option value="views">View count</option>
                <option value="rating">Rating</option>
              </select>
            </div>

            {/* Region Filter */}
            <div className="filter-group">
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                Region:
              </label>
              <select 
                value={filters.geo_filter} 
                onChange={(e) => onFilterChange('geo_filter', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="CA">Canada</option>
                <option value="AU">Australia</option>
                <option value="DE">Germany</option>
                <option value="FR">France</option>
                <option value="ES">Spain</option>
                <option value="IT">Italy</option>
                <option value="JP">Japan</option>
                <option value="IN">India</option>
              </select>
            </div>

            {/* Content Type Filter */}
            <div className="filter-group">
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500' }}>
                Content Type:
              </label>
              <select 
                value={filters.content_type_filter} 
                onChange={(e) => onFilterChange('content_type_filter', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="video">Videos</option>
                <option value="shorts">Shorts</option>
                <option value="channel">Channels</option>
                <option value="playlist">Playlists</option>
              </select>
            </div>
          </div>

          {/* Filter Actions */}
          <div className="filter-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
            <button 
              onClick={resetFilters} 
              className="secondary-btn"
              style={{ padding: '8px 16px' }}
            >
              Reset Filters
            </button>
            <small style={{ color: '#666', alignSelf: 'center', marginLeft: '10px' }}>
              Filters apply automatically
            </small>
          </div>
        </div>
      )}

      {youtubeVideos.length === 0 ? (
        <div className="no-results">
          <p>{searchType === 'channel' ? 'No videos found for this channel.' : 'No YouTube videos found for this search.'}</p>
        </div>
      ) : (
        <>
          {/* Overall Summary Section */}
          {overallSummary && (
            <div className="overall-summary-section">
              <div className="overall-summary-card">
                <h3>{searchType === 'channel' ? `📺 Channel Analysis for "${keyword}"` : `📊 Trend Analysis for "${keyword}"`}</h3>
                <div className="overall-summary-content">
                  {overallSummary}
                </div>
              </div>
            </div>
          )}

          <div className="youtube-videos-list">
            {youtubeVideos.map((video, index) => {
            const isExpanded = expandedCards.has(index)

            return (
              <div key={index} className="youtube-card">
                {/* Thumbnail */}
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="youtube-card-thumbnail"
                >
                  <img
                    src={video.thumbnail}
                    alt={video.video_name || video.title || 'Video thumbnail'}
                  />
                  {/* Content Type Badge */}
                  {video.contentType && (
                    <span 
                      className="content-type-badge"
                      style={{
                        position: 'absolute',
                        top: '8px',
                        left: '8px',
                        background: getContentTypeBadgeStyle(video.contentType).background,
                        color: getContentTypeBadgeStyle(video.contentType).color,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}
                    >
                      {getContentTypeIcon(video.contentType)} {getContentTypeLabel(video.contentType)}
                    </span>
                  )}
                  {video.duration && video.duration !== 'N/A' && (
                    <span className="video-duration">{video.duration}</span>
                  )}
                  {video.position && (
                    <span className="video-rank">#{video.position}</span>
                  )}
                  {video.isLive && (
                    <span className="video-live-badge">LIVE</span>
                  )}
                </a>

                {/* Content */}
                <div className="youtube-card-content">
                  {/* Title */}
                  <h3 className="video-title">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {video.video_name || video.title || 'Untitled Video'}
                    </a>
                  </h3>

                  {/* Channel Info with Verified Badge */}
                  <div className="youtube-channel-info">
                    <span className="channel-name">
                      {video.channel}
                      {video.isVerified && (
                        <svg className="verified-badge" width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M7 0L8.5 2.5L11 3L9.5 5.5L10 8L7 6.5L4 8L4.5 5.5L3 3L5.5 2.5L7 0Z" fill="#666"/>
                          <circle cx="7" cy="7" r="5" fill="none" stroke="#666" strokeWidth="0.5"/>
                        </svg>
                      )}
                    </span>
                    {video.subscribers && (
                      <span className="subscriber-count">{video.subscribers} subscribers</span>
                    )}
                  </div>

                  {/* Metadata with Engagement */}
                  <div className="youtube-card-meta">
                    <span className="view-count">{video.views} views</span>
                    {video.likes && (
                      <>
                        <span className="meta-separator">•</span>
                        <span className="like-count">👍 {video.likes}</span>
                      </>
                    )}
                    <span className="meta-separator">•</span>
                    <span className="publish-time">{video.publishedTime}</span>
                  </div>

                  {/* Description */}
                  <p className="video-description">
                    {video.description || 'No description available'}
                  </p>

                  {/* Action Buttons */}
                  <div className="youtube-card-actions">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="action-btn primary"
                    >
                      Watch on YouTube
                    </a>
                    <button
                      onClick={() => copyLink(video.url)}
                      className="action-btn secondary"
                    >
                      Copy Link
                    </button>
                    <button
                      onClick={() => toggleExpand(video, index)}
                      className="action-btn secondary expand-btn"
                    >
                      {isExpanded ? 'Hide Analysis ▲' : 'View Analysis ▼'}
                    </button>
                  </div>

                  {/* Expandable Analytics Section */}
                  {isExpanded && (
                    <div className="youtube-card-analytics">
                      {analysisData[index] ? (
                        <>
                          <div className="analytics-section">
                            <h4>AI Summary</h4>
                            {renderFormattedSummary(analysisData[index].summary)}
                          </div>

                          {/* Comments Section */}
                          {video.comments && (
                            <div className="analytics-section">
                              <h4>Top Comments ({video.comments.totalCount || 0})</h4>
                              {video.comments.error ? (
                                <p className="error-text">{video.comments.error}</p>
                              ) : video.comments.items && video.comments.items.length > 0 ? (
                                <div className="comments-list">
                                  {video.comments.items.slice(0, 5).map((comment, commentIndex) => (
                                    <div key={comment.id || commentIndex} className="comment-item">
                                      <div className="comment-header">
                                        <div className="comment-author">
                                          {comment.authorProfileImageUrl && (
                                            <img 
                                              src={comment.authorProfileImageUrl} 
                                              alt={comment.authorDisplayName}
                                              className="author-avatar"
                                            />
                                          )}
                                          <span className="author-name">
                                            {comment.authorDisplayName}
                                            {comment.isChannelOwner && (
                                              <span className="channel-owner-badge">Channel Owner</span>
                                            )}
                                          </span>
                                        </div>
                                        <div className="comment-meta">
                                          {comment.likeCount > 0 && (
                                            <span className="comment-likes">👍 {comment.likeCount}</span>
                                          )}
                                          {comment.replies > 0 && (
                                            <span className="comment-replies">💬 {comment.replies}</span>
                                          )}
                                        </div>
                                      </div>
                                      <div className="comment-text">
                                        {comment.textDisplay}
                                      </div>
                                      {comment.publishedAt && (
                                        <div className="comment-date">
                                          {new Date(comment.publishedAt).toLocaleDateString()}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                  {video.comments.items.length > 5 && (
                                    <div className="comments-footer">
                                      <small>Showing top 5 of {video.comments.totalCount} comments</small>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <p>No comments available for this video</p>
                              )}
                            </div>
                          )}

                          {video.channelThumbnail && !analysisData[index].error && (
                            <div className="analytics-section">
                              <h4>Channel Information</h4>
                              <div className="channel-info">
                                <img src={video.channelThumbnail} alt={video.channel} className="channel-avatar" />
                                <span>{video.channel}</span>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="analytics-section">
                          <p>Summary not available</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          </div>
        </>
      )}
    </div>
  )
}
