// Local Express Server for Development
// Replicates the /api/youtube-search.js serverless function

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import { TwitterApi } from '@virtuals-protocol/game-twitter-node'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import axios from 'axios'
import { scrapeInstagram, enrichInstagramWithComments } from '../src/utils/socialListening/scrapers/instagram.js'

dotenv.config()

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Initialize Supabase client for server-side database operations
const supabaseUrl = process.env.VITE_SUPABASE_URL
// Use service role key for server-side operations to bypass RLS
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
console.log('🔧 Supabase URL:', supabaseUrl ? 'Set' : 'Not Set')
console.log('🔧 Supabase Service Key:', supabaseServiceKey ? 'Set' : 'Not Set')

// Initialize Supabase with service role key to bypass RLS
let supabase = null
if (supabaseUrl && supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
  console.log('✅ Supabase client initialized with service role')
} else {
  console.log('⚠️ Warning: Supabase client not initialized - missing environment variables')
}

const app = express()
const PORT = 3001

// Rate limiting system from ERROR_DOCUMENTATION.md
class RateLimiter {
  constructor() {
    this.requests = [];
    this.limit = 100; // Increased from 40 to 100 for upgraded SDK tier
    this.window = 5 * 60 * 1000; // 5 minutes in milliseconds
  }
  
  canMakeRequest() {
    const now = Date.now();
    // Remove requests outside the time window
    this.requests = this.requests.filter(time => now - time < this.window);
    
    if (this.requests.length >= this.limit) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }
  
  getTimeUntilReset() {
    if (this.requests.length === 0) return 0;
    const oldest = Math.min(...this.requests);
    return Math.max(0, this.window - (Date.now() - oldest));
  }
  
  getStatus() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.window);
    return {
      remaining: this.limit - this.requests.length,
      resetIn: this.getTimeUntilReset(),
      totalLimit: this.limit
    };
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter()

// Note: Database operations moved to client-side like SEO module

// Middleware
app.use(cors())
app.use(express.json())

// Enhanced error logging middleware
app.use((req, res, next) => {
  console.log(`\n🔄 ${new Date().toISOString()} - ${req.method} ${req.url}`)
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2))
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Body:', JSON.stringify(req.body, null, 2))
  }
  next()
})

// Global error handler
app.use((error, req, res, next) => {
  console.error('\n❌ GLOBAL ERROR HANDLER:')
  console.error('🔥 Error:', error.message)
  console.error('🔥 Stack:', error.stack)
  console.error('🔥 Request URL:', req.url)
  console.error('🔥 Request Method:', req.method)
  console.error('🔥 Request Body:', JSON.stringify(req.body, null, 2))
  
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  })
})

// YouTube Search + Summarization Endpoint (Enhanced with Comments and Database Storage)
app.post('/api/youtube-search', async (req, res) => {
  const { keyword, user_id, search_id, email } = req.body

  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' })
  }

  // Generate search_id if not provided
  const effectiveSearchId = search_id || crypto.randomUUID()

  try {
    console.log(`\n🔍 Processing YouTube search for: "${keyword}"`)

    // Step 1: Fetch 10 YouTube videos from RapidAPI YouTube138
    const youtubeVideos = await fetchYouTubeVideos(keyword)

    if (youtubeVideos.length === 0) {
      return res.status(404).json({ error: 'No videos found' })
    }

    console.log(`✅ Found ${youtubeVideos.length} videos`)

    // Step 2: Store raw YouTube data for complete reproducibility
    const rawYouTubeData = [...youtubeVideos] // Deep copy of original video data
    const rawCommentsData = {} // Will collect all raw comments by video_id
    
    // Step 3: Process videos sequentially with rate limiting to avoid 429 errors
    const videosWithSummaries = []
    
    for (let i = 0; i < youtubeVideos.length; i++) {
      const video = youtubeVideos[i]
      
      try {
        console.log(`   [${i + 1}/${youtubeVideos.length}] Processing: ${video.title.substring(0, 50)}...`)
        
        // Fetch both transcript and comments first
        let transcript = null
        let comments = null
        
        try {
          console.log(`   [${i + 1}/${youtubeVideos.length}] Fetching transcript...`)
          transcript = await fetchTranscriptWithRetry(video.video_id, 3)
          console.log(`   ✓ [${i + 1}/${youtubeVideos.length}] Transcript fetched`)
        } catch (transcriptError) {
          console.warn(`   ⚠ [${i + 1}/${youtubeVideos.length}] Transcript error: ${transcriptError.message}`)
        }

        try {
          console.log(`   [${i + 1}/${youtubeVideos.length}] Fetching comments...`)
          comments = await fetchVideoComments(video.video_id)
          console.log(`   ✓ [${i + 1}/${youtubeVideos.length}] Comments fetched: ${comments.items.length} comments`)
          
          // Store raw comments data for database
          rawCommentsData[video.video_id] = {
            totalCount: comments.totalCount,
            items: comments.items,
            fetchedAt: new Date().toISOString()
          }
        } catch (commentError) {
          console.warn(`   ⚠ [${i + 1}/${youtubeVideos.length}] Comments error: ${commentError.message}`)
          comments = {
            totalCount: 0,
            items: [],
            error: 'Comments not available for this video'
          }
          
          // Store error in raw data
          rawCommentsData[video.video_id] = {
            totalCount: 0,
            items: [],
            error: commentError.message,
            fetchedAt: new Date().toISOString()
          }
        }

        // Only generate AI summary if we have meaningful data
        let summary = '⚠️ Unable to analyze this video.'
        if (transcript || (comments && comments.items.length > 0)) {
          try {
            console.log(`   [${i + 1}/${youtubeVideos.length}] Generating AI summary...`)
            
            // Process timestamps if we have transcript
            const processedTranscript = transcript ? processTimestamps(transcript) : null
            
            // Generate enhanced summary with both transcript and comments
            summary = await summarizeWithAI(processedTranscript, comments, video.title)
            console.log(`   ✓ [${i + 1}/${youtubeVideos.length}] AI summary complete`)
          } catch (summaryError) {
            console.error(`   ✗ [${i + 1}/${youtubeVideos.length}] Summary error: ${summaryError.message}`)
            summary = '⚠️ Unable to generate summary for this video.'
          }
        }

        videosWithSummaries.push({
          ...video,
          summary: summary,
          comments: comments || {
            totalCount: 0,
            items: [],
            error: 'Comments not available for this video'
          },
          position: i + 1
        })

        console.log(`   ✓ [${i + 1}/${youtubeVideos.length}] Processing complete`)
        
        // Add delay between requests to prevent rate limiting (only if not the last video)
        if (i < youtubeVideos.length - 1) {
          await sleep(1200) // 1.2 second delay between requests
        }
        
      } catch (error) {
        console.error(`   ✗ [${i + 1}/${youtubeVideos.length}] Error: ${error.message}`)
        videosWithSummaries.push({
          ...video,
          summary: '⚠️ Unable to process this video.',
          comments: {
            totalCount: 0,
            items: [],
            error: 'Comments not available for this video'
          },
          position: i + 1
        })
      }
    }

    // Generate overall summary after all videos are processed
    let overallSummary = null
    try {
      console.log(`📊 Generating overall summary for "${keyword}"...`)
      overallSummary = await generateOverallSummary(videosWithSummaries, keyword)
      console.log(`✅ Overall summary complete`)
    } catch (overallError) {
      console.error(`❌ Overall summary error:`, overallError.message)
      overallSummary = 'Unable to generate overall analysis at this time.'
    }

    // Save complete analysis to database for reproducibility
    let databaseId = null
    try {
      databaseId = await saveYouTubeAnalytics(
        user_id, 
        effectiveSearchId, 
        keyword, 
        email, 
        rawYouTubeData, 
        rawCommentsData, 
        videosWithSummaries, 
        overallSummary
      )
      if (databaseId) {
        console.log(`💾 Analysis saved to database with ID: ${databaseId}`)
      }
    } catch (saveError) {
      console.error(`❌ Database save error:`, saveError.message)
      // Continue without failing the response
    }

    console.log(`\n✨ All processing complete!\n`)

    // Return combined response
    return res.status(200).json({
      status: 'success',
      keyword,
      overallSummary,
      videos: videosWithSummaries,
      databaseId // Include for reference
    })
  } catch (error) {
    console.error('❌ Error in youtube-search:', error)
    return res.status(500).json({
      error: 'Failed to process request',
      message: error.message
    })
  }
})

// Helper Functions

async function fetchYouTubeVideos(keyword) {
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY
  const RAPIDAPI_HOST = 'youtube138.p.rapidapi.com'

  const url = `https://${RAPIDAPI_HOST}/search/?q=${encodeURIComponent(keyword)}&hl=en&gl=US`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  })

  if (!response.ok) {
    throw new Error(`YouTube API failed: ${response.status}`)
  }

  const data = await response.json()
  const videos = data?.contents || []

  return videos
    .filter(item => item.video)
    .slice(0, 10)
    .map(item => {
      const video = item.video
      const thumbnail = video.thumbnails?.[0]?.url ||
                       `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`

      const likes = video.stats?.likes || null
      const subscribers = video.author?.stats?.subscribers || video.author?.stats?.subscribersText || null
      const isVerified = video.author?.badges?.some(badge =>
        badge?.type === 'VERIFIED_CHANNEL' || badge?.text === 'Verified'
      ) || false
      const badges = video.badges || []
      const isLive = video.isLiveNow || video.isLive || badges.some(b => b?.type === 'LIVE') || false

      return {
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
        title: video.title || 'Untitled Video',
        description: video.descriptionSnippet || video.description || '',
        video_id: video.videoId,
        thumbnail: thumbnail,
        channel: video.channelTitle || video.author?.title || 'Unknown Channel',
        views: video.viewCountText || video.stats?.views || 'N/A',
        publishedTime: video.publishedTimeText || 'N/A',
        duration: video.lengthText || 'N/A',
        channelThumbnail: video.channelThumbnail?.thumbnails?.[0]?.url || '',
        likes: likes,
        subscribers: subscribers,
        isVerified: isVerified,
        badges: badges,
        isLive: isLive
      }
    })
}

async function fetchTranscript(videoId) {
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY

  const url = `https://youtube-transcript3.p.rapidapi.com/api/transcript?videoId=${videoId}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Host': 'youtube-transcript3.p.rapidapi.com',
      'X-RapidAPI-Key': RAPIDAPI_KEY
    }
  })

  if (!response.ok) {
    throw new Error(`Transcript API failed: ${response.status}`)
  }

  const data = await response.json()

  // Check if transcript is valid
  if (!data.transcript || !Array.isArray(data.transcript) || data.transcript.length === 0) {
    throw new Error('No valid transcript found')
  }

  return data.transcript
}

async function fetchVideoComments(videoId) {
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY

  const url = `https://youtube-v31.p.rapidapi.com/commentThreads?part=snippet&videoId=${videoId}&maxResults=20&order=relevance`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Host': 'youtube-v31.p.rapidapi.com',
      'X-RapidAPI-Key': RAPIDAPI_KEY
    }
  })

  if (!response.ok) {
    throw new Error(`Comments API failed: ${response.status}`)
  }

  const data = await response.json()

  // Check if comments are valid
  if (!data.items || !Array.isArray(data.items)) {
    throw new Error('No valid comments found')
  }

  return {
    totalCount: data.pageInfo?.totalResults || data.items.length,
    items: data.items.map(item => {
      const snippet = item.snippet?.topLevelComment?.snippet
      return {
        id: item.id,
        authorDisplayName: snippet?.authorDisplayName || 'Unknown',
        authorProfileImageUrl: snippet?.authorProfileImageUrl || '',
        textDisplay: snippet?.textDisplay || '',
        likeCount: snippet?.likeCount || 0,
        publishedAt: snippet?.publishedAt || '',
        updatedAt: snippet?.updatedAt || snippet?.publishedAt || '',
        isChannelOwner: snippet?.authorChannelId === item.snippet?.channelId || false,
        replies: item.snippet?.totalReplyCount || 0
      }
    })
  }
}

// Helper function to add delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Retry wrapper for fetchTranscript to handle rate limiting
async function fetchTranscriptWithRetry(videoId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchTranscript(videoId)
    } catch (error) {
      // If it's a 429 (rate limit) and we have retries left, wait and try again
      if (error.message.includes('429') && attempt < maxRetries) {
        const waitTime = attempt * 2000 // Progressive backoff: 2s, 4s, 6s
        console.log(`   ⏳ Rate limited, waiting ${waitTime/1000}s before retry ${attempt}/${maxRetries}...`)
        await sleep(waitTime)
        continue
      }
      
      // If it's not rate limiting or we're out of retries, throw the error
      throw error
    }
  }
}

function processTimestamps(transcript) {
  // Replicate n8n Code node logic
  return transcript.map(entry => {
    const offsetInSeconds = entry.offset

    // Calculate hours, minutes and seconds
    const hours = Math.floor(offsetInSeconds / 3600)
    const minutes = Math.floor((offsetInSeconds % 3600) / 60)
    const seconds = Math.floor(offsetInSeconds % 60)

    // Pad minutes and seconds with leading zero if < 10
    const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`
    const formattedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`

    // Build final timestamp string
    const timestamp = hours > 0
      ? `${hours}:${formattedMinutes}:${formattedSeconds}` // HH:MM:SS
      : `${minutes}:${formattedSeconds}`                    // MM:SS

    return {
      ...entry,
      timestamp
    }
  })
}

async function summarizeWithAI(transcript, comments, videoTitle) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured')
  }

  // Prepare data for AI analysis
  const hasTranscript = transcript && Array.isArray(transcript) && transcript.length > 0
  const hasComments = comments && comments.items && comments.items.length > 0

  if (!hasTranscript && !hasComments) {
    return '⚠️ No content available for analysis.'
  }

  let contentData = ''
  
  if (hasTranscript) {
    contentData += `TRANSCRIPT:\n${JSON.stringify(transcript)}\n\n`
  }
  
  if (hasComments) {
    // Include top comments for sentiment and engagement analysis
    const topComments = comments.items.slice(0, 10).map(comment => ({
      author: comment.authorDisplayName,
      text: comment.textDisplay,
      likes: comment.likeCount,
      replies: comment.replies
    }))
    contentData += `TOP COMMENTS (${comments.totalCount} total):\n${JSON.stringify(topComments)}`
  }

  // Enhanced system message for transcript + comments analysis
  const systemMessage = `You are a professional video content and community engagement analyzer. Given YouTube video data (transcript and/or comments), produce a comprehensive summary that captures:

1. Video content analysis
2. Audience sentiment and engagement
3. Key themes and trends

Format your response as:

Summary: Write a detailed summary combining video content and audience reaction in 3–5 paragraphs. Include insights about community engagement and sentiment.

Key Takeaways: 
* First key point with timestamp if available (MM:SS)
* Second key point with timestamp if available (MM:SS)
* Third key point with timestamp if available (MM:SS)
* Audience sentiment insights
* Notable engagement patterns

IMPORTANT: Each key takeaway MUST start with "* " to create proper markdown bullet points.

Guidelines:
- Analyze both video content AND community response
- Note positive/negative sentiment from comments
- Highlight popular opinions or recurring themes in comments
- Include engagement metrics when relevant (likes, replies)
- Keep tone neutral and informative
- THE WHOLE OUTPUT LENGTH SHOULD BE MAXIMUM 4000 CHARACTERS.

If only transcript available: Focus on video content analysis.
If only comments available: Focus on community sentiment and engagement around the topic.`

  // User prompt
  const userPrompt = `Analyze this YouTube video data for "${videoTitle}":

${contentData}

Provide a comprehensive summary that includes both content analysis and community engagement insights.`

  // Call OpenRouter API
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000
    })
  })

  if (!response.ok) {
    throw new Error(`OpenRouter API failed: ${response.status}`)
  }

  const data = await response.json()
  const summary = data.choices?.[0]?.message?.content || 'No summary available'

  return summary
}

async function saveYouTubeAnalytics(userId, searchId, keyword, email, rawYouTubeData, rawCommentsData, videosWithSummaries, overallSummary) {
  try {
    if (!supabase) {
      console.log('⏭️ Skipping database save - Supabase not configured')
      return null
    }
    
    console.log('💾 Saving YouTube analytics to database...')

    // Prepare analysis data in optimal JSONB structure
    const analysisData = {
      overallSummary,
      metadata: {
        totalVideos: rawYouTubeData.length,
        successfulAnalysis: videosWithSummaries.filter(v => !v.summary.startsWith('⚠️')).length,
        processingTimestamp: new Date().toISOString(),
        apiVersion: '1.0',
        aiModel: 'google/gemini-2.0-flash-001',
        apisUsed: ['youtube138', 'youtube-v31', 'youtube-transcript3']
      },
      rawData: {
        searchQuery: keyword,
        searchTimestamp: new Date().toISOString(),
        youtubeApiResponse: {
          keyword,
          totalResults: rawYouTubeData.length,
          videos: rawYouTubeData
        },
        commentsApiResponse: {
          videoComments: rawCommentsData
        }
      },
      processedData: {
        videos: videosWithSummaries.map(video => ({
          video_id: video.video_id,
          url: video.url,
          title: video.title,
          description: video.description,
          metadata: {
            channel: video.channel,
            views: video.views,
            likes: video.likes,
            duration: video.duration,
            position: video.position,
            isVerified: video.isVerified,
            publishedTime: video.publishedTime,
            subscribers: video.subscribers,
            thumbnail: video.thumbnail,
            channelThumbnail: video.channelThumbnail
          },
          ai_analysis: {
            summary: video.summary,
            processingSuccess: !video.summary.startsWith('⚠️'),
            modelUsed: 'google/gemini-2.0-flash-001'
          },
          comments_analysis: {
            total_comments: video.comments?.totalCount || 0,
            comments_available: !video.comments?.error,
            top_comments: video.comments?.items || [],
            error_message: video.comments?.error || null
          }
        }))
      }
    }

    // Insert into database
    const { data, error } = await supabase
      .from('youtube_analytics_sessions')
      .insert([
        {
          user_id: userId,
          search_id: searchId,
          keyword,
          analysis_data: analysisData
        }
      ])
      .select('id')

    if (error) {
      console.error('❌ Database save error:', error)
      return null
    }

    console.log('✅ YouTube analytics saved to database:', data[0]?.id)
    return data[0]?.id

  } catch (error) {
    console.error('❌ Database save exception:', error.message)
    return null
  }
}

