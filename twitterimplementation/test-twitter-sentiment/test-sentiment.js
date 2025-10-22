#!/usr/bin/env node

import fs from 'fs'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

/**
 * Pure AI Twitter Sentiment Analysis
 * Analyzes tweets and replies using OpenRouter API
 * No basic keyword matching - AI only!
 */

class TwitterSentimentAnalyzer {
  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY
    this.baseUrl = 'https://openrouter.ai/api/v1/chat/completions'
    this.model = 'google/gemini-2.0-flash-001'
    
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY not found in .env file')
    }
  }

  /**
   * Analyze sentiment of a single text using OpenRouter AI
   */
  async analyzeSentiment(text, context = '') {
    const systemMessage = `You are an expert sentiment analysis AI. Analyze the sentiment of social media content with high accuracy and context awareness.

IMPORTANT: Respond with ONLY a valid JSON object in this exact format:
{
  "label": "positive|negative|neutral",
  "score": -1.0 to 1.0,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}

Guidelines:
- "label": positive, negative, or neutral
- "score": -1.0 (most negative) to 1.0 (most positive), 0.0 is neutral
- "confidence": 0.0 (very uncertain) to 1.0 (very certain)
- "reasoning": 1-2 sentences explaining your analysis

Consider:
- Context and subtext
- Sarcasm and irony
- Emojis and slang
- Cultural nuances
- Mixed emotions (lean toward dominant sentiment)

Respond with ONLY the JSON object, no additional text.`

    const userPrompt = `Analyze the sentiment of this text:

"${text}"

${context ? `\nContext: ${context}` : ''}`

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemMessage },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 300,
          temperature: 0.3
        })
      })

      if (!response.ok) {
        throw new Error(`OpenRouter API failed: ${response.status}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('No content received from API')
      }

      return this.parseSentimentResponse(content, text)

    } catch (error) {
      console.error('🔴 Sentiment analysis error:', error.message)
      return {
        label: 'neutral',
        score: 0,
        confidence: 0.1,
        reasoning: `Analysis failed: ${error.message}`,
        error: true
      }
    }
  }

  /**
   * Parse AI response and validate JSON
   */
  parseSentimentResponse(content, originalText) {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const result = JSON.parse(jsonMatch[0])

      // Validate required fields
      if (!result.label || !result.hasOwnProperty('score') || !result.hasOwnProperty('confidence')) {
        throw new Error('Missing required fields')
      }

      // Validate label
      if (!['positive', 'negative', 'neutral'].includes(result.label)) {
        throw new Error(`Invalid label: ${result.label}`)
      }

      // Clamp values to valid ranges
      result.score = Math.max(-1, Math.min(1, result.score))
      result.confidence = Math.max(0, Math.min(1, result.confidence))

      return result

    } catch (error) {
      console.warn('⚠️ JSON parsing failed, using fallback')
      return {
        label: 'neutral',
        score: 0,
        confidence: 0.2,
        reasoning: `Parsing failed: ${error.message}`,
        error: true
      }
    }
  }

  /**
   * Analyze multiple replies and aggregate sentiment
   */
  async analyzeReplies(replies, tweetContext) {
    if (!replies || replies.length === 0) {
      return {
        score: 0,
        confidence: 0,
        distribution: { positive: 0, negative: 0, neutral: 0 },
        summary: 'No replies to analyze'
      }
    }

    console.log(`   📝 Analyzing ${replies.length} replies...`)
    
    // Analyze each reply
    const replyAnalyses = []
    for (let i = 0; i < replies.length; i++) {
      const reply = replies[i]
      console.log(`      ${i + 1}/${replies.length}: "${reply.substring(0, 50)}${reply.length > 50 ? '...' : ''}"`)
      
      const sentiment = await this.analyzeSentiment(reply, `Reply to: "${tweetContext}"`)
      replyAnalyses.push(sentiment)
      
      // Small delay to avoid rate limits
      await this.delay(500)
    }

    // Calculate aggregated metrics
    const validAnalyses = replyAnalyses.filter(a => !a.error)
    
    if (validAnalyses.length === 0) {
      return {
        score: 0,
        confidence: 0,
        distribution: { positive: 0, negative: 0, neutral: 0 },
        summary: 'Unable to analyze replies'
      }
    }

    // Calculate average score and confidence
    const avgScore = validAnalyses.reduce((sum, a) => sum + a.score, 0) / validAnalyses.length
    const avgConfidence = validAnalyses.reduce((sum, a) => sum + a.confidence, 0) / validAnalyses.length

    // Calculate distribution
    const distribution = validAnalyses.reduce((dist, analysis) => {
      dist[analysis.label]++
      return dist
    }, { positive: 0, negative: 0, neutral: 0 })

    // Generate summary
    const summary = this.generateRepliesSummary(distribution, avgScore, validAnalyses)

    return {
      score: avgScore,
      confidence: avgConfidence,
      distribution,
      summary,
      totalAnalyzed: validAnalyses.length,
      errors: replyAnalyses.length - validAnalyses.length
    }
  }

  /**
   * Generate human-readable summary of replies sentiment
   */
  generateRepliesSummary(distribution, avgScore, analyses) {
    const total = distribution.positive + distribution.negative + distribution.neutral
    const dominant = Object.entries(distribution).reduce((a, b) => distribution[a[0]] > distribution[b[0]] ? a : b)[0]
    
    let summary = `${dominant.charAt(0).toUpperCase() + dominant.slice(1)} sentiment dominates (${distribution[dominant]}/${total})`
    
    if (distribution.positive > 0 && distribution.negative > 0) {
      summary += ` - Mixed reactions with both praise and criticism`
    }
    
    // Add key themes from reasoning
    const commonThemes = this.extractCommonThemes(analyses)
    if (commonThemes.length > 0) {
      summary += ` - Key themes: ${commonThemes.join(', ')}`
    }

    return summary
  }

  /**
   * Extract common themes from sentiment reasoning
   */
  extractCommonThemes(analyses) {
    const themes = []
    const reasonings = analyses.map(a => a.reasoning.toLowerCase())
    
    // Look for common keywords in reasoning
    const themeKeywords = {
      'pricing': ['price', 'cost', 'expensive', 'cheap', 'money'],
      'quality': ['quality', 'good', 'bad', 'excellent', 'poor'],
      'support': ['support', 'help', 'service', 'customer'],
      'features': ['feature', 'function', 'work', 'bug'],
      'timing': ['wait', 'time', 'delay', 'quick', 'slow']
    }

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      const mentions = keywords.filter(keyword => 
        reasonings.some(reasoning => reasoning.includes(keyword))
      ).length
      
      if (mentions >= 2) { // If mentioned in 2+ reasonings
        themes.push(theme)
      }
    }

    return themes.slice(0, 3) // Max 3 themes
  }

  /**
   * Detect contradictions between tweet and replies
   */
  detectContradiction(tweetSentiment, repliesSentiment) {
    const tweetScore = tweetSentiment.score
    const repliesScore = repliesSentiment.score
    
    // Strong contradiction: opposite sentiment poles
    if ((tweetScore > 0.3 && repliesScore < -0.3) || (tweetScore < -0.3 && repliesScore > 0.3)) {
      return {
        detected: true,
        severity: 'high',
        description: `Main tweet is ${tweetSentiment.label} but replies are predominantly ${this.getScoreLabel(repliesScore)}`
      }
    }
    
    // Moderate contradiction: neutral vs strong sentiment
    if (Math.abs(tweetScore - repliesScore) > 0.6) {
      return {
        detected: true,
        severity: 'medium',
        description: `Sentiment gap detected - tweet sentiment differs significantly from replies`
      }
    }

    return {
      detected: false,
      severity: 'none',
      description: 'Tweet and replies sentiment align'
    }
  }

  /**
   * Get sentiment label from score
   */
  getScoreLabel(score) {
    if (score > 0.1) return 'positive'
    if (score < -0.1) return 'negative'
    return 'neutral'
  }

  /**
   * Analyze a single tweet with replies
   */
  async analyzeTweet(tweet) {
    console.log(`\n🐦 Analyzing tweet ${tweet.id}:`)
    console.log(`   Text: "${tweet.text}"`)
    console.log(`   Author: @${tweet.author}`)
    console.log(`   Replies: ${tweet.replies?.length || 0}`)

    // Analyze main tweet sentiment
    console.log(`   🤖 Analyzing main tweet...`)
    const tweetSentiment = await this.analyzeSentiment(tweet.text, `Tweet by @${tweet.author}`)
    
    // Analyze replies sentiment
    const repliesSentiment = await this.analyzeReplies(tweet.replies, tweet.text)
    
    // Detect contradictions
    const contradiction = this.detectContradiction(tweetSentiment, repliesSentiment)
    
    // Generate overall summary
    const overallSummary = this.generateOverallSummary(tweetSentiment, repliesSentiment, contradiction)

    return {
      tweet_id: tweet.id,
      tweet_text: tweet.text,
      tweet_author: tweet.author,
      tweet_sentiment: tweetSentiment,
      mentions_sentiment: repliesSentiment,
      contradiction: contradiction,
      overall_summary: overallSummary,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Generate overall summary and insights
   */
  generateOverallSummary(tweetSentiment, repliesSentiment, contradiction) {
    let analysis = `Tweet sentiment: ${tweetSentiment.label} (${tweetSentiment.score.toFixed(2)})`
    
    if (repliesSentiment.totalAnalyzed > 0) {
      analysis += `, Replies sentiment: ${this.getScoreLabel(repliesSentiment.score)} (${repliesSentiment.score.toFixed(2)})`
    }

    let recommendation = 'Monitor engagement trends'
    
    if (contradiction.detected) {
      recommendation = contradiction.severity === 'high' ? 
        'Urgent: Address negative feedback in replies' :
        'Review replies for potential concerns'
    } else if (tweetSentiment.label === 'positive' && repliesSentiment.score > 0.3) {
      recommendation = 'Strong positive reception - amplify this content'
    } else if (tweetSentiment.label === 'negative' && repliesSentiment.score < -0.3) {
      recommendation = 'Negative sentiment confirmed by replies - damage control needed'
    }

    return {
      analysis,
      contradiction_detected: contradiction.detected,
      key_insight: contradiction.description,
      recommendation
    }
  }

  /**
   * Load input data with fallback parsing for different formats
   */
  loadInputData() {
    try {
      const data = fs.readFileSync('./input.json', 'utf8')
      const parsed = JSON.parse(data)
      
      // Handle clean format: {tweets: [...]}
      if (parsed.tweets && Array.isArray(parsed.tweets)) {
        console.log('📄 Clean format detected')
        return parsed
      }
      
      // Handle array of Supabase records: [{raw_response: "..."}]
      if (Array.isArray(parsed)) {
        console.log('🔧 Raw Supabase format detected - extracting...')
        return this.parseSupabaseFormat(parsed)
      }
      
      // Handle single Supabase record: {raw_response: "..."}
      if (parsed.raw_response) {
        console.log('🔧 Single Supabase record detected - extracting...')
        return this.parseSupabaseFormat([parsed])
      }
      
      throw new Error('Unrecognized input format')
      
    } catch (error) {
      throw new Error(`Failed to load input.json: ${error.message}`)
    }
  }

  /**
   * Parse Supabase format and extract tweets
   */
  parseSupabaseFormat(records) {
    const tweets = []
    
    for (const record of records) {
      if (!record.raw_response) continue
      
      try {
        const rawResponse = JSON.parse(record.raw_response)
        const tweetsData = rawResponse.data || []
        
        for (const tweetData of tweetsData) {
          tweets.push({
            id: tweetData.id,
            text: tweetData.text,
            author: tweetData.author?.username || 'unknown',
            replies: tweetData.replies || []
          })
        }
      } catch (parseError) {
        console.warn(`⚠️ Failed to parse record ${record.id}: ${parseError.message}`)
      }
    }
    
    return { tweets }
  }

  /**
   * Save results to output file
   */
  saveResults(results) {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-')
    const filename = `sentiment-results-${timestamp}.json`
    
    fs.writeFileSync(filename, JSON.stringify(results, null, 2))
    console.log(`\n💾 Results saved to: ${filename}`)
    
    return filename
  }

  /**
   * Add delay for rate limiting
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Run complete analysis
   */
  async runAnalysis() {
    try {
      console.log('🚀 Starting Pure AI Twitter Sentiment Analysis')
      console.log('=' .repeat(50))

      // Load input data
      const inputData = this.loadInputData()
      const tweets = inputData.tweets || []
      
      if (tweets.length === 0) {
        throw new Error('No tweets found in input.json')
      }

      console.log(`📊 Found ${tweets.length} tweets to analyze`)

      // Analyze each tweet
      const results = []
      for (let i = 0; i < tweets.length; i++) {
        const tweet = tweets[i]
        console.log(`\n📈 Processing tweet ${i + 1}/${tweets.length}`)
        
        const analysis = await this.analyzeTweet(tweet)
        results.push(analysis)
        
        // Rate limiting delay between tweets
        if (i < tweets.length - 1) {
          console.log(`   ⏳ Waiting 2 seconds...`)
          await this.delay(2000)
        }
      }

      // Save results
      const outputFile = this.saveResults({
        metadata: {
          timestamp: new Date().toISOString(),
          total_tweets: tweets.length,
          model: this.model,
          version: '1.0.0'
        },
        results
      })

      // Display summary
      this.displaySummary(results)

      return results

    } catch (error) {
      console.error('\n❌ Analysis failed:', error.message)
      throw error
    }
  }

  /**
   * Display analysis summary
   */
  displaySummary(results) {
    console.log('\n' + '='.repeat(60))
    console.log('📊 ANALYSIS SUMMARY')
    console.log('='.repeat(60))

    console.log(`\n📈 Total Tweets Analyzed: ${results.length}`)
    
    // Tweet sentiment distribution
    const tweetSentiments = results.map(r => r.tweet_sentiment.label)
    const tweetDist = tweetSentiments.reduce((dist, label) => {
      dist[label] = (dist[label] || 0) + 1
      return dist
    }, {})

    console.log('\n🐦 Tweet Sentiment Distribution:')
    Object.entries(tweetDist).forEach(([label, count]) => {
      console.log(`   ${label.charAt(0).toUpperCase() + label.slice(1)}: ${count}`)
    })

    // Contradictions
    const contradictions = results.filter(r => r.contradiction.detected)
    console.log(`\n⚠️ Contradictions Detected: ${contradictions.length}`)
    
    if (contradictions.length > 0) {
      contradictions.forEach(r => {
        console.log(`   • Tweet ${r.tweet_id}: ${r.contradiction.description}`)
      })
    }

    // Key insights
    console.log('\n💡 KEY INSIGHTS:')
    results.forEach(r => {
      console.log(`   • Tweet ${r.tweet_id}: ${r.overall_summary.key_insight}`)
    })

    console.log('\n✅ Analysis completed successfully!')
  }
}

// Main execution
async function main() {
  try {
    const analyzer = new TwitterSentimentAnalyzer()
    await analyzer.runAnalysis()
    process.exit(0)
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Handle process events
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error)
  process.exit(1)
})

main()