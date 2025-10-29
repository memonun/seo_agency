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

// Twitter Search Cache
const TWITTER_CACHE_PREFIX = 'twitter_search_params_'

const getTwitterCacheKey = (userId) => {
  return `${TWITTER_CACHE_PREFIX}${userId}`
}

/**
 * Save Twitter search parameters to localStorage
 */
export const saveTwitterSearchParams = (userId, params) => {
  try {
    const cacheData = {
      ...params,
      timestamp: Date.now()
    }
    localStorage.setItem(getTwitterCacheKey(userId), JSON.stringify(cacheData))
    return true
  } catch (error) {
    console.error('Error saving Twitter search params:', error)
    return false
  }
}

/**
 * Load Twitter search parameters from localStorage
 */
export const loadTwitterSearchParams = (userId) => {
  try {
    const cached = localStorage.getItem(getTwitterCacheKey(userId))
    if (!cached) return null

    const parsedCache = JSON.parse(cached)

    // Check if cache is still valid (24 hours)
    if (!isCacheValid(parsedCache)) {
      clearTwitterSearchParams(userId)
      return null
    }

    return parsedCache
  } catch (error) {
    console.error('Error loading Twitter search params:', error)
    return null
  }
}

/**
 * Clear Twitter search parameters from localStorage
 */
export const clearTwitterSearchParams = (userId) => {
  try {
    localStorage.removeItem(getTwitterCacheKey(userId))
    return true
  } catch (error) {
    console.error('Error clearing Twitter search params:', error)
    return false
  }
}

// Twitter Results Cache
const TWITTER_RESULTS_PREFIX = 'twitter_results_'

const getTwitterResultsCacheKey = (userId) => {
  return `${TWITTER_RESULTS_PREFIX}${userId}`
}

/**
 * Save Twitter search results to localStorage
 */
export const saveTwitterResults = (userId, data) => {
  try {
    const cacheData = {
      ...data,
      timestamp: Date.now()
    }
    localStorage.setItem(getTwitterResultsCacheKey(userId), JSON.stringify(cacheData))
    return true
  } catch (error) {
    console.error('Error saving Twitter results:', error)
    return false
  }
}

/**
 * Load Twitter search results from localStorage
 */
export const loadTwitterResults = (userId) => {
  try {
    const cached = localStorage.getItem(getTwitterResultsCacheKey(userId))
    if (!cached) return null

    const parsedCache = JSON.parse(cached)

    // Check if cache is still valid (24 hours)
    if (!isCacheValid(parsedCache)) {
      clearTwitterResults(userId)
      return null
    }

    return parsedCache
  } catch (error) {
    console.error('Error loading Twitter results:', error)
    return null
  }
}

/**
 * Clear Twitter search results from localStorage
 */
export const clearTwitterResults = (userId) => {
  try {
    localStorage.removeItem(getTwitterResultsCacheKey(userId))
    return true
  } catch (error) {
    console.error('Error clearing Twitter results:', error)
    return false
  }
}

// Reddit Search Cache
const REDDIT_CACHE_PREFIX = 'reddit_search_params_'

const getRedditCacheKey = (userId) => {
  return `${REDDIT_CACHE_PREFIX}${userId}`
}

/**
 * Save Reddit search parameters to localStorage
 */
export const saveRedditSearchParams = (userId, params) => {
  try {
    const cacheData = {
      ...params,
      timestamp: Date.now()
    }
    localStorage.setItem(getRedditCacheKey(userId), JSON.stringify(cacheData))
    return true
  } catch (error) {
    console.error('Error saving Reddit search params:', error)
    return false
  }
}

/**
 * Load Reddit search parameters from localStorage
 */
export const loadRedditSearchParams = (userId) => {
  try {
    const cached = localStorage.getItem(getRedditCacheKey(userId))
    if (!cached) return null

    const parsedCache = JSON.parse(cached)

    if (!isCacheValid(parsedCache)) {
      clearRedditSearchParams(userId)
      return null
    }

    return parsedCache
  } catch (error) {
    console.error('Error loading Reddit search params:', error)
    return null
  }
}

/**
 * Clear Reddit search parameters from localStorage
 */
