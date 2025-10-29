import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import YouTubeContents from '../components/YouTubeContents'
import { loadSearchCache, loadYouTubeResults, clearYouTubeResults } from '../utils/searchCache'

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
    geo_filter: 'US',
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
    <div className="module-page">
      <div className="module-header" style={{ 
        borderBottom: '2px solid #FF0000', 
        paddingBottom: '15px',
        marginBottom: '20px'
      }}>
        <h1 style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          margin: '0 0 10px 0'
        }}>
          {/* YouTube Logo SVG */}
          <svg 
            width="26" 
            height="26" 
            viewBox="0 0 24 24" 
            fill="#FF0000"
            aria-label="YouTube Logo"
          >
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
          </svg>
          YouTube Analytics
        </h1>
        <p className="module-description">
          Analyze YouTube content and generate video summaries
        </p>
      </div>

      {!showResults ? (
        <div className="container">
          <form onSubmit={handleSearch}>
            {/* Search Type Selector */}
            <div className="form-group">
              <label>Search Type</label>
              <div className="search-type-selector">
                <label className="radio-option">
                  <input
                    type="radio"
                    name="searchType"
                    value="videos"
                    checked={searchType === 'videos'}
                    onChange={(e) => setSearchType(e.target.value)}
                  />
                  <span className="radio-label">
                    🔍 Search Videos
                  </span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    name="searchType"
                    value="channel"
                    checked={searchType === 'channel'}
                    onChange={(e) => setSearchType(e.target.value)}
                  />
                  <span className="radio-label">
                    📺 Search Channel
                  </span>
                </label>
              </div>
            </div>

            {/* Video Search Input */}
            {searchType === 'videos' && (
              <div className="form-group">
                <label htmlFor="youtube-keyword">Search Keyword</label>
                <input
                  type="text"
                  id="youtube-keyword"
                  value={searchParams.keyword}
                  onChange={(e) => setSearchParams({ ...searchParams, keyword: e.target.value })}
                  placeholder="Enter keyword to search YouTube videos"
                  required
                />
                <small>Enter a keyword to find and analyze top YouTube videos</small>
              </div>
            )}

            {/* Channel Search Input */}
            {searchType === 'channel' && (
              <div className="form-group">
                <label htmlFor="youtube-channel">Channel URL or Handle</label>
                <input
                  type="text"
                  id="youtube-channel"
                  value={channelInput}
                  onChange={(e) => setChannelInput(e.target.value)}
                  placeholder="Enter @username, channel URL, or channel ID"
                  required
                />
                <small>Enter @username (e.g., @mkbhd), full channel URL, or channel ID</small>
              </div>
            )}

            {/* Search Filters */}
            <div className="form-group">
              <label>Search Filters</label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '15px',
                background: '#f8f9fa',
                padding: '15px',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
                {/* Upload Date Filter */}
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    Upload Date:
                  </label>
                  <select 
                    value={filters.upload_date_filter || ''} 
                    onChange={(e) => handleFilterChange('upload_date_filter', e.target.value || null)}
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
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    Sort By:
                  </label>
                  <select 
                    value={filters.sort_by_filter} 
                    onChange={(e) => handleFilterChange('sort_by_filter', e.target.value)}
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
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    Region:
                  </label>
                  <select 
                    value={filters.geo_filter} 
                    onChange={(e) => handleFilterChange('geo_filter', e.target.value)}
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
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: '500' }}>
                    Content Type:
                  </label>
                  <select 
                    value={filters.content_type_filter} 
                    onChange={(e) => handleFilterChange('content_type_filter', e.target.value)}
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
            </div>

            <button type="submit">
              {searchType === 'videos' ? 'Search YouTube Videos' : 'Analyze Channel Videos'}
            </button>
          </form>
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
