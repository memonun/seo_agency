// Vercel Serverless Function
// Reddit Analytics using Apify Reddit Scraper Lite
// Handles subreddit analysis, post scraping, and user activity analysis

import fetch from 'node-fetch';

// Import constants
import { 
  POSITIVE_WORDS, 
  NEGATIVE_WORDS, 
  MIN_SENTIMENT_SCORE, 
  MAX_SENTIMENT_SCORE,
  SENTIMENT_CONFIDENCE_DIVISOR,
  MOCK_AUTHORS,
  MOCK_SUBREDDITS,
  DEFAULT_MAX_ITEMS,
  DEFAULT_MOCK_LIMIT,
  DEFAULT_TIMEOUT,
  MOCK_SCORE_BASE,
  MOCK_SCORE_RANGE,
  MOCK_UPVOTE_RATIO_MIN,
  MOCK_UPVOTE_RATIO_RANGE,
  MOCK_COMMENTS_RANGE,
  MOCK_COMMENTS_BASE,
  MOCK_AWARDS_RANGE,
  ERROR_MESSAGES,
  API_CONFIG
} from '../src/constants/reddit.js';

// Rate limiting removed for consistency with backend environment

// Initialize Apify client
const getApifyClient = () => {
  // Support both naming conventions for environment variables
  const apiToken = process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY || process.env.apify_api_key;
  
  if (!apiToken) {
    throw new Error('Apify API token not found. Please set APIFY_API_KEY in your environment variables');
  }
  
  return {
    token: apiToken,
    baseUrl: 'https://api.apify.com/v2'
  };
};

// Mock data generator for development
const generateMockRedditPosts = (query, limit = DEFAULT_MOCK_LIMIT, searchType = 'subreddit') => {
  const mockAuthors = MOCK_AUTHORS;
  const mockSubreddits = MOCK_SUBREDDITS;
  
  return Array(limit).fill(null).map((_, i) => ({
    id: `mock_${Date.now()}_${i}`,
    title: `Mock post about ${query} - Discussion ${i + 1}`,
    selftext: `This is mock content for post ${i + 1} about ${query}. Lorem ipsum dolor sit amet.`,
    author: mockAuthors[i % mockAuthors.length],
    subreddit: searchType === 'subreddit' ? query : mockSubreddits[i % mockSubreddits.length],
    score: Math.floor(Math.random() * MOCK_SCORE_RANGE) + MOCK_SCORE_BASE,
    upvote_ratio: (Math.random() * MOCK_UPVOTE_RATIO_RANGE + MOCK_UPVOTE_RATIO_MIN).toFixed(2),
    num_comments: Math.floor(Math.random() * MOCK_COMMENTS_RANGE) + MOCK_COMMENTS_BASE,
    created_utc: Math.floor((Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) / 1000),
    url: `https://reddit.com/r/${query}/comments/mock${i}`,
    permalink: `/r/${query}/comments/mock${i}/mock_post_${i}/`,
    is_video: Math.random() > 0.8,
    is_original_content: Math.random() > 0.9,
    over_18: false,
    spoiler: Math.random() > 0.95,
    locked: false,
    gilded: Math.floor(Math.random() * 3),
    total_awards_received: Math.floor(Math.random() * 10),
    post_hint: Math.random() > 0.7 ? 'image' : null,
    domain: Math.random() > 0.5 ? 'self.' + query : 'example.com',
    sentiment: {
      label: ['positive', 'negative', 'neutral'][i % 3],
      score: (Math.random() * 2 - 1).toFixed(2) // -1 to 1
    }
  }));
};

// Basic sentiment analysis function
function calculateBasicSentiment(text) {
  const positiveWords = POSITIVE_WORDS;
  const negativeWords = NEGATIVE_WORDS;
  
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
  const confidence = Math.min(matches / SENTIMENT_CONFIDENCE_DIVISOR, 1);
  
  let label = 'neutral';
  if (normalizedScore > 0.01) label = 'positive';
  else if (normalizedScore < -0.01) label = 'negative';
  
  return {
    label,
    score: Math.max(MIN_SENTIMENT_SCORE, Math.min(MAX_SENTIMENT_SCORE, normalizedScore * SENTIMENT_CONFIDENCE_DIVISOR)),
    confidence: Math.max(0.3, confidence)
  };
}

