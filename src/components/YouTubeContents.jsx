import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { saveYouTubeResults, loadYouTubeResults } from '../utils/searchCache'

// New backend endpoint
const YOUTUBE_SEARCH_API = '/api/youtube-search'

export default function YouTubeContents({ user, keyword, searchId, email, onNewSearch }) {
  const [loading, setLoading] = useState(true)
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [error, setError] = useState('')
  const [expandedCards, setExpandedCards] = useState(new Set())
  const [analysisData, setAnalysisData] = useState({}) // Cache for analysis results
  const [overallSummary, setOverallSummary] = useState('') // Overall summary across all videos

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

      console.log('Calling backend API for YouTube search + summarization')

      // Generate search_id if not provided (for standalone YouTube searches)
      const effectiveSearchId = searchId || uuidv4()

      // Call new backend endpoint that handles everything
      const response = await fetch(YOUTUBE_SEARCH_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          keyword,
          user_id: user.id,
          search_id: effectiveSearchId,
          email: email
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `API request failed: ${response.status}`)
      }

      const data = await response.json()

      if (data.status !== 'success' || !data.videos || data.videos.length === 0) {
        setError('No YouTube videos found for this keyword')
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

      // Save results to localStorage
      saveYouTubeResults(user.id, {
        keyword,
        searchId,
        email,
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

  useEffect(() => {
    if (!keyword) {
      setError('No keyword provided. Please enter a keyword to search.')
      setLoading(false)
      return
    }

    // Check if we have cached data for this user
    const cachedData = loadYouTubeResults(user.id)

    if (cachedData && cachedData.keyword === keyword) {
      // Load from cache instead of fetching
      setYoutubeVideos(cachedData.videos || [])
      setAnalysisData(cachedData.analysisData || {})
      setOverallSummary(cachedData.overallSummary || '')
      setLoading(false)
    } else {
      // No cache or different keyword - fetch fresh data
      fetchYoutubeContent()
    }
  }, [keyword, user.id])

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
    return (
      <div className="youtube-contents-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Searching and analyzing YouTube videos...</p>
          <small style={{ marginTop: '10px', color: '#666' }}>
            Fetching 10 videos for "{keyword}" and generating summaries
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
      <div className="youtube-header">
        <h2>YouTube Content Analysis</h2>
        {onNewSearch && (
          <button onClick={onNewSearch} className="secondary-btn">
            New Search
          </button>
        )}
      </div>

      {youtubeVideos.length === 0 ? (
        <div className="no-results">
          <p>No YouTube videos found for this search.</p>
        </div>
      ) : (
        <>
          {/* Overall Summary Section */}
          {overallSummary && (
            <div className="overall-summary-section">
              <div className="overall-summary-card">
                <h3>📊 Trend Analysis for "{keyword}"</h3>
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
