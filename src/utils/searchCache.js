// Search cache utility using localStorage
// Persists search state for retry functionality

const CACHE_PREFIX = 'search_cache_'
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * Get cache key for specific user
 */
const getCacheKey = (userId) => {
  return `${CACHE_PREFIX}${userId}`
}

/**
 * Check if cache is still valid (not expired)
 */
export const isCacheValid = (cache) => {
  if (!cache || !cache.timestamp) return false
  return (Date.now() - cache.timestamp) < CACHE_DURATION
}

/**
 * Save search cache to localStorage
 */
export const saveSearchCache = (userId, data) => {
  try {
    const cacheData = {
      ...data,
      timestamp: Date.now()
    }
    localStorage.setItem(getCacheKey(userId), JSON.stringify(cacheData))
    return true
  } catch (error) {
    console.error('Error saving search cache:', error)
    return false
  }
}

/**
 * Load search cache from localStorage
 */
export const loadSearchCache = (userId) => {
  try {
    const cached = localStorage.getItem(getCacheKey(userId))
    if (!cached) return null

    const parsedCache = JSON.parse(cached)

    // Check if cache is still valid
    if (!isCacheValid(parsedCache)) {
      clearSearchCache(userId)
      return null
    }

    return parsedCache
  } catch (error) {
    console.error('Error loading search cache:', error)
    return null
  }
}

/**
 * Clear search cache from localStorage
 */
export const clearSearchCache = (userId) => {
  try {
    localStorage.removeItem(getCacheKey(userId))
    return true
  } catch (error) {
    console.error('Error clearing search cache:', error)
    return false
  }
}

/**
 * Check if cache exists for user
 */
export const hasCachedSearch = (userId) => {
  const cache = loadSearchCache(userId)
  return cache !== null
}

// YouTube Results Cache
const YOUTUBE_CACHE_PREFIX = 'youtube_results_'

const getYouTubeCacheKey = (userId) => {
  return `${YOUTUBE_CACHE_PREFIX}${userId}`
}

/**
 * Save YouTube search results to localStorage
 */
export const saveYouTubeResults = (userId, data) => {
  try {
    const cacheData = {
      ...data,
      timestamp: Date.now()
    }
    localStorage.setItem(getYouTubeCacheKey(userId), JSON.stringify(cacheData))
    return true
  } catch (error) {
    console.error('Error saving YouTube results:', error)
    return false
  }
}

/**
 * Load YouTube search results from localStorage
 */
export const loadYouTubeResults = (userId) => {
  try {
    const cached = localStorage.getItem(getYouTubeCacheKey(userId))
    if (!cached) return null

    const parsedCache = JSON.parse(cached)

    // Check if cache is still valid (24 hours)
    if (!isCacheValid(parsedCache)) {
      clearYouTubeResults(userId)
      return null
    }

    return parsedCache
  } catch (error) {
    console.error('Error loading YouTube results:', error)
    return null
  }
}

/**
 * Clear YouTube search results from localStorage
 */
export const clearYouTubeResults = (userId) => {
  try {
    localStorage.removeItem(getYouTubeCacheKey(userId))
    return true
  } catch (error) {
    console.error('Error clearing YouTube results:', error)
    return false
  }
}
