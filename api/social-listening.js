// Vercel Serverless Function
// Social Listening API - Instagram + TikTok Monitoring
// Job Queue Pattern (No Cron, Manual Trigger Only)

import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const getSupabaseClient = () => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials')
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const { action } = req.method === 'POST' ? req.body : req.query

    if (!action) {
      return res.status(400).json({
        error: 'Missing action parameter',
        message: 'Please specify an action (e.g., create-campaign, start-scrape, get-job-status)'
      })
    }

    const supabase = getSupabaseClient()

    // Route to appropriate handler
    switch (action) {
      // Campaign Management
      case 'create-campaign':
        return await createCampaign(supabase, req, res)
      case 'update-campaign':
        return await updateCampaign(supabase, req, res)
      case 'get-campaign':
        return await getCampaign(supabase, req, res)
      case 'list-campaigns':
        return await listCampaigns(supabase, req, res)
      case 'delete-campaign':
        return await deleteCampaign(supabase, req, res)

      // Job Management (Manual Trigger)
      case 'start-scrape':
        return await startScrapeJob(supabase, req, res)
      case 'process-jobs':
        return await processJobs(supabase, req, res)
      case 'get-job-status':
        return await getJobStatus(supabase, req, res)
      case 'list-jobs':
        return await listJobs(supabase, req, res)
      case 'cancel-job':
        return await cancelJob(supabase, req, res)

      // Data Retrieval
      case 'get-mentions':
        return await getMentions(supabase, req, res)
      case 'get-mention-details':
        return await getMentionDetails(supabase, req, res)
      case 'get-trends':
        return await getTrends(supabase, req, res)
      case 'get-influencers':
        return await getInfluencers(supabase, req, res)
      case 'get-alerts':
        return await getAlerts(supabase, req, res)
      case 'get-daily-stats':
        return await getDailyStats(supabase, req, res)

      // Alert Management
      case 'mark-alert-read':
        return await markAlertRead(supabase, req, res)
      case 'dismiss-alert':
        return await dismissAlert(supabase, req, res)

      // Analytics
      case 'run-analytics':
        return await runAnalytics(supabase, req, res)
      case 'get-analytics-summary':
        return await getAnalyticsSummary(supabase, req, res)

      // Testing & Debugging
      case 'test-scraper':
        return await testScraper(req, res)

      default:
        return res.status(400).json({
          error: 'Invalid action',
          message: `Action "${action}" is not supported`
        })
    }
  } catch (error) {
    console.error('Social Listening API Error:', error)
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

// ============================================================
// CAMPAIGN MANAGEMENT
// ============================================================

async function createCampaign(supabase, req, res) {
  const { user_id, name, description, brand_mentions, keywords, hashtags, competitors, platforms, instagram_config, tiktok_config, relevance_context, alert_config } = req.body

  if (!user_id || !name) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'user_id and name are required'
    })
  }

  const { data, error } = await supabase
    .from('social_listening.campaigns')
    .insert([{
      user_id,
      name,
      description,
      brand_mentions: brand_mentions || [],
      keywords: keywords || [],
      hashtags: hashtags || [],
      competitors: competitors || [],
      platforms: platforms || { instagram: true, tiktok: true },
      instagram_config: instagram_config || {
        track_stories: true,
        track_reels: true,
        monitor_profiles: [],
        hashtags: [],
        max_posts_per_scrape: 200
      },
      tiktok_config: tiktok_config || {
        track_sounds: false,
        monitor_profiles: [],
        hashtags: [],
        query_terms: [],
        max_videos_per_scrape: 100
      },
      relevance_context,
      alert_config: alert_config || {
        sentiment_threshold: -0.3,
        volume_spike_multiplier: 2.5,
        enable_email: true,
        enable_slack: false,
        influencer_follower_threshold: 10000
      }
    }])
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    campaign: data,
    message: 'Campaign created successfully'
  })
}

async function updateCampaign(supabase, req, res) {
  const { campaign_id, ...updates } = req.body

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.campaigns')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', campaign_id)
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    campaign: data,
    message: 'Campaign updated successfully'
  })
}

async function getCampaign(supabase, req, res) {
  const { campaign_id } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single()

  if (error) {
    return res.status(404).json({ error: 'Campaign not found', message: error.message })
  }

  return res.status(200).json({
    success: true,
    campaign: data
  })
}

