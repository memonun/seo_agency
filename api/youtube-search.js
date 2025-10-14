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

    // Step 2: Process videos sequentially with rate limiting to avoid 429 errors
    const videosWithSummaries = []
    
    for (let i = 0; i < youtubeVideos.length; i++) {
      const video = youtubeVideos[i]
      
      try {
        console.log(`   [${i + 1}/${youtubeVideos.length}] Processing: ${video.title.substring(0, 50)}...`)
        
        // Fetch transcript with retry logic
        const transcript = await fetchTranscriptWithRetry(video.video_id, 3)

        // Process timestamps
        const processedTranscript = processTimestamps(transcript)

        // Summarize with AI
        const summary = await summarizeWithAI(processedTranscript, video.title)

        videosWithSummaries.push({
          ...video,
          summary: summary,
          position: i + 1
        })

        console.log(`   ✓ [${i + 1}/${youtubeVideos.length}] Summary complete`)
        
        // Add delay between requests to prevent rate limiting (only if not the last video)
        if (i < youtubeVideos.length - 1) {
          await sleep(1000) // 1 second delay between requests
        }
        
      } catch (error) {
        console.error(`   ✗ [${i + 1}/${youtubeVideos.length}] Error: ${error.message}`)
        videosWithSummaries.push({
          ...video,
          summary: '⚠️ Transcript not available for this video.',
          position: i + 1
        })
      }
    }

    // Return combined response
    return res.status(200).json({
      status: 'success',
      keyword,
      videos: videosWithSummaries
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

async function summarizeWithAI(transcript, videoTitle) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY

  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key not configured')
  }

  // Prepare transcript text
  const transcriptText = JSON.stringify(transcript)

  // System message from n8n Agent
  const systemMessage = `You are a professional video content summarizer. Given the transcript of a YouTube video, your task is to produce a clear, concise summary that captures the key points, main ideas, and any notable quotes or takeaways.

If you receive the message 'SKIP_THIS_VIDEO', respond ONLY with: "⚠️ Transcript not available for this video."

Otherwise, follow this format:

Summary: Write a detailed summary of the video in 3–5 paragraphs.

Key Takeaways: 
* First key point with timestamp (MM:SS)
* Second key point with timestamp (MM:SS)
* Third key point with timestamp (MM:SS)
(Continue with additional bullet points as needed)

IMPORTANT: Each key takeaway MUST start with "* " to create proper markdown bullet points. Include the timestamp in parentheses at the end of each bullet point.

Timestamps: If timestamps are provided in the transcript, match them to the corresponding summarized content.

Guidelines:

Keep the tone neutral and informative.
Do not copy/paste large chunks of the transcript.
Do not include filler words or irrelevant segments.
Emphasize educational, emotional, or value-driven content.
ALWAYS format Key Takeaways as markdown bullet points starting with "* ".

Output: A structured summary using the format above.
THE WHOLE OUTPUT LENGTH SHOULD BE MAXIMUM 4000 CHARACTERS.`

  // User prompt from n8n Agent
  const userPrompt = `Please summarize the following video transcript. For each key point, include the timestamp where the topic is discussed.

The transcript is provided as a JSON array, with the text and formatted timestamp for each segment.

Here is the transcript:

${transcriptText}`

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
