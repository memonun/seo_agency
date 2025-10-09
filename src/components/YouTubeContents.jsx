import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { loadSearchCache } from '../utils/searchCache'

const YOUTUBE_WEBHOOK_URL = import.meta.env.VITE_YOUTUBE_WEBHOOK_URL || ''

export default function YouTubeContents({ user }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [youtubeVideos, setYoutubeVideos] = useState([])
  const [error, setError] = useState('')

  // Try to get searchId from navigation state, fallback to cache
  const cache = loadSearchCache(user.id)
  const searchId = location.state?.searchId || cache?.searchId
  const email = location.state?.email || cache?.formData?.email || user.email

  const fetchYoutubeContent = async () => {
    try {
      setLoading(true)
      setError('')

      // Fetch YouTube videos from Supabase
      const { data: youtubeData, error: dbError } = await supabase
        .from('serp_results')
        .select('url, title, description')
        .eq('search_id', searchId)
        .eq('domain', 'www.youtube.com')

      if (dbError) {
        throw new Error('Failed to fetch YouTube videos from database')
      }

      if (!youtubeData || youtubeData.length === 0) {
        setYoutubeVideos([])
        setLoading(false)
        return
      }

      const response = await fetch(YOUTUBE_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          search_id: searchId,
          client_mail: email,
          youtube_videos: youtubeData
        })
      })

      const data = await response.json()

      if (response.ok && data.status === 'success') {
        setYoutubeVideos(data.data || [])
      } else {
        throw new Error(data.message || 'Failed to fetch YouTube content')
      }
    } catch (err) {
      console.error('Error fetching YouTube content:', err)
      setError(err.message || 'An error occurred while analyzing YouTube videos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!searchId) {
      setError('No search ID provided. Please go back and try again.')
      setLoading(false)
      return
    }

    fetchYoutubeContent()
  }, [searchId])

  const handleBack = () => {
    navigate('/')
  }

  const handleRetry = () => {
    fetchYoutubeContent()
  }

  if (loading) {
    return (
      <div className="youtube-contents-container">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Analyzing YouTube videos...</p>
          <small style={{ marginTop: '10px', color: '#666' }}>
            This may take a few moments
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
            <button onClick={handleRetry} className="primary-btn">
              Retry Analysis
            </button>
            <button onClick={handleBack} className="secondary-btn">
              Back to Search
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="youtube-contents-container">
      <div className="youtube-header">
        <h2>YouTube Content Analysis</h2>
        <button onClick={handleBack} className="secondary-btn">
          Back to Search
        </button>
      </div>

      {youtubeVideos.length === 0 ? (
        <div className="no-results">
          <p>No YouTube videos found for this search.</p>
        </div>
      ) : (
        <div className="youtube-videos-grid">
          {youtubeVideos.map((video, index) => (
            <div key={index} className="youtube-video-card">
              <div className="video-card-header">
                <h3>{video.video_name || video.title || 'Untitled Video'}</h3>
                {video.url && (
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="video-link"
                  >
                    Watch →
                  </a>
                )}
              </div>
              <div className="video-summary">
                <h4>Summary</h4>
                <p>{video.text_summary || video.summary || 'No summary available'}</p>
              </div>
              {video.thumbnail && (
                <div className="video-thumbnail">
                  <img src={video.thumbnail} alt={video.video_name || 'Video thumbnail'} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
