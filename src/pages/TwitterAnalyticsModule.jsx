import { useState, useEffect } from 'react';
import TwitterSearch from '../components/TwitterSearch';
import TwitterResults from '../components/TwitterResults';
import TwitterResultsSeparated from '../components/TwitterResultsSeparated';
import TwitterDashboard from '../components/TwitterDashboard';
import TwitterSearchHistory from '../components/TwitterSearchHistory';
import { callTwitterApi, isDev } from '../utils/apiConfig';
import { loadTwitterSearchParams, saveTwitterSearchParams, clearTwitterSearchParams, saveTwitterResults, loadTwitterResults, clearTwitterResults } from '../utils/searchCache';
import { supabase } from '../lib/supabase';

// Helper function to aggregate analytics from separated search results
const aggregateSeparatedAnalytics = (results) => {
  const analytics = {
    total_tweets: 0,
    unique_tweets: 0,
    avg_sentiment: 0,
    sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
    engagement_stats: { total_engagement: 0, avg_likes: 0, avg_retweets: 0 },
    top_hashtags: [],
    top_influencers: []
  };
  
  let totalSentimentScore = 0;
  let sentimentCount = 0;
  let totalLikes = 0;
  let totalRetweets = 0;
  let tweetCount = 0;
  
  // Aggregate from each search type
  ['account', 'keyword', 'hashtag'].forEach(searchType => {
    const searchResult = results[searchType];
    if (searchResult && searchResult.analytics) {
      const searchAnalytics = searchResult.analytics;
      
      // Add tweet counts
      analytics.total_tweets += searchAnalytics.total_tweets || 0;
      
      // Aggregate sentiment
      if (searchAnalytics.avg_sentiment && searchAnalytics.total_tweets > 0) {
        totalSentimentScore += searchAnalytics.avg_sentiment * searchAnalytics.total_tweets;
        sentimentCount += searchAnalytics.total_tweets;
      }
      
      // Aggregate sentiment distribution
      if (searchAnalytics.sentiment_distribution) {
        analytics.sentiment_distribution.positive += searchAnalytics.sentiment_distribution.positive || 0;
        analytics.sentiment_distribution.negative += searchAnalytics.sentiment_distribution.negative || 0;
        analytics.sentiment_distribution.neutral += searchAnalytics.sentiment_distribution.neutral || 0;
      }
      
      // Aggregate engagement
      if (searchAnalytics.engagement_stats) {
        analytics.engagement_stats.total_engagement += searchAnalytics.engagement_stats.total_engagement || 0;
        if (searchAnalytics.engagement_stats.avg_likes && searchAnalytics.total_tweets > 0) {
          totalLikes += searchAnalytics.engagement_stats.avg_likes * searchAnalytics.total_tweets;
          tweetCount += searchAnalytics.total_tweets;
        }
        if (searchAnalytics.engagement_stats.avg_retweets && searchAnalytics.total_tweets > 0) {
          totalRetweets += searchAnalytics.engagement_stats.avg_retweets * searchAnalytics.total_tweets;
        }
      }
      
      // Combine hashtags (deduplicate)
      if (searchAnalytics.top_hashtags) {
        analytics.top_hashtags = [...new Set([...analytics.top_hashtags, ...searchAnalytics.top_hashtags])];
      }
      
      // Combine influencers (deduplicate)
      if (searchAnalytics.top_influencers) {
        analytics.top_influencers = [...new Set([...analytics.top_influencers, ...searchAnalytics.top_influencers])];
      }
    }
  });
  
  // Calculate averages
  if (sentimentCount > 0) {
    analytics.avg_sentiment = totalSentimentScore / sentimentCount;
  }
  
  if (tweetCount > 0) {
    analytics.engagement_stats.avg_likes = totalLikes / tweetCount;
    analytics.engagement_stats.avg_retweets = totalRetweets / tweetCount;
  }
  
  return analytics;
};