async function listCampaigns(supabase, req, res) {
  const { user_id, active_only = 'true' } = req.query

  if (!user_id) {
    return res.status(400).json({ error: 'Missing user_id' })
  }

  let query = supabase
    .from('social_listening.campaigns')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })

  if (active_only === 'true') {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    campaigns: data,
    total: data.length
  })
}

async function deleteCampaign(supabase, req, res) {
  const { campaign_id } = req.body

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  const { error } = await supabase
    .from('social_listening.campaigns')
    .delete()
    .eq('id', campaign_id)

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    message: 'Campaign deleted successfully'
  })
}

// ============================================================
// JOB MANAGEMENT (Manual Trigger - No Cron)
// ============================================================

async function startScrapeJob(supabase, req, res) {
  const { campaign_id, user_id, platforms, job_type = 'full_scrape', parameters = {} } = req.body

  if (!campaign_id || !user_id) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'campaign_id and user_id are required'
    })
  }

  // Get campaign to validate it exists
  const { data: campaign, error: campaignError } = await supabase
    .from('social_listening.campaigns')
    .select('*')
    .eq('id', campaign_id)
    .single()

  if (campaignError || !campaign) {
    return res.status(404).json({ error: 'Campaign not found' })
  }

  // Determine platforms to scrape
  const platformsToScrape = platforms || []
  if (platformsToScrape.length === 0) {
    if (campaign.platforms.instagram) platformsToScrape.push('instagram')
    if (campaign.platforms.tiktok) platformsToScrape.push('tiktok')
  }

  // Create job
  const { data: job, error: jobError } = await supabase
    .from('social_listening.scrape_jobs')
    .insert([{
      campaign_id,
      user_id,
      job_type,
      platforms: platformsToScrape,
      parameters,
      status: 'queued',
      progress: {
        current: 0,
        total: 0,
        message: 'Job queued, waiting to start...'
      }
    }])
    .select()
    .single()

  if (jobError) {
    return res.status(500).json({ error: 'Failed to create job', message: jobError.message })
  }

  // NOTE: Actual scraping will be triggered by a separate worker process
  // This is just creating the job in the queue
  // The worker can be triggered via a separate endpoint or manually

  return res.status(200).json({
    success: true,
    job,
    message: 'Scrape job created successfully',
    note: 'Job is queued. Use get-job-status to check progress or call process-jobs to trigger processing.'
  })
}

async function processJobs(_supabase, _req, res) {
  try {
    // Import job worker (dynamic import for serverless compatibility)
    const { SocialListeningJobWorker } = await import('../src/utils/socialListening/workers/jobWorker.js')

    // Get environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const apifyToken = process.env.APIFY_API_TOKEN

    if (!apifyToken) {
      return res.status(500).json({
        error: 'Missing APIFY_API_TOKEN',
        message: 'Instagram scraping requires Apify API token to be configured'
      })
    }

    // Create worker
    const worker = new SocialListeningJobWorker({
      supabaseUrl,
      supabaseKey,
      apifyToken
    })

    // Process queued jobs (this will return immediately but jobs run in background)
    // In serverless, we need to await this to ensure it completes
    await worker.processQueuedJobs()

    return res.status(200).json({
      success: true,
      message: 'Job processing triggered successfully'
    })

  } catch (error) {
    console.error('Error processing jobs:', error)
    return res.status(500).json({
      error: 'Job processing failed',
      message: error.message
    })
  }
}

async function getJobStatus(supabase, req, res) {
  const { job_id } = req.query

  if (!job_id) {
    return res.status(400).json({ error: 'Missing job_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.scrape_jobs')
    .select('*')
    .eq('id', job_id)
    .single()

  if (error) {
    return res.status(404).json({ error: 'Job not found', message: error.message })
  }

  return res.status(200).json({
    success: true,
    job: data
  })
}

async function listJobs(supabase, req, res) {
  const { campaign_id, user_id, status, limit = 50 } = req.query

  let query = supabase
    .from('social_listening.scrape_jobs')
    .select('*')
    .order('queued_at', { ascending: false })
    .limit(parseInt(limit))

  if (campaign_id) {
    query = query.eq('campaign_id', campaign_id)
  }

  if (user_id) {
    query = query.eq('user_id', user_id)
  }

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    jobs: data,
    total: data.length
  })
}

