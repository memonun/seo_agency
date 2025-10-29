// YouTube URL validation and normalization utilities

/**
 * Extract video ID from various YouTube URL formats
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null if invalid
 */
export const extractVideoId = (url) => {
  if (!url || typeof url !== 'string') return null

  try {
    // Clean up the URL
    const cleanUrl = url.trim()

    // Pattern 1: youtube.com/watch?v=VIDEO_ID
    const watchPattern = /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/
    const watchMatch = cleanUrl.match(watchPattern)
    if (watchMatch) return watchMatch[1]

    // Pattern 2: youtu.be/VIDEO_ID
    const shortPattern = /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/
    const shortMatch = cleanUrl.match(shortPattern)
    if (shortMatch) return shortMatch[1]

    // Pattern 3: youtube.com/embed/VIDEO_ID
    const embedPattern = /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/
    const embedMatch = cleanUrl.match(embedPattern)
    if (embedMatch) return embedMatch[1]

    // Pattern 4: m.youtube.com/watch?v=VIDEO_ID
    const mobilePattern = /(?:m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/
    const mobileMatch = cleanUrl.match(mobilePattern)
    if (mobileMatch) return mobileMatch[1]

    // Pattern 5: youtube.com/v/VIDEO_ID
    const vPattern = /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/
    const vMatch = cleanUrl.match(vPattern)
    if (vMatch) return vMatch[1]

    return null
  } catch (error) {
    console.error('Error extracting video ID:', error)
    return null
  }
}

/**
 * Check if URL is a valid YouTube video URL
 * @param {string} url - URL to validate
 * @returns {boolean} - True if valid video URL
 */
export const isValidVideoUrl = (url) => {
  if (!url || typeof url !== 'string') return false

  // Reject channel URLs
  if (url.includes('/channel/') || url.includes('/@') || url.includes('/c/')) {
    return false
  }

  // Reject playlist URLs
  if (url.includes('/playlist') || url.includes('list=')) {
    return false
  }

  // Check if we can extract a valid video ID
  const videoId = extractVideoId(url)
  return videoId !== null && videoId.length === 11
}

/**
 * Normalize YouTube URL to standard format
 * @param {string} url - YouTube URL or video ID
 * @returns {string} - Normalized URL: https://www.youtube.com/watch?v=VIDEO_ID
 */
export const normalizeYouTubeUrl = (url) => {
  const videoId = extractVideoId(url)
  if (!videoId) return url // Return original if can't extract ID

  return `https://www.youtube.com/watch?v=${videoId}`
}

/**
 * Process array of YouTube video data: validate, normalize, deduplicate
 * @param {Array} youtubeData - Array of objects with url, title, description
 * @returns {Array} - Cleaned array of valid, normalized videos
 */
export const processYouTubeVideos = (youtubeData) => {
  if (!Array.isArray(youtubeData)) return []

  // Track seen video IDs to prevent duplicates
  const seenIds = new Set()
  const processedVideos = []

  for (const video of youtubeData) {
    // Skip if no URL
    if (!video || !video.url) continue

    // Validate URL
    if (!isValidVideoUrl(video.url)) continue

    // Extract video ID
    const videoId = extractVideoId(video.url)
    if (!videoId) continue

    // Skip duplicates
    if (seenIds.has(videoId)) continue
    seenIds.add(videoId)

    // Add normalized video
    processedVideos.push({
      ...video,
      url: normalizeYouTubeUrl(video.url),
      video_id: videoId
    })
  }

  return processedVideos
}

/**
 * Get video ID from normalized URL (quick helper)
 * @param {string} url - Normalized YouTube URL
 * @returns {string|null} - Video ID
 */
export const getVideoIdFromUrl = (url) => {
  return extractVideoId(url)
}

/**
 * Extract channel ID from various YouTube channel URL formats
 * @param {string} input - Channel URL, handle, or ID
 * @returns {string|null} - Channel ID or null if invalid
 */
export const extractChannelId = (input) => {
  if (!input || typeof input !== 'string') return null

  try {
    const cleanInput = input.trim()

    // Pattern 1: Direct channel ID (UC...)
    if (/^UC[a-zA-Z0-9_-]{22}$/.test(cleanInput)) {
      return cleanInput
    }

    // Pattern 2: @username format
    const handleMatch = cleanInput.match(/^@([a-zA-Z0-9_.-]+)$/)
    if (handleMatch) {
      return `@${handleMatch[1]}` // Return as handle for API
    }

    // Pattern 3: youtube.com/channel/CHANNEL_ID
    const channelPattern = /(?:youtube\.com\/channel\/)([a-zA-Z0-9_-]+)/
    const channelMatch = cleanInput.match(channelPattern)
    if (channelMatch) return channelMatch[1]

    // Pattern 4: youtube.com/c/CUSTOM_NAME
    const customPattern = /(?:youtube\.com\/c\/)([a-zA-Z0-9_-]+)/
    const customMatch = cleanInput.match(customPattern)
    if (customMatch) return `@${customMatch[1]}` // Convert to handle format

    // Pattern 5: youtube.com/user/USERNAME  
    const userPattern = /(?:youtube\.com\/user\/)([a-zA-Z0-9_-]+)/
    const userMatch = cleanInput.match(userPattern)
    if (userMatch) return `@${userMatch[1]}`

    // Pattern 6: youtube.com/@username
    const atPattern = /(?:youtube\.com\/@)([a-zA-Z0-9_.-]+)/
    const atMatch = cleanInput.match(atPattern)
    if (atMatch) return `@${atMatch[1]}`

    // Pattern 7: m.youtube.com variants
    const mobileChannelPattern = /(?:m\.youtube\.com\/channel\/)([a-zA-Z0-9_-]+)/
    const mobileChannelMatch = cleanInput.match(mobileChannelPattern)
    if (mobileChannelMatch) return mobileChannelMatch[1]

    return null
  } catch (error) {
    console.error('Error extracting channel ID:', error)
    return null
  }
}

/**
 * Check if input is a valid YouTube channel identifier
 * @param {string} input - Input to validate
 * @returns {boolean} - True if valid channel identifier
 */
export const isValidChannelInput = (input) => {
  if (!input || typeof input !== 'string') return false

  // Check if we can extract a valid channel ID
  const channelId = extractChannelId(input)
  return channelId !== null
}

/**
 * Normalize channel input to a consistent format for API calls
 * @param {string} input - Channel URL, handle, or ID
 * @returns {string} - Normalized channel identifier
 */
export const normalizeChannelInput = (input) => {
  const channelId = extractChannelId(input)
  return channelId || input // Return original if can't extract
}
