/**
 * Twitter Hashtag Analysis Test
 * 
 * Comprehensive testing of hashtag search functionality using real GAME SDK API calls
 * Tests single hashtags, multiple hashtag combinations, and hashtag-specific features
 */

import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class HashtagAnalysisTest {
  constructor() {
    this.results = [];
    this.errors = [];
    this.startTime = null;
    this.client = null;
    
    // Test configurations for hashtag analysis
    this.singleHashtags = [
      '#AI',
      '#crypto',
      '#javascript',
      '#climate',
      '#technology'
    ];
    
    this.multipleHashtagCombinations = [
      ['#AI', '#MachineLearning'],
      ['#crypto', '#blockchain', '#bitcoin'],
      ['#javascript', '#webdev', '#programming'],
      ['#climate', '#sustainability'],
      ['#technology', '#innovation', '#startup']
    ];
    
    this.hashtagFormats = [
      { input: 'AI', expected: '#AI' },
      { input: '#crypto', expected: '#crypto' },
      { input: 'javascript', expected: '#javascript' },
      { input: '#webdev', expected: '#webdev' }
    ];
    
    this.testLimits = [10, 25, 50];
    this.mentionOptions = [true, false];
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

  // Format hashtag input (ensure it starts with #)
  formatHashtag(hashtag) {
    const cleaned = hashtag.trim().replace(/^#/, '');
    return `#${cleaned}`;
  }
  
  // Discover top hashtags from keyword search based on engagement
  async discoverTopHashtags(keyword, limit = 5) {
    try {
      this.log(`🔍 Discovering top hashtags for keyword: "${keyword}"`);
      
      const startTime = Date.now();
      
      // Search tweets with the keyword to find hashtags
      const searchQuery = `${keyword} -is:retweet lang:en`;
      
      const searchResults = await this.client.v2.search(searchQuery, {
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
        this.log(`❌ No tweets found for keyword "${keyword}"`);
        return { success: false, hashtags: [] };
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
          engagementScore: Math.floor(engagementScore),
          topTweet: metric.tweets.sort((a, b) => b.engagement - a.engagement)[0]
        };
      });
      
      // Sort by engagement score and get top hashtags
      const topHashtags = hashtagScores
        .sort((a, b) => b.engagementScore - a.engagementScore)
        .slice(0, limit);
      
      const discoveryTime = Date.now() - startTime;
      
      this.log(`✅ Discovered ${Object.keys(hashtagMetrics).length} unique hashtags in ${discoveryTime}ms`);
      this.log(`📊 Top ${limit} hashtags by engagement:`);
      
      topHashtags.forEach((hashtag, index) => {
        this.log(`  ${index + 1}. ${hashtag.hashtag} - Score: ${hashtag.engagementScore}`);
        this.log(`     Frequency: ${hashtag.frequency} | Avg Engagement: ${hashtag.avgEngagement} | Avg Reach: ${hashtag.avgReach}`);
      });
      
      return {
        success: true,
        keyword,
        totalTweetsAnalyzed: tweets.length,
        totalHashtagsFound: Object.keys(hashtagMetrics).length,
        discoveryTime,
        hashtags: topHashtags.map(h => h.hashtag),
        detailedMetrics: topHashtags
      };
      
    } catch (error) {
      this.logError(`❌ Hashtag discovery failed for keyword "${keyword}"`, error);
      return { 
        success: false, 
        hashtags: [],
        error: error.message 
      };
    }
  }

  // Fetch replies for a specific tweet using multiple fallback methods (adapted from keyword analysis)
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
  
  // Helper method to format and filter replies (adapted from keyword analysis)
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

  // Core hashtag search function
  async searchHashtags(hashtags, includeMentions = false, limit = 50, options = {}) {
    try {
      const formattedHashtags = hashtags.map(h => this.formatHashtag(h));
      const { sort = null, location = null, global = false } = options;
      this.log(`🏷️ Testing hashtags: ${formattedHashtags.join(', ')} | Mentions: ${includeMentions} | Limit: ${limit}`);
      if (sort) this.log(`🔧 Sort: ${sort}`);
      if (location && !global) this.log(`📍 Location: ${location}`);
      if (global) this.log(`🌍 Global search enabled`);
      
      const startTime = Date.now();
      
      // Build search query for hashtags
      let searchQuery = formattedHashtags.join(' OR ');
      
      // Add mentions filter if not included
      if (!includeMentions) {
        searchQuery += ' -is:reply';
      }
      
      // Add location filter if specified and not global
      if (location && !global) {
        // Add geographic filtering using Twitter's place operators
        searchQuery += ` place:${location}`;
      }
      
      // Remove spam and retweets for better quality
      // Only add language filter if not doing global search
      if (global) {
        searchQuery += ' -is:retweet';
      } else {
        searchQuery += ' -is:retweet lang:en';
      }
      
      // Build API parameters
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
      
      // Create user lookup map
      const userMap = new Map();
      users.forEach(user => userMap.set(user.id, user));
      
      // Format tweets with enhanced data and hashtag analysis
      const formattedTweets = tweets.map(tweet => {
        const author = userMap.get(tweet.author_id);
        
        // Extract hashtags from tweet
        const tweetHashtags = tweet.entities?.hashtags?.map(tag => `#${tag.tag}`) || [];
        
        // Check which search hashtags appear in this tweet
        const matchingHashtags = formattedHashtags.filter(searchTag => 
          tweetHashtags.some(tweetTag => 
            tweetTag.toLowerCase() === searchTag.toLowerCase()
          )
        );
        
        // Calculate basic sentiment
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
          hashtags: tweetHashtags,
          matchingHashtags: matchingHashtags,
          url: `https://twitter.com/${author?.username}/status/${tweet.id}`,
          replies: [] // Will be populated if mentions is enabled
        };
      });
      
      // If mentions enabled, fetch top 10 replies for each tweet
      if (includeMentions) {
        this.log('📱 Fetching replies for hashtag tweets...');
        
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
      
      // Generate hashtag-specific analytics (now includes reply analytics if available)
      const analytics = this.generateHashtagAnalytics(formattedTweets, formattedHashtags, includeMentions);
      
      const testResult = {
        searchHashtags: formattedHashtags,
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
      this.log(`📊 Hashtag Analytics:`, {
        hashtagPerformance: analytics.hashtag_performance,
        avgSentiment: analytics.avg_sentiment,
        topInfluencers: analytics.top_influencers.slice(0, 2)
      });
      
      return testResult;
      
    } catch (error) {
      this.logError(`❌ Hashtag search failed for ${hashtags.join(', ')}`, error);
      
      const failedResult = {
        searchHashtags: hashtags,
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
    const confidence = Math.min(matches / 10, 1);
    
    let label = 'neutral';
    if (normalizedScore > 0.01) label = 'positive';
    else if (normalizedScore < -0.01) label = 'negative';
    
    return {
      label,
      score: Math.max(-1, Math.min(1, normalizedScore * 10)),
      confidence: Math.max(0.3, confidence)
    };
  }

  // Generate hashtag-specific analytics
  generateHashtagAnalytics(tweets, searchHashtags, includeMentions = false) {
    if (tweets.length === 0) {
      return {
        total_tweets: 0,
        avg_sentiment: 0,
        sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
        hashtag_performance: {},
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
    
    // Hashtag performance analysis
    const hashtagPerformance = {};
    searchHashtags.forEach(hashtag => {
      const hashtagTweets = tweets.filter(tweet => 
        tweet.matchingHashtags.includes(hashtag)
      );
      
      if (hashtagTweets.length > 0) {
        const avgLikes = hashtagTweets.reduce((sum, t) => sum + t.metrics.likes, 0) / hashtagTweets.length;
        const avgRetweets = hashtagTweets.reduce((sum, t) => sum + t.metrics.retweets, 0) / hashtagTweets.length;
        const avgSentimentForTag = hashtagTweets.reduce((sum, t) => sum + t.sentiment.score, 0) / hashtagTweets.length;
        
        hashtagPerformance[hashtag] = {
          tweet_count: hashtagTweets.length,
          avg_likes: Math.floor(avgLikes),
          avg_retweets: Math.floor(avgRetweets),
          avg_sentiment: Number(avgSentimentForTag.toFixed(2)),
          engagement_rate: Math.floor((avgLikes + avgRetweets) / 2)
        };
      }
    });
    
    // All hashtags found in tweets
    const allHashtagCounts = {};
    tweets.forEach(tweet => {
      tweet.hashtags.forEach(tag => {
        allHashtagCounts[tag] = (allHashtagCounts[tag] || 0) + 1;
      });
    });
    
    const topHashtags = Object.entries(allHashtagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15)
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
      hashtag_performance: hashtagPerformance,
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

  // Test hashtag format handling
  async testHashtagFormats() {
    this.log('\n🔧 Testing Hashtag Format Handling');
    
    for (const format of this.hashtagFormats) {
      const formatted = this.formatHashtag(format.input);
      const passed = formatted === format.expected;
      
      this.log(`Input: "${format.input}" → Output: "${formatted}" → Expected: "${format.expected}" → ${passed ? '✅' : '❌'}`);
      
      if (!passed) {
        this.logError(`Format test failed`, { input: format.input, output: formatted, expected: format.expected });
      }
    }
  }

  // Compare single vs multiple hashtag performance
  async compareHashtagPerformance() {
    this.log('\n📊 Comparing Single vs Multiple Hashtag Performance');
    
    // Test single hashtag
    const singleResult = await this.searchHashtags(['#AI'], false, 25);
    
    // Test multiple hashtags
    const multipleResult = await this.searchHashtags(['#AI', '#MachineLearning'], false, 25);
    
    if (singleResult.success && multipleResult.success) {
      this.log('Performance Comparison:');
      this.log(`Single hashtag (#AI): ${singleResult.totalTweets} tweets, ${singleResult.responseTime}ms`);
      this.log(`Multiple hashtags (#AI + #MachineLearning): ${multipleResult.totalTweets} tweets, ${multipleResult.responseTime}ms`);
      
      const singleEngagement = singleResult.analytics.engagement_stats.total_engagement / singleResult.totalTweets;
      const multipleEngagement = multipleResult.analytics.engagement_stats.total_engagement / multipleResult.totalTweets;
      
      this.log(`Single hashtag avg engagement: ${singleEngagement.toFixed(1)}`);
      this.log(`Multiple hashtags avg engagement: ${multipleEngagement.toFixed(1)}`);
    }
  }

  // Validate hashtag-specific response structure
  validateHashtagResponse(result) {
    const issues = [];
    
    if (!result.success) {
      issues.push('Request failed');
      return issues;
    }
    
    // Check hashtag-specific fields
    if (!result.searchHashtags || !Array.isArray(result.searchHashtags)) {
      issues.push('Missing or invalid searchHashtags array');
    }
    
    if (!result.analytics || !result.analytics.hashtag_performance) {
      issues.push('Missing hashtag performance analytics');
    }
    
    // Check tweets have matching hashtags
    if (result.tweets.length > 0) {
      const tweet = result.tweets[0];
      
      if (!tweet.hashtags || !Array.isArray(tweet.hashtags)) {
        issues.push('Invalid tweet hashtags structure');
      }
      
      if (!tweet.matchingHashtags || !Array.isArray(tweet.matchingHashtags)) {
        issues.push('Missing matching hashtags analysis');
      }
    }
    
    // Validate hashtag performance data
    if (result.analytics.hashtag_performance) {
      const performance = result.analytics.hashtag_performance;
      
      result.searchHashtags.forEach(hashtag => {
        if (performance[hashtag]) {
          const perf = performance[hashtag];
          if (typeof perf.tweet_count !== 'number' || 
              typeof perf.avg_likes !== 'number' ||
              typeof perf.avg_sentiment !== 'number') {
            issues.push(`Invalid performance data for ${hashtag}`);
          }
        }
      });
    }
    
    return issues;
  }

  // Run comprehensive hashtag analysis tests
  async runAllTests() {
    this.log('🚀 Starting Hashtag Analysis Tests');
    this.startTime = Date.now();
    
    // Initialize client
    if (!this.initializeClient()) {
      this.log('❌ Cannot proceed without Twitter client');
      return;
    }
    
    // Test hashtag format handling
    await this.testHashtagFormats();
    
    // Test single hashtags
    this.log('\n🏷️ Testing Single Hashtags');
    for (const hashtag of this.singleHashtags) {
      for (const includeMentions of this.mentionOptions) {
        try {
          const result = await this.searchHashtags([hashtag], includeMentions, 25);
          
          // Validate response
          const validationIssues = this.validateHashtagResponse(result);
          if (validationIssues.length > 0) {
            this.logError(`Validation issues for ${hashtag}`, validationIssues);
          }
          
          // Small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          this.logError(`Single hashtag test failed for ${hashtag}`, error);
        }
      }
    }
    
    // Test multiple hashtag combinations
    this.log('\n🏷️ Testing Multiple Hashtag Combinations');
    for (const hashtagCombo of this.multipleHashtagCombinations) {
      try {
        const result = await this.searchHashtags(hashtagCombo, false, 30);
        
        // Validate response
        const validationIssues = this.validateHashtagResponse(result);
        if (validationIssues.length > 0) {
          this.logError(`Validation issues for ${hashtagCombo.join(', ')}`, validationIssues);
        }
        
        // Analyze hashtag performance within this search
        if (result.success && result.analytics.hashtag_performance) {
          this.log(`Performance breakdown for ${hashtagCombo.join(', ')}:`);
          Object.entries(result.analytics.hashtag_performance).forEach(([tag, perf]) => {
            this.log(`  ${tag}: ${perf.tweet_count} tweets, ${perf.avg_likes} avg likes, ${perf.avg_sentiment} sentiment`);
          });
        }
        
        // Delay between tests
        await new Promise(resolve => setTimeout(resolve, 1500));
        
      } catch (error) {
        this.logError(`Multiple hashtag test failed for ${hashtagCombo.join(', ')}`, error);
      }
    }
    
    // Compare performance
    await this.compareHashtagPerformance();
    
    // Generate final report
    this.generateReport();
  }

  // Generate comprehensive test report
  generateReport() {
    const totalTime = Date.now() - this.startTime;
    const successfulTests = this.results.filter(r => r.success);
    const failedTests = this.results.filter(r => !r.success);
    
    this.log('\n📊 HASHTAG ANALYSIS TEST REPORT');
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
      
      // Hashtag performance summary
      this.log('\n🏷️ Top Performing Hashtags:');
      const allHashtagPerformance = {};
      
      successfulTests.forEach(test => {
        if (test.analytics.hashtag_performance) {
          Object.entries(test.analytics.hashtag_performance).forEach(([tag, perf]) => {
            if (!allHashtagPerformance[tag]) {
              allHashtagPerformance[tag] = [];
            }
            allHashtagPerformance[tag].push(perf);
          });
        }
      });
      
      Object.entries(allHashtagPerformance).forEach(([tag, performances]) => {
        const avgEngagement = performances.reduce((sum, p) => sum + p.engagement_rate, 0) / performances.length;
        const avgSentiment = performances.reduce((sum, p) => sum + p.avg_sentiment, 0) / performances.length;
        this.log(`  ${tag}: ${avgEngagement.toFixed(1)} avg engagement, ${avgSentiment.toFixed(2)} sentiment`);
      });
    }
    
    if (failedTests.length > 0) {
      this.log('\n❌ Failed Tests:');
      failedTests.forEach(test => {
        this.log(`- ${test.searchHashtags.join(', ')} (${test.error})`);
      });
    }
    
    // Save results to file
    this.saveResults();
  }

  // Save test results to JSON file
  saveResults() {
    const report = {
      testName: 'Hashtag Analysis Test',
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
    
    this.log('\n💾 Hashtag test results ready for analysis');
    this.log('Results object available in this.results');
  }
}

// Execute tests if running directly
async function runTests() {
  const test = new HashtagAnalysisTest();
  await test.runAllTests();
  return test;
}

// Export for use in other modules
export { HashtagAnalysisTest, runTests };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}