async function generateOverallSummary(videosWithSummaries, keyword) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured')
  }

  // Prepare data for overall analysis
  const videoSummaries = videosWithSummaries
    .filter(video => video.summary && !video.summary.startsWith('⚠️'))
    .map(video => ({
      title: video.title,
      summary: video.summary,
      views: video.views,
      likes: video.likes,
      commentCount: video.comments?.totalCount || 0,
      topComments: video.comments?.items?.slice(0, 3)?.map(c => c.textDisplay) || []
    }))

  if (videoSummaries.length === 0) {
    return `No videos could be analyzed for "${keyword}".`
  }

  // Collect all comments for sentiment analysis
  const allComments = videosWithSummaries
    .flatMap(video => video.comments?.items || [])
    .slice(0, 50) // Limit to top 50 comments across all videos
    .map(comment => ({
      text: comment.textDisplay,
      likes: comment.likeCount,
      author: comment.authorDisplayName
    }))

  const analysisData = {
    keyword,
    totalVideos: videosWithSummaries.length,
    successfulAnalysis: videoSummaries.length,
    videoSummaries,
    commentsSample: allComments,
    totalComments: videosWithSummaries.reduce((sum, video) => sum + (video.comments?.totalCount || 0), 0)
  }

  const systemMessage = `You are a professional content trend analyst. Given analysis data from multiple YouTube videos and their comments for a specific search keyword, provide a comprehensive overview that identifies:

1. Common themes and trends across videos
2. Overall sentiment and engagement patterns
3. Key insights about the topic/keyword
4. Notable patterns in community response

Format your response as a natural, engaging summary (not bullet points) that captures the landscape around this keyword. Think of it as briefing someone about "what's happening" with this topic on YouTube.

Example style: "For react learning: There's a huge hype across AI creators mentioning AI tools for implementing React and fast learning. The videos generally cite tools like ChatGPT and Claude for code assistance, and people are generally thanking creators with positive engagement around productivity improvements."

Guidelines:
- Write in a conversational, insightful tone
- Synthesize patterns across multiple videos, not individual video details
- Include sentiment observations from comments
- Mention engagement trends if notable
- Focus on meta-insights about the topic landscape
- Maximum 800 characters for conciseness`

  const userPrompt = `Analyze the YouTube landscape for "${keyword}" based on this data:

${JSON.stringify(analysisData, null, 2)}

Provide a concise, insightful overview of what's trending and how the community is responding around this topic.`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 400
    })
  })

  if (!response.ok) {
    throw new Error(`OpenRouter API failed: ${response.status}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content || 'Unable to generate overall summary.'
}

// Twitter Analytics Endpoint (Full Feature Parity with Production)
app.post('/api/twitter-analytics', async (req, res) => {
  try {
    console.log('\n🐦 === TWITTER ANALYTICS START ===')
    console.log('🔍 Raw request body:', JSON.stringify(req.body, null, 2))
    
    // Parameter mapping for compatibility with client
    const action = req.body.action || req.body.type; // Map 'type' to 'action'
    const keyword = req.body.query || req.body.keyword || ''; // Support both 'query' and 'keyword'
    
    const { 
      hashtags = [], 
      accountUsername = '',
      language, 
      sortOrder = 'recent', 
      includeMentions = false, 
      global = false,
      limit = 50 
    } = req.body
    
    console.log(`🐦 Parsed parameters:`, { 
      action, keyword, hashtags, accountUsername, language, sortOrder, includeMentions, global, limit 
    })
    
    // Validate required parameters
    if (!action) {
      console.error('❌ Missing action parameter')
      return res.status(400).json({
        error: 'Missing action parameter',
        message: 'action is required (search, hashtag, combined-search, separated-search, account-analysis, discover-hashtags, sentiment)'
      })
    }
    
    console.log(`🎯 Processing action: ${action}`)
    
    // Check if we should use mock mode or real API
    const mockMode = process.env.TWITTER_MOCK_MODE === 'true'
    
    // For real API mode, check rate limiting
    if (!mockMode) {
      if (!rateLimiter.canMakeRequest()) {
        const status = rateLimiter.getStatus();
        console.log(`⚠️ Rate limit exceeded. Reset in: ${Math.ceil(status.resetIn / 1000)}s`);
        return res.status(429).json({
          error: 'Rate limit exceeded',
          message: 'Too many requests. GAME SDK allows 40 requests per 5 minutes.',
          retryAfter: Math.ceil(status.resetIn / 1000),
          rateLimitStatus: status
        });
      }
      
      const status = rateLimiter.getStatus();
      console.log(`🔄 Rate limit status: ${status.remaining}/${status.totalLimit} remaining`);
    }
    
    if (mockMode) {
      return await handleMockTwitterRequest(action, {
        keyword, hashtags, accountUsername, language, sortOrder, includeMentions, global, limit
      }, req, res)
    }
    
    // Real API mode - use same logic as production  
    return await handleRealTwitterRequest(action, {
      keyword, hashtags, accountUsername, language, sortOrder, includeMentions, global, limit
    }, req, res)
    
  } catch (error) {
    console.error('\n❌ === TWITTER ANALYTICS ERROR ===')
    console.error('🔥 Error message:', error.message)
    console.error('🔥 Error stack:', error.stack)
    console.error('🔥 Error code:', error.code)
    console.error('🔥 Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    console.error('🔥 Request body that caused error:', JSON.stringify(req.body, null, 2))
    console.error('=== END TWITTER ERROR ===\n')
    
    return res.status(500).json({
      error: 'Twitter analytics failed',
      message: error.message,
      code: error.code || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString()
    })
  }
})

// Mock mode handler
async function handleMockTwitterRequest(action, params, req, res) {
  const { keyword, hashtags, accountUsername, language, sortOrder, includeMentions, global, limit } = params
  const userId = req.body.user_id || 'anonymous'
  
  let mockData
  let searchQuery = keyword || hashtags?.join(', ') || 'unknown'
  
  switch (action) {
    case 'search':
      if (!keyword) {
        return res.status(400).json({
          error: 'Missing query',
          message: 'Query is required for keyword search'
        })
      }
      mockData = generateMockTweets(keyword, limit, { language, sortOrder, includeMentions, global })
      break
      
    case 'hashtag':
      if (!hashtags || !Array.isArray(hashtags)) {
        return res.status(400).json({
          error: 'Invalid hashtags',
          message: 'Hashtags array is required for hashtag action'
        })
      }
      mockData = hashtags.flatMap(hashtag => 
        generateMockTweets(hashtag, Math.floor(limit / hashtags.length), { language, sortOrder, includeMentions, global })
      )
      break
      
    case 'combined-search':
      const hasKeyword = keyword.trim().length > 0
      const hasHashtags = hashtags.length > 0
      
      if (!hasKeyword && !hasHashtags) {
        return res.status(400).json({
          error: 'Missing search criteria',
          message: 'Either keyword or hashtags is required for combined search'
        })
      }
      
      let combinedData = []
      if (hasKeyword) {
        combinedData.push(...generateMockTweets(keyword, hasHashtags ? Math.ceil(limit / 2) : limit, { language, sortOrder, includeMentions, global }))
      }
      if (hasHashtags) {
        const hashtagLimit = hasKeyword ? Math.ceil(limit / 2) : limit
        combinedData.push(...hashtags.flatMap(hashtag => 
          generateMockTweets(hashtag, Math.floor(hashtagLimit / hashtags.length), { language, sortOrder, includeMentions, global })
        ))
      }
      
      // Remove duplicates and limit results
      mockData = combinedData
        .filter((tweet, index, self) => self.findIndex(t => t.id === tweet.id) === index)
        .slice(0, limit)
      break

    case 'separated-search':
      // For separated search, generate mock data for each search type
      const searchKeyword = keyword?.trim()
      const searchHashtags = hashtags || []
      const searchAccount = accountUsername?.trim()
      
      const mockResults = {
        account: searchAccount ? {
          searchType: 'account',
          username: `@${searchAccount.replace(/^@/, '')}`,
          tweets: generateMockTweets(`@${searchAccount.replace(/^@/, '')}`, Math.min(limit, 20), { language, sortOrder, includeMentions, global }),
          count: Math.min(limit, 20),
          analytics: { totalTweets: Math.min(limit, 20), totalEngagement: 1500, avgEngagement: 75, followerCount: 5000, postingFrequency: 2.1 },
          parametersUsed: { includeMentions, limit, sortOrder }
        } : null,
        keyword: searchKeyword ? {
          searchType: 'keyword',
          query: searchKeyword,
          tweets: generateMockTweets(searchKeyword, Math.min(limit, 30), { language, sortOrder, includeMentions, global }),
          count: Math.min(limit, 30),
          analytics: { totalTweets: Math.min(limit, 30), totalEngagement: 2800, avgEngagement: 93, totalReach: 150000, avgSentiment: 0.65 },
          parametersUsed: { language, sortOrder, includeMentions, global, limit }
        } : null,
        hashtag: searchHashtags.length > 0 ? {
          searchType: 'hashtag',
          tags: searchHashtags,
          tweets: generateMockTweets(searchHashtags.join(' '), Math.min(limit, 25), { language, sortOrder, includeMentions, global }),
          count: Math.min(limit, 25),
          analytics: { totalTweets: Math.min(limit, 25), totalEngagement: 1800, avgEngagement: 72, trending: true, viralPotential: 0.15, peakHour: 14 },
          parametersUsed: { language, sortOrder, includeMentions, global, limit }
        } : null
      }
      
      const totalFetched = (mockResults.account?.count || 0) + (mockResults.keyword?.count || 0) + (mockResults.hashtag?.count || 0)
      
      return res.status(200).json({
        success: true,
        results: mockResults,
        globalAnalytics: {
          totalTweetsFetched: totalFetched,
          uniqueTweets: Math.floor(totalFetched * 0.85), // Some overlap
          duplicateCount: Math.floor(totalFetched * 0.15),
          overlapPercentage: 15,
          searchTypesUsed: [mockResults.account ? 'account' : null, mockResults.keyword ? 'keyword' : null, mockResults.hashtag ? 'hashtag' : null].filter(Boolean),
          overallSentiment: 0.6
        },
        searchParams: { keyword: searchKeyword, hashtags: searchHashtags, accountUsername: searchAccount, language, sortOrder, includeMentions, limit, global },
        timestamp: new Date().toISOString(),
        mock: true
      })
      
      break
      
    case 'discover-hashtags':
      if (!keyword) {
        return res.status(400).json({
          error: 'Missing keyword',
          message: 'Keyword is required for hashtag discovery'
        })
      }
      
      const discoveredHashtags = generateMockHashtagDiscovery(keyword)
      const hashtagResponse = {
        success: true,
        mock: true,
        keyword,
        hashtags: discoveredHashtags,
        timestamp: new Date().toISOString()
      }
      
      // Database saving handled client-side
      
      return res.status(200).json(hashtagResponse)
      
    case 'account-analysis':
      if (!accountUsername) {
        return res.status(400).json({
          error: 'Missing account username',
          message: 'Account username is required for account analysis'
        })
      }
      
      const accountQuery = `@${accountUsername.replace('@', '')} ${keyword} ${hashtags.join(' ')}`.trim()
      mockData = generateMockTweets(accountQuery, limit, { language, sortOrder, includeMentions, global })
      
      // Add mock account-specific metrics (will be added to analytics later)
      searchQuery = accountQuery
      break
      
    case 'sentiment':
      return res.status(501).json({
        error: 'Not implemented',
        message: 'Sentiment analysis will be implemented in future version'
      })
      
    default:
      return res.status(400).json({
        error: 'Invalid action',
        message: 'Supported actions: search, hashtag, combined-search, separated-search, account-analysis, discover-hashtags, sentiment'
      })
  }
  
  // Calculate mock analytics
  const analytics = generateMockAnalytics(mockData, searchQuery, includeMentions)
  
  // Add account-specific metrics if this is account analysis
  if (action === 'account-analysis') {
    analytics.account_metrics = {
      account: `@${accountUsername.replace('@', '')}`,
      total_analyzed: mockData.length,
      posting_frequency: (Math.random() * 5 + 1).toFixed(1), // 1-6 tweets per day
      avg_engagement_rate: (Math.random() * 0.1).toFixed(3), // 0-10% engagement
      top_posting_hours: [9, 12, 17, 20], // Mock peak hours
      most_used_hashtags: ['#tech', '#innovation', '#ai', '#startup', '#business'].slice(0, 3)
    }
  }
  
  console.log(`✅ Generated ${mockData.length} mock tweets with analytics`)
  
  const mockResponse = {
    success: true,
    mock: true,
    data: mockData,
    analytics,
    query: searchQuery,
    timestamp: new Date().toISOString()
  }
  
  // Database saving handled client-side
  
  return res.status(200).json(mockResponse)
}

// Real API handler (production logic)
async function handleRealTwitterRequest(action, params, req, res) {
  try {
    console.log(`🔥 DEBUG: handleRealTwitterRequest called with action: "${action}"`)
    console.log(`🔥 DEBUG: params:`, params)
    
    // Initialize Twitter client with GAME SDK
    console.log(`🔥 DEBUG: Initializing Twitter client...`)
    const twitterClient = getTwitterClient()
    console.log(`🔥 DEBUG: Twitter client initialized successfully`)
    
    // Route to appropriate handler based on action
    switch (action) {
      case 'search':
        return await handleKeywordSearch(twitterClient, params, req, res)
      case 'hashtag':
        return await handleHashtagAnalysis(twitterClient, params, req, res)
      case 'combined-search':
        return await handleCombinedSearch(twitterClient, params, req, res)
      case 'separated-search':
        return await handleSeparatedSearch(twitterClient, params, req, res)
      case 'account-analysis':
        return await handleAccountAnalysis(twitterClient, params, req, res)
      case 'discover-hashtags':
        return await handleHashtagDiscovery(twitterClient, params, req, res)
      case 'sentiment':
        return await handleSentimentAnalysis(twitterClient, params, req, res)
      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Supported actions: search, hashtag, combined-search, separated-search, account-analysis, discover-hashtags, sentiment'
        })
    }
  } catch (error) {
    console.error('❌ Real Twitter API Error:', error)
    
    // Handle rate limit errors specifically
    if (error.code === 429 || error.message.includes('429') || error.message.includes('Too Many Requests')) {
      // Extract retry-after from headers if available
      const retryAfter = error.headers?.['retry-after'] || 60;
      
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Twitter API rate limit exceeded. Please wait ${retryAfter} seconds.`,
        retryAfter: parseInt(retryAfter),
        code: 429
      })
    }
    
    return res.status(500).json({
      error: 'Twitter API error',
      message: error.message
    })
  }
}

