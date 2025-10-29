// Local Express Server for Development
// Replicates the /api/youtube-search.js serverless function

import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import crypto from 'crypto'
// Using built-in fetch (Node.js 18+)
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
  const { keyword, user_id, search_id, email, filters = {} } = req.body

  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' })
  }

  // Generate search_id if not provided
  const effectiveSearchId = search_id || crypto.randomUUID()

  try {
    console.log(`\n🔍 Processing YouTube search for: "${keyword}"`)

    // Step 1: Fetch 10 YouTube videos from YT-API (consolidated) with filters
    const youtubeVideos = await fetchYouTubeVideosYTAPI(keyword, filters)

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
          transcript = await fetchTranscriptYTAPI(video.video_id)
          console.log(`   ✓ [${i + 1}/${youtubeVideos.length}] Transcript fetched`)
        } catch (transcriptError) {
          console.warn(`   ⚠ [${i + 1}/${youtubeVideos.length}] Transcript error: ${transcriptError.message}`)
        }

        try {
          console.log(`   [${i + 1}/${youtubeVideos.length}] Fetching comments...`)
          comments = await fetchVideoCommentsYTAPI(video.video_id)
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
        overallSummary,
        filters
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

// YouTube Channel Search + Summarization Endpoint
app.post('/api/youtube-channel-search', async (req, res) => {
  const { keyword: channelInput, user_id, search_id, email } = req.body

  if (!channelInput) {
    return res.status(400).json({ error: 'Channel input is required' })
  }

  try {
    console.log(`\n🔍 Processing YouTube channel search for: "${channelInput}"`)

    // Step 1: Extract and validate channel ID
    const channelId = extractChannelId(channelInput)
    if (!channelId) {
      return res.status(400).json({ error: 'Invalid channel URL, handle, or ID' })
    }

    console.log(`   📺 Extracted channel ID: ${channelId}`)

    // Step 2: Fetch channel videos from YT-API
    const channelVideos = await fetchChannelVideos(channelId)

    if (channelVideos.length === 0) {
      return res.status(404).json({ error: 'No videos found for this channel' })
    }

    console.log(`✅ Found ${channelVideos.length} videos from channel`)

    // Step 3: Store raw channel data for reproducibility
    const rawChannelData = [...channelVideos]
    const rawCommentsData = {}

    // Step 4: Process videos sequentially (same as video search)
    const videosWithSummaries = []
    const maxVideos = Math.min(channelVideos.length, 10) // Limit to 10 videos

    for (let i = 0; i < maxVideos; i++) {
      const video = channelVideos[i]
      
      try {
        console.log(`   [${i + 1}/${maxVideos}] Processing: ${video.title.substring(0, 50)}...`)
        
        // Fetch transcript and comments
        let transcript = null
        let comments = null
        
        try {
          console.log(`   [${i + 1}/${maxVideos}] Fetching transcript...`)
          transcript = await fetchTranscriptYTAPI(video.video_id)
          console.log(`   ✓ [${i + 1}/${maxVideos}] Transcript fetched`)
        } catch (transcriptError) {
          console.warn(`   ⚠ [${i + 1}/${maxVideos}] Transcript error: ${transcriptError.message}`)
        }

        try {
          console.log(`   [${i + 1}/${maxVideos}] Fetching comments...`)
          comments = await fetchVideoCommentsYTAPI(video.video_id)
          console.log(`   ✓ [${i + 1}/${maxVideos}] Comments fetched: ${comments.items.length} comments`)
          
          rawCommentsData[video.video_id] = {
            totalCount: comments.totalCount,
            items: comments.items,
            fetchedAt: new Date().toISOString()
          }
        } catch (commentError) {
          console.warn(`   ⚠ [${i + 1}/${maxVideos}] Comments error: ${commentError.message}`)
          comments = {
            totalCount: 0,
            items: [],
            error: 'Comments not available for this video'
          }
          
          rawCommentsData[video.video_id] = {
            totalCount: 0,
            items: [],
            error: commentError.message,
            fetchedAt: new Date().toISOString()
          }
        }

        // Generate AI summary
        let summary = '⚠️ Unable to analyze this video.'
        if (transcript || (comments && comments.items.length > 0)) {
          try {
            console.log(`   [${i + 1}/${maxVideos}] Generating AI summary...`)
            
            const processedTranscript = transcript ? processTimestamps(transcript) : null
            summary = await summarizeWithAI(processedTranscript, comments, video.title)
            console.log(`   ✓ [${i + 1}/${maxVideos}] AI summary complete`)
          } catch (summaryError) {
            console.error(`   ✗ [${i + 1}/${maxVideos}] Summary error: ${summaryError.message}`)
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

        console.log(`   ✓ [${i + 1}/${maxVideos}] Processing complete`)
        
        // Add delay between requests
        if (i < maxVideos - 1) {
          await sleep(1200)
        }
        
      } catch (error) {
        console.error(`   ✗ [${i + 1}/${maxVideos}] Error: ${error.message}`)
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

    // Step 5: Generate overall channel summary
    let overallSummary = null
    try {
      console.log(`📊 Generating overall channel summary...`)
      overallSummary = await generateChannelSummary(videosWithSummaries, channelInput, channelId)
      console.log(`✅ Channel summary complete`)
    } catch (overallError) {
      console.error(`❌ Channel summary error:`, overallError.message)
      overallSummary = 'Unable to generate channel analysis at this time.'
    }

    // Step 6: Save to database
    let databaseId = null
    let databaseSaveStatus = 'pending'
    let databaseError = null
    
    try {
      console.log('🗄️ === DATABASE SAVE ATTEMPT ===')
      databaseId = await saveChannelAnalytics(
        user_id, 
        search_id, 
        channelInput,
        channelId, 
        email, 
        rawChannelData, 
        rawCommentsData, 
        videosWithSummaries, 
        overallSummary
      )
      
      if (databaseId) {
        console.log(`💾 Channel analysis saved to database with ID: ${databaseId}`)
        databaseSaveStatus = 'success'
      } else {
        console.log('⚠️ Database save returned null - check logs for details')
        databaseSaveStatus = 'failed'
        databaseError = 'Database save failed - check server logs for details'
      }
    } catch (saveError) {
      console.error(`❌ Database save error:`, saveError.message)
      databaseSaveStatus = 'error'
      databaseError = saveError.message
    }

    // Return response in same format as video search but with database save status
    return res.status(200).json({
      status: 'success',
      keyword: channelInput,
      overallSummary,
      videos: videosWithSummaries,
      channelId,
      databaseId,
      databaseSave: {
        status: databaseSaveStatus,
        sessionId: databaseId,
        error: databaseError
      }
    })
  } catch (error) {
    console.error('Error in youtube-channel-search:', error)
    return res.status(500).json({
      error: 'Failed to process channel search',
      message: error.message
    })
  }
})

// Helper Functions

// YT-API CONSOLIDATED FUNCTIONS

async function fetchYouTubeVideosYTAPI(keyword, filters = {}) {
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY
  const RAPIDAPI_HOST = 'yt-api.p.rapidapi.com'

  // Build URL with filter parameters
  const params = new URLSearchParams({
    query: keyword,
    type: filters.content_type_filter || 'video'
  })

  // Add optional filter parameters
  if (filters.upload_date_filter) params.append('upload_date', filters.upload_date_filter)
  if (filters.sort_by_filter) params.append('sort_by', filters.sort_by_filter)
  if (filters.geo_filter) params.append('geo', filters.geo_filter)

  const url = `https://${RAPIDAPI_HOST}/search?${params.toString()}`

  console.log(`🔍 YT-API Video Search: ${url}`)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  })

  if (!response.ok) {
    throw new Error(`YT-API video search failed: ${response.status}`)
  }

  const data = await response.json()

  // Extract videos from YT-API response format - CONFIRMED WORKING
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('No videos found in YT-API response')
  }

  // Filter valid videos with videoId before processing
  const validVideos = data.data.filter(video => {
    const hasValidVideoId = video.videoId && typeof video.videoId === 'string' && video.videoId.trim() !== ''
    if (!hasValidVideoId) {
      console.log(`🚫 Filtered out invalid video: ${video.title || 'Unknown'} - Missing videoId`)
    }
    return hasValidVideoId
  })

  if (validVideos.length === 0) {
    throw new Error('No valid videos found after filtering')
  }

  console.log(`✅ Found ${validVideos.length} valid videos out of ${data.data.length} total results`)
  
  const videos = validVideos.slice(0, 10)

  return videos.map(video => {
    // Handle thumbnail arrays from YT-API
    let thumbnail = `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`
    if (video.thumbnail && Array.isArray(video.thumbnail) && video.thumbnail.length > 0) {
      thumbnail = video.thumbnail[0].url
    }

    // Handle channel avatar arrays
    let channelThumbnail = ''
    if (video.channelAvatar && Array.isArray(video.channelAvatar) && video.channelAvatar.length > 0) {
      channelThumbnail = video.channelAvatar[0].url
    } else if (video.channelThumbnail && Array.isArray(video.channelThumbnail) && video.channelThumbnail.length > 0) {
      channelThumbnail = video.channelThumbnail[0].url
    }

    // Detect actual content type from response
    const detectedContentType = detectContentType(video)

    return {
      url: `https://www.youtube.com/watch?v=${video.videoId}`,
      title: video.title || 'Untitled Video',
      description: video.description || '',
      video_id: video.videoId,
      thumbnail: thumbnail,
      channel: video.channelTitle || 'Unknown Channel',
      views: video.viewCountText || video.viewCount || 'N/A',
      publishedTime: video.publishedTimeText || 'N/A',
      duration: video.lengthText || 'N/A',
      channelThumbnail: channelThumbnail,
      likes: video.likeCount || null,
      subscribers: video.subscriberCount || null,
      isVerified: video.isVerified || false,
      badges: video.badges || [],
      isLive: video.isLive || video.badges?.includes('LIVE') || false,
      contentType: detectedContentType // Add detected content type
    }
  })
}

async function fetchVideoCommentsYTAPI(videoId) {
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY
  const RAPIDAPI_HOST = 'yt-api.p.rapidapi.com'

  const url = `https://${RAPIDAPI_HOST}/comments?id=${videoId}`
  console.log(`🔍 YT-API Comments: ${url}`)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  })

  if (!response.ok) {
    throw new Error(`YT-API comments failed: ${response.status}`)
  }

  const data = await response.json()

  // YT-API comments response structure: { commentsCount, data: [] }
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('No comments found in YT-API response')
  }

  const totalCount = parseInt(data.commentsCount) || data.data.length

  return {
    totalCount: totalCount,
    items: data.data.slice(0, 20).map(comment => ({
      id: comment.commentId || `comment_${Date.now()}`,
      authorDisplayName: comment.authorText || 'Unknown',
      authorProfileImageUrl: comment.authorThumbnail?.[0]?.url || '',
      textDisplay: comment.textDisplay || '',
      likeCount: parseYouTubeNumber(comment.likesCount) || 0,
      publishedAt: comment.publishedTimeText || '',
      updatedAt: comment.publishedTimeText || '',
      isChannelOwner: comment.authorIsChannelOwner || false,
      replies: parseInt(comment.replyCount) || 0
    }))
  }
}

async function fetchTranscriptYTAPI(videoId) {
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY
  const RAPIDAPI_HOST = 'yt-api.p.rapidapi.com'

  const url = `https://${RAPIDAPI_HOST}/get_transcript?id=${videoId}`
  console.log(`🔍 YT-API Transcript: ${url}`)

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  })

  if (!response.ok) {
    throw new Error(`YT-API transcript failed: ${response.status}`)
  }

  const data = await response.json()

  // YT-API transcript response structure: { id, transcript: [] }
  if (!data.transcript || !Array.isArray(data.transcript)) {
    throw new Error('No transcript found in YT-API response')
  }

  if (data.transcript.length === 0) {
    throw new Error('Empty transcript returned')
  }

  // Convert YT-API transcript format to our expected format
  return data.transcript.map(item => ({
    text: item.text || '',
    offset: parseInt(item.startMs) / 1000 || 0 // Convert milliseconds to seconds
  }))
}