async function cancelJob(supabase, req, res) {
  const { job_id } = req.body

  if (!job_id) {
    return res.status(400).json({ error: 'Missing job_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.scrape_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString()
    })
    .eq('id', job_id)
    .eq('status', 'queued') // Only cancel queued jobs
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Failed to cancel job', message: error.message })
  }

  if (!data) {
    return res.status(400).json({ error: 'Job cannot be cancelled (already running or completed)' })
  }

  return res.status(200).json({
    success: true,
    job: data,
    message: 'Job cancelled successfully'
  })
}

// ============================================================
// DATA RETRIEVAL
// ============================================================

async function getMentions(supabase, req, res) {
  const { campaign_id, platform, is_relevant, limit = 100, offset = 0, sort_by = 'published_at', order = 'desc' } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.mentions')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order(sort_by, { ascending: order === 'asc' })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

  if (platform) {
    query = query.eq('platform', platform)
  }

  if (is_relevant !== undefined) {
    query = query.eq('is_relevant', is_relevant === 'true')
  }

  const { data, error, count } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    mentions: data,
    total: count,
    limit: parseInt(limit),
    offset: parseInt(offset)
  })
}

async function getMentionDetails(supabase, req, res) {
  const { mention_id } = req.query

  if (!mention_id) {
    return res.status(400).json({ error: 'Missing mention_id' })
  }

  // Get mention with comments
  const { data: mention, error: mentionError } = await supabase
    .from('social_listening.mentions')
    .select('*')
    .eq('id', mention_id)
    .single()

  if (mentionError) {
    return res.status(404).json({ error: 'Mention not found', message: mentionError.message })
  }

  // Get comments for this mention
  const { data: comments, error: commentsError } = await supabase
    .from('social_listening.comments')
    .select('*')
    .eq('mention_id', mention_id)
    .order('created_at', { ascending: false })

  return res.status(200).json({
    success: true,
    mention,
    comments: commentsError ? [] : comments
  })
}

async function getTrends(supabase, req, res) {
  const { campaign_id, platform, is_active = 'true', limit = 20 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.trends')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order('trend_score', { ascending: false })
    .limit(parseInt(limit))

  if (platform) {
    query = query.eq('platform', platform)
  }

  if (is_active === 'true') {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    trends: data,
    total: data.length
  })
}

async function getInfluencers(supabase, req, res) {
  const { campaign_id, platform, tier, limit = 20 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.influencers')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order('overall_score', { ascending: false })
    .limit(parseInt(limit))

  if (platform) {
    query = query.eq('platform', platform)
  }

  if (tier) {
    query = query.eq('tier', tier)
  }

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    influencers: data,
    total: data.length
  })
}

async function getAlerts(supabase, req, res) {
  const { campaign_id, is_read = 'false', severity, limit = 50 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.alerts')
    .select('*')
    .eq('campaign_id', campaign_id)
    .eq('dismissed', false)
    .order('created_at', { ascending: false })
    .limit(parseInt(limit))

  if (is_read !== 'all') {
    query = query.eq('is_read', is_read === 'true')
  }

  if (severity) {
    query = query.eq('severity', severity)
  }

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    alerts: data,
    total: data.length
  })
}

async function getDailyStats(supabase, req, res) {
  const { campaign_id, start_date, end_date, limit = 30 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  let query = supabase
    .from('social_listening.daily_stats')
    .select('*')
    .eq('campaign_id', campaign_id)
    .order('date', { ascending: false })
    .limit(parseInt(limit))

  if (start_date) {
    query = query.gte('date', start_date)
  }

  if (end_date) {
    query = query.lte('date', end_date)
  }

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    stats: data,
    total: data.length
  })
}

// ============================================================
// ALERT MANAGEMENT
// ============================================================

async function markAlertRead(supabase, req, res) {
  const { alert_id } = req.body

  if (!alert_id) {
    return res.status(400).json({ error: 'Missing alert_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.alerts')
    .update({ is_read: true })
    .eq('id', alert_id)
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    alert: data,
    message: 'Alert marked as read'
  })
}

async function dismissAlert(supabase, req, res) {
  const { alert_id } = req.body

  if (!alert_id) {
    return res.status(400).json({ error: 'Missing alert_id' })
  }

  const { data, error } = await supabase
    .from('social_listening.alerts')
    .update({ dismissed: true })
    .eq('id', alert_id)
    .select()
    .single()

  if (error) {
    return res.status(500).json({ error: 'Database error', message: error.message })
  }

  return res.status(200).json({
    success: true,
    alert: data,
    message: 'Alert dismissed'
  })
}

