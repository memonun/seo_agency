// Vercel Serverless Function
// Twitter Analytics using GAME SDK Twitter Plugin
// Handles keyword search, hashtag analysis, and sentiment analysis

import { TwitterApi } from '@virtuals-protocol/game-twitter-node';

// Rate limiting tracker
const rateLimiter = {
  requests: [],
  limit: 40,
  window: 5 * 60 * 1000, // 5 minutes
  
  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.window);
    
    if (this.requests.length >= this.limit) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  },
  
  getTimeUntilReset() {
    if (this.requests.length === 0) return 0;
    const oldest = Math.min(...this.requests);
    return Math.max(0, this.window - (Date.now() - oldest));
  }
};

// Initialize GAME SDK Twitter client
const getTwitterClient = () => {
  const accessToken = process.env.GAME_TWITTER_ACCESS_TOKEN;
  
  if (!accessToken) {
    throw new Error('GAME_TWITTER_ACCESS_TOKEN not found in environment');
  }
  
  if (!accessToken.startsWith('apx-')) {
    throw new Error('Invalid token format. GAME tokens must start with "apx-"');
  }
  
  try {
    // CRITICAL: Use gameTwitterAccessToken parameter (from ERROR_DOCUMENTATION.md)
    const client = new TwitterApi({
      gameTwitterAccessToken: accessToken
    });
    return client;
  } catch (error) {
    throw new Error(`Failed to initialize GAME Twitter client: ${error.message}`);
  }
};

// Database storage removed - results are now exported as downloadable JSON files

// Mock data generator for development
const generateMockTweets = (query, limit = 10) => {
  const mockSentiments = ['positive', 'negative', 'neutral'];
  const mockUsers = ['user1', 'user2', 'user3', 'influencer1', 'expert_user'];
  
  return Array(limit).fill(null).map((_, i) => ({
    id: `mock_${Date.now()}_${i}`,
    text: `Mock tweet about ${query} - this is example content #${i} #${query.replace(/\s+/g, '')}`,
    author: {
      username: mockUsers[i % mockUsers.length],
      name: `Test User ${i + 1}`,
      followers: Math.floor(Math.random() * 10000) + 100,
      verified: Math.random() > 0.8
    },
    metrics: {
      likes: Math.floor(Math.random() * 1000) + 10,
      retweets: Math.floor(Math.random() * 500) + 5,
      replies: Math.floor(Math.random() * 100) + 2,
      views: Math.floor(Math.random() * 5000) + 100
    },
    sentiment: {
      label: mockSentiments[i % mockSentiments.length],
      score: (Math.random() * 2 - 1).toFixed(2), // -1 to 1
      confidence: (Math.random() * 0.5 + 0.5).toFixed(2) // 0.5 to 1
    },
    created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
    hashtags: [`#${query.replace(/\s+/g, '')}`, '#socialmedia', '#trending'].slice(0, Math.floor(Math.random() * 3) + 1)
  }));
};