export default function TwitterAnalyticsModule({ user }) {
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchHistory, setSearchHistory] = useState([]);
  const [cachedParams, setCachedParams] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [rateLimitInfo, setRateLimitInfo] = useState(null);
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // Client-side database saving function (like SEO module)
  const saveTwitterSearchToDatabase = async (searchData, responseData) => {
    try {
      // Generate search_id (UUID) for this search session
      const searchId = crypto.randomUUID();
      
      // Generate user-friendly search description
      const searchDescription = generateSearchDescription(searchData);
      
      // Prepare the response data - handle both old and new formats
      let structuredResponse = responseData;
      
      // If it's the new separated format, keep the nested structure
      if (responseData.results) {
        structuredResponse = {
          searchType: 'separated',
          results: responseData.results,
          globalAnalytics: responseData.globalAnalytics,
          searchParams: responseData.searchParams,
          timestamp: responseData.timestamp
        };
      }
      
      // Extract analytics metrics from the response
      const globalAnalytics = responseData.globalAnalytics || {};
      let analytics = responseData.analytics || {};
      
      // For separated searches, aggregate analytics from individual search types
      if (responseData.results && !responseData.analytics) {
        analytics = aggregateSeparatedAnalytics(responseData.results);
      }
      
      // Calculate date range from tweets if available
      let dateRangeStart = null;
      let dateRangeEnd = null;
      
      if (responseData.results) {
        const allTweets = [];
        if (responseData.results.account?.tweets) allTweets.push(...responseData.results.account.tweets);
        if (responseData.results.keyword?.tweets) allTweets.push(...responseData.results.keyword.tweets);
        if (responseData.results.hashtag?.tweets) allTweets.push(...responseData.results.hashtag.tweets);
        
        if (allTweets.length > 0) {
          const dates = allTweets.map(t => new Date(t.created_at)).filter(d => !isNaN(d));
          if (dates.length > 0) {
            dateRangeStart = new Date(Math.min(...dates)).toISOString();
            dateRangeEnd = new Date(Math.max(...dates)).toISOString();
          }
        }
      }
      
      // Save to database using client-side Supabase
      const { data, error } = await supabase
        .from('twitter_analytics_sessions')
        .insert([
          {
            user_id: user?.id,
            search_id: searchId,
            keyword: searchData.keyword || null,
            hashtags: searchData.hashtags || [],
            account_username: searchData.accountUsername || null,
            search_description: searchDescription,
            action: searchData.action || 'separated-search',
            language: searchData.global ? 'global' : (searchData.language || null),
            sort_order: searchData.sortOrder || 'recent',
            include_mentions: searchData.includeMentions || false,
            global_search: searchData.global || false,
            search_limit: searchData.limit || 100,
            hashtag_mode: searchData.hashtagMode || 'manual',
            discovered_hashtags: searchData.discoveredHashtags || null,
            raw_response: structuredResponse,
            is_mock_data: responseData?.mock || false,
            completed: true,
            // New analytics columns - Fixed field mapping
            total_tweets: globalAnalytics.totalTweetsFetched || analytics.total_tweets || 0,
            unique_tweets: globalAnalytics.uniqueTweets || analytics.unique_tweets || 0,
            total_engagement: analytics.engagement_stats?.total_engagement || 0,
            avg_engagement_rate: analytics.engagement_stats?.avg_engagement_rate || analytics.avg_engagement_rate || 0,
            viral_potential: analytics.viral_potential || 0,
            avg_sentiment_score: analytics.avg_sentiment || globalAnalytics.overallSentiment || 0,
            positive_tweets: analytics.sentiment_distribution?.positive || 0,
            negative_tweets: analytics.sentiment_distribution?.negative || 0,
            neutral_tweets: analytics.sentiment_distribution?.neutral || 0,
            peak_hour: analytics.peak_hour || null,
            date_range_start: dateRangeStart,
            date_range_end: dateRangeEnd,
            top_influencers: analytics.top_influencers || null,
            top_hashtags: analytics.top_hashtags || null
          }
        ])
        .select();

      if (error) {
        console.error('❌ Database save error:', error);
        return null;
      }

      console.log('✅ Twitter search saved to database:', data[0]?.id);
      
      // Note: Individual tweets are stored in raw_response for now
      // Future enhancement: Move tweet extraction to backend with service role key
      console.log('✅ Session saved. Tweets are stored in raw_response field.');
      
      return data[0];
    } catch (error) {
      console.error('❌ Failed to save Twitter search:', error);
      return null;
    }
  };
  
  // Helper function to save individual tweets
  const saveIndividualTweets = async (sessionId, results) => {
    try {
      const tweetsToSave = [];
      
      // Collect tweets from all search types
      const searchTypes = [
        { type: 'account', data: results.account },
        { type: 'keyword', data: results.keyword },
        { type: 'hashtag', data: results.hashtag }
      ];
      
      for (const { type, data } of searchTypes) {
        if (data?.tweets && Array.isArray(data.tweets)) {
          for (const tweet of data.tweets) {
            tweetsToSave.push({
              session_id: sessionId,
              tweet_id: tweet.id,
              tweet_text: tweet.text,
              created_at: tweet.created_at,
              author_username: tweet.author?.username,
              author_name: tweet.author?.name,
              author_verified: tweet.author?.verified || false,
              author_followers: tweet.author?.followers || 0,
              author_profile_image: tweet.author?.profile_image,
              likes: tweet.metrics?.likes || 0,
              retweets: tweet.metrics?.retweets || 0,
              replies: tweet.replies || [], // FIXED: Store actual reply objects array, not count
              quotes: tweet.metrics?.quotes || 0,
              views: tweet.metrics?.views || 0,
              sentiment_label: tweet.sentiment?.label,
              sentiment_score: tweet.sentiment?.score,
              sentiment_confidence: tweet.sentiment?.confidence,
              hashtags: tweet.hashtags || [],
              mentions: tweet.mentions || [],
              urls: tweet.urls || [],
              media_type: tweet.media_type || null,
              tweet_url: tweet.url,
              search_type: type,
              matched_keywords: tweet.matched_keywords || []
            });
          }
        }
      }
      
      if (tweetsToSave.length > 0) {
        const { error } = await supabase
          .from('twitter_tweets')
          .insert(tweetsToSave);
          
        if (error) {
          console.error('❌ Failed to save individual tweets:', error);
        } else {
          console.log(`✅ Saved ${tweetsToSave.length} tweets to database`);
        }
      }
    } catch (error) {
      console.error('❌ Error saving tweets:', error);
    }
  };

  // Account-specific tweet saving function (via backend API to bypass RLS)
  const saveAccountTweetsToDatabase = async (sessionId, accountSpecificData) => {
    try {
      console.log('🎯 Frontend: Delegating account-specific saving to backend API', {
        hasAccountSpecific: !!accountSpecificData,
        accountSpecificType: typeof accountSpecificData,
        hasAccountData: !!(accountSpecificData?.accountData),
        hasFormattedTweets: !!(accountSpecificData?.formattedTweets),
        tweetCount: accountSpecificData?.formattedTweets?.length || 0,
        sessionId
      });

      if (!accountSpecificData || !accountSpecificData.accountData?.shouldSave) {
        console.log('⚠️ No account-specific data to save');
        return null;
      }

      const { accountData, formattedTweets, searchMetadata } = accountSpecificData;
      
      if (!formattedTweets || formattedTweets.length === 0) {
        console.log('⚠️ No tweets to save for account-specific analysis');
        return null;
      }

      // Prepare the request payload for backend API
      const requestPayload = {
        username: accountData.username,
        tweets: formattedTweets,
        searchParams: {
          sessionId,
          ...searchMetadata
        },
        accountMetadata: accountData.metadata || {
          username: accountData.username,
          display_name: formattedTweets[0]?.author?.name || null,
          followers_count: formattedTweets[0]?.author?.followers || 0,
          verified: formattedTweets[0]?.author?.verified || false,
          profile_image_url: formattedTweets[0]?.author?.profile_image || null
        }
      };

      console.log(`🌐 Calling backend save-account-specific API for @${accountData.username}`);
      
      // Call the backend API endpoint using existing callTwitterApi function
      const result = await callTwitterApi({
        action: 'save-account-specific',
        ...requestPayload
      });
      
      if (!result.success) {
        throw new Error(`Backend processing failed: ${result.error}`);
      }

      console.log(`✅ Backend successfully saved account-specific tweets:`, result.data);

      return {
        accountId: result.data.accountId,
        username: accountData.username,
        tweetsCount: result.data.tweetsCount,
        avgEngagement: result.data.avgEngagement,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Backend account-specific saving failed:', error);
      
      // Fallback: Log the issue but don't block the main search results
      console.log('⚠️ Account-specific data will not be saved to individual tweets table due to backend error');
      return null;
    }
  };

  // Helper function to generate search descriptions
  const generateSearchDescription = (searchData) => {
    if (!searchData) return 'Unknown search';
    
    const { keyword, hashtags, accountUsername, language, sortOrder, includeMentions, global, limit, hashtagMode } = searchData;
    
    let description = [];
    
    // Add account if present (for account analysis)
    if (accountUsername) {
      description.push(`@${accountUsername.replace(/^@/, '')}`);
      if (keyword || hashtags?.length > 0) {
        description.push('with');
      }
    }
    
    // Add search type - ensure we have something to display
    if (keyword && hashtags?.length > 0) {
      description.push(`"${keyword}" + ${hashtags.join(', ')}`);
    } else if (keyword) {
      description.push(`"${keyword}"`);
    } else if (hashtags?.length > 0) {
      description.push(`${hashtags.join(', ')}`);
    } else if (!accountUsername) {
      // Fallback if no keyword, hashtags, or account
      description.push('Twitter search');
    }
    
    // Add language info if specified
    if (language && !global && language !== '') {
      description.push(`in ${language.toUpperCase()}`);
    } else if (global) {
      description.push('globally');
    }
    
    // Add sort order info
    if (sortOrder === 'popular') {
      description.push('(popular)');
    } else {
      description.push('(recent)');
    }
    
    // Add mentions info
    if (includeMentions) {
      description.push('with replies');
    }
    
    return description.join(' ');
  };

  // Load cached search params and search history on component mount
  useEffect(() => {
    // Load cached search parameters
    const cached = loadTwitterSearchParams(user?.id || 'anonymous');
    if (cached) {
      setCachedParams(cached);
      setShowResults(true);
      
      // Also load cached results if they exist
      const cachedResults = loadTwitterResults(user?.id || 'anonymous');
      if (cachedResults) {
        setResults(cachedResults);
      }
    }

    // Load search history
    const savedHistory = localStorage.getItem('twitter_search_history');
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse search history:', e);
      }
    }
  }, [user]);

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
    setShowResults(true);

    try {
      if (isDev()) {
        console.log('🔍 Starting Twitter search:', searchData);
      }
      
      const requestData = {
        action: searchData.action,  // Fixed: use 'action' not 'type'
        keyword: searchData.keyword || '',
        accountUsername: searchData.accountUsername || '',  // Added for account analysis
        hashtags: searchData.hashtags || [],
        language: searchData.language || null,
        sortOrder: searchData.sortOrder || 'recent',
        includeMentions: searchData.includeMentions || false,
        global: searchData.global || false,
        limit: searchData.limit || 25,
        user_id: user?.id || 'anonymous'
      };

      console.log('🐦 DEBUG: Request data being sent:', requestData);
      console.log('🐦 DEBUG: Twitter API URL:', '/api/twitter-analytics');
      const data = await callTwitterApi(requestData);
      
      setResults(data);
      saveToHistory(searchData);
      
      // Save search params and results for persistence
      saveTwitterSearchParams(user?.id || 'anonymous', searchData);
      saveTwitterResults(user?.id || 'anonymous', data);
      setCachedParams(searchData);
      
      // Save to database (client-side)
      if (user?.id) {
        try {
          const sessionData = await saveTwitterSearchToDatabase(searchData, data);
          
          // 🔍 DEBUG: Check what we received from backend
          console.log('🔍 Backend response structure:', {
            hasAccountUsername: !!searchData.accountUsername,
            accountUsername: searchData.accountUsername,
            hasAccountSpecific: !!data.accountSpecific,
            dataKeys: Object.keys(data),
            accountSpecificStructure: data.accountSpecific || 'MISSING',
            sessionId: sessionData?.id,
            resultsStructure: {
              hasResults: !!data.results,
              hasAccount: !!(data.results?.account),
              accountTweetsCount: data.results?.account?.tweets?.length || 0,
              firstAccountTweet: data.results?.account?.tweets?.[0] || 'NO_TWEETS'
            }
          });
          
          // NEW: Save account-specific tweets if this is an account search
          if (searchData.accountUsername && sessionData?.id) {
            if (data.accountSpecific) {
              // Primary path: Use backend-provided accountSpecific data
              console.log(`🎯 Account search detected for @${searchData.accountUsername} - saving account-specific data from backend`);
              
              const accountSaveResult = await saveAccountTweetsToDatabase(sessionData.id, data.accountSpecific);
              
              if (accountSaveResult) {
                console.log(`✅ Account-specific data saved:`, {
                  account: accountSaveResult.username,
                  tweets: accountSaveResult.tweetsCount,
                  engagement: accountSaveResult.avgEngagement
                });
              } else {
                console.warn('⚠️ Account-specific saving failed, but general search was saved');
              }
            } else if (data.results?.account?.tweets?.length > 0) {
              // Fallback path: Create accountSpecific structure from results
              console.log(`🔄 Backend missing accountSpecific field - creating from results.account.tweets for @${searchData.accountUsername}`);
              
              const fallbackAccountSpecific = {
                accountData: {
                  username: searchData.accountUsername.replace(/^@/, ''),
                  shouldSave: true,
                  tweetCount: data.results.account.tweets.length,
                  searchTimestamp: new Date().toISOString()
                },
                formattedTweets: data.results.account.tweets,
                searchMetadata: {
                  searchType: 'account-specific-fallback',
                  filters: { keyword: searchData.keyword, hashtags: searchData.hashtags },
                  timestamp: new Date().toISOString()
                }
              };
              
              const accountSaveResult = await saveAccountTweetsToDatabase(sessionData.id, fallbackAccountSpecific);
              
              if (accountSaveResult) {
                console.log(`✅ Account-specific data saved via fallback:`, {
                  account: accountSaveResult.username,
                  tweets: accountSaveResult.tweetsCount,
                  engagement: accountSaveResult.avgEngagement
                });
              } else {
                console.warn('⚠️ Account-specific fallback saving failed');
              }
            } else {
              console.log(`ℹ️ Account search for @${searchData.accountUsername} found no tweets to save`);
            }
          }
          
          // Trigger search history refresh
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
      
      // Try to parse JSON error response
      let errorData = null;
      try {
        // If it's a fetch response, try to get JSON
        if (err.response) {
          errorData = await err.response.json();
        }
      } catch (parseError) {
        // Fallback to message parsing
      }
      
      // Check for rate limit error
      const isRateLimit = err.message.includes('429') || 
                         err.message.includes('rate limit') || 
                         err.message.includes('Too Many Requests') ||
                         errorData?.code === 429;
      
      if (isRateLimit) {
        // Extract retry-after time from structured response or message
        let retryAfterSeconds = 60; // Default
        
        if (errorData?.retryAfter) {
          retryAfterSeconds = errorData.retryAfter;
        } else {
          const retryAfterMatch = err.message.match(/(?:retry.after|wait)[:\s]+(\d+)/i);
          if (retryAfterMatch) {
            retryAfterSeconds = parseInt(retryAfterMatch[1]);
          }
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
      
      // Other error messages
      let errorMessage = 'Search failed. Please try again.';
      
      if (err.message.includes('fetch')) {
        errorMessage = 'Unable to connect to server. Please check your connection.';
      } else if (err.message.includes('Invalid')) {
        errorMessage = err.message; // Show validation errors directly
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
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
    setResults(null);
    setError(null);
    setShowResults(false);
    setCachedParams(null);
    setRateLimitInfo(null);
    clearTwitterSearchParams(user?.id || 'anonymous');
    clearTwitterResults(user?.id || 'anonymous');
  };

  // Clear results only
  const clearResults = () => {
    setResults(null);
    setError(null);
  };

  // Load from history and populate form
  const loadFromHistory = (searchData) => {
    // Clear current results and populate form with historical search data
    setResults(null);
    setError(null);
    setShowResults(false);
    setRateLimitInfo(null);
    
    // Save search params for form auto-fill
    setCachedParams(searchData);
    
    // Save to local storage for persistence
    saveTwitterSearchParams(user?.id || 'anonymous', searchData);
    
    // Automatically trigger the search
    handleSearch(searchData);
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
            <p>Analyzing Twitter data...</p>
          </div>
        )}
      </div>

      {/* Twitter Search History Component - Outside container for 750px width */}
      {user && (
        <div className="history-container">
          <TwitterSearchHistory 
            user={user}
            refreshTrigger={historyRefreshTrigger}
            onLoadHistory={loadFromHistory}
          />
        </div>
      )}

      {/* Results Display */}
      {results && !loading && (
        <div className="results-wrapper">
          {/* Check if it's the new separated structure */}
          {results.results ? (
            // New separated search results
            <TwitterResultsSeparated 
              data={results.results}
              globalAnalytics={results.globalAnalytics}
              analytics={null}
            />
          ) : (
            // Legacy combined search results
            <>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
