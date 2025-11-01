import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import YouTubeContents from '../components/YouTubeContents'
import { loadSearchCache, loadYouTubeResults, clearYouTubeResults } from '../utils/searchCache'
import '../styles/youtube-modern.css'
import '../styles/modern-buttons.css'

export default function YouTubeModule({ user }) {
  const location = useLocation()
  const cache = loadSearchCache(user.id)
  const youtubeCache = loadYouTubeResults(user.id)

  // Check if we have navigation state or cache
  const initialKeyword = location.state?.keyword || youtubeCache?.keyword || cache?.formData?.keyword || ''
  const initialSearchId = location.state?.searchId || youtubeCache?.searchId || cache?.searchId || ''
  const initialEmail = location.state?.email || youtubeCache?.email || cache?.formData?.email || user.email

  const [searchParams, setSearchParams] = useState({
    keyword: initialKeyword,
    searchId: initialSearchId,
    email: initialEmail
  })
  const [showResults, setShowResults] = useState(!!initialKeyword)
  const [searchType, setSearchType] = useState('videos') // 'videos' or 'channel'
  const [channelInput, setChannelInput] = useState('')
  
  // Filter state lifted to module level
  const [filters, setFilters] = useState({
    upload_date_filter: null,
    sort_by_filter: 'relevance',
    geo_filter: 'en', // Actually language filter
    content_type_filter: 'video'
  })

  // Load saved filters on component mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`youtube-filters-${user.id}`)
      if (saved) {
        setFilters(JSON.parse(saved))
      }
    } catch (error) {
      console.warn('Failed to load filters from localStorage:', error)
    }
  }, [user.id])

  // Save filters to localStorage when they change
  const handleFilterChange = (filterKey, value) => {
    const newFilters = { ...filters, [filterKey]: value }
    setFilters(newFilters)
    try {
      localStorage.setItem(`youtube-filters-${user.id}`, JSON.stringify(newFilters))
    } catch (error) {
      console.warn('Failed to save filters to localStorage:', error)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    
    if (searchType === 'videos') {
      // Existing video search functionality
      if (searchParams.keyword.trim()) {
        setShowResults(true)
      }
    } else if (searchType === 'channel') {
      // New channel search functionality
      if (channelInput.trim()) {
        setSearchParams({
          ...searchParams,
          keyword: channelInput.trim() // Use channel input as keyword for backend
        })
        setShowResults(true)
      }
    }
  }

  const handleNewSearch = () => {
    // Clear localStorage when starting new search
    clearYouTubeResults(user.id)

    setSearchParams({
      keyword: '',
      searchId: '',
      email: user.email
    })
    setChannelInput('')
    setShowResults(false)
  }

  return (
    <div className="youtube-module-modern">
      <div className="youtube-header-modern">
        <div className="youtube-header-content">
          <div className="youtube-title-section">
            <div>
              <h1 className="youtube-title-modern">
                {/* YouTube Logo SVG */}
                <svg 
                  width="32" 
                  height="32" 
                  viewBox="0 0 24 24" 
                  fill="#FF0000"
                  aria-label="YouTube Logo"
                >
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                YouTube Analytics
              </h1>
              <p className="youtube-subtitle">
                Analyze YouTube content and generate AI-powered video summaries
              </p>
            </div>
          </div>
        </div>
      </div>

      {!showResults ? (
        <div className="youtube-search-modern">
          <div className="search-card-modern">
            <form onSubmit={handleSearch}>
              {/* Modern Search Type Toggle */}
              <div className="search-type-toggle">
                <button
                  type="button"
                  className={`search-type-option ${searchType === 'videos' ? 'active' : ''}`}
                  onClick={() => setSearchType('videos')}
                >
                  🔍 Search Videos
                </button>
                <button
                  type="button"
                  className={`search-type-option ${searchType === 'channel' ? 'active' : ''}`}
                  onClick={() => setSearchType('channel')}
                >
                  📺 Analyze Channel
                </button>
              </div>

              {/* Video Search Input */}
              {searchType === 'videos' && (
                <div className="form-group-modern">
                  <label htmlFor="youtube-keyword" className="form-label-modern">
                    Search Keyword
                  </label>
                  <input
                    type="text"
                    id="youtube-keyword"
                    className="form-input-modern"
                    value={searchParams.keyword}
                    onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
                    placeholder="Enter keyword to search YouTube videos..."
                    required
                  />
                  <p className="form-help-text">
                    Enter a keyword to find and analyze top YouTube videos
                  </p>
                </div>
              )}

              {/* Channel Search Input */}
              {searchType === 'channel' && (
                <div className="form-group-modern">
                  <label htmlFor="youtube-channel" className="form-label-modern">
                    Channel URL or Handle
                  </label>
                  <input
                    type="text"
                    id="youtube-channel"
                    className="form-input-modern"
                    value={channelInput}
                    onChange={(e) => setChannelInput(e.target.value)}
                    placeholder="Enter @username, channel URL, or channel ID..."
                    required
                  />
                  <p className="form-help-text">
                    Enter @username (e.g., @mkbhd), full channel URL, or channel ID
                  </p>
                </div>
              )}

              {/* Modern Search Filters */}
              <div className="form-group-modern">
                <label className="form-label-modern">Search Filters</label>
                <div className="filters-panel-modern">
                  <div className="filters-grid-modern">
                    {/* Upload Date Filter */}
                    <div className="filter-group-modern">
                      <label className="form-label-modern">Upload Date</label>
                      <select 
                        value={filters.upload_date_filter || ''} 
                        onChange={(e) => handleFilterChange('upload_date_filter', e.target.value || null)}
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
                        onChange={(e) => handleFilterChange('sort_by_filter', e.target.value)}
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
                        onChange={(e) => handleFilterChange('geo_filter', e.target.value)}
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
                        <option value="KR">South Korea</option>
                      </select>
                    </div>

                    {/* Content Type Filter */}
                    <div className="filter-group-modern">
                      <label className="form-label-modern">Content Type</label>
                      <select 
                        value={filters.content_type_filter} 
                        onChange={(e) => handleFilterChange('content_type_filter', e.target.value)}
                        className="filter-select-modern"
                      >
                        <option value="video">Videos</option>
                        <option value="shorts">Shorts</option>
                        <option value="channel">Channels</option>
                        <option value="playlist">Playlists</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-modern-base btn-primary-modern btn-lg btn-full-width">
                {searchType === 'videos' ? '🔍 Search YouTube Videos' : '📺 Analyze Channel Videos'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <>
          <YouTubeContents
            user={user}
            keyword={searchParams.keyword}
            searchId={searchParams.searchId}
            email={searchParams.email}
            searchType={searchType}
            filters={filters}
            onFilterChange={handleFilterChange}
            onNewSearch={handleNewSearch}
          />
        </>
      )}
    </div>
  )
}