export const clearRedditSearchParams = (userId) => {
  try {
    localStorage.removeItem(getRedditCacheKey(userId))
    return true
  } catch (error) {
    console.error('Error clearing Reddit search params:', error)
    return false
  }
}

// Reddit Results Cache
const REDDIT_RESULTS_PREFIX = 'reddit_results_'

const getRedditResultsCacheKey = (userId) => {
  return `${REDDIT_RESULTS_PREFIX}${userId}`
}

/**
 * Save Reddit search results to localStorage
 */
export const saveRedditResults = (userId, data) => {
  try {
    const cacheData = {
      ...data,
      timestamp: Date.now()
    }
    localStorage.setItem(getRedditResultsCacheKey(userId), JSON.stringify(cacheData))
    return true
  } catch (error) {
    console.error('Error saving Reddit results:', error)
    return false
  }
}

/**
 * Load Reddit search results from localStorage
 */
export const loadRedditResults = (userId) => {
  try {
    const cached = localStorage.getItem(getRedditResultsCacheKey(userId))
    if (!cached) return null

    const parsedCache = JSON.parse(cached)

    if (!isCacheValid(parsedCache)) {
      clearRedditResults(userId)
      return null
    }

    return parsedCache
  } catch (error) {
    console.error('Error loading Reddit results:', error)
    return null
  }
}

/**
 * Clear Reddit search results from localStorage
 */
export const clearRedditResults = (userId) => {
  try {
    localStorage.removeItem(getRedditResultsCacheKey(userId))
    return true
  } catch (error) {
    console.error('Error clearing Reddit results:', error)
    return false
  }
}

// Reddit Search Progress State Management
const REDDIT_PROGRESS_PREFIX = 'reddit_progress_'

const getRedditProgressKey = (userId) => {
  return `${REDDIT_PROGRESS_PREFIX}${userId}`
}

/**
 * Search progress states
 */
export const SEARCH_STATES = {
  IDLE: 'idle',
  SEARCHING: 'searching', 
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  ERROR: 'error'
}

/**
 * Save Reddit search progress state
 */
export const saveRedditSearchProgress = (userId, progressData) => {
  try {
    const progressState = {
      ...progressData,
      timestamp: Date.now(),
      lastUpdated: Date.now()
    }
    localStorage.setItem(getRedditProgressKey(userId), JSON.stringify(progressState))
    return true
  } catch (error) {
    console.error('Error saving Reddit search progress:', error)
    return false
  }
}

/**
 * Load Reddit search progress state
 */
export const loadRedditSearchProgress = (userId) => {
  try {
    const cached = localStorage.getItem(getRedditProgressKey(userId))
    if (!cached) return null

    const parsedProgress = JSON.parse(cached)
    
    // Check if progress is stale (older than 1 hour)
    const PROGRESS_TIMEOUT = 60 * 60 * 1000 // 1 hour
    if (Date.now() - parsedProgress.lastUpdated > PROGRESS_TIMEOUT) {
      clearRedditSearchProgress(userId)
      return null
    }

    return parsedProgress
  } catch (error) {
    console.error('Error loading Reddit search progress:', error)
    return null
  }
}

/**
 * Update Reddit search progress state
 */
export const updateRedditSearchProgress = (userId, updates) => {
  try {
    const existing = loadRedditSearchProgress(userId)
    if (!existing) return false

    const updatedProgress = {
      ...existing,
      ...updates,
      lastUpdated: Date.now()
    }
    
    return saveRedditSearchProgress(userId, updatedProgress)
  } catch (error) {
    console.error('Error updating Reddit search progress:', error)
    return false
  }
}

/**
 * Clear Reddit search progress state
 */
export const clearRedditSearchProgress = (userId) => {
  try {
    localStorage.removeItem(getRedditProgressKey(userId))
    return true
  } catch (error) {
    console.error('Error clearing Reddit search progress:', error)
    return false
  }
}

/**
 * Check if there's an ongoing Reddit search
 */
export const hasOngoingRedditSearch = (userId) => {
  const progress = loadRedditSearchProgress(userId)
  return progress && progress.state === SEARCH_STATES.SEARCHING
}

/**
 * Get Reddit search status
 */
export const getRedditSearchStatus = (userId) => {
  const progress = loadRedditSearchProgress(userId)
  return progress ? progress.state : SEARCH_STATES.IDLE
}
