import { useState, useRef } from 'react'
import NewsSearch from './NewsSearch'
import NewsResults from './NewsResults'
import NewsSearchHistory, { saveSearch } from './NewsSearchHistory'
import './NewsDashboard.css'

export default function NewsDashboard({ user }) {
  const [results, setResults] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [refreshHistory, setRefreshHistory] = useState(0)
  const searchParamsRef = useRef(null)

  const handleSearch = async (searchParams) => {
    setIsLoading(true)
    setError(null)
    setResults(null)
    searchParamsRef.current = searchParams

    try {
      // Determine API endpoint based on environment
      const apiUrl = import.meta.env.DEV 
        ? 'http://localhost:3001/api/news-analytics'
        : '/api/news-analytics'

      console.log('📰 Calling news API:', apiUrl)
      console.log('📝 Request params:', searchParams)

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchParams),
      })

      const data = await response.json()
      console.log('📊 Response data:', data)

      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`)
      }

      if (data.success === false) {
        throw new Error(data.error || 'Analysis failed')
      }

      setResults(data)
      
      // Save to history if user is logged in
      if (user && data.success !== false) {
        await saveSearch(user, searchParams, data)
      }
      
      // Trigger history refresh
      setRefreshHistory(prev => prev + 1)
      
    } catch (err) {
      console.error('❌ News analysis error:', err)
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleHistorySelect = (historyItem) => {
    // Load historical results
    if (historyItem && historyItem.results) {
      setResults(historyItem.results)
    }
  }

  return (
    <div className="news-dashboard">
      <div className="dashboard-grid">
        <div className="search-section">
          <NewsSearch 
            onSearch={handleSearch} 
            isLoading={isLoading}
            error={error}
          />
          
          <NewsSearchHistory 
            user={user}
            refreshTrigger={refreshHistory}
            onSelectHistory={handleHistorySelect}
          />
        </div>
        
        <div className="results-section">
          {isLoading && (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Analyzing articles... This may take a moment.</p>
            </div>
          )}
          
          {error && (
            <div className="error-state">
              <p>❌ Error: {error}</p>
            </div>
          )}
          
          {results && !isLoading && (
            <NewsResults results={results} />
          )}
          
          {!results && !isLoading && !error && (
            <div className="empty-state">
              <h3>No Analysis Yet</h3>
              <p>Enter keywords to analyze SERP results or provide URLs for direct analysis.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}