// Error handler
const handleError = (error, res) => {
  console.error('Twitter Analytics API Error:', error);
  
  if (error.message?.includes('rate limit')) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Please wait before making another request',
      retryAfter: rateLimiter.getTimeUntilReset()
    });
  }
  
  if (error.message?.includes('authentication')) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid GAME Twitter credentials'
    });
  }
  
  if (error.message?.includes('not found')) {
    return res.status(404).json({
      error: 'No results found',
      message: 'No tweets found for your search query'
    });
  }
  
  return res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// Main handler
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: 'Only POST requests are supported'
    });
  }
  
  try {
    const { action, type, query, hashtags, accountUsername, includeMentions, limit = 50, user_id } = req.body;
    
    // Validate required fields
    if (!action) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'Action is required (search, hashtag, combined-search, account-analysis, discover-hashtags, sentiment)'
      });
    }
    
    // Check if we're in mock mode
    const mockMode = process.env.TWITTER_MOCK_MODE === 'true';
    
    if (mockMode) {
      console.log('🔧 Running in mock mode');
      
      // Generate mock data based on action
      let mockData;
      
      switch (action) {
        case 'search':
          if (!query) {
            return res.status(400).json({
              error: 'Missing query',
              message: 'Query is required for search action'
            });
          }
          mockData = generateMockTweets(query, limit);
          break;
          
        case 'discover-hashtags':
          const { keyword: mockKeyword } = req.body;
          if (!mockKeyword) {
            return res.status(400).json({
              error: 'Missing keyword',
              message: 'Keyword is required for hashtag discovery'
            });
          }
          
          const mockHashtags = [
            `#${mockKeyword.replace(/\s+/g, '')}`,
            '#trending',
            '#viral',
            '#popular',
            '#socialmedia',
            '#tech',
            '#innovation',
            '#digital'
          ].slice(0, 5);
          
          return res.status(200).json({
            success: true,
            hashtags: mockHashtags,
            keyword: mockKeyword,
            totalTweetsAnalyzed: 100,
            totalHashtagsFound: 25,
            timestamp: new Date().toISOString()
          });
          
        case 'combined-search':
          const { keyword: combKeyword = '', hashtags: combHashtags = [] } = req.body;
          const combinedQuery = `${combKeyword} ${combHashtags.join(' ')}`.trim();
          
          if (!combKeyword && combHashtags.length === 0) {
            return res.status(400).json({
              error: 'Missing search criteria',
              message: 'Either keyword or hashtags must be provided'
            });
          }
          
          mockData = generateMockTweets(combinedQuery, limit);
          break;
          
        case 'account-analysis':
          const { accountUsername: mockAccount, keyword: mockAccKeyword = '', hashtags: mockAccHashtags = [] } = req.body;
          
          if (!mockAccount) {
            return res.status(400).json({
              error: 'Missing account username',
              message: 'Account username is required for account analysis'
            });
          }
          
          const accountQuery = `@${mockAccount.replace('@', '')} ${mockAccKeyword} ${mockAccHashtags.join(' ')}`.trim();
          mockData = generateMockTweets(accountQuery, limit);
          
          // Add mock account-specific metrics
          const mockAccountMetrics = {
            account: `@${mockAccount.replace('@', '')}`,
            total_analyzed: limit,
            posting_frequency: (Math.random() * 5 + 1).toFixed(1), // 1-6 tweets per day
            avg_engagement_rate: (Math.random() * 0.1).toFixed(3), // 0-10% engagement
            top_posting_hours: [9, 12, 17, 20], // Mock peak hours
            most_used_hashtags: ['#tech', '#innovation', '#ai', '#startup', '#business'].slice(0, 3)
          };
          break;
          
        case 'hashtag':
          if (!hashtags || !Array.isArray(hashtags)) {
            return res.status(400).json({
              error: 'Invalid hashtags',
              message: 'Hashtags array is required for hashtag action'
            });
          }
          mockData = hashtags.flatMap(hashtag => 
            generateMockTweets(hashtag, Math.floor(limit / hashtags.length))
          );
          break;
          
        default:
          return res.status(400).json({
            error: 'Invalid action',
            message: 'Supported actions: search, hashtag, combined-search, account-analysis, discover-hashtags, sentiment'
          });
      }
      
      // Calculate mock analytics
      const analytics = {
        total_tweets: mockData.length,
        avg_sentiment: (mockData.reduce((sum, tweet) => sum + parseFloat(tweet.sentiment.score), 0) / mockData.length).toFixed(2),
        sentiment_distribution: {
          positive: mockData.filter(t => t.sentiment.label === 'positive').length,
          negative: mockData.filter(t => t.sentiment.label === 'negative').length,
          neutral: mockData.filter(t => t.sentiment.label === 'neutral').length
        },
        top_hashtags: ['#trending', '#socialmedia', '#viral'],
        engagement_stats: {
          avg_likes: Math.floor(mockData.reduce((sum, t) => sum + t.metrics.likes, 0) / mockData.length),
          avg_retweets: Math.floor(mockData.reduce((sum, t) => sum + t.metrics.retweets, 0) / mockData.length),
          total_engagement: mockData.reduce((sum, t) => sum + t.metrics.likes + t.metrics.retweets + t.metrics.replies, 0)
        }
      };
      
      // Add account metrics if this is an account analysis
      if (action === 'account-analysis' && typeof mockAccountMetrics !== 'undefined') {
        analytics.account_metrics = mockAccountMetrics;
      }
      
      return res.status(200).json({
        success: true,
        mock: true,
        data: mockData,
        analytics,
        query: query || hashtags,
        timestamp: new Date().toISOString()
      });
    }
    
    // Production mode - check rate limiting
    if (!rateLimiter.canMakeRequest()) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please wait before trying again.',
        retryAfter: rateLimiter.getTimeUntilReset()
      });
    }
    
    // Initialize Twitter client
    const twitterClient = getTwitterClient();
    
    // Route to appropriate handler based on action
    switch (action) {
      case 'search':
        return await handleKeywordSearch(twitterClient, req, res);
      case 'hashtag':
        return await handleHashtagAnalysis(twitterClient, req, res);
      case 'combined-search':
        return await handleCombinedSearch(twitterClient, req, res);
      case 'account-analysis':
        return await handleAccountAnalysis(twitterClient, req, res);
      case 'discover-hashtags':
        return await handleHashtagDiscovery(twitterClient, req, res);
      case 'sentiment':
        return await handleSentimentAnalysis(twitterClient, req, res);
      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Supported actions: search, hashtag, combined-search, account-analysis, discover-hashtags, sentiment'
        });
    }
    
  } catch (error) {
    return handleError(error, res);
  }
}

// Placeholder functions for different actions
// These will be implemented in subsequent steps

