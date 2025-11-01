import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { saveYouTubeResults, loadYouTubeResults } from '../utils/searchCache'
import { getYouTubeApiUrl, apiRequest, isDev } from '../utils/apiConfig'
import '../styles/modern-buttons.css'

// YouTube Channel Search API URL
const getYouTubeChannelSearchApi = () => {
  const baseUrl = isDev() ? 'http://localhost:3001' : ''
  return `${baseUrl}/api/youtube-channel-search`
}

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
      console.log(`🔍 CHANNEL SEARCH DEBUG:`)
      console.log(`   searchType: "${searchType}"`)
      console.log(`   isChannelSearch: ${isChannelSearch}`)
      console.log(`   keyword: "${keyword}"`)
      console.log(`   user.id: "${user.id}"`)
      console.log(`Calling backend API for YouTube ${isChannelSearch ? 'channel' : 'video'} search + summarization`)

      // Generate search_id if not provided
      const effectiveSearchId = searchId || uuidv4()
      console.log(`   search_id: "${effectiveSearchId}"`)

      // Choose the appropriate API endpoint
      const apiEndpoint = isChannelSearch ? getYouTubeChannelSearchApi() : getYouTubeApiUrl()
      console.log(`   API endpoint: "${apiEndpoint}"`)

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

      console.log(`📡 API Response Status: ${response.status}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        console.error(`❌ API Error Response:`, errorData)
        throw new Error(errorData.error || `API request failed: ${response.status}`)
      }

      const data = await response.json()
      console.log(`✅ API Response Data:`, {
        status: data.status,
        keyword: data.keyword,
        videosCount: data.videos?.length || 0,
        channelId: data.channelId,
        overallSummary: data.overallSummary ? 'Present' : 'Missing'
      })

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
              <button onClick={handleRetry} className="btn-modern-base btn-primary-modern">
                🔄 Retry Analysis
              </button>
            )}
            {onNewSearch && (
              <button onClick={onNewSearch} className="btn-modern-base btn-secondary-modern">
                ✨ New Search
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="videos-grid-modern">
      <div className="youtube-header-modern">
        <div className="youtube-header-content">
          <div className="youtube-title-section">
            <h2 className="youtube-title-modern" style={{ fontSize: 'var(--font-size-2xl)', margin: 0 }}>
              {searchType === 'channel' ? '📺 Channel Analysis Results' : '🎬 Video Analysis Results'}
            </h2>
          </div>
          <div className="header-actions-modern">
            <button 
              onClick={() => setShowFilters(!showFilters)} 
              className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
            >
              {showFilters ? '🔼 Hide Filters' : '🔽 Show Filters'}
            </button>
            {onNewSearch && (
              <button onClick={onNewSearch} className="btn-modern-base btn-secondary-modern">
                ✨ New Search
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modern Filter Panel */}
      {showFilters && (
        <div className="filters-panel-modern">
          <div className="filters-grid-modern">
            {/* Upload Date Filter */}
            <div className="filter-group-modern">
              <label className="form-label-modern">Upload Date</label>
              <select 
                value={filters.upload_date_filter || ''} 
                onChange={(e) => onFilterChange('upload_date_filter', e.target.value || null)}
                className="filter-select-modern"
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
            <div className="filter-group-modern">
              <label className="form-label-modern">Sort By</label>
              <select 
                value={filters.sort_by_filter} 
                onChange={(e) => onFilterChange('sort_by_filter', e.target.value)}
                className="filter-select-modern"
              >
                <option value="relevance">Relevance</option>
                <option value="date">Upload date</option>
                <option value="views">View count</option>
                <option value="rating">Rating</option>
              </select>
            </div>

            {/* Region Filter */}
            <div className="filter-group-modern">
              <label className="form-label-modern">Region</label>
              <select 
                value={filters.geo_filter} 
                onChange={(e) => onFilterChange('geo_filter', e.target.value)}
                className="filter-select-modern"
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
            <div className="filter-group-modern">
              <label className="form-label-modern">Content Type</label>
              <select 
                value={filters.content_type_filter} 
                onChange={(e) => onFilterChange('content_type_filter', e.target.value)}
                className="filter-select-modern"
              >
                <option value="video">Videos</option>
                <option value="shorts">Shorts</option>
                <option value="channel">Channels</option>
                <option value="playlist">Playlists</option>
              </select>
            </div>
          </div>

          {/* Modern Filter Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center', marginTop: 'var(--space-4)', alignItems: 'center' }}>
            <button 
              onClick={resetFilters} 
              className="btn-modern-base btn-secondary-modern"
            >
              🔄 Reset Filters
            </button>
            <small style={{ color: 'var(--secondary)', fontSize: 'var(--font-size-xs)' }}>
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

          <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
            {youtubeVideos.map((video, index) => {
            const isExpanded = expandedCards.has(index)

            return (
              <div key={index} className="video-card-modern" style={{ animationDelay: `${index * 100}ms` }}>
                {/* Modern Thumbnail */}
                <a
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="video-thumbnail-modern"
                >
                  <img
                    src={video.thumbnail}
                    alt={video.video_name || video.title || 'Video thumbnail'}
                  />
                  {/* Modern Content Type Badge */}
                  {video.contentType && (
                    <span 
                      className={`badge-modern badge-${video.contentType}`}
                      style={{
                        position: 'absolute',
                        top: 'var(--space-2)',
                        left: 'var(--space-2)',
                      }}
                    >
                      {getContentTypeIcon(video.contentType)} {getContentTypeLabel(video.contentType)}
                    </span>
                  )}
                  {video.duration && video.duration !== 'N/A' && (
                    <span 
                      className="badge-modern"
                      style={{
                        position: 'absolute',
                        bottom: 'var(--space-2)',
                        right: 'var(--space-2)',
                        background: 'rgba(0, 0, 0, 0.8)',
                        color: 'white'
                      }}
                    >
                      {video.duration}
                    </span>
                  )}
                  {video.position && (
                    <span 
                      className="badge-modern"
                      style={{
                        position: 'absolute',
                        top: 'var(--space-2)',
                        right: 'var(--space-2)',
                        background: 'var(--accent)',
                        color: 'white'
                      }}
                    >
                      #{video.position}
                    </span>
                  )}
                  {video.isLive && (
                    <span className="badge-modern badge-live" style={{
                      position: 'absolute',
                      top: 'var(--space-2)',
                      left: 'var(--space-2)',
                    }}>
                      🔴 LIVE
                    </span>
                  )}
                </a>

                {/* Modern Content */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {/* Modern Title */}
                  <h3 style={{ 
                    margin: 0, 
                    fontSize: 'var(--font-size-lg)', 
                    fontWeight: 600, 
                    lineHeight: 1.4,
                    color: 'var(--primary)'
                  }}>
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ 
                        color: 'inherit', 
                        textDecoration: 'none',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {video.video_name || video.title || 'Untitled Video'}
                    </a>
                  </h3>

                  {/* Modern Channel Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span style={{ 
                      color: 'var(--secondary)', 
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-1)'
                    }}>
                      {video.channel}
                      {video.isVerified && (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                      )}
                    </span>
                    {video.subscribers && (
                      <span className="badge-modern" style={{ 
                        background: 'var(--gray-100)',
                        color: 'var(--secondary)',
                        fontSize: 'var(--font-size-xs)'
                      }}>
                        {video.subscribers} subscribers
                      </span>
                    )}
                  </div>

                  {/* Modern Metadata */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 'var(--space-3)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--secondary)',
                    flexWrap: 'wrap'
                  }}>
                    <span>👁️ {video.views} views</span>
                    {video.likes && (
                      <span>👍 {video.likes}</span>
                    )}
                    <span className="meta-separator">•</span>
                    <span>{video.publishedTime}</span>
                  </div>

                  {/* Modern Description */}
                  {video.description && (
                    <p style={{ 
                      margin: 0,
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--secondary)',
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {video.description}
                    </p>
                  )}

                  {/* Modern Action Buttons */}
                  <div className="action-buttons-modern">
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="action-btn-modern"
                      style={{ background: 'var(--accent)', color: 'white', border: 'none' }}
                    >
                      ▶️ Watch
                    </a>
                    <button
                      onClick={() => copyLink(video.url)}
                      className="action-btn-modern"
                    >
                      🔗 Copy
                    </button>
                    <button
                      onClick={() => toggleExpand(video, index)}
                      className="action-btn-modern"
                    >
                      {isExpanded ? '🔼 Hide' : '🔽 Analysis'}
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
