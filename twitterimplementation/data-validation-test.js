/**
 * Twitter Data Validation Test
 * 
 * Comprehensive testing of response data quality and structure
 * Validates tweet data, sentiment analysis, and analytics accuracy
 */

import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class DataValidationTest {
  constructor() {
    this.results = [];
    this.validationResults = [];
    this.dataQualityMetrics = {};
    this.startTime = null;
    this.client = null;
    
    // Validation test queries
    this.testQueries = [
      { type: 'keyword', query: 'artificial intelligence', limit: 50 },
      { type: 'keyword', query: 'cryptocurrency bitcoin', limit: 30 },
      { type: 'hashtag', hashtags: ['#AI', '#MachineLearning'], limit: 40 },
      { type: 'hashtag', hashtags: ['#javascript'], limit: 25 },
      { type: 'keyword', query: 'climate change', limit: 35 }
    ];
    
    // Data validation schemas
    this.tweetSchema = {
      required: ['id', 'text', 'created_at', 'author', 'metrics', 'sentiment'],
      authorRequired: ['id', 'username', 'name'],
      metricsRequired: ['likes', 'retweets', 'replies'],
      sentimentRequired: ['label', 'score', 'confidence']
    };
    
    this.analyticsSchema = {
      required: [
        'total_tweets', 'avg_sentiment', 'sentiment_distribution', 
        'engagement_stats', 'top_hashtags', 'top_influencers'
      ],
      sentimentDistributionRequired: ['positive', 'negative', 'neutral'],
      engagementStatsRequired: ['avg_likes', 'avg_retweets', 'total_engagement']
    };
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
  }

  // Core search function for data collection
  async searchAndValidate(queryData) {
    try {
      const queryDescription = queryData.type === 'keyword' ? 
        `"${queryData.query}"` : 
        queryData.hashtags.join(', ');
        
      this.log(`🔍 Collecting data for validation: ${queryData.type} - ${queryDescription}`);
      
      const startTime = Date.now();
      
      // Build search query
      let searchQuery;
      if (queryData.type === 'keyword') {
        searchQuery = queryData.query.trim();
      } else {
        const formattedHashtags = queryData.hashtags.map(h => h.startsWith('#') ? h : `#${h}`);
        searchQuery = formattedHashtags.join(' OR ');
      }
      
      // Add filters
      searchQuery += ' -is:retweet lang:en';
      
      // Use GAME SDK to search tweets
      const searchResults = await this.client.v2.search(searchQuery, {
        max_results: Math.min(queryData.limit, 100),
        'tweet.fields': [
          'created_at',
          'public_metrics',
          'context_annotations',
          'entities',
          'referenced_tweets',
          'author_id',
          'lang',
          'possibly_sensitive'
        ].join(','),
        'user.fields': [
          'username',
          'name',
          'verified',
          'public_metrics',
          'profile_image_url',
          'description',
          'location'
        ].join(','),
        expansions: 'author_id,referenced_tweets.id'
      });
      
      const responseTime = Date.now() - startTime;
      
      // Process and format results with full data
      const tweets = searchResults.data?.data || [];
      const users = searchResults.data?.includes?.users || [];
      
      // Create user lookup map
      const userMap = new Map();
      users.forEach(user => userMap.set(user.id, user));
      
      // Format tweets with comprehensive data
      const formattedTweets = tweets.map(tweet => {
        const author = userMap.get(tweet.author_id);
        
        // Extract hashtags and mentions
        const hashtags = tweet.entities?.hashtags?.map(tag => `#${tag.tag}`) || [];
        const mentions = tweet.entities?.mentions?.map(mention => `@${mention.username}`) || [];
        const urls = tweet.entities?.urls?.map(url => url.expanded_url) || [];
        
        // Calculate sentiment
        const sentiment = this.calculateSentiment(tweet.text);
        
        return {
          id: tweet.id,
          text: tweet.text,
          created_at: tweet.created_at,
          lang: tweet.lang,
          possibly_sensitive: tweet.possibly_sensitive || false,
          author: {
            id: tweet.author_id,
            username: author?.username || 'unknown',
            name: author?.name || 'Unknown User',
            verified: author?.verified || false,
            followers: author?.public_metrics?.followers_count || 0,
            following: author?.public_metrics?.following_count || 0,
            tweets_count: author?.public_metrics?.tweet_count || 0,
            description: author?.description || '',
            location: author?.location || '',
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
          entities: {
            hashtags,
            mentions,
            urls
          },
          context: tweet.context_annotations || [],
          url: `https://twitter.com/${author?.username}/status/${tweet.id}`
        };
      });
      
      // Generate analytics
      const analytics = this.generateAnalytics(formattedTweets, queryData);
      
      const result = {
        queryData,
        responseTime,
        totalTweets: formattedTweets.length,
        tweets: formattedTweets,
        analytics,
        rawData: {
          tweetsCount: tweets.length,
          usersCount: users.length,
          hasIncludes: !!searchResults.data?.includes
        },
        timestamp: new Date().toISOString(),
        success: true
      };
      
      this.results.push(result);
      
      this.log(`✅ Data collected: ${formattedTweets.length} tweets in ${responseTime}ms`);
      
      return result;
      
    } catch (error) {
      this.logError(`❌ Data collection failed`, error);
      
      const failedResult = {
        queryData,
        error: error.message,
        timestamp: new Date().toISOString(),
        success: false
      };
      
      this.results.push(failedResult);
      return failedResult;
    }
  }

  // Calculate sentiment analysis
  calculateSentiment(text) {
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'best', 
      'awesome', 'perfect', 'happy', 'excited', 'brilliant', 'outstanding', 'impressive',
      'positive', 'success', 'win', 'beautiful', 'incredible'
    ];
    
    const negativeWords = [
      'bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disappointing', 'sucks', 
      'stupid', 'annoying', 'sad', 'angry', 'frustrated', 'disgusting', 'useless',
      'negative', 'fail', 'lose', 'ugly', 'disaster'
    ];
    
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

  // Generate comprehensive analytics
  generateAnalytics(tweets, queryData) {
    if (tweets.length === 0) {
      return {
        total_tweets: 0,
        avg_sentiment: 0,
        sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
        top_hashtags: [],
        engagement_stats: { avg_likes: 0, avg_retweets: 0, total_engagement: 0 },
        top_influencers: [],
        language_distribution: {},
        temporal_distribution: {},
        content_analysis: {}
      };
    }
    
    // Sentiment analysis
    const sentimentCounts = tweets.reduce((acc, tweet) => {
      acc[tweet.sentiment.label]++;
      return acc;
    }, { positive: 0, negative: 0, neutral: 0 });
    
    const avgSentiment = tweets.reduce((sum, tweet) => sum + tweet.sentiment.score, 0) / tweets.length;
    
    // Hashtag analysis
    const hashtagCounts = {};
    tweets.forEach(tweet => {
      tweet.entities.hashtags.forEach(tag => {
        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
      });
    });
    
    const topHashtags = Object.entries(hashtagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 15)
      .map(([tag, count]) => ({ tag, count }));
    
    // Engagement statistics
    const totalLikes = tweets.reduce((sum, tweet) => sum + tweet.metrics.likes, 0);
    const totalRetweets = tweets.reduce((sum, tweet) => sum + tweet.metrics.retweets, 0);
    const totalReplies = tweets.reduce((sum, tweet) => sum + tweet.metrics.replies, 0);
    
    // Top influencers
    const topInfluencers = tweets
      .sort((a, b) => b.author.followers - a.author.followers)
      .slice(0, 5)
      .map(tweet => ({
        username: tweet.author.username,
        name: tweet.author.name,
        followers: tweet.author.followers,
        verified: tweet.author.verified,
        engagement: tweet.metrics.likes + tweet.metrics.retweets
      }));
    
    // Language distribution
    const languageDistribution = tweets.reduce((acc, tweet) => {
      const lang = tweet.lang || 'unknown';
      acc[lang] = (acc[lang] || 0) + 1;
      return acc;
    }, {});
    
    // Temporal distribution (by hour)
    const temporalDistribution = tweets.reduce((acc, tweet) => {
      const hour = new Date(tweet.created_at).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});
    
    // Content analysis
    const avgTextLength = tweets.reduce((sum, tweet) => sum + tweet.text.length, 0) / tweets.length;
    const tweetsWithUrls = tweets.filter(tweet => tweet.entities.urls.length > 0).length;
    const tweetsWithMentions = tweets.filter(tweet => tweet.entities.mentions.length > 0).length;
    const tweetsWithHashtags = tweets.filter(tweet => tweet.entities.hashtags.length > 0).length;
    
    return {
      total_tweets: tweets.length,
      avg_sentiment: Number(avgSentiment.toFixed(2)),
      sentiment_distribution: sentimentCounts,
      top_hashtags: topHashtags.map(h => h.tag), // Keep backward compatibility
      hashtag_analysis: topHashtags,
      engagement_stats: {
        avg_likes: Math.floor(totalLikes / tweets.length),
        avg_retweets: Math.floor(totalRetweets / tweets.length),
        total_engagement: totalLikes + totalRetweets + totalReplies,
        engagement_rate: ((totalLikes + totalRetweets) / tweets.length).toFixed(2)
      },
      top_influencers: topInfluencers,
      language_distribution: languageDistribution,
      temporal_distribution: temporalDistribution,
      content_analysis: {
        avg_text_length: Math.floor(avgTextLength),
        tweets_with_urls: tweetsWithUrls,
        tweets_with_mentions: tweetsWithMentions,
        tweets_with_hashtags: tweetsWithHashtags,
        url_percentage: ((tweetsWithUrls / tweets.length) * 100).toFixed(1),
        mention_percentage: ((tweetsWithMentions / tweets.length) * 100).toFixed(1),
        hashtag_percentage: ((tweetsWithHashtags / tweets.length) * 100).toFixed(1)
      }
    };
  }

  // Validate tweet structure
  validateTweetStructure(tweet) {
    const issues = [];
    
    // Check required fields
    this.tweetSchema.required.forEach(field => {
      if (!(field in tweet)) {
        issues.push(`Missing required field: ${field}`);
      }
    });
    
    // Validate specific field types and values
    if (tweet.id && typeof tweet.id !== 'string') {
      issues.push('Tweet ID must be a string');
    }
    
    if (tweet.text && typeof tweet.text !== 'string') {
      issues.push('Tweet text must be a string');
    }
    
    if (tweet.created_at && isNaN(Date.parse(tweet.created_at))) {
      issues.push('Invalid created_at date format');
    }
    
    // Validate author structure
    if (tweet.author) {
      this.tweetSchema.authorRequired.forEach(field => {
        if (!(field in tweet.author)) {
          issues.push(`Missing author field: ${field}`);
        }
      });
      
      if (tweet.author.followers && typeof tweet.author.followers !== 'number') {
        issues.push('Author followers must be a number');
      }
    }
    
    // Validate metrics structure
    if (tweet.metrics) {
      this.tweetSchema.metricsRequired.forEach(field => {
        if (!(field in tweet.metrics)) {
          issues.push(`Missing metrics field: ${field}`);
        }
      });
      
      Object.values(tweet.metrics).forEach((value, index) => {
        if (typeof value !== 'number' || value < 0) {
          issues.push(`Invalid metrics value at index ${index}`);
        }
      });
    }
    
    // Validate sentiment structure
    if (tweet.sentiment) {
      this.tweetSchema.sentimentRequired.forEach(field => {
        if (!(field in tweet.sentiment)) {
          issues.push(`Missing sentiment field: ${field}`);
        }
      });
      
      if (tweet.sentiment.score && (tweet.sentiment.score < -1 || tweet.sentiment.score > 1)) {
        issues.push('Sentiment score must be between -1 and 1');
      }
      
      if (tweet.sentiment.label && !['positive', 'negative', 'neutral'].includes(tweet.sentiment.label)) {
        issues.push('Sentiment label must be positive, negative, or neutral');
      }
    }
    
    return issues;
  }

  // Validate analytics structure
  validateAnalyticsStructure(analytics) {
    const issues = [];
    
    // Check required fields
    this.analyticsSchema.required.forEach(field => {
      if (!(field in analytics)) {
        issues.push(`Missing analytics field: ${field}`);
      }
    });
    
    // Validate sentiment distribution
    if (analytics.sentiment_distribution) {
      this.analyticsSchema.sentimentDistributionRequired.forEach(field => {
        if (!(field in analytics.sentiment_distribution)) {
          issues.push(`Missing sentiment distribution field: ${field}`);
        }
      });
      
      const total = analytics.sentiment_distribution.positive + 
                   analytics.sentiment_distribution.negative + 
                   analytics.sentiment_distribution.neutral;
      
      if (Math.abs(total - analytics.total_tweets) > analytics.total_tweets * 0.01) {
        issues.push('Sentiment distribution does not match total tweets');
      }
    }
    
    // Validate engagement stats
    if (analytics.engagement_stats) {
      this.analyticsSchema.engagementStatsRequired.forEach(field => {
        if (!(field in analytics.engagement_stats)) {
          issues.push(`Missing engagement stats field: ${field}`);
        }
      });
    }
    
    // Validate sentiment score range
    if (analytics.avg_sentiment && (analytics.avg_sentiment < -1 || analytics.avg_sentiment > 1)) {
      issues.push('Average sentiment must be between -1 and 1');
    }
    
    return issues;
  }

  // Validate data quality
  validateDataQuality(result) {
    const qualityMetrics = {
      structural_validity: 0,
      data_completeness: 0,
      data_consistency: 0,
      data_accuracy: 0,
      overall_score: 0
    };
    
    if (!result.success) {
      return qualityMetrics;
    }
    
    let structuralIssues = 0;
    let totalFields = 0;
    let consistencyIssues = 0;
    
    // Validate each tweet structure
    result.tweets.forEach(tweet => {
      const tweetIssues = this.validateTweetStructure(tweet);
      structuralIssues += tweetIssues.length;
      totalFields += this.tweetSchema.required.length + 
                    this.tweetSchema.authorRequired.length + 
                    this.tweetSchema.metricsRequired.length + 
                    this.tweetSchema.sentimentRequired.length;
    });
    
    // Validate analytics structure
    const analyticsIssues = this.validateAnalyticsStructure(result.analytics);
    structuralIssues += analyticsIssues.length;
    totalFields += this.analyticsSchema.required.length;
    
    // Calculate structural validity (0-100)
    qualityMetrics.structural_validity = Math.max(0, 100 - (structuralIssues / totalFields * 100));
    
    // Data completeness check
    const tweetsWithCompleteData = result.tweets.filter(tweet => {
      return tweet.text && tweet.author.username && tweet.metrics.likes >= 0;
    }).length;
    
    qualityMetrics.data_completeness = result.tweets.length > 0 ? 
      (tweetsWithCompleteData / result.tweets.length * 100) : 0;
    
    // Data consistency check
    const avgSentimentCalculated = result.tweets.length > 0 ?
      result.tweets.reduce((sum, t) => sum + t.sentiment.score, 0) / result.tweets.length : 0;
    
    const sentimentDifference = Math.abs(avgSentimentCalculated - result.analytics.avg_sentiment);
    qualityMetrics.data_consistency = Math.max(0, 100 - (sentimentDifference * 100));
    
    // Data accuracy (based on reasonable value ranges)
    let accuracyIssues = 0;
    let accuracyChecks = 0;
    
    result.tweets.forEach(tweet => {
      // Check for unreasonable follower counts
      if (tweet.author.followers > 1000000000) {
        accuracyIssues++;
      }
      accuracyChecks++;
      
      // Check for reasonable engagement ratios
      const engagementRate = (tweet.metrics.likes + tweet.metrics.retweets) / 
                           Math.max(tweet.author.followers, 1);
      if (engagementRate > 1) { // More than 100% engagement rate is suspicious
        accuracyIssues++;
      }
      accuracyChecks++;
    });
    
    qualityMetrics.data_accuracy = accuracyChecks > 0 ? 
      Math.max(0, 100 - (accuracyIssues / accuracyChecks * 100)) : 100;
    
    // Calculate overall score
    qualityMetrics.overall_score = (
      qualityMetrics.structural_validity + 
      qualityMetrics.data_completeness + 
      qualityMetrics.data_consistency + 
      qualityMetrics.data_accuracy
    ) / 4;
    
    return qualityMetrics;
  }

  // Run comprehensive data validation tests
  async runAllTests() {
    this.log('🚀 Starting Data Validation Tests');
    this.startTime = Date.now();
    
    // Initialize client
    if (!this.initializeClient()) {
      this.log('❌ Cannot proceed without Twitter client');
      return;
    }
    
    // Collect data for validation
    for (const queryData of this.testQueries) {
      try {
        const result = await this.searchAndValidate(queryData);
        
        if (result.success) {
          // Validate data quality
          const qualityMetrics = this.validateDataQuality(result);
          
          this.validationResults.push({
            queryData,
            qualityMetrics,
            timestamp: new Date().toISOString()
          });
          
          this.log(`📊 Quality Score: ${qualityMetrics.overall_score.toFixed(1)}%`);
          this.log(`   Structural: ${qualityMetrics.structural_validity.toFixed(1)}%`);
          this.log(`   Completeness: ${qualityMetrics.data_completeness.toFixed(1)}%`);
          this.log(`   Consistency: ${qualityMetrics.data_consistency.toFixed(1)}%`);
          this.log(`   Accuracy: ${qualityMetrics.data_accuracy.toFixed(1)}%`);
        }
        
        // Delay between queries
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        this.logError(`Data validation failed for query`, error);
      }
    }
    
    // Calculate overall data quality metrics
    this.calculateOverallMetrics();
    
    // Generate final report
    this.generateReport();
  }

  // Calculate overall data quality metrics
  calculateOverallMetrics() {
    if (this.validationResults.length === 0) {
      this.dataQualityMetrics = {
        avg_structural_validity: 0,
        avg_data_completeness: 0,
        avg_data_consistency: 0,
        avg_data_accuracy: 0,
        overall_quality_score: 0,
        total_queries_tested: 0,
        total_tweets_analyzed: 0
      };
      return;
    }
    
    const totalQueries = this.validationResults.length;
    const totalTweets = this.results.filter(r => r.success)
      .reduce((sum, r) => sum + r.totalTweets, 0);
    
    const avgStructural = this.validationResults.reduce((sum, r) => 
      sum + r.qualityMetrics.structural_validity, 0) / totalQueries;
    
    const avgCompleteness = this.validationResults.reduce((sum, r) => 
      sum + r.qualityMetrics.data_completeness, 0) / totalQueries;
    
    const avgConsistency = this.validationResults.reduce((sum, r) => 
      sum + r.qualityMetrics.data_consistency, 0) / totalQueries;
    
    const avgAccuracy = this.validationResults.reduce((sum, r) => 
      sum + r.qualityMetrics.data_accuracy, 0) / totalQueries;
    
    const overallScore = this.validationResults.reduce((sum, r) => 
      sum + r.qualityMetrics.overall_score, 0) / totalQueries;
    
    this.dataQualityMetrics = {
      avg_structural_validity: Number(avgStructural.toFixed(2)),
      avg_data_completeness: Number(avgCompleteness.toFixed(2)),
      avg_data_consistency: Number(avgConsistency.toFixed(2)),
      avg_data_accuracy: Number(avgAccuracy.toFixed(2)),
      overall_quality_score: Number(overallScore.toFixed(2)),
      total_queries_tested: totalQueries,
      total_tweets_analyzed: totalTweets
    };
  }

  // Generate comprehensive test report
  generateReport() {
    const totalTime = Date.now() - this.startTime;
    const successfulTests = this.results.filter(r => r.success);
    const failedTests = this.results.filter(r => !r.success);
    
    this.log('\n📊 DATA VALIDATION TEST REPORT');
    this.log('================================');
    this.log(`Total Tests: ${this.results.length}`);
    this.log(`Successful: ${successfulTests.length}`);
    this.log(`Failed: ${failedTests.length}`);
    this.log(`Success Rate: ${((successfulTests.length / this.results.length) * 100).toFixed(1)}%`);
    this.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    this.log(`Total Tweets Analyzed: ${this.dataQualityMetrics.total_tweets_analyzed}`);
    
    this.log('\n📈 OVERALL DATA QUALITY METRICS:');
    this.log(`Overall Quality Score: ${this.dataQualityMetrics.overall_quality_score}%`);
    this.log(`Structural Validity: ${this.dataQualityMetrics.avg_structural_validity}%`);
    this.log(`Data Completeness: ${this.dataQualityMetrics.avg_data_completeness}%`);
    this.log(`Data Consistency: ${this.dataQualityMetrics.avg_data_consistency}%`);
    this.log(`Data Accuracy: ${this.dataQualityMetrics.avg_data_accuracy}%`);
    
    // Quality assessment
    const overallScore = this.dataQualityMetrics.overall_quality_score;
    let qualityAssessment;
    if (overallScore >= 95) qualityAssessment = '🟢 Excellent';
    else if (overallScore >= 85) qualityAssessment = '🟡 Good';
    else if (overallScore >= 70) qualityAssessment = '🟠 Fair';
    else qualityAssessment = '🔴 Poor';
    
    this.log(`\n🎯 Data Quality Assessment: ${qualityAssessment}`);
    
    // Detailed quality breakdown
    if (this.validationResults.length > 0) {
      this.log('\n📋 Quality Breakdown by Query:');
      this.validationResults.forEach((result, index) => {
        const queryDesc = result.queryData.type === 'keyword' ? 
          result.queryData.query : 
          result.queryData.hashtags.join(', ');
        
        this.log(`${index + 1}. ${result.queryData.type}: ${queryDesc}`);
        this.log(`   Overall: ${result.qualityMetrics.overall_score.toFixed(1)}%`);
        this.log(`   Structure: ${result.qualityMetrics.structural_validity.toFixed(1)}%`);
        this.log(`   Complete: ${result.qualityMetrics.data_completeness.toFixed(1)}%`);
        this.log(`   Consistent: ${result.qualityMetrics.data_consistency.toFixed(1)}%`);
        this.log(`   Accurate: ${result.qualityMetrics.data_accuracy.toFixed(1)}%`);
      });
    }
    
    // Recommendations
    this.log('\n💡 Recommendations:');
    if (this.dataQualityMetrics.avg_structural_validity < 95) {
      this.log('  - Review data structure validation and field requirements');
    }
    if (this.dataQualityMetrics.avg_data_completeness < 90) {
      this.log('  - Improve data collection to ensure complete field population');
    }
    if (this.dataQualityMetrics.avg_data_consistency < 95) {
      this.log('  - Review calculation methods for analytics consistency');
    }
    if (this.dataQualityMetrics.avg_data_accuracy < 90) {
      this.log('  - Implement additional data validation and sanitization');
    }
    if (overallScore >= 95) {
      this.log('  - Data quality is excellent - maintain current standards');
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
      testName: 'Data Validation Test',
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        totalTime: Date.now() - this.startTime
      },
      dataQualityMetrics: this.dataQualityMetrics,
      validationResults: this.validationResults,
      results: this.results,
      schemas: {
        tweet: this.tweetSchema,
        analytics: this.analyticsSchema
      }
    };
    
    this.log('\n💾 Data validation test results ready for analysis');
    this.log('Results available in this.results');
    this.log('Quality metrics available in this.dataQualityMetrics');
  }
}

// Execute tests if running directly
async function runTests() {
  const test = new DataValidationTest();
  await test.runAllTests();
  return test;
}

// Export for use in other modules
export { DataValidationTest, runTests };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}