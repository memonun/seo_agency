// Test script for account analysis feature
// Tests all combinations: account only, account+keyword, account+hashtag

const testAccountAnalysis = async () => {
  const API_URL = 'http://localhost:4005/api/twitter-analytics'
  
  const testCases = [
    {
      name: "Account only analysis",
      payload: {
        action: 'account-analysis',
        accountUsername: 'elonmusk',
        keyword: '',
        hashtags: [],
        limit: 10,
        sortOrder: 'recent',
        includeMentions: false,
        global: false
      }
    },
    {
      name: "Account + Keyword",
      payload: {
        action: 'account-analysis',
        accountUsername: '@NASA',
        keyword: 'space',
        hashtags: [],
        limit: 10,
        sortOrder: 'popular',
        includeMentions: false,
        global: false
      }
    },
    {
      name: "Account + Hashtag",
      payload: {
        action: 'account-analysis',
        accountUsername: 'OpenAI',
        keyword: '',
        hashtags: ['#AI', '#MachineLearning'],
        limit: 10,
        sortOrder: 'recent',
        includeMentions: false,
        global: false
      }
    },
    {
      name: "Account + Keyword + Hashtag",
      payload: {
        action: 'account-analysis',
        accountUsername: 'Microsoft',
        keyword: 'cloud',
        hashtags: ['#Azure'],
        limit: 10,
        sortOrder: 'popular',
        includeMentions: true,
        global: false
      }
    },
    {
      name: "Account with language filter",
      payload: {
        action: 'account-analysis',
        accountUsername: 'Google',
        keyword: 'technology',
        hashtags: [],
        language: 'en',
        limit: 10,
        sortOrder: 'recent',
        includeMentions: false,
        global: false
      }
    }
  ]
  
  console.log('🚀 Starting Account Analysis Tests\n')
  console.log('=====================================\n')
  
  for (const test of testCases) {
    console.log(`📋 Test: ${test.name}`)
    console.log(`👤 Account: ${test.payload.accountUsername}`)
    console.log(`🔑 Keyword: ${test.payload.keyword || '(none)'}`)
    console.log(`#️⃣ Hashtags: ${test.payload.hashtags.length > 0 ? test.payload.hashtags.join(', ') : '(none)'}`)
    console.log('---')
    
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(test.payload)
      })
      
      const data = await response.json()
      
      if (response.ok) {
        console.log('✅ Success!')
        console.log(`📊 Tweets analyzed: ${data.total || data.analytics?.total_tweets || 0}`)
        
        if (data.analytics?.account_metrics) {
          const metrics = data.analytics.account_metrics
          console.log(`📈 Account Metrics:`)
          console.log(`   - Posting frequency: ${metrics.posting_frequency} tweets/day`)
          console.log(`   - Engagement rate: ${metrics.avg_engagement_rate}%`)
          console.log(`   - Top posting hours: ${metrics.top_posting_hours?.join(', ') || 'N/A'}`)
        }
        
        if (data.analytics?.sentiment_distribution) {
          const sentiment = data.analytics.sentiment_distribution
          console.log(`😊 Sentiment: Positive: ${sentiment.positive}, Negative: ${sentiment.negative}, Neutral: ${sentiment.neutral}`)
        }
      } else {
        console.log(`❌ Failed: ${data.error || 'Unknown error'}`)
        console.log(`   Message: ${data.message}`)
      }
    } catch (error) {
      console.log(`❌ Network error: ${error.message}`)
    }
    
    console.log('\n=====================================\n')
    
    // Wait between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  
  console.log('✨ All tests completed!')
}

// Run tests if server is in mock mode
console.log('⚠️  Make sure the server is running with TWITTER_MOCK_MODE=true')
console.log('    Run: TWITTER_MOCK_MODE=true npm run dev\n')

testAccountAnalysis().catch(console.error)