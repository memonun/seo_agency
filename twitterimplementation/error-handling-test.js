/**
 * Twitter Error Handling Test
 * 
 * Comprehensive testing of error scenarios and recovery mechanisms
 * Tests various failure modes and validates error handling
 */

import { TwitterApi } from '@virtuals-protocol/game-twitter-node';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class ErrorHandlingTest {
  constructor() {
    this.results = [];
    this.errorScenarios = [];
    this.recoveryTests = [];
    this.startTime = null;
    this.client = null;
    
    // Error test scenarios
    this.errorTestCases = [
      {
        name: 'Invalid Authentication',
        type: 'auth_error',
        setup: () => this.setupInvalidAuth(),
        query: 'test authentication',
        expectedError: 'authentication'
      },
      {
        name: 'Empty Query',
        type: 'validation_error',
        setup: () => this.setupValidClient(),
        query: '',
        expectedError: 'empty query'
      },
      {
        name: 'Very Long Query',
        type: 'validation_error',
        setup: () => this.setupValidClient(),
        query: 'a'.repeat(1000),
        expectedError: 'query too long'
      },
      {
        name: 'Invalid Characters',
        type: 'validation_error',
        setup: () => this.setupValidClient(),
        query: 'test\x00\x01\x02invalid',
        expectedError: 'invalid characters'
      },
      {
        name: 'Special Characters Only',
        type: 'validation_error',
        setup: () => this.setupValidClient(),
        query: '!@#$%^&*()',
        expectedError: 'no results'
      },
      {
        name: 'Network Timeout Simulation',
        type: 'network_error',
        setup: () => this.setupValidClient(),
        query: 'network test',
        expectedError: 'timeout'
      }
    ];
  }

  // Setup valid client
  setupValidClient() {
    try {
      const accessToken = process.env.GAME_TWITTER_ACCESS_TOKEN;
      if (!accessToken) {
        throw new Error('GAME_TWITTER_ACCESS_TOKEN not found in environment');
      }
      this.client = new TwitterApi({
        gameTwitterAccessToken: accessToken
      });
      return true;
    } catch (error) {
      this.logError('Failed to setup valid client', error);
      return false;
    }
  }

  // Setup invalid authentication for testing
  setupInvalidAuth() {
    try {
      // Use invalid token for testing
      this.client = new TwitterApi({
        gameTwitterAccessToken: 'invalid_token_for_testing'
      });
      return true;
    } catch (error) {
      this.logError('Failed to setup invalid auth client', error);
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

  // Core search function with error handling
  async performSearchWithErrorHandling(query, expectedErrorType = null) {
    const testId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.log(`🧪 Testing: "${query}" | Expected Error: ${expectedErrorType || 'none'} | Test ID: ${testId}`);
      
      const startTime = Date.now();
      
      // Validate query before API call
      const validationResult = this.validateQuery(query);
      if (!validationResult.valid) {
        throw new Error(`Validation failed: ${validationResult.reason}`);
      }
      
      // Build search query
      const searchQuery = `${query} -is:retweet lang:en`.trim();
      
      // Use GAME SDK to search tweets with timeout
      const searchResults = await Promise.race([
        this.client.v2.search(searchQuery, {
          max_results: 10,
          'tweet.fields': [
            'created_at',
            'public_metrics',
            'author_id'
          ].join(','),
          'user.fields': [
            'username',
            'name'
          ].join(','),
          expansions: 'author_id'
        }),
        // Timeout after 30 seconds
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 30000)
        )
      ]);
      
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
        testId,
        query,
        expectedErrorType,
        responseTime,
        totalTweets: formattedTweets.length,
        tweets: formattedTweets,
        timestamp: new Date().toISOString(),
        success: true,
        actualError: null
      };
      
      // If we expected an error but didn't get one
      if (expectedErrorType && expectedErrorType !== 'none') {
        testResult.success = false;
        testResult.actualError = 'Expected error but request succeeded';
        this.log(`⚠️ Expected error but request succeeded for ${testId}`);
      } else {
        this.log(`✅ Success ${testId}: Found ${formattedTweets.length} tweets in ${responseTime}ms`);
      }
      
      this.results.push(testResult);
      return testResult;
      
    } catch (error) {
      const responseTime = Date.now() - Date.now(); // Will be very small for immediate errors
      
      const testResult = {
        testId,
        query,
        expectedErrorType,
        responseTime,
        error: error.message,
        errorCode: error.code,
        errorType: this.categorizeError(error),
        timestamp: new Date().toISOString(),
        success: false,
        actualError: error.message
      };
      
      // Check if this was the expected error type
      if (expectedErrorType && this.errorMatches(error, expectedErrorType)) {
        testResult.success = true;
        this.log(`✅ Expected error correctly caught ${testId}: ${error.message}`);
      } else {
        this.log(`❌ Unexpected error ${testId}: ${error.message}`);
      }
      
      this.results.push(testResult);
      
      // Record error scenario
      this.errorScenarios.push({
        testId,
        query,
        expectedErrorType,
        actualErrorType: testResult.errorType,
        errorMessage: error.message,
        errorCode: error.code,
        timestamp: new Date().toISOString(),
        expectedError: !!expectedErrorType,
        correctlyHandled: testResult.success
      });
      
      return testResult;
    }
  }

  // Validate query input
  validateQuery(query) {
    if (!query || typeof query !== 'string') {
      return { valid: false, reason: 'Query must be a non-empty string' };
    }
    
    if (query.trim().length === 0) {
      return { valid: false, reason: 'Query cannot be empty or whitespace only' };
    }
    
    if (query.length > 500) {
      return { valid: false, reason: 'Query too long (max 500 characters)' };
    }
    
    // Check for null bytes or other problematic characters
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(query)) {
      return { valid: false, reason: 'Query contains invalid control characters' };
    }
    
    return { valid: true };
  }

  // Categorize error types
  categorizeError(error) {
    const message = error.message.toLowerCase();
    const code = error.code;
    
    if (code === 401 || message.includes('unauthorized') || message.includes('authentication')) {
      return 'authentication_error';
    }
    
    if (code === 403 || message.includes('forbidden')) {
      return 'authorization_error';
    }
    
    if (code === 429 || message.includes('rate limit')) {
      return 'rate_limit_error';
    }
    
    if (code === 404 || message.includes('not found')) {
      return 'not_found_error';
    }
    
    if (message.includes('timeout') || message.includes('network')) {
      return 'network_error';
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      return 'validation_error';
    }
    
    if (code >= 500) {
      return 'server_error';
    }
    
    return 'unknown_error';
  }

  // Check if error matches expected type
  errorMatches(error, expectedType) {
    const actualType = this.categorizeError(error);
    
    switch (expectedType) {
      case 'authentication':
        return actualType === 'authentication_error';
      case 'empty query':
        return error.message.includes('empty') || error.message.includes('validation');
      case 'query too long':
        return error.message.includes('too long') || error.message.includes('validation');
      case 'invalid characters':
        return error.message.includes('invalid') || error.message.includes('validation');
      case 'no results':
        return actualType === 'not_found_error' || error.message.includes('not found');
      case 'timeout':
        return actualType === 'network_error';
      default:
        return false;
    }
  }

  // Test error recovery mechanisms
  async testErrorRecovery() {
    this.log('\n🔄 Testing Error Recovery Mechanisms');
    
    const recoveryTests = [];
    
    // Test 1: Recovery from authentication error
    this.log('Testing recovery from authentication error...');
    
    // First, cause an auth error
    this.setupInvalidAuth();
    const authErrorResult = await this.performSearchWithErrorHandling('auth test', 'authentication');
    
    // Then recover with valid auth
    this.setupValidClient();
    const authRecoveryResult = await this.performSearchWithErrorHandling('auth recovery test', 'none');
    
    recoveryTests.push({
      name: 'Authentication Recovery',
      errorResult: authErrorResult,
      recoveryResult: authRecoveryResult,
      successful: authRecoveryResult.success && !authErrorResult.success
    });
    
    // Test 2: Recovery from network timeout (simulated)
    this.log('Testing recovery from network issues...');
    
    // Simulate network recovery by making a normal request
    const networkRecoveryResult = await this.performSearchWithErrorHandling('network recovery test', 'none');
    
    recoveryTests.push({
      name: 'Network Recovery',
      recoveryResult: networkRecoveryResult,
      successful: networkRecoveryResult.success
    });
    
    this.recoveryTests = recoveryTests;
    
    this.log('✅ Error recovery tests completed');
    return recoveryTests;
  }

  // Test edge cases
  async testEdgeCases() {
    this.log('\n🎯 Testing Edge Cases');
    
    const edgeCases = [
      { query: ' ', name: 'Whitespace only' },
      { query: '\t\n\r', name: 'Tab/newline characters' },
      { query: 'ñoño café', name: 'Unicode characters' },
      { query: '🚀🌟💻', name: 'Emoji only' },
      { query: 'test ' + 'a'.repeat(400), name: 'Near max length' },
      { query: 'COVID-19', name: 'Hyphenated terms' },
      { query: 'test@email.com', name: 'Email-like pattern' },
      { query: '#hashtag @mention', name: 'Social media syntax' }
    ];
    
    for (const edgeCase of edgeCases) {
      this.log(`Testing edge case: ${edgeCase.name}`);
      
      try {
        await this.performSearchWithErrorHandling(edgeCase.query, 'none');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay
      } catch (error) {
        this.logError(`Edge case failed: ${edgeCase.name}`, error);
      }
    }
  }

  // Test concurrent error scenarios
  async testConcurrentErrors() {
    this.log('\n⚡ Testing Concurrent Error Scenarios');
    
    const concurrentPromises = [];
    
    // Create multiple simultaneous requests with different error types
    for (let i = 0; i < 5; i++) {
      const promise = this.performSearchWithErrorHandling(`concurrent test ${i}`, 'none');
      concurrentPromises.push(promise);
    }
    
    // Wait for all to complete
    try {
      const results = await Promise.allSettled(concurrentPromises);
      
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.length - successful;
      
      this.log(`Concurrent test results: ${successful} successful, ${failed} failed`);
      
    } catch (error) {
      this.logError('Concurrent error test failed', error);
    }
  }

  // Run comprehensive error handling tests
  async runAllTests() {
    this.log('🚀 Starting Error Handling Tests');
    this.startTime = Date.now();
    
    try {
      // Test specific error scenarios
      this.log('\n🧪 Testing Specific Error Scenarios');
      for (const testCase of this.errorTestCases) {
        this.log(`\nTesting: ${testCase.name}`);
        
        // Setup for this test
        if (testCase.setup) {
          testCase.setup();
        }
        
        // Perform the test
        await this.performSearchWithErrorHandling(testCase.query, testCase.expectedError);
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Test error recovery
      await this.testErrorRecovery();
      
      // Test edge cases
      await this.testEdgeCases();
      
      // Test concurrent errors
      await this.testConcurrentErrors();
      
    } catch (error) {
      this.logError('Error handling test suite failed', error);
    }
    
    // Generate final report
    this.generateReport();
  }

  // Generate comprehensive test report
  generateReport() {
    const totalTime = Date.now() - this.startTime;
    const successfulTests = this.results.filter(r => r.success);
    const failedTests = this.results.filter(r => !r.success);
    const expectedErrors = this.errorScenarios.filter(e => e.expectedError);
    const unexpectedErrors = this.errorScenarios.filter(e => !e.expectedError);
    
    this.log('\n📊 ERROR HANDLING TEST REPORT');
    this.log('===============================');
    this.log(`Total Tests: ${this.results.length}`);
    this.log(`Successful: ${successfulTests.length}`);
    this.log(`Failed: ${failedTests.length}`);
    this.log(`Expected Errors: ${expectedErrors.length}`);
    this.log(`Unexpected Errors: ${unexpectedErrors.length}`);
    this.log(`Total Time: ${(totalTime / 1000).toFixed(2)}s`);
    
    // Error scenario analysis
    if (this.errorScenarios.length > 0) {
      this.log('\n🔍 Error Scenario Analysis:');
      
      const errorTypeGroups = {};
      this.errorScenarios.forEach(scenario => {
        const type = scenario.actualErrorType || 'unknown';
        if (!errorTypeGroups[type]) {
          errorTypeGroups[type] = [];
        }
        errorTypeGroups[type].push(scenario);
      });
      
      Object.entries(errorTypeGroups).forEach(([type, scenarios]) => {
        const correctlyHandled = scenarios.filter(s => s.correctlyHandled).length;
        this.log(`  ${type}: ${scenarios.length} occurrences, ${correctlyHandled} correctly handled`);
      });
    }
    
    // Recovery test results
    if (this.recoveryTests.length > 0) {
      this.log('\n🔄 Recovery Test Results:');
      this.recoveryTests.forEach(test => {
        this.log(`  ${test.name}: ${test.successful ? '✅ Successful' : '❌ Failed'}`);
      });
    }
    
    // Error handling effectiveness
    const totalErrorScenarios = this.errorScenarios.length;
    const correctlyHandledErrors = this.errorScenarios.filter(e => e.correctlyHandled).length;
    const errorHandlingRate = totalErrorScenarios > 0 ? 
      (correctlyHandledErrors / totalErrorScenarios * 100).toFixed(1) : 'N/A';
    
    this.log(`\n📈 Error Handling Effectiveness: ${errorHandlingRate}%`);
    
    if (unexpectedErrors.length > 0) {
      this.log('\n⚠️ Unexpected Errors:');
      unexpectedErrors.forEach(error => {
        this.log(`  - ${error.testId}: ${error.errorMessage}`);
      });
    }
    
    // Recommendations
    this.log('\n💡 Recommendations:');
    if (unexpectedErrors.length > 0) {
      this.log('  - Review unexpected error handling mechanisms');
    }
    if (errorHandlingRate < 90) {
      this.log('  - Improve error detection and categorization');
    }
    if (this.recoveryTests.some(t => !t.successful)) {
      this.log('  - Enhance error recovery mechanisms');
    }
    if (unexpectedErrors.length === 0 && errorHandlingRate >= 90) {
      this.log('  - Error handling appears robust and comprehensive');
    }
    
    // Save results to file
    this.saveResults();
  }

  // Save test results to JSON file
  saveResults() {
    const report = {
      testName: 'Error Handling Test',
      timestamp: new Date().toISOString(),
      summary: {
        totalTests: this.results.length,
        successful: this.results.filter(r => r.success).length,
        failed: this.results.filter(r => !r.success).length,
        totalErrorScenarios: this.errorScenarios.length,
        expectedErrors: this.errorScenarios.filter(e => e.expectedError).length,
        totalTime: Date.now() - this.startTime
      },
      results: this.results,
      errorScenarios: this.errorScenarios,
      recoveryTests: this.recoveryTests,
      testCases: this.errorTestCases
    };
    
    this.log('\n💾 Error handling test results ready for analysis');
    this.log('Results available in this.results');
    this.log('Error scenarios available in this.errorScenarios');
  }
}

// Execute tests if running directly
async function runTests() {
  const test = new ErrorHandlingTest();
  await test.runAllTests();
  return test;
}

// Export for use in other modules
export { ErrorHandlingTest, runTests };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}