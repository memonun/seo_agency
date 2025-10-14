/**
 * Twitter Rate Limiting Test
 * 
 * Comprehensive testing of API rate limits and handling
 * Tests the 40 requests per 5 minutes limit and retry mechanisms
 */

import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class RateLimitingTest {
  constructor() {
    this.results = [];
    this.rateLimitEvents = [];
    this.errors = [];
    this.startTime = null;
    this.client = null;
    
    // Rate limiting configuration
    this.RATE_LIMIT_REQUESTS = 40;
    this.RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.REQUEST_TRACKING = [];
    
    // Test configurations
    this.testQueries = [
      'AI', 'tech', 'crypto', 'javascript', 'python',
      'react', 'nodejs', 'blockchain', 'startup', 'innovation'
    ];
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

  // Rate limiting tracker
  canMakeRequest() {
    const now = Date.now();
    
    // Remove requests outside the current window
    this.REQUEST_TRACKING = this.REQUEST_TRACKING.filter(
      requestTime => now - requestTime < this.RATE_LIMIT_WINDOW
    );
    
    // Check if we can make a request
    if (this.REQUEST_TRACKING.length >= this.RATE_LIMIT_REQUESTS) {
      return false;
    }
    
    // Record this request
    this.REQUEST_TRACKING.push(now);
    return true;
  }

  // Get time until rate limit resets
  getTimeUntilReset() {
    if (this.REQUEST_TRACKING.length === 0) return 0;
    
    const oldestRequest = Math.min(...this.REQUEST_TRACKING);
    const timeUntilReset = this.RATE_LIMIT_WINDOW - (Date.now() - oldestRequest);
    
    return Math.max(0, timeUntilReset);
  }

  // Get current rate limit status
  getRateLimitStatus() {
    const now = Date.now();
    this.REQUEST_TRACKING = this.REQUEST_TRACKING.filter(
      requestTime => now - requestTime < this.RATE_LIMIT_WINDOW
    );
    
    return {
      requestsUsed: this.REQUEST_TRACKING.length,
      requestsRemaining: this.RATE_LIMIT_REQUESTS - this.REQUEST_TRACKING.length,
      resetTime: this.getTimeUntilReset(),
      canRequest: this.REQUEST_TRACKING.length < this.RATE_LIMIT_REQUESTS
    };
  }

  // Core search function with rate limit handling
  async searchWithRateLimit(query, attemptNumber = 1) {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Check rate limit before making request
      const rateLimitStatus = this.getRateLimitStatus();
      this.log(`🔍 Request ${requestId}: "${query}" | Rate Status: ${rateLimitStatus.requestsUsed}/${this.RATE_LIMIT_REQUESTS} | Attempt: ${attemptNumber}`);
      
      if (!rateLimitStatus.canRequest) {
        const waitTime = rateLimitStatus.resetTime;
        this.log(`⏳ Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s for reset...`);
        
        // Record rate limit event
        this.rateLimitEvents.push({
          timestamp: new Date().toISOString(),
          requestId,
          query,
          waitTime,
          requestsUsed: rateLimitStatus.requestsUsed,
          attemptNumber
        });
        
        // Wait for rate limit to reset
        await new Promise(resolve => setTimeout(resolve, waitTime + 1000)); // +1s buffer
        
        // Retry the request
        return await this.searchWithRateLimit(query, attemptNumber + 1);
      }
      
      const startTime = Date.now();
      
      // Build search query
      const searchQuery = `${query} -is:retweet lang:en`;
      
      // Use GAME SDK to search tweets
      const searchResults = await this.client.v2.search(searchQuery, {
        max_results: 10, // Small limit for rate limit testing
        'tweet.fields': [
          'created_at',
          'public_metrics',
          'author_id'
        ].join(','),
        'user.fields': [
          'username',
          'name',
          'public_metrics'
        ].join(','),
        expansions: 'author_id'
      });
      
      const responseTime = Date.now() - startTime;
      
      // Process results
      const tweets = searchResults.data?.data || [];
      const users = searchResults.data?.includes?.users || [];
      
      // Create user lookup map
      const userMap = new Map();
      users.forEach(user => userMap.set(user.id, user));
      
      // Format tweets
      const formattedTweets = tweets.map(tweet => {
        const author = userMap.get(tweet.author_id);
        
        return {
          id: tweet.id,
          text: tweet.text,
          created_at: tweet.created_at,
          author: {
            id: tweet.author_id,
            username: author?.username || 'unknown',
            name: author?.name || 'Unknown User'
          },
          metrics: {
            likes: tweet.public_metrics?.like_count || 0,
            retweets: tweet.public_metrics?.retweet_count || 0,
            replies: tweet.public_metrics?.reply_count || 0
          }
        };
      });
      
      const testResult = {
        requestId,
        query,
        attemptNumber,
        responseTime,
        totalTweets: formattedTweets.length,
        tweets: formattedTweets,
        rateLimitStatus: this.getRateLimitStatus(),
        timestamp: new Date().toISOString(),
        success: true
      };
      
      this.results.push(testResult);
      
      this.log(`✅ Success ${requestId}: Found ${formattedTweets.length} tweets in ${responseTime}ms`);
      
      return testResult;
      
    } catch (error) {
      // Check if this is a rate limit error
      if (error.code === 429 || error.message.includes('rate limit')) {
        this.log(`⚠️ Rate limit error detected for ${requestId}`);
        
        // Record rate limit event
        this.rateLimitEvents.push({
          timestamp: new Date().toISOString(),
          requestId,
          query,
          errorType: 'api_rate_limit',
          attemptNumber,
          error: error.message
        });
        
        // Wait and retry
        const waitTime = 15 * 60 * 1000; // 15 minutes default wait
        this.log(`⏳ Waiting ${waitTime / 1000}s due to API rate limit...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        return await this.searchWithRateLimit(query, attemptNumber + 1);
      }
      
      this.logError(`❌ Search failed for ${requestId}`, error);
      
      const failedResult = {
        requestId,
        query,
        attemptNumber,
        error: error.message,
        timestamp: new Date().toISOString(),
        success: false
      };
      
      this.results.push(failedResult);
      return failedResult;
    }
  }

  // Test burst requests (rapid consecutive requests)
  async testBurstRequests(numRequests = 50) {
    this.log(`\n🚀 Testing burst requests: ${numRequests} rapid requests`);
    
    const burstResults = [];
    const startTime = Date.now();
    
    for (let i = 0; i < numRequests; i++) {
      const query = this.testQueries[i % this.testQueries.length];
      
      try {
        const result = await this.searchWithRateLimit(`${query} ${i}`, 1);
        burstResults.push(result);
        
        // Log progress every 10 requests
        if ((i + 1) % 10 === 0) {
          const rateLimitStatus = this.getRateLimitStatus();
          this.log(`Progress: ${i + 1}/${numRequests} | Rate: ${rateLimitStatus.requestsUsed}/${this.RATE_LIMIT_REQUESTS}`);
        }
        
      } catch (error) {
        this.logError(`Burst request ${i} failed`, error);
      }
    }
    
    const totalTime = Date.now() - startTime;
    const successfulRequests = burstResults.filter(r => r.success).length;
    
    this.log(`\n📊 Burst Test Results:`);
    this.log(`Total Requests: ${numRequests}`);
    this.log(`Successful: ${successfulRequests}`);
    this.log(`Failed: ${numRequests - successfulRequests}`);
    this.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    this.log(`Average Time per Request: ${(totalTime / numRequests).toFixed(0)}ms`);
    this.log(`Rate Limit Events: ${this.rateLimitEvents.length}`);
    
    return burstResults;
  }

  // Test sustained load over time
  async testSustainedLoad(durationMinutes = 10) {
    this.log(`\n⏱️ Testing sustained load for ${durationMinutes} minutes`);
    
    const endTime = Date.now() + (durationMinutes * 60 * 1000);
    const sustainedResults = [];
    let requestCount = 0;
    
    while (Date.now() < endTime) {
      const query = this.testQueries[requestCount % this.testQueries.length];
      
      try {
        const result = await this.searchWithRateLimit(`${query} sustained ${requestCount}`, 1);
        sustainedResults.push(result);
        requestCount++;
        
        // Log status every minute
        if (requestCount % 12 === 0) { // Approximately every minute at 12 req/min
          const rateLimitStatus = this.getRateLimitStatus();
          const elapsed = (Date.now() - (endTime - durationMinutes * 60 * 1000)) / 1000;
          this.log(`Sustained Load - ${elapsed.toFixed(0)}s elapsed | Requests: ${requestCount} | Rate: ${rateLimitStatus.requestsUsed}/${this.RATE_LIMIT_REQUESTS}`);
        }
        
        // Normal pacing between requests (5 seconds)
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        this.logError(`Sustained request ${requestCount} failed`, error);
      }
    }
    
    const successfulRequests = sustainedResults.filter(r => r.success).length;
    
    this.log(`\n📊 Sustained Load Results:`);
    this.log(`Duration: ${durationMinutes} minutes`);
    this.log(`Total Requests: ${requestCount}`);
    this.log(`Successful: ${successfulRequests}`);
    this.log(`Rate: ${(requestCount / durationMinutes).toFixed(1)} requests/minute`);
    this.log(`Rate Limit Events: ${this.rateLimitEvents.filter(e => e.timestamp > new Date(endTime - durationMinutes * 60 * 1000).toISOString()).length}`);
    
    return sustainedResults;
  }

  // Test rate limit recovery
  async testRateLimitRecovery() {
    this.log(`\n🔄 Testing rate limit recovery`);
    
    // First, exhaust the rate limit
    this.log('Exhausting rate limit...');
    let exhaustionAttempts = 0;
    
    while (this.getRateLimitStatus().canRequest && exhaustionAttempts < 50) {
      try {
        await this.searchWithRateLimit(`exhaustion ${exhaustionAttempts}`, 1);
        exhaustionAttempts++;
      } catch (error) {
        this.logError(`Exhaustion attempt ${exhaustionAttempts} failed`, error);
        break;
      }
    }
    
    this.log(`Rate limit exhausted after ${exhaustionAttempts} requests`);
    
    // Now test recovery
    const recoveryStartTime = Date.now();
    const recoveryResult = await this.searchWithRateLimit('recovery test', 1);
    const recoveryTime = Date.now() - recoveryStartTime;
    
    this.log(`\n📊 Rate Limit Recovery:`);
    this.log(`Recovery Time: ${(recoveryTime / 1000).toFixed(2)}s`);
    this.log(`Recovery Successful: ${recoveryResult.success}`);
    
    return {
      exhaustionAttempts,
      recoveryTime,
      recoverySuccessful: recoveryResult.success
    };
  }

  // Validate rate limiting functionality
  validateRateLimiting() {
    const issues = [];
    
    // Check if rate limit tracking is working
    const rateLimitStatus = this.getRateLimitStatus();
    
    if (this.REQUEST_TRACKING.length > this.RATE_LIMIT_REQUESTS) {
      issues.push('Rate limit tracker allowed more requests than limit');
    }
    
    // Check if rate limit events were properly recorded
    if (this.results.length > this.RATE_LIMIT_REQUESTS && this.rateLimitEvents.length === 0) {
      issues.push('No rate limit events recorded despite exceeding limit');
    }
    
    // Check if all successful requests have proper structure
    const successfulResults = this.results.filter(r => r.success);
    for (const result of successfulResults) {
      if (!result.rateLimitStatus || typeof result.rateLimitStatus.requestsUsed !== 'number') {
        issues.push('Missing or invalid rate limit status in results');
        break;
      }
    }
    
    return issues;
  }

  // Run comprehensive rate limiting tests
  async runAllTests() {
    this.log('🚀 Starting Rate Limiting Tests');
    this.startTime = Date.now();
    
    // Initialize client
    if (!this.initializeClient()) {
      this.log('❌ Cannot proceed without Twitter client');
      return;
    }
    
    try {
      // Test 1: Burst requests
      await this.testBurstRequests(45); // Slightly above rate limit
      
      // Small break between tests
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Test 2: Rate limit recovery
      await this.testRateLimitRecovery();
      
      // Test 3: Sustained load (shorter duration for testing)
      await this.testSustainedLoad(3); // 3 minutes
      
    } catch (error) {
      this.logError('Rate limiting test failed', error);
    }
    
    // Generate final report
    this.generateReport();
  }

  // Generate comprehensive test report
  generateReport() {
    const totalTime = Date.now() - this.startTime;
    const successfulTests = this.results.filter(r => r.success);
    const failedTests = this.results.filter(r => !r.success);
    
    this.log('\n📊 RATE LIMITING TEST REPORT');
    this.log('==============================');
    this.log(`Total Tests: ${this.results.length}`);
    this.log(`Successful: ${successfulTests.length}`);
    this.log(`Failed: ${failedTests.length}`);
    this.log(`Success Rate: ${((successfulTests.length / this.results.length) * 100).toFixed(1)}%`);
    this.log(`Total Time: ${(totalTime / 1000 / 60).toFixed(2)} minutes`);
    this.log(`Rate Limit Events: ${this.rateLimitEvents.length}`);
    
    if (successfulTests.length > 0) {
      const avgResponseTime = successfulTests.reduce((sum, r) => sum + r.responseTime, 0) / successfulTests.length;
      const requestsPerMinute = (successfulTests.length / (totalTime / 1000 / 60));
      
      this.log('\n📈 Performance Metrics:');
      this.log(`Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
      this.log(`Requests per Minute: ${requestsPerMinute.toFixed(1)}`);
      this.log(`Final Rate Limit Status: ${this.getRateLimitStatus().requestsUsed}/${this.RATE_LIMIT_REQUESTS}`);
    }
    
    if (this.rateLimitEvents.length > 0) {
      this.log('\n⏳ Rate Limit Events:');
      this.rateLimitEvents.forEach((event, index) => {
        if (event.waitTime) {
          this.log(`${index + 1}. Waited ${(event.waitTime / 1000).toFixed(0)}s after ${event.requestsUsed} requests`);
        } else if (event.errorType === 'api_rate_limit') {
          this.log(`${index + 1}. API rate limit error: ${event.error}`);
        }
      });
    }
    
    // Validation
    const validationIssues = this.validateRateLimiting();
    if (validationIssues.length > 0) {
      this.log('\n⚠️ Validation Issues:');
      validationIssues.forEach(issue => {
        this.log(`- ${issue}`);
      });
    } else {
      this.log('\n✅ All rate limiting validations passed');
    }
    
    if (failedTests.length > 0) {
      this.log('\n❌ Failed Tests:');
      failedTests.forEach(test => {
        this.log(`- ${test.requestId}: ${test.query} (${test.error})`);
      });
    }
    
    // Save results to file
    this.saveResults();
  }

  // Save test results to JSON file
  saveResults() {
    const report = {
      testName: 'Rate Limiting Test',
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        rateLimitEvents: this.rateLimitEvents.length,
        totalTime: Date.now() - this.startTime
      },
      rateLimitConfig: {
        limit: this.RATE_LIMIT_REQUESTS,
        windowMs: this.RATE_LIMIT_WINDOW
      },
      results: this.results,
      rateLimitEvents: this.rateLimitEvents,
      errors: this.errors
    };
    
    this.log('\n💾 Rate limiting test results ready for analysis');
    this.log('Results available in this.results');
    this.log('Rate limit events available in this.rateLimitEvents');
  }
}

// Execute tests if running directly
async function runTests() {
  const test = new RateLimitingTest();
  await test.runAllTests();
  return test;
}

// Export for use in other modules
export { RateLimitingTest, runTests };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}