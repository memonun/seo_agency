#!/usr/bin/env node
/**
 * Twitter Implementation Test Runner
 * 
 * Main script to run all Twitter API tests with options for selective execution
 * Provides a simple interface to run individual tests or complete test suites
 */

import { KeywordAnalysisTest } from './keyword-analysis-test.js';
import { HashtagAnalysisTest } from './hashtag-analysis-test.js';
import { MentionFunctionalityTest } from './mention-functionality-test.js';
import { RateLimitingTest } from './rate-limiting-test.js';
import { ErrorHandlingTest } from './error-handling-test.js';
import { DataValidationTest } from './data-validation-test.js';
import { PerformanceTest } from './performance-test.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class TwitterTestRunner {
  constructor() {
    this.testResults = new Map();
    this.startTime = null;
    this.availableTests = {
      'keyword': {
        name: 'Keyword Analysis Test',
        class: KeywordAnalysisTest,
        description: 'Tests keyword search functionality with various queries and limits'
      },
      'hashtag': {
        name: 'Hashtag Analysis Test',
        class: HashtagAnalysisTest,
        description: 'Tests hashtag search with single and multiple combinations'
      },
      'mention': {
        name: 'Mention Functionality Test',
        class: MentionFunctionalityTest,
        description: 'Compares results with and without mention inclusion'
      },
      'ratelimit': {
        name: 'Rate Limiting Test',
        class: RateLimitingTest,
        description: 'Tests API rate limits and handling mechanisms'
      },
      'error': {
        name: 'Error Handling Test',
        class: ErrorHandlingTest,
        description: 'Tests error scenarios and recovery mechanisms'
      },
      'validation': {
        name: 'Data Validation Test',
        class: DataValidationTest,
        description: 'Validates response data quality and structure'
      },
      'performance': {
        name: 'Performance Test',
        class: PerformanceTest,
        description: 'Comprehensive performance benchmarking and optimization'
      }
    };
    
    // Test suites for grouped execution
    this.testSuites = {
      'quick': ['keyword', 'hashtag', 'mention'],
      'core': ['keyword', 'hashtag', 'mention', 'validation'],
      'full': ['keyword', 'hashtag', 'mention', 'ratelimit', 'error', 'validation', 'performance'],
      'performance-focused': ['performance', 'ratelimit'],
      'quality-focused': ['validation', 'error'],
      'functionality-focused': ['keyword', 'hashtag', 'mention']
    };
  }

  // Display help information
  displayHelp() {
    console.log('\n🧪 Twitter Implementation Test Runner');
    console.log('=====================================\n');
    
    console.log('Usage:');
    console.log('  node run-tests.js [options]\n');
    
    console.log('Standard Options:');
    console.log('  --help, -h              Show this help message');
    console.log('  --list, -l              List all available tests');
    console.log('  --test <name>           Run specific test (see --list for names)');
    console.log('  --suite <name>          Run test suite (quick|core|full|performance-focused|quality-focused|functionality-focused)');
    console.log('  --all                   Run all available tests');
    console.log('  --summary               Show summary only (less verbose output)');
    console.log('  --delay <ms>            Delay between tests in milliseconds (default: 5000)\n');
    
    console.log('Custom Testing Options:');
    console.log('  --keyword <keyword>     Test specific keyword');
    console.log('  --hashtag <hashtag>     Test specific hashtag (with or without #)');
    console.log('  --keywords <list>       Test multiple keywords (comma-separated)');
    console.log('  --hashtags <list>       Test multiple hashtags (comma-separated)');
    console.log('  --limit <number>        Number of tweets to fetch (default: 25, min: 10, max: 100)');
    console.log('  --mentions              Include reply tweets + fetch top 10 replies per tweet\n');
    
    console.log('Hashtag Mode Options:');
    console.log('  --manual                Use manually provided hashtags (default)');
    console.log('  --autofill              Auto-discover top 5 hashtags from keyword search\n');
    
    console.log('Search Filtering Options:');
    console.log('  --sort <mode>           Sort tweets: "recent" (chronological) or "popular" (by engagement)');
    console.log('  --location <place>      Filter by geographic location (e.g., "Ukraine", "Turkey")');
    console.log('  --global                Search globally without geographic restrictions\n');
    
    console.log('Results Display Options:');
    console.log('  --show-tweets           Display actual tweet content');
    console.log('  --save-results          Save results to JSON file');
    console.log('  --output <filename>     Specify output filename (default: timestamp-based)\n');
    
    console.log('Standard Examples:');
    console.log('  node run-tests.js --test keyword');
    console.log('  node run-tests.js --suite quick');
    console.log('  node run-tests.js --all');
    console.log('  node run-tests.js --test performance --summary');
    console.log('  node run-tests.js --suite core --delay 3000\n');
    
    console.log('Custom Testing Examples:');
    console.log('  node run-tests.js --keyword "machine learning"');
    console.log('  node run-tests.js --hashtag "#nodejs" --limit 50');
    console.log('  node run-tests.js --keywords "AI,blockchain,startup" --summary');
    console.log('  node run-tests.js --hashtags "#react,#javascript" --mentions');
    console.log('  node run-tests.js --keyword "climate change" --limit 100');
    console.log('  node run-tests.js --keyword "arda güler" --show-tweets');
    console.log('  node run-tests.js --keyword "bitcoin" --save-results --output bitcoin-analysis.json\n');
    
    console.log('Hashtag Mode Examples:');
    console.log('  node run-tests.js --manual --hashtags "#AI,#ML,#DeepLearning" --mentions');
    console.log('  node run-tests.js --autofill --keyword "artificial intelligence" --show-tweets');
    console.log('  node run-tests.js --autofill --keyword "blockchain" --save-results\n');
    
    console.log('Search Filtering Examples:');
    console.log('  node run-tests.js --keyword "earthquake Turkey" --sort recent --location "Turkey"');
    console.log('  node run-tests.js --hashtag "#UkraineWar" --sort popular --location "Ukraine"');
    console.log('  node run-tests.js --keyword "climate change" --sort popular --global');
    console.log('  node run-tests.js --autofill --keyword "AI regulation" --global --show-tweets\n');
  }

  // List all available tests and suites
  listTests() {
    console.log('\n📋 Available Tests:');
    console.log('==================\n');
    
    Object.entries(this.availableTests).forEach(([key, test]) => {
      console.log(`${key.padEnd(12)} - ${test.name}`);
      console.log(`${' '.repeat(15)}${test.description}\n`);
    });
    
    console.log('📦 Available Test Suites:');
    console.log('========================\n');
    
    Object.entries(this.testSuites).forEach(([suiteName, tests]) => {
      console.log(`${suiteName.padEnd(20)} - ${tests.join(', ')}`);
    });
    console.log();
  }

  // Parse command line arguments
  parseArguments() {
    const args = process.argv.slice(2);
    const options = {
      help: false,
      list: false,
      test: null,
      suite: null,
      all: false,
      summary: false,
      delay: 5000,
      // Custom test options
      keyword: null,
      hashtag: null,
      keywords: null,
      hashtags: null,
      limit: 25,
      mentions: null,
      // Hashtag mode options
      manual: false,
      autofill: false,
      // Search filtering options
      sort: null,
      location: null,
      global: false,
      // Results display options
      showTweets: false,
      saveResults: false,
      output: null
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      
      switch (arg) {
        case '--help':
        case '-h':
          options.help = true;
          break;
        case '--list':
        case '-l':
          options.list = true;
          break;
        case '--test':
          options.test = args[++i];
          break;
        case '--suite':
          options.suite = args[++i];
          break;
        case '--all':
          options.all = true;
          break;
        case '--summary':
          options.summary = true;
          break;
        case '--delay':
          options.delay = parseInt(args[++i]) || 5000;
          break;
        case '--keyword':
          options.keyword = args[++i];
          break;
        case '--hashtag':
          options.hashtag = args[++i];
          break;
        case '--keywords':
          options.keywords = args[++i];
          break;
        case '--hashtags':
          options.hashtags = args[++i];
          break;
        case '--limit':
          options.limit = parseInt(args[++i]) || 25;
          break;
        case '--mentions':
          options.mentions = true;
          break;
        case '--manual':
          options.manual = true;
          break;
        case '--autofill':
          options.autofill = true;
          break;
        case '--sort':
          options.sort = args[++i];
          break;
        case '--location':
          options.location = args[++i];
          break;
        case '--global':
          options.global = true;
          break;
        case '--show-tweets':
          options.showTweets = true;
          break;
        case '--save-results':
          options.saveResults = true;
          break;
        case '--output':
          options.output = args[++i];
          break;
        default:
          console.log(`Unknown option: ${arg}`);
          process.exit(1);
      }
    }

    return options;
  }

  // Check environment setup
  checkEnvironment() {
    const requiredVars = ['GAME_TWITTER_ACCESS_TOKEN'];
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
      console.log('❌ Missing required environment variables:');
      missing.forEach(varName => {
        console.log(`   - ${varName}`);
      });
      console.log('\nPlease set these variables and try again.');
      console.log('\n💡 Generate a token with:');
      console.log('   npx @virtuals-protocol/game-twitter-node auth -k <GAME_API_KEY>');
      return false;
    }
    
    // Validate token format
    const token = process.env.GAME_TWITTER_ACCESS_TOKEN;
    if (!token.startsWith('apx-')) {
      console.log('⚠️  WARNING: GAME_TWITTER_ACCESS_TOKEN should start with "apx-"');
      console.log('   Current token format may cause authentication errors.');
      console.log('\n💡 Generate a proper token with:');
      console.log('   npx @virtuals-protocol/game-twitter-node auth -k <GAME_API_KEY>');
    }
    
    console.log('✅ Environment setup validated');
    return true;
  }

  // Run a single test
  async runSingleTest(testKey, summary = false) {
    const testInfo = this.availableTests[testKey];
    if (!testInfo) {
      throw new Error(`Unknown test: ${testKey}`);
    }

    console.log(`\n🧪 Starting ${testInfo.name}`);
    console.log('='.repeat(50));
    
    const startTime = Date.now();
    
    try {
      // Set summary mode if requested
      const originalLog = console.log;
      if (summary) {
        // In summary mode, capture logs but only show key information
        console.log = (...args) => {
          const message = args[0];
          // Only show important messages in summary mode
          if (typeof message === 'string' && (
            message.includes('✅') || 
            message.includes('❌') || 
            message.includes('📊') ||
            message.includes('Starting') ||
            message.includes('REPORT') ||
            message.includes('Success Rate') ||
            message.includes('Total Tests') ||
            message.includes('recommendations')
          )) {
            originalLog(...args);
          }
        };
      }
      
      const TestClass = testInfo.class;
      const testInstance = new TestClass();
      await testInstance.runAllTests();
      
      // Restore original console.log
      if (summary) {
        console.log = originalLog;
      }
      
      const duration = Date.now() - startTime;
      
      // Collect results summary
      const results = {
        name: testInfo.name,
        key: testKey,
        duration,
        success: true,
        summary: this.extractTestSummary(testInstance)
      };
      
      this.testResults.set(testKey, results);
      
      console.log(`\n✅ ${testInfo.name} completed in ${(duration / 1000).toFixed(1)}s`);
      return results;
      
    } catch (error) {
      console.log(`\n❌ ${testInfo.name} failed: ${error.message}`);
      
      const results = {
        name: testInfo.name,
        key: testKey,
        duration: Date.now() - startTime,
        success: false,
        error: error.message
      };
      
      this.testResults.set(testKey, results);
      return results;
    }
  }

  // Extract test summary from test instance
  extractTestSummary(testInstance) {
    const summary = {
      totalTests: 0,
      successful: 0,
      failed: 0,
      successRate: 0
    };

    if (testInstance.results && Array.isArray(testInstance.results)) {
      summary.totalTests = testInstance.results.length;
      summary.successful = testInstance.results.filter(r => r.success).length;
      summary.failed = summary.totalTests - summary.successful;
      summary.successRate = summary.totalTests > 0 ? (summary.successful / summary.totalTests * 100).toFixed(1) : 0;
    }

    // Add specific metrics based on test type
    if (testInstance.performanceMetrics || testInstance.concurrencyResults) {
      summary.type = 'performance';
    } else if (testInstance.validationResults) {
      summary.type = 'validation';
    } else if (testInstance.comparisons) {
      summary.type = 'comparison';
    } else if (testInstance.rateLimitEvents) {
      summary.type = 'ratelimit';
    } else if (testInstance.errorScenarios) {
      summary.type = 'error';
    } else {
      summary.type = 'analysis';
    }

    return summary;
  }

  // Run multiple tests with delays
  async runMultipleTests(testKeys, delay = 5000, summary = false) {
    console.log(`\n🚀 Running ${testKeys.length} tests with ${delay}ms delay between tests`);
    
    for (let i = 0; i < testKeys.length; i++) {
      const testKey = testKeys[i];
      
      await this.runSingleTest(testKey, summary);
      
      // Add delay between tests (except after the last one)
      if (i < testKeys.length - 1) {
        console.log(`\n⏳ Waiting ${delay / 1000}s before next test...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Display tweet results in console
  displayTweetResults(results) {
    console.log('\n📱 TWEET RESULTS');
    console.log('================\n');
    
    results.forEach(result => {
      if (result.success && result.tweets && result.tweets.length > 0) {
        console.log(`\n🔍 Keyword: "${result.keyword}"`);
        console.log(`Found ${result.totalTweets} tweets\n`);
        
        // Sort tweets by engagement
        const sortedTweets = [...result.tweets].sort((a, b) => {
          const engagementA = a.metrics.likes + a.metrics.retweets;
          const engagementB = b.metrics.likes + b.metrics.retweets;
          return engagementB - engagementA;
        });
        
        // Display top 5 tweets
        const tweetsToShow = Math.min(5, sortedTweets.length);
        console.log(`Top ${tweetsToShow} tweets by engagement:\n`);
        
        sortedTweets.slice(0, tweetsToShow).forEach((tweet, index) => {
          console.log(`${index + 1}. @${tweet.author.username} (${tweet.author.name})`);
          console.log(`   📝 ${tweet.text.substring(0, 150)}${tweet.text.length > 150 ? '...' : ''}`);
          console.log(`   ❤️  ${tweet.metrics.likes} | 🔁 ${tweet.metrics.retweets} | 💬 ${tweet.metrics.replies}`);
          console.log(`   😊 Sentiment: ${tweet.sentiment.label} (${tweet.sentiment.score.toFixed(2)})`);
          console.log(`   🔗 ${tweet.url}`);
          
          // Display replies if available
          if (tweet.replies && tweet.replies.length > 0) {
            console.log(`   📱 Top ${Math.min(3, tweet.replies.length)} replies:`);
            tweet.replies.slice(0, 3).forEach((reply, replyIndex) => {
              console.log(`     ${replyIndex + 1}. ↳ @${reply.author.username}: ${reply.text.substring(0, 100)}${reply.text.length > 100 ? '...' : ''}`);
              console.log(`        ❤️  ${reply.metrics.likes} | 🔁 ${reply.metrics.retweets} | 😊 ${reply.sentiment.label}`);
            });
          }
          
          console.log();
        });
        
        // Show analytics summary
        if (result.analytics) {
          console.log('📊 Analytics Summary:');
          console.log(`   Average Sentiment: ${result.analytics.avg_sentiment}`);
          console.log(`   Sentiment Distribution: ${JSON.stringify(result.analytics.sentiment_distribution)}`);
          console.log(`   Average Likes: ${result.analytics.engagement_stats.avg_likes}`);
          console.log(`   Average Retweets: ${result.analytics.engagement_stats.avg_retweets}`);
          console.log(`   Top Hashtags: ${result.analytics.top_hashtags.slice(0, 5).join(', ')}`);
          
          // Show reply analytics if available
          if (result.analytics.reply_analytics && result.analytics.reply_analytics.total_replies > 0) {
            console.log('📱 Reply Analytics:');
            console.log(`   Total Replies Analyzed: ${result.analytics.reply_analytics.total_replies}`);
            console.log(`   Average Reply Sentiment: ${result.analytics.reply_analytics.avg_reply_sentiment}`);
            console.log(`   Reply Sentiment Distribution: ${JSON.stringify(result.analytics.reply_analytics.reply_sentiment_distribution)}`);
            console.log(`   Average Reply Engagement: ${result.analytics.reply_analytics.avg_reply_engagement}`);
            console.log(`   Top Reply Authors: ${result.analytics.reply_analytics.top_reply_authors.slice(0, 3).map(a => `@${a.username}`).join(', ')}`);
          }
        }
      }
    });
  }
  
  // Save results to JSON file (supports both keyword and hashtag tests)
  async saveResultsToFile(results, outputFilename) {
    const fs = await import('fs');
    const path = await import('path');
    
    // Create results directory if it doesn't exist
    const resultsDir = path.join(process.cwd(), 'results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    // Detect test type from first result
    const firstResult = results[0];
    let testType = 'unknown';
    let testMode = 'unknown';
    
    if (firstResult.keyword) {
      testType = 'keyword';
      testMode = 'keyword';
    } else if (firstResult.searchHashtags) {
      testType = 'hashtag';
      testMode = firstResult.discoveryData ? 'hashtag-autofill' : 'hashtag-manual';
    }
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultName = testType === 'keyword' ? 
      `twitter-keyword-results-${timestamp}.json` : 
      `twitter-hashtag-results-${timestamp}.json`;
    const filename = outputFilename || defaultName;
    const filepath = path.join(resultsDir, filename);
    
    // Prepare data for saving with appropriate structure
    const dataToSave = {
      metadata: {
        timestamp: new Date().toISOString(),
        totalResults: results.length,
        testType,
        testMode,
        totalTweets: results.reduce((sum, r) => sum + (r.totalTweets || 0), 0)
      },
      results: results.map(r => {
        // Base structure for all result types
        const baseResult = {
          success: r.success,
          totalTweets: r.totalTweets,
          responseTime: r.responseTime,
          analytics: r.analytics,
          tweets: r.tweets,
          timestamp: r.timestamp,
          error: r.error || null
        };
        
        // Add test-specific fields
        if (testType === 'keyword') {
          return {
            ...baseResult,
            keyword: r.keyword,
            includeMentions: r.includeMentions,
            limit: r.limit
          };
        } else if (testType === 'hashtag') {
          const hashtagResult = {
            ...baseResult,
            searchHashtags: r.searchHashtags,
            includeMentions: r.includeMentions,
            limit: r.limit
          };
          
          // Add discovery data for autofill mode
          if (r.discoveryData) {
            hashtagResult.discoveryData = {
              keyword: r.discoveryData.keyword,
              totalTweetsAnalyzed: r.discoveryData.totalTweetsAnalyzed,
              totalHashtagsFound: r.discoveryData.totalHashtagsFound,
              discoveryTime: r.discoveryData.discoveryTime,
              detailedMetrics: r.discoveryData.detailedMetrics
            };
          }
          
          return hashtagResult;
        }
        
        return baseResult;
      })
    };
    
    // Add discovery summary to metadata for autofill mode
    if (testMode === 'hashtag-autofill' && results[0].discoveryData) {
      dataToSave.metadata.discoveryData = {
        keyword: results[0].discoveryData.keyword,
        totalHashtagsFound: results[0].discoveryData.totalHashtagsFound,
        discoveredHashtags: results[0].discoveryData.hashtags
      };
    }
    
    // Write to file
    fs.writeFileSync(filepath, JSON.stringify(dataToSave, null, 2));
    
    console.log(`\n💾 Results saved to: ${filepath}`);
    console.log(`   Test type: ${testType} (${testMode})`);
    console.log(`   Total tweets saved: ${dataToSave.metadata.totalTweets}`);
    console.log(`   File size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`);
    
    if (testMode === 'hashtag-autofill') {
      console.log(`   Discovery keyword: "${results[0].discoveryData?.keyword}"`);
      console.log(`   Discovered hashtags: ${results[0].discoveryData?.hashtags.join(', ')}`);
    }
  }
  
  // Generate overall summary report
  generateSummaryReport() {
    const totalTime = Date.now() - this.startTime;
    const allResults = Array.from(this.testResults.values());
    const successful = allResults.filter(r => r.success);
    const failed = allResults.filter(r => !r.success);
    
    console.log('\n📊 TWITTER IMPLEMENTATION TEST SUMMARY');
    console.log('=====================================');
    console.log(`Total Test Suites: ${allResults.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Failed: ${failed.length}`);
    console.log(`Overall Success Rate: ${((successful.length / allResults.length) * 100).toFixed(1)}%`);
    console.log(`Total Execution Time: ${(totalTime / 1000 / 60).toFixed(2)} minutes`);
    
    if (successful.length > 0) {
      console.log('\n✅ Successful Tests:');
      successful.forEach(result => {
        const duration = (result.duration / 1000).toFixed(1);
        const summary = result.summary;
        console.log(`  ${result.name}: ${duration}s | ${summary.totalTests} tests (${summary.successRate}% success)`);
      });
    }
    
    if (failed.length > 0) {
      console.log('\n❌ Failed Tests:');
      failed.forEach(result => {
        console.log(`  ${result.name}: ${result.error}`);
      });
    }
    
    // Recommendations based on results
    console.log('\n💡 Recommendations:');
    if (failed.length === 0) {
      console.log('  - All tests passed successfully! Twitter implementation is robust.');
    } else {
      console.log('  - Review failed tests and address any underlying issues.');
    }
    
    const performanceTests = successful.filter(r => r.summary.type === 'performance');
    if (performanceTests.length > 0) {
      console.log('  - Review performance test results for optimization opportunities.');
    }
    
    console.log('  - Run tests periodically to catch regressions and monitor performance.');
    console.log('  - Consider automating these tests in your CI/CD pipeline.');
  }

  // Run custom keyword test
  async runCustomKeywordTest(keywords, options) {
    console.log(`\n🔍 Running Custom Keyword Test`);
    console.log('==============================');
    
    const keywordArray = Array.isArray(keywords) ? keywords : [keywords];
    const includeMentions = options.mentions !== null ? options.mentions : false;
    
    // Prepare search options
    const searchOptions = {
      sort: options.sort,
      location: options.location,
      global: options.global
    };
    
    try {
      const { KeywordAnalysisTest } = await import('./keyword-analysis-test.js');
      const test = new KeywordAnalysisTest();
      
      // Initialize client
      if (!test.initializeClient()) {
        console.log('❌ Failed to initialize Twitter client');
        return { success: false, error: 'Client initialization failed' };
      }
      
      console.log(`Keywords: ${keywordArray.join(', ')}`);
      console.log(`Limit: ${options.limit} tweets per keyword`);
      console.log(`Mentions: ${includeMentions ? 'included' : 'excluded'}`);
      
      if (searchOptions.sort) console.log(`Sort: ${searchOptions.sort}`);
      if (searchOptions.location && !searchOptions.global) console.log(`Location: ${searchOptions.location}`);
      if (searchOptions.global) console.log(`Global search: enabled`);
      
      // Run custom searches instead of using runAllTests
      const results = [];
      for (const keyword of keywordArray) {
        const result = await test.searchKeyword(keyword, includeMentions, options.limit, searchOptions);
        results.push(result);
        
        // Small delay between searches to respect rate limits
        if (keywordArray.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      test.results = results;
      
      // Display tweets if requested
      if (options.showTweets && test.results.length > 0) {
        this.displayTweetResults(test.results);
      }
      
      // Save results if requested
      if (options.saveResults && test.results.length > 0) {
        await this.saveResultsToFile(test.results, options.output);
      }
      
      return {
        name: 'Custom Keyword Test',
        success: true,
        summary: this.extractTestSummary(test),
        results: test.results
      };
    } catch (error) {
      console.log(`❌ Custom keyword test failed: ${error.message}`);
      return {
        name: 'Custom Keyword Test',
        success: false,
        error: error.message
      };
    }
  }

  // Run custom hashtag test (supports both manual and autofill modes)
  async runCustomHashtagTest(hashtags, options) {
    console.log(`\n🏷️ Running Custom Hashtag Test`);
    console.log('===============================');
    
    const { HashtagAnalysisTest } = await import('./hashtag-analysis-test.js');
    const test = new HashtagAnalysisTest();
    
    // Initialize the test client
    if (!test.initializeClient()) {
      console.log('❌ Failed to initialize Twitter client');
      return { success: false, error: 'Client initialization failed' };
    }
    
    let hashtagsToAnalyze = [];
    let discoveryResult = null;
    
    // Handle autofill mode - discover hashtags from keyword
    if (options.autofill) {
      if (!options.keyword) {
        console.log('❌ Autofill mode requires --keyword parameter');
        return { success: false, error: 'Missing keyword for autofill' };
      }
      
      console.log(`\n🤖 Autofill Mode: Discovering hashtags for "${options.keyword}"`);
      console.log('━'.repeat(50));
      
      discoveryResult = await test.discoverTopHashtags(options.keyword, 5);
      
      if (!discoveryResult.success || discoveryResult.hashtags.length === 0) {
        console.log(`❌ Failed to discover hashtags for keyword "${options.keyword}"`);
        return { success: false, error: 'Hashtag discovery failed' };
      }
      
      hashtagsToAnalyze = discoveryResult.hashtags;
      console.log(`\n✨ Using discovered hashtags: ${hashtagsToAnalyze.join(', ')}`);
      
    } else {
      // Manual mode - use provided hashtags
      if (!hashtags) {
        console.log('❌ Manual mode requires --hashtag or --hashtags parameter');
        return { success: false, error: 'Missing hashtags for manual mode' };
      }
      
      console.log(`\n✋ Manual Mode: Using provided hashtags`);
      
      const hashtagArray = Array.isArray(hashtags) ? hashtags : [hashtags];
      hashtagsToAnalyze = hashtagArray.map(tag => tag.startsWith('#') ? tag : `#${tag}`);
    }
    
    const includeMentions = options.mentions !== null ? options.mentions : false;
    
    // Prepare search options
    const searchOptions = {
      sort: options.sort,
      location: options.location,
      global: options.global
    };
    
    console.log(`\n📊 Analyzing Hashtags:`);
    console.log(`Hashtags: ${hashtagsToAnalyze.join(', ')}`);
    console.log(`Limit: ${options.limit} tweets`);
    console.log(`Mentions: ${includeMentions ? 'included' : 'excluded'}`);
    
    if (searchOptions.sort) console.log(`Sort: ${searchOptions.sort}`);
    if (searchOptions.location && !searchOptions.global) console.log(`Location: ${searchOptions.location}`);
    if (searchOptions.global) console.log(`Global search: enabled`);
    console.log('━'.repeat(50));
    
    try {
      // Run hashtag analysis on the selected hashtags
      const result = await test.searchHashtags(hashtagsToAnalyze, includeMentions, options.limit, searchOptions);
      
      if (result.success) {
        console.log(`\n✅ Found ${result.totalTweets} tweets in ${result.responseTime}ms`);
        console.log(`📊 Analytics:`, {
          avgSentiment: result.analytics.avg_sentiment,
          topHashtags: result.analytics.top_hashtags.slice(0, 5),
          engagementStats: result.analytics.engagement_stats
        });
        
        // If autofill mode, show discovery metrics
        if (options.autofill && discoveryResult) {
          console.log(`\n🔍 Discovery Metrics:`);
          console.log(`  Total tweets analyzed for discovery: ${discoveryResult.totalTweetsAnalyzed}`);
          console.log(`  Unique hashtags found: ${discoveryResult.totalHashtagsFound}`);
          console.log(`  Discovery time: ${discoveryResult.discoveryTime}ms`);
        }
        
        // Display tweets if requested
        if (options.showTweets) {
          this.displayTweetResults([result]);
        }
        
        // Save results if requested
        if (options.saveResults) {
          // Include discovery data in saved results if autofill mode
          if (options.autofill) {
            result.discoveryData = discoveryResult;
          }
          await this.saveResultsToFile([result], options.output);
        }
      }
      
      return {
        name: `Custom Hashtag Test (${options.autofill ? 'Autofill' : 'Manual'})`,
        success: result.success,
        summary: { totalTests: 1, successful: result.success ? 1 : 0, failed: result.success ? 0 : 1 },
        results: [result],
        discoveryData: discoveryResult
      };
    } catch (error) {
      console.log(`❌ Custom hashtag test failed: ${error.message}`);
      return {
        name: 'Custom Hashtag Test',
        success: false,
        error: error.message
      };
    }
  }

  // Main execution function
  async run() {
    console.log('🧪 Twitter Implementation Test Runner');
    console.log('====================================');
    
    // Parse command line arguments
    const options = this.parseArguments();
    
    // Handle help and list options
    if (options.help) {
      this.displayHelp();
      return;
    }
    
    if (options.list) {
      this.listTests();
      return;
    }
    
    // Check environment
    if (!this.checkEnvironment()) {
      process.exit(1);
    }
    
    this.startTime = Date.now();
    
    try {
      // Handle custom tests first
      // Check for hashtag modes first (autofill takes precedence over keyword-only)
      if (options.hashtag || options.hashtags || options.autofill) {
        // Validate hashtag mode options
        if (options.manual && options.autofill) {
          console.log('❌ Cannot use both --manual and --autofill modes');
          console.log('Choose one mode: --manual (default) or --autofill');
          process.exit(1);
        }
        
        // For autofill mode, validate keyword presence
        if (options.autofill && !options.keyword) {
          console.log('❌ Autofill mode requires --keyword parameter');
          console.log('Example: node run-tests.js --autofill --keyword "artificial intelligence"');
          process.exit(1);
        }
        
        // For manual mode (default), validate hashtag presence
        if (!options.autofill && !options.hashtag && !options.hashtags) {
          console.log('❌ Manual mode requires --hashtag or --hashtags parameter');
          console.log('Example: node run-tests.js --manual --hashtags "#AI,#ML"');
          process.exit(1);
        }
        
        // Prepare hashtags for manual mode
        let hashtagsInput = null;
        if (!options.autofill) {
          if (options.hashtags) {
            hashtagsInput = options.hashtags.split(',').map(h => h.trim());
          } else if (options.hashtag) {
            hashtagsInput = options.hashtag;
          }
        }
        
        // Run the test with appropriate mode
        const result = await this.runCustomHashtagTest(hashtagsInput, options);
        const key = options.autofill ? 'custom-hashtag-autofill' : 'custom-hashtag-manual';
        this.testResults.set(key, result);
        
      } else if (options.keyword) {
        const result = await this.runCustomKeywordTest(options.keyword, options);
        this.testResults.set('custom-keyword', result);
        
      } else if (options.keywords) {
        const keywordList = options.keywords.split(',').map(k => k.trim());
        const result = await this.runCustomKeywordTest(keywordList, options);
        this.testResults.set('custom-keywords', result);
        
      } else if (options.test) {
        // Run single test
        if (!this.availableTests[options.test]) {
          console.log(`❌ Unknown test: ${options.test}`);
          console.log('Use --list to see available tests');
          process.exit(1);
        }
        await this.runSingleTest(options.test, options.summary);
        
      } else if (options.suite) {
        // Run test suite
        if (!this.testSuites[options.suite]) {
          console.log(`❌ Unknown test suite: ${options.suite}`);
          console.log('Available suites:', Object.keys(this.testSuites).join(', '));
          process.exit(1);
        }
        const testKeys = this.testSuites[options.suite];
        await this.runMultipleTests(testKeys, options.delay, options.summary);
        
      } else if (options.all) {
        // Run all tests
        const testKeys = Object.keys(this.availableTests);
        await this.runMultipleTests(testKeys, options.delay, options.summary);
        
      } else {
        // No specific option provided, show help
        console.log('No test specified. Use --help for usage information.');
        this.displayHelp();
        return;
      }
      
      // Generate summary if multiple tests were run
      if (this.testResults.size > 1) {
        this.generateSummaryReport();
      }
      
    } catch (error) {
      console.log(`\n❌ Test runner failed: ${error.message}`);
      process.exit(1);
    }
  }
}

// Execute if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new TwitterTestRunner();
  runner.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { TwitterTestRunner };