// Initialize GAME SDK Twitter client
function getTwitterClient() {
  console.log('\n🔑 === TWITTER CLIENT INITIALIZATION ===')
  
  const accessToken = process.env.GAME_TWITTER_ACCESS_TOKEN
  
  console.log(`🔍 GAME_TWITTER_ACCESS_TOKEN exists:`, !!accessToken)
  console.log(`🔍 Token length:`, accessToken?.length || 0)
  console.log(`🔍 Token starts with apx-:`, accessToken?.startsWith('apx-'))
  console.log(`🔍 Token preview:`, accessToken ? `${accessToken.substring(0, 10)}...` : 'NOT_SET')
  
  if (!accessToken) {
    const error = new Error('GAME_TWITTER_ACCESS_TOKEN not found in environment variables')
    console.error('❌ Missing Twitter token:', error.message)
    throw error
  }
  
  if (!accessToken.startsWith('apx-')) {
    const error = new Error('Invalid token format. GAME tokens must start with "apx-"')
    console.error('❌ Invalid token format:', error.message)
    throw error
  }
  
  try {
    console.log('🔧 Creating TwitterApi client...')
    
    // CRITICAL: Use gameTwitterAccessToken parameter (from ERROR_DOCUMENTATION.md)
    const client = new TwitterApi({
      gameTwitterAccessToken: accessToken
    })
    
    console.log('✅ TwitterApi client created successfully')
    console.log('=== END TWITTER CLIENT INIT ===\n')
    return client
    
  } catch (error) {
    console.error('\n❌ === TWITTER CLIENT CREATION FAILED ===')
    console.error('🔥 Error message:', error.message)
    console.error('🔥 Error stack:', error.stack)
    console.error('🔥 Error code:', error.code)
    console.error('🔥 Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    console.error('=== END CLIENT ERROR ===\n')
    
    throw new Error(`Failed to initialize GAME Twitter client: ${error.message}`)
  }
}

// Real Twitter API handlers (adapted from production serverless function)

// Keyword search handler
async function handleKeywordSearch(client, params, req, res) {
  try {
    const { 
      keyword, 
      includeMentions = false, 
      limit = 50, 
      language, 
      sortOrder = 'recent',
      global = false 
    } = params
    
    if (!keyword) {
      return res.status(400).json({
        error: 'Missing query',
        message: 'Query is required for keyword search'
      })
    }
    
    console.log(`🔍 Advanced keyword search: "${keyword}" | Language: ${language} | Sort: ${sortOrder} | Global: ${global}`)
    
    // Build search query with advanced options
    let searchQuery = keyword.trim()
    
    // Add mentions filter if not included
    if (!includeMentions) {
      searchQuery += ' -is:reply'
    }
    
    // Remove spam and retweets for better quality
    // Add language filter if specified, otherwise default to English unless global
    searchQuery += ' -is:retweet'
    if (!global) {
      const langCode = language && language.trim() ? language.trim() : 'en'
      searchQuery += ` lang:${langCode}`
    }
    
    console.log(`🔍 Final search query: "${searchQuery}"`)
    
    // Build API parameters with sort order
    const apiParams = {
      max_results: Math.max(10, limit), // Removed 100 cap for upgraded SDK tier
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
    }
    
    // Add sort parameter if specified (Twitter API v2 uses sort_order)
    if (sortOrder === 'recent') {
      apiParams.sort_order = 'recency'
    } else if (sortOrder === 'popular') {
      apiParams.sort_order = 'relevancy'
    }
    
    // Use GAME SDK to search tweets
    const searchResults = await client.v2.search(searchQuery, apiParams)
    
    // Process and format results
    const tweets = searchResults.data?.data || []
    const users = searchResults.data?.includes?.users || []
    
    // Create user lookup map
    const userMap = new Map()
    users.forEach(user => userMap.set(user.id, user))
    
    // Format tweets with enhanced data
    const formattedTweets = tweets.map(tweet => {
      const author = userMap.get(tweet.author_id)
      
      // Extract hashtags
      const hashtags = tweet.entities?.hashtags?.map(tag => `#${tag.tag}`) || []
      
      // Calculate basic sentiment
      const sentiment = calculateBasicSentiment(tweet.text)
      
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
        hashtags,
        url: `https://twitter.com/${author?.username}/status/${tweet.id}`,
        replies: [] // Will be populated if mentions is enabled
      }
    })
    
    // Fetch replies if mentions are enabled
    const tweetsWithReplies = await fetchRepliesForTweets(client, formattedTweets, includeMentions)
    
    // Calculate analytics (now includes reply analytics if available)
    const analytics = generateAnalytics(tweetsWithReplies, keyword, includeMentions)
    
    return res.status(200).json({
      success: true,
      data: tweetsWithReplies,
      analytics,
      query: keyword,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Keyword search failed:', error)
    return res.status(500).json({
      error: 'Search failed',
      message: error.message
    })
  }
}

// NEW: Separated search handler that returns structured results for each search type
async function handleSeparatedSearch(client, params, req, res) {
  try {
    console.log('🎯 Starting separated search with params:', params)
    
    const { 
      keyword = '', 
      hashtags = [], 
      accountUsername = '',
      language, 
      sortOrder = 'recent', 
      includeMentions = false, 
      limit = 100,
      global = false
    } = params
    
    // Check if at least one search type is provided
    const hasKeyword = keyword && keyword.trim().length > 0
    const hasHashtags = hashtags && hashtags.length > 0
    const hasAccount = accountUsername && accountUsername.trim().length > 0
    
    if (!hasKeyword && !hasHashtags && !hasAccount) {
      return res.status(400).json({
        error: 'Missing search criteria',
        message: 'At least one of keyword, hashtags, or account is required'
      })
    }
    
    // Prepare promises for parallel execution
    const searchPromises = []
    const searchTypes = []
    
    // Account search (ignores most filters)
    if (hasAccount) {
      searchTypes.push('account')
      searchPromises.push(
        searchAccountData(client, {
          accountUsername: accountUsername.replace(/^@/, ''),
          includeMentions,
          limit,
          sortOrder  // Account might use sortOrder for its own tweets
        }).catch(err => {
          console.error('Account search error:', err)
          return null
        })
      )
    } else {
      searchTypes.push('account')
      searchPromises.push(Promise.resolve(null))
    }
    
    // Keyword search (uses all filters)
    if (hasKeyword) {
      searchTypes.push('keyword')
      searchPromises.push(
        searchKeywordData(client, {
          keyword,
          language,
          sortOrder,
          includeMentions,
          global,
          limit
        }).catch(err => {
          console.error('Keyword search error:', err)
          return null
        })
      )
    } else {
      searchTypes.push('keyword')
      searchPromises.push(Promise.resolve(null))
    }
    
    // Hashtag search (uses all filters)
    if (hasHashtags) {
      searchTypes.push('hashtag')
      searchPromises.push(
        searchHashtagData(client, {
          hashtags,
          language,
          sortOrder,
          includeMentions,
          global,
          limit
        }).catch(err => {
          console.error('Hashtag search error:', err)
          return null
        })
      )
    } else {
      searchTypes.push('hashtag')
      searchPromises.push(Promise.resolve(null))
    }
    
    // Execute all searches in parallel
    console.log('🚀 Executing parallel searches:', searchTypes.filter((t, i) => searchPromises[i]))
    const results = await Promise.all(searchPromises)
    
    // Structure the response
    const [accountResult, keywordResult, hashtagResult] = results
    
    // Calculate global analytics
    const globalAnalytics = calculateGlobalAnalytics(accountResult, keywordResult, hashtagResult)
    
    // Build the final response
    const response = {
      success: true,
      results: {
        account: accountResult,
        keyword: keywordResult,
        hashtag: hashtagResult
      },
      globalAnalytics,
      searchParams: {
        keyword: hasKeyword ? keyword : null,
        hashtags: hasHashtags ? hashtags : null,
        accountUsername: hasAccount ? accountUsername : null,
        language,
        sortOrder,
        includeMentions,
        limit,
        global
      },
      timestamp: new Date().toISOString()
    }
    
    console.log('✅ Separated search complete:', {
      account: accountResult ? `${accountResult.count} tweets` : 'none',
      keyword: keywordResult ? `${keywordResult.count} tweets` : 'none',
      hashtag: hashtagResult ? `${hashtagResult.count} tweets` : 'none',
      total: globalAnalytics.totalTweetsFetched
    })
    
    return res.status(200).json(response)
    
  } catch (error) {
    console.error('❌ Separated search failed:', error)
    return res.status(500).json({
      error: 'Separated search failed',
      message: error.message
    })
  }
}

// Legacy combined search handler (keeping for backward compatibility)
async function handleCombinedSearch(client, params, req, res) {
  try {
    console.log(`🔥 DEBUG: handleCombinedSearch called with params:`, params)
    
    const { 
      keyword = '', 
      hashtags = [], 
      language, 
      sortOrder = 'recent', 
      includeMentions = false, 
      limit = 25,
      global = false
    } = params
    
    // Determine search type based on inputs
    const hasKeyword = keyword.trim().length > 0
    const hasHashtags = hashtags.length > 0
    
    if (!hasKeyword && !hasHashtags) {
      return res.status(400).json({
        error: 'Missing search criteria',
        message: 'Either keyword or hashtags is required for combined search'
      })
    }
    
    console.log(`🔍 Combined search - Keyword: "${keyword}", Hashtags: [${hashtags.join(', ')}]`)
    
    let allTweets = []
    
    // Execute keyword search if provided
    if (hasKeyword) {
      const keywordTweets = await searchByKeyword(client, {
        keyword,
        language,
        sortOrder,
        includeMentions,
        global,
        limit: hasHashtags ? Math.ceil(limit / 2) : limit
      })
      allTweets.push(...keywordTweets)
    }
    
    // Execute hashtag search if provided
    if (hasHashtags) {
      const hashtagTweets = await searchByHashtags(client, {
        hashtags,
        language,
        sortOrder,
        includeMentions,
        global,
        limit: hasKeyword ? Math.ceil(limit / 2) : limit
      })
      allTweets.push(...hashtagTweets)
    }
    
    // Remove duplicates and sort using helper function
    const uniqueTweets = deduplicateAndSort(allTweets, limit, sortOrder)
    
    // Fetch replies if mentions are enabled
    const tweetsWithReplies = await fetchRepliesForTweets(client, uniqueTweets, includeMentions)
    
    // Generate analytics
    const analytics = generateCombinedAnalytics(tweetsWithReplies, keyword, hashtags)
    
    // Prepare response
    const response = {
      success: true,
      data: tweetsWithReplies,
      analytics,
      query: `${keyword} ${hashtags.join(' ')}`.trim(),
      timestamp: new Date().toISOString()
    }
    
    // Database saving handled client-side
    
    return res.status(200).json(response)
    
  } catch (error) {
    console.error('❌ Combined search failed:', error)
    return res.status(500).json({
      error: 'Combined search failed',
      message: error.message
    })
  }
}

// NEW: Helper function to search account and return structured data
async function searchAccountData(client, params) {
  const { accountUsername, includeMentions, limit, sortOrder } = params
  
  if (!accountUsername) {
    return null
  }
  
  const cleanUsername = accountUsername.replace(/^@/, '')
  
  try {
    console.log(`👤 Fetching account data for @${cleanUsername}`)
    
    // Account search ignores most filters - only uses account-specific params
    let baseQuery = `from:${cleanUsername} -is:retweet`
    
    if (!includeMentions) {
      baseQuery += ' -is:reply'
    }
    
    const apiParams = {
      max_results: Math.max(10, limit),
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
        'profile_image_url',
        'description',
        'created_at'
      ].join(','),
      expansions: 'author_id,referenced_tweets.id'
    }
    
    if (sortOrder === 'recent') {
      apiParams.sort_order = 'recency'
    } else if (sortOrder === 'popular') {
      apiParams.sort_order = 'relevancy'
    }
    
    const searchResults = await client.v2.search(baseQuery, apiParams)
    const tweets = searchResults.data?.data || []
    const users = searchResults.data?.includes?.users || []
    
    if (tweets.length === 0) {
      return {
        searchType: 'account',
        username: `@${cleanUsername}`,
        tweets: [],
        count: 0,
        analytics: {
          totalTweets: 0,
          totalEngagement: 0,
          avgEngagement: 0,
          message: 'No tweets found for this account'
        },
        parametersUsed: {
          includeMentions,
          limit,
          sortOrder
        }
      }
    }
    
    // Format tweets
    const formattedTweets = formatTweets(tweets, users)
    
    // Calculate account-specific analytics
    const accountAnalytics = generateAccountSpecificAnalytics(formattedTweets, cleanUsername)
    
    return {
      searchType: 'account',
      username: `@${cleanUsername}`,
      tweets: formattedTweets,
      count: formattedTweets.length,
      analytics: accountAnalytics,
      parametersUsed: {
        includeMentions,
        limit,
        sortOrder
      }
    }
    
  } catch (error) {
    console.error(`Account search error for @${cleanUsername}:`, error)
    throw error
  }
}

// NEW: Helper function to search keywords and return structured data
async function searchKeywordData(client, params) {
  const { keyword, language, sortOrder, includeMentions, global, limit } = params
  
  if (!keyword || !keyword.trim()) {
    return null
  }
  
  try {
    console.log(`🔍 Fetching keyword data for "${keyword}"`)
    
    let searchQuery = keyword.trim()
    
    if (!includeMentions) {
      searchQuery += ' -is:reply'
    }
    
    searchQuery += ' -is:retweet'
    
    if (!global && language) {
      searchQuery += ` lang:${language}`
    }
    
    const apiParams = {
      max_results: Math.max(10, limit),
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
    }
    
    if (sortOrder === 'recent') {
      apiParams.sort_order = 'recency'
    } else if (sortOrder === 'popular') {
      apiParams.sort_order = 'relevancy'
    }
    
    const searchResults = await client.v2.search(searchQuery, apiParams)
    const tweets = searchResults.data?.data || []
    const users = searchResults.data?.includes?.users || []
    
    const formattedTweets = formatTweets(tweets, users)
    const keywordAnalytics = generateKeywordAnalytics(formattedTweets, keyword)
    
    return {
      searchType: 'keyword',
      query: keyword,
      tweets: formattedTweets,
      count: formattedTweets.length,
      analytics: keywordAnalytics,
      parametersUsed: {
        language,
        sortOrder,
        includeMentions,
        global,
        limit
      }
    }
    
  } catch (error) {
    console.error(`Keyword search error for "${keyword}":`, error)
    throw error
  }
}

// NEW: Helper function to search hashtags and return structured data
async function searchHashtagData(client, params) {
  const { hashtags, language, sortOrder, includeMentions, global, limit } = params
  
  if (!hashtags || hashtags.length === 0) {
    return null
  }
  
  try {
    console.log(`#️⃣ Fetching hashtag data for [${hashtags.join(', ')}]`)
    
    let searchQuery = hashtags.join(' OR ')
    
    if (!includeMentions) {
      searchQuery += ' -is:reply'
    }
    
    searchQuery += ' -is:retweet'
    
    if (!global && language) {
      searchQuery += ` lang:${language}`
    }
    
    const apiParams = {
      max_results: Math.max(10, limit),
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
    }
    
    if (sortOrder === 'recent') {
      apiParams.sort_order = 'recency'
    } else if (sortOrder === 'popular') {
      apiParams.sort_order = 'relevancy'
    }
    
    const searchResults = await client.v2.search(searchQuery, apiParams)
    const tweets = searchResults.data?.data || []
    const users = searchResults.data?.includes?.users || []
    
    const formattedTweets = formatTweets(tweets, users)
    const hashtagAnalytics = generateHashtagAnalytics(formattedTweets, hashtags)
    
    return {
      searchType: 'hashtag',
      tags: hashtags,
      tweets: formattedTweets,
      count: formattedTweets.length,
      analytics: hashtagAnalytics,
      parametersUsed: {
        language,
        sortOrder,
        includeMentions,
        global,
        limit
      }
    }
    
  } catch (error) {
    console.error(`Hashtag search error for [${hashtags.join(', ')}]:`, error)
    throw error
  }
}

// Legacy account analysis handler (keeping for backward compatibility)
async function handleAccountAnalysis(client, params, req, res) {
  const { accountUsername, keyword, hashtags, language, sortOrder, includeMentions, global, limit } = params
  
  if (!accountUsername) {
    return res.status(400).json({
      error: 'Missing account username',
      message: 'Account username is required for account analysis'
    })
  }
  
  // Clean username (remove @ if present)
  const cleanUsername = accountUsername.replace(/^@/, '')
  
  try {
    
    console.log(`👤 Account analysis for @${cleanUsername}`)
    
    // CRITICAL: Account fetching is INDEPENDENT - start with just the account
    let baseQuery = `from:${cleanUsername}`
    
    // Always exclude retweets for original content
    baseQuery += ' -is:retweet'
    
    // Optionally exclude replies
    if (!includeMentions) {
      baseQuery += ' -is:reply'
    }
    
    console.log(`🔍 Base account query: "${baseQuery}"`)
    
    // Build API parameters
    const apiParams = {
      max_results: Math.max(10, limit), // Removed 100 cap for upgraded SDK tier
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
        'profile_image_url',
        'description',
        'created_at'
      ].join(','),
      expansions: 'author_id,referenced_tweets.id'
    }
    
    // Add sort parameter
    if (sortOrder === 'recent') {
      apiParams.sort_order = 'recency'
    } else if (sortOrder === 'popular') {
      apiParams.sort_order = 'relevancy'
    }
    
    let searchResults
    let tweets = []
    let users = []
    let filtersApplied = false
    
    // CRITICAL: Account analysis is COMPLETELY INDEPENDENT - NO FILTERS APPLIED
    // The user explicitly requested account fetching to be 100% independent
    // We MUST ignore keyword, hashtags, and language filters for account analysis
    console.log('📌 Account analysis mode: Ignoring ALL filters - fetching pure account tweets')
    
    // Log what filters were ignored for debugging
    if (keyword || (hashtags && hashtags.length > 0) || language) {
      console.log('⚠️ Filters received but IGNORED for account analysis:', {
        keyword: keyword || 'none',
        hashtags: hashtags?.length ? `${hashtags.length} hashtags` : 'none',
        language: language || 'none'
      })
    }
    
    // Use ONLY the base query - no filters whatsoever
    searchResults = await client.v2.search(baseQuery, apiParams)
    tweets = searchResults.data?.data || []
    users = searchResults.data?.includes?.users || []
    
    if (tweets.length === 0) {
      // Try to determine why no tweets were found
      let accountExists = false
      let accountInfo = null
      let verificationFailed = false
      
      try {
        // CRITICAL: Use ONLY the username for verification - completely independent check
        const simpleTestQuery = `from:${cleanUsername}`
        console.log(`🔍 Verifying account existence with simple query: "${simpleTestQuery}"`)
        
        const testResults = await client.v2.search(simpleTestQuery, {
          max_results: 1,
          'user.fields': 'username,name,public_metrics,profile_image_url,verified'
        })
        
        if (testResults.data?.meta?.result_count > 0) {
          accountExists = true
          const testUsers = testResults.data?.includes?.users || []
          accountInfo = testUsers.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase())
          console.log(`✅ Account @${cleanUsername} exists`)
        } else {
          // Only if verification succeeded with 0 results do we know account doesn't exist
          console.log(`❌ Account @${cleanUsername} not found`)
        }
      } catch (testError) {
        console.log('⚠️ Account verification failed:', testError.message)
        // CRITICAL: Verification failed - DO NOT assume account doesn't exist!
        // Accounts with underscores or special characters often fail verification
        verificationFailed = true
        // When verification fails, assume account EXISTS (better safe than sorry)
        accountExists = true
      }
      
      // Provide specific error messages
      if (!accountExists && !verificationFailed) {
        // Only claim account doesn't exist if verification succeeded with 0 results
        return res.status(404).json({
          error: 'Account not found',
          message: `The account @${cleanUsername} does not exist or is not accessible`,
          suggestion: 'Please verify the username and try again',
          possibleReasons: [
            'The username may be incorrect',
            'The account may be suspended or deleted',
            'The account may be private'
          ]
        })
      } else if (!filtersApplied && (keyword || (hashtags && hashtags.length > 0))) {
        // Filters were attempted but failed - query was too complex
        return res.status(200).json({
          success: true,
          data: [],
          analytics: {
            total_tweets: 0,
            message: 'Query too complex - filters could not be applied',
            suggestion: 'Try using fewer hashtags or simpler keywords'
          },
          account: `@${cleanUsername}`,
          filters: {
            keyword: keyword || null,
            hashtags: hashtags || [],
            note: 'Filters were too complex to apply. Try searching with fewer parameters.'
          },
          accountInfo,
          total: 0,
          timestamp: new Date().toISOString()
        })
      } else if (keyword || (hashtags && hashtags.length > 0)) {
        return res.status(404).json({
          error: 'No matching tweets',
          message: verificationFailed 
            ? `No tweets found matching your filters for @${cleanUsername}`
            : `Account @${cleanUsername} exists but has no tweets matching your filters`,
          suggestion: 'Try removing filters or using different keywords',
          filters: {
            keyword: keyword || null,
            hashtags: hashtags || []
          },
          account: accountInfo,
          verificationNote: verificationFailed ? 'Account verification had issues but account likely exists' : undefined
        })
      } else {
        return res.status(404).json({
          error: 'No recent activity',
          message: verificationFailed
            ? `No recent tweets found for @${cleanUsername}`
            : `Account @${cleanUsername} exists but has no recent original tweets`,
          suggestion: includeMentions ? 'This account may be inactive' : 'Try enabling "Include mentions and replies" to see more activity',
          account: accountInfo,
          verificationNote: verificationFailed ? 'Account verification had issues but account likely exists' : undefined
        })
      }
    }
    
    // Format tweets
    const formattedTweets = formatTweets(tweets, users)
    
    // If mentions enabled, fetch replies for top tweets
    if (includeMentions) {
      console.log('📱 Fetching replies for account tweets...')
      const tweetsToFetchReplies = formattedTweets.slice(0, 3)
      
      for (const tweet of tweetsToFetchReplies) {
        const replies = await fetchTweetReplies(client, tweet.id, 5, cleanUsername)
        tweet.replies = replies
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
    
    // Generate account-specific analytics
    const analytics = generateAccountAnalytics(formattedTweets, cleanUsername, keyword, hashtags)
    
    // Add AI insights if available
    try {
      const aiInsights = await analyzeAccountWithAI(formattedTweets, cleanUsername)
      if (aiInsights) {
        analytics.ai_insights = aiInsights
        console.log('✨ AI insights added to account analysis')
      }
    } catch (error) {
      console.log('AI analysis skipped:', error.message)
      // Continue without AI - not critical
    }
    
    return res.status(200).json({
      success: true,
      data: formattedTweets,
      analytics,
      account: `@${cleanUsername}`,
      filters: {
        keyword: keyword || null,
        hashtags: hashtags || []
      },
      total: tweets.length,
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('Account analysis error:', error)
    
    // Check for invalid username (Twitter API returns 400)
    if (error.code === 400 && error.errors?.[0]?.message?.includes('Invalid username')) {
      return res.status(404).json({
        error: 'Invalid username',
        message: `The username @${cleanUsername} is not valid`,
        suggestion: 'Twitter usernames can only contain letters, numbers, and underscores, and must be 15 characters or less',
        possibleReasons: [
          'Username is too long (max 15 characters)',
          'Username contains invalid characters',
          'Username format is incorrect'
        ]
      })
    }
    
    if (error.code === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Twitter API rate limit reached. Please try again later.'
      })
    }
    
    return res.status(500).json({
      error: 'Account analysis failed',
      message: 'Failed to analyze account. Please check the username and try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    })
  }
}

// Hashtag discovery handler
async function handleHashtagDiscovery(client, params, req, res) {
  try {
    const { keyword, language } = params
    const userId = req.body.user_id || 'anonymous'
    
    if (!keyword) {
      return res.status(400).json({
        error: 'Missing keyword',
        message: 'Keyword is required for hashtag discovery'
      })
    }
    
    console.log(`🏷️ Discovering hashtags for "${keyword}" with language: ${language || 'en'}`)
    const discoveredHashtags = await discoverTopHashtags(client, keyword, language)
    
    // Check if discovery was successful
    if (!discoveredHashtags.success) {
      return res.status(200).json({
        success: false,
        keyword,
        hashtags: [],
        message: discoveredHashtags.totalTweetsAnalyzed === 0 
          ? `No tweets found for "${keyword}". Try a different keyword or language.`
          : 'No hashtags found in the analyzed tweets.',
        timestamp: new Date().toISOString()
      })
    }
    
    const response = {
      success: true,
      keyword,
      hashtags: discoveredHashtags.hashtags || [],
      totalTweetsAnalyzed: discoveredHashtags.totalTweetsAnalyzed,
      totalHashtagsFound: discoveredHashtags.totalHashtagsFound,
      timestamp: new Date().toISOString()
    }
    
    // Database saving handled client-side
    
    return res.status(200).json(response)
    
  } catch (error) {
    console.error('❌ Hashtag discovery failed:', error)
    return res.status(500).json({
      error: 'Hashtag discovery failed',
      message: error.message
    })
  }
}

// Placeholder handlers
async function handleHashtagAnalysis(client, params, req, res) {
  return res.status(501).json({
    error: 'Not implemented',
    message: 'Hashtag analysis will be implemented in future version'
  })
}

async function handleSentimentAnalysis(client, params, req, res) {
  return res.status(501).json({
    error: 'Not implemented',
    message: 'Sentiment analysis will be implemented in future version'
  })
}

// Utility functions for real Twitter API

// Calculate basic sentiment
function calculateBasicSentiment(text) {
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'best', 'awesome', 'perfect', 'happy', 'excited', 'brilliant']
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 'disappointing', 'sucks', 'stupid', 'annoying', 'sad', 'angry', 'frustrated']
  
  const words = text.toLowerCase().split(/\s+/)
  let score = 0
  let matches = 0
  
  words.forEach(word => {
    if (positiveWords.includes(word)) {
      score += 1
      matches++
    } else if (negativeWords.includes(word)) {
      score -= 1
      matches++
    }
  })
  
  const normalizedScore = matches > 0 ? score / words.length : 0
  const confidence = Math.min(matches / 10, 1)
  
  let label = 'neutral'
  if (normalizedScore > 0.01) label = 'positive'
  else if (normalizedScore < -0.01) label = 'negative'
  
  return {
    label,
    score: Math.max(-1, Math.min(1, normalizedScore * 10)),
    confidence: Math.max(0.3, confidence)
  }
}

// NEW: Generate analytics specific to account searches
function generateAccountSpecificAnalytics(tweets, username) {
  if (tweets.length === 0) {
    return {
      totalTweets: 0,
      totalEngagement: 0,
      avgEngagement: 0,
      followerCount: 0,
      postingFrequency: 0
    }
  }
  
  const totalEngagement = tweets.reduce((sum, tweet) => 
    sum + tweet.metrics.likes + tweet.metrics.retweets + tweet.metrics.replies, 0
  )
  
  const avgEngagement = Math.round(totalEngagement / tweets.length)
  
  // Get follower count from first tweet's author
  const followerCount = tweets[0]?.author?.followers || 0
  
  // Calculate posting frequency
  if (tweets.length > 1) {
    const sortedTweets = tweets.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const oldestTweet = new Date(sortedTweets[0].created_at)
    const newestTweet = new Date(sortedTweets[sortedTweets.length - 1].created_at)
    const daysDiff = Math.max(1, (newestTweet - oldestTweet) / (1000 * 60 * 60 * 24))
    const postingFrequency = Number((tweets.length / daysDiff).toFixed(2))
    
    return {
      totalTweets: tweets.length,
      totalEngagement,
      avgEngagement,
      followerCount,
      postingFrequency,
      dateRange: {
        from: oldestTweet.toISOString(),
        to: newestTweet.toISOString()
      },
      topTweets: tweets
        .sort((a, b) => (b.metrics.likes + b.metrics.retweets) - (a.metrics.likes + a.metrics.retweets))
        .slice(0, 3)
        .map(t => ({
          id: t.id,
          engagement: t.metrics.likes + t.metrics.retweets,
          text: t.text.substring(0, 100)
        }))
    }
  }
  
  return {
    totalTweets: tweets.length,
    totalEngagement,
    avgEngagement,
    followerCount,
    postingFrequency: 0
  }
}

// NEW: Generate analytics specific to keyword searches
function generateKeywordAnalytics(tweets, keyword) {
  if (tweets.length === 0) {
    return {
      totalTweets: 0,
      totalEngagement: 0,
      avgEngagement: 0,
      totalReach: 0,
      topInfluencers: []
    }
  }
  
  const totalEngagement = tweets.reduce((sum, tweet) => 
    sum + tweet.metrics.likes + tweet.metrics.retweets + tweet.metrics.replies, 0
  )
  
  const totalReach = tweets.reduce((sum, tweet) => 
    sum + (tweet.author?.followers || 0), 0
  )
  
  const sentimentCounts = tweets.reduce((acc, tweet) => {
    acc[tweet.sentiment.label]++
    return acc
  }, { positive: 0, negative: 0, neutral: 0 })
  
  const topInfluencers = tweets
    .sort((a, b) => (b.author?.followers || 0) - (a.author?.followers || 0))
    .slice(0, 5)
    .map(t => ({
      username: t.author.username,
      followers: t.author.followers,
      verified: t.author.verified
    }))
  
  return {
    totalTweets: tweets.length,
    totalEngagement,
    avgEngagement: Math.round(totalEngagement / tweets.length),
    totalReach,
    sentimentDistribution: sentimentCounts,
    topInfluencers,
    avgSentiment: tweets.reduce((sum, t) => sum + t.sentiment.score, 0) / tweets.length
  }
}

// NEW: Generate analytics specific to hashtag searches
function generateHashtagAnalytics(tweets, hashtags) {
  if (tweets.length === 0) {
    return {
      totalTweets: 0,
      totalEngagement: 0,
      avgEngagement: 0,
      trending: false,
      viralPotential: 0
    }
  }
  
  const totalEngagement = tweets.reduce((sum, tweet) => 
    sum + tweet.metrics.likes + tweet.metrics.retweets, 0
  )
  
  const avgEngagement = Math.round(totalEngagement / tweets.length)
  
  // Calculate viral potential (engagement rate)
  const totalViews = tweets.reduce((sum, tweet) => sum + (tweet.metrics.views || 0), 0)
  const viralPotential = totalViews > 0 ? (totalEngagement / totalViews) : 0
  
  // Check if trending (high engagement in recent tweets)
  const recentTweets = tweets.filter(t => {
    const hoursSincePost = (Date.now() - new Date(t.created_at)) / (1000 * 60 * 60)
    return hoursSincePost < 24
  })
  
  const trending = recentTweets.length > 5 && avgEngagement > 100
  
  // Get co-occurring hashtags
  const coOccurringTags = {}
  tweets.forEach(tweet => {
    tweet.hashtags?.forEach(tag => {
      if (!hashtags.includes(tag)) {
        coOccurringTags[tag] = (coOccurringTags[tag] || 0) + 1
      }
    })
  })
  
  const topCoOccurringTags = Object.entries(coOccurringTags)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([tag]) => tag)
  
  return {
    totalTweets: tweets.length,
    totalEngagement,
    avgEngagement,
    trending,
    viralPotential: Number(viralPotential.toFixed(4)),
    topCoOccurringTags,
    peakHour: getMostActiveHour(tweets)
  }
}

// NEW: Calculate global analytics from all search results
function calculateGlobalAnalytics(accountResult, keywordResult, hashtagResult) {
  let totalTweetsFetched = 0
  let uniqueTweetIds = new Set()
  let allTweets = []
  
  if (accountResult?.tweets) {
    totalTweetsFetched += accountResult.tweets.length
    accountResult.tweets.forEach(t => {
      uniqueTweetIds.add(t.id)
      allTweets.push(t)
    })
  }
  
  if (keywordResult?.tweets) {
    totalTweetsFetched += keywordResult.tweets.length
    keywordResult.tweets.forEach(t => {
      uniqueTweetIds.add(t.id)
      allTweets.push(t)
    })
  }
  
  if (hashtagResult?.tweets) {
    totalTweetsFetched += hashtagResult.tweets.length
    hashtagResult.tweets.forEach(t => {
      uniqueTweetIds.add(t.id)
      allTweets.push(t)
    })
  }
  
  const uniqueCount = uniqueTweetIds.size
  const overlapCount = totalTweetsFetched - uniqueCount
  
  // Calculate combined sentiment
  let totalSentimentScore = 0
  let sentimentCount = 0
  
  allTweets.forEach(tweet => {
    if (tweet.sentiment) {
      totalSentimentScore += tweet.sentiment.score
      sentimentCount++
    }
  })
  
  return {
    totalTweetsFetched,
    uniqueTweets: uniqueCount,
    duplicateCount: overlapCount,
    overlapPercentage: totalTweetsFetched > 0 ? Number((overlapCount / totalTweetsFetched * 100).toFixed(1)) : 0,
    searchTypesUsed: [
      accountResult ? 'account' : null,
      keywordResult ? 'keyword' : null,
      hashtagResult ? 'hashtag' : null
    ].filter(Boolean),
    overallSentiment: sentimentCount > 0 ? Number((totalSentimentScore / sentimentCount).toFixed(2)) : 0
  }
}

// Helper function to get most active hour
function getMostActiveHour(tweets) {
  const hourCounts = {}
  tweets.forEach(tweet => {
    const hour = new Date(tweet.created_at).getHours()
    hourCounts[hour] = (hourCounts[hour] || 0) + 1
  })
  
  const sorted = Object.entries(hourCounts).sort(([,a], [,b]) => b - a)
  return sorted.length > 0 ? parseInt(sorted[0][0]) : null
}

// Generate analytics from tweets
function generateAnalytics(tweets, query, includeMentions = false) {
  if (tweets.length === 0) {
    return {
      total_tweets: 0,
      avg_sentiment: 0,
      sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
      top_hashtags: [],
      engagement_stats: { avg_likes: 0, avg_retweets: 0, total_engagement: 0 },
      top_influencers: []
    }
  }
  
  // Sentiment distribution
  const sentimentCounts = tweets.reduce((acc, tweet) => {
    acc[tweet.sentiment.label]++
    return acc
  }, { positive: 0, negative: 0, neutral: 0 })
  
  // Average sentiment
  const avgSentiment = tweets.reduce((sum, tweet) => sum + tweet.sentiment.score, 0) / tweets.length
  
  // Top hashtags
  const hashtagCounts = {}
  tweets.forEach(tweet => {
    tweet.hashtags.forEach(tag => {
      hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1
    })
  })
  
  const topHashtags = Object.entries(hashtagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 15)
    .map(([tag]) => tag)
  
  // Engagement stats
  const totalLikes = tweets.reduce((sum, tweet) => sum + tweet.metrics.likes, 0)
  const totalRetweets = tweets.reduce((sum, tweet) => sum + tweet.metrics.retweets, 0)
  const totalReplies = tweets.reduce((sum, tweet) => sum + tweet.metrics.replies, 0)
  
  // Top influencers (by follower count)
  const topInfluencers = tweets
    .sort((a, b) => b.author.followers - a.author.followers)
    .slice(0, 5)
    .map(tweet => ({
      username: tweet.author.username,
      name: tweet.author.name,
      followers: tweet.author.followers,
      verified: tweet.author.verified
    }))
  
  // Reply analytics (if mentions enabled)
  let replyAnalytics = {}
  if (includeMentions) {
    const allReplies = tweets.flatMap(tweet => tweet.replies || [])
    const totalReplies = allReplies.length
    
    if (totalReplies > 0) {
      const avgReplySentiment = allReplies.reduce((sum, reply) => sum + reply.sentiment.score, 0) / totalReplies
      const replyEngagement = allReplies.reduce((sum, reply) => sum + reply.engagement, 0)
      
      const replySentimentCounts = allReplies.reduce((acc, reply) => {
        acc[reply.sentiment.label]++
        return acc
      }, { positive: 0, negative: 0, neutral: 0 })
      
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
      }
    }
  }

  return {
    total_tweets: tweets.length,
    avg_sentiment: Number(avgSentiment.toFixed(2)),
    sentiment_distribution: sentimentCounts,
    top_hashtags: topHashtags,
    engagement_stats: {
      avg_likes: Math.floor(totalLikes / tweets.length),
      avg_retweets: Math.floor(totalRetweets / tweets.length),
      total_engagement: totalLikes + totalRetweets + totalReplies
    },
    top_influencers: topInfluencers,
    ...(includeMentions && { reply_analytics: replyAnalytics })
  }
}