// OLD API FUNCTIONS REMOVED - REPLACED WITH YT-API CONSOLIDATED FUNCTIONS

// Helper function to detect content type from video data
function detectContentType(video) {
  // Check for live streams first
  if (video.isLive || video.badges?.includes('LIVE')) {
    return 'live'
  }
  
  // Check for shorts based on duration (typically under 60 seconds)
  if (video.lengthText) {
    const duration = parseDurationToSeconds(video.lengthText)
    if (duration > 0 && duration <= 60) {
      return 'shorts'
    }
  }
  
  // Default to video
  return 'video'
}

// Helper function to parse duration text to seconds
function parseDurationToSeconds(durationText) {
  if (!durationText || durationText === 'N/A') return 0
  
  // Parse formats like "1:23", "12:34", "1:23:45"
  const parts = durationText.split(':').map(Number).reverse()
  let seconds = 0
  
  if (parts[0]) seconds += parts[0] // seconds
  if (parts[1]) seconds += parts[1] * 60 // minutes
  if (parts[2]) seconds += parts[2] * 3600 // hours
  
  return seconds
}

// Helper function to add delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Helper function to parse YouTube numbers (e.g., "125K" -> 125000, "48K" -> 48000)
function parseYouTubeNumber(numberStr) {
  if (!numberStr || typeof numberStr !== 'string') return 0
  
  const cleanStr = numberStr.trim().toUpperCase()
  
  // Handle "K" suffix (thousands)
  if (cleanStr.endsWith('K')) {
    const num = parseFloat(cleanStr.slice(0, -1))
    return isNaN(num) ? 0 : Math.round(num * 1000)
  }
  
  // Handle "M" suffix (millions)
  if (cleanStr.endsWith('M')) {
    const num = parseFloat(cleanStr.slice(0, -1))
    return isNaN(num) ? 0 : Math.round(num * 1000000)
  }
  
  // Handle "B" suffix (billions)
  if (cleanStr.endsWith('B')) {
    const num = parseFloat(cleanStr.slice(0, -1))
    return isNaN(num) ? 0 : Math.round(num * 1000000000)
  }
  
  // Handle regular numbers (remove commas)
  const cleanNumber = cleanStr.replace(/,/g, '')
  const parsed = parseInt(cleanNumber)
  return isNaN(parsed) ? 0 : parsed
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

async function saveYouTubeAnalytics(userId, searchId, keyword, email, rawYouTubeData, rawCommentsData, videosWithSummaries, overallSummary, filters = {}) {
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
        apisUsed: ['yt-api-consolidated']
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

    // Insert into database with filter columns
    const { data, error } = await supabase
      .from('youtube_analytics_sessions')
      .insert([
        {
          user_id: userId,
          search_id: searchId,
          keyword,
          analysis_data: analysisData,
          upload_date_filter: filters.upload_date_filter || null,
          sort_by_filter: filters.sort_by_filter || 'relevance',
          geo_filter: filters.geo_filter || 'US',
          content_type_filter: filters.content_type_filter || 'video'
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

// Channel Helper Functions

function extractChannelId(input) {
  if (!input || typeof input !== 'string') return null

  try {
    const cleanInput = input.trim()

    // Direct channel ID (UC...)
    if (/^UC[a-zA-Z0-9_-]{22}$/.test(cleanInput)) {
      return cleanInput
    }

    // @username format
    const handleMatch = cleanInput.match(/^@([a-zA-Z0-9_.-]+)$/)
    if (handleMatch) {
      return `@${handleMatch[1]}`
    }

    // youtube.com/channel/CHANNEL_ID
    const channelPattern = /(?:youtube\.com\/channel\/)([a-zA-Z0-9_-]+)/
    const channelMatch = cleanInput.match(channelPattern)
    if (channelMatch) return channelMatch[1]

    // youtube.com/c/CUSTOM_NAME
    const customPattern = /(?:youtube\.com\/c\/)([a-zA-Z0-9_-]+)/
    const customMatch = cleanInput.match(customPattern)
    if (customMatch) return `@${customMatch[1]}`

    // youtube.com/user/USERNAME  
    const userPattern = /(?:youtube\.com\/user\/)([a-zA-Z0-9_-]+)/
    const userMatch = cleanInput.match(userPattern)
    if (userMatch) return `@${userMatch[1]}`

    // youtube.com/@username
    const atPattern = /(?:youtube\.com\/@)([a-zA-Z0-9_.-]+)/
    const atMatch = cleanInput.match(atPattern)
    if (atMatch) return `@${atMatch[1]}`

    return null
  } catch (error) {
    console.error('Error extracting channel ID:', error)
    return null
  }
}

async function fetchChannelVideos(channelId) {
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY
  const RAPIDAPI_HOST = 'yt-api.p.rapidapi.com'

  let actualChannelId = channelId

  // For @handle format, we need to search first to get the channel ID
  if (channelId.startsWith('@')) {
    console.log(`   🔍 Searching for channel handle: ${channelId}`)
    
    const searchUrl = `https://${RAPIDAPI_HOST}/search?query=${encodeURIComponent(channelId)}&type=channel`
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    })

    if (!searchResponse.ok) {
      throw new Error(`YT-API search failed: ${searchResponse.status}`)
    }

    const searchData = await searchResponse.json()
    
    if (!searchData.data || searchData.data.length === 0) {
      throw new Error(`No channel found for handle: ${channelId}`)
    }

    // Get the first matching channel
    const channel = searchData.data[0]
    actualChannelId = channel.channelId || channel.id
    console.log(`   ✅ Found channel ID: ${actualChannelId}`)
  }

  // Now fetch the channel videos using the resolved channel ID
  const url = `https://${RAPIDAPI_HOST}/channel/videos?id=${encodeURIComponent(actualChannelId)}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': RAPIDAPI_KEY,
      'x-rapidapi-host': RAPIDAPI_HOST
    }
  })

  if (!response.ok) {
    throw new Error(`YT-API failed: ${response.status}`)
  }

  const data = await response.json()
  
  // Extract videos from YT-API response format
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('No videos found in channel')
  }

  return data.data.slice(0, 10).map(video => ({
    url: `https://www.youtube.com/watch?v=${video.videoId}`,
    title: video.title || 'Untitled Video',
    description: video.description || '',
    video_id: video.videoId,
    thumbnail: video.thumbnail?.url || `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
    channel: data.meta?.channelTitle || data.channelTitle || 'Unknown Channel',
    views: video.viewCount || 'N/A',
    publishedTime: video.publishedText || 'N/A',
    duration: video.lengthText || 'N/A',
    channelThumbnail: data.meta?.avatar?.[0]?.url || '',
    likes: video.likeCount || null,
    subscribers: data.meta?.subscriberCount || null,
    isVerified: data.meta?.isVerified || false,
    badges: [],
    isLive: video.isLive || false
  }))
}

async function generateChannelSummary(videosWithSummaries, channelInput, channelId) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured')
  }

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
    return `No videos could be analyzed for channel "${channelInput}".`
  }

  const analysisData = {
    channelInput,
    channelId,
    totalVideos: videosWithSummaries.length,
    successfulAnalysis: videoSummaries.length,
    videoSummaries,
    totalComments: videosWithSummaries.reduce((sum, video) => sum + (video.comments?.totalCount || 0), 0)
  }

  const systemMessage = `You are a professional YouTube channel analyst. Given analysis data from multiple videos from a specific YouTube channel, provide a comprehensive overview that identifies:

1. Channel content themes and consistency
2. Audience engagement patterns across videos
3. Content strategy insights
4. Overall channel performance and sentiment

Format your response as a natural, engaging summary that captures the channel's content landscape and audience response.

Example style: "This channel focuses on tech reviews with consistent high-quality production. The audience is highly engaged with technical discussions in comments, and there's strong positive sentiment around the creator's expertise and presentation style."

Guidelines:
- Write in a conversational, insightful tone
- Synthesize patterns across multiple videos
- Include engagement observations from comments
- Focus on channel-level insights, not individual video details
- Maximum 800 characters for conciseness`

  const userPrompt = `Analyze this YouTube channel based on recent video data:

${JSON.stringify(analysisData, null, 2)}

Provide a concise, insightful overview of the channel's content strategy, themes, and audience engagement patterns.`

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
  return data.choices?.[0]?.message?.content || 'Unable to generate channel summary.'
}

async function saveChannelAnalytics(userId, searchId, channelInput, channelId, email, rawChannelData, rawCommentsData, videosWithSummaries, overallSummary) {
  try {
    console.log('🔧 === CHANNEL ANALYTICS DATABASE SAVE DEBUG ===')
    console.log('📥 Input parameters:')
    console.log('   userId:', userId)
    console.log('   searchId:', searchId)
    console.log('   channelInput:', channelInput)
    console.log('   channelId:', channelId)
    console.log('   email:', email)
    console.log('   rawChannelData length:', rawChannelData?.length || 0)
    console.log('   videosWithSummaries length:', videosWithSummaries?.length || 0)
    console.log('   overallSummary length:', overallSummary?.length || 0)

    if (!supabase) {
      console.error('❌ CRITICAL: Supabase client not configured!')
      console.log('⏭️ Skipping database save - Supabase not configured')
      return null
    }

    console.log('✅ Supabase client is configured')
    console.log('💾 Saving channel analytics to database...')

    // Prepare analysis data for channel session
    const analysisData = {
      metadata: {
        totalVideos: rawChannelData.length,
        successfulAnalysis: videosWithSummaries.filter(v => !v.summary.startsWith('⚠️')).length,
        processingTimestamp: new Date().toISOString(),
        apiVersion: '1.0',
        aiModel: 'google/gemini-2.0-flash-001',
        apisUsed: ['yt-api-consolidated'],
        searchType: 'channel'
      }
    }

    console.log('📊 Analysis data prepared:', JSON.stringify(analysisData, null, 2))

    // Prepare session record
    const sessionRecord = {
      user_id: userId,
      search_id: searchId,
      channel_input: channelInput,
      channel_id: channelId,
      email: email,
      overall_summary: overallSummary,
      analysis_data: analysisData,
      raw_channel_data: rawChannelData,
      raw_comments_data: rawCommentsData
    }

    console.log('📝 Session record to insert:', JSON.stringify({
      ...sessionRecord,
      raw_channel_data: `[${rawChannelData?.length || 0} items]`,
      raw_comments_data: `[${Object.keys(rawCommentsData || {}).length} video comments]`
    }, null, 2))

    // Insert main channel session
    console.log('🚀 Attempting to insert channel session...')
    const { data: sessionData, error: sessionError } = await supabase
      .from('youtube_channel_sessions')
      .insert([sessionRecord])
      .select('id')

    if (sessionError) {
      console.error('❌ CHANNEL SESSION SAVE FAILED!')
      console.error('   Error code:', sessionError.code)
      console.error('   Error message:', sessionError.message)
      console.error('   Error details:', sessionError.details)
      console.error('   Error hint:', sessionError.hint)
      console.error('   Full error object:', JSON.stringify(sessionError, null, 2))
      return null
    }

    const sessionId = sessionData[0]?.id
    console.log('✅ Channel session saved successfully!')
    console.log('   Session ID:', sessionId)
    console.log('   Session data:', JSON.stringify(sessionData, null, 2))

    // Insert individual videos
    if (videosWithSummaries.length > 0) {
      console.log(`📹 Preparing to save ${videosWithSummaries.length} videos...`)
      
      const videoRecords = videosWithSummaries.map(video => ({
        session_id: sessionId,
        video_id: video.video_id,
        title: video.title,
        description: video.description,
        url: video.url,
        thumbnail: video.thumbnail,
        channel: video.channel,
        views: video.views,
        published_time: video.publishedTime,
        duration: video.duration,
        likes: video.likes,
        position: video.position,
        summary: video.summary,
        comments_total_count: video.comments?.totalCount || 0,
        comments_data: video.comments?.items || []
      }))

      console.log('📝 Sample video record:', JSON.stringify({
        ...videoRecords[0],
        description: videoRecords[0].description?.substring(0, 100) + '...',
        summary: videoRecords[0].summary?.substring(0, 100) + '...',
        comments_data: `[${videoRecords[0].comments_data?.length || 0} comments]`
      }, null, 2))

      console.log('🚀 Attempting to insert channel videos...')
      const { error: videosError } = await supabase
        .from('youtube_channel_videos')
        .insert(videoRecords)

      if (videosError) {
        console.error('❌ CHANNEL VIDEOS SAVE FAILED!')
        console.error('   Error code:', videosError.code)
        console.error('   Error message:', videosError.message)
        console.error('   Error details:', videosError.details)
        console.error('   Error hint:', videosError.hint)
        console.error('   Full error object:', JSON.stringify(videosError, null, 2))
        // Continue anyway since main session was saved
      } else {
        console.log(`✅ Successfully saved ${videoRecords.length} channel videos`)
      }
    } else {
      console.log('⚠️ No videos to save')
    }

    console.log('🎉 Channel analytics save process completed')
    console.log('📊 Final session ID:', sessionId)
    return sessionId

  } catch (error) {
    console.error('❌ CRITICAL: Database save exception!')
    console.error('   Error name:', error.name)
    console.error('   Error message:', error.message)
    console.error('   Error stack:', error.stack)
    console.error('   Full error object:', JSON.stringify(error, null, 2))
    return null
  }
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
      
      
    default:
      return res.status(400).json({
        error: 'Invalid action',
        message: 'Supported actions: search, combined-search, separated-search, account-analysis, discover-hashtags'
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
      case 'combined-search':
        return await handleCombinedSearch(twitterClient, params, req, res)
      case 'separated-search':
        return await handleSeparatedSearch(twitterClient, params, req, res)
      case 'account-analysis':
        return await handleAccountAnalysis(twitterClient, params, req, res)
      case 'discover-hashtags':
        return await handleHashtagDiscovery(twitterClient, params, req, res)
      case 'save-account-specific':
        return await handleSaveAccountSpecific(req, res)
      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: 'Supported actions: search, combined-search, separated-search, account-analysis, discover-hashtags, save-account-specific'
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
        mentions: tweet.entities?.mentions?.map(mention => `@${mention.username}`) || [],
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
    
    // NEW: Add account-specific saving for separated searches with account data
    let accountSpecific = null
    if (hasAccount && accountResult && accountResult.tweets && accountResult.tweets.length > 0) {
      console.log(`🎯 Account found in separated search for @${accountUsername} - preparing account-specific data`)
      
      const cleanUsername = accountUsername.replace(/^@/, '')
      accountSpecific = await saveAccountSpecificTweets(
        cleanUsername,
        accountResult.tweets,
        { keyword, hashtags, includeMentions, limit, sortOrder }
      )
      
      if (accountSpecific) {
        console.log(`✅ Account-specific data prepared for @${cleanUsername}`)
      }
    }
    
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
      timestamp: new Date().toISOString(),
      // NEW: Include account-specific data if available (for frontend database saving)
      ...(accountSpecific && { accountSpecific })
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
    
    // FIXED: Add missing reply fetching logic for separated search (was only in standalone account analysis)
    if (includeMentions) {
      console.log('📱 Fetching replies for account tweets in separated search...')
      const tweetsToFetchReplies = formattedTweets.slice(0, 3)
      
      for (const tweet of tweetsToFetchReplies) {
        const replies = await fetchTweetReplies(client, tweet.id, 5, cleanUsername)
        tweet.replies = replies
      }
    }
    
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
    
    // NEW: Add account-specific saving data to response (Dev Server)
    const accountSavingData = await saveAccountSpecificTweets(
      cleanUsername, 
      formattedTweets, 
      { keyword, hashtags, includeMentions, limit, sortOrder }
    );
    
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
      timestamp: new Date().toISOString(),
      // NEW: Account-specific data for frontend database insertion
      accountSpecific: accountSavingData
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
      mentions: tweet.entities?.mentions?.map(mention => `@${mention.username}`) || [],
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
      mentions: [`@user${Math.floor(Math.random() * 5) + 1}`, '@influencer', '@expert'].slice(0, Math.floor(Math.random() * 2) + 1),
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

// Reddit Analytics API - Development Environment
app.post('/api/reddit-analytics', async (req, res) => {
  try {
    console.log('\n🔍 === REDDIT ANALYTICS START ===')
    console.log('📝 Raw request body:', JSON.stringify(req.body, null, 2))
    
    // DIAGNOSTIC: Log environment variables
    console.log('🔧 ENVIRONMENT DIAGNOSTICS:')
    console.log('  NODE_ENV:', process.env.NODE_ENV)
    console.log('  REDDIT_MOCK_MODE:', process.env.REDDIT_MOCK_MODE)
    console.log('  APIFY_API_KEY present:', !!(process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN || process.env.apify_api_key))
    console.log('  APIFY_API_KEY value:', process.env.APIFY_API_KEY ? `${process.env.APIFY_API_KEY.substring(0, 8)}...` : 'NOT SET')
    console.log('  All env vars for Reddit:', {
      REDDIT_MOCK_MODE: process.env.REDDIT_MOCK_MODE,
      APIFY_API_KEY: process.env.APIFY_API_KEY ? 'SET' : 'NOT SET',
      APIFY_API_TOKEN: process.env.APIFY_API_TOKEN ? 'SET' : 'NOT SET',
      apify_api_key: process.env.apify_api_key ? 'SET' : 'NOT SET'
    })
    
    const { 
      action, 
      searchType, 
      query, 
      subreddit, 
      username, 
      sortOrder = 'hot', 
      timeRange, 
      maxItems = 25, 
      includeComments = false,
      includeCommunityInfo = true,
      user_id 
    } = req.body
    
    console.log(`🔍 Parsed parameters:`, { 
      action, searchType, query, subreddit, username, sortOrder, timeRange, maxItems, includeComments, includeCommunityInfo
    })
    
    // Validate required parameters
    if (!action || action !== 'search') {
      console.error('❌ Missing or invalid action parameter')
      return res.status(400).json({
        error: 'Missing required field',
        message: 'Action must be "search"'
      })
    }
    
    if (!searchType) {
      console.error('❌ Missing searchType parameter')
      return res.status(400).json({
        error: 'Missing search type',
        message: 'searchType is required (subreddit, search, user)'
      })
    }
    
    console.log(`🎯 Processing searchType: ${searchType}`)
    
    // DIAGNOSTIC: Check mock mode decision
    console.log('🎯 MOCK MODE DECISION:')
    console.log('  process.env.REDDIT_MOCK_MODE:', JSON.stringify(process.env.REDDIT_MOCK_MODE))
    console.log('  typeof process.env.REDDIT_MOCK_MODE:', typeof process.env.REDDIT_MOCK_MODE)
    console.log('  process.env.REDDIT_MOCK_MODE === "true":', process.env.REDDIT_MOCK_MODE === 'true')
    
    // Check if we should use mock mode
    const mockMode = process.env.REDDIT_MOCK_MODE === 'true'
    console.log(`🎯 Final mockMode decision: ${mockMode}`)
    
    if (mockMode) {
      console.log('🔧 ENTERING MOCK MODE - Will return mock data')
      console.log('🔧 Reason: REDDIT_MOCK_MODE environment variable is set to "true"')
      
      let mockQuery = ''
      switch (searchType) {
        case 'subreddit':
          if (!subreddit) {
            return res.status(400).json({
              error: 'Missing subreddit',
              message: 'Subreddit is required for subreddit search'
            })
          }
          mockQuery = subreddit
          break
        case 'search':
          if (!query) {
            return res.status(400).json({
              error: 'Missing query',
              message: 'Query is required for search'
            })
          }
          mockQuery = query
          break
        case 'user':
          if (!username) {
            return res.status(400).json({
              error: 'Missing username',
              message: 'Username is required for user search'
            })
          }
          mockQuery = username
          break
        default:
          return res.status(400).json({
            error: 'Invalid search type',
            message: 'searchType must be: subreddit, search, or user'
          })
      }
      
      const mockData = generateMockRedditPosts(mockQuery, maxItems, searchType)
      const analytics = generateRedditAnalytics(mockData, mockQuery, searchType)
      
      console.log(`✅ Mock Reddit search completed: ${mockData.length} posts`)
      console.log('📤 FINAL RESPONSE ANALYTICS:', JSON.stringify(analytics, null, 2))
      console.log('=== END REDDIT ANALYTICS ===\n')
      
      return res.status(200).json({
        success: true,
        mock: true,
        data: mockData,
        analytics,
        searchQuery: mockQuery,
        searchType,
        total: mockData.length,
        timestamp: new Date().toISOString()
      })
    }
    
    // DIAGNOSTIC: Entering production mode
    console.log('🚀 ENTERING PRODUCTION MODE - Will use real Apify API')
    console.log('🚀 Reason: REDDIT_MOCK_MODE is not "true", proceeding with real API calls')
    
    // DIAGNOSTIC: Test API key availability before proceeding
    const testApiKey = process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN || process.env.apify_api_key;
    console.log('🔑 API KEY CHECK:')
    console.log('  API key found:', !!testApiKey)
    console.log('  API key source:', 
      process.env.APIFY_API_KEY ? 'APIFY_API_KEY' : 
      process.env.APIFY_API_TOKEN ? 'APIFY_API_TOKEN' : 
      process.env.apify_api_key ? 'apify_api_key' : 'NONE')
    console.log('  API key preview:', testApiKey ? `${testApiKey.substring(0, 8)}...${testApiKey.substring(testApiKey.length - 4)}` : 'NOT FOUND')
    
    // Check rate limiting
    if (!apifyRateLimiter.canMakeRequest()) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests. Please wait before trying again.',
        retryAfter: apifyRateLimiter.getTimeUntilReset()
      });
    }
    
    // DIAGNOSTIC: Initialize Apify client with detailed logging
    console.log('🔌 INITIALIZING APIFY CLIENT...')
    let apifyClient;
    try {
      apifyClient = getApifyClient();
      console.log('✅ Apify client initialized successfully')
      console.log('  Client baseUrl:', apifyClient.baseUrl)
      console.log('  Client token preview:', apifyClient.token ? `${apifyClient.token.substring(0, 8)}...` : 'MISSING')
    } catch (clientError) {
      console.error('❌ FAILED TO INITIALIZE APIFY CLIENT:', clientError.message)
      console.error('❌ Full error:', clientError)
      throw clientError;
    }
    
    // DIAGNOSTIC: Route to appropriate Reddit handler
    console.log(`🛤️ ROUTING TO REDDIT HANDLER: ${searchType}`)
    switch (searchType) {
      case 'subreddit':
        console.log('➡️ CALLING handleSubredditSearch (Reddit)')
        return await handleSubredditSearch(apifyClient, req, res);
      case 'search':
        console.log('➡️ CALLING handleRedditKeywordSearch (Reddit)')
        return await handleRedditKeywordSearch(apifyClient, req, res);
      case 'user':
        console.log('➡️ CALLING handleRedditUserSearch (Reddit)')
        return await handleRedditUserSearch(apifyClient, req, res);
      default:
        console.log('❌ INVALID SEARCH TYPE:', searchType)
        return res.status(400).json({
          error: 'Invalid search type',
          message: 'Supported search types: subreddit, search, user'
        });
    }
    
  } catch (error) {
    console.error('❌ Reddit Analytics API Error:', error)
    console.error('=== END REDDIT ERROR ===\n')
    
    // Enhanced error handling
    if (error.message?.includes('Apify API token not found')) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Apify API token not found. Please set APIFY_API_KEY in your .env file',
        timestamp: new Date().toISOString()
      });
    }
    
    if (error.message?.includes('rate limit')) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Please wait before making another request',
        retryAfter: apifyRateLimiter.getTimeUntilReset(),
        timestamp: new Date().toISOString()
      });
    }
    
    if (error.message?.includes('Apify API error')) {
      return res.status(502).json({
        error: 'External API error',
        message: 'Apify Reddit Scraper API is currently unavailable',
        timestamp: new Date().toISOString()
      });
    }
    
    return res.status(500).json({
      error: 'Reddit analytics failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
})

