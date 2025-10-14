/**
 * Twitter Keyword Analysis Test
 * 
 * Comprehensive testing of keyword search functionality using real GAME SDK API calls
 * Tests various scenarios, validates responses, and measures performance
 */

import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index !== -1 ? args[index + 1] : null;
};

const keyword = getArg('--keyword') || 'artificial intelligence';
const location = getArg('--location') || null;
const language = getArg('--lang') || null; // Specific language code like 'tr', 'en'
const limit = parseInt(getArg('--limit')) || 10;
const includeMentions = args.includes('--mentions');
const singleTest = args.includes('--single'); // Only run one test instead of full suite
const includeLang = !args.includes('--no-lang');
const includeLocation = !args.includes('--no-location');

class KeywordAnalysisTest {
  constructor() {
    this.results = [];
    this.errors = [];
    this.startTime = null;
    this.client = null;
    
    // Test configurations
    this.testKeywords = [keyword];
    
    this.testLimits = singleTest ? [limit] : [10, 25, 50];
    this.mentionOptions = singleTest ? [includeMentions] : [true, false];
  }

  // Initialize Twitter client with GAME SDK
  initializeClient() {
    try {
      const accessToken = process.env.GAME_TWITTER_ACCESS_TOKEN;
      
      if (!accessToken) {
        throw new Error('GAME_TWITTER_ACCESS_TOKEN not found in environment');
      }
      
      this.client = new TwitterApi({
        gameTwitterAccessToken: accessToken
      });
      this.log('✅ Twitter client initialized successfully');
      return true;
    } catch (error) {
      this.logError('❌ Failed to initialize Twitter client', error);
      return false;
    }
  }

