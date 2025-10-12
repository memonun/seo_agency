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
      <div className="module-header">
        <h1>YouTube Module</h1>
        <p className="module-description">Analyze YouTube content and generate video summaries</p>
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