// Apify Reddit Client Functions (ported from serverless function)
const getApifyClient = () => {
  // Support both naming conventions for environment variables
  const apiToken = process.env.APIFY_API_TOKEN || process.env.APIFY_API_KEY || process.env.apify_api_key;
  
  if (!apiToken) {
    throw new Error('Apify API token not found. Please set APIFY_API_KEY in your .env file');
  }
  
  return {
    token: apiToken,
    baseUrl: 'https://api.apify.com/v2'
  };
};

// Rate limiting tracker for Apify API
const apifyRateLimiter = {
  requests: [],
  limit: 50, // Conservative limit for Apify API
  window: 5 * 60 * 1000, // 5 minutes
  
  canMakeRequest() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.window);
    
    if (this.requests.length >= this.limit) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  },
  
  getTimeUntilReset() {
    if (this.requests.length === 0) return 0;
    const oldest = Math.min(...this.requests);
    return Math.max(0, this.window - (Date.now() - oldest));
  }
};

// Helper function to wait for Apify run completion
async function waitForApifyCompletion(client, runId, timeout = 60000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Check run status
      const statusResponse = await fetch(
        `${client.baseUrl}/actor-runs/${runId}?token=${client.token}`
      );
      
      if (!statusResponse.ok) {
        throw new Error(`Status check failed: ${statusResponse.status}`);
      }
      
      const statusData = await statusResponse.json();
      const status = statusData.data.status;
      
      if (status === 'SUCCEEDED') {
        // Get results
        const resultsResponse = await fetch(
          `${client.baseUrl}/actor-runs/${runId}/dataset/items?token=${client.token}`
        );
        
        if (!resultsResponse.ok) {
          throw new Error(`Results fetch failed: ${resultsResponse.status}`);
        }
        
        return await resultsResponse.json();
      } else if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
        throw new Error(`Apify run failed with status: ${status}`);
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.error('Error checking Apify run status:', error);
      throw error;
    }
  }
  
  throw new Error('Apify run timed out');
}

