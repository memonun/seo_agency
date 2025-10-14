import { useState, useEffect } from 'react';
import TwitterSearch from '../components/TwitterSearch';
import TwitterResults from '../components/TwitterResults';
import TwitterDashboard from '../components/TwitterDashboard';
import { callTwitterApi, isDev } from '../utils/apiConfig';

export default function TwitterAnalyticsModule({ user }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);

  // Load search history from localStorage on component mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('twitter_search_history');
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse search history:', e);
      }
    }
  }, []);

  // Save search to history
  const saveToHistory = (searchData) => {
    const newHistory = [
      {
        id: Date.now(),
        ...searchData,
        timestamp: new Date().toISOString()
      },
      ...searchHistory.slice(0, 9) // Keep last 10 searches
    ];
    setSearchHistory(newHistory);
    localStorage.setItem('twitter_search_history', JSON.stringify(newHistory));
  };

  // Handle search request
  const handleSearch = async (searchData) => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      if (isDev()) {
        console.log('🔍 Starting Twitter search:', searchData);
      }
      
      const requestData = {
        action: searchData.type,
        keyword: searchData.keyword || '',
        hashtags: searchData.hashtags || [],
        location: searchData.location || null,
        sortOrder: searchData.sortOrder || 'recent',
        includeMentions: searchData.includeMentions || false,
        global: searchData.global || false,
        limit: searchData.limit || 25,
        user_id: user?.id || 'anonymous'
      };

      const data = await callTwitterApi(requestData);
      
      setResults(data);
      saveToHistory(searchData);
      
      if (isDev()) {
        console.log('✅ Search completed:', data);
      }
      
    } catch (err) {
      console.error('❌ Search error:', err);
      
      // User-friendly error messages
      let errorMessage = 'Search failed. Please try again.';
      
      if (err.message.includes('fetch')) {
        errorMessage = 'Unable to connect to server. Please check your connection.';
      } else if (err.message.includes('rate limit')) {
        errorMessage = 'Rate limit exceeded. Please wait a moment before searching again.';
      } else if (err.message.includes('Invalid')) {
        errorMessage = err.message; // Show validation errors directly
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Clear results
  const clearResults = () => {
    setResults(null);
    setError(null);
  };

  // Load from history
  const loadFromHistory = (historyItem) => {
    // Note: We don't automatically trigger search, just populate the form
  };

  return (
    <div className="module-page">
      <div className="module-header" style={{ 
        borderBottom: '2px solid #1DA1F2', 
        paddingBottom: '15px',
        marginBottom: '20px'
      }}>
        <h1 style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '12px',
          margin: '0 0 10px 0'
        }}>
          {/* Twitter Logo SVG */}
          <svg 
            width="26" 
            height="26" 
            viewBox="0 0 24 24" 
            fill="#1DA1F2"
            aria-label="Twitter Logo"
          >
            <path d="M23.643 4.937c-.835.37-1.732.62-2.675.733.962-.576 1.7-1.49 2.048-2.578-.9.534-1.897.922-2.958 1.13-.85-.904-2.06-1.47-3.4-1.47-2.572 0-4.658 2.086-4.658 4.66 0 .364.042.718.12 1.06-3.873-.195-7.304-2.05-9.602-4.868-.4.69-.63 1.49-.63 2.342 0 1.616.823 3.043 2.072 3.878-.764-.025-1.482-.234-2.11-.583v.06c0 2.257 1.605 4.14 3.737 4.568-.392.106-.803.162-1.227.162-.3 0-.593-.028-.877-.082.593 1.85 2.313 3.198 4.352 3.234-1.595 1.25-3.604 1.995-5.786 1.995-.376 0-.747-.022-1.112-.065 2.062 1.323 4.51 2.093 7.14 2.093 8.57 0 13.255-7.098 13.255-13.254 0-.2-.005-.402-.014-.602.91-.658 1.7-1.477 2.323-2.41z"/>
          </svg>
          Twitter Analytics
        </h1>
        <p className="module-description">
          Keyword search, hashtag analytics, and sentiment analysis for Twitter/X
        </p>
      </div>

      <div className="container">
        <TwitterSearch 
          onSearch={handleSearch}
          loading={loading}
          searchHistory={searchHistory}
          onLoadHistory={loadFromHistory}
        />

        {/* Message display */}
        {error && (
          <div className="message error">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Analyzing Twitter data...</p>
          </div>
        )}
      </div>

      {/* Results Display */}
      {results && !loading && (
        <div className="results-wrapper">
          <TwitterDashboard 
            analytics={results.analytics} 
            query={results.query}
            mock={results.mock}
          />
          
          <TwitterResults 
            data={results.data} 
            analytics={results.analytics}
            onClear={clearResults}
            searchQuery={results.query}
          />
        </div>
      )}
    </div>
  );
}
