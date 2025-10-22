// Vercel Serverless Function
// Replicates n8n workflow: YouTube search + transcript + AI summarization

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { keyword, user_id, search_id, email } = req.body

  if (!keyword) {
    return res.status(400).json({ error: 'Keyword is required' })
  }

  try {
    // Step 1: Fetch 10 YouTube videos from RapidAPI YouTube138
    const youtubeVideos = await fetchYouTubeVideos(keyword)

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
        search_id, 
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