// Mock data generator for Reddit development
function generateMockRedditPosts(query, limit = 10, searchType = 'subreddit') {
  const mockAuthors = ['user1', 'user2', 'user3', 'poweruser', 'expert_redditor']
  const mockSubreddits = ['technology', 'science', 'AskReddit', 'worldnews', 'funny']
  
  return Array(limit).fill(null).map((_, i) => ({
    id: `mock_${Date.now()}_${i}`,
    title: `Mock post about ${query} - Discussion ${i + 1}`,
    selftext: `This is mock content for post ${i + 1} about ${query}. Lorem ipsum dolor sit amet.`,
    author: mockAuthors[i % mockAuthors.length],
    subreddit: searchType === 'subreddit' ? query : mockSubreddits[i % mockSubreddits.length],
    subreddit_prefixed: searchType === 'subreddit' ? `r/${query}` : `r/${mockSubreddits[i % mockSubreddits.length]}`,
    score: Math.floor(Math.random() * 10000) + 10,
    upvote_ratio: (Math.random() * 0.4 + 0.6).toFixed(2), // 0.6 to 1.0
    num_comments: Math.floor(Math.random() * 500) + 5,
    created_utc: Math.floor((Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) / 1000),
    url: `https://reddit.com/r/${query}/comments/mock${i}`,
    permalink: `/r/${query}/comments/mock${i}/mock_post_${i}/`,
    is_video: Math.random() > 0.8,
    is_original_content: Math.random() > 0.9,
    over_18: false,
    spoiler: Math.random() > 0.95,
    locked: false,
    gilded: Math.floor(Math.random() * 3),
    total_awards_received: Math.floor(Math.random() * 10),
    post_hint: Math.random() > 0.7 ? 'image' : null,
    domain: Math.random() > 0.5 ? 'self.' + query : 'example.com',
    sentiment: {
      label: ['positive', 'negative', 'neutral'][i % 3],
      score: (Math.random() * 2 - 1).toFixed(2) // -1 to 1
    }
  }))
}

// Generate analytics from Reddit posts
function generateRedditAnalytics(posts, searchQuery, searchType) {
  console.log('\n📈 === REDDIT ANALYTICS CALCULATION START ===')
  console.log('📊 Input data:', {
    postsCount: posts.length,
    searchQuery,
    searchType
  })
  
  // Log sample of input data structure for debugging
  if (posts.length > 0) {
    console.log('📝 Sample post structure:', {
      id: posts[0].id,
      score: posts[0].score,
      num_comments: posts[0].num_comments,
      author: posts[0].author,
      subreddit: posts[0].subreddit,
      created_utc: posts[0].created_utc,
      sentiment: posts[0].sentiment,
      availableFields: Object.keys(posts[0])
    })
  }
  
  if (posts.length === 0) {
    console.log('⚠️ No posts provided - returning zero analytics')
    return {
      totalPosts: 0,
      totalComments: 0,
      totalScore: 0,
      avgScore: 0,
      avgCommentsPerPost: 0,
      topPostScore: 0,
      viralPotential: 0,
      avgSentiment: 0,
      sentimentBreakdown: { positive: 0, negative: 0, neutral: 0 },
      topAuthors: [],
      topSubreddits: [],
      peakHour: null
    }
  }
  
  // Basic metrics with detailed logging
  console.log('🔢 Calculating basic metrics...')
  // Map both old and new field names for compatibility
  const totalScore = posts.reduce((sum, post) => sum + (post.score || post.upVotes || 0), 0)
  const totalComments = posts.reduce((sum, post) => sum + (post.num_comments || post.numberOfComments || 0), 0)
  const avgScore = Math.floor(totalScore / posts.length)
  const avgCommentsPerPost = Math.floor(totalComments / posts.length)
  const topPostScore = Math.max(...posts.map(post => post.score || post.upVotes || 0))
  
  console.log('📊 Basic metrics calculated:', {
    totalScore,
    totalComments,
    avgScore,
    avgCommentsPerPost,
    topPostScore
  })
  
  // Sentiment analysis
  console.log('😊 Calculating sentiment analysis...')
  const sentimentCounts = posts.reduce((acc, post) => {
    const label = post.sentiment?.label || 'neutral'
    acc[label] = (acc[label] || 0) + 1
    return acc
  }, { positive: 0, negative: 0, neutral: 0 })
  
  const avgSentiment = posts.length > 0 
    ? posts.reduce((sum, post) => sum + parseFloat(post.sentiment?.score || 0), 0) / posts.length 
    : 0
    
  console.log('😊 Sentiment analysis:', {
    sentimentCounts,
    avgSentiment
  })
  
  // Top authors
  console.log('👤 Calculating top authors...')
  const authorCounts = {}
  posts.forEach(post => {
    const author = post.author || post.username || '[deleted]'
    if (author && author !== '[deleted]') {
      authorCounts[author] = (authorCounts[author] || 0) + 1
    }
  })
  
  const topAuthors = Object.entries(authorCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([author, count]) => ({ username: author, posts: count }))
    
  console.log('👤 Top authors calculated:', topAuthors)
  
  // Top subreddits
  console.log('🏠 Calculating top subreddits...')
  const subredditCounts = {}
  posts.forEach(post => {
    const subreddit = post.subreddit || post.parsedCommunityName
    if (subreddit) {
      subredditCounts[subreddit] = (subredditCounts[subreddit] || 0) + 1
    }
  })
  
  const topSubreddits = Object.entries(subredditCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([subreddit, count]) => ({ name: subreddit, posts: count }))
    
  console.log('🏠 Top subreddits calculated:', topSubreddits)
  
  // Peak posting hour analysis
  console.log('⏰ Calculating peak posting hour...')
  const hourCounts = {}
  posts.forEach(post => {
    if (post.created_utc) {
      const hour = new Date(post.created_utc * 1000).getHours()
      hourCounts[hour] = (hourCounts[hour] || 0) + 1
    }
  })
  
  const peakHour = Object.entries(hourCounts)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || null
    
  console.log('⏰ Peak hour analysis:', {
    hourCounts,
    peakHour
  })
  
  // Viral potential
  console.log('🚀 Calculating viral potential...')
  const viralPotential = Math.min(100, Math.floor((avgScore + avgCommentsPerPost) / 100 * 10))
  console.log('🚀 Viral potential calculated:', viralPotential)
  
  const finalAnalytics = {
    totalPosts: posts.length,
    totalComments,
    totalScore,
    avgScore,
    avgCommentsPerPost,
    topPostScore,
    viralPotential,
    avgSentiment: Number(avgSentiment.toFixed(2)),
    sentimentBreakdown: sentimentCounts,
    topAuthors,
    topSubreddits,
    peakHour: peakHour ? parseInt(peakHour) : null
  }
  
  console.log('✅ Final analytics calculated:', finalAnalytics)
  console.log('=== REDDIT ANALYTICS CALCULATION END ===\n')
  
  return finalAnalytics
}

