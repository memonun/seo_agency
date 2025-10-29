import { useState, useEffect } from 'react';
import RedditSearch from '../components/RedditSearch';
import RedditResults from '../components/RedditResults';
import RedditDashboard from '../components/RedditDashboard';
import RedditSearchHistory from '../components/RedditSearchHistory';
import { callRedditApi, isDev } from '../utils/apiConfig';
import { 
  loadRedditSearchParams, 
  saveRedditSearchParams, 
  clearRedditSearchParams, 
  saveRedditResults, 
  loadRedditResults, 
  clearRedditResults,
  SEARCH_STATES,
  saveRedditSearchProgress,
  loadRedditSearchProgress,
  updateRedditSearchProgress,
  clearRedditSearchProgress,
  hasOngoingRedditSearch,
  getRedditSearchStatus
} from '../utils/searchCache';
import { supabase } from '../lib/supabase';
import '../styles/RedditModule.css';

export default function RedditModule({ user }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [cachedParams, setCachedParams] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [searchProgress, setSearchProgress] = useState(null);
  const [isResuming, setIsResuming] = useState(false);
  
  // AbortController for cancelling requests
  const [abortController, setAbortController] = useState(null);

  // Client-side database saving function
  const saveRedditSearchToDatabase = async (searchData, responseData) => {
    try {
      const searchId = crypto.randomUUID();
      const searchDescription = generateSearchDescription(searchData);
      
      let structuredResponse = responseData;
      
      // Extract analytics metrics from the response
      const analytics = responseData.analytics || {};
      
      // Calculate date range from posts if available
      let dateRangeStart = null;
      let dateRangeEnd = null;
      
      if (responseData.data && responseData.data.length > 0) {
        const dates = responseData.data
          .map(post => new Date(post.created_utc * 1000))
          .filter(d => !isNaN(d));
        
        if (dates.length > 0) {
          dateRangeStart = new Date(Math.min(...dates)).toISOString();
          dateRangeEnd = new Date(Math.max(...dates)).toISOString();
        }
      }
      
      // Save to database using client-side Supabase
      const { data, error } = await supabase
        .from('reddit_analytics_sessions')
        .insert([
          {
            user_id: user?.id,
            search_id: searchId,
            search_query: searchData.query || null,
            search_type: searchData.searchType || 'subreddit',
            subreddit: searchData.subreddit || null,
            username: searchData.username || null,
            search_description: searchDescription,
            sort_order: searchData.sortOrder || 'hot',
            time_range: searchData.timeRange || null,
            max_items: searchData.maxItems || 25,
            include_comments: searchData.includeComments || false,
            include_community_info: searchData.includeCommunityInfo || true,
            raw_response: structuredResponse,
            completed: true,
            // Analytics columns
            total_posts: analytics.totalPosts || 0,
            total_comments: analytics.totalComments || 0,
            total_score: analytics.totalScore || 0,
            avg_score: analytics.avgScore || 0,
            avg_comments_per_post: analytics.avgCommentsPerPost || 0,
            top_post_score: analytics.topPostScore || 0,
            viral_potential: analytics.viralPotential || 0,
            avg_sentiment_score: analytics.avgSentiment || 0,
            positive_posts: analytics.sentimentBreakdown?.positive || 0,
            negative_posts: analytics.sentimentBreakdown?.negative || 0,
            neutral_posts: analytics.sentimentBreakdown?.neutral || 0,
            peak_hour: analytics.peakHour || null,
            date_range_start: dateRangeStart,
            date_range_end: dateRangeEnd,
            top_authors: analytics.topAuthors || null,
            top_subreddits: analytics.topSubreddits || null
          }
        ])
        .select();

      if (error) {
        console.error('❌ Database save error:', error);
        return null;
      }

      console.log('✅ Reddit search saved to database:', data[0]?.id);
      
      // Save individual posts if session was saved successfully
      if (data[0]?.id && responseData.data) {
        await saveIndividualPosts(data[0].id, responseData.data);
      }
      
      return data[0];
    } catch (error) {
      console.error('❌ Failed to save Reddit search:', error);
      return null;
    }
  };
  
  // Helper function to save individual posts
  const saveIndividualPosts = async (sessionId, posts) => {
    try {
      const postsToSave = posts.map(post => ({
        session_id: sessionId,
        post_id: post.id,
        title: post.title,
        content: post.selftext || null,
        author: post.author,
        subreddit: post.subreddit,
        score: post.score || 0,
        upvote_ratio: post.upvote_ratio || 0,
        num_comments: post.num_comments || 0,
        created_utc: new Date(post.created_utc * 1000).toISOString(),
        url: post.url,
        permalink: post.permalink,
        is_video: post.is_video || false,
        is_original_content: post.is_original_content || false,
        over_18: post.over_18 || false,
        spoiler: post.spoiler || false,
        locked: post.locked || false,
        gilded: post.gilded || 0,
        total_awards_received: post.total_awards_received || 0,
        sentiment_label: post.sentiment?.label || null,
        sentiment_score: post.sentiment?.score || null,
        post_hint: post.post_hint || null,
        domain: post.domain || null
      }));
      
      if (postsToSave.length > 0) {
        const { error } = await supabase
          .from('reddit_posts')
          .insert(postsToSave);
          
        if (error) {
          console.error('❌ Failed to save individual posts:', error);
        } else {
          console.log(`✅ Saved ${postsToSave.length} posts to database`);
        }
      }
    } catch (error) {
      console.error('❌ Error saving posts:', error);
    }
  };

  // Helper function to generate search descriptions
  const generateSearchDescription = (searchData) => {
    if (!searchData) return 'Unknown search';
    
    const { searchType, query, subreddit, username, sortOrder, maxItems } = searchData;
    
    let description = [];
    
    switch (searchType) {
      case 'subreddit':
        description.push(`r/${subreddit}`);
        break;
      case 'search':
        description.push(`"${query}"`);
        break;
      case 'user':
        description.push(`u/${username}`);
        break;
      default:
        description.push('Reddit search');
    }
    
    // Add sort info
    if (sortOrder && sortOrder !== 'hot') {
      description.push(`(${sortOrder})`);
    }
    
    // Add item limit
    if (maxItems && maxItems !== 25) {
      description.push(`${maxItems} items`);
    }
    
    return description.join(' ');
  };

  // Normalize cached data to ensure compatibility with current system
  const normalizeCachedData = (cachedData) => {
    try {
      if (!cachedData || !cachedData.data || !Array.isArray(cachedData.data)) {
        return cachedData; // Return as-is if structure is invalid
      }
      
      // Create a deep copy to avoid mutating the original
      const normalized = JSON.parse(JSON.stringify(cachedData));
      
      // Normalize individual posts to handle field name changes
      normalized.data = normalized.data.map(post => {
        const normalizedPost = { ...post };
        
        // Handle field name mapping for backwards compatibility
        if (post.upVotes !== undefined && post.score === undefined) {
          normalizedPost.score = post.upVotes;
        }
        if (post.numberOfComments !== undefined && post.num_comments === undefined) {
          normalizedPost.num_comments = post.numberOfComments;
        }
        if (post.username !== undefined && post.author === undefined) {
          normalizedPost.author = post.username;
        }
        if (post.parsedCommunityName !== undefined && post.subreddit === undefined) {
          normalizedPost.subreddit = post.parsedCommunityName;
        }
        
        return normalizedPost;
      });
      
      // Ensure analytics object has all required fields with default values
      if (normalized.analytics) {
        const analytics = normalized.analytics;
        analytics.totalPosts = analytics.totalPosts || 0;
        analytics.totalComments = analytics.totalComments || 0;
        analytics.totalScore = analytics.totalScore || 0;
        analytics.avgScore = analytics.avgScore || 0;
        analytics.avgCommentsPerPost = analytics.avgCommentsPerPost || 0;
        analytics.topPostScore = analytics.topPostScore || 0;
        analytics.viralPotential = analytics.viralPotential || 0;
        analytics.avgSentiment = analytics.avgSentiment || 0;
        
        // Ensure nested objects exist
        analytics.sentimentBreakdown = analytics.sentimentBreakdown || {
          positive: 0,
          negative: 0,
          neutral: 0
        };
        analytics.topAuthors = analytics.topAuthors || [];
        analytics.topSubreddits = analytics.topSubreddits || [];
      }
      
      return normalized;
    } catch (error) {
      console.error('🚫 Data normalization error:', error);
      return cachedData; // Return original if normalization fails
    }
  };

  // Validate cached results data structure
  const validateCachedResults = (cachedData) => {
    try {
      if (!cachedData || typeof cachedData !== 'object') {
        return { isValid: false, reason: 'No data or invalid type' };
      }
      
      // Check required top-level properties
      const requiredProps = ['data', 'analytics', 'searchQuery', 'searchType', 'timestamp'];
      for (const prop of requiredProps) {
        if (!(prop in cachedData)) {
          return { isValid: false, reason: `Missing required property: ${prop}` };
        }
      }
      
      // Validate data array
      if (!Array.isArray(cachedData.data)) {
        return { isValid: false, reason: 'Data is not an array' };
      }
      
      // Validate analytics object
      const analytics = cachedData.analytics;
      if (!analytics || typeof analytics !== 'object') {
        return { isValid: false, reason: 'Analytics missing or invalid' };
      }
      
      // Check for required analytics properties (more lenient check)
      const requiredAnalytics = ['totalPosts', 'totalComments', 'totalScore', 'avgScore'];
      for (const prop of requiredAnalytics) {
        if (analytics[prop] === undefined) {
          return { isValid: false, reason: `Analytics missing property: ${prop}` };
        }
      }
      
      // Validate data structure if posts exist
      if (cachedData.data.length > 0) {
        const samplePost = cachedData.data[0];
        const requiredPostProps = ['id', 'title'];
        for (const prop of requiredPostProps) {
          if (!(prop in samplePost)) {
            return { isValid: false, reason: `Post missing required property: ${prop}` };
          }
        }
      }
      
      return { isValid: true };
    } catch (error) {
      return { isValid: false, reason: `Validation error: ${error.message}` };
    }
  };

  // Load cached search params and check for ongoing searches on component mount
  useEffect(() => {
    const userId = user?.id || 'anonymous';
    
    // Check for ongoing search first
    const progress = loadRedditSearchProgress(userId);
    if (progress && progress.state === SEARCH_STATES.SEARCHING) {
      // Found an ongoing search - restore state and show resuming message
      setIsResuming(true);
      setSearchProgress(progress);
      setCachedParams(progress.searchData);
      setLoading(true);
      setShowResults(true);
      setError('Search was interrupted. Checking for results...');
      
      // Try to get results or restart search after a brief delay
      setTimeout(() => {
        resumeOrRestartSearch(progress);
      }, 2000);
    } else {
      // No ongoing search - check for recent cached data to restore
      const RECENT_CACHE_THRESHOLD = 60 * 60 * 1000; // 1 hour
      
      try {
        // Check cached search parameters
        const cachedParams = loadRedditSearchParams(userId);
        const cachedResults = loadRedditResults(userId);
        
        // Only restore cache if it's recent (within 1 hour)
        const shouldRestoreParams = cachedParams && 
          cachedParams.timestamp && 
          (Date.now() - cachedParams.timestamp) < RECENT_CACHE_THRESHOLD;
        
        // Validate and normalize cached results before restoration
        let shouldRestoreResults = false;
        let validationResult = null;
        let normalizedResults = null;
        
        if (cachedResults && cachedResults.timestamp && 
            (Date.now() - cachedResults.timestamp) < RECENT_CACHE_THRESHOLD) {
          
          // First normalize the data to handle field name changes
          normalizedResults = normalizeCachedData(cachedResults);
          
          // Then validate the normalized data
          validationResult = validateCachedResults(normalizedResults);
          shouldRestoreResults = validationResult.isValid;
          
          if (!validationResult.isValid) {
            console.warn('🚫 Cached results failed validation:', validationResult.reason);
            // Clear corrupted cache
            clearRedditResults(userId);
          } else {
            console.log('✅ Cached results normalized and validated successfully');
          }
        }
        
        // Restore search parameters (they're simpler and safer)
        if (shouldRestoreParams) {
          setCachedParams(cachedParams);
          console.log('✅ Restored recent search parameters:', cachedParams.searchType || 'unknown');
        } else {
          clearRedditSearchParams(userId);
          setCachedParams(null);
        }
        
        // Restore results only if validation passed
        if (shouldRestoreResults && validationResult.isValid && normalizedResults) {
          // Add a small delay to prevent state conflicts with ongoing operations
          setTimeout(() => {
            setResults(normalizedResults);
            setShowResults(true);
            console.log('✅ Restored recent search results (normalized and validated)');
          }, 100);
        } else {
          clearRedditResults(userId);
          setResults(null);
          setShowResults(false);
        }
        
      } catch (error) {
        console.error('🚫 Cache restoration error:', error);
        // Clear all cache on error
        clearRedditSearchParams(userId);
        clearRedditResults(userId);
        setCachedParams(null);
        setResults(null);
        setShowResults(false);
      }
      
      // Always clear stale search progress
      clearRedditSearchProgress(userId);
    }
  }, [user]);

  // Resume or restart search logic
  const resumeOrRestartSearch = async (progress) => {
    const userId = user?.id || 'anonymous';
    
    try {
      // Check if we have recent results
      const recentResults = loadRedditResults(userId);
      if (recentResults && (Date.now() - recentResults.timestamp) < 5 * 60 * 1000) {
        // Results are less than 5 minutes old - use them
        setResults(recentResults);
        setLoading(false);
        setError(null);
        setIsResuming(false);
        updateRedditSearchProgress(userId, { state: SEARCH_STATES.COMPLETED });
        return;
      }
      
      // No recent results - restart the search
      setError('Restarting search...');
      await handleSearch(progress.searchData, true); // true = isResume
    } catch (err) {
      setError('Failed to resume search. Please try again.');
      setLoading(false);
      setIsResuming(false);
      clearRedditSearchProgress(userId);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [abortController]);

  // Navigation warning for active searches
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (loading && !isResuming) {
        event.preventDefault();
        event.returnValue = 'Search in progress. Are you sure you want to leave?';
        return 'Search in progress. Are you sure you want to leave?';
      }
    };

    const handlePopState = (event) => {
      if (loading && !isResuming) {
        const shouldLeave = window.confirm('Search in progress. Are you sure you want to leave this page?');
        if (!shouldLeave) {
          // Prevent navigation
          window.history.pushState(null, '', window.location.pathname);
        }
      }
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);

    // Cleanup event listeners
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [loading, isResuming]);

  // Note: Search history is now handled entirely by the database via RedditSearchHistory component

  // Handle search request with progress tracking and abort support
  const handleSearch = async (searchData, isResume = false) => {
    const userId = user?.id || 'anonymous';
    
    // Cancel any existing search
    if (abortController) {
      abortController.abort();
    }
    
    // Create new AbortController
    const newController = new AbortController();
    setAbortController(newController);
    
    setLoading(true);
    setError(null);
    if (!isResume) {
      setResults(null);
      setIsResuming(false);
    }
    setShowResults(true);

    // Clear any cached results to prevent conflicts with fresh search
    clearRedditResults(userId);

    // Save search progress
    const searchId = crypto.randomUUID();
    saveRedditSearchProgress(userId, {
      searchId,
      searchData,
      state: SEARCH_STATES.SEARCHING,
      startTime: Date.now()
    });

    try {
      if (isDev()) {
        console.log('🔍 Starting Reddit search:', searchData, isResume ? '(RESUME)' : '(NEW)');
      }
      
      const requestData = {
        action: 'search',
        searchType: searchData.searchType,
        query: searchData.query || '',
        subreddit: searchData.subreddit || '',
        username: searchData.username || '',
        sortOrder: searchData.sortOrder || 'hot',
        timeRange: searchData.timeRange || null,
        maxItems: searchData.maxItems || 25,
        includeComments: searchData.includeComments || false,
        includeCommunityInfo: searchData.includeCommunityInfo || true,
        user_id: userId
      };

      console.log('🔍 DEBUG: Request data being sent:', requestData);
      const data = await callRedditApi(requestData, newController.signal);
      
      // Check if request was aborted
      if (newController.signal.aborted) {
        updateRedditSearchProgress(userId, { state: SEARCH_STATES.CANCELLED });
        return;
      }
      
      setResults(data);
      setIsResuming(false);
      
      // Save search params for form persistence
      saveRedditSearchParams(userId, searchData);
      setCachedParams(searchData);
      
      // Save results to cache
      saveRedditResults(userId, data);
      
      // Update progress state
      updateRedditSearchProgress(userId, { 
        state: SEARCH_STATES.COMPLETED,
        completedAt: Date.now(),
        resultCount: data?.data?.length || 0
      });
      
      // Save to database (client-side)
      if (user?.id) {
        try {
          await saveRedditSearchToDatabase(searchData, data);
          setHistoryRefreshTrigger(prev => prev + 1);
        } catch (dbError) {
          console.warn('Database save failed (non-critical):', dbError);
        }
      }
      
      if (isDev()) {
        console.log('✅ Search completed:', data);
      }
      
    } catch (err) {
      console.error('❌ Search error:', err);
      
      // Handle cancellation
      if (err.message === 'Request was cancelled' || newController.signal.aborted) {
        updateRedditSearchProgress(userId, { state: SEARCH_STATES.CANCELLED });
        setLoading(false);
        return;
      }
      
      // Update progress state for error
      updateRedditSearchProgress(userId, { 
        state: SEARCH_STATES.ERROR,
        error: err.message,
        errorAt: Date.now()
      });
      
      // Check for rate limit error
      const isRateLimit = err.message.includes('429') || 
                         err.message.includes('rate limit') || 
                         err.message.includes('Too Many Requests');
      
      if (isRateLimit) {
        let retryAfterSeconds = 60;
        const retryAfterMatch = err.message.match(/(?:retry.after|wait)[:\s]+(\d+)/i);
        if (retryAfterMatch) {
          retryAfterSeconds = parseInt(retryAfterMatch[1]);
        }
        
        const resetTime = Date.now() + (retryAfterSeconds * 1000);
        setRateLimitInfo({
          resetTime,
          timeLeft: retryAfterSeconds * 1000,
          retryAfterSeconds
        });
        
        setError(`Rate limit exceeded. Please wait ${retryAfterSeconds} seconds before searching again.`);
        return;
      }
      
      let errorMessage = 'Search failed. Please try again.';
      
      if (err.message.includes('fetch')) {
        errorMessage = 'Unable to connect to server. Please check your connection.';
      } else if (err.message.includes('Invalid')) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setIsResuming(false);
    } finally {
      setLoading(false);
      setAbortController(null);
    }
  };

  // Rate limit countdown effect
  useEffect(() => {
    if (rateLimitInfo && rateLimitInfo.resetTime > Date.now()) {
      const interval = setInterval(() => {
        const timeLeft = rateLimitInfo.resetTime - Date.now();
        if (timeLeft <= 0) {
          setRateLimitInfo(null);
          clearInterval(interval);
        } else {
          setRateLimitInfo(prev => ({ ...prev, timeLeft }));
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [rateLimitInfo]);

  // Clear results and start new search
  const handleNewSearch = () => {
    const userId = user?.id || 'anonymous';
    
    // Abort any ongoing search
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    
    setResults(null);
    setError(null);
    setShowResults(false);
    setCachedParams(null);
    setRateLimitInfo(null);
    setIsResuming(false);
    setSearchProgress(null);
    
    clearRedditSearchParams(userId);
    clearRedditResults(userId);
    clearRedditSearchProgress(userId);
  };

  // Clear results only
  const clearResults = () => {
    setResults(null);
    setError(null);
  };

  // Load from history and populate form
  const loadFromHistory = (searchData) => {
    setResults(null);
    setError(null);
    setShowResults(false);
    setRateLimitInfo(null);
    
    setCachedParams(searchData);
    saveRedditSearchParams(user?.id || 'anonymous', searchData);
    
    handleSearch(searchData);
  };

  return (
    <div className="module-page">
      <div className="module-header reddit-module-header">
        <h1>
          {/* Reddit Logo SVG */}
          <svg 
            width="26" 
            height="26" 
            viewBox="0 0 24 24" 
            fill="#FF4500"
            aria-label="Reddit Logo"
          >
            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.526-.73a.326.326 0 0 0-.218-.095z"/>
          </svg>
          Reddit Analytics
        </h1>
        <p className="module-description">
          Analyze Reddit posts, subreddits, and user activity with detailed insights
        </p>
      </div>

      <div className="reddit-main-container">
        {/* Left side: Search form and notifications */}
        <div className="reddit-search-section">
          <RedditSearch 
            onSearch={handleSearch}
            loading={loading}
            initialValues={cachedParams}
            showNewSearchButton={showResults && cachedParams}
            onNewSearch={handleNewSearch}
          />

          {/* Rate limit notification */}
          {rateLimitInfo && rateLimitInfo.timeLeft > 0 && (
            <div className="message warning" style={{
              background: '#fff3cd',
              border: '1px solid #ffeaa7',
              color: '#856404',
              padding: '16px',
              borderRadius: '8px',
              margin: '16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              </svg>
              <div>
                <strong>Rate limit reached</strong>
                <br />
                Please wait {Math.ceil(rateLimitInfo.timeLeft / 1000)} seconds before making another search.
              </div>
            </div>
          )}

          {/* Error message display */}
          {error && !rateLimitInfo && (
            <div className="message error">
              {error}
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              {isResuming ? (
                <div>
                  <p><strong>Resuming Search</strong></p>
                  <p>Checking for results from previous search...</p>
                </div>
              ) : (
                <p>Analyzing Reddit data...</p>
              )}
            </div>
          )}

          {/* Search Progress Indicator */}
          {searchProgress && searchProgress.state === SEARCH_STATES.SEARCHING && (
            <div className="search-progress-indicator" style={{
              background: '#e3f2fd',
              border: '1px solid #2196f3',
              borderRadius: '8px',
              padding: '12px',
              margin: '16px 0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div className="loading-spinner small"></div>
              <div>
                <strong>Search Active</strong>
                <br />
                <small>
                  Started {new Date(searchProgress.startTime).toLocaleTimeString()}
                  {searchProgress.searchData && (
                    ` • ${searchProgress.searchData.searchType === 'subreddit' ? `r/${searchProgress.searchData.subreddit}` : 
                        searchProgress.searchData.searchType === 'search' ? `"${searchProgress.searchData.query}"` :
                        `u/${searchProgress.searchData.username}`}`
                  )}
                </small>
              </div>
            </div>
          )}
        </div>

        {/* Right side: Search History Sidebar */}
        {user && (
          <div className="reddit-history-sidebar">
            <RedditSearchHistory 
              user={user}
              refreshTrigger={historyRefreshTrigger}
              onLoadHistory={loadFromHistory}
            />
          </div>
        )}
      </div>

      {/* Results Display */}
      {results && !loading && (
        <div className="results-wrapper">
          <RedditDashboard 
            analytics={results.analytics} 
            searchQuery={results.searchQuery}
            searchType={results.searchType}
            mock={results.mock}
          />
          
          <RedditResults 
            data={results.data} 
            analytics={results.analytics}
            onClear={clearResults}
            searchQuery={results.searchQuery}
            searchType={results.searchType}
          />
        </div>
      )}
    </div>
  );
}