// Generate analytics from Reddit posts
function generateAnalytics(posts, searchQuery, searchType) {
  if (posts.length === 0) {
    return {
      totalPosts: 0,
      totalComments: 0,
      totalScore: 0,
      avgScore: 0,
      avgCommentsPerPost: 0,
      topPostScore: 0,
      viralPotential: 0,
      avgSentiment: 0,
      sentimentBreakdown: { positive: 0, negative: 0, neutral: 0 },
      topAuthors: [],
      topSubreddits: [],
      peakHour: null
    };
  }
  
  // Basic metrics
  const totalScore = posts.reduce((sum, post) => sum + (post.score || 0), 0);
  const totalComments = posts.reduce((sum, post) => sum + (post.num_comments || 0), 0);
  const avgScore = Math.floor(totalScore / posts.length);
  const avgCommentsPerPost = Math.floor(totalComments / posts.length);
  const topPostScore = Math.max(...posts.map(post => post.score || 0));
  
  // Sentiment analysis
  const sentimentCounts = posts.reduce((acc, post) => {
    const sentiment = post.sentiment || calculateBasicSentiment(post.title + ' ' + (post.selftext || ''));
    acc[sentiment.label]++;
    return acc;
  }, { positive: 0, negative: 0, neutral: 0 });
  
  const avgSentiment = posts.reduce((sum, post) => {
    const sentiment = post.sentiment || calculateBasicSentiment(post.title + ' ' + (post.selftext || ''));
    return sum + sentiment.score;
  }, 0) / posts.length;
  
  // Top authors
  const authorCounts = {};
  posts.forEach(post => {
    if (post.author && post.author !== '[deleted]') {
      authorCounts[post.author] = (authorCounts[post.author] || 0) + 1;
    }
  });
  
  const topAuthors = Object.entries(authorCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([author, count]) => ({ username: author, posts: count }));
  
  // Top subreddits (if search spans multiple subreddits)
  const subredditCounts = {};
  posts.forEach(post => {
    if (post.subreddit) {
      subredditCounts[post.subreddit] = (subredditCounts[post.subreddit] || 0) + 1;
    }
  });
  
  const topSubreddits = Object.entries(subredditCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([subreddit, count]) => ({ name: subreddit, posts: count }));
  
  // Peak posting hour analysis
  const hourCounts = {};
  posts.forEach(post => {
    if (post.created_utc) {
      const hour = new Date(post.created_utc * 1000).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
  });
  
  const peakHour = Object.entries(hourCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || null;
  
  // Viral potential (based on score and engagement ratios)
  const viralPotential = Math.min(100, Math.floor((avgScore + avgCommentsPerPost) / 100 * 10));
  
  return {
    totalPosts: posts.length,
    totalComments,
    totalScore,
    avgScore,
    avgCommentsPerPost,
    topPostScore,
    viralPotential,
    avgSentiment: Number(avgSentiment.toFixed(2)),
    sentimentBreakdown: sentimentCounts,
    topAuthors,
    topSubreddits,
    peakHour: peakHour ? parseInt(peakHour) : null
  };
}

// Error handler
const handleError = (error, res) => {
  console.error('Reddit Analytics API Error:', error);
  
  // Rate limit handling removed for consistency
  
  if (error.message?.includes('authentication')) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid Apify credentials'
    });
  }
  
  if (error.message?.includes('not found')) {
    return res.status(404).json({
      error: 'No results found',
      message: 'No Reddit posts found for your search query'
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
    const { 
      action, 
      searchType, 
      query, 
      subreddit, 
      username, 
      sortOrder = 'hot', 
      timeRange, 
      maxItems = DEFAULT_MAX_ITEMS, 
      includeComments = false,
      includeCommunityInfo = true,
      user_id 
    } = req.body;
    
    // Validate required fields
    if (!action || action !== 'search') {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'Action must be "search"'
      });
    }
    
    if (!searchType) {
      return res.status(400).json({
        error: 'Missing search type',
        message: 'searchType is required (subreddit, search, user)'
      });
    }
    
    // Check if we're in mock mode
    const mockMode = process.env.REDDIT_MOCK_MODE === 'true';
    
    if (mockMode) {
      console.log('🔧 Running in mock mode');
      
      let mockQuery = '';
      switch (searchType) {
        case 'subreddit':
          if (!subreddit) {
            return res.status(400).json({
              error: 'Missing subreddit',
              message: 'Subreddit is required for subreddit search'
            });
          }
          mockQuery = subreddit;
          break;
        case 'search':
          if (!query) {
            return res.status(400).json({
              error: 'Missing query',
              message: 'Query is required for search'
            });
          }
          mockQuery = query;
          break;
        case 'user':
          if (!username) {
            return res.status(400).json({
              error: 'Missing username',
              message: 'Username is required for user search'
            });
          }
          mockQuery = username;
          break;
        default:
          return res.status(400).json({
            error: 'Invalid search type',
            message: 'searchType must be: subreddit, search, or user'
          });
      }
      
      const mockData = generateMockRedditPosts(mockQuery, maxItems, searchType);
      const analytics = generateAnalytics(mockData, mockQuery, searchType);
      
      return res.status(200).json({
        success: true,
        mock: true,
        data: mockData,
        analytics,
        searchQuery: mockQuery,
        searchType,
        total: mockData.length,
        timestamp: new Date().toISOString()
      });
    }
    
    // Rate limiting removed for consistency with backend environment
    
    // Initialize Apify client
    const apifyClient = getApifyClient();
    
    // Route to appropriate handler based on search type
    switch (searchType) {
      case 'subreddit':
        return await handleSubredditSearch(apifyClient, req, res);
      case 'search':
        return await handleKeywordSearch(apifyClient, req, res);
      case 'user':
        return await handleUserSearch(apifyClient, req, res);
      default:
        return res.status(400).json({
          error: 'Invalid search type',
          message: 'Supported search types: subreddit, search, user'
        });
    }
    
  } catch (error) {
    return handleError(error, res);
  }
}

