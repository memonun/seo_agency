/**
 * TikTok Scraper - JavaScript Version
 *
 * Uses Apify SDK for TikTok scraping (serverless-friendly approach)
 * Replaces Playwright-based Python implementation
 *
 * Apify Actor: apify/tiktok-scraper
 */

import { ApifyClient } from 'apify-client';

// Apify actor ID for TikTok scraper
const TIKTOK_ACTOR_ID = 'clockworks/tiktok-scraper';

/**
 * TikTok scraper class
 */
export class TikTokScraper {
  constructor(apifyToken) {
    if (!apifyToken) {
      throw new Error('Apify API token is required');
    }

    this.apify = new ApifyClient({ token: apifyToken });
    this.actorId = TIKTOK_ACTOR_ID;
  }

  /**
   * Extract hashtags from text
   * @param {string} text - Text to extract from
   * @returns {string[]} Array of hashtags
   */
  extractHashtags(text) {
    if (!text) return [];

    const pattern = /#[\w\u0080-\uFFFF]+/g;
    const hashtags = text.match(pattern) || [];

    // Return unique hashtags, limit to 30
    return [...new Set(hashtags)].slice(0, 30);
  }

  /**
   * Extract mentions from text
   * @param {string} text - Text to extract from
   * @returns {string[]} Array of mentions
   */
  extractMentions(text) {
    if (!text) return [];

    const pattern = /@[\w.]+/g;
    const mentions = text.match(pattern) || [];

    // Return unique mentions, limit to 30
    return [...new Set(mentions)].slice(0, 30);
  }

