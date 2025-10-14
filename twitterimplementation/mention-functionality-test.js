/**
 * Twitter Mention Functionality Test
 * 
 * Comprehensive testing of mention inclusion/exclusion functionality
 * Compares results with and without mentions for the same queries
 */

import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class MentionFunctionalityTest {
  constructor() {
    this.results = [];
    this.comparisons = [];
    this.errors = [];
    this.startTime = null;
    this.client = null;
    
    // Test configurations for mention analysis
    this.testQueries = [
      { type: 'keyword', query: 'artificial intelligence' },
      { type: 'keyword', query: 'cryptocurrency' },
      { type: 'keyword', query: 'climate change' },
      { type: 'hashtag', hashtags: ['#AI'] },
      { type: 'hashtag', hashtags: ['#crypto', '#blockchain'] },
      { type: 'hashtag', hashtags: ['#javascript', '#webdev'] }
    ];
    
    this.testLimits = [25, 50];
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

  // Core search function with mention control
  async searchWithMentionControl(queryData, includeMentions = false, limit = 50) {
    try {
      const queryDescription = queryData.type === 'keyword' ? 
        `"${queryData.query}"` : 
        queryData.hashtags.join(', ');
        
      this.log(`🔍 Testing ${queryData.type}: ${queryDescription} | Mentions: ${includeMentions} | Limit: ${limit}`);
      
      const startTime = Date.now();
      
      // Build search query based on type
      let searchQuery;
      if (queryData.type === 'keyword') {
        searchQuery = queryData.query.trim();
      } else {
        // Format hashtags
        const formattedHashtags = queryData.hashtags.map(h => h.startsWith('#') ? h : `#${h}`);
        searchQuery = formattedHashtags.join(' OR ');
      }
      
      // Add mentions filter if not included
      if (!includeMentions) {
        searchQuery += ' -is:reply';
      }
      
      // Remove spam and retweets for better quality
      searchQuery += ' -is:retweet lang:en';
      
      // Use GAME SDK to search tweets
      const searchResults = await this.client.v2.search(searchQuery, {
        max_results: Math.min(limit, 100), // Twitter API limit
        'tweet.fields': [
          'created_at',
          'public_metrics',
          'context_annotations',
          'entities',
          'referenced_tweets',
          'author_id',
          'in_reply_to_user_id'
        ].join(','),
        'user.fields': [
          'username',
          'name',
          'verified',
          'public_metrics',
          'profile_image_url'
        ].join(','),
        expansions: 'author_id,referenced_tweets.id,in_reply_to_user_id'
      });
      
      const responseTime = Date.now() - startTime;
      
      // Process and format results
      const tweets = searchResults.data?.data || [];
      const users = searchResults.data?.includes?.users || [];
      
      // Create user lookup map
      const userMap = new Map();
      users.forEach(user => userMap.set(user.id, user));
      
      // Format tweets with mention analysis
      const formattedTweets = tweets.map(tweet => {
        const author = userMap.get(tweet.author_id);
        
        // Analyze tweet type
        const isReply = !!tweet.in_reply_to_user_id;
        const isRetweet = !!tweet.referenced_tweets?.some(ref => ref.type === 'retweeted');
        const hasMentions = !!tweet.entities?.mentions?.length;
        
        // Extract hashtags and mentions
        const hashtags = tweet.entities?.hashtags?.map(tag => `#${tag.tag}`) || [];
        const mentions = tweet.entities?.mentions?.map(mention => `@${mention.username}`) || [];
        
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
            followers: author?.public_metrics?.followers_count || 0
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
          tweetType: {
            isReply,
            isRetweet,
            hasMentions,
            isOriginal: !isReply && !isRetweet
          },
          hashtags,
          mentions,
          url: `https://twitter.com/${author?.username}/status/${tweet.id}`
        };
      });
      
      // Generate mention-specific analytics
      const analytics = this.generateMentionAnalytics(formattedTweets, queryData);
      
      const testResult = {
        queryData,
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
      this.log(`📊 Tweet Types:`, {
        original: analytics.tweet_types.original,
        replies: analytics.tweet_types.replies,
        withMentions: analytics.tweet_types.with_mentions
      });
      
      return testResult;
      
    } catch (error) {
      this.logError(`❌ Search failed for mentions=${includeMentions}`, error);
      
      const failedResult = {
        queryData,
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

  // Generate mention-specific analytics
  generateMentionAnalytics(tweets, queryData) {
    if (tweets.length === 0) {
      return {
        total_tweets: 0,
        tweet_types: { original: 0, replies: 0, with_mentions: 0, without_mentions: 0 },
        avg_sentiment: 0,
        sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
        engagement_stats: { avg_likes: 0, avg_retweets: 0, total_engagement: 0 },
        mention_patterns: {}
      };
    }
    
    // Analyze tweet types
    const tweetTypes = {
      original: tweets.filter(t => t.tweetType.isOriginal).length,
      replies: tweets.filter(t => t.tweetType.isReply).length,
      with_mentions: tweets.filter(t => t.tweetType.hasMentions).length,
      without_mentions: tweets.filter(t => !t.tweetType.hasMentions).length
    };
    
    // Sentiment analysis
    const sentimentCounts = tweets.reduce((acc, tweet) => {
      acc[tweet.sentiment.label]++;
      return acc;
    }, { positive: 0, negative: 0, neutral: 0 });
    
    const avgSentiment = tweets.reduce((sum, tweet) => sum + tweet.sentiment.score, 0) / tweets.length;
    
    // Engagement comparison between original and reply tweets
    const originalTweets = tweets.filter(t => t.tweetType.isOriginal);
    const replyTweets = tweets.filter(t => t.tweetType.isReply);
    
    const originalEngagement = originalTweets.length > 0 ? 
      originalTweets.reduce((sum, t) => sum + t.metrics.likes + t.metrics.retweets, 0) / originalTweets.length : 0;
    const replyEngagement = replyTweets.length > 0 ? 
      replyTweets.reduce((sum, t) => sum + t.metrics.likes + t.metrics.retweets, 0) / replyTweets.length : 0;
    
    // Mention patterns analysis
    const mentionPatterns = {};
    tweets.filter(t => t.mentions.length > 0).forEach(tweet => {
      const mentionCount = tweet.mentions.length;
      mentionPatterns[mentionCount] = (mentionPatterns[mentionCount] || 0) + 1;
    });
    
    // Overall engagement stats
    const totalLikes = tweets.reduce((sum, tweet) => sum + tweet.metrics.likes, 0);
    const totalRetweets = tweets.reduce((sum, tweet) => sum + tweet.metrics.retweets, 0);
    const totalReplies = tweets.reduce((sum, tweet) => sum + tweet.metrics.replies, 0);
    
    return {
      total_tweets: tweets.length,
      tweet_types: tweetTypes,
      avg_sentiment: Number(avgSentiment.toFixed(2)),
      sentiment_distribution: sentimentCounts,
      engagement_stats: {
        avg_likes: Math.floor(totalLikes / tweets.length),
        avg_retweets: Math.floor(totalRetweets / tweets.length),
        total_engagement: totalLikes + totalRetweets + totalReplies,
        original_vs_reply_engagement: {
          original_avg: Math.floor(originalEngagement),
          reply_avg: Math.floor(replyEngagement)
        }
      },
      mention_patterns: mentionPatterns
    };
  }

  // Compare mention vs no-mention results for the same query
  async compareResults(queryData, limit = 50) {
    this.log(`\n🔄 Comparing mention inclusion for ${queryData.type}: ${JSON.stringify(queryData)}`);
    
    // Search without mentions
    const withoutMentions = await this.searchWithMentionControl(queryData, false, limit);
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Search with mentions
    const withMentions = await this.searchWithMentionControl(queryData, true, limit);
    
    if (withoutMentions.success && withMentions.success) {
      const comparison = this.analyzeComparison(withoutMentions, withMentions);
      this.comparisons.push(comparison);
      
      this.log('📊 Comparison Results:');
      this.log(`Without mentions: ${withoutMentions.totalTweets} tweets (${withoutMentions.analytics.tweet_types.original} original)`);
      this.log(`With mentions: ${withMentions.totalTweets} tweets (${withMentions.analytics.tweet_types.original} original, ${withMentions.analytics.tweet_types.replies} replies)`);
      this.log(`Volume increase: ${comparison.volume_increase.toFixed(1)}%`);
      this.log(`Engagement change: ${comparison.engagement_change.toFixed(1)}%`);
      this.log(`Sentiment change: ${comparison.sentiment_change.toFixed(3)}`);
      
      return comparison;
    } else {
      this.logError('Comparison failed', { withoutMentions: withoutMentions.success, withMentions: withMentions.success });
      return null;
    }
  }

  // Analyze the differences between mention and no-mention results
  analyzeComparison(withoutMentions, withMentions) {
    const volumeIncrease = withoutMentions.totalTweets > 0 ? 
      ((withMentions.totalTweets - withoutMentions.totalTweets) / withoutMentions.totalTweets) * 100 : 0;
    
    const engagementChange = withoutMentions.analytics.engagement_stats.total_engagement > 0 ?
      ((withMentions.analytics.engagement_stats.total_engagement - withoutMentions.analytics.engagement_stats.total_engagement) / 
       withoutMentions.analytics.engagement_stats.total_engagement) * 100 : 0;
    
    const sentimentChange = withMentions.analytics.avg_sentiment - withoutMentions.analytics.avg_sentiment;
    
    return {
      queryData: withoutMentions.queryData,
      timestamp: new Date().toISOString(),
      without_mentions: {
        total_tweets: withoutMentions.totalTweets,
        original_tweets: withoutMentions.analytics.tweet_types.original,
        avg_engagement: withoutMentions.analytics.engagement_stats.total_engagement / withoutMentions.totalTweets,
        avg_sentiment: withoutMentions.analytics.avg_sentiment,
        response_time: withoutMentions.responseTime
      },
      with_mentions: {
        total_tweets: withMentions.totalTweets,
        original_tweets: withMentions.analytics.tweet_types.original,
        reply_tweets: withMentions.analytics.tweet_types.replies,
        avg_engagement: withMentions.analytics.engagement_stats.total_engagement / withMentions.totalTweets,
        avg_sentiment: withMentions.analytics.avg_sentiment,
        response_time: withMentions.responseTime
      },
      differences: {
        volume_increase: volumeIncrease,
        engagement_change: engagementChange,
        sentiment_change: sentimentChange,
        content_diversity: {
          additional_replies: withMentions.analytics.tweet_types.replies,
          mention_patterns: withMentions.analytics.mention_patterns
        }
      }
    };
  }

  // Validate mention-specific response structure
  validateMentionResponse(result) {
    const issues = [];
    
    if (!result.success) {
      issues.push('Request failed');
      return issues;
    }
    
    // Check mention-specific fields
    if (!result.analytics || !result.analytics.tweet_types) {
      issues.push('Missing tweet type analysis');
    }
    
    if (result.tweets.length > 0) {
      const tweet = result.tweets[0];
      
      if (!tweet.tweetType || typeof tweet.tweetType.isReply !== 'boolean') {
        issues.push('Invalid tweet type structure');
      }
      
      if (!Array.isArray(tweet.mentions)) {
        issues.push('Invalid mentions structure');
      }
    }
    
    // Validate tweet type counts
    if (result.analytics.tweet_types) {
      const types = result.analytics.tweet_types;
      const totalCounted = types.original + types.replies;
      
      if (Math.abs(totalCounted - result.totalTweets) > result.totalTweets * 0.1) {
        issues.push('Tweet type counts do not match total');
      }
    }
    
    return issues;
  }

  // Run comprehensive mention functionality tests
  async runAllTests() {
    this.log('🚀 Starting Mention Functionality Tests');
    this.startTime = Date.now();
    
    // Initialize client
    if (!this.initializeClient()) {
      this.log('❌ Cannot proceed without Twitter client');
      return;
    }
    
    // Test each query with mention comparison
    for (const queryData of this.testQueries) {
      for (const limit of this.testLimits) {
        try {
          const comparison = await this.compareResults(queryData, limit);
          
          if (comparison) {
            // Validate both results
            const withoutResult = this.results.find(r => 
              r.queryData === queryData && 
              r.includeMentions === false && 
              r.limit === limit
            );
            const withResult = this.results.find(r => 
              r.queryData === queryData && 
              r.includeMentions === true && 
              r.limit === limit
            );
            
            if (withoutResult) {
              const validationIssues = this.validateMentionResponse(withoutResult);
              if (validationIssues.length > 0) {
                this.logError(`Validation issues for without mentions`, validationIssues);
              }
            }
            
            if (withResult) {
              const validationIssues = this.validateMentionResponse(withResult);
              if (validationIssues.length > 0) {
                this.logError(`Validation issues for with mentions`, validationIssues);
              }
            }
          }
          
          // Delay between query sets
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          this.logError(`Mention comparison failed for ${JSON.stringify(queryData)}`, error);
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
    
    this.log('\n📊 MENTION FUNCTIONALITY TEST REPORT');
    this.log('==========================================');
    this.log(`Total Tests: ${this.results.length}`);
    this.log(`Successful: ${successfulTests.length}`);
    this.log(`Failed: ${failedTests.length}`);
    this.log(`Success Rate: ${((successfulTests.length / this.results.length) * 100).toFixed(1)}%`);
    this.log(`Total Comparisons: ${this.comparisons.length}`);
    this.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    
    if (this.comparisons.length > 0) {
      this.log('\n📈 Mention Impact Analysis:');
      
      const avgVolumeIncrease = this.comparisons.reduce((sum, c) => sum + c.differences.volume_increase, 0) / this.comparisons.length;
      const avgEngagementChange = this.comparisons.reduce((sum, c) => sum + c.differences.engagement_change, 0) / this.comparisons.length;
      const avgSentimentChange = this.comparisons.reduce((sum, c) => sum + c.differences.sentiment_change, 0) / this.comparisons.length;
      
      this.log(`Average Volume Increase: ${avgVolumeIncrease.toFixed(1)}%`);
      this.log(`Average Engagement Change: ${avgEngagementChange.toFixed(1)}%`);
      this.log(`Average Sentiment Change: ${avgSentimentChange.toFixed(3)}`);
      
      this.log('\n🔍 Detailed Comparisons:');
      this.comparisons.forEach((comp, index) => {
        const queryDesc = comp.queryData.type === 'keyword' ? 
          comp.queryData.query : 
          comp.queryData.hashtags.join(', ');
        
        this.log(`${index + 1}. ${comp.queryData.type}: ${queryDesc}`);
        this.log(`   Volume: ${comp.without_mentions.total_tweets} → ${comp.with_mentions.total_tweets} (+${comp.differences.volume_increase.toFixed(1)}%)`);
        this.log(`   Replies added: ${comp.with_mentions.reply_tweets}`);
        this.log(`   Engagement change: ${comp.differences.engagement_change.toFixed(1)}%`);
        this.log(`   Sentiment change: ${comp.differences.sentiment_change.toFixed(3)}`);
      });
    }
    
    if (failedTests.length > 0) {
      this.log('\n❌ Failed Tests:');
      failedTests.forEach(test => {
        const queryDesc = test.queryData.type === 'keyword' ? 
          test.queryData.query : 
          test.queryData.hashtags.join(', ');
        this.log(`- ${test.queryData.type}: ${queryDesc} (${test.error})`);
      });
    }
    
    // Save results to file
    this.saveResults();
  }

  // Save test results to JSON file
  saveResults() {
    const report = {
      testName: 'Mention Functionality Test',
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        totalComparisons: this.comparisons.length,
        totalTime: Date.now() - this.startTime
      },
      results: this.results,
      comparisons: this.comparisons,
      errors: this.errors
    };
    
    this.log('\n💾 Mention functionality test results ready for analysis');
    this.log('Results and comparisons available in this.results and this.comparisons');
  }
}

// Execute tests if running directly
async function runTests() {
  const test = new MentionFunctionalityTest();
  await test.runAllTests();
  return test;
}

// Export for use in other modules
export { MentionFunctionalityTest, runTests };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}