import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './NewsSearch.css'

export default function NewsSearch({ onSearch, isLoading, error }) {
  const [mode, setMode] = useState('serp') // 'serp' or 'url'
  const [input, setInput] = useState('')
  const [context, setContext] = useState('')
  const [limit, setLimit] = useState(10)
  
  // SERP mode specific states
  const [recentSearches, setRecentSearches] = useState([])
  const [selectedSearchId, setSelectedSearchId] = useState('')
  const [searchUrls, setSearchUrls] = useState([])
  const [selectedUrls, setSelectedUrls] = useState(new Set())
  const [loadingSearches, setLoadingSearches] = useState(false)

  // Fetch recent searches when component mounts or mode changes to SERP
  useEffect(() => {
    if (mode === 'serp') {
      fetchRecentSearches()
    }
  }, [mode])

  // Fetch URLs when a search is selected
  useEffect(() => {
    if (selectedSearchId) {
      fetchSearchUrls(selectedSearchId)
    }
  }, [selectedSearchId])

  const fetchRecentSearches = async () => {
    setLoadingSearches(true)
    try {
      // Get unique search_ids with their metadata
      const { data, error } = await supabase
        .from('serp_results')
        .select('search_id, main_keyword, created_at')
        .order('created_at', { ascending: false })
        .limit(100) // Get last 100 to group by search_id

      if (error) throw error

      // Group by search_id and get unique searches
      const groupedSearches = {}
      data?.forEach(item => {
        if (!groupedSearches[item.search_id]) {
          groupedSearches[item.search_id] = {
            search_id: item.search_id,
            main_keyword: item.main_keyword,
            created_at: item.created_at,
            count: 1
          }
        } else {
          groupedSearches[item.search_id].count++
        }
      })

      // Convert to array and sort by date
      const searches = Object.values(groupedSearches)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 20) // Keep last 20 unique searches

      setRecentSearches(searches)
    } catch (error) {
      console.error('Error fetching recent searches:', error)
    } finally {
      setLoadingSearches(false)
    }
  }

  const fetchSearchUrls = async (searchId) => {
    setLoadingSearches(true)
    setSearchUrls([])
    setSelectedUrls(new Set())
    
    try {
      const { data, error } = await supabase
        .from('serp_results')
        .select('id, url, title, description')
        .eq('search_id', searchId)
        .order('created_at', { ascending: false })

      if (error) throw error

      setSearchUrls(data || [])
      // Pre-select first 10 URLs by default
      const defaultSelected = new Set(data?.slice(0, 10).map(item => item.id) || [])
      setSelectedUrls(defaultSelected)
    } catch (error) {
      console.error('Error fetching search URLs:', error)
    } finally {
      setLoadingSearches(false)
    }
  }

  const toggleUrlSelection = (urlId) => {
    const newSelected = new Set(selectedUrls)
    if (newSelected.has(urlId)) {
      newSelected.delete(urlId)
    } else {
      newSelected.add(urlId)
    }
    setSelectedUrls(newSelected)
  }

  const selectAllUrls = () => {
    setSelectedUrls(new Set(searchUrls.map(url => url.id)))
  }

  const deselectAllUrls = () => {
    setSelectedUrls(new Set())
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (mode === 'serp') {
      // SERP mode: need selected search and URLs
      if (!selectedSearchId || selectedUrls.size === 0) {
        return
      }

      // Get the selected URLs data
      const selectedUrlData = searchUrls.filter(url => selectedUrls.has(url.id))
      
      const searchParams = {
        mode: 'serp',
        searchId: selectedSearchId,
        urls: selectedUrlData.map(u => u.url),
        context: context.trim() || null
      }

      onSearch(searchParams)
    } else {
      // URL mode: need direct URLs input
      if (!input.trim()) {
        return
      }

      const searchParams = {
        mode: 'url',
        input: input.trim(),
        context: context.trim() || null
      }

      onSearch(searchParams)
    }
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    // Clear input when switching modes
    setInput('')
    setContext('')
    // Clear SERP-specific state
    setSelectedSearchId('')
    setSearchUrls([])
    setSelectedUrls(new Set())
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="news-search">
      <div className="mode-toggle">
        <button 
          className={`mode-btn ${mode === 'serp' ? 'active' : ''}`}
          onClick={() => handleModeChange('serp')}
          disabled={isLoading}
        >
          🔍 SERP Analysis
        </button>
        <button 
          className={`mode-btn ${mode === 'url' ? 'active' : ''}`}
          onClick={() => handleModeChange('url')}
          disabled={isLoading}
        >
          🔗 URL Analysis
        </button>
      </div>

      <form onSubmit={handleSubmit} className="search-form">
        {mode === 'serp' ? (
          <>
            {/* SERP Mode: Select from existing searches */}
            <div className="form-group">
              <label htmlFor="search-select">
                Select Search
                <span className="required">*</span>
              </label>
              {loadingSearches ? (
                <div className="loading-searches">Loading recent searches...</div>
              ) : (
                <select
                  id="search-select"
                  value={selectedSearchId}
                  onChange={(e) => setSelectedSearchId(e.target.value)}
                  disabled={isLoading}
                  required
                >
                  <option value="">Select a search...</option>
                  {recentSearches.map(search => (
                    <option key={search.search_id} value={search.search_id}>
                      {formatDate(search.created_at)} - {search.main_keyword} ({search.count} results)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Show URLs from selected search */}
            {selectedSearchId && searchUrls.length > 0 && (
              <div className="form-group">
                <label>
                  Select URLs to Analyze
                  <span className="url-count">({selectedUrls.size} selected)</span>
                </label>
                <div className="url-selection-controls">
                  <button type="button" onClick={selectAllUrls} className="select-btn">
                    Select All
                  </button>
                  <button type="button" onClick={deselectAllUrls} className="select-btn">
                    Deselect All
                  </button>
                </div>
                <div className="url-list">
                  {searchUrls.map(url => (
                    <div key={url.id} className="url-item">
                      <input
                        type="checkbox"
                        id={`url-${url.id}`}
                        checked={selectedUrls.has(url.id)}
                        onChange={() => toggleUrlSelection(url.id)}
                        disabled={isLoading}
                      />
                      <label htmlFor={`url-${url.id}`} className="url-label">
                        <div className="url-title">{url.title || 'Untitled'}</div>
                        <div className="url-link">{url.url}</div>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* URL Mode: Direct URL input */
          <div className="form-group">
            <label htmlFor="input">
              URLs
              <span className="required">*</span>
            </label>
            <textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Enter URLs to analyze (comma-separated for multiple)\nExample: "https://example.com/article1, https://example.com/article2"'
              rows={3}
              required
              disabled={isLoading}
            />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="context">
            Analysis Context
            <span className="optional">(Optional)</span>
          </label>
          <textarea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Provide context for more targeted analysis (e.g., 'Focus on technology innovation aspects' or 'Analyze for brand reputation impact')"
            rows={2}
            disabled={isLoading}
          />
        </div>

        <div className="form-actions">
          <button 
            type="submit" 
            className="submit-btn"
            disabled={
              isLoading || 
              (mode === 'serp' ? (!selectedSearchId || selectedUrls.size === 0) : !input.trim())
            }
          >
            {isLoading ? (
              <>
                <span className="loading-spinner-small"></span>
                Analyzing...
              </>
            ) : (
              <>
                📊 Analyze {mode === 'serp' ? `${selectedUrls.size} URLs` : 'URLs'}
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </form>

      <div className="search-tips">
        <h4>💡 Tips:</h4>
        <ul>
          {mode === 'serp' ? (
            <>
              <li>Select a recent search from your SERP results</li>
              <li>Choose which URLs to analyze (up to 50)</li>
              <li>Add context for targeted analysis</li>
            </>
          ) : (
            <>
              <li>Provide full URLs including https://</li>
              <li>Analyze multiple URLs by separating with commas</li>
              <li>Add context to focus the analysis on specific aspects</li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}