  /**
   * Parse input to determine type
   * @param {string} inputStr - Input string (URL, hashtag, or username)
   * @returns {object} Parsed input with type and value
   */
  parseInput(inputStr) {
    const input = inputStr.trim();

    // Check if it's a URL
    if (input.startsWith('http')) {
      if (input.includes('tiktok.com')) {
        // Extract type from URL
        if (input.includes('/tag/')) {
          // Hashtag URL
          const match = input.match(/\/tag\/([^/?]+)/);
          return {
            type: 'hashtag',
            value: match ? match[1] : input
          };
        } else if (input.includes('/@')) {
          // Profile URL
          return {
            type: 'profile',
            value: input
          };
        } else {
          // General URL
          return {
            type: 'url',
            value: input
          };
        }
      }
    }

    // Check if it's a hashtag (starts with #)
    if (input.startsWith('#')) {
      return {
        type: 'hashtag',
        value: input.replace(/^#/, '')
      };
    }

    // Check if it's a username (starts with @)
    if (input.startsWith('@')) {
      return {
        type: 'profile',
        value: `https://www.tiktok.com/${input}`
      };
    }

    // Otherwise treat as search query
    return {
      type: 'search',
      value: input
    };
  }

  /**
   * Prepare Apify input for hashtag scraping
   * @param {string} hashtag - Hashtag to scrape (without #)
   * @param {number} limit - Results limit
   * @returns {object} Apify input configuration
   */
  prepareHashtagInput(hashtag, limit = 200) {
    const cleanHashtag = hashtag.replace(/^#/, '');

    return {
      hashtags: [cleanHashtag],
      resultsPerPage: Math.min(limit, 1000), // Apify max
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false
    };
  }

  /**
   * Prepare Apify input for profile scraping
   * @param {string} profileUrl - Profile URL or username
   * @param {number} limit - Results limit
   * @returns {object} Apify input configuration
   */
  prepareProfileInput(profileUrl, limit = 200) {
    // Ensure it's a full URL
    let url = profileUrl;
    if (!profileUrl.startsWith('http')) {
      const username = profileUrl.replace(/^@/, '');
      url = `https://www.tiktok.com/@${username}`;
    }

    return {
      profiles: [url],
      resultsPerPage: Math.min(limit, 1000),
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false
    };
  }

  /**
   * Prepare Apify input for search query
   * @param {string} query - Search query
   * @param {number} limit - Results limit
   * @returns {object} Apify input configuration
   */
  prepareSearchInput(query, limit = 200) {
    return {
      searchQueries: [query],
      resultsPerPage: Math.min(limit, 1000),
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false
    };
  }

  /**
   * Run Apify actor and get results
   * @param {object} runInput - Apify actor input
   * @returns {Promise<object[]>} Array of items from dataset
   */
  async runActorAndGetResults(runInput) {
    try {
      console.log('Starting Apify TikTok actor with input:', JSON.stringify(runInput, null, 2));

      // Run the actor
      const run = await this.apify.actor(this.actorId).call(runInput);

      // Get dataset ID
      const datasetId = run.defaultDatasetId;
      console.log('Actor completed. Dataset ID:', datasetId);

      // Fetch results from dataset
      const dataset = this.apify.dataset(datasetId);
      const { items } = await dataset.listItems({ limit: 999999 }); // Get all items

      console.log(`Retrieved ${items.length} items from dataset`);

      if (items.length > 0) {
        console.log('Sample item keys:', Object.keys(items[0]));
      }

      return items;

    } catch (error) {
      console.error('Error running Apify TikTok actor:', error);
      throw error;
    }
  }

  /**
   * Safe integer conversion
   * @param {*} value - Value to convert
   * @param {number} defaultValue - Default if conversion fails
   * @returns {number} Integer value
   */
  safeInt(value, defaultValue = 0) {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) return defaultValue;

    try {
      return parseInt(value, 10) || defaultValue;
    } catch {
      return defaultValue;
    }
  }

  /**
   * Safe string conversion
   * @param {*} value - Value to convert
   * @param {string} defaultValue - Default if conversion fails
   * @returns {string} String value
   */
  safeStr(value, defaultValue = '') {
    if (value === null || value === undefined) return defaultValue;
    return String(value);
  }

  /**
   * Normalize TikTok video data from Apify
   * @param {object} item - Raw item from Apify
   * @param {string} sourceType - Source type (hashtag, profile, search)
   * @param {string} sourceValue - Source value
   * @returns {object} Normalized video data
   */
  normalizeVideoData(item, sourceType = '', sourceValue = '') {
    try {
      // Apify TikTok scraper returns different structure
      // Main fields are directly on item
      const videoId = this.safeStr(item.id || item.videoId);
      if (!videoId) return null;

      // Get text/description
      const text = this.safeStr(item.text || item.desc || item.description);

      // Extract hashtags and mentions
      const hashtags = item.hashtags || this.extractHashtags(text);
      const mentions = item.mentions || this.extractMentions(text);

      // Author data
      const authorData = item.authorMeta || item.author || {};

      // Stats data
      const diggCount = this.safeInt(item.diggCount || item.likesCount);
      const shareCount = this.safeInt(item.shareCount || item.sharesCount);
      const commentCount = this.safeInt(item.commentCount || item.commentsCount);
      const playCount = this.safeInt(item.playCount || item.viewsCount || item.views);

      // Music data
      const musicData = item.musicMeta || item.music || {};

      // Video metadata
      const videoMeta = item.videoMeta || {};

      return {
        video_id: videoId,
        text,
        caption: text, // Alias for compatibility
        author_username: this.safeStr(authorData.name || authorData.uniqueId || authorData.nickname),
        author_nickname: this.safeStr(authorData.nickname || authorData.name),
        author_id: this.safeStr(authorData.id),
        author_verified: Boolean(authorData.verified),
        author_followers: this.safeInt(authorData.fans || authorData.followerCount),
        author_following: this.safeInt(authorData.following || authorData.followingCount),
        author_hearts: this.safeInt(authorData.heart || authorData.heartCount),
        author_videos: this.safeInt(authorData.video || authorData.videoCount),
        author_signature: this.safeStr(authorData.signature),
        likes: diggCount,
        shares: shareCount,
        comments: commentCount,
        views: playCount,
        video_url: this.safeStr(item.videoUrl || item.webVideoUrl),
        cover_url: this.safeStr(item.covers?.default || item.coverUrl),
        video_duration: this.safeInt(videoMeta.duration || item.videoDuration),
        create_time: this.safeInt(item.createTime || item.timestamp),
        hashtags,
        mentions,
        music_id: this.safeStr(musicData.musicId || musicData.id),
        music_title: this.safeStr(musicData.musicName || musicData.title),
        music_author: this.safeStr(musicData.musicAuthor || musicData.author),
        music_original: Boolean(musicData.musicOriginal || musicData.original),
        is_ad: Boolean(item.isAd),
        is_duet: Boolean(item.duetEnabled),
        is_stitch: Boolean(item.stitchEnabled),
        source_type: sourceType,
        source_value: sourceValue,
        post_url: this.safeStr(item.webVideoUrl || `https://www.tiktok.com/@${authorData.name}/video/${videoId}`)
      };

    } catch (error) {
      console.error('Error normalizing TikTok video:', error);
      return null;
    }
  }

  /**
   * Normalize multiple videos
   * @param {object[]} items - Raw items from Apify
   * @param {string} sourceType - Source type
   * @param {string} sourceValue - Source value
   * @returns {object[]} Normalized videos
   */
  normalizeVideos(items, sourceType, sourceValue) {
    console.log(`Processing ${items.length} TikTok videos`);

    const videos = [];

    for (const item of items) {
      const video = this.normalizeVideoData(item, sourceType, sourceValue);
      if (video) {
        videos.push(video);
      }
    }

    console.log(`Normalized ${videos.length} videos`);
    return videos;
  }

  /**
   * Scrape hashtag
   * @param {string} hashtag - Hashtag to scrape
   * @param {number} limit - Results limit
   * @returns {Promise<object[]>} Normalized videos
   */
  async scrapeHashtag(hashtag, limit = 200) {
    console.log(`Scraping TikTok hashtag: #${hashtag}`);

    const input = this.prepareHashtagInput(hashtag, limit);
    const items = await this.runActorAndGetResults(input);

    return this.normalizeVideos(items, 'hashtag', hashtag);
  }

  /**
   * Scrape profile
   * @param {string} profileUrl - Profile URL or username
   * @param {number} limit - Results limit
   * @returns {Promise<object[]>} Normalized videos
   */
  async scrapeProfile(profileUrl, limit = 200) {
    console.log(`Scraping TikTok profile: ${profileUrl}`);

    const input = this.prepareProfileInput(profileUrl, limit);
    const items = await this.runActorAndGetResults(input);

    return this.normalizeVideos(items, 'profile', profileUrl);
  }

  /**
   * Scrape search query
   * @param {string} query - Search query
   * @param {number} limit - Results limit
   * @returns {Promise<object[]>} Normalized videos
   */
  async scrapeSearch(query, limit = 200) {
    console.log(`Scraping TikTok search: ${query}`);

    const input = this.prepareSearchInput(query, limit);
    const items = await this.runActorAndGetResults(input);

    return this.normalizeVideos(items, 'search', query);
  }
}

export default TikTokScraper;

/**
 * Convenience wrapper function for compatibility with existing code
 * Matches the interface expected by server endpoints
 *
 * @param {object} options - Scraping options
 * @param {string[]} options.searchQueries - Array of search queries to scrape
 * @param {number} options.maxVideosPerQuery - Max videos per query (default: 50)
 * @param {boolean} options.includeComments - Whether to include comments (NOT IMPLEMENTED - reserved for future)
 * @param {number} options.maxCommentsPerVideo - Max comments per video (NOT IMPLEMENTED - reserved for future)
 * @param {string} options.apifyToken - Apify API token (optional, falls back to env)
 * @returns {Promise<Array>} Array of normalized video objects
 */
export async function scrapeTikTok({
  searchQueries = [],
  profileUrls = [],
  maxVideosPerQuery = 50,
  includeComments = false,
  maxCommentsPerVideo = 20,
  apifyToken
}) {
  console.log('🎵 TikTok Scraper initialized (Apify SDK)');
  console.log(`   Search queries: ${searchQueries.length}`);
  console.log(`   Profile URLs: ${profileUrls.length}`);
  console.log(`   Max videos per query: ${maxVideosPerQuery}`);

  if (includeComments) {
    console.log('⚠️  Comment scraping not yet implemented - ignoring includeComments parameter');
  }

  // Get token from parameter or environment
  const token = apifyToken || process.env.APIFY_API_TOKEN;

  if (!token) {
    throw new Error('APIFY_API_TOKEN is required for TikTok scraping. Set it in .env or pass as parameter.');
  }

  // Initialize scraper
  const scraper = new TikTokScraper(token);
  const allResults = [];

  try {
    // Process search queries
    for (const query of searchQueries) {
      console.log(`🔍 Scraping TikTok for: ${query}`);

      try {
        // Determine if it's a hashtag or regular search
        const isHashtag = query.trim().startsWith('#');

        let videos;
        if (isHashtag) {
          // Remove # and scrape as hashtag
          const cleanHashtag = query.replace('#', '').trim();
          videos = await scraper.scrapeHashtag(cleanHashtag, maxVideosPerQuery);
        } else {
          // Regular search query
          videos = await scraper.scrapeSearch(query, maxVideosPerQuery);
        }

        allResults.push(...videos);
        console.log(`✅ Found ${videos.length} videos for query: ${query}`);

      } catch (error) {
        console.error(`❌ Error scraping query "${query}":`, error.message);
        // Continue with next query instead of failing completely
        continue;
      }
    }

    // Process profile URLs
    for (const profileUrl of profileUrls) {
      console.log(`👤 Scraping TikTok profile: ${profileUrl}`);

      try {
        const videos = await scraper.scrapeProfile(profileUrl, maxVideosPerQuery);
        allResults.push(...videos);
        console.log(`✅ Found ${videos.length} videos from profile`);

      } catch (error) {
        console.error(`❌ Error scraping profile "${profileUrl}":`, error.message);
        continue;
      }
    }

    console.log(`📥 Retrieved ${allResults.length} TikTok videos total`);
    return allResults;

  } catch (error) {
    console.error('❌ TikTok scraping error:', error);
    throw new Error(`TikTok scraping failed: ${error.message}`);
  }
}