async function handleKeywordSearch(client, req, res) {
  try {
    const { 
      query, 
      includeMentions = false, 
      limit = 50, 
      location, 
      sortOrder = 'recent',
      global = false 
    } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Missing query',
        message: 'Query is required for keyword search'
      });
    }
    
    console.log(`🔍 Advanced keyword search: "${query}" | Location: ${location} | Sort: ${sortOrder} | Global: ${global}`);
    
    // Build search query with advanced options
    let searchQuery = query.trim();
    
    // Add mentions filter if not included
    if (!includeMentions) {
      searchQuery += ' -is:reply';
    }
    
    // Add location filter if specified and not global
    if (location && !global) {
      searchQuery += ` place:${location}`;
    }
    
    // Remove spam and retweets for better quality
    // Only add language filter if not doing global search
    if (global) {
      searchQuery += ' -is:retweet';
    } else {
      searchQuery += ' -is:retweet lang:en';
    }
    
    console.log(`🔍 Final search query: "${searchQuery}"`);
    
    // Build API parameters with sort order
    const apiParams = {
      max_results: Math.max(10, Math.min(limit, 100)), // Fix API limit validation
      'tweet.fields': [
        'created_at',
        'public_metrics',
        'context_annotations',
        'entities',
        'referenced_tweets',
        'author_id'
      ].join(','),
      'user.fields': [
        'username',
        'name',
        'verified',
        'public_metrics',
        'profile_image_url'
      ].join(','),
      expansions: 'author_id,referenced_tweets.id'
    };
    
    // Add sort parameter if specified (Twitter API v2 uses sort_order)
    if (sortOrder === 'recent') {
      apiParams.sort_order = 'recency';
    } else if (sortOrder === 'popular') {
      apiParams.sort_order = 'relevancy';
    }
    
    // Use GAME SDK to search tweets
    const searchResults = await client.v2.search(searchQuery, apiParams);
    
    // Process and format results
    const tweets = searchResults.data?.data || [];
    const users = searchResults.data?.includes?.users || [];
    const referencedTweets = searchResults.data?.includes?.tweets || [];
    
    // Create user lookup map
    const userMap = new Map();
    users.forEach(user => userMap.set(user.id, user));
    
    // Format tweets with enhanced data
    const formattedTweets = tweets.map(tweet => {
      const author = userMap.get(tweet.author_id);
      
      // Extract hashtags
      const hashtags = tweet.entities?.hashtags?.map(tag => `#${tag.tag}`) || [];
      
      // Calculate basic sentiment (placeholder - will be enhanced with AI)
      const sentiment = calculateBasicSentiment(tweet.text);
      
      return {
        id: tweet.id,
        text: tweet.text,
        created_at: tweet.created_at,
        author: {
          id: tweet.author_id,
          username: author?.username || 'unknown',
          name: author?.name || 'Unknown User',
          verified: author?.verified || false,
          followers: author?.public_metrics?.followers_count || 0,
          profile_image: author?.profile_image_url || null
        },
        metrics: {
          likes: tweet.public_metrics?.like_count || 0,
          retweets: tweet.public_metrics?.retweet_count || 0,
          replies: tweet.public_metrics?.reply_count || 0,
          quotes: tweet.public_metrics?.quote_count || 0,
          views: tweet.public_metrics?.impression_count || 0
        },
        sentiment: {
          label: sentiment.label,
          score: sentiment.score,
          confidence: sentiment.confidence
        },
        hashtags,
        url: `https://twitter.com/${author?.username}/status/${tweet.id}`,
        replies: [] // Will be populated if mentions is enabled
      };
    });
    
    // If mentions enabled, fetch top 10 replies for each tweet (enhanced version)
    if (includeMentions) {
      console.log('📱 Fetching replies for tweets...');
      
      // Fetch replies for each tweet (limit to first 5 tweets to avoid rate limits)
      const tweetsToFetchReplies = formattedTweets.slice(0, 5);
      
      for (const tweet of tweetsToFetchReplies) {
        console.log(`🔍 Attempting to fetch replies for tweet ${tweet.id} by @${tweet.author.username}`);
        
        const replies = await fetchTweetReplies(client, tweet.id, 10, tweet.author.username);
        tweet.replies = replies;
        
        if (replies.length > 0) {
          console.log(`  ✅ Found ${replies.length} replies for tweet by @${tweet.author.username}`);
        } else {
          console.log(`  ⚠️ No replies found for tweet by @${tweet.author.username}`);
        }
        
        // Add delay between reply fetches to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Calculate analytics (now includes reply analytics if available)
    const analytics = generateAnalytics(formattedTweets, query, includeMentions);
    
    // Database storage removed - results are returned for JSON export
    
    return res.status(200).json({
      success: true,
      data: formattedTweets,
      analytics,
      query,
      total: tweets.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Keyword search error:', error);
    
    if (error.code === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Twitter API rate limit reached. Please try again later.'
      });
    }
    
    return res.status(500).json({
      error: 'Search failed',
      message: 'Failed to search Twitter. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Basic sentiment analysis function
function calculateBasicSentiment(text) {
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'best', 'awesome', 'perfect'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disappointing', 'sucks', 'stupid', 'annoying'];
  
  const words = text.toLowerCase().split(/\s+/);
  let score = 0;
  let matches = 0;
  
  words.forEach(word => {
    if (positiveWords.includes(word)) {
      score += 1;
      matches++;
    } else if (negativeWords.includes(word)) {
      score -= 1;
      matches++;
    }
  });
  
  const normalizedScore = matches > 0 ? score / words.length : 0;
  const confidence = Math.min(matches / 10, 1); // Basic confidence based on keyword matches
  
  let label = 'neutral';
  if (normalizedScore > 0.01) label = 'positive';
  else if (normalizedScore < -0.01) label = 'negative';
  
  return {
    label,
    score: Math.max(-1, Math.min(1, normalizedScore * 10)), // Scale to -1 to 1
    confidence: Math.max(0.3, confidence) // Minimum confidence
  };
}

// Generate analytics from tweets
function generateAnalytics(tweets, query, includeMentions = false) {
  if (tweets.length === 0) {
    return {
      total_tweets: 0,
      avg_sentiment: 0,
      sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
      top_hashtags: [],
      engagement_stats: { avg_likes: 0, avg_retweets: 0, total_engagement: 0 },
      top_influencers: []
    };
  }
  
  // Sentiment distribution
  const sentimentCounts = tweets.reduce((acc, tweet) => {
    acc[tweet.sentiment.label]++;
    return acc;
  }, { positive: 0, negative: 0, neutral: 0 });
  
  // Average sentiment
  const avgSentiment = tweets.reduce((sum, tweet) => sum + tweet.sentiment.score, 0) / tweets.length;
  
  // Top hashtags
  const hashtagCounts = {};
  tweets.forEach(tweet => {
    tweet.hashtags.forEach(tag => {
      hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
    });
  });
  
  const topHashtags = Object.entries(hashtagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tag]) => tag);
  
  // Engagement stats
  const totalLikes = tweets.reduce((sum, tweet) => sum + tweet.metrics.likes, 0);
  const totalRetweets = tweets.reduce((sum, tweet) => sum + tweet.metrics.retweets, 0);
  const totalReplies = tweets.reduce((sum, tweet) => sum + tweet.metrics.replies, 0);
  
  // Top influencers (by follower count)
  const topInfluencers = tweets
    .sort((a, b) => b.author.followers - a.author.followers)
    .slice(0, 5)
    .map(tweet => ({
      username: tweet.author.username,
      name: tweet.author.name,
      followers: tweet.author.followers,
      verified: tweet.author.verified
    }));
  
  // Reply analytics (if mentions enabled)
  let replyAnalytics = {};
  if (includeMentions) {
    const allReplies = tweets.flatMap(tweet => tweet.replies || []);
    const totalReplies = allReplies.length;
    
    if (totalReplies > 0) {
      const avgReplySentiment = allReplies.reduce((sum, reply) => sum + reply.sentiment.score, 0) / totalReplies;
      const replyEngagement = allReplies.reduce((sum, reply) => sum + reply.engagement, 0);
      
      const replySentimentCounts = allReplies.reduce((acc, reply) => {
        acc[reply.sentiment.label]++;
        return acc;
      }, { positive: 0, negative: 0, neutral: 0 });
      
      replyAnalytics = {
        total_replies: totalReplies,
        avg_reply_sentiment: Number(avgReplySentiment.toFixed(2)),
        reply_sentiment_distribution: replySentimentCounts,
        avg_reply_engagement: Math.floor(replyEngagement / totalReplies),
        top_reply_authors: allReplies
          .sort((a, b) => b.engagement - a.engagement)
          .slice(0, 5)
          .map(reply => ({
            username: reply.author.username,
            name: reply.author.name,
            engagement: reply.engagement
          }))
      };
    }
  }

  return {
    total_tweets: tweets.length,
    avg_sentiment: Number(avgSentiment.toFixed(2)),
    sentiment_distribution: sentimentCounts,
    top_hashtags: topHashtags,
    engagement_stats: {
      avg_likes: Math.floor(totalLikes / tweets.length),
      avg_retweets: Math.floor(totalRetweets / tweets.length),
      total_engagement: totalLikes + totalRetweets + totalReplies
    },
    top_influencers: topInfluencers,
    ...(includeMentions && { reply_analytics: replyAnalytics })
  };
}

// Database storage functions removed - using JSON export instead

// Advanced reply fetching with multiple fallback methods (from testing framework)
async function fetchTweetReplies(client, tweetId, limit = 10, originalTweetAuthor = null) {
  const maxResults = Math.max(10, Math.min(limit * 2, 100));
  
  // Method 1: Enhanced conversation_id search with proper field expansion
  try {
    console.log(`🔍 Fetching replies for tweet ${tweetId} using conversation_id (Method 1)`);
    
    const replyResults = await client.v2.search(`conversation_id:${tweetId}`, {
      max_results: maxResults,
      'tweet.fields': [
        'created_at',
        'public_metrics',
        'author_id',
        'in_reply_to_user_id',
        'conversation_id',
        'referenced_tweets'
      ].join(','),
      'user.fields': [
        'username',
        'name',
        'verified',
        'public_metrics'
      ].join(','),
      expansions: 'author_id,referenced_tweets.id'
    });
    
    const replies = replyResults.data?.data || [];
    const users = replyResults.data?.includes?.users || [];
    
    if (replies.length > 0) {
      console.log(`✅ Method 1 found ${replies.length} potential replies`);
      return formatAndFilterReplies(replies, users, tweetId, limit);
    }
  } catch (error) {
    console.log(`⚠️ Method 1 failed: ${error.message}`);
  }
  
  // Method 2: Search by replies to specific user (if original author provided)
  if (originalTweetAuthor) {
    try {
      console.log(`🔍 Fetching replies using to:${originalTweetAuthor} search (Method 2)`);
      
      const replyResults = await client.v2.search(`to:${originalTweetAuthor} -is:retweet`, {
        max_results: maxResults,
        'tweet.fields': [
          'created_at',
          'public_metrics',
          'author_id',
          'in_reply_to_user_id',
          'conversation_id',
          'referenced_tweets'
        ].join(','),
        'user.fields': [
          'username',
          'name',
          'verified'
        ].join(','),
        expansions: 'author_id,referenced_tweets.id'
      });
      
      const replies = replyResults.data?.data || [];
      const users = replyResults.data?.includes?.users || [];
      
      // Filter replies that belong to this specific conversation
      const conversationReplies = replies.filter(reply => 
        reply.conversation_id === tweetId || 
        reply.in_reply_to_user_id || 
        reply.referenced_tweets?.some(ref => ref.type === 'replied_to' && ref.id === tweetId)
      );
      
      if (conversationReplies.length > 0) {
        console.log(`✅ Method 2 found ${conversationReplies.length} conversation replies`);
        return formatAndFilterReplies(conversationReplies, users, tweetId, limit);
      }
    } catch (error) {
      console.log(`⚠️ Method 2 failed: ${error.message}`);
    }
  }
  
  // Method 3: Simplified search without language filter
  try {
    console.log(`🔍 Fetching replies using simplified search (Method 3)`);
    
    const replyResults = await client.v2.search(`conversation_id:${tweetId} -is:retweet`, {
      max_results: maxResults,
      'tweet.fields': [
        'created_at',
        'public_metrics',
        'author_id',
        'conversation_id'
      ].join(','),
      'user.fields': [
        'username',
        'name'
      ].join(','),
      expansions: 'author_id'
    });
    
    const replies = replyResults.data?.data || [];
    const users = replyResults.data?.includes?.users || [];
    
    if (replies.length > 0) {
      console.log(`✅ Method 3 found ${replies.length} replies`);
      return formatAndFilterReplies(replies, users, tweetId, limit);
    }
  } catch (error) {
    console.log(`⚠️ Method 3 failed: ${error.message}`);
  }
  
  // All methods failed
  console.log(`❌ All reply fetching methods failed for tweet ${tweetId}`);
  return [];
}

// Helper method to format and filter replies
function formatAndFilterReplies(replies, users, originalTweetId, limit) {
  // Create user map
  const userMap = new Map();
  users.forEach(user => userMap.set(user.id, user));
  
  // Format replies
  const formattedReplies = replies
    .filter(reply => reply.id !== originalTweetId) // Exclude the original tweet
    .map(reply => ({
      id: reply.id,
      text: reply.text,
      created_at: reply.created_at,
      conversation_id: reply.conversation_id,
      in_reply_to_user_id: reply.in_reply_to_user_id,
      author: {
        username: userMap.get(reply.author_id)?.username || 'unknown',
        name: userMap.get(reply.author_id)?.name || 'Unknown'
      },
      metrics: {
        likes: reply.public_metrics?.like_count || 0,
        retweets: reply.public_metrics?.retweet_count || 0,
        replies: reply.public_metrics?.reply_count || 0
      },
      engagement: (reply.public_metrics?.like_count || 0) + (reply.public_metrics?.retweet_count || 0),
      sentiment: calculateBasicSentiment(reply.text)
    }));
  
  // Sort by engagement and return top results
  const sortedReplies = formattedReplies
    .sort((a, b) => {
      // Primary sort: by engagement
      if (b.engagement !== a.engagement) {
        return b.engagement - a.engagement;
      }
      // Secondary sort: by date (newer first)
      return new Date(b.created_at) - new Date(a.created_at);
    })
    .slice(0, limit);
  
  console.log(`📱 Formatted ${sortedReplies.length} replies (top ${limit})`);
  return sortedReplies;
}

// Hashtag discovery handler
async function handleHashtagDiscovery(client, req, res) {
  try {
    const { keyword } = req.body;
    
    if (!keyword) {
      return res.status(400).json({
        error: 'Missing keyword',
        message: 'Keyword is required for hashtag discovery'
      });
    }
    
    console.log(`🔍 Discovering hashtags for keyword: "${keyword}"`);
    
    // Search tweets with the keyword to find hashtags
    const searchQuery = `${keyword.trim()} -is:retweet lang:en`;
    
    const searchResults = await client.v2.search(searchQuery, {
      max_results: 100, // Get maximum tweets for better hashtag discovery
      'tweet.fields': [
        'created_at',
        'public_metrics',
        'entities',
        'author_id'
      ].join(','),
      'user.fields': [
        'username',
        'name',
        'public_metrics'
      ].join(','),
      expansions: 'author_id'
    });
    
    const tweets = searchResults.data?.data || [];
    const users = searchResults.data?.includes?.users || [];
    
    if (tweets.length === 0) {
      return res.status(404).json({
        error: 'No tweets found',
        message: `No tweets found for keyword "${keyword}"`
      });
    }
    
    // Create user map for follower reach calculation
    const userMap = new Map();
    users.forEach(user => userMap.set(user.id, user));
    
    // Track hashtag metrics
    const hashtagMetrics = {};
    
    tweets.forEach(tweet => {
      const hashtags = tweet.entities?.hashtags || [];
      const author = userMap.get(tweet.author_id);
      const tweetEngagement = (tweet.public_metrics?.like_count || 0) + 
                             (tweet.public_metrics?.retweet_count || 0);
      const followerReach = author?.public_metrics?.followers_count || 0;
      
      hashtags.forEach(tag => {
        const hashtag = `#${tag.tag}`;
        
        if (!hashtagMetrics[hashtag]) {
          hashtagMetrics[hashtag] = {
            hashtag,
            frequency: 0,
            totalEngagement: 0,
            totalReach: 0,
            tweets: []
          };
        }
        
        hashtagMetrics[hashtag].frequency++;
        hashtagMetrics[hashtag].totalEngagement += tweetEngagement;
        hashtagMetrics[hashtag].totalReach += followerReach;
        hashtagMetrics[hashtag].tweets.push({
          id: tweet.id,
          engagement: tweetEngagement,
          reach: followerReach
        });
      });
    });
    
    // Calculate engagement score for each hashtag
    const hashtagScores = Object.values(hashtagMetrics).map(metric => {
      const avgEngagement = metric.totalEngagement / metric.frequency;
      const avgReach = metric.totalReach / metric.frequency;
      
      // Engagement score formula: combines frequency, engagement, and reach
      const engagementScore = (
        (avgEngagement * 0.4) +           // 40% weight on average engagement
        (metric.frequency * 10 * 0.3) +   // 30% weight on frequency (normalized)
        (avgReach / 1000 * 0.3)           // 30% weight on reach (normalized)
      );
      
      return {
        hashtag: metric.hashtag,
        frequency: metric.frequency,
        avgEngagement: Math.floor(avgEngagement),
        avgReach: Math.floor(avgReach),
        engagementScore: Math.floor(engagementScore)
      };
    });
    
    // Sort by engagement score and get top hashtags
    const topHashtags = hashtagScores
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, 8) // Return top 8 hashtags
      .map(h => h.hashtag);
    
    console.log(`✅ Discovered ${Object.keys(hashtagMetrics).length} unique hashtags`);
    
    return res.status(200).json({
      success: true,
      hashtags: topHashtags,
      keyword,
      totalTweetsAnalyzed: tweets.length,
      totalHashtagsFound: Object.keys(hashtagMetrics).length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Hashtag discovery error:', error);
    
    return res.status(500).json({
      error: 'Discovery failed',
      message: 'Failed to discover hashtags. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Combined search handler
async function handleCombinedSearch(client, req, res) {
  try {
    const { 
      keyword = '', 
      hashtags = [], 
      location, 
      sortOrder = 'recent', 
      includeMentions = false, 
      limit = 25,
      global = false,
      user_id 
    } = req.body;
    
    // Determine search type based on inputs
    const hasKeyword = keyword.trim().length > 0;
    const hasHashtags = hashtags.length > 0;
    
    if (!hasKeyword && !hasHashtags) {
      return res.status(400).json({
        error: 'Missing search criteria',
        message: 'Either keyword or hashtags must be provided'
      });
    }
    
    console.log(`🔍 Combined search - Keyword: "${keyword}", Hashtags: [${hashtags.join(', ')}]`);
    
    let allTweets = [];
    
    // Execute keyword search if provided
    if (hasKeyword) {
      const keywordTweets = await searchByKeyword(client, {
        keyword,
        location,
        sortOrder,
        includeMentions,
        global,
        limit: hasHashtags ? Math.ceil(limit / 2) : limit
      });
      allTweets.push(...keywordTweets);
    }
    
    // Execute hashtag search if provided
    if (hasHashtags) {
      const hashtagTweets = await searchByHashtags(client, {
        hashtags,
        location,
        sortOrder,
        includeMentions,
        global,
        limit: hasKeyword ? Math.ceil(limit / 2) : limit
      });
      allTweets.push(...hashtagTweets);
    }
    
    // Remove duplicates and sort
    const uniqueTweets = deduplicateAndSort(allTweets, limit);
    
    // Generate analytics
    const analytics = generateCombinedAnalytics(uniqueTweets, keyword, hashtags);
    
    // Database storage removed - results are returned for JSON export
    
    return res.status(200).json({
      success: true,
      data: uniqueTweets,
      analytics,
      searchType: hasKeyword && hasHashtags ? 'combined' : hasKeyword ? 'keyword' : 'hashtag',
      query: { keyword, hashtags },
      total: uniqueTweets.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Combined search error:', error);
    
    return res.status(500).json({
      error: 'Search failed',
      message: 'Failed to perform combined search. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Account analysis handler
async function handleAccountAnalysis(client, req, res) {
  const { 
    accountUsername,
    keyword = '',
    hashtags = [],
    language,
    sortOrder = 'recent',
    includeMentions = false,
    limit = 50,
    global = false
  } = req.body;
  
  if (!accountUsername) {
    return res.status(400).json({
      error: 'Missing account username',
      message: 'Account username is required for account analysis'
    });
  }
  
  // Clean username (remove @ if present)
  const cleanUsername = accountUsername.replace(/^@/, '');
  
  try {
    console.log(`👤 Account analysis for @${cleanUsername}`);
    
    // CRITICAL: Account fetching is INDEPENDENT - start with just the account
    let baseQuery = `from:${cleanUsername}`;
    
    // Always exclude retweets for original content
    baseQuery += ' -is:retweet';
    
    // Optionally exclude replies
    if (!includeMentions) {
      baseQuery += ' -is:reply';
    }
    
    console.log(`🔍 Base account query: "${baseQuery}"`);
    
    // Build API parameters
    const apiParams = {
      max_results: Math.max(10, Math.min(limit, 100)),
      'tweet.fields': [
        'created_at',
        'public_metrics',
        'context_annotations',
        'entities',
        'referenced_tweets',
        'author_id'
      ].join(','),
      'user.fields': [
        'username',
        'name',
        'verified',
        'public_metrics',
        'profile_image_url',
        'description',
        'created_at'
      ].join(','),
      expansions: 'author_id,referenced_tweets.id'
    };
    
    // Add sort parameter
    if (sortOrder === 'recent') {
      apiParams.sort_order = 'recency';
    } else if (sortOrder === 'popular') {
      apiParams.sort_order = 'relevancy';
    }
    
    let searchResults;
    let tweets = [];
    let users = [];
    let filtersApplied = false;
    
    // CRITICAL: Account analysis is COMPLETELY INDEPENDENT - NO FILTERS APPLIED
    // The user explicitly requested account fetching to be 100% independent
    // We MUST ignore keyword, hashtags, and language filters for account analysis
    console.log('📌 Account analysis mode: Ignoring ALL filters - fetching pure account tweets');
    
    // Log what filters were ignored for debugging
    if (keyword || (hashtags && hashtags.length > 0) || language) {
      console.log('⚠️ Filters received but IGNORED for account analysis:', {
        keyword: keyword || 'none',
        hashtags: hashtags?.length ? `${hashtags.length} hashtags` : 'none',
        language: language || 'none'
      });
    }
    
    // Use ONLY the base query - no filters whatsoever
    searchResults = await client.v2.search(baseQuery, apiParams);
    tweets = searchResults.data?.data || [];
    users = searchResults.data?.includes?.users || [];
    
    if (tweets.length === 0) {
      // Try to determine why no tweets were found
      let accountExists = false;
      let accountInfo = null;
      let verificationFailed = false;
      
      try {
        // CRITICAL: Use ONLY the username for verification - completely independent check
        const simpleTestQuery = `from:${cleanUsername}`;
        console.log(`🔍 Verifying account existence with simple query: "${simpleTestQuery}"`);
        
        const testResults = await client.v2.search(simpleTestQuery, {
          max_results: 1,
          'user.fields': 'username,name,public_metrics,profile_image_url,verified'
        });
        
        if (testResults.data?.meta?.result_count > 0) {
          accountExists = true;
          const testUsers = testResults.data?.includes?.users || [];
          accountInfo = testUsers.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
          console.log(`✅ Account @${cleanUsername} exists`);
        } else {
          // Only if verification succeeded with 0 results do we know account doesn't exist
          console.log(`❌ Account @${cleanUsername} not found`);
        }
      } catch (testError) {
        console.log('⚠️ Account verification failed:', testError.message);
        // CRITICAL: Verification failed - DO NOT assume account doesn't exist!
        // Accounts with underscores or special characters often fail verification
        verificationFailed = true;
        // When verification fails, assume account EXISTS (better safe than sorry)
        accountExists = true;
      }
      
      // Provide specific error messages
      if (!accountExists && !verificationFailed) {
        // Only claim account doesn't exist if verification succeeded with 0 results
        return res.status(404).json({
          error: 'Account not found',
          message: `The account @${cleanUsername} does not exist or is not accessible`,
          suggestion: 'Please verify the username and try again',
          possibleReasons: [
            'The username may be incorrect',
            'The account may be suspended or deleted',
            'The account may be private'
          ]
        });
      } else if (!filtersApplied && (keyword || (hashtags && hashtags.length > 0))) {
        // Filters were attempted but failed - query was too complex
        return res.status(200).json({
          success: true,
          data: [],
          analytics: {
            total_tweets: 0,
            message: 'Query too complex - filters could not be applied',
            suggestion: 'Try using fewer hashtags or simpler keywords'
          },
          account: `@${cleanUsername}`,
          filters: {
            keyword: keyword || null,
            hashtags: hashtags || [],
            note: 'Filters were too complex to apply. Try searching with fewer parameters.'
          },
          accountInfo,
          total: 0,
          timestamp: new Date().toISOString()
        });
      } else if (keyword || (hashtags && hashtags.length > 0)) {
        return res.status(404).json({
          error: 'No matching tweets',
          message: verificationFailed
            ? `No tweets found for account @${cleanUsername} with the specified filters (verification had issues)`
            : `Account @${cleanUsername} exists but has no tweets matching your filters`,
          suggestion: 'Try removing filters or using different keywords',
          filters: {
            keyword: keyword || null,
            hashtags: hashtags || []
          },
          account: accountInfo,
          ...(verificationFailed && { verificationNote: 'Account verification had issues but the account likely exists' })
        });
      } else {
        return res.status(404).json({
          error: 'No recent activity',
          message: verificationFailed
            ? `No recent tweets found for @${cleanUsername} (verification had issues)`
            : `Account @${cleanUsername} exists but has no recent original tweets`,
          suggestion: includeMentions ? 'This account may be inactive' : 'Try enabling "Include mentions and replies" to see more activity',
          account: accountInfo,
          ...(verificationFailed && { verificationNote: 'Account verification had issues but the account likely exists' })
        });
      }
    }
    
    // Create user lookup map
    const userMap = new Map();
    users.forEach(user => userMap.set(user.id, user));
    
    // Format tweets
    const formattedTweets = formatTweets(tweets, users);
    
    // If mentions enabled, fetch replies for top tweets
    if (includeMentions) {
      console.log('📱 Fetching replies for account tweets...');
      const tweetsToFetchReplies = formattedTweets.slice(0, 3);
      
      for (const tweet of tweetsToFetchReplies) {
        const replies = await fetchTweetReplies(client, tweet.id, 5, cleanUsername);
        tweet.replies = replies;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Generate account-specific analytics
    const analytics = generateAccountAnalytics(formattedTweets, cleanUsername, keyword, hashtags);
    
    // Add AI insights if available
    try {
      const aiInsights = await analyzeAccountWithAI(formattedTweets, cleanUsername);
      if (aiInsights) {
        analytics.ai_insights = aiInsights;
        console.log('✨ AI insights added to account analysis');
      }
    } catch (error) {
      console.log('AI analysis skipped:', error.message);
      // Continue without AI - not critical
    }
    
    return res.status(200).json({
      success: true,
      data: formattedTweets,
      analytics,
      account: `@${cleanUsername}`,
      filters: {
        keyword: keyword || null,
        hashtags: hashtags || []
      },
      total: tweets.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Account analysis error:', error);
    
    // Check for invalid username (Twitter API returns 400)
    if (error.code === 400 && error.errors?.[0]?.message?.includes('Invalid username')) {
      return res.status(404).json({
        error: 'Invalid username',
        message: `The username @${cleanUsername} is not valid`,
        suggestion: 'Twitter usernames can only contain letters, numbers, and underscores, and must be 15 characters or less',
        possibleReasons: [
          'Username is too long (max 15 characters)',
          'Username contains invalid characters',
          'Username format is incorrect'
        ]
      });
    }
    
    if (error.code === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Twitter API rate limit reached. Please try again later.'
      });
    }
    
    return res.status(500).json({
      error: 'Account analysis failed',
      message: 'Failed to analyze account. Please check the username and try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// AI-powered account analysis using OpenRouter
async function analyzeAccountWithAI(tweets, accountUsername) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
  
  if (!OPENROUTER_API_KEY) {
    return null // AI is optional - gracefully degrades
  }
  
  try {
    const tweetsForAnalysis = tweets.slice(0, 10).map(t => ({
      text: t.text,
      likes: t.metrics?.likes || 0,
      retweets: t.metrics?.retweets || 0,
      replies: t.metrics?.replies || 0,
      created_at: t.created_at
    }))
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{
          role: 'user',
          content: `Analyze Twitter account @${accountUsername} based on these recent tweets:
          ${JSON.stringify(tweetsForAnalysis, null, 2)}
          
          Provide detailed insights on:
          1. Content strategy and main themes
          2. Engagement patterns (what drives likes/retweets)
          3. Writing style and tone
          4. Posting consistency
          5. Audience interaction style
          
          Return ONLY valid JSON with these fields:
          {
            "content_themes": ["theme1", "theme2", "theme3"],
            "writing_style": "description of writing style",
            "engagement_insights": "what type of content gets most engagement",
            "audience_sentiment": "overall sentiment towards the account",
            "posting_patterns": "analysis of posting frequency and timing",
            "recommendations": ["recommendation1", "recommendation2", "recommendation3"]
          }`
        }]
      })
    })
    
    if (!response.ok) {
      console.error('AI analysis failed:', response.statusText)
      return null
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    
    if (content) {
      try {
        // Handle markdown-wrapped JSON responses
        let cleanContent = content.trim()
        if (cleanContent.startsWith('```json') || cleanContent.startsWith('```')) {
          // Remove markdown code blocks
          cleanContent = cleanContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
        }
        return JSON.parse(cleanContent)
      } catch (e) {
        console.error('Failed to parse AI response:', e)
        return null
      }
    }
    
    return null
  } catch (error) {
    console.error('AI analysis error:', error)
    return null // Graceful degradation
  }
}

// Generate analytics specific to account analysis
function generateAccountAnalytics(tweets, username, keyword, hashtags) {
  if (tweets.length === 0) {
    return {
      total_tweets: 0,
      account_metrics: {
        account: `@${username}`,
        total_analyzed: 0,
        posting_frequency: 0,
        avg_engagement_rate: 0
      }
    };
  }
  
  // Get basic analytics
  const baseAnalytics = generateAnalytics(tweets, keyword || `@${username}`);
  
  // Calculate account-specific metrics
  const sortedTweets = tweets.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const oldestTweet = new Date(sortedTweets[0].created_at);
  const newestTweet = new Date(sortedTweets[sortedTweets.length - 1].created_at);
  const daysDiff = Math.max(1, (newestTweet - oldestTweet) / (1000 * 60 * 60 * 24));
  
  // Posting frequency (tweets per day)
  const postingFrequency = tweets.length / daysDiff;
  
  // Average engagement rate (engagement / followers * 100)
  const avgFollowers = tweets[0]?.author?.followers || 1;
  const totalEngagement = tweets.reduce((sum, tweet) => 
    sum + tweet.metrics.likes + tweet.metrics.retweets + tweet.metrics.replies, 0
  );
  const avgEngagementRate = (totalEngagement / (tweets.length * avgFollowers)) * 100;
  
  // Find top performing tweets
  const topTweets = tweets
    .sort((a, b) => {
      const aEngagement = a.metrics.likes + a.metrics.retweets;
      const bEngagement = b.metrics.likes + b.metrics.retweets;
      return bEngagement - aEngagement;
    })
    .slice(0, 3)
    .map(tweet => ({
      text: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
      likes: tweet.metrics.likes,
      retweets: tweet.metrics.retweets,
      url: tweet.url
    }));
  
  // Posting time analysis
  const hourCounts = {};
  tweets.forEach(tweet => {
    const hour = new Date(tweet.created_at).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  
  const topPostingHours = Object.entries(hourCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 4)
    .map(([hour]) => parseInt(hour));
  
  // Add account metrics to base analytics
  baseAnalytics.account_metrics = {
    account: `@${username}`,
    total_analyzed: tweets.length,
    posting_frequency: Number(postingFrequency.toFixed(2)),
    avg_engagement_rate: Number(avgEngagementRate.toFixed(3)),
    top_tweets: topTweets,
    top_posting_hours: topPostingHours,
    date_range: {
      from: oldestTweet.toISOString(),
      to: newestTweet.toISOString()
    }
  };
  
  return baseAnalytics;
}

async function handleHashtagAnalysis(client, req, res) {
  // TODO: Implement hashtag analysis
  return res.status(501).json({
    error: 'Not implemented',
    message: 'Hashtag analysis will be implemented in the next step'
  });
}

// Helper functions for combined search
async function searchByKeyword(client, { keyword, location, sortOrder, includeMentions, global = false, limit }) {
  let searchQuery = keyword.trim();
  
  if (!includeMentions) {
    searchQuery += ' -is:reply';
  }
  
  if (location && location.trim() && !global) {
    searchQuery += ` place:${location.trim()}`;
  }
  
  // Remove spam and retweets for better quality
  // Only add language filter if not doing global search
  if (global) {
    searchQuery += ' -is:retweet';
  } else {
    searchQuery += ' -is:retweet lang:en';
  }
  
  const apiParams = {
    max_results: Math.min(limit, 100),
    'tweet.fields': [
      'created_at',
      'public_metrics',
      'context_annotations',
      'entities',
      'referenced_tweets',
      'author_id'
    ].join(','),
    'user.fields': [
      'username',
      'name',
      'verified',
      'public_metrics',
      'profile_image_url'
    ].join(','),
    expansions: 'author_id,referenced_tweets.id'
  };
  
  if (sortOrder === 'recent') {
    apiParams.sort_order = 'recency';
  } else if (sortOrder === 'popular') {
    apiParams.sort_order = 'relevancy';
  }
  
  const searchResults = await client.v2.search(searchQuery, apiParams);
  return formatTweets(searchResults.data?.data || [], searchResults.data?.includes?.users || []);
}

async function searchByHashtags(client, { hashtags, location, sortOrder, includeMentions, global = false, limit }) {
  let searchQuery = hashtags.join(' OR ');
  
  if (!includeMentions) {
    searchQuery += ' -is:reply';
  }
  
  if (location && location.trim() && !global) {
    searchQuery += ` place:${location.trim()}`;
  }
  
  // Remove spam and retweets for better quality
  // Only add language filter if not doing global search
  if (global) {
    searchQuery += ' -is:retweet';
  } else {
    searchQuery += ' -is:retweet lang:en';
  }
  
  const apiParams = {
    max_results: Math.min(limit, 100),
    'tweet.fields': [
      'created_at',
      'public_metrics',
      'context_annotations',
      'entities',
      'referenced_tweets',
      'author_id'
    ].join(','),
    'user.fields': [
      'username',
      'name',
      'verified',
      'public_metrics',
      'profile_image_url'
    ].join(','),
    expansions: 'author_id,referenced_tweets.id'
  };
  
  if (sortOrder === 'recent') {
    apiParams.sort_order = 'recency';
  } else if (sortOrder === 'popular') {
    apiParams.sort_order = 'relevancy';
  }
  
  const searchResults = await client.v2.search(searchQuery, apiParams);
  return formatTweets(searchResults.data?.data || [], searchResults.data?.includes?.users || []);
}

function formatTweets(tweets, users) {
  const userMap = new Map();
  users.forEach(user => userMap.set(user.id, user));
  
  return tweets.map(tweet => {
    const author = userMap.get(tweet.author_id);
    const hashtags = tweet.entities?.hashtags?.map(tag => `#${tag.tag}`) || [];
    const sentiment = calculateBasicSentiment(tweet.text);
    
    return {
      id: tweet.id,
      text: tweet.text,
      created_at: tweet.created_at,
      author: {
        id: tweet.author_id,
        username: author?.username || 'unknown',
        name: author?.name || 'Unknown User',
        verified: author?.verified || false,
        followers: author?.public_metrics?.followers_count || 0,
        profile_image: author?.profile_image_url || null
      },
      metrics: {
        likes: tweet.public_metrics?.like_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0,
        replies: tweet.public_metrics?.reply_count || 0,
        quotes: tweet.public_metrics?.quote_count || 0,
        views: tweet.public_metrics?.impression_count || 0
      },
      sentiment: {
        label: sentiment.label,
        score: sentiment.score,
        confidence: sentiment.confidence
      },
      hashtags,
      url: `https://twitter.com/${author?.username}/status/${tweet.id}`
    };
  });
}

function deduplicateAndSort(tweets, limit) {
  const uniqueTweets = tweets.reduce((acc, tweet) => {
    if (!acc.some(t => t.id === tweet.id)) {
      acc.push(tweet);
    }
    return acc;
  }, []);
  
  // Sort by engagement (likes + retweets) then by date
  return uniqueTweets
    .sort((a, b) => {
      const aEngagement = a.metrics.likes + a.metrics.retweets;
      const bEngagement = b.metrics.likes + b.metrics.retweets;
      
      if (bEngagement !== aEngagement) {
        return bEngagement - aEngagement;
      }
      
      return new Date(b.created_at) - new Date(a.created_at);
    })
    .slice(0, limit);
}

function generateCombinedAnalytics(tweets, keyword, hashtags) {
  if (tweets.length === 0) {
    return {
      total_tweets: 0,
      avg_sentiment: 0,
      sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
      top_hashtags: [],
      engagement_stats: { avg_likes: 0, avg_retweets: 0, total_engagement: 0 },
      top_influencers: [],
      search_summary: {
        keyword: keyword || null,
        hashtags: hashtags || [],
        search_type: keyword && hashtags.length > 0 ? 'combined' : keyword ? 'keyword' : 'hashtag'
      }
    };
  }
  
  const analytics = generateAnalytics(tweets, keyword || hashtags.join(' '));
  
  // Add search summary
  analytics.search_summary = {
    keyword: keyword || null,
    hashtags: hashtags || [],
    search_type: keyword && hashtags.length > 0 ? 'combined' : keyword ? 'keyword' : 'hashtag'
  };
  
  return analytics;
}

async function handleSentimentAnalysis(client, req, res) {
  // TODO: Implement sentiment analysis
  return res.status(501).json({
    error: 'Not implemented',
    message: 'Sentiment analysis will be implemented in the next step'
  });
}