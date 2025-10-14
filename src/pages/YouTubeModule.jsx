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

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchParams.keyword.trim()) {
      setShowResults(true)
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

            <button type="submit">
              Search YouTube Videos
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
            onNewSearch={handleNewSearch}
          />
        </>
      )}
    </div>
  )
}
