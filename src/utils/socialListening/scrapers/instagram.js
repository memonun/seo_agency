/**
 * Instagram Scraper - JavaScript Version
 *
 * Ported from social_scrapers/instagram reference code
 * Uses Apify SDK for Instagram hashtag and profile scraping
 */

import { ApifyClient } from 'apify-client';

// Apify actor ID for Instagram scraper
const INSTAGRAM_ACTOR_ID = 'apify/instagram-scraper';

/**
 * Instagram scraper class
 */
export class InstagramScraper {
  constructor(apifyToken) {
    if (!apifyToken) {
      throw new Error('Apify API token is required');
    }

    this.apify = new ApifyClient({ token: apifyToken });
    this.actorId = INSTAGRAM_ACTOR_ID;
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
   * Clean caption text
   * @param {string} caption - Raw caption
   * @param {number} maxLength - Maximum length
   * @returns {string} Cleaned caption
   */
  cleanCaption(caption, maxLength = 2000) {
    if (!caption) return '';

    let cleaned = String(caption);

    // Remove excessive escaping
    cleaned = cleaned.replace(/\\n/g, '\n');
    cleaned = cleaned.replace(/\\t/g, ' ');
    cleaned = cleaned.replace(/\\"/g, '"');
    cleaned = cleaned.replace(/\\'/g, "'");

    // Limit length
    return cleaned.slice(0, maxLength);
  }

  /**
   * Prepare Apify input for hashtag scraping
   * @param {string} hashtag - Hashtag to scrape (with or without #)
   * @param {number} limit - Results limit
   * @returns {object} Apify input configuration
   */
  prepareHashtagInput(hashtag, limit = 200) {
    const cleanHashtag = hashtag.replace(/^#/, '');

    return {
      addParentData: false,
      enhanceUserSearchWithFacebookPage: false,
      isUserReelFeedURL: false,
      isUserTaggedFeedURL: false,
      resultsLimit: limit,
      resultsType: 'posts', // Get actual posts
      searchType: 'hashtag',
      searchLimit: limit,
      search: cleanHashtag
    };
  }

  /**
   * Prepare Apify input for profile scraping
   * @param {string} profileUrl - Profile URL or username
   * @param {number} limit - Results limit
   * @returns {object} Apify input configuration
   */
  prepareProfileInput(profileUrl, limit = 200) {
    // If it's a username (not URL), convert to URL
    let url = profileUrl;
    if (!profileUrl.startsWith('http')) {
      url = `https://www.instagram.com/${profileUrl.replace(/^@/, '')}/`;
    }

    return {
      addParentData: false,
      directUrls: [url],
      enhanceUserSearchWithFacebookPage: false,
      isUserReelFeedURL: false,
      isUserTaggedFeedURL: false,
      resultsLimit: limit,
      resultsType: 'posts',
      searchType: 'hashtag' // Keep as 'hashtag' even for profiles (Apify quirk)
    };
  }

  /**
   * Run Apify actor and get results
   * @param {object} runInput - Apify actor input
   * @returns {Promise<object[]>} Array of items from dataset
   */
  async runActorAndGetResults(runInput) {
    try {
      console.log('Starting Apify actor with input:', JSON.stringify(runInput, null, 2));

      // Run the actor
      const run = await this.apify.actor(this.actorId).call(runInput);

      // Get dataset ID
      const datasetId = run.defaultDatasetId;
      console.log('Actor completed. Dataset ID:', datasetId);

      // Fetch results from dataset
      const dataset = this.apify.dataset(datasetId);
      const { items } = await dataset.listItems({ limit: runInput.resultsLimit * 2 });

      console.log(`Retrieved ${items.length} items from dataset`);

      if (items.length > 0) {
        console.log('Sample item keys:', Object.keys(items[0]));
      }

      return items;

    } catch (error) {
      console.error('Error running Apify actor:', error);
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
   * Normalize hashtag data
   * @param {object[]} items - Raw items from Apify
   * @param {string} hashtag - Original hashtag
   * @returns {object} Normalized hashtag data
   */
  normalizeHashtagData(items, hashtag) {
    console.log(`Processing hashtag data for #${hashtag}`);

    if (!items || items.length === 0) {
      console.warn(`No data for hashtag #${hashtag}`);
      return null;
    }

    const hashtagClean = hashtag.replace(/^#/, '').toLowerCase();
    const posts = [];
    let totalEngagement = 0;
    const uniqueUsers = new Set();

    // Valid post types
    const validTypes = ['image', 'video', 'sidecar', 'carousel', 'graphimage', 'graphvideo', 'graphsidecar'];

    for (const item of items) {
      try {
        // Check if it's a valid post
        const postType = item.type || '';
        if (!validTypes.includes(postType.toLowerCase())) {
          continue;
        }

        // Get post ID
        const postId = item.id || item.pk || item.shortCode;
        if (!postId) continue;

        // Get engagement metrics
        const likes = this.safeInt(item.likesCount);
        const comments = this.safeInt(item.commentsCount);
        const ownerUsername = this.safeStr(item.ownerUsername);

        // Clean caption
        const caption = this.cleanCaption(item.caption, 500);

        // Create post object
        const post = {
          id: String(postId),
          shortCode: this.safeStr(item.shortCode),
          caption,
          likesCount: likes,
          commentsCount: comments,
          timestamp: this.safeStr(item.timestamp),
          ownerUsername,
          type: postType,
          url: this.safeStr(item.url)
        };

        posts.push(post);
        totalEngagement += likes + comments;

        if (ownerUsername) {
          uniqueUsers.add(ownerUsername);
        }

      } catch (error) {
        console.error('Error processing hashtag post:', error);
        continue;
      }
    }

    if (posts.length === 0) {
      console.warn(`No valid posts found for #${hashtag}`);
      return null;
    }

    const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;

    return {
      hashtag_name: `#${hashtagClean}`,
      hashtag_slug: hashtagClean.replace(/\s/g, ''),
      posts_count: posts.length,
      url: `https://www.instagram.com/explore/tags/${hashtagClean}/`,
      posts,
      total_engagement: totalEngagement,
      avg_engagement: avgEngagement,
      unique_users_count: uniqueUsers.size
    };
  }

  /**
   * Normalize profile posts data
   * @param {object[]} items - Raw items from Apify
   * @param {string} profileUrl - Original profile URL
   * @returns {object[]} Normalized posts
   */
  normalizeProfileData(items, profileUrl) {
    console.log('Processing profile posts data');

    if (!items || items.length === 0) {
      console.warn('No profile posts data');
      return [];
    }

    const posts = [];
    const validTypes = ['image', 'video', 'sidecar', 'carousel', 'graphimage', 'graphvideo', 'graphsidecar'];

    for (const item of items) {
      try {
        // Check if it's a valid post
        const postType = item.type || '';
        if (!validTypes.includes(postType.toLowerCase())) {
          continue;
        }

        // Get post ID
        const postId = item.id || item.pk || item.shortCode || item.code;
        if (!postId) continue;

        // Clean caption and extract data
        const caption = this.cleanCaption(item.caption, 2000);
        const hashtags = this.extractHashtags(caption);
        const mentions = this.extractMentions(caption);

        // Create post record
        const post = {
          post_id: String(postId),
          short_code: this.safeStr(item.shortCode || item.code),
          caption,
          post_type: postType.toLowerCase().replace('graph', ''),
          likes_count: this.safeInt(item.likesCount),
          comments_count: this.safeInt(item.commentsCount),
          video_view_count: this.safeInt(item.videoViewCount),
          owner_username: this.safeStr(item.ownerUsername),
          owner_full_name: this.safeStr(item.ownerFullName),
          display_url: this.safeStr(item.displayUrl),
          video_url: item.videoUrl ? this.safeStr(item.videoUrl) : null,
          url: this.safeStr(item.url),
          input_url: profileUrl,
          timestamp: this.safeStr(item.timestamp),
          hashtags,
          mentions,
          hashtag_count: hashtags.length,
          mention_count: mentions.length,
          is_sponsored: Boolean(item.isSponsored),
          location_name: this.safeStr(item.locationName)
        };

        posts.push(post);

      } catch (error) {
        console.error('Error processing profile post:', error);
        continue;
      }
    }

    console.log(`Processed ${posts.length} posts from profile`);
    return posts;
  }

  /**
   * Scrape hashtag
   * @param {string} hashtag - Hashtag to scrape
   * @param {number} limit - Results limit
   * @returns {Promise<object>} Normalized hashtag data
   */
  async scrapeHashtag(hashtag, limit = 200) {
    console.log(`Scraping hashtag: #${hashtag}`);

    const input = this.prepareHashtagInput(hashtag, limit);
    const items = await this.runActorAndGetResults(input);

    return this.normalizeHashtagData(items, hashtag);
  }

  /**
   * Scrape profile
   * @param {string} profileUrl - Profile URL or username
   * @param {number} limit - Results limit
   * @returns {Promise<object[]>} Normalized posts
   */
  async scrapeProfile(profileUrl, limit = 200) {
    console.log(`Scraping profile: ${profileUrl}`);

    const input = this.prepareProfileInput(profileUrl, limit);
    const items = await this.runActorAndGetResults(input);

    return this.normalizeProfileData(items, profileUrl);
  }
}

export default InstagramScraper;

/**
 * Convenience wrapper function for compatibility with existing code
 * Matches the interface expected by server endpoints
 *
 * @param {object} options - Scraping options
 * @param {string[]} options.searchQueries - Array of search queries (@profile or #hashtag)
 * @param {number} options.maxPostsPerQuery - Max posts per query (default: 10)
 * @param {string} options.apifyToken - Apify API token (optional, falls back to env)
 * @param {number} options.timeout - Timeout in seconds (default: 240)
 * @param {boolean} options.includeComments - Whether to include comments (NOT IMPLEMENTED - reserved for future)
 * @returns {Promise<Array>} Array of normalized post objects
 */
export async function scrapeInstagram({
  searchQueries = [],
  maxPostsPerQuery = 10,
  apifyToken,
  timeout = 240,
  includeComments = false
}) {
  console.log('📸 Instagram Scraper initialized (Apify SDK)');
  console.log(`   Search queries: ${searchQueries.length}`);
  console.log(`   Max posts per query: ${maxPostsPerQuery}`);

  if (includeComments) {
    console.log('⚠️  Comment scraping not yet implemented in this version - ignoring includeComments parameter');
  }

  // Get token from parameter or environment
  const token = apifyToken || process.env.APIFY_API_TOKEN;

  if (!token) {
    throw new Error('APIFY_API_TOKEN is required for Instagram scraping. Set it in .env or pass as parameter.');
  }

  if (!Array.isArray(searchQueries) || searchQueries.length === 0) {
    throw new Error('searchQueries must be a non-empty array');
  }

  // Initialize scraper
  const scraper = new InstagramScraper(token);
  const allResults = [];

  try {
    // Process each search query
    for (const query of searchQueries) {
      const cleanQuery = query.trim();
      console.log(`🔍 Scraping Instagram for: ${cleanQuery}`);

      try {
        let posts;

        // Determine query type
        if (cleanQuery.startsWith('@')) {
          // Profile scraping
          const username = cleanQuery.replace('@', '');
          const profileUrl = `https://www.instagram.com/${username}`;
          posts = await scraper.scrapeProfile(profileUrl, maxPostsPerQuery);
        } else if (cleanQuery.startsWith('#')) {
          // Hashtag scraping
          const hashtag = cleanQuery.replace('#', '');
          posts = await scraper.scrapeHashtag(hashtag, maxPostsPerQuery);
        } else {
          // Assume hashtag if no prefix
          posts = await scraper.scrapeHashtag(cleanQuery, maxPostsPerQuery);
        }

        allResults.push(...posts);
        console.log(`✅ Found ${posts.length} posts for query: ${cleanQuery}`);

      } catch (error) {
        console.error(`❌ Error scraping query "${cleanQuery}":`, error.message);
        // Continue with next query instead of failing completely
        continue;
      }
    }

    console.log(`📥 Retrieved ${allResults.length} Instagram posts total`);
    return allResults;

  } catch (error) {
    console.error('❌ Instagram scraping error:', error);
    throw new Error(`Instagram scraping failed: ${error.message}`);
  }
}

/**
 * Enrich Instagram posts with comments
 * Uses Apify Instagram Comment Scraper to fetch comments for posts
 *
 * @param {object} options - Enrichment options
 * @param {Array} options.posts - Array of posts to enrich
 * @param {string} options.apifyToken - Apify API token
 * @param {number} options.maxCommentsPerPost - Max comments per post (default: 50)
 * @param {number} options.batchSize - Batch size for processing (default: 50)
 * @param {number} options.timeout - Timeout in seconds (default: 240)
 * @returns {Promise<Array>} Array of posts enriched with comments
 */
export async function enrichInstagramWithComments({
  posts = [],
  apifyToken,
  maxCommentsPerPost = 50,
  batchSize = 50,
  timeout = 240
}) {
  // Import axios dynamically
  const axios = (await import('axios')).default;

  if (!apifyToken) {
    throw new Error('APIFY_API_TOKEN is required for comment enrichment');
  }

  if (!Array.isArray(posts) || posts.length === 0) {
    throw new Error('posts must be a non-empty array');
  }

  console.log(`💬 Enriching ${posts.length} posts with comments`);

  const enrichedPosts = [];
  const postsWithUrls = posts.filter(post => post.post_url);

  // Split into batches
  const batches = [];
  for (let i = 0; i < postsWithUrls.length; i += batchSize) {
    batches.push(postsWithUrls.slice(i, i + batchSize));
  }

  console.log(`📦 Processing ${batches.length} batch(es)`);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchUrls = batch.map(post => post.post_url);

    console.log(`  🔄 Batch ${batchIndex + 1}/${batches.length}: ${batch.length} posts`);

    try {
      // Call Apify Instagram Comment Scraper
      const apifyInput = {
        directUrls: batchUrls,
        resultsLimit: maxCommentsPerPost
      };

      const apifyResponse = await axios.post(
        'https://api.apify.com/v2/acts/apify~instagram-comment-scraper/run-sync-get-dataset-items',
        apifyInput,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apifyToken}`
          },
          params: {
            timeout: timeout
          },
          timeout: (timeout + 10) * 1000
        }
      );

      const commentsData = apifyResponse.data || [];
      console.log(`  ✅ Received ${commentsData.length} comment objects`);

      // Map comments by post URL
      const commentsByUrl = {};
      commentsData.forEach(item => {
        const postUrl = item.url || item.postUrl;
        if (postUrl) {
          if (!commentsByUrl[postUrl]) {
            commentsByUrl[postUrl] = [];
          }
          commentsByUrl[postUrl].push(item);
        }
      });

      // Enrich posts with comments
      for (const post of batch) {
        const postComments = commentsByUrl[post.post_url] || [];

        enrichedPosts.push({
          ...post,
          all_comments: postComments.map(comment => ({
            comment_id: comment.id || comment.commentId,
            text: comment.text || comment.comment || '',
            username: comment.ownerUsername || comment.username,
            user_id: comment.ownerId,
            profile_pic_url: comment.ownerProfilePicUrl,
            timestamp: comment.timestamp || comment.createdTime,
            likes_count: comment.likesCount || comment.likes || 0,
            replies_count: comment.repliesCount || comment.replies?.length || 0,
            scraped_at: new Date().toISOString()
          })),
          total_comments_scraped: postComments.length,
          comment_enrichment_status: postComments.length > 0 ? 'success' : 'no_comments'
        });
      }

      // Delay between batches
      if (batchIndex < batches.length - 1) {
        console.log('  ⏳ Waiting 2s before next batch...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (batchError) {
      console.error(`  ❌ Batch ${batchIndex + 1} error:`, batchError.message);

      // Add posts with empty comments on error
      for (const post of batch) {
        enrichedPosts.push({
          ...post,
          all_comments: [],
          total_comments_scraped: 0,
          comment_enrichment_status: 'error',
          comment_enrichment_error: batchError.message
        });
      }
    }
  }

  const successCount = enrichedPosts.filter(p => p.comment_enrichment_status === 'success').length;
  const totalComments = enrichedPosts.reduce((sum, p) => sum + (p.total_comments_scraped || 0), 0);
  console.log(`✅ Enrichment complete: ${successCount}/${enrichedPosts.length} posts, ${totalComments} comments`);

  return enrichedPosts;
}