// Subreddit search handler (ported from serverless function)
async function handleSubredditSearch(client, req, res) {
  try {
    console.log('🏠 === SUBREDDIT SEARCH HANDLER START ===')
    
    const { 
      subreddit, 
      sortOrder = 'hot', 
      timeRange, 
      maxItems = 25,
      includeComments = false,
      includeCommunityInfo = true
    } = req.body;
    
    console.log('🏠 SUBREDDIT SEARCH PARAMS:', {
      subreddit, sortOrder, timeRange, maxItems, includeComments, includeCommunityInfo
    })
    
    if (!subreddit) {
      console.log('❌ SUBREDDIT SEARCH ERROR: Missing subreddit parameter')
      return res.status(400).json({
        error: 'Missing subreddit',
        message: 'Subreddit name is required'
      });
    }
    
    console.log(`🔍 Subreddit search: r/${subreddit} | Sort: ${sortOrder} | Items: ${maxItems}`);
    
    // Build simple Apify input for subreddit search (RESTORED WORKING FORMAT)
    console.log('🏗️ BUILDING SIMPLE SUBREDDIT APIFY INPUT...')
    
    // Clean subreddit name: remove r/ prefix and spaces
    const cleanSubreddit = subreddit.replace(/^r\//, '').replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    
    // Ultra simple working Apify input format with comment control
    const input = {
      searches: [`subreddit:${cleanSubreddit}`],
      maxItems: parseInt(maxItems)
    };
    
    // Add sort parameters if provided
    if (sortOrder && sortOrder !== 'hot') {
      input.sort = sortOrder;
    }
    if (sortOrder === 'top' && timeRange) {
      input.time = timeRange; 
    }
    
    // CRITICAL: Backend filtering strategy (Apify always returns mixed posts+comments)
    if (includeComments) {
      console.log('💬 Comments ENABLED: Will return posts with comments');
      // Request normal amount - return mixed posts+comments as-is
      input.maxItems = parseInt(maxItems);
    } else {
      console.log('📝 Posts ONLY: Will filter out comments, requesting extra items');
      // Request 4x more items to ensure we get enough posts after filtering
      input.maxItems = Math.max(parseInt(maxItems) * 4, 100);
    }
    
    console.log('📋 SIMPLE APIFY INPUT:', JSON.stringify(input, null, 2))
    console.log('✅ Using original working format with sort parameters included')
    console.log('🔗 APIFY API ENDPOINT:', `${client.baseUrl}/acts/trudax~reddit-scraper-lite/runs`)
    console.log('🔑 APIFY TOKEN PREVIEW:', client.token ? `${client.token.substring(0, 8)}...${client.token.substring(client.token.length - 4)}` : 'MISSING')
    
    // Make simple Apify API call
    const runResponse = await fetch(
      `${client.baseUrl}/acts/trudax~reddit-scraper-lite/runs?token=${client.token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input)
      }
    );
    
    console.log('📡 APIFY RESPONSE STATUS:', runResponse.status, runResponse.statusText)
    console.log('📡 APIFY RESPONSE HEADERS:', Object.fromEntries(runResponse.headers.entries()))
    
    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('❌ APIFY API ERROR:', errorText)
      throw new Error(`Apify API error: ${runResponse.status} ${runResponse.statusText} - ${errorText}`);
    }
    
    const runData = await runResponse.json();
    console.log('📋 APIFY RUN DATA:', JSON.stringify(runData, null, 2))
    const runId = runData.data.id;
    console.log('🆔 APIFY RUN ID:', runId)
    
    // DIAGNOSTIC: Wait for completion with detailed logging
    console.log('⏳ WAITING FOR APIFY COMPLETION...')
    const results = await waitForApifyCompletion(client, runId, 60000); // 60 second timeout
    console.log('✅ APIFY COMPLETION RESULTS:')
    console.log('  Results type:', typeof results)
    console.log('  Results is array:', Array.isArray(results))
    console.log('  Results length:', results?.length || 'N/A')
    console.log('  First result sample:', results?.[0] ? JSON.stringify(results[0], null, 2) : 'No results')
    
    // CRITICAL: Process and filter results based on user preference
    console.log('🔄 PROCESSING RESULTS...')
    console.log(`🎯 User preference: includeComments = ${includeComments}`)
    
    // Separate posts and comments using correct field name
    const allPosts = results.filter(item => item.dataType === 'post');
    const allComments = results.filter(item => item.dataType === 'comment');
    
    console.log('📊 Raw results breakdown:', {
      totalItems: results.length,
      posts: allPosts.length,
      comments: allComments.length,
      requestedPosts: parseInt(maxItems)
    })
    
    let finalResults = [];
    
    if (includeComments) {
      // Comments enabled: return all posts and comments (natural mix)
      console.log('💬 Including all posts and comments');
      finalResults = results; // Return everything as-is
    } else {
      // Comments disabled: return only posts up to requested limit
      console.log(`📝 Posts only: Taking first ${maxItems} posts from ${allPosts.length} available`);
      finalResults = allPosts.slice(0, parseInt(maxItems));
    }
    
    const posts = finalResults.filter(item => item.dataType === 'post');
    console.log('📊 FINAL FILTERED RESULTS:', {
      totalItems: finalResults.length,
      posts: posts.length,
      comments: finalResults.filter(item => item.dataType === 'comment').length
    })
    
    // Format all final results with sentiment analysis (posts and comments if included)
    const formattedResults = finalResults.map(item => ({
      ...item,
      sentiment: item.dataType === 'post' 
        ? calculateBasicSentiment(item.title + ' ' + (item.body || ''))
        : calculateBasicSentiment(item.body || '')
    }));
    console.log('✨ FORMATTED RESULTS:', formattedResults.length, 'items with sentiment analysis')
    
    // Generate analytics based on posts only (even if comments included)
    console.log('📈 GENERATING ANALYTICS...')
    const analytics = generateRedditAnalytics(posts, subreddit, 'subreddit');
    console.log('📈 ANALYTICS GENERATED:', Object.keys(analytics))
    console.log('📤 FINAL SUBREDDIT RESPONSE ANALYTICS:', JSON.stringify(analytics, null, 2))
    
    console.log('✅ SUBREDDIT SEARCH COMPLETED SUCCESSFULLY')
    console.log('=== END SUBREDDIT SEARCH ===\n')
    
    return res.status(200).json({
      success: true,
      mock: false,
      data: formattedResults,
      analytics,
      searchQuery: subreddit,
      searchType: 'subreddit',
      total: formattedResults.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Subreddit search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: 'Failed to search subreddit. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Helper function to build Reddit URLs with sort parameters
function buildRedditSearchUrl(query, searchType, params = {}) {
  const { sortOrder = 'hot', timeRange = null, subreddit = null, username = null } = params;
  
  let baseUrl = 'https://www.reddit.com';
  
  switch (searchType) {
    case 'search':
      // Global search across all Reddit
      baseUrl += `/search/?q=${encodeURIComponent(query)}`;
      break;
      
    case 'subreddit':
      // Subreddit-specific search or browse
      // Clean subreddit name: remove spaces, special chars, and r/ prefix
      const cleanSubreddit = subreddit.replace(/^r\//, '').replace(/\s+/g, '').replace(/[^a-zA-Z0-9_]/g, '');
      
      if (query && query.trim()) {
        // Search within specific subreddit
        baseUrl += `/r/${cleanSubreddit}/search/?q=${encodeURIComponent(query)}&restrict_sr=1`;
      } else {
        // Browse subreddit (no search query)
        baseUrl += `/r/${cleanSubreddit}/`;
      }
      break;
      
    case 'user':
      // User's submitted posts
      // Clean username: remove u/ prefix and encode
      const cleanUsername = username.replace(/^u\//, '');
      baseUrl += `/user/${encodeURIComponent(cleanUsername)}/submitted/`;
      break;
      
    default:
      throw new Error(`Unsupported search type: ${searchType}`);
  }
  
  // Add sort parameter
  if (sortOrder && sortOrder !== 'hot') {
    const sortParam = baseUrl.includes('?') ? '&' : '?';
    baseUrl += `${sortParam}sort=${sortOrder}`;
  }
  
  // Add time range for "top" sort
  if (sortOrder === 'top' && timeRange) {
    baseUrl += `&t=${timeRange}`;
  }
  
  return baseUrl;
}

// Reddit keyword search handler (for searchType: "search")
async function handleRedditKeywordSearch(client, req, res) {
  try {
    console.log('🔍 === REDDIT KEYWORD SEARCH HANDLER START ===')
    
    const { 
      query, 
      sortOrder = 'relevance', 
      timeRange, 
      maxItems = 25,
      includeComments = false
    } = req.body;
    
    console.log('🔍 REDDIT KEYWORD SEARCH PARAMS:', {
      query, sortOrder, timeRange, maxItems, includeComments
    })
    
    if (!query) {
      console.log('❌ REDDIT KEYWORD SEARCH ERROR: Missing query parameter')
      return res.status(400).json({
        error: 'Missing query',
        message: 'Search query is required'
      });
    }
    
    console.log(`🔍 Reddit keyword search: "${query}" | Sort: ${sortOrder} | Items: ${maxItems}`);
    
    // Build simple Apify input for Reddit keyword search (RESTORED WORKING FORMAT)
    console.log('🏗️ BUILDING SIMPLE REDDIT KEYWORD SEARCH INPUT...')
    
    // Ultra simple working Apify input format 
    const input = {
      searches: [query],
      maxItems: parseInt(maxItems)
    };
    
    // Add sort parameters if provided
    if (sortOrder && sortOrder !== 'relevance') {
      input.sort = sortOrder;
    }
    if (sortOrder === 'top' && timeRange) {
      input.time = timeRange; 
    }
    
    // CRITICAL: Backend filtering strategy (Apify always returns mixed posts+comments)
    if (includeComments) {
      console.log('💬 Comments ENABLED: Will return posts with comments');
      // Request normal amount - return mixed posts+comments as-is
      input.maxItems = parseInt(maxItems);
    } else {
      console.log('📝 Posts ONLY: Will filter out comments, requesting extra items');
      // Request 4x more items to ensure we get enough posts after filtering
      input.maxItems = Math.max(parseInt(maxItems) * 4, 100);
    }
    
    console.log('📋 SIMPLE SEARCH INPUT:', JSON.stringify(input, null, 2))
    console.log('✅ Using original working format with sort parameters included')
    console.log('🔗 APIFY API ENDPOINT:', `${client.baseUrl}/acts/trudax~reddit-scraper-lite/runs`)
    console.log('🔑 APIFY TOKEN PREVIEW:', client.token ? `${client.token.substring(0, 8)}...${client.token.substring(client.token.length - 4)}` : 'MISSING')
    
    // Make simple Apify API call
    const runResponse = await fetch(
      `${client.baseUrl}/acts/trudax~reddit-scraper-lite/runs?token=${client.token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input)
      }
    );
    
    console.log('📡 REDDIT SEARCH RESPONSE STATUS:', runResponse.status, runResponse.statusText)
    console.log('📡 REDDIT SEARCH RESPONSE HEADERS:', Object.fromEntries(runResponse.headers.entries()))
    
    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('❌ REDDIT SEARCH API ERROR:', errorText)
      throw new Error(`Apify API error: ${runResponse.status} ${runResponse.statusText} - ${errorText}`);
    }
    
    const runData = await runResponse.json();
    console.log('📋 REDDIT SEARCH RUN DATA:', JSON.stringify(runData, null, 2))
    const runId = runData.data.id;
    console.log('🆔 REDDIT SEARCH RUN ID:', runId)
    
    // DIAGNOSTIC: Wait for completion with detailed logging
    console.log('⏳ WAITING FOR REDDIT SEARCH COMPLETION...')
    const results = await waitForApifyCompletion(client, runId, 60000); // 60 second timeout
    console.log('✅ REDDIT SEARCH COMPLETION RESULTS:')
    console.log('  Results type:', typeof results)
    console.log('  Results is array:', Array.isArray(results))
    console.log('  Results length:', results?.length || 'N/A')
    console.log('  First result sample:', results?.[0] ? JSON.stringify(results[0], null, 2) : 'No results')
    
    // CRITICAL: Process and filter results based on user preference
    console.log('🔄 PROCESSING REDDIT SEARCH RESULTS...')
    console.log(`🎯 User preference: includeComments = ${includeComments}`)
    
    // Separate posts and comments using correct field name
    const allPosts = results.filter(item => item.dataType === 'post');
    const allComments = results.filter(item => item.dataType === 'comment');
    
    console.log('📊 Raw search results breakdown:', {
      totalItems: results.length,
      posts: allPosts.length,
      comments: allComments.length,
      requestedPosts: parseInt(maxItems)
    })
    
    let finalResults = [];
    
    if (includeComments) {
      // Comments enabled: return all posts and comments (natural mix)
      console.log('💬 Including all posts and comments');
      finalResults = results; // Return everything as-is
    } else {
      // Comments disabled: return only posts up to requested limit
      console.log(`📝 Posts only: Taking first ${maxItems} posts from ${allPosts.length} available`);
      finalResults = allPosts.slice(0, parseInt(maxItems));
    }
    
    const posts = finalResults.filter(item => item.dataType === 'post');
    console.log('📊 FINAL SEARCH RESULTS:', {
      totalItems: finalResults.length,
      posts: posts.length,
      comments: finalResults.filter(item => item.dataType === 'comment').length
    })
    
    // Format all final results with sentiment analysis (posts and comments if included)
    const formattedResults = finalResults.map(item => ({
      ...item,
      sentiment: item.dataType === 'post' 
        ? calculateBasicSentiment(item.title + ' ' + (item.body || ''))
        : calculateBasicSentiment(item.body || '')
    }));
    console.log('✨ FORMATTED SEARCH RESULTS:', formattedResults.length, 'items with sentiment analysis')
    
    // Generate analytics based on posts only (even if comments included)
    console.log('📈 GENERATING SEARCH ANALYTICS...')
    const analytics = generateRedditAnalytics(posts, query, 'search');
    console.log('📈 SEARCH ANALYTICS GENERATED:', Object.keys(analytics))
    
    console.log('✅ REDDIT KEYWORD SEARCH COMPLETED SUCCESSFULLY')
    console.log('=== END REDDIT KEYWORD SEARCH ===\n')
    
    return res.status(200).json({
      success: true,
      mock: false,
      data: formattedResults,
      analytics,
      searchQuery: query,
      searchType: 'search',
      total: formattedResults.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Reddit keyword search error:', error);
    return res.status(500).json({
      error: 'Search failed',
      message: 'Failed to search Reddit. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Reddit user search handler (for searchType: "user")
async function handleRedditUserSearch(client, req, res) {
  try {
    console.log('👤 === REDDIT USER SEARCH HANDLER START ===')
    
    const { 
      username, 
      sortOrder = 'new', 
      maxItems = 25,
      includeComments = false
    } = req.body;
    
    console.log('👤 REDDIT USER SEARCH PARAMS:', {
      username, sortOrder, maxItems, includeComments
    })
    
    if (!username) {
      console.log('❌ REDDIT USER SEARCH ERROR: Missing username parameter')
      return res.status(400).json({
        error: 'Missing username',
        message: 'Username is required for user search'
      });
    }
    
    // Clean username (remove u/ prefix if present)
    const cleanUsername = username.replace(/^u\//, '');
    console.log(`👤 Reddit user search: u/${cleanUsername} | Sort: ${sortOrder} | Items: ${maxItems}`);
    
    // DIAGNOSTIC: Build Apify input for Reddit user search with URL-based sort
    console.log('🏗️ BUILDING REDDIT USER SEARCH INPUT...')
    
    // Build Reddit URL with sort parameters for user
    const userUrl = buildRedditSearchUrl('', 'user', { sortOrder, timeRange, username: cleanUsername });
    console.log('🔗 BUILT USER URL:', userUrl);
    
    // Use startUrls parameter to get properly sorted user results
    const input = {
      startUrls: [userUrl],
      maxItems: parseInt(maxItems)
    };
    
    console.log('✅ Using URL-based search to apply sortOrder for user posts')
    
    console.log('📋 FINAL REDDIT USER SEARCH INPUT:', JSON.stringify(input, null, 2))
    console.log('🔗 APIFY API ENDPOINT:', `${client.baseUrl}/acts/trudax~reddit-scraper-lite/runs`)
    console.log('🔑 APIFY TOKEN PREVIEW:', client.token ? `${client.token.substring(0, 8)}...${client.token.substring(client.token.length - 4)}` : 'MISSING')
    
    // DIAGNOSTIC: Making Apify API call for Reddit user search
    console.log('📡 MAKING REDDIT USER SEARCH API CALL...')
    const runResponse = await fetch(
      `${client.baseUrl}/acts/trudax~reddit-scraper-lite/runs?token=${client.token}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input)
      }
    );
    
    console.log('📡 REDDIT USER SEARCH RESPONSE STATUS:', runResponse.status, runResponse.statusText)
    console.log('📡 REDDIT USER SEARCH RESPONSE HEADERS:', Object.fromEntries(runResponse.headers.entries()))
    
    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('❌ REDDIT USER SEARCH API ERROR:', errorText)
      throw new Error(`Apify API error: ${runResponse.status} ${runResponse.statusText} - ${errorText}`);
    }
    
    const runData = await runResponse.json();
    console.log('📋 REDDIT USER SEARCH RUN DATA:', JSON.stringify(runData, null, 2))
    const runId = runData.data.id;
    console.log('🆔 REDDIT USER SEARCH RUN ID:', runId)
    
    // DIAGNOSTIC: Wait for completion with detailed logging
    console.log('⏳ WAITING FOR REDDIT USER SEARCH COMPLETION...')
    const results = await waitForApifyCompletion(client, runId, 60000); // 60 second timeout
    console.log('✅ REDDIT USER SEARCH COMPLETION RESULTS:')
    console.log('  Results type:', typeof results)
    console.log('  Results is array:', Array.isArray(results))
    console.log('  Results length:', results?.length || 'N/A')
    console.log('  First result sample:', results?.[0] ? JSON.stringify(results[0], null, 2) : 'No results')
    
    // CRITICAL: Process and filter results based on user preference
    console.log('🔄 PROCESSING REDDIT USER SEARCH RESULTS...')
    console.log(`🎯 User preference: includeComments = ${includeComments}`)
    
    // Separate posts and comments using correct field name
    const allPosts = results.filter(item => item.dataType === 'post');
    const allComments = results.filter(item => item.dataType === 'comment');
    
    console.log('📊 Raw user results breakdown:', {
      totalItems: results.length,
      posts: allPosts.length,
      comments: allComments.length,
      requestedPosts: parseInt(maxItems)
    })
    
    let finalResults = [];
    
    if (includeComments) {
      // Comments enabled: return all posts and comments (natural mix)
      console.log('💬 Including all posts and comments');
      finalResults = results; // Return everything as-is
    } else {
      // Comments disabled: return only posts up to requested limit
      console.log(`📝 Posts only: Taking first ${maxItems} posts from ${allPosts.length} available`);
      finalResults = allPosts.slice(0, parseInt(maxItems));
    }
    
    const posts = finalResults.filter(item => item.dataType === 'post');
    console.log('📊 FINAL USER RESULTS:', {
      totalItems: finalResults.length,
      posts: posts.length,
      comments: finalResults.filter(item => item.dataType === 'comment').length
    })
    
    // Format all final results with sentiment analysis (posts and comments if included)
    const formattedResults = finalResults.map(item => ({
      ...item,
      sentiment: item.dataType === 'post' 
        ? calculateBasicSentiment(item.title + ' ' + (item.body || ''))
        : calculateBasicSentiment(item.body || '')
    }));
    console.log('✨ FORMATTED USER RESULTS:', formattedResults.length, 'items with sentiment analysis')
    
    // Generate analytics based on posts only (even if comments included)
    console.log('📈 GENERATING USER ANALYTICS...')
    const analytics = generateRedditAnalytics(posts, cleanUsername, 'user');
    console.log('📈 USER ANALYTICS GENERATED:', Object.keys(analytics))
    
    console.log('✅ REDDIT USER SEARCH COMPLETED SUCCESSFULLY')
    console.log('=== END REDDIT USER SEARCH ===\n')
    
    return res.status(200).json({
      success: true,
      mock: false,
      data: formattedResults,
      analytics,
      searchQuery: cleanUsername,
      searchType: 'user',
      total: formattedResults.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Reddit user search error:', error);
    return res.status(500).json({
      error: 'User search failed',
      message: 'Failed to search user. Please try again.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Domain Analytics endpoint - Replicates /api/domain-analytics.js serverless function
app.post('/api/domain-analytics', async (req, res) => {
  const { 
    domainPattern, 
    limit = 10, 
    filterType = 'all', 
    customFilters = null,
    user_id,
    session_id 
  } = req.body

  if (!domainPattern) {
    return res.status(400).json({ error: 'Domain pattern is required' });
  }

  try {
    console.log(`🔍 Domain Analytics Request: ${domainPattern} (${filterType}, limit: ${limit})`)

    // Get DataForSEO credentials from environment (server-side uses non-VITE prefixed vars)
    const DATAFORSEO_LOGIN = process.env.DATAFORSEO_LOGIN || process.env.VITE_DATAFORSEO_LOGIN
    const DATAFORSEO_PASSWORD = process.env.DATAFORSEO_PASSWORD || process.env.VITE_DATAFORSEO_PASSWORD

    // Debug credential loading
    console.log('🔧 DataForSEO Credential Debug:')
    console.log('  All env vars:', Object.keys(process.env).filter(key => key.includes('DATAFORSEO')))
    console.log('  DATAFORSEO_LOGIN exists:', !!DATAFORSEO_LOGIN)
    console.log('  DATAFORSEO_LOGIN value:', DATAFORSEO_LOGIN)
    console.log('  DATAFORSEO_PASSWORD exists:', !!DATAFORSEO_PASSWORD)
    console.log('  DATAFORSEO_PASSWORD value:', DATAFORSEO_PASSWORD)

    if (!DATAFORSEO_LOGIN || !DATAFORSEO_PASSWORD) {
      console.log('❌ Credentials not configured - throwing error')
      throw new Error('DataForSEO credentials not configured')
    }
    
    console.log('✅ Credentials loaded successfully')

    // Create auth header
    const credentials = Buffer.from(`${DATAFORSEO_LOGIN}:${DATAFORSEO_PASSWORD}`).toString('base64')
    const authHeader = `Basic ${credentials}`
    
    // Debug auth header
    console.log('🔒 Auth Header Debug:')
    console.log('  Credentials (base64) length:', credentials.length)
    console.log('  Auth header format:', authHeader.substring(0, 20) + '...')
    console.log('  Auth header starts with "Basic ":', authHeader.startsWith('Basic '))

    // Step 1: PRIMARY - Get domain analytics (WHOIS overview)
    const primaryResults = await getDomainAnalytics({
      domainPattern,
      limit: parseInt(limit),
      filterType,
      customFilters,
      authHeader
    })

    // Step 2: ENHANCED - Get additional data for comprehensive analysis
    const domain = domainPattern
    const cleanDomain = sanitizeDomainForBulkTraffic(domain)

    console.log(`🚀 Starting enhanced analysis for: ${domain}`)

    const [
      bulkTrafficResponse,
      competitorsResponse,
      relevantPagesResponse,
      backlinksResponse,
      domainMetricsResponse
    ] = await Promise.allSettled([
      // Use sanitized domain for bulk traffic API (skip if invalid)
      cleanDomain.length > 0 ? getBulkTrafficEstimation({
        targets: [cleanDomain],
        authHeader
      }) : Promise.reject(new Error('Invalid domain after sanitization')),
      getCompetitorsDomain({
        target: domain,
        authHeader
      }),
      getRelevantPages({
        target: domain,
        authHeader
      }),
      getBacklinksSummary({
        target: domain,
        authHeader
      }),
      getKeywordsForSite({
        target: domain,
        authHeader
      })
    ])

    // Format primary results
    const formattedPrimary = formatDomainResults(primaryResults)

    // Build enhanced data object
    const enhancedData = {
      domain: domain,
      trafficEstimation: bulkTrafficResponse.status === 'fulfilled' ? formatBulkTrafficResults(bulkTrafficResponse.value) : [],
      competitors: competitorsResponse.status === 'fulfilled' ? formatCompetitorsResults(competitorsResponse.value) : [],
      relevantPages: relevantPagesResponse.status === 'fulfilled' ? formatRelevantPagesResults(relevantPagesResponse.value) : [],
      backlinks: backlinksResponse.status === 'fulfilled' ? formatBacklinksResults(backlinksResponse.value) : {},
      domainMetrics: domainMetricsResponse.status === 'fulfilled' ? formatKeywordsForSiteResults(domainMetricsResponse.value) : [],
      endpointStatus: {
        bulkTraffic: bulkTrafficResponse.status,
        competitors: competitorsResponse.status,
        relevantPages: relevantPagesResponse.status,
        backlinks: backlinksResponse.status,
        domainMetrics: domainMetricsResponse.status
      },
      errors: {
        bulkTraffic: bulkTrafficResponse.status === 'rejected' ? bulkTrafficResponse.reason?.message : null,
        competitors: competitorsResponse.status === 'rejected' ? competitorsResponse.reason?.message : null,
        relevantPages: relevantPagesResponse.status === 'rejected' ? relevantPagesResponse.reason?.message : null,
        backlinks: backlinksResponse.status === 'rejected' ? backlinksResponse.reason?.message : null,
        domainMetrics: domainMetricsResponse.status === 'rejected' ? domainMetricsResponse.reason?.message : null
      }
    }

    // Count successful endpoints and total data points
    const successfulEndpoints = 1 + Object.values(enhancedData.endpointStatus).filter(status => status === 'fulfilled').length
    const totalDataPoints = (
      formattedPrimary.length +
      enhancedData.trafficEstimation.length +
      enhancedData.competitors.length +
      enhancedData.relevantPages.length +
      (Object.keys(enhancedData.backlinks).length > 0 ? 1 : 0) +
      enhancedData.domainMetrics.length
    )

    console.log(`✅ Domain analysis complete: ${successfulEndpoints}/5 endpoints successful, ${totalDataPoints} data points`)

    // Return comprehensive results (same format as serverless function)
    return res.status(200).json({
      success: true,
      results: {
        primary: formattedPrimary,
        enhanced: enhancedData
      },
      meta: {
        endpointsSuccessful: successfulEndpoints,
        totalEndpoints: 5,
        totalDataPoints,
        domain,
        cleanDomain,
        filterType,
        limit: parseInt(limit)
      }
    })

  } catch (error) {
    console.error('❌ Domain Analytics Error:', error)
    return res.status(500).json({ 
      error: error.message || 'Failed to retrieve domain analytics',
      details: error.stack
    })
  }
})

// Helper functions for domain analytics (server-side implementation)
function sanitizeDomainForBulkTraffic(domainInput) {
  if (!domainInput || typeof domainInput !== 'string') {
    return ''
  }

  let cleanDomain = domainInput.trim()

  // Remove wildcards (%) that work in WHOIS API but not bulk traffic API
  cleanDomain = cleanDomain.replace(/%/g, '')

  // Remove protocols
  cleanDomain = cleanDomain.replace(/^https?:\/\//, '')
  cleanDomain = cleanDomain.replace(/^ftp:\/\//, '')

  // Remove www. prefix if present
  cleanDomain = cleanDomain.replace(/^www\./, '')

  // Remove trailing slashes and paths
  cleanDomain = cleanDomain.split('/')[0]
  cleanDomain = cleanDomain.split('?')[0]
  cleanDomain = cleanDomain.split('#')[0]

  // Remove port numbers
  cleanDomain = cleanDomain.split(':')[0]

  // Basic domain validation - should contain at least one dot
  if (!cleanDomain.includes('.') || cleanDomain.length < 3) {
    return ''
  }

  return cleanDomain
}

async function getDomainAnalytics({
  domainPattern,
  limit = 10,
  filterType = 'all',
  customFilters = null,
  authHeader
}) {
  // Build filters based on filter type
  let filters = []

  if (filterType === 'expiring') {
    // Domains expiring in next 90 days
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 90)
    filters = [
      ["expiration_datetime", "<", futureDate.toISOString().split('.')[0] + " +00:00"],
      "and",
      ["domain", "like", domainPattern]
    ]
  } else if (filterType === 'high_traffic') {
    // Domains with high organic traffic
    filters = [
      ["domain", "like", domainPattern],
      "and",
      ["metrics.organic.etv", ">", 1000]
    ]
  } else if (filterType === 'high_backlinks') {
    // Domains with high backlinks
    filters = [
      ["domain", "like", domainPattern],
      "and",
      ["backlinks_info.referring_domains", ">", 100]
    ]
  } else if (filterType === 'custom' && customFilters) {
    // Use custom filters provided
    filters = customFilters
  } else {
    // Default: just domain pattern
    filters = [["domain", "like", domainPattern]]
  }

  const requestBody = [
    {
      limit: limit,
      filters: filters,
      order_by: ["metrics.organic.etv,desc"]
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/domain_analytics/whois/overview/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  // Check for API-level errors
  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

async function getBulkTrafficEstimation({
  targets,
  languageCode = 'en',
  locationCode = 2840,
  authHeader
}) {
  const requestBody = [
    {
      targets,
      language_code: languageCode,
      location_code: locationCode
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/bulk_traffic_estimation/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

async function getCompetitorsDomain({
  target,
  languageCode = 'en',
  locationCode = 2840,
  limit = 100,
  authHeader
}) {
  const requestBody = [
    {
      target,
      language_code: languageCode,
      location_code: locationCode,
      limit
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/competitors_domain/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

async function getRelevantPages({
  target,
  languageCode = 'en',
  locationCode = 2840,
  limit = 100,
  authHeader
}) {
  const requestBody = [
    {
      target,
      language_code: languageCode,
      location_code: locationCode,
      limit
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/relevant_pages/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

async function getBacklinksSummary({
  target,
  filters = null,
  authHeader
}) {
  const requestBody = [
    {
      target,
      ...(filters && { filters })
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/backlinks/summary/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

async function getKeywordsForSite({
  target,
  languageCode = 'en',
  locationCode = 2840,
  limit = 100,
  authHeader
}) {
  const requestBody = [
    {
      target,
      language_code: languageCode,
      location_code: locationCode,
      limit,
      order_by: ["search_volume,desc"]
    }
  ]

  const response = await fetch('https://api.dataforseo.com/v3/dataforseo_labs/google/keywords_for_site/live', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new Error(errorData.status_message || `API request failed with status ${response.status}`)
  }

  const data = await response.json()

  if (data.status_code !== 20000) {
    throw new Error(data.status_message || 'API returned an error')
  }

  return data
}

function formatDomainResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result[0]

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    domain: item.domain,
    created: item.created_datetime,
    expires: item.expiration_datetime,
    updated: item.updated_datetime,
    firstSeen: item.first_seen,
    backlinks: {
      total: item.backlinks_info?.backlinks || 0,
      referringDomains: item.backlinks_info?.referring_domains || 0,
      referringIps: item.backlinks_info?.referring_ips || 0
    },
    organic: {
      pos1: item.metrics?.organic?.pos_1 || 0,
      pos2_3: item.metrics?.organic?.pos_2_3 || 0,
      pos4_10: item.metrics?.organic?.pos_4_10 || 0,
      pos11_20: item.metrics?.organic?.pos_11_20 || 0,
      etv: item.metrics?.organic?.etv || 0,
      count: item.metrics?.organic?.count || 0
    },
    paid: {
      pos1: item.metrics?.paid?.pos_1 || 0,
      pos2_3: item.metrics?.paid?.pos_2_3 || 0,
      pos4_10: item.metrics?.paid?.pos_4_10 || 0,
      etv: item.metrics?.paid?.etv || 0,
      count: item.metrics?.paid?.count || 0
    }
  }))
}

function formatBulkTrafficResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    target: item.target,
    trafficEstimation: {
      organicEtv: item.metrics?.organic?.etv || 0,
      organicTraffic: item.metrics?.organic?.count || 0,
      organicClicks: item.metrics?.organic?.estimated_paid_traffic_cost || 0,
      monthlyVisits: item.metrics?.organic?.estimated_paid_traffic_cost || 0,
      monthlyClicks: item.metrics?.organic?.count || 0,
      paidEtv: item.metrics?.paid?.etv || 0
    }
  }))
}

function formatCompetitorsResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    domain: item.domain,
    avgPosition: item.avg_position,
    overlapScore: item.metrics?.intersections_count || 0,
    intersections: item.metrics?.intersections_count || 0,
    fullDomainMetrics: {
      organicKeywords: item.full_domain_metrics?.organic?.count || 0,
      organicCost: item.full_domain_metrics?.organic?.etv || 0
    }
  }))
}

function formatRelevantPagesResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    page: item.page,
    title: item.page_title || 'N/A',
    metrics: {
      organicKeywords: item.metrics?.organic?.count || 0,
      organicTraffic: item.metrics?.organic?.count || 0,
      organicCost: item.metrics?.organic?.etv || 0
    }
  }))
}

function formatBacklinksResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return {}
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items || results.items.length === 0) {
    return {}
  }

  const item = results.items[0]

  return {
    totalBacklinks: item.backlinks || 0,
    totalReferringDomains: item.referring_domains || 0,
    authorityScore: item.rank || 0,
    trustFlow: item.trust || 0,
    backlinkGrowth: {
      monthlyGrowth: item.new_backlinks || 0
    }
  }
}

function formatKeywordsForSiteResults(apiResponse) {
  if (!apiResponse.tasks || !apiResponse.tasks[0] || !apiResponse.tasks[0].result) {
    return []
  }

  const results = apiResponse.tasks[0].result

  if (!results || !results.items) {
    return []
  }

  return results.items.map(item => ({
    keyword: item.keyword_data?.keyword || '',
    searchVolume: item.keyword_data?.keyword_info?.search_volume || 0,
    cpc: item.keyword_data?.keyword_info?.cpc || 0,
    competitionLevel: item.keyword_data?.keyword_info?.competition || 'N/A',
    searchIntent: item.keyword_data?.search_intent_info?.main_intent || 'N/A',
    detectedLanguage: item.keyword_data?.language_code || 'en',
    difficulty: item.keyword_data?.keyword_info?.difficulty || 0
  }))
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend server is running' })
})

// Apify API Test Endpoint - For debugging Reddit integration
app.get('/api/test-apify', async (req, res) => {
  try {
    console.log('\n🧪 === APIFY API TEST START ===')
    
    // Check environment variables
    const apiKey = process.env.APIFY_API_KEY || process.env.APIFY_API_TOKEN || process.env.apify_api_key;
    console.log('🔑 API Key available:', !!apiKey)
    console.log('🔑 API Key preview:', apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'NOT FOUND')
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'No Apify API key found',
        message: 'Please set APIFY_API_KEY in your .env file',
        checkedVars: ['APIFY_API_KEY', 'APIFY_API_TOKEN', 'apify_api_key']
      });
    }
    
    // Test basic API connectivity
    console.log('📡 Testing Apify API connectivity...')
    const testUrl = `https://api.apify.com/v2/acts/trudax~reddit-scraper-lite?token=${apiKey}`;
    console.log('📡 Test URL:', testUrl.replace(apiKey, `${apiKey.substring(0, 8)}...`))
    
    const response = await fetch(testUrl);
    console.log('📡 Response status:', response.status, response.statusText)
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API test failed:', errorText)
      return res.status(response.status).json({
        error: 'Apify API test failed',
        status: response.status,
        statusText: response.statusText,
        message: errorText
      });
    }
    
    const data = await response.json();
    console.log('✅ API test successful')
    console.log('🔗 Actor info:', data.data?.name || 'Unknown')
    console.log('📊 Full API response:', JSON.stringify(data, null, 2))
    
    // Test actual Reddit scraping with simple URL
    console.log('📡 Testing actual Reddit scraping...')
    console.log('📡 About to test Reddit scraping functionality')
    const testInput = {
      startUrls: ["https://www.reddit.com/"],
      maxItems: 1,
      skipComments: true,
      skipCommunityInfo: true
    };
    
    console.log('📋 Test input:', JSON.stringify(testInput, null, 2))
    
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/trudax~reddit-scraper-lite/runs?token=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testInput)
      }
    );
    
    console.log('📡 Run response status:', runResponse.status, runResponse.statusText)
    
    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error('❌ Reddit scraping test failed:', errorText)
      return res.status(200).json({
        success: true,
        message: 'Apify API is accessible but Reddit scraping failed',
        actor: {
          name: data.data?.name,
          username: data.data?.username,
          id: data.data?.id
        },
        apiKeyStatus: 'Valid',
        scrapingTest: {
          success: false,
          error: errorText
        }
      });
    }
    
    const runData = await runResponse.json();
    console.log('✅ Reddit scraping test successful')
    console.log('🆔 Run ID:', runData.data?.id)
    console.log('=== END APIFY TEST ===\n')
    
    return res.status(200).json({
      success: true,
      message: 'Apify API is accessible and Reddit scraping works',
      actor: {
        name: data.data?.name,
        username: data.data?.username,
        id: data.data?.id
      },
      apiKeyStatus: 'Valid',
      scrapingTest: {
        success: true,
        runId: runData.data?.id
      }
    });
    
  } catch (error) {
    console.error('❌ Apify test error:', error)
    console.log('=== END APIFY TEST ERROR ===\n')
    
    return res.status(500).json({
      error: 'Apify test failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
})

// NEW: Account-specific tweet saving functionality (Dev Server)
// This function handles saving tweets to the database when account searches are performed
async function saveAccountSpecificTweets(accountUsername, tweets, searchData) {
  // Development server has direct Supabase access with service role key
  console.log(`📊 Account-specific saving requested for @${accountUsername} with ${tweets.length} tweets`)
  
  if (!supabase) {
    console.warn('⚠️ Supabase client not available - returning frontend-compatible data structure')
    return {
      accountData: {
        username: accountUsername.replace(/^@/, ''),
        shouldSave: true,
        tweetCount: tweets.length,
        searchTimestamp: new Date().toISOString()
      },
      formattedTweets: tweets.map(tweet => ({
        ...tweet,
        isAccountSpecific: true,
        accountUsername: accountUsername.replace(/^@/, ''),
        collectedAt: new Date().toISOString()
      })),
      searchMetadata: {
        searchType: 'account-specific',
        filters: searchData || {},
        timestamp: new Date().toISOString()
      }
    }
  }
  
  try {
    // Extract account metadata from tweets
    const accountMetadata = extractAccountMetadata(tweets, accountUsername)
    
    // Upsert account information
    const { data: accountData, error: accountError } = await supabase
      .from('twitter_accounts')
      .upsert({
        ...accountMetadata,
        last_updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      }, {
        onConflict: 'username'
      })
      .select()
      .single()
    
    if (accountError) {
      console.error('❌ Account upsert error:', accountError)
      throw accountError
    }
    
    console.log(`✅ Account data upserted for @${accountUsername}`)
    
    // Prepare tweets for insertion with account linkage
    const formattedTweets = tweets.map(tweet => {
      const engagementRate = calculateEngagementRate(tweet)
      
      // DEBUG: Log tweet structure to understand reply data
      console.log(`🔍 DEBUG Tweet structure for ${tweet.id}:`, {
        hasRepliesArray: !!tweet.replies,
        repliesType: typeof tweet.replies,
        repliesValue: Array.isArray(tweet.replies) ? `array[${tweet.replies.length}]` : tweet.replies,
        hasMetricsReplies: !!tweet.metrics?.replies,
        metricsRepliesValue: tweet.metrics?.replies,
        includeMentions: !!tweet.replies // This should be true when replies are fetched
      })
      
      return {
        session_id: null, // Will be set by frontend when session is created
        tweet_id: tweet.id,
        tweet_text: tweet.text,
        created_at: tweet.created_at,
        author_username: tweet.author?.username || accountUsername.replace(/^@/, ''),
        author_name: tweet.author?.name,
        author_verified: tweet.author?.verified || false,
        author_followers: tweet.author?.followers || 0,
        author_profile_image: tweet.author?.profile_image,
        likes: tweet.metrics?.likes || 0,
        retweets: tweet.metrics?.retweets || 0,
        replies: tweet.replies || [], // FIXED: Store actual reply objects array, not count
        quotes: tweet.metrics?.quotes || 0,
        views: tweet.metrics?.views || 0,
        sentiment_label: tweet.sentiment?.label,
        sentiment_score: tweet.sentiment?.score,
        sentiment_confidence: tweet.sentiment?.confidence,
        hashtags: tweet.hashtags || [],
        mentions: tweet.mentions || [],
        urls: tweet.urls || [],
        media_type: tweet.media_type,
        tweet_url: tweet.url,
        search_type: 'account',
        matched_keywords: tweet.matched_keywords || [],
        // Account-specific fields
        account_id: accountData.id,
        is_account_specific: true,
        account_followers_at_time: tweet.author?.followers || 0,
        account_following_at_time: tweet.author?.following || 0,
        engagement_rate: parseFloat(engagementRate),
        is_reply_to_account: tweet.text?.includes(`@${accountUsername.replace(/^@/, '')}`) || false,
        conversation_starter_id: tweet.conversation_id || null,
        thread_position: 1
      }
    })
    
    // Insert tweets to database using UPSERT to handle duplicates
    // FIXED: Explicitly update replies, mentions, and other fields on conflict
    const { data: insertedTweets, error: tweetsError } = await supabase
      .from('twitter_tweets')
      .upsert(formattedTweets, {
        onConflict: 'tweet_id,account_id',
        ignoreDuplicates: false,
        defaultToNull: false
      })
      .select('id, tweet_id')
    
    if (tweetsError) {
      console.error('❌ Tweet insertion error:', tweetsError)
      throw tweetsError
    }
    
    console.log(`✅ Successfully saved ${insertedTweets?.length || 0} account-specific tweets for @${accountUsername}`)
    
    // Return frontend-compatible format for existing callers
    return {
      accountData: {
        username: accountUsername.replace(/^@/, ''),
        shouldSave: true,
        tweetCount: insertedTweets?.length || 0,
        searchTimestamp: new Date().toISOString(),
        metadata: {
          username: accountUsername.replace(/^@/, ''),
          display_name: accountData.display_name,
          followers_count: accountData.followers_count,
          verified: accountData.verified,
          profile_image_url: accountData.profile_image_url
        }
      },
      formattedTweets: tweets.map(tweet => ({
        ...tweet,
        isAccountSpecific: true,
        accountUsername: accountUsername.replace(/^@/, ''),
        collectedAt: new Date().toISOString()
      })),
      searchMetadata: {
        searchType: 'account-specific',
        filters: searchData || {},
        timestamp: new Date().toISOString(),
        savedToDatabase: true,
        accountId: accountData.id,
        avgEngagement: formattedTweets.length > 0 ? 
          (formattedTweets.reduce((sum, tweet) => sum + tweet.engagement_rate, 0) / formattedTweets.length).toFixed(4) : '0.0000'
      }
    }
    
  } catch (error) {
    console.error('❌ Account-specific saving error:', error)
    // Return frontend-compatible format even on error
    return {
      accountData: {
        username: accountUsername.replace(/^@/, ''),
        shouldSave: false,
        tweetCount: 0,
        searchTimestamp: new Date().toISOString(),
        error: error.message
      },
      formattedTweets: [],
      searchMetadata: {
        searchType: 'account-specific-error',
        filters: searchData || {},
        timestamp: new Date().toISOString(),
        savedToDatabase: false,
        error: error.message
      }
    }
  }
}

// API-compatible wrapper for account-specific saving (Dev Server)
// This function returns { success, data, error } format for API endpoints
async function saveAccountSpecificTweetsForAPI(accountUsername, tweets, searchData) {
  try {
    console.log(`🌐 API wrapper: Calling saveAccountSpecificTweets for @${accountUsername}`)
    
    // Call the original function that returns frontend-compatible format
    const result = await saveAccountSpecificTweets(accountUsername, tweets, searchData)
    
    // Check if saving was successful based on accountData.shouldSave
    if (!result || !result.accountData || result.accountData.shouldSave === false) {
      return {
        success: false,
        error: result?.accountData?.error || 'Failed to save account-specific tweets',
        data: null
      }
    }
    
    // Convert to API format
    return {
      success: true,
      data: {
        accountId: result.searchMetadata?.accountId || null,
        username: result.accountData.username,
        tweetsCount: result.accountData.tweetCount || 0,
        avgEngagement: result.searchMetadata?.avgEngagement || '0.0000',
        timestamp: result.accountData.searchTimestamp
      },
      message: `Successfully saved ${result.accountData.tweetCount || 0} account-specific tweets`
    }
    
  } catch (error) {
    console.error('❌ API wrapper error:', error)
    return {
      success: false,
      error: error.message,
      data: null
    }
  }
}

// Helper function to extract account metadata from tweets (Dev Server)
function extractAccountMetadata(tweets, accountUsername) {
  if (!tweets || tweets.length === 0) {
    return {
      username: accountUsername.replace(/^@/, ''),
      display_name: null,
      followers_count: 0,
      verified: false,
      profile_image_url: null,
      bio: null
    }
  }
  
  // Get account info from the first tweet's author data
  const firstTweet = tweets[0]
  const author = firstTweet.author || {}
  
  return {
    username: accountUsername.replace(/^@/, ''),
    display_name: author.name || null,
    followers_count: author.followers || 0,
    following_count: author.following || 0,
    verified: author.verified || false,
    profile_image_url: author.profile_image || null,
    bio: author.bio || null,
    tweet_count: author.tweet_count || 0
  }
}

// Function to calculate engagement rate for a tweet (Dev Server)
function calculateEngagementRate(tweet) {
  if (!tweet.metrics || !tweet.author?.followers) {
    return 0
  }
  
  const totalEngagement = (tweet.metrics.likes || 0) + 
                         (tweet.metrics.retweets || 0) + 
                         (tweet.metrics.replies || 0)
  
  if (tweet.author.followers === 0) return 0
  
  return (totalEngagement / tweet.author.followers).toFixed(4)
}

// Handler for save-account-specific action - bypasses RLS issues (development server)
async function handleSaveAccountSpecific(req, res) {
  try {
    const { username, tweets, searchParams, accountMetadata } = req.body;

    if (!username || !tweets || !Array.isArray(tweets)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'Missing required fields: username, tweets array'
      });
    }

    console.log(`🎯 Development Server: Saving account-specific tweets for @${username}`, {
      tweetCount: tweets.length,
      sessionId: searchParams?.sessionId
    });

    // Call the API-compatible wrapper function
    const result = await saveAccountSpecificTweetsForAPI(username, tweets, searchParams);

    if (!result || !result.success) {
      throw new Error(result?.error || 'Failed to save account-specific tweets');
    }

    return res.status(200).json({
      success: true,
      data: result.data,
      message: result.message || `Successfully saved ${tweets.length} account-specific tweets for @${username}`
    });

  } catch (error) {
    console.error('❌ Development server save-account-specific error:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to save account-specific tweets'
    });
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Backend server running on http://localhost:${PORT}`)
  console.log(`📡 YouTube API: http://localhost:${PORT}/api/youtube-search`)
  console.log(`📺 YouTube Channel API: http://localhost:${PORT}/api/youtube-channel-search`)
  console.log(`🐦 Twitter API: http://localhost:${PORT}/api/twitter-analytics`)
  console.log(`🔍 Reddit API: http://localhost:${PORT}/api/reddit-analytics`)
  console.log(`📰 News API: http://localhost:${PORT}/api/news-analytics`)
  console.log(`🏢 Domain Analytics API: http://localhost:${PORT}/api/domain-analytics`)
  console.log(`✨ Ready to process requests\n`)
})