// AI-powered account analysis using OpenRouter
async function analyzeAccountWithAI(tweets, accountUsername) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
  
  if (!OPENROUTER_API_KEY) {
    return null // AI is optional - gracefully degrades
  }
  
  try {
    const tweetsForAnalysis = tweets.slice(0, 10).map(t => ({
      text: t.text,
      likes: t.metrics?.likes || 0,
      retweets: t.metrics?.retweets || 0,
      replies: t.metrics?.replies || 0,
      created_at: t.created_at
    }))
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{
          role: 'user',
          content: `Analyze Twitter account @${accountUsername} based on these recent tweets:
          ${JSON.stringify(tweetsForAnalysis, null, 2)}
          
          Provide detailed insights on:
          1. Content strategy and main themes
          2. Engagement patterns (what drives likes/retweets)
          3. Writing style and tone
          4. Posting consistency
          5. Audience interaction style
          
          Return ONLY valid JSON with these fields:
          {
            "content_themes": ["theme1", "theme2", "theme3"],
            "writing_style": "description of writing style",
            "engagement_insights": "what type of content gets most engagement",
            "audience_sentiment": "overall sentiment towards the account",
            "posting_patterns": "analysis of posting frequency and timing",
            "recommendations": ["recommendation1", "recommendation2", "recommendation3"]
          }`
        }]
      })
    })
    
    if (!response.ok) {
      console.error('AI analysis failed:', response.statusText)
      return null
    }
    
    const data = await response.json()
    const content = data.choices?.[0]?.message?.content
    
    if (content) {
      try {
        // Handle markdown-wrapped JSON responses
        let cleanContent = content.trim()
        if (cleanContent.startsWith('```json') || cleanContent.startsWith('```')) {
          // Remove markdown code blocks
          cleanContent = cleanContent.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim()
        }
        return JSON.parse(cleanContent)
      } catch (e) {
        console.error('Failed to parse AI response:', e)
        return null
      }
    }
    
    return null
  } catch (error) {
    console.error('AI analysis error:', error)
    return null // Graceful degradation
  }
}

// Generate analytics specific to account analysis
function generateAccountAnalytics(tweets, username, keyword, hashtags) {
  if (tweets.length === 0) {
    return {
      total_tweets: 0,
      account_metrics: {
        account: `@${username}`,
        total_analyzed: 0,
        posting_frequency: 0,
        avg_engagement_rate: 0
      }
    }
  }
  
  // Get basic analytics
  const baseAnalytics = generateAnalytics(tweets, keyword || `@${username}`)
  
  // Calculate account-specific metrics
  const sortedTweets = tweets.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const oldestTweet = new Date(sortedTweets[0].created_at)
  const newestTweet = new Date(sortedTweets[sortedTweets.length - 1].created_at)
  const daysDiff = Math.max(1, (newestTweet - oldestTweet) / (1000 * 60 * 60 * 24))
  
  // Posting frequency (tweets per day)
  const postingFrequency = tweets.length / daysDiff
  
  // Average engagement rate (engagement / followers * 100)
  const avgFollowers = tweets[0]?.author?.followers || 1
  const totalEngagement = tweets.reduce((sum, tweet) => 
    sum + tweet.metrics.likes + tweet.metrics.retweets + tweet.metrics.replies, 0
  )
  const avgEngagementRate = (totalEngagement / (tweets.length * avgFollowers)) * 100
  
  // Find top performing tweets
  const topTweets = tweets
    .sort((a, b) => {
      const aEngagement = a.metrics.likes + a.metrics.retweets
      const bEngagement = b.metrics.likes + b.metrics.retweets
      return bEngagement - aEngagement
    })
    .slice(0, 3)
    .map(tweet => ({
      text: tweet.text.substring(0, 100) + (tweet.text.length > 100 ? '...' : ''),
      likes: tweet.metrics.likes,
      retweets: tweet.metrics.retweets,
      url: tweet.url
    }))
  
  // Posting time analysis
  const hourCounts = {}
  tweets.forEach(tweet => {
    const hour = new Date(tweet.created_at).getHours()
    hourCounts[hour] = (hourCounts[hour] || 0) + 1
  })
  
  const topPostingHours = Object.entries(hourCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 4)
    .map(([hour]) => parseInt(hour))
  
  // Add account metrics to base analytics
  baseAnalytics.account_metrics = {
    account: `@${username}`,
    total_analyzed: tweets.length,
    posting_frequency: Number(postingFrequency.toFixed(2)),
    avg_engagement_rate: Number(avgEngagementRate.toFixed(3)),
    top_tweets: topTweets,
    top_posting_hours: topPostingHours,
    date_range: {
      from: oldestTweet.toISOString(),
      to: newestTweet.toISOString()
    }
  }
  
  return baseAnalytics
}

// Generate combined analytics
function generateCombinedAnalytics(tweets, keyword, hashtags) {
  return generateAnalytics(tweets, `${keyword} ${hashtags.join(' ')}`.trim())
}

// Utility functions from production API
function deduplicateAndSort(tweets, limit, sortOrder = 'recent') {
  const uniqueTweets = tweets.reduce((acc, tweet) => {
    if (!acc.some(t => t.id === tweet.id)) {
      acc.push(tweet);
    }
    return acc;
  }, []);
  
  if (sortOrder === 'popular' || sortOrder === 'relevancy') {
    // For popular: Filter out very low engagement, then sort by engagement
    const minEngagement = 5; // Minimum total engagement threshold
    const filtered = uniqueTweets.filter(tweet => 
      (tweet.metrics.likes + tweet.metrics.retweets) >= minEngagement
    );
    
    // FALLBACK: If filtering removes all tweets, return top tweets by engagement
    // even if they're below threshold
    if (filtered.length === 0) {
      console.log('⚠️ No tweets met engagement threshold, using top tweets as fallback');
      return uniqueTweets
        .sort((a, b) => {
          const aEngagement = a.metrics.likes + a.metrics.retweets;
          const bEngagement = b.metrics.likes + b.metrics.retweets;
          
          if (bEngagement !== aEngagement) {
            return bEngagement - aEngagement;
          }
          
          return new Date(b.created_at) - new Date(a.created_at);
        })
        .slice(0, limit);
    }
    
    // Normal case: return filtered and sorted tweets
    return filtered
      .sort((a, b) => {
        const aEngagement = a.metrics.likes + a.metrics.retweets;
        const bEngagement = b.metrics.likes + b.metrics.retweets;
        
        if (bEngagement !== aEngagement) {
          return bEngagement - aEngagement;
        }
        
        return new Date(b.created_at) - new Date(a.created_at);
      })
      .slice(0, limit);
  } else {
    // For recent: Sort by date only, no engagement filtering
    return uniqueTweets
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);
  }
}

function formatTweets(tweets, users) {
  const userMap = new Map();
  users.forEach(user => userMap.set(user.id, user));
  
  return tweets.map(tweet => {
    const author = userMap.get(tweet.author_id);
    const hashtags = tweet.entities?.hashtags?.map(tag => `#${tag.tag}`) || [];
    const sentiment = calculateBasicSentiment(tweet.text);
    
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
      hashtags,
      url: `https://twitter.com/${author?.username}/status/${tweet.id}`,
      replies: [] // Initialize replies array - will be populated if mentions is enabled
    };
  });
}

// Search helper functions
async function searchByKeyword(client, params) {
  try {
    const { 
      keyword, 
      includeMentions = false, 
      limit = 50, 
      language, 
      sortOrder = 'recent',
      global = false 
    } = params
    
    if (!keyword || keyword.trim().length === 0) {
      return []
    }
    
    console.log(`🔍 Keyword search helper: "${keyword}" | Language: ${language} | Sort: ${sortOrder} | Global: ${global}`)
    
    // Build search query with advanced options
    let searchQuery = keyword.trim()
    
    // Add mentions filter if not included
    if (!includeMentions) {
      searchQuery += ' -is:reply'
    }
    
    // Remove spam and retweets for better quality
    // Add language filter if specified, otherwise default to English unless global
    searchQuery += ' -is:retweet'
    if (!global) {
      const langCode = language && language.trim() ? language.trim() : 'en'
      searchQuery += ` lang:${langCode}`
    }
    
    console.log(`🔍 Search query: "${searchQuery}"`)
    
    // Fetch more tweets for popular searches to get better quality results
    const fetchLimit = sortOrder === 'popular' ? 
      Math.max(50, limit * 2) :  // Popular: fetch 2x requested (min 50, no max cap)
      Math.max(50, limit);        // Recent: fetch requested amount (min 50, no max cap)
    
    // Build API parameters with sort order
    const apiParams = {
      max_results: fetchLimit,
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
    }
    
    // Add sort parameter
    if (sortOrder === 'recent') {
      apiParams.sort_order = 'recency'
    } else if (sortOrder === 'popular') {
      apiParams.sort_order = 'relevancy'
    }
    
    // Use GAME SDK to search tweets
    const searchResults = await client.v2.search(searchQuery, apiParams)
    
    // Process and format results using helper function
    const tweets = searchResults.data?.data || []
    const users = searchResults.data?.includes?.users || []
    const formattedTweets = formatTweets(tweets, users)
    
    console.log(`✅ Found ${formattedTweets.length} tweets for keyword "${keyword}"`)
    return formattedTweets
    
  } catch (error) {
    console.error(`❌ Keyword search helper failed:`, error)
    return []
  }
}

async function searchByHashtags(client, params) {
  try {
    const { 
      hashtags = [], 
      includeMentions = false, 
      limit = 50, 
      language, 
      sortOrder = 'recent',
      global = false 
    } = params
    
    if (!hashtags || !Array.isArray(hashtags) || hashtags.length === 0) {
      return []
    }
    
    console.log(`🏷️ Hashtag search helper: [${hashtags.join(', ')}] | Language: ${language} | Sort: ${sortOrder} | Global: ${global}`)
    
    // Build hashtag search query - simplified to match production
    let searchQuery = hashtags.join(' OR ')
    
    // Add mentions filter if not included
    if (!includeMentions) {
      searchQuery += ' -is:reply'
    }
    
    // Remove spam and retweets for better quality
    // Add language filter if specified, otherwise default to English unless global
    searchQuery += ' -is:retweet'
    if (!global) {
      const langCode = language && language.trim() ? language.trim() : 'en'
      searchQuery += ` lang:${langCode}`
    }
    
    console.log(`🏷️ Hashtag search query: "${searchQuery}"`)
    
    // Fetch more tweets for popular searches to get better quality results
    const fetchLimit = sortOrder === 'popular' ? 
      Math.max(50, limit * 2) :  // Popular: fetch 2x requested (min 50, no max cap)
      Math.max(50, limit);        // Recent: fetch requested amount (min 50, no max cap)
    
    // Build API parameters with sort order
    const apiParams = {
      max_results: fetchLimit,
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
    }
    
    // Add sort parameter
    if (sortOrder === 'recent') {
      apiParams.sort_order = 'recency'
    } else if (sortOrder === 'popular') {
      apiParams.sort_order = 'relevancy'
    }
    
    // Use GAME SDK to search tweets
    const searchResults = await client.v2.search(searchQuery, apiParams)
    
    // Process and format results using helper function
    const tweets = searchResults.data?.data || []
    const users = searchResults.data?.includes?.users || []
    const formattedTweets = formatTweets(tweets, users)
    
    console.log(`✅ Found ${formattedTweets.length} tweets for hashtags [${hashtags.join(', ')}]`)
    return formattedTweets
    
  } catch (error) {
    console.error(`❌ Hashtag search helper failed:`, error)
    return []
  }
}

