import { useState } from 'react'
import './NewsSearch.css'

export default function NewsSearch({ onSearch, isLoading, error }) {
  const [mode, setMode] = useState('serp') // 'serp' or 'url'
  const [input, setInput] = useState('')
  const [context, setContext] = useState('')
  const [limit, setLimit] = useState(10)

  const handleSubmit = (e) => {
    e.preventDefault()
    
    if (!input.trim()) {
      return
    }

    const searchParams = {
      mode,
      input: input.trim(),
      context: context.trim() || null,
      limit: mode === 'serp' ? limit : undefined
    }

    onSearch(searchParams)
  }

  const handleModeChange = (newMode) => {
    setMode(newMode)
    // Clear input when switching modes
    setInput('')
    setContext('')
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
        <div className="form-group">
          <label htmlFor="input">
            {mode === 'serp' ? 'Keywords' : 'URLs'}
            <span className="required">*</span>
          </label>
          <textarea
            id="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              mode === 'serp' 
                ? 'Enter keywords to search SERP results (comma-separated for multiple)\nExample: "AI technology, machine learning, deep learning"' 
                : 'Enter URLs to analyze (comma-separated for multiple)\nExample: "https://example.com/article1, https://example.com/article2"'
            }
            rows={3}
            required
            disabled={isLoading}
          />
        </div>

        {mode === 'serp' && (
          <div className="form-group">
            <label htmlFor="limit">
              Result Limit: {limit}
            </label>
            <input
              id="limit"
              type="range"
              min="5"
              max="50"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              disabled={isLoading}
            />
            <div className="range-labels">
              <span>5</span>
              <span>25</span>
              <span>50</span>
            </div>
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
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? (
              <>
                <span className="loading-spinner-small"></span>
                Analyzing...
              </>
            ) : (
              <>
                📊 Analyze {mode === 'serp' ? 'SERP Results' : 'URLs'}
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
              <li>Use comma-separated keywords to analyze multiple topics</li>
              <li>Add context for crisis or competitor analysis</li>
              <li>Higher limits provide more comprehensive analysis but take longer</li>
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