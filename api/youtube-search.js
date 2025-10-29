// Vercel Serverless Function
// Replicates n8n workflow: YouTube search + transcript + AI summarization

import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { keyword, user_id, search_id, email, filters = {} } = req.body

  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' })
  }

  try {
    // Step 1: Fetch 10 YouTube videos from YT-API (consolidated) with filters
    const youtubeVideos = await fetchYouTubeVideosYTAPI(keyword, filters)

    if (youtubeVideos.length === 0) {
      return res.status(404).json({ error: 'No videos found' })
    }

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
        search_id, 
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

    // Return combined response
    return res.status(200).json({
      status: 'success',
      keyword,
      overallSummary,
      videos: videosWithSummaries,
      databaseId // Include for reference
    })
  } catch (error) {
    console.error('Error in youtube-search:', error)
    return res.status(500).json({
      error: 'Failed to process request',
      message: error.message
    })
  }
}

// Helper Functions

// OLD YOUTUBE138 FUNCTION REMOVED - REPLACED WITH YT-API

// NEW YT-API FUNCTIONS - Testing consolidated API endpoints

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
  if (filters.geo_filter) params.append('lang', filters.geo_filter) // Use lang parameter for language filtering

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

// YT-API CONSOLIDATION COMPLETE - REMOVED OLD APIS

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

// REMOVED - No longer needed with YT-API consolidation

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
    // Skip if Supabase client is not available
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

// Utility functions for data retrieval and reproducibility

async function getYouTubeAnalyticsByKeyword(userId, keyword, limit = 5) {
  try {
    if (!supabase) {
      console.log('⏭️ Skipping database query - Supabase not configured')
      return []
    }

    const { data, error } = await supabase
      .from('youtube_analytics_sessions')
      .select('id, keyword, created_at, analysis_data')
      .eq('user_id', userId)
      .eq('keyword', keyword)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('❌ Database query error:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('❌ Database query exception:', error.message)
    return []
  }
}

async function getYouTubeAnalyticsById(userId, analysisId) {
  try {
    if (!supabase) {
      console.log('⏭️ Skipping database query - Supabase not configured')
      return null
    }

    const { data, error } = await supabase
      .from('youtube_analytics_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('id', analysisId)
      .single()

    if (error) {
      console.error('❌ Database query error:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('❌ Database query exception:', error.message)
    return null
  }
}

async function getUserYouTubeAnalyticsHistory(userId, limit = 20) {
  try {
    if (!supabase) {
      console.log('⏭️ Skipping database query - Supabase not configured')
      return []
    }

    const { data, error } = await supabase
      .from('youtube_analytics_sessions')
      .select('id, keyword, created_at, analysis_data->metadata, analysis_data->overallSummary')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      console.error('❌ Database query error:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('❌ Database query exception:', error.message)
    return []
  }
}

// Function to extract raw data for reprocessing
async function getRawDataForReprocessing(userId, analysisId) {
  try {
    if (!supabase) {
      console.log('⏭️ Skipping database query - Supabase not configured')
      return null
    }

    const { data, error } = await supabase
      .from('youtube_analytics_sessions')
      .select('analysis_data->rawData, keyword')
      .eq('user_id', userId)
      .eq('id', analysisId)
      .single()

    if (error) {
      console.error('❌ Database query error:', error)
      return null
    }

    return {
      keyword: data.keyword,
      rawYouTubeData: data.analysis_data?.rawData?.youtubeApiResponse?.videos || [],
      rawCommentsData: data.analysis_data?.rawData?.commentsApiResponse?.videoComments || {}
    }
  } catch (error) {
    console.error('❌ Database query exception:', error.message)
    return null
  }
}
