/**
 * Social Listening API Client
 *
 * Handles all communication with /api/social-listening endpoint
 * Works with both development (Express) and production (Vercel) environments
 */

// Determine API URL based on environment
const getApiUrl = () => {
  // In development, use Express server
  if (import.meta.env.DEV || window.location.hostname === 'localhost') {
    return 'http://localhost:3001';
  }
  // In production, use relative URL (Vercel serverless)
  return '';
};

const API_BASE = getApiUrl();

/**
 * Make API call to social listening endpoint
 */
const callApi = async (data) => {
  const url = `${API_BASE}/api/social-listening`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || `API Error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Social Listening API Error:', error);
    throw error;
  }
};

/**
 * Make GET request to social listening endpoint
 */
const callApiGet = async (params) => {
  const queryString = new URLSearchParams(params).toString();
  const url = `${API_BASE}/api/social-listening?${queryString}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.error || `API Error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Social Listening API Error:', error);
    throw error;
  }
};

// ============================================
// CAMPAIGN MANAGEMENT
// ============================================

export const createCampaign = async (campaignData) => {
  return await callApi({
    action: 'create-campaign',
    ...campaignData
  });
};

export const updateCampaign = async (campaignId, updates) => {
  return await callApi({
    action: 'update-campaign',
    campaign_id: campaignId,
    ...updates
  });
};

export const getCampaign = async (campaignId) => {
  return await callApiGet({
    action: 'get-campaign',
    campaign_id: campaignId
  });
};

export const listCampaigns = async (userId, activeOnly = true) => {
  return await callApiGet({
    action: 'list-campaigns',
    user_id: userId,
    active_only: activeOnly.toString()
  });
};

export const deleteCampaign = async (campaignId) => {
  return await callApi({
    action: 'delete-campaign',
    campaign_id: campaignId
  });
};

// ============================================
// JOB MANAGEMENT
// ============================================

export const startScrapeJob = async (campaignId, userId, platforms = null) => {
  return await callApi({
    action: 'start-scrape',
    campaign_id: campaignId,
    user_id: userId,
    platforms: platforms // null = scrape all enabled platforms
  });
};

export const processJobs = async () => {
  return await callApi({
    action: 'process-jobs'
  });
};

export const getJobStatus = async (jobId) => {
  return await callApiGet({
    action: 'get-job-status',
    job_id: jobId
  });
};

export const listJobs = async (filters = {}) => {
  return await callApiGet({
    action: 'list-jobs',
    ...filters
  });
};

export const cancelJob = async (jobId) => {
  return await callApi({
    action: 'cancel-job',
    job_id: jobId
  });
};

// ============================================
// DATA RETRIEVAL
// ============================================

export const getMentions = async (campaignId, filters = {}) => {
  return await callApiGet({
    action: 'get-mentions',
    campaign_id: campaignId,
    limit: 100,
    offset: 0,
    ...filters
  });
};

export const getMentionDetails = async (mentionId) => {
  return await callApiGet({
    action: 'get-mention-details',
    mention_id: mentionId
  });
};

export const getTrends = async (campaignId, filters = {}) => {
  return await callApiGet({
    action: 'get-trends',
    campaign_id: campaignId,
    ...filters
  });
};

export const getInfluencers = async (campaignId, filters = {}) => {
  return await callApiGet({
    action: 'get-influencers',
    campaign_id: campaignId,
    ...filters
  });
};

export const getAlerts = async (campaignId, filters = {}) => {
  return await callApiGet({
    action: 'get-alerts',
    campaign_id: campaignId,
    ...filters
  });
};

export const getDailyStats = async (campaignId, filters = {}) => {
  return await callApiGet({
    action: 'get-daily-stats',
    campaign_id: campaignId,
    ...filters
  });
};

// ============================================
// ALERT MANAGEMENT
// ============================================

export const markAlertRead = async (alertId) => {
  return await callApi({
    action: 'mark-alert-read',
    alert_id: alertId
  });
};

export const dismissAlert = async (alertId) => {
  return await callApi({
    action: 'dismiss-alert',
    alert_id: alertId
  });
};

// ============================================
// ANALYTICS
// ============================================

/**
 * Run analytics for a campaign
 * Processes trends, influencers, daily stats, and alerts
 */
export const runAnalytics = async (campaignId) => {
  return await callApi({
    action: 'run-analytics',
    campaign_id: campaignId
  });
};

/**
 * Get analytics summary for a campaign
 * @param {string} campaignId - Campaign ID
 * @param {number} days - Number of days to analyze (default: 7)
 */
export const getAnalyticsSummary = async (campaignId, days = 7) => {
  return await callApiGet({
    action: 'get-analytics-summary',
    campaign_id: campaignId,
    days: days.toString()
  });
};

// ============================================
// TESTING & DEBUGGING
// ============================================

/**
 * Test scraper and view raw JSON output
 * @param {string} platform - 'instagram' or 'tiktok'
 * @param {string} query - Search query (hashtag, keyword, username)
 * @param {number} limit - Number of results to return (default: 10)
 * @returns {Promise<object>} Raw scraper output with data structure
 */
export const testScraper = async (platform, query, limit = 10) => {
  return await callApi({
    action: 'test-scraper',
    platform,
    query,
    limit
  });
};

// ============================================
// HELPER UTILITIES
// ============================================

/**
 * Poll job status until completion
 * @param {string} jobId - Job ID to monitor
 * @param {function} onProgress - Callback for progress updates
 * @param {number} interval - Polling interval in ms (default: 2000)
 * @returns {Promise<object>} Final job status
 */
export const pollJobStatus = async (jobId, onProgress = null, interval = 2000) => {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const response = await getJobStatus(jobId);
        const job = response.job;

        // Call progress callback if provided
        if (onProgress) {
          onProgress(job);
        }

        // Check if job is complete
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          resolve(job);
          return;
        }

        // Continue polling
        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
};

/**
 * Start scrape and immediately trigger processing
 * @param {string} campaignId - Campaign ID
 * @param {string} userId - User ID
 * @param {array} platforms - Platforms to scrape
 * @returns {Promise<object>} Job object
 */
export const scrapeAndProcess = async (campaignId, userId, platforms = null) => {
  // Start scrape job
  const { job } = await startScrapeJob(campaignId, userId, platforms);

  // Trigger processing
  await processJobs();

  return job;
};

export default {
  // Campaign
  createCampaign,
  updateCampaign,
  getCampaign,
  listCampaigns,
  deleteCampaign,

  // Jobs
  startScrapeJob,
  processJobs,
  getJobStatus,
  listJobs,
  cancelJob,

  // Data
  getMentions,
  getMentionDetails,
  getTrends,
  getInfluencers,
  getAlerts,
  getDailyStats,

  // Alerts
  markAlertRead,
  dismissAlert,

  // Analytics
  runAnalytics,
  getAnalyticsSummary,

  // Testing
  testScraper,

  // Helpers
  pollJobStatus,
  scrapeAndProcess
};
