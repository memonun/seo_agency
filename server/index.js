// Local Express Server for Development
// Replicates the /api/youtube-search.js serverless function

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
import { TwitterApi } from '@virtuals-protocol/game-twitter-node'
import { createClient } from '@supabase/supabase-js'

dotenv.config()

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
    this.limit = 40;
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
        message: 'action is required (search, hashtag, combined-search, account-analysis, discover-hashtags, sentiment)'
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
        message: 'Supported actions: search, hashtag, combined-search, account-analysis, discover-hashtags, sentiment'
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
      case 'account-analysis':
        return await handleAccountAnalysis(twitterClient, params, req, res)
      case 'discover-hashtags':
        return await handleHashtagDiscovery(twitterClient, params, req, res)
      case 'sentiment':
        return await handleSentimentAnalysis(twitterClient, params, req, res)
      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Supported actions: search, hashtag, combined-search, account-analysis, discover-hashtags, sentiment'
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
      max_results: Math.max(10, Math.min(limit, 100)), // Fix API limit validation
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

// Combined search handler  
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

// Account analysis handler
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
      max_results: Math.max(10, Math.min(limit, 100)),
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
      Math.min(100, Math.max(50, limit * 2)) :  // Popular: fetch 2x requested (min 50, max 100)
      Math.max(50, Math.min(limit, 100));        // Recent: fetch requested amount (min 50)
    
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
      Math.min(100, Math.max(50, limit * 2)) :  // Popular: fetch 2x requested (min 50, max 100)
      Math.max(50, Math.min(limit, 100));        // Recent: fetch requested amount (min 50)
    
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
  const maxResults = Math.max(10, Math.min(limit * 2, 100)); // Ensure Twitter API min/max requirements
  
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
      input, // keywords for SERP, URLs for URL mode
      limit = 10,
      context = null
    } = req.body
    
    // Validate required parameters
    if (!input) {
      console.error('❌ Missing input parameter')
      return res.status(400).json({
        error: 'Missing required parameter: input',
        message: 'Please provide keywords (for SERP mode) or URLs (for URL mode)'
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
    
    console.log(`📊 Processing ${mode} analysis for: ${input}`)
    
    // Execute Python script
    const { spawn } = await import('child_process')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const fs = await import('fs')
    
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = path.dirname(__filename)
    
    const scriptPath = path.join(__dirname, '..', 'web_search')
    const scriptName = mode === 'serp' ? 'serp_content_analyzer.py' : 'url_sentiment_analyzer.py'
    const fullScriptPath = path.join(scriptPath, scriptName)
    
    // Build command arguments
    const args = [fullScriptPath, input]
    
    if (mode === 'serp') {
      args.push(limit.toString())
    }
    
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
                input,
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
                input,
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' })
})

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Backend server running on http://localhost:${PORT}`)
  console.log(`📡 YouTube API: http://localhost:${PORT}/api/youtube-search`)
  console.log(`🐦 Twitter API: http://localhost:${PORT}/api/twitter-analytics`)
  console.log(`📰 News API: http://localhost:${PORT}/api/news-analytics`)
  console.log(`✨ Ready to process requests\n`)
})
