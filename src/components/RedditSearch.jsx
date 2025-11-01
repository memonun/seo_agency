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
          <label>Search Type</label>
          <div className="reddit-search-type-selector">
            <label className="reddit-radio-option">
              <input
                type="radio"
                name="searchType"
                value="subreddit"
                checked={searchType === 'subreddit'}
                onChange={(e) => setSearchType(e.target.value)}
              />
              <span className="reddit-radio-label">
                📋 Subreddit Analysis
              </span>
            </label>
            <label className="reddit-radio-option">
              <input
                type="radio"
                name="searchType"
                value="search"
                checked={searchType === 'search'}
                onChange={(e) => setSearchType(e.target.value)}
              />
              <span className="reddit-radio-label">
                🔍 Keyword Search
              </span>
            </label>
            <label className="reddit-radio-option">
              <input
                type="radio"
                name="searchType"
                value="user"
                checked={searchType === 'user'}
                onChange={(e) => setSearchType(e.target.value)}
              />
              <span className="reddit-radio-label">
                👤 User Analysis
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
            {searchType === 'subreddit' && 'Enter subreddit name without "r/" prefix'}
            {searchType === 'search' && 'Search across all of Reddit for posts matching your query'}
            {searchType === 'user' && 'Enter username without "u/" prefix to analyze their posts'}
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
              />
              <span>💬 Include Comments Analysis</span>
            </label>
            <small>⚠️ Comments count towards your API limit. Disable for more posts.</small>
          </div>

          {searchType === 'subreddit' && (
            <div className="checkbox-group">
              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={includeCommunityInfo}
                  onChange={(e) => setIncludeCommunityInfo(e.target.checked)}
                />
                <span>📊 Include Community Info</span>
              </label>
              <small>Include subreddit statistics and community information</small>
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