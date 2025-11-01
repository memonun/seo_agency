// Vercel Serverless Function
// YouTube channel search + video analysis + AI summarization

import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = supabaseUrl && supabaseServiceKey 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null

export default async function handler(req, res) {
  console.log(`\n🎯 SERVERLESS CHANNEL SEARCH ENDPOINT HIT`)
  console.log(`   Method: ${req.method}`)
  console.log(`   Request body:`, req.body)
  
  // Only allow POST
  if (req.method !== 'POST') {
    console.error(`❌ Method not allowed: ${req.method}`)
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { keyword: channelInput, user_id, search_id, email } = req.body

  if (!channelInput) {
    console.error(`❌ Missing channel input`)
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
          transcript = await fetchTranscriptWithRetry(video.video_id, 3)
          console.log(`   ✓ [${i + 1}/${maxVideos}] Transcript fetched`)
        } catch (transcriptError) {
          console.warn(`   ⚠ [${i + 1}/${maxVideos}] Transcript error: ${transcriptError.message}`)
        }

        try {
          console.log(`   [${i + 1}/${maxVideos}] Fetching comments...`)
          comments = await fetchVideoComments(video.video_id)
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
}

// Helper Functions

/**
 * Extract channel ID from various formats
 */
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

/**
 * Fetch channel videos using YT-API
 */
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

// Reuse existing functions from youtube-search.js
async function fetchTranscriptWithRetry(videoId, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetchTranscript(videoId)
    } catch (error) {
      if (error.message.includes('429') && attempt < maxRetries) {
        const waitTime = attempt * 2000
        console.log(`   ⏳ Rate limited, waiting ${waitTime/1000}s before retry ${attempt}/${maxRetries}...`)
        await sleep(waitTime)
        continue
      }
      throw error
    }
  }
}

async function fetchTranscript(videoId) {
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY
  const RAPIDAPI_HOST = 'yt-api.p.rapidapi.com'

  const url = `https://${RAPIDAPI_HOST}/get_transcript?id=${videoId}`

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

  // Convert YT-API transcript format to expected format
  return data.transcript.map(item => ({
    text: item.text || '',
    offset: parseInt(item.startMs) / 1000 || 0 // Convert milliseconds to seconds
  }))
}

async function fetchVideoComments(videoId) {
  const RAPIDAPI_KEY = process.env.VITE_RAPIDAPI_KEY
  const RAPIDAPI_HOST = 'yt-api.p.rapidapi.com'

  const url = `https://${RAPIDAPI_HOST}/comments?id=${videoId}`

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
  
  // Handle regular numbers
  const num = parseInt(cleanStr.replace(/,/g, ''))
  return isNaN(num) ? 0 : num
}

function processTimestamps(transcript) {
  return transcript.map(entry => {
    const offsetInSeconds = entry.offset

    const hours = Math.floor(offsetInSeconds / 3600)
    const minutes = Math.floor((offsetInSeconds % 3600) / 60)
    const seconds = Math.floor(offsetInSeconds % 60)

    const formattedMinutes = minutes < 10 ? `0${minutes}` : `${minutes}`
    const formattedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`

    const timestamp = hours > 0
      ? `${hours}:${formattedMinutes}:${formattedSeconds}`
      : `${minutes}:${formattedSeconds}`

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
    const topComments = comments.items.slice(0, 10).map(comment => ({
      author: comment.authorDisplayName,
      text: comment.textDisplay,
      likes: comment.likeCount,
      replies: comment.replies
    }))
    contentData += `TOP COMMENTS (${comments.totalCount} total):\n${JSON.stringify(topComments)}`
  }

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

  const userPrompt = `Analyze this YouTube video data for "${videoTitle}":

${contentData}

Provide a comprehensive summary that includes both content analysis and community engagement insights.`

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
    console.log('🔧 === SERVERLESS CHANNEL ANALYTICS DATABASE SAVE DEBUG ===')
    console.log('📥 Input parameters:')
    console.log('   userId:', userId)
    console.log('   searchId:', searchId)
    console.log('   channelInput:', channelInput)
    console.log('   channelId:', channelId)
    console.log('   email:', email)
    console.log('   rawChannelData length:', rawChannelData?.length || 0)
    console.log('   videosWithSummaries length:', videosWithSummaries?.length || 0)
    console.log('   overallSummary length:', overallSummary?.length || 0)

    // Use module-level Supabase client
    console.log('🔑 Environment variables check:')
    console.log('   VITE_SUPABASE_URL exists:', !!supabaseUrl)
    console.log('   SUPABASE_SERVICE_ROLE_KEY exists:', !!supabaseServiceKey)
    console.log('   VITE_SUPABASE_URL value:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'undefined')
    
    if (!supabase) {
      console.error('❌ CRITICAL: Supabase client not initialized!')
      console.log('⏭️ Skipping database save - Supabase not configured')
      return null
    }

    console.log('✅ Supabase client created successfully')
    console.log('💾 Saving channel analytics to database...')

    // Prepare analysis data for channel session
    const analysisData = {
      metadata: {
        totalVideos: rawChannelData.length,
        successfulAnalysis: videosWithSummaries.filter(v => !v.summary.startsWith('⚠️')).length,
        processingTimestamp: new Date().toISOString(),
        apiVersion: '1.0',
        aiModel: 'google/gemini-2.0-flash-001',
        apisUsed: ['yt-api'],
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}