// ============================================================
// ANALYTICS
// ============================================================

async function runAnalytics(_supabase, req, res) {
  const { campaign_id } = req.body

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  try {
    // Import analytics worker
    const { AnalyticsWorker } = await import('../src/utils/socialListening/workers/analyticsWorker.js')

    // Get environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Create worker
    const worker = new AnalyticsWorker({
      supabaseUrl,
      supabaseKey
    })

    // Run analytics
    const result = await worker.runAnalytics(campaign_id)

    return res.status(200).json({
      success: true,
      analytics: result
    })

  } catch (error) {
    console.error('Error running analytics:', error)
    return res.status(500).json({
      error: 'Analytics processing failed',
      message: error.message
    })
  }
}

async function getAnalyticsSummary(_supabase, req, res) {
  const { campaign_id, days = 7 } = req.query

  if (!campaign_id) {
    return res.status(400).json({ error: 'Missing campaign_id' })
  }

  try {
    // Import analytics worker
    const { AnalyticsWorker } = await import('../src/utils/socialListening/workers/analyticsWorker.js')

    // Get environment variables
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Create worker
    const worker = new AnalyticsWorker({
      supabaseUrl,
      supabaseKey
    })

    // Get summary
    const summary = await worker.getAnalyticsSummary(campaign_id, parseInt(days))

    return res.status(200).json({
      success: true,
      summary
    })

  } catch (error) {
    console.error('Error getting analytics summary:', error)
    return res.status(500).json({
      error: 'Failed to get analytics summary',
      message: error.message
    })
  }
}

// ============================================================
// TESTING & DEBUGGING
// ============================================================

/**
 * Test scraper without database operations
 * Returns raw JSON output from Instagram or TikTok scrapers
 *
 * Optional parameters for TikTok:
 * - includeComments: boolean (default: false)
 * - maxCommentsPerVideo: number (default: 20, range: 1-100)
 */
async function testScraper(req, res) {
  const {
    platform,
    query,
    limit = 10,
    includeComments = false,
    maxCommentsPerVideo = 20
  } = req.body

  if (!platform || !query) {
    return res.status(400).json({
      error: 'Missing required fields',
      message: 'platform and query are required'
    })
  }

  // Validate comment parameters
  if (includeComments && (maxCommentsPerVideo < 1 || maxCommentsPerVideo > 100)) {
    return res.status(400).json({
      error: 'Invalid parameter',
      message: 'maxCommentsPerVideo must be between 1 and 100'
    })
  }

  try {
    console.log(`🧪 Testing ${platform} scraper with query: ${query}`)
    if (includeComments && platform === 'tiktok') {
      console.log(`   Including comments (max ${maxCommentsPerVideo} per video)`)
    }

    let results

    // Use real scrapers (NO MOCK DATA)
    if (platform === 'instagram') {
      if (!process.env.APIFY_API_TOKEN) {
        return res.status(500).json({
          error: 'Configuration error',
          message: 'APIFY_API_TOKEN not configured. Instagram scraping requires Apify token.'
        })
      }

      const { scrapeInstagram } = await import('../src/utils/socialListening/scrapers/instagram.js')
      results = await scrapeInstagram({
        searchQueries: [query],
        maxPostsPerQuery: parseInt(limit),
        apifyToken: process.env.APIFY_API_TOKEN
      })
    } else if (platform === 'tiktok') {
      const { scrapeTikTok } = await import('../src/utils/socialListening/scrapers/tiktok.js')
      results = await scrapeTikTok({
        searchQueries: [query],
        maxVideosPerQuery: parseInt(limit),
        includeComments,
        maxCommentsPerVideo: parseInt(maxCommentsPerVideo)
      })
    } else {
      return res.status(400).json({
        error: 'Invalid platform',
        message: 'Platform must be either "instagram" or "tiktok"'
      })
    }

    return res.status(200).json({
      success: true,
      platform,
      query,
      count: results.length,
      data: results,
      sample: results.length > 0 ? results[0] : null
    })
  } catch (error) {
    console.error('❌ Error testing scraper:', error)
    return res.status(500).json({
      error: 'Scraper test failed',
      message: error.message,
      details: error.toString()
    })
  }
}
