/**
 * Twitter Performance Test
 * 
 * Comprehensive performance benchmarking of Twitter API functionality
 * Tests response times, throughput, concurrency, and scalability
 */

import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class PerformanceTest {
  constructor() {
    this.results = [];
    this.performanceMetrics = [];
    this.concurrencyResults = [];
    this.errors = [];
    this.startTime = null;
    this.client = null;
    
    // Performance test configurations
    this.testScenarios = [
      {
        name: 'Light Load - Small Queries',
        type: 'sequential',
        queries: ['AI', 'tech', 'crypto'],
        limits: [10, 25],
        iterations: 5
      },
      {
        name: 'Medium Load - Mixed Queries',
        type: 'sequential',
        queries: ['artificial intelligence', '#javascript #webdev', 'climate change'],
        limits: [25, 50],
        iterations: 3
      },
      {
        name: 'Heavy Load - Large Queries',
        type: 'sequential',
        queries: [
          'machine learning artificial intelligence deep learning',
          '#crypto #blockchain #bitcoin #ethereum #defi',
          'climate change sustainability renewable energy carbon emissions'
        ],
        limits: [50, 75, 100],
        iterations: 2
      },
      {
        name: 'Concurrency Test - Light',
        type: 'concurrent',
        queries: ['AI', 'tech', 'crypto', 'startup'],
        limits: [10],
        concurrency: 3
      },
      {
        name: 'Concurrency Test - Medium',
        type: 'concurrent',
        queries: ['javascript', 'python', 'react', 'nodejs', 'blockchain'],
        limits: [25],
        concurrency: 5
      },
      {
        name: 'Stress Test - High Concurrency',
        type: 'concurrent',
        queries: ['AI', 'tech', 'startup', 'innovation', 'business', 'coding'],
        limits: [15],
        concurrency: 8
      }
    ];
    
    // Performance tracking
    this.memoryBaseline = null;
    this.responseTimeHistory = [];
    this.throughputHistory = [];
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

  // Get current memory usage
  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100, // MB
        external: Math.round(usage.external / 1024 / 1024 * 100) / 100, // MB
        rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100 // MB
      };
    }
    return { heapUsed: 0, heapTotal: 0, external: 0, rss: 0 };
  }

  // Core performance search function
  async performanceSearch(query, limit = 50, testId = null) {
    const requestId = testId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.log(`⚡ Performance test: "${query}" | Limit: ${limit} | ID: ${requestId}`);
      
      const startTime = Date.now();
      const startMemory = this.getMemoryUsage();
      
      // Determine query type and format
      let searchQuery;
      let queryType;
      
      if (query.includes('#')) {
        queryType = 'hashtag';
        const hashtags = query.split(' ').filter(q => q.startsWith('#'));
        searchQuery = hashtags.join(' OR ');
      } else {
        queryType = 'keyword';
        searchQuery = query.trim();
      }
      
      // Add standard filters
      searchQuery += ' -is:retweet lang:en';
      
      // Use GAME SDK to search tweets
      const searchResults = await this.client.v2.search(searchQuery, {
        max_results: Math.min(limit, 100),
        'tweet.fields': [
          'created_at',
          'public_metrics',
          'context_annotations',
          'entities',
          'author_id'
        ].join(','),
        'user.fields': [
          'username',
          'name',
          'verified',
          'public_metrics'
        ].join(','),
        expansions: 'author_id'
      });
      
      const endTime = Date.now();
      const endMemory = this.getMemoryUsage();
      const responseTime = endTime - startTime;
      
      // Process results for performance analysis
      const tweets = searchResults.data?.data || [];
      const users = searchResults.data?.includes?.users || [];
      
      // Create user lookup map
      const userMap = new Map();
      users.forEach(user => userMap.set(user.id, user));
      
      // Calculate data processing time
      const processingStartTime = Date.now();
      
      const formattedTweets = tweets.map(tweet => {
        const author = userMap.get(tweet.author_id);
        
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
            replies: tweet.public_metrics?.reply_count || 0
          }
        };
      });
      
      const processingTime = Date.now() - processingStartTime;
      
      const performanceResult = {
        requestId,
        query,
        queryType,
        limit,
        responseTime,
        processingTime,
        totalTime: responseTime + processingTime,
        totalTweets: formattedTweets.length,
        dataSize: {
          rawTweets: tweets.length,
          rawUsers: users.length,
          formattedTweets: formattedTweets.length
        },
        memory: {
          start: startMemory,
          end: endMemory,
          delta: {
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal,
            rss: endMemory.rss - startMemory.rss
          }
        },
        performance: {
          throughput: formattedTweets.length / (responseTime / 1000), // tweets per second
          efficiency: formattedTweets.length / responseTime, // tweets per ms
          memoryEfficiency: formattedTweets.length / Math.max(endMemory.heapUsed - startMemory.heapUsed, 0.1)
        },
        timestamp: new Date().toISOString(),
        success: true
      };
      
      this.results.push(performanceResult);
      this.responseTimeHistory.push(responseTime);
      this.throughputHistory.push(performanceResult.performance.throughput);
      
      this.log(`✅ Performance result: ${formattedTweets.length} tweets in ${responseTime}ms (${performanceResult.performance.throughput.toFixed(1)} tweets/sec)`);
      
      return performanceResult;
      
    } catch (error) {
      this.logError(`❌ Performance test failed for ${requestId}`, error);
      
      const failedResult = {
        requestId,
        query,
        limit,
        error: error.message,
        timestamp: new Date().toISOString(),
        success: false
      };
      
      this.results.push(failedResult);
      return failedResult;
    }
  }

  // Run sequential performance tests
  async runSequentialTests(scenario) {
    this.log(`\n📊 Running Sequential Test: ${scenario.name}`);
    
    const scenarioResults = [];
    
    for (const query of scenario.queries) {
      for (const limit of scenario.limits) {
        for (let iteration = 0; iteration < scenario.iterations; iteration++) {
          try {
            const testId = `seq-${scenario.name.replace(/\s+/g, '')}-${query.replace(/\s+/g, '')}-${limit}-${iteration}`;
            const result = await this.performanceSearch(query, limit, testId);
            scenarioResults.push(result);
            
            // Small delay between iterations
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (error) {
            this.logError(`Sequential test iteration failed`, error);
          }
        }
        
        // Longer delay between different limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Calculate scenario statistics
    const successfulResults = scenarioResults.filter(r => r.success);
    if (successfulResults.length > 0) {
      const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.responseTime, 0) / successfulResults.length;
      const avgThroughput = successfulResults.reduce((sum, r) => sum + r.performance.throughput, 0) / successfulResults.length;
      const maxResponseTime = Math.max(...successfulResults.map(r => r.responseTime));
      const minResponseTime = Math.min(...successfulResults.map(r => r.responseTime));
      
      this.log(`📊 Scenario Results: ${scenario.name}`);
      this.log(`   Tests: ${scenarioResults.length} (${successfulResults.length} successful)`);
      this.log(`   Avg Response Time: ${avgResponseTime.toFixed(0)}ms`);
      this.log(`   Response Time Range: ${minResponseTime}ms - ${maxResponseTime}ms`);
      this.log(`   Avg Throughput: ${avgThroughput.toFixed(1)} tweets/sec`);
    }
    
    return scenarioResults;
  }

  // Run concurrent performance tests
  async runConcurrentTests(scenario) {
    this.log(`\n⚡ Running Concurrent Test: ${scenario.name} (${scenario.concurrency} concurrent requests)`);
    
    const promises = [];
    const startTime = Date.now();
    
    // Create concurrent requests
    for (let i = 0; i < scenario.concurrency; i++) {
      const query = scenario.queries[i % scenario.queries.length];
      const limit = scenario.limits[0]; // Use first limit for concurrent tests
      const testId = `conc-${scenario.name.replace(/\s+/g, '')}-${i}`;
      
      promises.push(this.performanceSearch(query, limit, testId));
    }
    
    // Wait for all requests to complete
    const results = await Promise.allSettled(promises);
    const totalTime = Date.now() - startTime;
    
    const successfulResults = results
      .filter(r => r.status === 'fulfilled' && r.value.success)
      .map(r => r.value);
    
    const failedResults = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));
    
    // Calculate concurrent performance metrics
    const concurrencyMetrics = {
      scenario: scenario.name,
      concurrency: scenario.concurrency,
      totalTime,
      successfulRequests: successfulResults.length,
      failedRequests: failedResults.length,
      successRate: (successfulResults.length / results.length) * 100,
      avgResponseTime: successfulResults.length > 0 ? 
        successfulResults.reduce((sum, r) => sum + r.responseTime, 0) / successfulResults.length : 0,
      maxResponseTime: successfulResults.length > 0 ? 
        Math.max(...successfulResults.map(r => r.responseTime)) : 0,
      minResponseTime: successfulResults.length > 0 ? 
        Math.min(...successfulResults.map(r => r.responseTime)) : 0,
      totalThroughput: successfulResults.reduce((sum, r) => sum + r.totalTweets, 0) / (totalTime / 1000),
      timestamp: new Date().toISOString()
    };
    
    this.concurrencyResults.push(concurrencyMetrics);
    
    this.log(`📊 Concurrent Results: ${scenario.name}`);
    this.log(`   Requests: ${successfulResults.length}/${results.length} successful`);
    this.log(`   Total Time: ${totalTime}ms`);
    this.log(`   Success Rate: ${concurrencyMetrics.successRate.toFixed(1)}%`);
    this.log(`   Avg Response Time: ${concurrencyMetrics.avgResponseTime.toFixed(0)}ms`);
    this.log(`   Total Throughput: ${concurrencyMetrics.totalThroughput.toFixed(1)} tweets/sec`);
    
    return results;
  }

  // Analyze performance trends
  analyzePerformanceTrends() {
    if (this.responseTimeHistory.length < 2) return null;
    
    const recentTimes = this.responseTimeHistory.slice(-10);
    const recentThroughput = this.throughputHistory.slice(-10);
    
    const avgRecentTime = recentTimes.reduce((sum, t) => sum + t, 0) / recentTimes.length;
    const avgRecentThroughput = recentThroughput.reduce((sum, t) => sum + t, 0) / recentThroughput.length;
    
    const allAvgTime = this.responseTimeHistory.reduce((sum, t) => sum + t, 0) / this.responseTimeHistory.length;
    const allAvgThroughput = this.throughputHistory.reduce((sum, t) => sum + t, 0) / this.throughputHistory.length;
    
    return {
      responseTimeChange: ((avgRecentTime - allAvgTime) / allAvgTime) * 100,
      throughputChange: ((avgRecentThroughput - allAvgThroughput) / allAvgThroughput) * 100,
      stabilityIndex: this.calculateStabilityIndex(),
      degradationDetected: avgRecentTime > allAvgTime * 1.5
    };
  }

  // Calculate stability index based on response time variance
  calculateStabilityIndex() {
    if (this.responseTimeHistory.length < 3) return 100;
    
    const mean = this.responseTimeHistory.reduce((sum, t) => sum + t, 0) / this.responseTimeHistory.length;
    const variance = this.responseTimeHistory.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / this.responseTimeHistory.length;
    const stdDev = Math.sqrt(variance);
    const coefficient = stdDev / mean;
    
    // Convert coefficient of variation to stability index (0-100)
    return Math.max(0, 100 - (coefficient * 100));
  }

  // Generate performance benchmarks
  generateBenchmarks() {
    const successfulResults = this.results.filter(r => r.success);
    if (successfulResults.length === 0) return null;
    
    // Group by query type and limit
    const benchmarks = {};
    
    successfulResults.forEach(result => {
      const key = `${result.queryType}-${result.limit}`;
      if (!benchmarks[key]) {
        benchmarks[key] = {
          queryType: result.queryType,
          limit: result.limit,
          tests: [],
          metrics: {}
        };
      }
      benchmarks[key].tests.push(result);
    });
    
    // Calculate benchmark metrics
    Object.keys(benchmarks).forEach(key => {
      const benchmark = benchmarks[key];
      const tests = benchmark.tests;
      
      benchmark.metrics = {
        count: tests.length,
        avgResponseTime: tests.reduce((sum, t) => sum + t.responseTime, 0) / tests.length,
        minResponseTime: Math.min(...tests.map(t => t.responseTime)),
        maxResponseTime: Math.max(...tests.map(t => t.responseTime)),
        avgThroughput: tests.reduce((sum, t) => sum + t.performance.throughput, 0) / tests.length,
        avgMemoryDelta: tests.reduce((sum, t) => sum + t.memory.delta.heapUsed, 0) / tests.length,
        responseTimeStdDev: this.calculateStandardDeviation(tests.map(t => t.responseTime)),
        performanceGrade: this.calculatePerformanceGrade(tests)
      };
    });
    
    return benchmarks;
  }

  // Calculate standard deviation
  calculateStandardDeviation(values) {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  // Calculate performance grade based on response time and consistency
  calculatePerformanceGrade(tests) {
    const avgTime = tests.reduce((sum, t) => sum + t.responseTime, 0) / tests.length;
    const stdDev = this.calculateStandardDeviation(tests.map(t => t.responseTime));
    const coefficient = stdDev / avgTime;
    
    // Grade based on speed and consistency
    if (avgTime < 1000 && coefficient < 0.2) return 'A+';
    if (avgTime < 1500 && coefficient < 0.3) return 'A';
    if (avgTime < 2000 && coefficient < 0.4) return 'B+';
    if (avgTime < 3000 && coefficient < 0.5) return 'B';
    if (avgTime < 4000 && coefficient < 0.6) return 'C+';
    if (avgTime < 5000) return 'C';
    return 'D';
  }

  // Run comprehensive performance tests
  async runAllTests() {
    this.log('🚀 Starting Performance Tests');
    this.startTime = Date.now();
    this.memoryBaseline = this.getMemoryUsage();
    
    // Initialize client
    if (!this.initializeClient()) {
      this.log('❌ Cannot proceed without Twitter client');
      return;
    }
    
    this.log(`📊 Memory Baseline: ${this.memoryBaseline.heapUsed}MB heap, ${this.memoryBaseline.rss}MB RSS`);
    
    try {
      // Run all test scenarios
      for (const scenario of this.testScenarios) {
        if (scenario.type === 'sequential') {
          await this.runSequentialTests(scenario);
        } else if (scenario.type === 'concurrent') {
          await this.runConcurrentTests(scenario);
        }
        
        // Analyze trends after each scenario
        const trends = this.analyzePerformanceTrends();
        if (trends && trends.degradationDetected) {
          this.log(`⚠️ Performance degradation detected after ${scenario.name}`);
        }
        
        // Break between scenarios
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error) {
      this.logError('Performance test suite failed', error);
    }
    
    // Generate final report
    this.generateReport();
  }

  // Generate comprehensive performance report
  generateReport() {
    const totalTime = Date.now() - this.startTime;
    const successfulTests = this.results.filter(r => r.success);
    const failedTests = this.results.filter(r => !r.success);
    const finalMemory = this.getMemoryUsage();
    
    this.log('\n📊 PERFORMANCE TEST REPORT');
    this.log('============================');
    this.log(`Total Tests: ${this.results.length}`);
    this.log(`Successful: ${successfulTests.length}`);
    this.log(`Failed: ${failedTests.length}`);
    this.log(`Success Rate: ${((successfulTests.length / this.results.length) * 100).toFixed(1)}%`);
    this.log(`Total Test Time: ${(totalTime / 1000 / 60).toFixed(2)} minutes`);
    this.log(`Memory Usage: ${this.memoryBaseline.heapUsed}MB → ${finalMemory.heapUsed}MB (Δ${(finalMemory.heapUsed - this.memoryBaseline.heapUsed).toFixed(1)}MB)`);
    
    if (successfulTests.length > 0) {
      const avgResponseTime = successfulTests.reduce((sum, r) => sum + r.responseTime, 0) / successfulTests.length;
      const avgThroughput = successfulTests.reduce((sum, r) => sum + r.performance.throughput, 0) / successfulTests.length;
      const maxResponseTime = Math.max(...successfulTests.map(r => r.responseTime));
      const minResponseTime = Math.min(...successfulTests.map(r => r.responseTime));
      const totalTweets = successfulTests.reduce((sum, r) => sum + r.totalTweets, 0);
      
      this.log('\n📈 Overall Performance Metrics:');
      this.log(`Average Response Time: ${avgResponseTime.toFixed(0)}ms`);
      this.log(`Response Time Range: ${minResponseTime}ms - ${maxResponseTime}ms`);
      this.log(`Average Throughput: ${avgThroughput.toFixed(1)} tweets/sec`);
      this.log(`Total Tweets Processed: ${totalTweets}`);
      this.log(`Stability Index: ${this.calculateStabilityIndex().toFixed(1)}%`);
    }
    
    // Performance trends
    const trends = this.analyzePerformanceTrends();
    if (trends) {
      this.log('\n📊 Performance Trends:');
      this.log(`Response Time Trend: ${trends.responseTimeChange > 0 ? '+' : ''}${trends.responseTimeChange.toFixed(1)}%`);
      this.log(`Throughput Trend: ${trends.throughputChange > 0 ? '+' : ''}${trends.throughputChange.toFixed(1)}%`);
      this.log(`Stability Index: ${trends.stabilityIndex.toFixed(1)}%`);
      if (trends.degradationDetected) {
        this.log(`⚠️ Performance degradation detected`);
      }
    }
    
    // Concurrency results
    if (this.concurrencyResults.length > 0) {
      this.log('\n⚡ Concurrency Test Results:');
      this.concurrencyResults.forEach(result => {
        this.log(`${result.scenario}:`);
        this.log(`  Concurrency: ${result.concurrency} | Success Rate: ${result.successRate.toFixed(1)}%`);
        this.log(`  Avg Response: ${result.avgResponseTime.toFixed(0)}ms | Throughput: ${result.totalThroughput.toFixed(1)} tweets/sec`);
      });
    }
    
    // Performance benchmarks
    const benchmarks = this.generateBenchmarks();
    if (benchmarks) {
      this.log('\n🏆 Performance Benchmarks:');
      Object.entries(benchmarks).forEach(([key, benchmark]) => {
        this.log(`${benchmark.queryType} queries (limit ${benchmark.limit}):`);
        this.log(`  Grade: ${benchmark.metrics.performanceGrade} | Tests: ${benchmark.metrics.count}`);
        this.log(`  Avg: ${benchmark.metrics.avgResponseTime.toFixed(0)}ms | Range: ${benchmark.metrics.minResponseTime}-${benchmark.metrics.maxResponseTime}ms`);
        this.log(`  Throughput: ${benchmark.metrics.avgThroughput.toFixed(1)} tweets/sec | Consistency: ${(100 - (benchmark.metrics.responseTimeStdDev / benchmark.metrics.avgResponseTime * 100)).toFixed(1)}%`);
      });
    }
    
    // Recommendations
    this.log('\n💡 Performance Recommendations:');
    if (avgResponseTime > 3000) {
      this.log('  - Consider optimizing query complexity or reducing result limits');
    }
    if (this.calculateStabilityIndex() < 80) {
      this.log('  - Response times show high variance - investigate consistency issues');
    }
    if (this.concurrencyResults.some(r => r.successRate < 90)) {
      this.log('  - Some concurrent tests failed - review rate limiting and error handling');
    }
    if (failedTests.length > 0) {
      this.log('  - Review failed tests for potential reliability improvements');
    }
    if (avgResponseTime < 1500 && this.calculateStabilityIndex() > 90) {
      this.log('  - Performance is excellent - current configuration is optimal');
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

  // Save test results
  saveResults() {
    const benchmarks = this.generateBenchmarks();
    const trends = this.analyzePerformanceTrends();
    
    const report = {
      testName: 'Performance Test',
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        totalTime: Date.now() - this.startTime,
        memoryUsage: {
          baseline: this.memoryBaseline,
          final: this.getMemoryUsage()
        }
      },
      performanceMetrics: {
        trends,
        stability: this.calculateStabilityIndex(),
        benchmarks
      },
      results: this.results,
      concurrencyResults: this.concurrencyResults,
      errors: this.errors,
      testScenarios: this.testScenarios
    };
    
    this.log('\n💾 Performance test results ready for analysis');
    this.log('Comprehensive metrics available in this.results');
    this.log('Benchmarks and trends calculated for optimization insights');
  }
}

// Execute tests if running directly
async function runTests() {
  const test = new PerformanceTest();
  await test.runAllTests();
  return test;
}

// Export for use in other modules
export { PerformanceTest, runTests };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}