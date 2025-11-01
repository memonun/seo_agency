import { useState, useEffect } from 'react';
import styles from '../styles/RedditModule.module.css';

export default function RedditSearch({ 
  onSearch, 
  loading, 
  initialValues, 
  showNewSearchButton = false, 
  onNewSearch 
}) {
  const [searchType, setSearchType] = useState(initialValues?.searchType || 'subreddit');
  const [subreddit, setSubreddit] = useState(initialValues?.subreddit || '');
  const [query, setQuery] = useState(initialValues?.query || '');
  const [username, setUsername] = useState(initialValues?.username || '');
  const [sortOrder, setSortOrder] = useState(initialValues?.sortOrder || 'hot');
  const [timeRange, setTimeRange] = useState(initialValues?.timeRange || 'week');
  const [maxItems, setMaxItems] = useState(initialValues?.maxItems || 25);
  const [includeComments, setIncludeComments] = useState(initialValues?.includeComments || false);
  const [includeCommunityInfo, setIncludeCommunityInfo] = useState(initialValues?.includeCommunityInfo !== false);

  // Update form when initialValues change
  useEffect(() => {
    if (initialValues) {
      setSearchType(initialValues.searchType || 'subreddit');
      setSubreddit(initialValues.subreddit || '');
      setQuery(initialValues.query || '');
      setUsername(initialValues.username || '');
      setSortOrder(initialValues.sortOrder || 'hot');
      setTimeRange(initialValues.timeRange || 'week');
      setMaxItems(initialValues.maxItems || 25);
      setIncludeComments(initialValues.includeComments || false);
      setIncludeCommunityInfo(initialValues.includeCommunityInfo !== false);
    }
  }, [initialValues]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate required fields based on search type
    if (searchType === 'subreddit' && !subreddit.trim()) {
      alert('Please enter a subreddit name');
      return;
    }
    if (searchType === 'search' && !query.trim()) {
      alert('Please enter a search query');
      return;
    }
    if (searchType === 'user' && !username.trim()) {
      alert('Please enter a username');
      return;
    }

    const searchData = {
      searchType,
      subreddit: searchType === 'subreddit' ? subreddit.trim() : '',
      query: searchType === 'search' ? query.trim() : '',
      username: searchType === 'user' ? username.trim() : '',
      sortOrder,
      timeRange: sortOrder === 'top' ? timeRange : null,
      maxItems: parseInt(maxItems),
      includeComments,
      includeCommunityInfo
    };

    onSearch(searchData);
  };

  const clearForm = () => {
    setSubreddit('');
    setQuery('');
    setUsername('');
    setSortOrder('hot');
    setTimeRange('week');
    setMaxItems(25);
    setIncludeComments(false);
    setIncludeCommunityInfo(true);
  };

  // Get the input placeholder based on search type
  const getInputPlaceholder = () => {
    switch (searchType) {
      case 'subreddit':
        return 'Enter subreddit name (e.g., technology)';
      case 'search':
        return 'Enter search query (e.g., artificial intelligence)';
      case 'user':
        return 'Enter username (e.g., spez)';
      default:
        return '';
    }
  };

  // Get current input value based on search type
  const getCurrentInputValue = () => {
    switch (searchType) {
      case 'subreddit':
        return subreddit;
      case 'search':
        return query;
      case 'user':
        return username;
      default:
        return '';
    }
  };

  // Handle input change based on search type
  const handleInputChange = (value) => {
    switch (searchType) {
      case 'subreddit':
        setSubreddit(value);
        break;
      case 'search':
        setQuery(value);
        break;
      case 'user':
        setUsername(value);
        break;
    }
  };

  return (
    <div className={styles.searchContainer}>
      {showNewSearchButton && (
        <div className="new-search-header">
          <button 
            onClick={onNewSearch} 
            className="reddit-new-search-button"
          >
            🔍 New Reddit Search
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="search-form">
        {/* Search Type Selection */}
        <div className={styles.formGroup}>
          <label id="search-type-label">Search Type</label>
          <div 
            className="reddit-search-type-selector"
            role="radiogroup" 
            aria-labelledby="search-type-label"
          >
            <label className="reddit-radio-option">
              <input
                type="radio"
                name="searchType"
                value="subreddit"
                checked={searchType === 'subreddit'}
                onChange={(e) => setSearchType(e.target.value)}
                aria-describedby="subreddit-desc"
              />
              <span className="reddit-radio-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249z"/>
                </svg>
                r/ Subreddit
              </span>
            </label>
            <label className="reddit-radio-option">
              <input
                type="radio"
                name="searchType"
                value="search"
                checked={searchType === 'search'}
                onChange={(e) => setSearchType(e.target.value)}
                aria-describedby="search-desc"
              />
              <span className="reddit-radio-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  <path d="M9 8l1.5 2L12 8V6H8v2z" opacity="0.8"/>
                </svg>
                Keyword Search
              </span>
            </label>
            <label className="reddit-radio-option">
              <input
                type="radio"
                name="searchType"
                value="user"
                checked={searchType === 'user'}
                onChange={(e) => setSearchType(e.target.value)}
                aria-describedby="user-desc"
              />
              <span className="reddit-radio-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  <circle cx="10" cy="4" r="1" opacity="0.7"/>
                  <circle cx="14" cy="4" r="1" opacity="0.7"/>
                  <path d="M12 2c.5 0 1 .3 1 .8s-.5.8-1 .8-1-.3-1-.8.5-.8 1-.8z" opacity="0.8"/>
                </svg>
                User Analysis
              </span>
            </label>
          </div>
        </div>

        {/* Main Input Field */}
        <div className={styles.formGroup}>
          <label htmlFor="reddit-input">
            {searchType === 'subreddit' && 'Subreddit Name'}
            {searchType === 'search' && 'Search Query'}
            {searchType === 'user' && 'Username'}
          </label>
          <input
            type="text"
            id="reddit-input"
            value={getCurrentInputValue()}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={getInputPlaceholder()}
            required
          />
          <small>
            {searchType === 'subreddit' && <span id="subreddit-desc">Enter subreddit name without "r/" prefix</span>}
            {searchType === 'search' && <span id="search-desc">Search across all of Reddit for posts matching your query</span>}
            {searchType === 'user' && <span id="user-desc">Enter username without "u/" prefix to analyze their posts</span>}
          </small>
        </div>

        {/* Sort Order */}
        <div className={styles.formGroup}>
          <label htmlFor="sort-order">Sort Order</label>
          <select
            id="sort-order"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          >
            <option value="hot">🔥 Hot</option>
            <option value="new">🆕 New</option>
            <option value="top">🏆 Top</option>
            <option value="rising">📈 Rising</option>
            {searchType === 'search' && <option value="relevance">🎯 Most Relevant</option>}
          </select>
          <small>Choose how posts should be sorted</small>
        </div>

        {/* Time Range (only for "top" sort) */}
        {sortOrder === 'top' && (
          <div className={styles.formGroup}>
            <label htmlFor="time-range">Time Range</label>
            <select
              id="time-range"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <option value="hour">Past Hour</option>
              <option value="day">Past 24 Hours</option>
              <option value="week">Past Week</option>
              <option value="month">Past Month</option>
              <option value="year">Past Year</option>
              <option value="all">All Time</option>
            </select>
            <small>Select time period for top posts</small>
          </div>
        )}

        {/* Max Items */}
        <div className={styles.formGroup}>
          <label htmlFor="max-items">Number of Posts</label>
          <select
            id="max-items"
            value={maxItems}
            onChange={(e) => setMaxItems(e.target.value)}
          >
            <option value="10">10 posts</option>
            <option value="25">25 posts</option>
            <option value="50">50 posts</option>
            <option value="100">100 posts</option>
          </select>
          <small>How many posts to analyze</small>
        </div>

        {/* Advanced Options */}
        <div className="reddit-form-group advanced-options">
          <label>Advanced Options</label>
          
          <div className="checkbox-group">
            <label className="checkbox-option">
              <input
                type="checkbox"
                checked={includeComments}
                onChange={(e) => setIncludeComments(e.target.checked)}
                aria-describedby="comments-warning"
                id="include-comments"
              />
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginRight: '6px'}}>
                  <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-3 12H7v-2h10v2zm0-3H7V9h10v2zm0-3H7V6h10v2z"/>
                </svg>
                Include Comments Analysis
              </span>
            </label>
            <small id="comments-warning">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" style={{marginRight: '4px', verticalAlign: 'middle'}}>
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              </svg>
              Comments count towards your API limit. Disable for more posts.
            </small>
          </div>

          {searchType === 'subreddit' && (
            <div className="checkbox-group">
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={includeCommunityInfo}
                  onChange={(e) => setIncludeCommunityInfo(e.target.checked)}
                  aria-describedby="community-info-desc"
                  id="include-community-info"
                />
                <span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{marginRight: '6px'}}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    <path d="M9 11H7v6h2v-6zm4 0h-2v6h2v-6zm4-4H7v2h10V7z" opacity="0.6"/>
                  </svg>
                  Include Community Info
                </span>
              </label>
              <small id="community-info-desc">Include subreddit statistics and community information</small>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="form-actions">
          <button 
            type="submit" 
            disabled={loading}
            className={styles.searchButton}
          >
            {loading ? (
              <>
                <span className="loading-spinner small"></span>
                Analyzing Reddit...
              </>
            ) : (
              <>
                🔍 {searchType === 'subreddit' ? 'Analyze Subreddit' : 
                     searchType === 'search' ? 'Search Reddit' : 
                     'Analyze User'}
              </>
            )}
          </button>

          <button 
            type="button" 
            onClick={clearForm}
            className="clear-button"
            disabled={loading}
          >
            🗑️ Clear
          </button>
        </div>
      </form>

    </div>
  );
}