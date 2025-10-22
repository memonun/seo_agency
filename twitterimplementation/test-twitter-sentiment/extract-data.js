#!/usr/bin/env node

import fs from 'fs'

/**
 * Extract and format Twitter data from raw Supabase records
 * Converts raw database JSON to clean format for sentiment analysis
 */

function extractTwitterData() {
  try {
    console.log('🔧 Extracting Twitter data from raw Supabase records...')
    
    // Read the raw input file
    const rawData = fs.readFileSync('./input.json', 'utf8')
    const supabaseRecords = JSON.parse(rawData)
    
    if (!Array.isArray(supabaseRecords)) {
      throw new Error('Expected array of Supabase records')
    }
    
    console.log(`📊 Found ${supabaseRecords.length} Supabase record(s)`)
    
    // Extract tweets from each record
    const allTweets = []
    
    for (const record of supabaseRecords) {
      if (!record.raw_response) {
        console.warn('⚠️ Record missing raw_response, skipping')
        continue
      }
      
      try {
        // Parse the escaped JSON string
        const rawResponse = JSON.parse(record.raw_response)
        const tweetsData = rawResponse.data || []
        
        console.log(`📝 Found ${tweetsData.length} tweets in record ${record.id}`)
        
        // Convert each tweet to clean format
        for (const tweetData of tweetsData) {
          const cleanTweet = {
            id: tweetData.id,
            text: tweetData.text,
            author: tweetData.author?.username || 'unknown',
            author_name: tweetData.author?.name || 'Unknown User',
            verified: tweetData.author?.verified || false,
            followers: tweetData.author?.followers || 0,
            metrics: {
              likes: tweetData.metrics?.likes || 0,
              retweets: tweetData.metrics?.retweets || 0,
              replies: tweetData.metrics?.replies || 0,
              views: tweetData.metrics?.views || 0
            },
            hashtags: tweetData.hashtags || [],
            url: tweetData.url || `https://twitter.com/${tweetData.author?.username}/status/${tweetData.id}`,
            created_at: tweetData.created_at,
            replies: tweetData.replies || [] // Empty since this search had no replies
          }
          
          allTweets.push(cleanTweet)
        }
        
      } catch (parseError) {
        console.error(`❌ Failed to parse raw_response for record ${record.id}:`, parseError.message)
        continue
      }
    }
    
    if (allTweets.length === 0) {
      throw new Error('No tweets could be extracted from the data')
    }
    
    // Create clean format for sentiment analysis
    const cleanData = {
      tweets: allTweets,
      metadata: {
        extracted_at: new Date().toISOString(),
        total_tweets: allTweets.length,
        source: 'supabase_extraction',
        keyword: supabaseRecords[0]?.keyword || 'unknown'
      }
    }
    
    // Save to clean input file
    fs.writeFileSync('./input-clean.json', JSON.stringify(cleanData, null, 2))
    
    // Also overwrite the original input.json with clean format
    fs.writeFileSync('./input.json', JSON.stringify(cleanData, null, 2))
    
    console.log('✅ Data extraction completed!')
    console.log(`📊 Extracted ${allTweets.length} tweets`)
    console.log('💾 Saved to: input.json (overwritten) and input-clean.json (backup)')
    
    // Display sample tweet for verification
    if (allTweets.length > 0) {
      console.log('\n📝 Sample tweet:')
      console.log(`   ID: ${allTweets[0].id}`)
      console.log(`   Author: @${allTweets[0].author}`)
      console.log(`   Text: "${allTweets[0].text.substring(0, 100)}${allTweets[0].text.length > 100 ? '...' : ''}"`)
      console.log(`   Replies: ${allTweets[0].replies.length}`)
    }
    
    return cleanData
    
  } catch (error) {
    console.error('❌ Data extraction failed:', error.message)
    process.exit(1)
  }
}

// Run extraction
extractTwitterData()