  // Logging helper functions
  log(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  logError(message, error) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ${message}`);
    console.error(error);
    this.errors.push({
      timestamp,
      message,
      error: error.message || error
    });
  }

  // Fetch replies for a specific tweet using multiple fallback methods
  async fetchTweetReplies(tweetId, limit = 10, originalTweetAuthor = null) {
    const maxResults = Math.max(10, Math.min(limit * 2, 100));
    
    // Method 1: Enhanced conversation_id search with proper field expansion
    try {
      this.log(`🔍 Fetching replies for tweet ${tweetId} using conversation_id (Method 1)`);
      
      const replyResults = await this.client.v2.search(`conversation_id:${tweetId}`, {
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
        this.log(`✅ Method 1 found ${replies.length} potential replies`);
        return this.formatAndFilterReplies(replies, users, tweetId, limit);
      }
    } catch (error) {
      this.log(`⚠️ Method 1 failed: ${error.message}`);
    }
    
    // Method 2: Search by replies to specific user (if original author provided)
    if (originalTweetAuthor) {
      try {
        this.log(`🔍 Fetching replies using to:${originalTweetAuthor} search (Method 2)`);
        
        const replyResults = await this.client.v2.search(`to:${originalTweetAuthor} -is:retweet`, {
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
          this.log(`✅ Method 2 found ${conversationReplies.length} conversation replies`);
          return this.formatAndFilterReplies(conversationReplies, users, tweetId, limit);
        }
      } catch (error) {
        this.log(`⚠️ Method 2 failed: ${error.message}`);
      }
    }
    
    // Method 3: Simplified search without language filter
    try {
      this.log(`🔍 Fetching replies using simplified search (Method 3)`);
      
      const replyResults = await this.client.v2.search(`conversation_id:${tweetId} -is:retweet`, {
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
        this.log(`✅ Method 3 found ${replies.length} replies`);
        return this.formatAndFilterReplies(replies, users, tweetId, limit);
      }
    } catch (error) {
      this.log(`⚠️ Method 3 failed: ${error.message}`);
    }
    
    // All methods failed
    this.log(`❌ All reply fetching methods failed for tweet ${tweetId}`);
    return [];
  }
  
  // Helper method to format and filter replies
  formatAndFilterReplies(replies, users, originalTweetId, limit) {
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
        sentiment: this.calculateBasicSentiment(reply.text)
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
    
    this.log(`📱 Formatted ${sortedReplies.length} replies (top ${limit})`);
    return sortedReplies;
  }

  // Core keyword search function
  async searchKeyword(keyword, includeMentions = false, limit = 50, options = {}) {
    try {
      const { sort = null, location = null, global = false } = options;
      this.log(`🔍 Testing keyword: "${keyword}" | Mentions: ${includeMentions} | Limit: ${limit}`);
      if (sort) this.log(`🔧 Sort: ${sort}`);
      if (location && !global) this.log(`📍 Location: ${location}`);
      if (global) this.log(`🌍 Global search enabled`);
      
      const startTime = Date.now();
      
      // Build search query
      let searchQuery = keyword.trim();
      
      // Add mentions filter if not included
      if (!includeMentions) {
        searchQuery += ' -is:reply';
      }
      
      // Add location filter if specified and not global and flag allows
      if (location && includeLocation && !global) {
        // Add geographic filtering using Twitter's place operators
        searchQuery += ` place:${location}`;
      }
      
      // Remove spam and retweets for better quality
      // Add language filter only if flag allows and not doing global search
      if (global) {
        searchQuery += ' -is:retweet';
      } else if (language) {
        // Use specific language code from --lang parameter
        searchQuery += ` -is:retweet lang:${language}`;
      } else if (includeLang) {
        searchQuery += ' -is:retweet lang:en';
      } else {
        searchQuery += ' -is:retweet';
      }
      
      // Build API parameters
      const apiParams = {
        max_results: Math.min(limit, 100), // Twitter API limit
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
      if (sort === 'recent') {
        apiParams.sort_order = 'recency';
      } else if (sort === 'popular') {
        apiParams.sort_order = 'relevancy';
      }
      
      // Use GAME SDK to search tweets
      const searchResults = await this.client.v2.search(searchQuery, apiParams);
      
      const responseTime = Date.now() - startTime;
      
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
        
        // Calculate basic sentiment (using simple analysis for now)
        const sentiment = this.calculateBasicSentiment(tweet.text);
        
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
      
      // If mentions enabled, fetch top 10 replies for each tweet
      if (includeMentions) {
        this.log('📱 Fetching replies for tweets...');
        
        // Fetch replies for each tweet (limit to first 5 tweets to avoid rate limits)
        const tweetsToFetchReplies = formattedTweets.slice(0, 5);
        
        for (const tweet of tweetsToFetchReplies) {
          this.log(`🔍 Attempting to fetch replies for tweet ${tweet.id} by @${tweet.author.username}`);
          
          const replies = await this.fetchTweetReplies(tweet.id, 10, tweet.author.username);
          tweet.replies = replies;
          
          if (replies.length > 0) {
            this.log(`  ✅ Found ${replies.length} replies for tweet by @${tweet.author.username}`);
          } else {
            this.log(`  ⚠️ No replies found for tweet by @${tweet.author.username}`);
          }
          
          // Add delay between reply fetches to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      // Calculate analytics (now includes reply analytics if available)
      const analytics = this.generateAnalytics(formattedTweets, keyword, includeMentions);
      
      const testResult = {
        keyword,
        includeMentions,
        limit,
        responseTime,
        totalTweets: formattedTweets.length,
        analytics,
        tweets: formattedTweets,
        timestamp: new Date().toISOString(),
        success: true
      };
      
      this.results.push(testResult);
      
      this.log(`✅ Success: Found ${formattedTweets.length} tweets in ${responseTime}ms`);
      this.log(`📊 Analytics:`, {
        avgSentiment: analytics.avg_sentiment,
        engagementStats: analytics.engagement_stats,
        topHashtags: analytics.top_hashtags.slice(0, 3)
      });
      
      return testResult;
      
    } catch (error) {
      this.logError(`❌ Keyword search failed for "${keyword}"`, error);
      
      const failedResult = {
        keyword,
        includeMentions,
        limit,
        error: error.message,
        timestamp: new Date().toISOString(),
        success: false
      };
      
      this.results.push(failedResult);
      return failedResult;
    }
  }

  // Basic sentiment analysis function
  calculateBasicSentiment(text) {
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'best', 'awesome', 'perfect', 'happy', 'excited', 'brilliant'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disappointing', 'sucks', 'stupid', 'annoying', 'sad', 'angry', 'frustrated'];
    
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
  generateAnalytics(tweets, query, includeMentions = false) {
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

  // Validate response structure
  validateResponse(result) {
    const issues = [];
    
    if (!result.success) {
      issues.push('Request failed');
      return issues;
    }
    
    // Check basic structure
    if (!result.tweets || !Array.isArray(result.tweets)) {
      issues.push('Missing or invalid tweets array');
    }
    
    if (!result.analytics || typeof result.analytics !== 'object') {
      issues.push('Missing or invalid analytics object');
    }
    
    // Check tweets structure
    if (result.tweets.length > 0) {
      const tweet = result.tweets[0];
      
      if (!tweet.id || !tweet.text || !tweet.author) {
        issues.push('Invalid tweet structure');
      }
      
      if (!tweet.sentiment || typeof tweet.sentiment.score !== 'number') {
        issues.push('Invalid sentiment data');
      }
      
      if (!tweet.metrics || typeof tweet.metrics.likes !== 'number') {
        issues.push('Invalid metrics data');
      }
    }
    
    // Check analytics structure
    if (result.analytics) {
      const analytics = result.analytics;
      
      if (typeof analytics.avg_sentiment !== 'number' || 
          analytics.avg_sentiment < -1 || 
          analytics.avg_sentiment > 1) {
        issues.push('Invalid average sentiment');
      }
      
      if (!analytics.sentiment_distribution || 
          typeof analytics.sentiment_distribution.positive !== 'number') {
        issues.push('Invalid sentiment distribution');
      }
    }
    
    return issues;
  }

  // Run comprehensive keyword analysis tests
  async runAllTests() {
    this.log('🚀 Starting Keyword Analysis Tests');
    this.startTime = Date.now();
    
    // Initialize client
    if (!this.initializeClient()) {
      this.log('❌ Cannot proceed without Twitter client');
      return;
    }
    
    // Test each keyword with different configurations
    for (const keyword of this.testKeywords) {
      for (const includeMentions of this.mentionOptions) {
        for (const limit of this.testLimits) {
          try {
            const result = await this.searchKeyword(keyword, includeMentions, limit, { location });
            
            // Validate response
            const validationIssues = this.validateResponse(result);
            if (validationIssues.length > 0) {
              this.logError(`Validation issues for "${keyword}"`, validationIssues);
            }
            
            // Small delay to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
            
          } catch (error) {
            this.logError(`Test failed for "${keyword}"`, error);
          }
        }
      }
    }
    
    // Generate final report
    this.generateReport();
  }

  // Generate comprehensive test report
  generateReport() {
    const totalTime = Date.now() - this.startTime;
    const successfulTests = this.results.filter(r => r.success);
    const failedTests = this.results.filter(r => !r.success);
    
    this.log('\n📊 KEYWORD ANALYSIS TEST REPORT');
    this.log('=====================================');
    this.log(`Total Tests: ${this.results.length}`);
    this.log(`Successful: ${successfulTests.length}`);
    this.log(`Failed: ${failedTests.length}`);
    this.log(`Success Rate: ${((successfulTests.length / this.results.length) * 100).toFixed(1)}%`);
    this.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    
    if (successfulTests.length > 0) {
      const avgResponseTime = successfulTests.reduce((sum, r) => sum + r.responseTime, 0) / successfulTests.length;
      const avgTweets = successfulTests.reduce((sum, r) => sum + r.totalTweets, 0) / successfulTests.length;
      const avgSentiment = successfulTests.reduce((sum, r) => sum + r.analytics.avg_sentiment, 0) / successfulTests.length;
      
      this.log('\n📈 Performance Metrics:');
      this.log(`Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
      this.log(`Average Tweets per Request: ${avgTweets.toFixed(1)}`);
      this.log(`Average Sentiment Score: ${avgSentiment.toFixed(2)}`);
    }
    
    if (failedTests.length > 0) {
      this.log('\n❌ Failed Tests:');
      failedTests.forEach(test => {
        this.log(`- ${test.keyword} (${test.error})`);
      });
    }
    
    this.log('\n🔧 Test Summary by Keyword:');
    this.testKeywords.forEach(keyword => {
      const keywordTests = this.results.filter(r => r.keyword === keyword);
      const successful = keywordTests.filter(r => r.success).length;
      this.log(`- "${keyword}": ${successful}/${keywordTests.length} successful`);
    });
    
    // Save results to file
    this.saveResults();
  }

  // Save test results to JSON file
  saveResults() {
    const report = {
      testName: 'Keyword Analysis Test',
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        totalTime: Date.now() - this.startTime
      },
      results: this.results,
      errors: this.errors
    };
    
    // In a real Node.js environment, you would save to file:
    // fs.writeFileSync('keyword-analysis-results.json', JSON.stringify(report, null, 2));
    
    this.log('\n💾 Test results ready for analysis');
    this.log('Results object available in this.results');
  }
}

// Execute tests if running directly
async function runTests() {
  const test = new KeywordAnalysisTest();
  await test.runAllTests();
  return test;
}

// Export for use in other modules
export { KeywordAnalysisTest, runTests };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}