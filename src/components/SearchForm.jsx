import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import SearchHistory from './SearchHistory'
import { saveSearchCache, loadSearchCache, clearSearchCache } from '../utils/searchCache'

const WEBHOOK_URL = import.meta.env.VITE_WEBHOOK_URL || ''
const CONTENT_IDEAS_WEBHOOK_URL = import.meta.env.VITE_CONTENT_IDEAS_WEBHOOK_URL || ''

export default function SearchForm({ user }) {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    keyword: '',
    location: '',
    language: '',
    limit: '',
    email: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [stage, setStage] = useState('idle') // idle | search_success | search_error | ideas_pending | ideas_success | ideas_error
  const [currentSearchId, setCurrentSearchId] = useState(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [youtubeCount, setYoutubeCount] = useState(0)

  // Restore cache on component mount
  useEffect(() => {
    const cache = loadSearchCache(user.id)
    if (cache && cache.searchId) {
      setFormData(cache.formData)
      setCurrentSearchId(cache.searchId)
      setYoutubeCount(cache.youtubeCount || 0)
      setStage(cache.stage || 'idle')
    }
  }, [user.id])

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ text: '', type: '' })

    try {
      // Generate search_id on client side
      const searchId = uuidv4()

      // Create search session with client-generated ID
      const { error: sessionError } = await supabase
        .from('search_sessions')
        .insert({
          id: searchId,
          user_id: user.id,
          main_keyword: formData.keyword,
          location: formData.location,
          language: formData.language,
          limit_value: parseInt(formData.limit)
        })

      if (sessionError) throw sessionError

      // Send to webhook with user_id and search_id
      const webhookPayload = {
        keyword: formData.keyword,
        location: formData.location,
        language: formData.language,
        limit: formData.limit,
        email: formData.email || user.email,
        user_id: user.id,
        search_id: searchId
      }

      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(webhookPayload)
      })

      const data = await response.json()

      if (response.ok && data.status === 'success') {
        setMessage({ text: data.message || 'Search is done', type: 'success' })
        setCurrentSearchId(searchId)
        setStage('search_success')
        setHistoryRefresh(prev => prev + 1) // Trigger history refresh

        // Fetch YouTube video count
        const { data: youtubeData, error: youtubeError } = await supabase
          .from('serp_results')
          .select('id', { count: 'exact' })
          .eq('search_id', searchId)
          .eq('domain', 'www.youtube.com')

        const ytCount = (!youtubeError && youtubeData) ? youtubeData.length : 0
        setYoutubeCount(ytCount)

        // Save search state to cache for retry functionality
        saveSearchCache(user.id, {
          searchId,
          formData: {
            keyword: formData.keyword,
            location: formData.location,
            language: formData.language,
            limit: formData.limit,
            email: formData.email
          },
          youtubeCount: ytCount,
          stage: 'search_success'
        })
      } else {
        throw new Error(data.message || 'Request failed')
      }
    } catch (error) {
      console.error('Error:', error)
      setMessage({ text: error.message || 'Failed to start research. Please try again.', type: 'error' })
      setStage('search_error')
    } finally {
      setLoading(false)
    }
  }

  const handleGetContentIdeas = async () => {
    setLoading(true)
    setMessage({ text: '', type: '' })
    setStage('ideas_pending')

    try {
      const response = await fetch(CONTENT_IDEAS_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: user.id,
          search_id: currentSearchId,
          client_mail: formData.email || user.email
        })
      })

      const data = await response.json()

      if (response.ok && data.status === 'success') {
        setMessage({ text: data.message || 'Content ideas generated successfully!', type: 'success' })
        setStage('ideas_success')
      } else {
        throw new Error(data.message || 'Failed to generate content ideas')
      }
    } catch (error) {
      console.error('Error:', error)
      setMessage({ text: error.message || 'Failed to generate content ideas. Please try again.', type: 'error' })
      setStage('ideas_error')
    } finally {
      setLoading(false)
    }
  }

  const handleRetry = async (e) => {
    e.preventDefault()
    setStage('idle')
    setMessage({ text: '', type: '' })
    await handleSubmit(e)
  }

  const handleGetYoutubeContents = () => {
    navigate('/youtube-contents', {
      state: {
        searchId: currentSearchId,
        email: formData.email || user.email
      }
    })
  }

  const handleNewSearch = () => {
    // Clear cache when starting new search
    clearSearchCache(user.id)

    setFormData({
      keyword: '',
      location: '',
      language: '',
      limit: '',
      email: ''
    })
    setStage('idle')
    setCurrentSearchId(null)
    setMessage({ text: '', type: '' })
    setYoutubeCount(0)
  }

  const isFormDisabled = stage === 'search_success' || stage === 'ideas_pending' || stage === 'ideas_success' || stage === 'ideas_error'

  return (
    <>
      <div className="container">
        <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="keyword">Main Keyword</label>
          <input
            type="text"
            id="keyword"
            name="keyword"
            value={formData.keyword}
            onChange={handleChange}
            disabled={isFormDisabled}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="location">Location</label>
          <input
            type="text"
            id="location"
            name="location"
            value={formData.location}
            onChange={handleChange}
            disabled={isFormDisabled}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="language">Language</label>
          <input
            type="text"
            id="language"
            name="language"
            value={formData.language}
            onChange={handleChange}
            disabled={isFormDisabled}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="limit">Limit</label>
          <input
            type="number"
            id="limit"
            name="limit"
            value={formData.limit}
            onChange={handleChange}
            disabled={isFormDisabled}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="email">Client Email (optional)</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            disabled={isFormDisabled}
            placeholder={user.email}
          />
          <small style={{ color: '#666', fontSize: '12px' }}>Leave empty to use your account email</small>
        </div>

        {/* Initial search button - only show when idle or search_error */}
        {(stage === 'idle' || stage === 'search_error') && (
          <button type="submit" disabled={loading}>
            {loading ? 'Processing...' : 'Start Research'}
          </button>
        )}
      </form>

      {/* Message display */}
      {message.text && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Action buttons based on stage */}
      <div className="action-buttons">
        {/* After successful search */}
        {stage === 'search_success' && (
          <>
            <div className="button-group">
              <button
                onClick={handleGetContentIdeas}
                disabled={loading}
                className="primary-btn"
              >
                {loading ? 'Processing...' : 'Get Content Ideas'}
              </button>
              {youtubeCount > 0 && (
                <>
                  <span className="divider">|</span>
                  <button
                    onClick={handleGetYoutubeContents}
                    disabled={loading}
                    className="primary-btn"
                  >
                    Get YouTube Contents ({youtubeCount})
                  </button>
                </>
              )}
            </div>
            <button
              onClick={handleNewSearch}
              disabled={loading}
              className="secondary-btn"
              style={{ marginTop: '12px' }}
            >
              Start New Search
            </button>
          </>
        )}

        {/* After search error */}
        {stage === 'search_error' && (
          <>
            <button onClick={handleRetry} className="secondary-btn">
              Retry
            </button>
            <button className="secondary-btn" onClick={() => alert('Contact support')}>
              Contact Us
            </button>
          </>
        )}

        {/* After content ideas error */}
        {stage === 'ideas_error' && (
          <button
            onClick={handleGetContentIdeas}
            disabled={loading}
            className="secondary-btn"
          >
            {loading ? 'Processing...' : 'Retry Get Content Ideas'}
          </button>
        )}

        {/* After content ideas success */}
        {stage === 'ideas_success' && (
          <button onClick={handleNewSearch} className="primary-btn">
            Start New Search
          </button>
        )}
      </div>
      </div>

      <div className="history-container">
        <SearchHistory user={user} refreshTrigger={historyRefresh} />
      </div>
    </>
  )
}