// Subreddit search handler
async function handleSubredditSearch(client, req, res) {
  try {
    const { 
      subreddit, 
      sortOrder = 'hot', 
      timeRange, 
      maxItems = DEFAULT_MAX_ITEMS,
      includeComments = false,
      includeCommunityInfo = true
    } = req.body;
    
    if (!subreddit) {
      return res.status(400).json({
        error: 'Missing subreddit',
        message: 'Subreddit name is required'
      });
    }
    
    console.log(`🔍 Subreddit search: r/${subreddit} | Sort: ${sortOrder} | Items: ${maxItems}`);
    
    // Build Apify input
    const input = {
      searches: [`subreddit:${subreddit}`],
      maxItems: parseInt(maxItems)
    };
    
    // Add time range for "top" sort
    if (sortOrder === 'top' && timeRange) {
      input.timeRange = timeRange;
    }
    
    // Run Apify actor
    const runResponse = await fetch(
      `${client.baseUrl}/acts/trudax~reddit-scraper-lite/runs?token=${client.token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input)
      }
    );
    
    if (!runResponse.ok) {
      throw new Error(`Apify API error: ${runResponse.status} ${runResponse.statusText}`);
    }
    
    const runData = await runResponse.json();
    const runId = runData.data.id;
    
    // Wait for completion (with timeout)
    const results = await waitForApifyCompletion(client, runId, DEFAULT_TIMEOUT); // 60 second timeout
    
    // Process and format results
    const posts = results.filter(item => item.type === 'post' || !item.type);
    const formattedPosts = posts.map(post => ({
      ...post,
      sentiment: calculateBasicSentiment(post.title + ' ' + (post.selftext || ''))
    }));
    
    // Generate analytics
    const analytics = generateAnalytics(formattedPosts, subreddit, 'subreddit');
    
    return res.status(200).json({
      success: true,
      data: formattedPosts,
      analytics,
      searchQuery: subreddit,
      searchType: 'subreddit',
      total: formattedPosts.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Subreddit search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: 'Failed to search subreddit. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Keyword search handler
async function handleKeywordSearch(client, req, res) {
  try {
    const { 
      query, 
      sortOrder = 'relevance', 
      maxItems = DEFAULT_MAX_ITEMS,
      includeComments = false
    } = req.body;
    
    if (!query) {
      return res.status(400).json({
        error: 'Missing query',
        message: 'Search query is required'
      });
    }
    
    console.log(`🔍 Keyword search: "${query}" | Sort: ${sortOrder} | Items: ${maxItems}`);
    
    // Build Apify input for search
    const input = {
      searches: [query],
      maxItems: parseInt(maxItems)
    };
    
    // Run Apify actor
    const runResponse = await fetch(
      `${client.baseUrl}/acts/trudax~reddit-scraper-lite/runs?token=${client.token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input)
      }
    );
    
    if (!runResponse.ok) {
      throw new Error(`Apify API error: ${runResponse.status} ${runResponse.statusText}`);
    }
    
    const runData = await runResponse.json();
    const runId = runData.data.id;
    
    // Wait for completion
    const results = await waitForApifyCompletion(client, runId, DEFAULT_TIMEOUT);
    
    // Process and format results
    const posts = results.filter(item => item.type === 'post' || !item.type);
    const formattedPosts = posts.map(post => ({
      ...post,
      sentiment: calculateBasicSentiment(post.title + ' ' + (post.selftext || ''))
    }));
    
    // Generate analytics
    const analytics = generateAnalytics(formattedPosts, query, 'search');
    
    return res.status(200).json({
      success: true,
      data: formattedPosts,
      analytics,
      searchQuery: query,
      searchType: 'search',
      total: formattedPosts.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Keyword search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: 'Failed to search Reddit. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// User search handler
async function handleUserSearch(client, req, res) {
  try {
    const { 
      username, 
      sortOrder = 'new', 
      maxItems = DEFAULT_MAX_ITEMS,
      includeComments = false
    } = req.body;
    
    if (!username) {
      return res.status(400).json({
        error: 'Missing username',
        message: 'Username is required'
      });
    }
    
    const cleanUsername = username.replace(/^u\//, '');
    console.log(`🔍 User search: u/${cleanUsername} | Sort: ${sortOrder} | Items: ${maxItems}`);
    
    // Build Apify input for user
    const input = {
      searches: [`author:${cleanUsername}`],
      maxItems: parseInt(maxItems)
    };
    
    // Run Apify actor
    const runResponse = await fetch(
      `${client.baseUrl}/acts/trudax~reddit-scraper-lite/runs?token=${client.token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input)
      }
    );
    
    if (!runResponse.ok) {
      throw new Error(`Apify API error: ${runResponse.status} ${runResponse.statusText}`);
    }
    
    const runData = await runResponse.json();
    const runId = runData.data.id;
    
    // Wait for completion
    const results = await waitForApifyCompletion(client, runId, DEFAULT_TIMEOUT);
    
    // Process and format results
    const posts = results.filter(item => item.type === 'post' || !item.type);
    const formattedPosts = posts.map(post => ({
      ...post,
      sentiment: calculateBasicSentiment(post.title + ' ' + (post.selftext || ''))
    }));
    
    // Generate analytics
    const analytics = generateAnalytics(formattedPosts, cleanUsername, 'user');
    
    return res.status(200).json({
      success: true,
      data: formattedPosts,
      analytics,
      searchQuery: cleanUsername,
      searchType: 'user',
      total: formattedPosts.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('User search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: 'Failed to search user. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Helper function to wait for Apify run completion
async function waitForApifyCompletion(client, runId, timeout = DEFAULT_TIMEOUT) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Check run status
      const statusResponse = await fetch(
        `${client.baseUrl}/actor-runs/${runId}?token=${client.token}`
      );
      
      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }
      
      const statusData = await statusResponse.json();
      const status = statusData.data.status;
      
      if (status === 'SUCCEEDED') {
        // Get results
        const resultsResponse = await fetch(
          `${client.baseUrl}/actor-runs/${runId}/dataset/items?token=${client.token}`
        );
        
        if (!resultsResponse.ok) {
          throw new Error(`Results fetch failed: ${resultsResponse.status}`);
        }
        
        return await resultsResponse.json();
      } else if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
        throw new Error(`Apify run failed with status: ${status}`);
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('Error checking Apify run status:', error);
      throw error;
    }
  }
  
  throw new Error('Apify run timed out');
}