// Advanced reply fetching with multiple fallback methods (from production API)
async function fetchTweetReplies(client, tweetId, limit = 10, originalTweetAuthor = null) {
  const maxResults = Math.max(10, limit * 2); // Removed 100 cap for upgraded SDK tier
  
  // Method 1: Enhanced conversation_id search with proper field expansion
  try {
    console.log(`🔍 Fetching replies for tweet ${tweetId} using conversation_id (Method 1)`);
    
    const replyResults = await client.v2.search(`conversation_id:${tweetId}`, {
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
      console.log(`✅ Method 1 found ${replies.length} potential replies`);
      return formatAndFilterReplies(replies, users, tweetId, limit);
    }
  } catch (error) {
    console.log(`⚠️ Method 1 failed: ${error.message}`);
  }
  
  // Method 2: Search by replies to specific user (if original author provided)
  if (originalTweetAuthor) {
    try {
      console.log(`🔍 Fetching replies using to:${originalTweetAuthor} search (Method 2)`);
      
      const replyResults = await client.v2.search(`to:${originalTweetAuthor} -is:retweet`, {
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
        console.log(`✅ Method 2 found ${conversationReplies.length} conversation replies`);
        return formatAndFilterReplies(conversationReplies, users, tweetId, limit);
      }
    } catch (error) {
      console.log(`⚠️ Method 2 failed: ${error.message}`);
    }
  }
  
  // Method 3: Simplified search without language filter
  try {
    console.log(`🔍 Fetching replies using simplified search (Method 3)`);
    
    const replyResults = await client.v2.search(`conversation_id:${tweetId} -is:retweet`, {
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
      console.log(`✅ Method 3 found ${replies.length} replies`);
      return formatAndFilterReplies(replies, users, tweetId, limit);
    }
  } catch (error) {
    console.log(`⚠️ Method 3 failed: ${error.message}`);
  }
  
  // All methods failed
  console.log(`❌ All reply fetching methods failed for tweet ${tweetId}`);
  return [];
}

// Reusable function to fetch replies for tweets
async function fetchRepliesForTweets(client, tweets, includeMentions) {
  if (!includeMentions || !tweets || tweets.length === 0) {
    return tweets;
  }

  console.log('📱 Fetching replies for tweets...')
  
  // Fetch replies for each tweet (limit to first 5 tweets to avoid rate limits)
  const tweetsToFetchReplies = tweets.slice(0, 5)
  
  for (const tweet of tweetsToFetchReplies) {
    console.log(`🔍 Attempting to fetch replies for tweet ${tweet.id} by @${tweet.author.username}`)
    
    const replies = await fetchTweetReplies(client, tweet.id, 10, tweet.author.username)
    tweet.replies = replies
    
    if (replies.length > 0) {
      console.log(`  ✅ Found ${replies.length} replies for tweet by @${tweet.author.username}`)
    } else {
      console.log(`  ⚠️ No replies found for tweet by @${tweet.author.username}`)
    }
    
    // Add delay between reply fetches to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  return tweets;
}

// Helper method to format and filter replies
function formatAndFilterReplies(replies, users, originalTweetId, limit) {
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
      sentiment: calculateBasicSentiment(reply.text)
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
  
  console.log(`📱 Formatted ${sortedReplies.length} replies (top ${limit})`);
  return sortedReplies;
}

// Hashtag discovery function
async function discoverTopHashtags(client, keyword, language, limit = 5) {
  try {
    console.log(`🔍 Discovering top hashtags for keyword: "${keyword}" with language: ${language || 'en'}`)
    
    // Search tweets with the keyword to find hashtags
    // Build query with language filter if provided
    let searchQuery = `${keyword} -is:retweet`
    if (language && language.trim()) {
      searchQuery += ` lang:${language.trim()}`
    } else {
      searchQuery += ` lang:en` // Default to English
    }
    
    console.log(`🔍 Hashtag discovery query: "${searchQuery}"`)
    
    const searchResults = await client.v2.search(searchQuery, {
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
    })
    
    const tweets = searchResults.data?.data || []
    const users = searchResults.data?.includes?.users || []
    
    if (tweets.length === 0) {
      console.log(`❌ No tweets found for keyword "${keyword}"`)
      return { success: false, hashtags: [] }
    }
    
    // Create user map for follower reach calculation
    const userMap = new Map()
    users.forEach(user => userMap.set(user.id, user))
    
    // Track hashtag metrics
    const hashtagMetrics = {}
    
    tweets.forEach(tweet => {
      const hashtags = tweet.entities?.hashtags || []
      const author = userMap.get(tweet.author_id)
      const tweetEngagement = (tweet.public_metrics?.like_count || 0) + 
                             (tweet.public_metrics?.retweet_count || 0)
      const followerReach = author?.public_metrics?.followers_count || 0
      
      hashtags.forEach(tag => {
        const hashtag = `#${tag.tag}`
        
        if (!hashtagMetrics[hashtag]) {
          hashtagMetrics[hashtag] = {
            hashtag,
            frequency: 0,
            totalEngagement: 0,
            totalReach: 0,
            tweets: []
          }
        }
        
        hashtagMetrics[hashtag].frequency++
        hashtagMetrics[hashtag].totalEngagement += tweetEngagement
        hashtagMetrics[hashtag].totalReach += followerReach
        hashtagMetrics[hashtag].tweets.push({
          id: tweet.id,
          engagement: tweetEngagement,
          reach: followerReach
        })
      })
    })
    
    // Calculate engagement score for each hashtag
    const hashtagScores = Object.values(hashtagMetrics).map(metric => {
      const avgEngagement = metric.totalEngagement / metric.frequency
      const avgReach = metric.totalReach / metric.frequency
      
      // Engagement score formula: combines frequency, engagement, and reach
      const engagementScore = (
        (avgEngagement * 0.4) +           // 40% weight on average engagement
        (metric.frequency * 10 * 0.3) +   // 30% weight on frequency (normalized)
        (avgReach / 1000 * 0.3)           // 30% weight on reach (normalized)
      )
      
      return {
        hashtag: metric.hashtag,
        frequency: metric.frequency,
        avgEngagement: Math.floor(avgEngagement),
        avgReach: Math.floor(avgReach),
        engagementScore: Math.floor(engagementScore),
        topTweet: metric.tweets.sort((a, b) => b.engagement - a.engagement)[0]
      }
    })
    
    // Sort by engagement score and get top hashtags
    const topHashtags = hashtagScores
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, limit)
    
    console.log(`✅ Discovered ${Object.keys(hashtagMetrics).length} unique hashtags`)
    console.log(`📊 Top ${limit} hashtags by engagement:`)
    
    topHashtags.forEach((hashtag, index) => {
      console.log(`  ${index + 1}. ${hashtag.hashtag} - Score: ${hashtag.engagementScore}`)
    })
    
    return {
      success: true,
      keyword,
      totalTweetsAnalyzed: tweets.length,
      totalHashtagsFound: Object.keys(hashtagMetrics).length,
      hashtags: topHashtags.map(h => h.hashtag),
      detailedMetrics: topHashtags
    }
    
  } catch (error) {
    console.error(`❌ Hashtag discovery failed for keyword "${keyword}":`, error)
    return { 
      success: false, 
      hashtags: [],
      error: error.message 
    }
  }
}

// Enhanced mock data generators
function generateMockTweets(query, limit = 10, options = {}) {
  const { language, sortOrder, includeMentions, global } = options;
  const mockSentiments = ['positive', 'negative', 'neutral']
  const mockUsers = [
    { username: 'tech_expert', name: 'Tech Expert', followers: 125000, verified: true },
    { username: 'ai_researcher', name: 'AI Researcher', followers: 89000, verified: true },
    { username: 'startup_founder', name: 'Startup Founder', followers: 45000, verified: false },
    { username: 'developer_pro', name: 'Pro Developer', followers: 32000, verified: false },
    { username: 'data_scientist', name: 'Data Scientist', followers: 67000, verified: true },
    { username: 'tech_blogger', name: 'Tech Blogger', followers: 23000, verified: false },
    { username: 'innovation_hub', name: 'Innovation Hub', followers: 156000, verified: true },
    { username: 'code_guru', name: 'Code Guru', followers: 78000, verified: false },
    { username: 'future_tech', name: 'Future Tech', followers: 94000, verified: true },
    { username: 'digital_nomad', name: 'Digital Nomad', followers: 41000, verified: false }
  ]
  
  const sampleTweets = [
    `Amazing breakthrough in ${query}! This could revolutionize how we approach technology.`,
    `Just tried the new ${query} features and I'm blown away by the capabilities.`,
    `${query} is changing the game for businesses everywhere. The future is here!`,
    `Interesting developments in ${query} space. What do you think about the implications?`,
    `The ${query} technology still has some challenges to overcome, but progress is promising.`,
    `Not convinced about ${query} yet. Seems like there are still major hurdles ahead.`,
    `${query} is overhyped. We need to be more realistic about current limitations.`,
    `Learning more about ${query} every day. The potential applications are endless.`,
    `Great article about ${query} - sharing some key insights from industry leaders.`,
    `Experimenting with ${query} in my latest project. Early results are encouraging!`
  ]
  
  return Array(limit).fill(null).map((_, i) => {
    const user = mockUsers[i % mockUsers.length]
    const sentiment = mockSentiments[i % mockSentiments.length]
    const sentimentScore = sentiment === 'positive' ? 
      0.3 + Math.random() * 0.7 : 
      sentiment === 'negative' ? 
      -0.3 - Math.random() * 0.7 : 
      -0.2 + Math.random() * 0.4
    
    const tweetContent = sampleTweets[i % sampleTweets.length]
    const hashtags = [`#${query.replace(/\s+/g, '')}`, '#tech', '#innovation', '#AI'].slice(0, Math.floor(Math.random() * 3) + 1)
    
    return {
      id: `mock_${Date.now()}_${i}`,
      text: tweetContent,
      created_at: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      author: {
        id: `user_${i}`,
        username: user.username,
        name: user.name,
        verified: user.verified,
        followers: user.followers + Math.floor(Math.random() * 1000),
        profile_image: `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`
      },
      metrics: {
        likes: Math.floor(Math.random() * 500) + 10,
        retweets: Math.floor(Math.random() * 200) + 5,
        replies: Math.floor(Math.random() * 50) + 2,
        quotes: Math.floor(Math.random() * 30),
        views: Math.floor(Math.random() * 5000) + 100
      },
      sentiment: {
        label: sentiment,
        score: Number(sentimentScore.toFixed(2)),
        confidence: Number((Math.random() * 0.4 + 0.6).toFixed(2))
      },
      hashtags,
      url: `https://twitter.com/${user.username}/status/mock_${Date.now()}_${i}`,
      replies: includeMentions ? generateMockReplies(user.username, query, Math.floor(Math.random() * 8) + 2) : []
    }
  })
}

// Generate mock replies for tweets
function generateMockReplies(originalAuthor, query, count = 5) {
  const replyUsers = [
    { username: 'reply_user1', name: 'Tech Enthusiast' },
    { username: 'reply_user2', name: 'Industry Expert' },
    { username: 'reply_user3', name: 'Curious Learner' },
    { username: 'reply_user4', name: 'Developer' },
    { username: 'reply_user5', name: 'Researcher' }
  ]
  
  const replyTemplates = [
    `Great insights about ${query}! I've been following this trend closely.`,
    `Thanks for sharing this @${originalAuthor}. Very valuable perspective.`,
    `Interesting take on ${query}. Have you considered the challenges in implementation?`,
    `@${originalAuthor} This aligns with what we're seeing in our research.`,
    `Could you elaborate more on the ${query} implications?`,
    `Completely agree! ${query} is definitely the future.`,
    `Not sure I'm convinced about ${query} yet. What's your evidence?`,
    `Thanks for the update on ${query}. Keep us posted!`
  ]
  
  return Array(count).fill(null).map((_, i) => {
    const user = replyUsers[i % replyUsers.length]
    const sentiments = ['positive', 'negative', 'neutral']
    const sentiment = sentiments[i % sentiments.length]
    const sentimentScore = sentiment === 'positive' ? 
      0.2 + Math.random() * 0.6 : 
      sentiment === 'negative' ? 
      -0.2 - Math.random() * 0.6 : 
      -0.1 + Math.random() * 0.2
    
    return {
      id: `reply_${Date.now()}_${i}`,
      text: replyTemplates[i % replyTemplates.length],
      created_at: new Date(Date.now() - Math.random() * 2 * 24 * 60 * 60 * 1000).toISOString(),
      author: {
        username: user.username,
        name: user.name
      },
      metrics: {
        likes: Math.floor(Math.random() * 50) + 1,
        retweets: Math.floor(Math.random() * 10),
        replies: Math.floor(Math.random() * 5)
      },
      engagement: Math.floor(Math.random() * 60) + 1,
      sentiment: {
        label: sentiment,
        score: Number(sentimentScore.toFixed(2))
      }
    }
  })
}

// Generate mock hashtag discovery
function generateMockHashtagDiscovery(keyword) {
  const baseHashtags = [
    `#${keyword.replace(/\s+/g, '')}`,
    '#tech',
    '#innovation',
    '#AI',
    '#future',
    '#digital',
    '#technology',
    '#startup',
    '#business',
    '#trending'
  ]
  
  // Add keyword-specific hashtags
  const keywordLower = keyword.toLowerCase()
  if (keywordLower.includes('ai') || keywordLower.includes('artificial')) {
    baseHashtags.push('#MachineLearning', '#DeepLearning', '#ArtificialIntelligence')
  }
  if (keywordLower.includes('crypto') || keywordLower.includes('bitcoin')) {
    baseHashtags.push('#blockchain', '#bitcoin', '#cryptocurrency', '#DeFi')
  }
  if (keywordLower.includes('web') || keywordLower.includes('dev')) {
    baseHashtags.push('#webdev', '#javascript', '#coding', '#programming')
  }
  
  // Return top 5 hashtags
  return baseHashtags
    .filter((tag, index, self) => self.indexOf(tag) === index) // Remove duplicates
    .slice(0, 5)
}

function generateMockAnalytics(tweets, query, includeMentions = false) {
  if (tweets.length === 0) {
    return {
      total_tweets: 0,
      avg_sentiment: 0,
      sentiment_distribution: { positive: 0, negative: 0, neutral: 0 },
      top_hashtags: [],
      engagement_stats: { avg_likes: 0, avg_retweets: 0, total_engagement: 0 },
      top_influencers: []
    }
  }
  
  // Sentiment distribution
  const sentimentCounts = tweets.reduce((acc, tweet) => {
    acc[tweet.sentiment.label]++
    return acc
  }, { positive: 0, negative: 0, neutral: 0 })
  
  // Average sentiment
  const avgSentiment = tweets.reduce((sum, tweet) => sum + tweet.sentiment.score, 0) / tweets.length
  
  // Top hashtags
  const hashtagCounts = {}
  tweets.forEach(tweet => {
    tweet.hashtags.forEach(tag => {
      hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1
    })
  })
  
  const topHashtags = Object.entries(hashtagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tag]) => tag)
  
  // Engagement stats
  const totalLikes = tweets.reduce((sum, tweet) => sum + tweet.metrics.likes, 0)
  const totalRetweets = tweets.reduce((sum, tweet) => sum + tweet.metrics.retweets, 0)
  const totalReplies = tweets.reduce((sum, tweet) => sum + tweet.metrics.replies, 0)
  
  // Top influencers (by follower count)
  const topInfluencers = tweets
    .sort((a, b) => b.author.followers - a.author.followers)
    .slice(0, 5)
    .map(tweet => ({
      username: tweet.author.username,
      name: tweet.author.name,
      followers: tweet.author.followers,
      verified: tweet.author.verified
    }))
  
  // Reply analytics (if mentions enabled)
  let replyAnalytics = {}
  if (includeMentions) {
    const allReplies = tweets.flatMap(tweet => tweet.replies || [])
    const totalRepliesCount = allReplies.length
    
    if (totalRepliesCount > 0) {
      const avgReplySentiment = allReplies.reduce((sum, reply) => sum + reply.sentiment.score, 0) / totalRepliesCount
      const replyEngagement = allReplies.reduce((sum, reply) => sum + reply.engagement, 0)
      
      const replySentimentCounts = allReplies.reduce((acc, reply) => {
        acc[reply.sentiment.label]++
        return acc
      }, { positive: 0, negative: 0, neutral: 0 })
      
      replyAnalytics = {
        total_replies: totalRepliesCount,
        avg_reply_sentiment: Number(avgReplySentiment.toFixed(2)),
        reply_sentiment_distribution: replySentimentCounts,
        avg_reply_engagement: Math.floor(replyEngagement / totalRepliesCount),
        top_reply_authors: allReplies
          .sort((a, b) => b.engagement - a.engagement)
          .slice(0, 5)
          .map(reply => ({
            username: reply.author.username,
            name: reply.author.name,
            engagement: reply.engagement
          }))
      }
    }
  }

  return {
    total_tweets: tweets.length,
    avg_sentiment: Number(avgSentiment.toFixed(2)),
    sentiment_distribution: sentimentCounts,
    top_hashtags: topHashtags,
    engagement_stats: {
      avg_likes: Math.floor(totalLikes / tweets.length),
      avg_retweets: Math.floor(totalRetweets / tweets.length),
      total_engagement: totalLikes + totalRetweets + totalReplies
    },
    top_influencers: topInfluencers,
    ...(includeMentions && { reply_analytics: replyAnalytics })
  }
}

// Note: Twitter search history now handled client-side

// REMOVED DUPLICATE YOUTUBE ENDPOINT - Only one YouTube endpoint at line 111

// News Analytics Endpoint (Full Feature Parity with Production)
app.post('/api/news-analytics', async (req, res) => {
  try {
    console.log('\n📰 === NEWS ANALYTICS START ===')
    console.log('🔍 Request body:', JSON.stringify(req.body, null, 2))
    
    const { 
      mode = 'serp', // 'serp' or 'url'
      input, // URLs for URL mode
      urls, // URLs array for SERP mode
      searchId, // Search ID for SERP mode
      context = null
    } = req.body
    
    // Validate required parameters based on mode
    if (mode === 'serp' && (!urls || urls.length === 0)) {
      console.error('❌ Missing urls parameter for SERP mode')
      return res.status(400).json({
        error: 'Missing required parameter: urls',
        message: 'Please provide URLs array for SERP mode'
      })
    }
    
    if (mode === 'url' && !input) {
      console.error('❌ Missing input parameter for URL mode')
      return res.status(400).json({
        error: 'Missing required parameter: input',
        message: 'Please provide URLs for URL mode'
      })
    }
    
    // Validate mode
    if (!['serp', 'url'].includes(mode)) {
      console.error('❌ Invalid mode:', mode)
      return res.status(400).json({
        error: 'Invalid mode',
        message: 'Mode must be either "serp" or "url"'
      })
    }
    
    const urlsToProcess = mode === 'serp' ? urls : (input ? input.split(',') : [])
    console.log(`📊 Processing ${mode} analysis for ${urlsToProcess.length} URLs`)
    
    // Execute Python script
    const { spawn } = await import('child_process')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const fs = await import('fs')
    
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    
    const scriptPath = path.join(__dirname, '..', 'web_search')
    // Always use url_sentiment_analyzer.py since we're passing URLs directly
    const scriptName = 'url_sentiment_analyzer.py'
    const fullScriptPath = path.join(scriptPath, scriptName)
    
    // Build command arguments
    // For both modes, we're now passing URLs directly
    const urlsToAnalyze = mode === 'serp' ? urls.join(',') : input
    const args = [fullScriptPath, urlsToAnalyze]
    
    if (context) {
      args.push(context)
    }
    
    console.log(`🐍 Executing Python script: ${scriptName}`)
    console.log(`📝 Arguments:`, args)
    
    // Execute Python script
    const pythonProcess = spawn('python3', args, {
      env: {
        ...process.env,
        PYTHONPATH: scriptPath,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    })
    
    let stdout = ''
    let stderr = ''
    
    // Capture stdout
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    // Capture stderr
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    // Wait for process to complete
    const result = await new Promise((resolve, reject) => {
      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script exited with code ${code}: ${stderr}`))
        } else {
          // Try to extract JSON from stdout
          try {
            // Look for the output file path in stdout
            const outputMatch = stdout.match(/Full results saved to: (.+\.json)/)
            if (outputMatch) {
              const outputFile = outputMatch[1]
              console.log(`📁 Output file: ${outputFile}`)
              
              // Read the JSON file
              const fileContent = fs.readFileSync(outputFile, 'utf8')
              const jsonResult = JSON.parse(fileContent)
              
              resolve({
                success: true,
                mode,
                input: mode === 'serp' ? urls.join(',') : input,
                searchId: searchId || null,
                context,
                data: jsonResult,
                outputFile
              })
            } else {
              // If no file output, try to parse relevant info from stdout
              const sentimentMatch = stdout.match(/OVERALL SENTIMENT DISTRIBUTION:([\s\S]+?)(?=\n\n|\n📁)/)
              const summaryMatch = stdout.match(/OVERALL SUMMARY:\n([\s\S]+?)(?=\n\n|\n🎯)/)
              const findingsMatch = stdout.match(/KEY FINDINGS:\n([\s\S]+?)(?=\n\n|\n📋)/)
              const executiveMatch = stdout.match(/EXECUTIVE SUMMARY:\n([\s\S]+?)(?=\n\n|\n=|$)/)
              
              resolve({
                success: true,
                mode,
                input: mode === 'serp' ? urls.join(',') : input,
                searchId: searchId || null,
                context,
                data: {
                  sentiment_text: sentimentMatch ? sentimentMatch[1].trim() : '',
                  overall_summary: summaryMatch ? summaryMatch[1].trim() : '',
                  key_findings_text: findingsMatch ? findingsMatch[1].trim() : '',
                  executive_summary: executiveMatch ? executiveMatch[1].trim() : '',
                  raw_output: stdout
                }
              })
            }
          } catch (parseError) {
            console.error('❌ Error parsing Python output:', parseError)
            resolve({
              success: false,
              error: 'Failed to parse Python output',
              stdout,
              stderr
            })
          }
        }
      })
      
      pythonProcess.on('error', (error) => {
        reject(error)
      })
    })
    
    console.log('✅ News analysis completed successfully')
    return res.json(result)
    
  } catch (error) {
    console.error('❌ News Analytics API Error:', error)
    
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// ============================================================
// SOCIAL LISTENING API (Dual Environment - matches /api/social-listening.js)
// Instagram + TikTok Monitoring with Job Queue Pattern
// ============================================================

app.post('/api/social-listening', async (req, res) => {
  console.log('\n📱 Social Listening API Request:', req.body.action)

  try {
    const { action } = req.body

    if (!action) {
      return res.status(400).json({
        error: 'Missing action parameter',
        message: 'Please specify an action'
      })
    }

    // Initialize Supabase client
    if (!supabase) {
      return res.status(500).json({
        error: 'Database not configured',
        message: 'Supabase client not initialized'
      })
    }

    // Route to appropriate handler (same logic as serverless function)
    switch (action) {
      // Campaign Management
      case 'create-campaign':
        return await handleCreateCampaign(supabase, req, res)
      case 'update-campaign':
        return await handleUpdateCampaign(supabase, req, res)
      case 'get-campaign':
        return await handleGetCampaign(supabase, req, res)
      case 'list-campaigns':
        return await handleListCampaigns(supabase, req, res)
      case 'delete-campaign':
        return await handleDeleteCampaign(supabase, req, res)

      // Job Management (Manual Trigger)
      case 'start-scrape':
        return await handleStartScrapeJob(supabase, req, res)
      case 'process-jobs':
        return await handleProcessJobs(supabase, req, res)
      case 'get-job-status':
        return await handleGetJobStatus(supabase, req, res)
      case 'list-jobs':
        return await handleListJobs(supabase, req, res)
      case 'cancel-job':
        return await handleCancelJob(supabase, req, res)

      // Data Retrieval
      case 'get-mentions':
        return await handleGetMentions(supabase, req, res)
      case 'get-mention-details':
        return await handleGetMentionDetails(supabase, req, res)
      case 'get-trends':
        return await handleGetTrends(supabase, req, res)
      case 'get-influencers':
        return await handleGetInfluencers(supabase, req, res)
      case 'get-alerts':
        return await handleGetAlerts(supabase, req, res)
      case 'get-daily-stats':
        return await handleGetDailyStats(supabase, req, res)

      // Alert Management
      case 'mark-alert-read':
        return await handleMarkAlertRead(supabase, req, res)
      case 'dismiss-alert':
        return await handleDismissAlert(supabase, req, res)

      // Analytics
      case 'run-analytics':
        return await handleRunAnalytics(supabase, req, res)
      case 'get-analytics-summary':
        return await handleGetAnalyticsSummary(supabase, req, res)

      // Testing & Debugging
      case 'test-scraper':
        return await handleTestScraper(req, res)

      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: `Action "${action}" is not supported`
        })
    }
  } catch (error) {
    console.error('❌ Social Listening API Error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// GET route for social listening (for status checks and data retrieval)
app.get('/api/social-listening', async (req, res) => {
  // Return error - campaigns not implemented yet
  return res.status(500).json({
    error: 'Campaign feature not implemented',
    message: 'Database schema not set up. Use test-scraper for now.'
  })
})

// Campaign Management Handlers
async function handleCreateCampaign(supabase, req, res) {
  const { user_id, name, description, brand_mentions, keywords, hashtags, competitors, platforms, instagram_config, tiktok_config, relevance_context, alert_config } = req.body

  if (!user_id || !name) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'user_id and name are required'
    })
  }

  const { data, error } = await supabase
    .from('social_listening.campaigns')
    .insert([{
      user_id,
      name,
      description,
      brand_mentions: brand_mentions || [],
      keywords: keywords || [],
      hashtags: hashtags || [],
      competitors: competitors || [],
      platforms: platforms || { instagram: true, tiktok: true },
      instagram_config: instagram_config || {
        track_stories: true,
        track_reels: true,
        monitor_profiles: [],
        hashtags: [],
        max_posts_per_scrape: 200
      },
      tiktok_config: tiktok_config || {
        track_sounds: false,
        monitor_profiles: [],
        hashtags: [],
        query_terms: [],
        max_videos_per_scrape: 100
      },
      relevance_context,
      alert_config: alert_config || {
        sentiment_threshold: -0.3,
        volume_spike_multiplier: 2.5,
        enable_email: true,
        enable_slack: false,
        influencer_follower_threshold: 10000
      }
    }])
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    campaign: data,
    message: 'Campaign created successfully'
  })
}

async function handleUpdateCampaign(supabase, req, res) {
  const { campaign_id, ...updates } = req.body

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', campaign_id)
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    campaign: data,
    message: 'Campaign updated successfully'
  })
}

async function handleGetCampaign(supabase, req, res) {
  const { campaign_id } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single()

  if (error) {
    return res.status(404).json({ error: 'Campaign not found', message: error.message })
  }

  return res.status(200).json({
    success: true,
    campaign: data
  })
}

async function handleListCampaigns(supabase, req, res) {
  const { user_id, active_only = 'true' } = req.query

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' })
  }

  let query = supabase
    .from('social_listening.campaigns')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })

  if (active_only === 'true') {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    campaigns: data,
    total: data.length
  })
}

async function handleDeleteCampaign(supabase, req, res) {
  const { campaign_id } = req.body

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  const { error } = await supabase
    .from('social_listening.campaigns')
    .delete()
    .eq('id', campaign_id)

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    message: 'Campaign deleted successfully'
  })
}

// Job Management Handlers
async function handleStartScrapeJob(supabase, req, res) {
  const { campaign_id, user_id, platforms, job_type = 'full_scrape', parameters = {} } = req.body

  if (!campaign_id || !user_id) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'campaign_id and user_id are required'
    })
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('social_listening.campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single()

  if (campaignError || !campaign) {
    return res.status(404).json({ error: 'Campaign not found' })
  }

  const platformsToScrape = platforms || []
  if (platformsToScrape.length === 0) {
    if (campaign.platforms.instagram) platformsToScrape.push('instagram')
    if (campaign.platforms.tiktok) platformsToScrape.push('tiktok')
  }

  const { data: job, error: jobError } = await supabase
    .from('social_listening.scrape_jobs')
    .insert([{
      campaign_id,
      user_id,
      job_type,
      platforms: platformsToScrape,
      parameters,
      status: 'queued',
      progress: {
        current: 0,
        total: 0,
        message: 'Job queued, waiting to start...'
      }
    }])
    .select()
    .single()

  if (jobError) {
    return res.status(500).json({ error: 'Failed to create job', message: jobError.message })
  }

  return res.status(200).json({
    success: true,
    job,
    message: 'Scrape job created successfully',
    note: 'Job is queued. Use get-job-status to check progress or call process-jobs to trigger processing.'
  })
}

async function handleProcessJobs(supabase, req, res) {
  try {
    // Import job worker (dynamic import)
    const { SocialListeningJobWorker } = await import('../src/utils/socialListening/workers/jobWorker.js')

    // Get environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const apifyToken = process.env.APIFY_API_TOKEN

    if (!apifyToken) {
      return res.status(500).json({
        error: 'Missing APIFY_API_TOKEN',
        message: 'Instagram scraping requires Apify API token to be configured'
      })
    }

    // Create worker
    const worker = new SocialListeningJobWorker({
      supabaseUrl,
      supabaseKey,
      apifyToken
    })

    // Process queued jobs
    await worker.processQueuedJobs()

    return res.status(200).json({
      success: true,
      message: 'Job processing triggered successfully'
    })

  } catch (error) {
    console.error('❌ Error processing jobs:', error)
    return res.status(500).json({
      error: 'Job processing failed',
      message: error.message
    })
  }
}

async function handleGetJobStatus(supabase, req, res) {
  const { job_id } = req.query

  if (!job_id) {
    return res.status(400).json({ error: 'Missing job_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.scrape_jobs')
    .select('*')
    .eq('id', job_id)
    .single()

  if (error) {
    return res.status(404).json({ error: 'Job not found', message: error.message })
  }

  return res.status(200).json({
    success: true,
    job: data
  })
}

async function handleListJobs(supabase, req, res) {
  const { campaign_id, user_id, status, limit = 50 } = req.query

  let query = supabase
    .from('social_listening.scrape_jobs')
    .select('*')
    .order('queued_at', { ascending: false })
    .limit(parseInt(limit))

  if (campaign_id) query = query.eq('campaign_id', campaign_id)
  if (user_id) query = query.eq('user_id', user_id)
  if (status) query = query.eq('status', status)

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    jobs: data,
    total: data.length
  })
}

async function handleCancelJob(supabase, req, res) {
  const { job_id } = req.body

  if (!job_id) {
    return res.status(400).json({ error: 'Missing job_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.scrape_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString()
    })
    .eq('id', job_id)
    .eq('status', 'queued')
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Failed to cancel job', message: error.message })
  }

  if (!data) {
    return res.status(400).json({ error: 'Job cannot be cancelled (already running or completed)' })
  }

  return res.status(200).json({
    success: true,
    job: data,
    message: 'Job cancelled successfully'
  })
}

// Data Retrieval Handlers
async function handleGetMentions(supabase, req, res) {
  const { campaign_id, platform, is_relevant, limit = 100, offset = 0, sort_by = 'published_at', order = 'desc' } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.mentions')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order(sort_by, { ascending: order === 'asc' })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

  if (platform) query = query.eq('platform', platform)
  if (is_relevant !== undefined) query = query.eq('is_relevant', is_relevant === 'true')

  const { data, error, count } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    mentions: data,
    total: count,
    limit: parseInt(limit),
    offset: parseInt(offset)
  })
}

async function handleGetMentionDetails(supabase, req, res) {
  const { mention_id } = req.query

  if (!mention_id) {
    return res.status(400).json({ error: 'Missing mention_id' })
  }

  const { data: mention, error: mentionError } = await supabase
    .from('social_listening.mentions')
    .select('*')
    .eq('id', mention_id)
    .single()

  if (mentionError) {
    return res.status(404).json({ error: 'Mention not found', message: mentionError.message })
  }

  const { data: comments, error: commentsError } = await supabase
    .from('social_listening.comments')
    .select('*')
    .eq('mention_id', mention_id)
    .order('created_at', { ascending: false })

  return res.status(200).json({
    success: true,
    mention,
    comments: commentsError ? [] : comments
  })
}

async function handleGetTrends(supabase, req, res) {
  const { campaign_id, platform, is_active = 'true', limit = 20 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.trends')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order('trend_score', { ascending: false })
    .limit(parseInt(limit))

  if (platform) query = query.eq('platform', platform)
  if (is_active === 'true') query = query.eq('is_active', true)

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    trends: data,
    total: data.length
  })
}

async function handleGetInfluencers(supabase, req, res) {
  const { campaign_id, platform, tier, limit = 20 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.influencers')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order('overall_score', { ascending: false })
    .limit(parseInt(limit))

  if (platform) query = query.eq('platform', platform)
  if (tier) query = query.eq('tier', tier)

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    influencers: data,
    total: data.length
  })
}

async function handleGetAlerts(supabase, req, res) {
  const { campaign_id, is_read = 'false', severity, limit = 50 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.alerts')
    .select('*')
    .eq('campaign_id', campaign_id)
    .eq('dismissed', false)
    .order('created_at', { ascending: false })
    .limit(parseInt(limit))

  if (is_read !== 'all') query = query.eq('is_read', is_read === 'true')
  if (severity) query = query.eq('severity', severity)

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    alerts: data,
    total: data.length
  })
}

async function handleGetDailyStats(supabase, req, res) {
  const { campaign_id, start_date, end_date, limit = 30 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.daily_stats')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order('date', { ascending: false })
    .limit(parseInt(limit))

  if (start_date) query = query.gte('date', start_date)
  if (end_date) query = query.lte('date', end_date)

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    stats: data,
    total: data.length
  })
}

// Alert Management Handlers
async function handleMarkAlertRead(supabase, req, res) {
  const { alert_id } = req.body

  if (!alert_id) {
    return res.status(400).json({ error: 'Missing alert_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.alerts')
    .update({ is_read: true })
    .eq('id', alert_id)
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    alert: data,
    message: 'Alert marked as read'
  })
}

async function handleDismissAlert(supabase, req, res) {
  const { alert_id } = req.body

  if (!alert_id) {
    return res.status(400).json({ error: 'Missing alert_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.alerts')
    .update({ dismissed: true })
    .eq('id', alert_id)
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    alert: data,
    message: 'Alert dismissed'
  })
}

// Analytics Handlers
async function handleRunAnalytics(supabase, req, res) {
  const { campaign_id } = req.body

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  try {
    console.log(`\n📊 Running analytics for campaign ${campaign_id.slice(0, 8)}...`)

    // Import analytics worker
    const { AnalyticsWorker } = await import('../src/utils/socialListening/workers/analyticsWorker.js')

    // Get environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Create worker
    const worker = new AnalyticsWorker({
      supabaseUrl,
      supabaseKey
    })

    // Run analytics
    const result = await worker.runAnalytics(campaign_id)

    console.log(`✅ Analytics complete: ${result.success ? 'Success' : 'Failed with errors'}`)

    return res.status(200).json({
      success: true,
      analytics: result
    })

  } catch (error) {
    console.error('❌ Error running analytics:', error)
    return res.status(500).json({
      error: 'Analytics processing failed',
      message: error.message
    })
  }
}

async function handleGetAnalyticsSummary(supabase, req, res) {
  const { campaign_id, days = 7 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  try {
    console.log(`\n📊 Getting analytics summary for campaign ${campaign_id.slice(0, 8)}...`)

    // Import analytics worker
    const { AnalyticsWorker } = await import('../src/utils/socialListening/workers/analyticsWorker.js')

    // Get environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Create worker
    const worker = new AnalyticsWorker({
      supabaseUrl,
      supabaseKey
    })

    // Get summary
    const summary = await worker.getAnalyticsSummary(campaign_id, parseInt(days))

    console.log(`✅ Analytics summary retrieved`)

    return res.status(200).json({
      success: true,
      summary
    })

  } catch (error) {
    console.error('❌ Error getting analytics summary:', error)
    return res.status(500).json({
      error: 'Failed to get analytics summary',
      message: error.message
    })
  }
}

// Test Scraper Handler - Returns raw JSON from scrapers (NO MOCK DATA)
// Optional TikTok parameters: includeComments, maxCommentsPerVideo
async function handleTestScraper(req, res) {
  const {
    platform,
    query,
    limit = 10,
    includeComments = false,
    maxCommentsPerVideo = 20
  } = req.body

  if (!platform || !query) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'platform and query are required'
    })
  }

  // Validate comment parameters
  if (includeComments && (maxCommentsPerVideo < 1 || maxCommentsPerVideo > 100)) {
    return res.status(400).json({
      error: 'Invalid parameter',
      message: 'maxCommentsPerVideo must be between 1 and 100'
    })
  }

  try {
    console.log(`🧪 Testing ${platform} scraper with query: ${query}`)
    if (includeComments && platform === 'tiktok') {
      console.log(`   Including comments (max ${maxCommentsPerVideo} per video)`)
    }

    let results

    // Use real scrapers (NO MOCK DATA)
    if (platform === 'instagram') {
      // Check if Apify token is available for Instagram
      if (!process.env.APIFY_API_TOKEN) {
        return res.status(500).json({
          error: 'Configuration error',
          message: 'APIFY_API_TOKEN not configured. Instagram scraping requires Apify API token.'
        })
      }

      const { scrapeInstagram } = await import('../src/utils/socialListening/scrapers/instagram.js')
      results = await scrapeInstagram({
        searchQueries: [query],
        maxPostsPerQuery: parseInt(limit),
        apifyToken: process.env.APIFY_API_TOKEN
      })
    } else if (platform === 'tiktok') {
      const { scrapeTikTok } = await import('../src/utils/socialListening/scrapers/tiktok.js')
      results = await scrapeTikTok({
        searchQueries: [query],
        maxVideosPerQuery: parseInt(limit),
        includeComments,
        maxCommentsPerVideo: parseInt(maxCommentsPerVideo)
      })
    } else {
      return res.status(400).json({
        error: 'Invalid platform',
        message: 'Platform must be "instagram" or "tiktok"'
      })
    }

    console.log(`✅ Scraper test completed: ${results.length} results`)

    return res.status(200).json({
      success: true,
      platform,
      query,
      count: results.length,
      data: results,
      sample: results.length > 0 ? results[0] : null
    })

  } catch (error) {
    console.error('❌ Error testing scraper:', error)
    return res.status(500).json({
      error: 'Scraper test failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' })
})

// ============================================
// SOCIAL SCRAPING - JSON-FIRST APPROACH
// TikTok & Instagram Profile/Hashtag/Keyword Scraping
// ============================================

// ============================================
// APIFY INTEGRATION - Core Functions
// ============================================

/**
 * Get configured Apify client
 * @returns {Promise<ApifyClient>} Configured Apify client instance
 */
async function getApifyClient() {
  const { ApifyClient } = await import('apify-client');
  const token = process.env.APIFY_API_TOKEN;

  if (!token) {
    throw new Error('APIFY_API_TOKEN not found in environment variables');
  }

  return new ApifyClient({ token });
}

/**
 * Run an Apify actor and return results
 * @param {string} actorId - Apify actor ID (e.g., "clockworks/tiktok-scraper")
 * @param {object} input - Actor input parameters
 * @param {object} options - Additional options (timeout, memory, etc.)
 * @returns {Promise<Array>} Array of result items from the actor's dataset
 */
async function runApifyActor(actorId, input, options = {}) {
  console.log(`\n🤖 Starting Apify Actor: ${actorId}`);
  console.log(`📥 Input:`, JSON.stringify(input, null, 2));

  try {
    const client = await getApifyClient();

    // Default options
    const runOptions = {
      waitSecs: options.waitSecs || 300, // 5 minutes default timeout
      ...options
    };

    // Start the actor run and wait for completion
    console.log(`⏳ Running actor (max wait: ${runOptions.waitSecs}s)...`);
    const run = await client.actor(actorId).call(input, runOptions);

    console.log(`✅ Actor completed: ${run.status}`);
    console.log(`📊 Dataset ID: ${run.defaultDatasetId}`);

    // Fetch results from the default dataset
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    console.log(`📦 Retrieved ${items.length} items from dataset`);

    return items;
  } catch (error) {
    console.error(`❌ Apify actor error:`, error.message);
    throw new Error(`Apify actor failed: ${error.message}`);
  }
}

/**
 * Transform Apify output to our standard format
 * @param {Array} apifyData - Raw data from Apify actor
 * @param {string} scrapeType - Type of scrape: "profile", "hashtag", "keyword", "comments"
 * @param {string} target - The target (username, hashtag, or keyword)
 * @returns {object} Transformed data in our standard format
 */
function transformApifyToOurFormat(apifyData, scrapeType, target) {
  console.log(`\n🔄 Transforming Apify data (type: ${scrapeType}, target: ${target})`);

  const videos = apifyData.map((item, index) => {
    // Map Apify fields to our schema
    // Apify TikTok scraper returns fields like: id, text, authorMeta, videoMeta, diggCount, shareCount, playCount, commentCount, etc.
    try {
      return {
        video_id: item.id || item.videoId || `unknown_${index}`,
        description: item.text || item.description || '',
        author: {
          username: item.authorMeta?.name || item.author?.uniqueId || 'unknown',
          nickname: item.authorMeta?.nickName || item.author?.nickname || '',
          verified: item.authorMeta?.verified || item.author?.verified || false,
          follower_count: item.authorMeta?.fans || item.author?.followerCount || 0
        },
        stats: {
          play_count: item.playCount || item.videoMeta?.playCount || 0,
          like_count: item.diggCount || item.stats?.diggCount || 0,
          comment_count: item.commentCount || item.stats?.commentCount || 0,
          share_count: item.shareCount || item.stats?.shareCount || 0
        },
        create_time: item.createTime || item.createTimeISO || new Date().toISOString(),
        video_url: item.webVideoUrl || item.videoUrl || `https://www.tiktok.com/@${item.authorMeta?.name}/video/${item.id}`,
        hashtags: item.hashtags || item.challenges?.map(c => c.title) || [],
        music: {
          title: item.musicMeta?.musicName || item.music?.title || '',
          author: item.musicMeta?.musicAuthor || item.music?.authorName || ''
        }
      };
    } catch (error) {
      console.warn(`⚠️ Error transforming item ${index}:`, error.message);
      return null;
    }
  }).filter(v => v !== null);

  console.log(`✅ Transformed ${videos.length} videos successfully`);

  return {
    platform: 'TikTok',
    scrape_type: scrapeType,
    target: target,
    scraped_at: new Date().toISOString(),
    video_count: videos.length,
    videos: videos
  };
}

// ============================================
// APIFY-BASED SCRAPERS (Primary Implementation)
// ============================================

/**
 * Apify TikTok Hashtag Scraper
 * Uses clockworks/tiktok-scraper actor for hashtag scraping
 * @param {string} hashtag - Hashtag to scrape (with or without #)
 * @param {number} maxVideos - Maximum number of videos to fetch
 * @returns {Promise<object>} Formatted scraping results
 */
async function apifyScrapeTikTokHashtag(hashtag, maxVideos = 50) {
  console.log(`\n#️⃣ Apify TikTok Hashtag Scraping Started`);
  console.log(`🏷️ Hashtag: ${hashtag}`);
  console.log(`📊 Max Videos: ${maxVideos}`);

  // Ensure hashtag starts with #
  const formattedHashtag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;

  try {
    const apifyInput = {
      hashtags: [formattedHashtag],
      resultsPerPage: Math.min(maxVideos, 100), // Apify actor limit
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false
    };

    // Run the Apify actor
    const items = await runApifyActor('clockworks/tiktok-scraper', apifyInput, {
      waitSecs: 180 // 3 minutes timeout for hashtag scraping
    });

    // Transform to our format
    const result = transformApifyToOurFormat(items, 'hashtag', formattedHashtag);

    console.log(`✅ Hashtag scraping completed: ${result.video_count} videos`);

    return result;
  } catch (error) {
    console.error(`❌ Apify hashtag scraping failed:`, error.message);
    throw error;
  }
}

/**
 * Apify TikTok Keyword Scraper
 * Uses clockworks/tiktok-scraper actor for keyword/search scraping
 * @param {string} keyword - Search keyword
 * @param {number} maxVideos - Maximum number of videos to fetch
 * @returns {Promise<object>} Formatted scraping results
 */
async function apifyScrapeTikTokKeyword(keyword, maxVideos = 50) {
  console.log(`\n🔍 Apify TikTok Keyword Scraping Started`);
  console.log(`🔑 Keyword: ${keyword}`);
  console.log(`📊 Max Videos: ${maxVideos}`);

  try {
    const apifyInput = {
      searchQueries: [keyword],
      resultsPerPage: Math.min(maxVideos, 100), // Apify actor limit
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false
    };

    // Run the Apify actor
    const items = await runApifyActor('clockworks/tiktok-scraper', apifyInput, {
      waitSecs: 180 // 3 minutes timeout for keyword scraping
    });

    // Transform to our format
    const result = transformApifyToOurFormat(items, 'keyword', keyword);

    console.log(`✅ Keyword scraping completed: ${result.video_count} videos`);

    return result;
  } catch (error) {
    console.error(`❌ Apify keyword scraping failed:`, error.message);
    throw error;
  }
}

/**
 * Apify TikTok Profile Scraper
 * Uses clockworks/tiktok-scraper actor for profile scraping
 * @param {string} profileUrl - Full TikTok profile URL (e.g., https://tiktok.com/@username)
 * @param {number} maxVideos - Maximum number of videos to fetch
 * @returns {Promise<object>} Formatted scraping results
 */
async function apifyScrapeTikTokProfile(profileUrl, maxVideos = 50) {
  console.log(`\n👤 Apify TikTok Profile Scraping Started`);
  console.log(`🔗 Profile URL: ${profileUrl}`);
  console.log(`📊 Max Videos: ${maxVideos}`);

  try {
    const apifyInput = {
      profileURLs: [profileUrl],
      resultsPerPage: Math.min(maxVideos, 100), // Apify actor limit
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false
    };

    // Run the Apify actor
    const items = await runApifyActor('clockworks/tiktok-scraper', apifyInput, {
      waitSecs: 180 // 3 minutes timeout for profile scraping
    });

    // Transform to our format
    const result = transformApifyToOurFormat(items, 'profile', profileUrl);

    console.log(`✅ Profile scraping completed: ${result.video_count} videos`);

    return result;
  } catch (error) {
    console.error(`❌ Apify profile scraping failed:`, error.message);
    throw error;
  }
}

/**
 * Helper: Chunk array into smaller batches
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array} Array of chunks
 */
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Helper: Extract video URL from video object
 * @param {Object} video - Video object
 * @returns {string|null} Video URL or null
 */
function extractVideoUrl(video) {
  return video.video_url || video.webVideoUrl || video.url || null;
}

/**
 * Apify TikTok Comments Enrichment (Refactored)
 * Enriches ALL video objects with comments using batch processing
 * @param {Array} videos - Array of video objects to enrich
 * @returns {Promise<Array>} Videos enriched with comments
 */
async function apifyEnrichWithComments(videos) {
  console.log(`\n💬 Apify TikTok Comments Enrichment Started`);
  console.log(`📊 Total videos to process: ${videos.length}`);

  // Configuration (no feature flags - always enabled)
  const batchSize = parseInt(process.env.COMMENTS_BATCH_SIZE) || 50;
  const maxComments = parseInt(process.env.MAX_COMMENTS_PER_VIDEO) || 20;

  console.log(`📋 Config: Batch size ${batchSize}, max ${maxComments} comments per video`);

  if (videos.length === 0) {
    console.log(`⚠️  No videos to enrich`);
    return videos;
  }

  try {
    // Extract video URLs from ALL videos
    const videoUrls = videos.map(extractVideoUrl).filter(url => url);

    if (videoUrls.length === 0) {
      console.log(`⚠️  No valid video URLs found for comment enrichment`);
      return videos.map(v => ({ ...v, comments: [] }));
    }

    // Split videos into batches
    const videoBatches = chunkArray(videos, batchSize);
    console.log(`📦 Processing ${videoBatches.length} batches of up to ${batchSize} videos each`);

    let allEnrichedVideos = [];
    let totalEnriched = 0;

    // Process each batch sequentially
    for (let i = 0; i < videoBatches.length; i++) {
      const batch = videoBatches[i];
      const batchUrls = batch.map(extractVideoUrl).filter(url => url);

      console.log(`\n🔄 Processing batch ${i + 1}/${videoBatches.length} (${batchUrls.length} videos)...`);

      try {
        // Actor input for this batch
        const apifyInput = {
          postURLs: batchUrls,
          maxComments: maxComments,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false
        };

        console.log(`🤖 Running clockworks/tiktok-comments-scraper actor...`);

        // Run the dedicated comments scraper actor
        const commentsData = await runApifyActor('clockworks/tiktok-comments-scraper', apifyInput, {
          waitSecs: 240 // 4 minutes timeout
        });

        console.log(`✅ Retrieved ${commentsData.length} items from actor`);

        // Group individual comments by video URL
        // (Apify returns each comment as a separate item, not nested arrays)
        const commentsMap = new Map();
        commentsData.forEach(item => {
          // Get video URL from Apify's response
          const videoUrl = item.videoWebUrl || item.submittedVideoUrl || item.input;

          if (videoUrl && item.text) {
            // Initialize array if this is the first comment for this video
            if (!commentsMap.has(videoUrl)) {
              commentsMap.set(videoUrl, []);
            }

            // Add this comment to the video's comments array
            const comments = commentsMap.get(videoUrl);
            if (comments.length < maxComments) {
              comments.push({
                id: item.cid,
                text: item.text,
                author: {
                  username: item.uniqueId || 'unknown',
                  nickname: item.uniqueId || ''
                },
                like_count: item.diggCount || 0,
                created_at: item.createTimeISO || item.createTime || ''
              });
            }
          }
        });

        console.log(`📊 Grouped comments: ${commentsMap.size} videos have comments`);

        // Enrich this batch of videos with comments
        const enrichedBatch = batch.map(video => {
          const videoUrl = extractVideoUrl(video);
          const comments = commentsMap.get(videoUrl);

          if (comments && comments.length > 0) {
            totalEnriched++;
            return {
              ...video,
              comments: comments  // Comments are already formatted correctly
            };
          }

          // Video without comments
          return { ...video, comments: [] };
        });

        allEnrichedVideos.push(...enrichedBatch);

        console.log(`✅ Batch ${i + 1} completed: ${commentsMap.size} videos enriched`);

        // Add delay between batches to avoid rate limits (except after last batch)
        if (i < videoBatches.length - 1) {
          console.log(`⏱️  Waiting 2 seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`❌ Batch ${i + 1} failed:`, error.message);
        console.log(`⚠️  Adding batch without comments (graceful degradation)`);
        // Add batch without comments on error
        allEnrichedVideos.push(...batch.map(v => ({ ...v, comments: [] })));
      }
    }

    console.log(`\n✅ Comments enrichment completed: ${totalEnriched}/${videos.length} videos enriched`);
    console.log(`📊 Success rate: ${((totalEnriched / videos.length) * 100).toFixed(1)}%`);

    return allEnrichedVideos;

  } catch (error) {
    console.error(`❌ Comments enrichment failed completely:`, error.message);
    console.log(`⚠️  Returning all videos without comments`);
    // Return all videos without comments on complete failure
    return videos.map(v => ({ ...v, comments: [] }));
  }
}

// ============================================
// PLAYWRIGHT-BASED SCRAPERS (Legacy/Fallback)
// ============================================

/**
 * TikTok Profile Scraper (Playwright version)
 * Replicates tiktok_page.py logic in pure JavaScript
 */
async function scrapeTikTokProfile(url, maxVideos = 50) {
  console.log(`\n🎬 TikTok Profile Scraping Started`)
  console.log(`🔗 URL: ${url}`)
  console.log(`📊 Max Videos: ${maxVideos}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--mute-audio']
  })

  const context = await browser.newContext({
    userAgent: process.env.TIKTOK_USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })

  const page = await context.newPage()

  const videos = []
  const seenIds = new Set()
  let done = false

  // Intercept network responses (same as Python pattern)
  page.on('response', async (response) => {
    try {
      if (!response.url().includes('/api/post/item_list') || response.status() !== 200) {
        return
      }

      const contentType = response.headers()['content-type'] || ''
      if (!contentType.includes('application/json')) {
        return
      }

      let text = await response.text()

      // Remove JSONP prefix if present (same as Python regex)
      text = text.replace(/^\s*for\s*\(.*?\);\s*/, '')

      const data = JSON.parse(text)
      const videoList = data.itemList || []

      console.log(`    📦 API Response: ${videoList.length} videos`)

      for (const video of videoList) {
        const videoId = video.id
        if (videoId && !seenIds.has(videoId) && videos.length < maxVideos) {
          videos.push(video)
          seenIds.add(videoId)
        }
      }

      if (!data.hasMore || videos.length >= maxVideos) {
        done = true
        console.log(`    🏁 Scraping complete`)
      }
    } catch (error) {
      console.log(`    ⚠️ Response parse error: ${error.message}`)
    }
  })

  try {
    // Navigate to profile
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Scroll to load more videos
    const STEP_PX = 1000
    const STEP_WAIT_MS = 350
    const MAX_IDLE_STEPS = 150

    let idle = 0
    let previousHeight = await page.evaluate('document.body.scrollHeight')

    while (!done && idle < MAX_IDLE_STEPS && videos.length < maxVideos) {
      await page.evaluate(`window.scrollBy(0, ${STEP_PX})`)
      await page.waitForTimeout(STEP_WAIT_MS)

      const currentHeight = await page.evaluate('document.body.scrollHeight')
      idle = currentHeight === previousHeight ? idle + 1 : 0
      previousHeight = currentHeight

      if (idle % 20 === 0 && idle > 0) {
        console.log(`    📜 Scrolling... idle steps: ${idle}/${MAX_IDLE_STEPS}, videos: ${videos.length}`)
      }
    }

    await page.waitForTimeout(1500)

  } catch (error) {
    console.error(`    ⚠️ Scraping error: ${error.message}`)
  } finally {
    await browser.close()
  }

  console.log(`✅ Scraped ${videos.length} videos`)
  return videos
}

/**
 * Scrape TikTok videos by hashtag
 * Navigates to https://www.tiktok.com/tag/{hashtag}
 * Intercepts /api/search/general/full responses
 * @param {string} hashtag - Hashtag to search (with or without #)
 * @param {number} maxVideos - Maximum videos to collect (default: 50)
 * @returns {Promise<Array>} Array of video objects
 */
async function scrapeTikTokHashtag(hashtag, maxVideos = 50) {
  const cleanHashtag = hashtag.replace(/^#/, '')
  const url = `https://www.tiktok.com/tag/${cleanHashtag}`

  console.log(`\n🏷️  TikTok Hashtag Scraping Started`)
  console.log(`🔗 Hashtag: #${cleanHashtag}`)
  console.log(`📊 Max Videos: ${maxVideos}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--mute-audio']
  })

  const context = await browser.newContext({
    userAgent: process.env.TIKTOK_USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  })

  const page = await context.newPage()
  const videos = []
  const seenIds = new Set()
  let done = false

  // Intercept API responses for search results
  page.on('response', async (response) => {
    try {
      // Debug: Log ALL API calls
      const url = response.url()
      if (url.includes('/api/') && url.includes('tiktok')) {
        console.log(`    🔍 API Call: ${url.substring(0, 100)}...`)
      }

      // Check multiple API endpoints (hashtags use challenge endpoints!)
      if (!url.includes('/api/search/general/full') &&
          !url.includes('/api/post/item_list') &&
          !url.includes('/api/search/general/preview') &&
          !url.includes('/api/challenge/item_list')) {
        return
      }

      if (response.status() !== 200) {
        console.log(`    ⚠️ Non-200 status: ${response.status()}`)
        return
      }

      const contentType = response.headers()['content-type'] || ''
      if (!contentType.includes('application/json')) {
        return
      }

      let text = await response.text()
      if (!text || text.trim() === '') {
        console.log(`    ⚠️ Empty response body`)
        return
      }

      text = text.replace(/^\s*for\s*\(.*?\);\s*/, '') // Remove JSONP prefix

      const data = JSON.parse(text)

      // Handle search results format: data.data array
      if (data.data && Array.isArray(data.data)) {
        console.log(`    📦 API Response (search): ${data.data.length} sections`)

        for (const section of data.data) {
          if (section.type === 1 && section.item) {
            // Type 1 = video item
            const video = section.item
            const videoId = video.id
            if (videoId && !seenIds.has(videoId) && videos.length < maxVideos) {
              videos.push(video)
              seenIds.add(videoId)
            }
          }
        }
      }

      // Handle itemList format (fallback)
      if (data.itemList && Array.isArray(data.itemList)) {
        console.log(`    📦 API Response (itemList): ${data.itemList.length} items`)

        for (const video of data.itemList) {
          const videoId = video.id
          if (videoId && !seenIds.has(videoId) && videos.length < maxVideos) {
            videos.push(video)
            seenIds.add(videoId)
          }
        }
      }

      if (videos.length >= maxVideos) {
        done = true
        console.log(`    🏁 Scraping complete`)
      }
    } catch (error) {
      console.log(`    ⚠️ Response parse error: ${error.message}`)
    }
  })

  try {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Scroll to load more videos
    const STEP_PX = 1000
    const STEP_WAIT_MS = 350
    const MAX_IDLE_STEPS = 150

    let idle = 0
    let previousHeight = await page.evaluate('document.body.scrollHeight')

    while (!done && idle < MAX_IDLE_STEPS && videos.length < maxVideos) {
      await page.evaluate(`window.scrollBy(0, ${STEP_PX})`)
      await page.waitForTimeout(STEP_WAIT_MS)

      const currentHeight = await page.evaluate('document.body.scrollHeight')
      idle = currentHeight === previousHeight ? idle + 1 : 0
      previousHeight = currentHeight

      if (idle % 20 === 0 && idle > 0) {
        console.log(`    📜 Scrolling... idle steps: ${idle}/${MAX_IDLE_STEPS}, videos: ${videos.length}`)
      }
    }

    await page.waitForTimeout(1500)
  } catch (error) {
    console.error(`    ⚠️ Scraping error: ${error.message}`)
  } finally {
    await browser.close()
  }

  console.log(`✅ Scraped ${videos.length} videos for hashtag #${cleanHashtag}`)
  return videos
}

/**
 * Scrape TikTok videos by keyword search
 * Navigates to https://www.tiktok.com/search?q={keyword}
 * Intercepts /api/search/general/full responses (same as hashtag)
 * @param {string} keyword - Search keyword
 * @param {number} maxVideos - Maximum videos to collect (default: 50)
 * @returns {Promise<Array>} Array of video objects
 */
async function scrapeTikTokKeyword(keyword, maxVideos = 50) {
  const url = `https://www.tiktok.com/search?q=${encodeURIComponent(keyword)}`

  console.log(`\n🔍 TikTok Keyword Scraping Started`)
  console.log(`🔗 Keyword: ${keyword}`)
  console.log(`📊 Max Videos: ${maxVideos}`)

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--mute-audio']
  })

  const context = await browser.newContext({
    userAgent: process.env.TIKTOK_USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  })

  const page = await context.newPage()
  const videos = []
  const seenIds = new Set()
  let done = false

  // Intercept API responses for search results (same as hashtag)
  page.on('response', async (response) => {
    try {
      // Debug: Log ALL API calls
      const url = response.url()
      if (url.includes('/api/') && url.includes('tiktok')) {
        console.log(`    🔍 API Call: ${url.substring(0, 100)}...`)
      }

      // Check multiple API endpoints (hashtags use challenge endpoints!)
      if (!url.includes('/api/search/general/full') &&
          !url.includes('/api/post/item_list') &&
          !url.includes('/api/search/general/preview') &&
          !url.includes('/api/challenge/item_list')) {
        return
      }

      if (response.status() !== 200) {
        console.log(`    ⚠️ Non-200 status: ${response.status()}`)
        return
      }

      const contentType = response.headers()['content-type'] || ''
      if (!contentType.includes('application/json')) {
        return
      }

      let text = await response.text()
      if (!text || text.trim() === '') {
        console.log(`    ⚠️ Empty response body`)
        return
      }

      text = text.replace(/^\s*for\s*\(.*?\);\s*/, '') // Remove JSONP prefix

      const data = JSON.parse(text)

      // Handle search results format: data.data array
      if (data.data && Array.isArray(data.data)) {
        console.log(`    📦 API Response (search): ${data.data.length} sections`)

        for (const section of data.data) {
          if (section.type === 1 && section.item) {
            // Type 1 = video item
            const video = section.item
            const videoId = video.id
            if (videoId && !seenIds.has(videoId) && videos.length < maxVideos) {
              videos.push(video)
              seenIds.add(videoId)
            }
          }
        }
      }

      // Handle itemList format (fallback)
      if (data.itemList && Array.isArray(data.itemList)) {
        console.log(`    📦 API Response (itemList): ${data.itemList.length} items`)

        for (const video of data.itemList) {
          const videoId = video.id
          if (videoId && !seenIds.has(videoId) && videos.length < maxVideos) {
            videos.push(video)
            seenIds.add(videoId)
          }
        }
      }

      if (videos.length >= maxVideos) {
        done = true
        console.log(`    🏁 Scraping complete`)
      }
    } catch (error) {
      console.log(`    ⚠️ Response parse error: ${error.message}`)
    }
  })

  try {
    await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)

    // Scroll to load more videos
    const STEP_PX = 1000
    const STEP_WAIT_MS = 350
    const MAX_IDLE_STEPS = 150

    let idle = 0
    let previousHeight = await page.evaluate('document.body.scrollHeight')

    while (!done && idle < MAX_IDLE_STEPS && videos.length < maxVideos) {
      await page.evaluate(`window.scrollBy(0, ${STEP_PX})`)
      await page.waitForTimeout(STEP_WAIT_MS)

      const currentHeight = await page.evaluate('document.body.scrollHeight')
      idle = currentHeight === previousHeight ? idle + 1 : 0
      previousHeight = currentHeight

      if (idle % 20 === 0 && idle > 0) {
        console.log(`    📜 Scrolling... idle steps: ${idle}/${MAX_IDLE_STEPS}, videos: ${videos.length}`)
      }
    }

    await page.waitForTimeout(1500)
  } catch (error) {
    console.error(`    ⚠️ Scraping error: ${error.message}`)
  } finally {
    await browser.close()
  }

  console.log(`✅ Scraped ${videos.length} videos for keyword "${keyword}"`)
  return videos
}

/**
 * Parse TikTok video data to structured format
 * Replicates tiktok_to_row() function from Python
 */
function parseTikTokVideo(video, username) {
  const author = video.author || {}
  const stats = video.stats || {}
  const statsV2 = video.statsV2 || {}
  const authorStats = video.authorStats || {}

  // Extract metrics
  const likes = parseInt(statsV2.diggCount || stats.diggCount || 0)
  const comments = parseInt(statsV2.commentCount || stats.commentCount || 0)
  const shares = parseInt(statsV2.shareCount || stats.shareCount || 0)
  const reposts = parseInt(statsV2.collectCount || stats.collectCount || 0)
  const followers = parseInt(authorStats.followerCount || 0)
  const playCount = parseInt(statsV2.playCount || stats.playCount || 0)

  // Calculate engagement
  const totalEngagement = likes + comments + shares + reposts
  const engagementRate = followers > 0 ? ((totalEngagement / followers) * 100).toFixed(2) : null

  // Extract hashtags
  const hashtags = (video.challenges || [])
    .map(c => c.title)
    .filter(Boolean)

  // Extract mentions
  const mentions = (video.textExtra || [])
    .filter(item => item.type === 0) // Type 0 = mention
    .map(item => item.userUniqueId)
    .filter(Boolean)

  // Get description
  let description = ''
  if (typeof video.contents === 'object' && video.contents !== null) {
    description = video.contents.desc || ''
  } else if (Array.isArray(video.contents) && video.contents.length > 0) {
    description = video.contents[0].desc || ''
  } else {
    description = video.desc || ''
  }

  // Music info
  const music = video.music || {}

  return {
    video_id: video.id,
    profile: typeof author === 'object' ? author.uniqueId : username,
    create_time: video.createTime ? new Date(parseInt(video.createTime) * 1000).toISOString() : null,
    is_ad: video.isAd || false,

    // Author stats
    follower_count: followers,
    following_count: parseInt(authorStats.followingCount || 0),
    heart_count: parseInt(authorStats.heart || 0),
    video_count: parseInt(authorStats.videoCount || 0),

    // Video stats
    play_count: playCount,
    like_count: likes,
    comment_count: comments,
    share_count: shares,
    repost_count: reposts,

    // Content
    description: description.substring(0, 500),
    thumbnail_url: video.video?.cover || '',

    // Hashtags & mentions
    hashtags: hashtags.length > 0 ? hashtags : null,
    hashtag_count: hashtags.length,
    mentions: mentions.length > 0 ? mentions : null,
    mention_count: mentions.length,

    // Music
    music_title: music.title || '',
    music_author: music.authorName || '',
    music_original: music.original || false,

    // Video meta
    video_duration: video.video?.duration || null,
    is_duet: !!video.duetInfo,
    is_stitch: !!video.stitchInfo,

    // Author details
    author_nickname: typeof author === 'object' ? author.nickname : null,
    author_verified: typeof author === 'object' ? author.verified || false : false,
    author_signature: typeof author === 'object' ? author.signature || '' : '',

    // Calculated
    total_engagement: totalEngagement,
    engagement_rate: engagementRate ? parseFloat(engagementRate) : null,
    scraped_at: new Date().toISOString()
  }
}

/**
 * Social Scraping Endpoint
 * POST /api/social-scraping/run
 *
 * Accepts JSON input, scrapes TikTok/Instagram, outputs JSON
 * NO DATABASE - JSON-first approach
 */
app.post('/api/social-scraping/run', async (req, res) => {
  console.log('\n📱 Social Scraping API Request')

  try {
    const input = req.body

    // Validate input
    if (!input || !input.brand) {
      return res.status(400).json({
        error: 'Invalid input',
        message: 'Missing brand data in request body'
      })
    }

    const { user_id, brand } = input
    const batch_id = uuidv4()
    const scrape_timestamp = new Date().toISOString()

    console.log(`👤 User ID: ${user_id}`)
    console.log(`🏷️  Brand: ${brand.name}`)
    console.log(`🔑 Batch ID: ${batch_id}`)

    // Check which TikTok scraping implementation to use
    const useApify = process.env.USE_APIFY_FOR_TIKTOK === 'true'
    console.log(`\n🤖 TikTok Scraping Method: ${useApify ? 'APIFY' : 'PLAYWRIGHT'}`)

    const result = {
      user_id,
      batch_id,
      scrape_timestamp,
      brand_name: brand.name,
      scraping_method: useApify ? 'apify' : 'playwright',
      summary: {
        tiktok: {
          profiles_scraped: 0,
          hashtags_scraped: 0,
          keywords_scraped: 0,
          total_videos: 0
        },
        instagram: { profiles_scraped: 0, total_posts: 0 }
      },
      data: {
        tiktok: {
          profiles: {},
          hashtags: {},
          keywords: {}
        },
        instagram: { profiles: {} }
      }
    }

    // Process TikTok accounts (profiles)
    const tiktokAccounts = (brand.accounts || []).filter(acc => acc.platform === 'TikTok')

    for (const account of tiktokAccounts) {
      console.log(`\n🎬 Processing TikTok Profile: ${account.username}`)

      try {
        if (useApify) {
          // Use Apify scraper (returns formatted data)
          const scrapedData = await apifyScrapeTikTokProfile(account.url, 50)
          result.data.tiktok.profiles[account.username] = scrapedData
          result.summary.tiktok.profiles_scraped++
          result.summary.tiktok.total_videos += scrapedData.video_count
          console.log(`✅ ${account.username}: ${scrapedData.video_count} videos scraped via Apify`)
        } else {
          // Use Playwright scraper (legacy)
          const videos = await scrapeTikTokProfile(account.url, 50)
          const parsedVideos = videos.map(v => parseTikTokVideo(v, account.username))
          result.data.tiktok.profiles[account.username] = parsedVideos
          result.summary.tiktok.profiles_scraped++
          result.summary.tiktok.total_videos += parsedVideos.length
          console.log(`✅ ${account.username}: ${parsedVideos.length} videos scraped via Playwright`)
        }
      } catch (error) {
        console.error(`❌ Error scraping ${account.username}:`, error.message)
        result.data.tiktok.profiles[account.username] = {
          error: error.message,
          videos: []
        }
      }
    }

    // Process TikTok hashtags
    const tiktokHashtags = brand.hashtags || []

    for (const hashtag of tiktokHashtags) {
      console.log(`\n🏷️  Processing TikTok Hashtag: ${hashtag}`)

      try {
        if (useApify) {
          // Use Apify scraper (returns formatted data)
          const scrapedData = await apifyScrapeTikTokHashtag(hashtag, 30)
          result.data.tiktok.hashtags[hashtag] = scrapedData
          result.summary.tiktok.hashtags_scraped++
          result.summary.tiktok.total_videos += scrapedData.video_count
          console.log(`✅ ${hashtag}: ${scrapedData.video_count} videos scraped via Apify`)
        } else {
          // Use Playwright scraper (legacy)
          const videos = await scrapeTikTokHashtag(hashtag, 30)
          const parsedVideos = videos.map(v => parseTikTokVideo(v, hashtag))
          result.data.tiktok.hashtags[hashtag] = parsedVideos
          result.summary.tiktok.hashtags_scraped++
          result.summary.tiktok.total_videos += parsedVideos.length
          console.log(`✅ ${hashtag}: ${parsedVideos.length} videos scraped via Playwright`)
        }
      } catch (error) {
        console.error(`❌ Error scraping ${hashtag}:`, error.message)
        result.data.tiktok.hashtags[hashtag] = {
          error: error.message,
          videos: []
        }
      }
    }

    // Process TikTok keywords
    const tiktokKeywords = brand.keywords || []

    for (const keyword of tiktokKeywords) {
      console.log(`\n🔍 Processing TikTok Keyword: ${keyword}`)

      try {
        if (useApify) {
          // Use Apify scraper (returns formatted data)
          const scrapedData = await apifyScrapeTikTokKeyword(keyword, 30)
          result.data.tiktok.keywords[keyword] = scrapedData
          result.summary.tiktok.keywords_scraped++
          result.summary.tiktok.total_videos += scrapedData.video_count
          console.log(`✅ ${keyword}: ${scrapedData.video_count} videos scraped via Apify`)
        } else {
          // Use Playwright scraper (legacy)
          const videos = await scrapeTikTokKeyword(keyword, 30)
          const parsedVideos = videos.map(v => parseTikTokVideo(v, keyword))
          result.data.tiktok.keywords[keyword] = parsedVideos
          result.summary.tiktok.keywords_scraped++
          result.summary.tiktok.total_videos += parsedVideos.length
          console.log(`✅ ${keyword}: ${parsedVideos.length} videos scraped via Playwright`)
        }
      } catch (error) {
        console.error(`❌ Error scraping ${keyword}:`, error.message)
        result.data.tiktok.keywords[keyword] = {
          error: error.message,
          videos: []
        }
      }
    }

    // ========================================
    // PHASE 3: TikTok Comments Enrichment
    // ========================================
    if (useApify && result.summary.tiktok.total_videos > 0) {
      console.log(`\n💬 Starting TikTok Comments Enrichment Phase...`);

      try {
        // Collect all videos from all sources
        const allVideos = [];

        // Add videos from profiles
        Object.values(result.data.tiktok.profiles).forEach(profileData => {
          if (profileData.videos && Array.isArray(profileData.videos)) {
            allVideos.push(...profileData.videos);
          }
        });

        // Add videos from hashtags
        Object.values(result.data.tiktok.hashtags).forEach(hashtagData => {
          if (hashtagData.videos && Array.isArray(hashtagData.videos)) {
            allVideos.push(...hashtagData.videos);
          }
        });

        // Add videos from keywords
        Object.values(result.data.tiktok.keywords).forEach(keywordData => {
          if (keywordData.videos && Array.isArray(keywordData.videos)) {
            allVideos.push(...keywordData.videos);
          }
        });

        console.log(`📊 Collected ${allVideos.length} total videos for enrichment`);

        // Enrich videos with comments
        const enrichedVideos = await apifyEnrichWithComments(allVideos);

        // Map enriched videos back to their sources by video_id
        const enrichedMap = new Map();
        enrichedVideos.forEach(video => {
          enrichedMap.set(video.video_id, video);
        });

        // Update profiles with enriched videos
        Object.keys(result.data.tiktok.profiles).forEach(username => {
          const profileData = result.data.tiktok.profiles[username];
          if (profileData.videos && Array.isArray(profileData.videos)) {
            profileData.videos = profileData.videos.map(v =>
              enrichedMap.get(v.video_id) || v
            );
          }
        });

        // Update hashtags with enriched videos
        Object.keys(result.data.tiktok.hashtags).forEach(hashtag => {
          const hashtagData = result.data.tiktok.hashtags[hashtag];
          if (hashtagData.videos && Array.isArray(hashtagData.videos)) {
            hashtagData.videos = hashtagData.videos.map(v =>
              enrichedMap.get(v.video_id) || v
            );
          }
        });

        // Update keywords with enriched videos
        Object.keys(result.data.tiktok.keywords).forEach(keyword => {
          const keywordData = result.data.tiktok.keywords[keyword];
          if (keywordData.videos && Array.isArray(keywordData.videos)) {
            keywordData.videos = keywordData.videos.map(v =>
              enrichedMap.get(v.video_id) || v
            );
          }
        });

        const enrichedCount = enrichedVideos.filter(v => v.comments && v.comments.length > 0).length;
        console.log(`✅ Comments enrichment completed: ${enrichedCount}/${allVideos.length} videos enriched`);

      } catch (error) {
        console.error(`❌ Comments enrichment error:`, error.message);
        console.log(`⚠️  Continuing without comments...`);
      }
    }

    // TODO: Instagram scraping will be added in Phase 2
    const instagramAccounts = (brand.accounts || []).filter(acc => acc.platform === 'Instagram')
    if (instagramAccounts.length > 0) {
      console.log(`\n📸 Instagram scraping not implemented yet (${instagramAccounts.length} accounts queued)`)
    }

    // Save output to test-data folder
    const testDataDir = path.join(__dirname, '..', 'test-data')
    await fs.mkdir(testDataDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
    const outputFilename = `output-${brand.name.replace(/\s+/g, '-').toLowerCase()}-${timestamp}.json`
    const outputPath = path.join(testDataDir, outputFilename)

    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8')
    console.log(`\n💾 Output saved: ${outputFilename}`)

    // Return result
    return res.status(200).json({
      success: true,
      message: 'Social scraping completed',
      output_file: outputFilename,
      summary: result.summary,
      data: result.data
    })

  } catch (error) {
    console.error('❌ Social Scraping Error:', error)
    return res.status(500).json({
      error: 'Social scraping failed',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
})

// ============================================================
// TIKTOK COMMENT SCRAPER (Pure JavaScript - Replicates Python Reference)
// ============================================================
// TikTok Comment Scraping via Apify
// Method: Apify 'clockworks/tiktok-comments-scraper' actor
// Input: Array of video objects with URLs
// Output: Videos enriched with comment data
// See: apifyEnrichWithComments() function (lines ~4749-4863)
// ============================================================

/**
 * Separate new comments from existing ones (incremental scraping)
 * Implements deduplication logic for multi-scrape scenarios
 *
 * @param {Array} scrapedComments - All scraped comments
 * @param {Array} previousCommentIds - IDs of previously scraped comments
 * @returns {Object} Object with newComments and existingComments arrays
 */
function separateNewComments(scrapedComments, previousCommentIds = []) {
  const previousIds = new Set(previousCommentIds)

  const newComments = []
  const existingComments = []

  for (const comment of scrapedComments) {
    if (previousIds.has(comment.comment_id)) {
      existingComments.push(comment)
    } else {
      newComments.push(comment)
    }
  }

  return { newComments, existingComments }
}

/**
 * Extract video ID from various video object structures
 * @param {Object} video - Video object from scraper
 * @returns {string} Video ID
 */
function extractVideoId(video) {
  return video.video_id || video.id || video.videoId || video.aweme_id
}

/**
 * Process batch comment scraping with video discovery
 * Supports two modes:
 * 1. Legacy: Direct video IDs ({ videos: [...] })
 * 2. Discovery: Profile/hashtag/keyword discovery ({ brand: {...} })
 *
 * @param {Object} input - Input object with videos array OR brand discovery config
 * @returns {Promise<Object>} Results object with success/error status
 */
async function processBatchCommentScraping(input) {
  const startTime = Date.now()
  const discoveredVideos = []

  // Determine input mode
  const isDiscoveryMode = input.brand && (input.brand.accounts || input.brand.hashtags || input.brand.keywords)
  const isLegacyMode = input.videos && Array.isArray(input.videos)

  if (!isDiscoveryMode && !isLegacyMode) {
    throw new Error('Invalid input: Either provide "brand" for discovery or "videos" array for direct scraping')
  }

  // OPTIONS
  const options = input.options || {}
  const maxVideosPerSource = options.max_videos_per_source || 10
  const maxCommentsPerVideo = options.max_comments_per_video || 100
  const rateLimitMs = options.rate_limit_ms || 1000
  const previousCommentIds = input.previous_comment_ids || {}

  console.log(`\n🎬 TikTok Comment Scraper - ${isDiscoveryMode ? 'DISCOVERY' : 'DIRECT'} Mode`)

  // ==================================================================
  // PHASE 1: VIDEO DISCOVERY (if in discovery mode)
  // ==================================================================

  if (isDiscoveryMode) {
    console.log(`\n📺 PHASE 1: Video Discovery`)
    const { brand } = input

    // 1.1 Scrape TikTok Profiles
    const tiktokAccounts = (brand.accounts || []).filter(a => a.platform === 'TikTok')

    for (const account of tiktokAccounts) {
      try {
        const maxVideos = account.max_videos || maxVideosPerSource
        console.log(`\n👤 Discovering videos from profile: ${account.username} (max: ${maxVideos})`)

        const videos = await scrapeTikTokProfile(account.url, maxVideos)

        if (videos && videos.length > 0) {
          for (const video of videos) {
            const videoId = extractVideoId(video)
            if (videoId) {
              discoveredVideos.push({
                video_id: videoId,
                source_type: 'profile',
                source_value: account.username,
                video_metadata: video
              })
            }
          }
          console.log(`  ✅ Found ${videos.length} videos`)
        } else {
          console.log(`  ℹ️  No videos found`)
        }
      } catch (error) {
        console.error(`  ❌ Error scraping profile ${account.username}:`, error.message)
        // Continue to next source
      }
    }

    // 1.2 Scrape Hashtags
    for (const hashtag of brand.hashtags || []) {
      try {
        console.log(`\n🏷️  Discovering videos from hashtag: ${hashtag} (max: ${maxVideosPerSource})`)

        const videos = await scrapeTikTokHashtag(hashtag, maxVideosPerSource)

        if (videos && videos.length > 0) {
          for (const video of videos) {
            const videoId = extractVideoId(video)
            if (videoId) {
              discoveredVideos.push({
                video_id: videoId,
                source_type: 'hashtag',
                source_value: hashtag,
                video_metadata: video
              })
            }
          }
          console.log(`  ✅ Found ${videos.length} videos`)
        } else {
          console.log(`  ℹ️  No videos found`)
        }
      } catch (error) {
        console.error(`  ❌ Error scraping hashtag ${hashtag}:`, error.message)
        // Continue to next source
      }
    }

    // 1.3 Scrape Keywords
    for (const keyword of brand.keywords || []) {
      try {
        console.log(`\n🔍 Discovering videos from keyword: ${keyword} (max: ${maxVideosPerSource})`)

        const videos = await scrapeTikTokKeyword(keyword, maxVideosPerSource)

        if (videos && videos.length > 0) {
          for (const video of videos) {
            const videoId = extractVideoId(video)
            if (videoId) {
              discoveredVideos.push({
                video_id: videoId,
                source_type: 'keyword',
                source_value: keyword,
                video_metadata: video
              })
            }
          }
          console.log(`  ✅ Found ${videos.length} videos`)
        } else {
          console.log(`  ℹ️  No videos found`)
        }
      } catch (error) {
        console.error(`  ❌ Error scraping keyword ${keyword}:`, error.message)
        // Continue to next source
      }
    }

    // Deduplicate videos by video_id
    const uniqueVideos = []
    const seenIds = new Set()

    for (const video of discoveredVideos) {
      if (!seenIds.has(video.video_id)) {
        seenIds.add(video.video_id)
        uniqueVideos.push(video)
      }
    }

    console.log(`\n📊 Discovery Summary:`)
    console.log(`  - Total videos discovered: ${discoveredVideos.length}`)
    console.log(`  - Unique videos: ${uniqueVideos.length}`)

    discoveredVideos.length = 0
    discoveredVideos.push(...uniqueVideos)

  } else {
    // Legacy mode: use provided video IDs
    console.log(`\n📺 Using provided video IDs`)

    for (const video of input.videos) {
      discoveredVideos.push({
        video_id: video.video_id,
        source_type: 'direct',
        source_value: 'user_provided',
        video_metadata: null
      })
    }
  }

  if (discoveredVideos.length === 0) {
    return {
      success: false,
      error: 'No videos discovered or provided',
      duration_ms: Date.now() - startTime
    }
  }

  // ==================================================================
  // PHASE 2: COMMENT SCRAPING
  // ==================================================================

  console.log(`\n💬 PHASE 2: Comment Scraping via Apify (${discoveredVideos.length} videos)`)

  // Prepare videos for Apify enrichment with proper URLs
  // Convert discoveredVideos to format expected by apifyEnrichWithComments
  const videosForApify = discoveredVideos.map(v => {
    const videoId = v.video_id
    const metadata = v.video_metadata || {}

    // Construct TikTok video URL from metadata
    // Format: https://www.tiktok.com/@{username}/video/{video_id}
    let video_url = null

    if (metadata.author && metadata.author.uniqueId) {
      video_url = `https://www.tiktok.com/@${metadata.author.uniqueId}/video/${videoId}`
    } else if (metadata.video && metadata.video.id) {
      // Fallback: try to extract from video object
      video_url = `https://www.tiktok.com/video/${videoId}`
    }

    return {
      ...metadata,
      video_id: videoId,
      video_url: video_url,  // Add explicit video_url for Apify
      webVideoUrl: video_url,  // Apify also checks this field
      _source_type: v.source_type,
      _source_value: v.source_value
    }
  })

  // Call Apify to enrich ALL videos with comments in batches
  const enrichedVideos = await apifyEnrichWithComments(videosForApify)

  // Transform enriched videos into expected result format
  const results = []

  for (let i = 0; i < enrichedVideos.length; i++) {
    const enrichedVideo = enrichedVideos[i]
    const videoId = enrichedVideo.video_id || extractVideoId(enrichedVideo)
    const comments = enrichedVideo.comments || []

    console.log(`\n[${i + 1}/${enrichedVideos.length}] Processing video: ${videoId}`)
    console.log(`  Source: ${enrichedVideo._source_type} (${enrichedVideo._source_value})`)
    console.log(`  📊 Comments received from Apify: ${comments.length}`)

    try {
      // Transform Apify comments to normalized format
      const scrapedComments = comments.map(c => ({
        comment_id: c.id,
        video_id: videoId,
        text: c.text,  // ← CRITICAL FIELD - Comment text from Apify
        like_count: c.like_count || 0,
        created_at: c.created_at,
        user: {
          username: c.author?.username || 'unknown',
          nickname: c.author?.nickname || ''
        },
        raw_json: c
      }))

      // Separate new vs existing comments (deduplication)
      const previousIds = previousCommentIds[videoId] || []
      const { newComments, existingComments } = separateNewComments(scrapedComments, previousIds)

      // Build result object
      const result = {
        video_id: videoId,
        source_type: enrichedVideo._source_type,
        source_value: enrichedVideo._source_value,
        status: 'success',
        total_comments_scraped: scrapedComments.length,
        new_comments_count: newComments.length,
        existing_comments_count: existingComments.length,
        new_comments: newComments,
        existing_comments: existingComments
      }

      // Include video metadata if available
      if (options.include_video_metadata) {
        result.video_metadata = {
          ...enrichedVideo,
          comments: undefined,  // Don't duplicate comments
          _source_type: undefined,
          _source_value: undefined
        }
      }

      results.push(result)

      console.log(`  ✅ Processed ${scrapedComments.length} comments (${newComments.length} new, ${existingComments.length} existing)`)

    } catch (error) {
      console.error(`  ❌ Error processing video ${videoId}:`, error.message)

      results.push({
        video_id: videoId,
        source_type: enrichedVideo._source_type,
        source_value: enrichedVideo._source_value,
        status: 'error',
        error: {
          code: 'PROCESSING_ERROR',
          message: error.message
        }
      })
    }
  }

  const duration = Date.now() - startTime

  console.log(`\n✅ Scraping Complete!`)

  return {
    success: true,
    batch_id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    duration_ms: duration,
    user_id: input.user_id,
    brand_name: input.brand?.name,
    results,
    summary: {
      mode: isDiscoveryMode ? 'discovery' : 'direct',
      total_videos: discoveredVideos.length,
      successful: results.filter(r => r.status === 'success').length,
      failed: results.filter(r => r.status === 'error').length,
      total_comments_scraped: results.reduce((sum, r) => sum + (r.total_comments_scraped || 0), 0),
      total_new_comments: results.reduce((sum, r) => sum + (r.new_comments_count || 0), 0),
      total_existing_comments: results.reduce((sum, r) => sum + (r.existing_comments_count || 0), 0)
    }
  }
}

// ============================================================
// TIKTOK COMMENT SCRAPER - TEST ENDPOINT
// ============================================================

/**
 * Test endpoint for TikTok comment scraping
 * Reads from input-tester.json and returns JSON output
 * No database operations - pure JSON I/O
 */
app.post('/api/tiktok-comments/scrape', async (req, res) => {
  try {
    console.log('\n🎬 TikTok Comment Scraper - Starting...')

    // Read input from either request body or input-tester.json
    let input
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('📥 Using input from request body')
      input = req.body
    } else {
      console.log('📥 Reading input from test-data/input-tester.json')
      const inputPath = path.join(__dirname, '..', 'test-data', 'input-tester.json')
      const inputData = await fs.readFile(inputPath, 'utf-8')
      input = JSON.parse(inputData)
    }

    // Validate Apify token (required for comment scraping)
    if (!process.env.APIFY_API_TOKEN) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'MISSING_APIFY_TOKEN',
          message: 'APIFY_API_TOKEN environment variable is not set. Please check .env file.'
        }
      })
    }

    // Process batch scraping
    const result = await processBatchCommentScraping(input)

    // Save output to test-data folder
    const testDataDir = path.join(__dirname, '..', 'test-data')

    // Ensure test-data directory exists
    try {
      await fs.access(testDataDir)
    } catch {
      await fs.mkdir(testDataDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
    const outputFilename = `tiktok-comments-output-${timestamp}.json`
    const outputPath = path.join(testDataDir, outputFilename)

    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8')
    console.log(`\n💾 Output saved: ${outputFilename}`)

    // Return result
    return res.status(200).json({
      ...result,
      output_file: outputFilename
    })

  } catch (error) {
    console.error('❌ TikTok Comment Scraper Error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    })
  }
})

// ============================================================
// INSTAGRAM COMMENT SCRAPER - ENRICHMENT WRAPPER
// ============================================================

/**
 * Wrapper function to maintain backward compatibility with existing comment endpoint
 * Uses the enrichInstagramWithComments function from src/utils/socialListening/scrapers/instagram.js
 */
async function apifyEnrichInstagramWithComments(posts, options = {}) {
  const batchSize = parseInt(process.env.IG_COMMENTS_BATCH_SIZE) || 50
  const maxComments = parseInt(process.env.IG_MAX_COMMENTS_PER_POST) || 50

  return await enrichInstagramWithComments({
    posts,
    apifyToken: process.env.APIFY_API_TOKEN,
    maxCommentsPerPost: maxComments,
    batchSize,
    timeout: 240
  });
}

// ============================================================
// INSTAGRAM COMMENT SCRAPER - TEST ENDPOINT
// ============================================================

/**
 * Test endpoint for Instagram comment enrichment
 * Input: Previously scraped Instagram posts output file
 * Output: Posts enriched with full comments
 */
app.post('/api/instagram-comments/scrape', async (req, res) => {
  try {
    console.log('\n📸 Instagram Comment Scraper - Starting...')

    // Validate Apify token
    if (!process.env.APIFY_API_TOKEN) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'MISSING_APIFY_TOKEN',
          message: 'APIFY_API_TOKEN environment variable is not set. Please check .env file.'
        }
      })
    }

    // Input can be:
    // 1. Direct array of posts in request body
    // 2. Reference to a previous output file
    // 3. Path to test input file

    let postsToEnrich = []
    let sourceInfo = {}

    if (req.body.posts && Array.isArray(req.body.posts)) {
      // Direct posts array
      console.log('📥 Using posts from request body')
      postsToEnrich = req.body.posts
      sourceInfo = {
        source_type: 'request_body',
        total_posts: postsToEnrich.length
      }
    } else if (req.body.output_file) {
      // Reference to previous output file
      console.log(`📥 Loading posts from output file: ${req.body.output_file}`)
      const outputPath = path.join(__dirname, '..', 'test-data', req.body.output_file)
      const outputData = await fs.readFile(outputPath, 'utf-8')
      const previousOutput = JSON.parse(outputData)

      // Extract posts from all sources
      if (previousOutput.results && Array.isArray(previousOutput.results)) {
        previousOutput.results.forEach(result => {
          if (result.posts && Array.isArray(result.posts)) {
            postsToEnrich.push(...result.posts)
          }
        })
      }

      sourceInfo = {
        source_type: 'output_file',
        output_file: req.body.output_file,
        total_posts: postsToEnrich.length
      }
    } else {
      // Use default test file
      console.log('📥 No input provided, looking for recent Instagram output file')
      const testDataDir = path.join(__dirname, '..', 'test-data')
      const files = await fs.readdir(testDataDir)
      const instagramOutputFiles = files
        .filter(f => f.startsWith('instagram-posts-output-') && f.endsWith('.json'))
        .sort()
        .reverse()

      if (instagramOutputFiles.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'NO_INPUT_FILE',
            message: 'No Instagram output files found in test-data/. Please provide posts or output_file.'
          }
        })
      }

      const latestFile = instagramOutputFiles[0]
      console.log(`📥 Using latest output file: ${latestFile}`)
      const outputPath = path.join(testDataDir, latestFile)
      const outputData = await fs.readFile(outputPath, 'utf-8')
      const previousOutput = JSON.parse(outputData)

      // Extract posts from all sources
      if (previousOutput.results && Array.isArray(previousOutput.results)) {
        previousOutput.results.forEach(result => {
          if (result.posts && Array.isArray(result.posts)) {
            postsToEnrich.push(...result.posts)
          }
        })
      }

      sourceInfo = {
        source_type: 'auto_latest',
        output_file: latestFile,
        total_posts: postsToEnrich.length
      }
    }

    if (postsToEnrich.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_POSTS_TO_ENRICH',
          message: 'No posts found to enrich with comments'
        }
      })
    }

    console.log(`\n📊 Found ${postsToEnrich.length} posts to enrich`)

    // Limit posts if specified
    const maxPostsToProcess = req.body.max_posts || postsToEnrich.length
    const postsSubset = postsToEnrich.slice(0, maxPostsToProcess)

    if (postsSubset.length < postsToEnrich.length) {
      console.log(`⚠️  Limiting to ${postsSubset.length} posts (max_posts specified)`)
    }

    // Enrich with comments
    const startTime = Date.now()
    const enrichedPosts = await apifyEnrichInstagramWithComments(postsSubset, req.body.options || {})
    const durationMs = Date.now() - startTime

    // Prepare result
    const result = {
      success: true,
      batch_id: `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      source: sourceInfo,
      summary: {
        total_posts_processed: enrichedPosts.length,
        posts_with_comments: enrichedPosts.filter(p => (p.total_comments_scraped || 0) > 0).length,
        posts_without_comments: enrichedPosts.filter(p => (p.total_comments_scraped || 0) === 0).length,
        total_comments_scraped: enrichedPosts.reduce((sum, p) => sum + (p.total_comments_scraped || 0), 0),
        average_comments_per_post: Math.round(enrichedPosts.reduce((sum, p) => sum + (p.total_comments_scraped || 0), 0) / enrichedPosts.length)
      },
      posts: enrichedPosts
    }

    // Save output to test-data folder
    const testDataDir = path.join(__dirname, '..', 'test-data')
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
    const outputFilename = `instagram-comments-output-${timestamp}.json`
    const outputPath = path.join(testDataDir, outputFilename)

    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf-8')
    console.log(`\n💾 Output saved: ${outputFilename}`)

    // Return result
    return res.status(200).json({
      ...result,
      output_file: outputFilename
    })

  } catch (error) {
    console.error('❌ Instagram Comment Scraper Error:', error)
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    })
  }
})

// Validate scraper environment variables (only for test-scraper functionality)
console.log('\n🔍 Checking scraper configuration...')
if (process.env.APIFY_API_TOKEN) {
  console.log('✅ APIFY_API_TOKEN configured - Instagram scraping enabled')
} else {
  console.warn('⚠️  APIFY_API_TOKEN not set - Instagram scraping will fail')
}
console.log('✅ TikTok scraper ready (Playwright - no token required)')
console.log('✅ Test Scraper endpoint ready at /api/social-listening')

// TikTok Comment Scraper validation
if (process.env.TIKTOK_COOKIE && process.env.TIKTOK_COMMENTS_BASEQS) {
  console.log('✅ TikTok Comment Scraper configured and ready')
  console.log('📝 TikTok Comments endpoint: POST /api/tiktok-comments/scrape')
} else {
  console.warn('⚠️  TikTok Comment Scraper not fully configured')
  if (!process.env.TIKTOK_COOKIE) console.warn('   - Missing: TIKTOK_COOKIE')
  if (!process.env.TIKTOK_COMMENTS_BASEQS) console.warn('   - Missing: TIKTOK_COMMENTS_BASEQS')
}

// Instagram Comment Scraper validation
if (process.env.APIFY_API_TOKEN) {
  console.log('✅ Instagram Comment Scraper configured and ready')
  console.log('📝 Instagram Comments endpoint: POST /api/instagram-comments/scrape')
  const batchSize = process.env.IG_COMMENTS_BATCH_SIZE || 50
  const maxComments = process.env.IG_MAX_COMMENTS_PER_POST || 50
  console.log(`   - Batch size: ${batchSize} posts per batch`)
  console.log(`   - Max comments: ${maxComments} per post`)
} else {
  console.warn('⚠️  Instagram Comment Scraper not configured (APIFY_API_TOKEN required)')
}

// ==========================================
// Instagram Scraper - Profile & Hashtag Scraping
// ==========================================
app.post('/api/instagram/scrape', async (req, res) => {
  console.log(`\n📸 Instagram Scraper - Starting...`);

  try {
    const { user_id, brand, options = {} } = req.body;

    // Validation
    if (!user_id || !brand) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id and brand'
      });
    }

    console.log(`🔍 Request: user_id=${user_id}, brand=${brand.name}`);

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    // Extract Instagram accounts and hashtags from brand
    const instagramAccounts = (brand.accounts || []).filter(
      acc => acc.platform === 'Instagram' && acc.username
    );
    const hashtags = brand.hashtags || [];

    if (instagramAccounts.length === 0 && hashtags.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No Instagram accounts or hashtags found in brand data'
      });
    }

    console.log(`📊 Found ${instagramAccounts.length} profile(s) and ${hashtags.length} hashtag(s) to scrape`);

    // Validate Apify token
    const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
    if (!APIFY_API_TOKEN) {
      return res.status(500).json({
        success: false,
        error: 'APIFY_API_TOKEN not configured'
      });
    }

    // Build search queries array (profiles + hashtags)
    const searchQueries = [];
    const queryMetadata = {}; // Track source info for each query

    // Add profiles
    for (const account of instagramAccounts) {
      const query = account.username.startsWith('@') ? account.username : `@${account.username}`;
      searchQueries.push(query);
      queryMetadata[query] = {
        type: 'profile',
        username: account.username,
        max_posts: account.max_posts || options.max_posts_per_source || 10
      };
    }

    // Add hashtags
    for (const hashtag of hashtags) {
      const query = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
      searchQueries.push(query);
      queryMetadata[query] = {
        type: 'hashtag',
        hashtag: hashtag,
        max_posts: options.max_posts_per_source || 10
      };
    }

    console.log(`🔍 Search queries: ${searchQueries.join(', ')}`);

    // Use the Instagram scraper module
    const maxPostsPerQuery = options.max_posts_per_source || 10;
    const scrapedPosts = await scrapeInstagram({
      searchQueries,
      maxPostsPerQuery,
      apifyToken: APIFY_API_TOKEN,
      timeout: 300 // 5 minutes
    });

    console.log(`✅ Scraped ${scrapedPosts.length} total posts`);

    // Group results by source query
    const results = [];

    for (const query of searchQueries) {
      const metadata = queryMetadata[query];
      const queryPosts = scrapedPosts.filter(post => post.source_query === query);

      if (metadata.type === 'profile') {
        results.push({
          username: metadata.username,
          profile_url: `https://www.instagram.com/${metadata.username.replace('@', '')}`,
          source_type: 'profile',
          status: 'success',
          total_posts_scraped: queryPosts.length,
          posts: queryPosts
        });
      } else if (metadata.type === 'hashtag') {
        const cleanHashtag = metadata.hashtag.replace('#', '');
        results.push({
          hashtag: `#${cleanHashtag}`,
          hashtag_url: `https://www.instagram.com/explore/tags/${cleanHashtag}/`,
          source_type: 'hashtag',
          status: 'success',
          total_posts_scraped: queryPosts.length,
          posts: queryPosts
        });
      }
    }

    const durationMs = Date.now() - startTime;

    // Calculate summary
    const profileResults = results.filter(r => !r.source_type || r.source_type === 'profile');
    const hashtagResults = results.filter(r => r.source_type === 'hashtag');

    const summary = {
      total_sources: results.length,
      profiles: {
        count: instagramAccounts.length,
        successful: profileResults.filter(r => r.status === 'success').length,
        failed: profileResults.filter(r => r.status === 'failed').length,
        total_posts_scraped: profileResults.reduce((sum, r) => sum + (r.total_posts_scraped || 0), 0)
      },
      hashtags: {
        count: hashtags.length,
        successful: hashtagResults.filter(r => r.status === 'success').length,
        failed: hashtagResults.filter(r => r.status === 'failed').length,
        total_posts_scraped: hashtagResults.reduce((sum, r) => sum + (r.total_posts_scraped || 0), 0)
      },
      total_posts_scraped: results.reduce((sum, r) => sum + (r.total_posts_scraped || 0), 0)
    };

    console.log(`\n✅ Instagram Scraper Complete:`, summary);
    console.log(`⏱️ Total duration: ${(durationMs / 1000).toFixed(2)}s\n`);

    // Save output to test-data folder
    const testDataDir = path.join(__dirname, '..', 'test-data')

    // Ensure test-data directory exists
    try {
      await fs.access(testDataDir)
    } catch {
      await fs.mkdir(testDataDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-')
    const outputFilename = `instagram-posts-output-${timestamp}.json`
    const outputPath = path.join(testDataDir, outputFilename)

    const responseObject = {
      success: true,
      batch_id: batchId,
      timestamp: new Date().toISOString(),
      duration_ms: durationMs,
      user_id,
      brand_name: brand.name,
      results,
      summary
    };

    await fs.writeFile(outputPath, JSON.stringify(responseObject, null, 2), 'utf-8')
    console.log(`\n💾 Output saved: ${outputFilename}`)

    return res.json({
      ...responseObject,
      output_file: outputFilename
    });

  } catch (error) {
    console.error(`\n❌ Instagram Scraper Error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Backend server running on http://localhost:${PORT}`)
  console.log(`📡 YouTube API: http://localhost:${PORT}/api/youtube-search`)
  console.log(`🐦 Twitter API: http://localhost:${PORT}/api/twitter-analytics`)
  console.log(`📰 News API: http://localhost:${PORT}/api/news-analytics`)
  console.log(`📱 Social Listening API: http://localhost:${PORT}/api/social-listening`)
  console.log(`🎬 Social Scraping API: http://localhost:${PORT}/api/social-scraping/run`)
  console.log(`💬 TikTok Comments API: POST http://localhost:${PORT}/api/tiktok-comments/scrape`)
  console.log(`📸 Instagram Scraper API: POST http://localhost:${PORT}/api/instagram/scrape`)
  console.log(`✨ Ready to process requests\n`)
})
