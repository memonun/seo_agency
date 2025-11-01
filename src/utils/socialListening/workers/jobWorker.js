import { createClient } from '@supabase/supabase-js';
import { scrapeInstagram } from '../scrapers/instagram.js';
import { scrapeTikTok } from '../scrapers/tiktok.js';

/**
 * Social Listening Job Worker
 *
 * This worker class connects the scrapers to the database, handling:
 * - Job queue processing
 * - Scraper execution
 * - Data persistence to database
 * - Job status updates and progress tracking
 */
export class SocialListeningJobWorker {
  constructor({ supabaseUrl, supabaseKey, apifyToken }) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SocialListeningJobWorker requires supabaseUrl and supabaseKey');
    }

    if (!apifyToken) {
      throw new Error('SocialListeningJobWorker requires apifyToken for scraping');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    this.apifyToken = apifyToken;

    console.log('✅ SocialListeningJobWorker initialized');
  }

  /**
   * Process all queued jobs
   * Main entry point called by the API endpoint
   */
  async processQueuedJobs() {
    console.log('\n🔄 Processing queued jobs...');

    try {
      // Fetch all queued jobs
      const { data: jobs, error } = await this.supabase
        .from('social_listening.scrape_jobs')
        .select('*')
        .eq('status', 'queued')
        .order('queued_at', { ascending: true });

      if (error) {
        console.error('❌ Error fetching queued jobs:', error);
        throw error;
      }

      if (!jobs || jobs.length === 0) {
        console.log('ℹ️ No queued jobs found');
        return { processed: 0, message: 'No queued jobs' };
      }

      console.log(\`📋 Found \${jobs.length} queued job(s)\`);

      // Process each job sequentially
      const results = [];
      for (const job of jobs) {
        console.log(\`\n▶️ Processing job \${job.id.slice(0, 8)}...\`);
        try {
          const result = await this.processJob(job);
          results.push(result);
        } catch (error) {
          console.error(\`❌ Job \${job.id.slice(0, 8)} failed:\`, error.message);
          await this.failJob(job.id, error.message);
          results.push({ jobId: job.id, status: 'failed', error: error.message });
        }
      }

      console.log(\`\n✅ Processed \${results.length} job(s)\`);
      return {
        processed: results.length,
        results
      };

    } catch (error) {
      console.error('❌ Error in processQueuedJobs:', error);
      throw error;
    }
  }

  /**
   * Process a single job
   */
  async processJob(job) {
    const jobId = job.id;
    const campaignId = job.campaign_id;

    console.log(\`📱 Job \${jobId.slice(0, 8)}: Starting processing\`);

    try {
      // Update job status to 'running'
      await this.updateJobStatus(jobId, 'running', {
        current: 0,
        total: 0,
        message: 'Starting scraping process...'
      });

      // Fetch campaign details
      const { data: campaign, error: campaignError } = await this.supabase
        .from('social_listening.campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (campaignError || !campaign) {
        throw new Error(\`Campaign not found: \${campaignId}\`);
      }

      console.log(\`📋 Campaign: \${campaign.name}\`);
      console.log(\`🔍 Platforms: \${job.platforms.join(', ')}\`);

      // Prepare results object
      const results = {
        platforms: {},
        totalMentions: 0
      };

      // Process each platform
      for (const platform of job.platforms) {
        console.log(\`\n🌐 Processing platform: \${platform}\`);

        try {
          let mentions = [];

          if (platform === 'instagram') {
            mentions = await this.scrapeInstagram(campaign, job);
          } else if (platform === 'tiktok') {
            mentions = await this.scrapeTikTok(campaign, job);
          } else {
            console.warn(\`⚠️ Unknown platform: \${platform}\`);
            continue;
          }

          // Save mentions to database
          const saved = await this.saveMentions(mentions, jobId, campaignId, platform);

          results.platforms[platform] = {
            mentions_saved: saved,
            errors: []
          };
          results.totalMentions += saved;

          console.log(\`✅ \${platform}: Saved \${saved} mentions\`);

        } catch (platformError) {
          console.error(\`❌ Error processing \${platform}:\`, platformError.message);
          results.platforms[platform] = {
            mentions_saved: 0,
            errors: [platformError.message]
          };
        }
      }

      // Complete the job
      await this.completeJob(jobId, results);

      console.log(\`✅ Job \${jobId.slice(0, 8)}: Completed with \${results.totalMentions} total mentions\`);

      return {
        jobId,
        status: 'completed',
        results
      };

    } catch (error) {
      console.error(\`❌ Job \${jobId.slice(0, 8)} error:\`, error);
      throw error;
    }
  }

  /**
   * Scrape Instagram for a campaign
   */
  async scrapeInstagram(campaign, job) {
    console.log('📸 Starting Instagram scraping...');

    const config = campaign.instagram_config || {};
    const keywords = campaign.keywords || [];
    const hashtags = campaign.hashtags || [];
    const profileUrl = config.profile_url;

    // Build search queries
    const searchQueries = [];

    // Add keywords
    keywords.forEach(keyword => {
      searchQueries.push(keyword);
    });

    // Add hashtags
    hashtags.forEach(hashtag => {
      const cleanHashtag = hashtag.replace(/^#/, '');
      searchQueries.push(\`#\${cleanHashtag}\`);
    });

    if (searchQueries.length === 0 && !profileUrl) {
      console.log('⚠️ No Instagram search queries or profile URL configured');
      return [];
    }

    // Update progress
    await this.updateJobProgress(job.id, 0, searchQueries.length + (profileUrl ? 1 : 0), 'Scraping Instagram...');

    try {
      const mentions = await scrapeInstagram({
        searchQueries: searchQueries.slice(0, 5), // Limit to 5 queries to avoid API limits
        profileUrl,
        maxPostsPerQuery: config.max_posts_per_scrape || 50,
        apifyToken: this.apifyToken
      });

      console.log(\`📸 Instagram scraping complete: \${mentions.length} posts found\`);
      return mentions;

    } catch (error) {
      console.error('❌ Instagram scraping error:', error);
      throw new Error(\`Instagram scraping failed: \${error.message}\`);
    }
  }

  /**
   * Scrape TikTok for a campaign
   */
  async scrapeTikTok(campaign, job) {
    console.log('🎵 Starting TikTok scraping...');

    const config = campaign.tiktok_config || {};
    const keywords = campaign.keywords || [];
    const hashtags = campaign.hashtags || [];
    const monitorProfiles = config.monitor_profiles || [];

    // Build search queries
    const searchQueries = [];

    // Add keywords
    keywords.forEach(keyword => {
      searchQueries.push(keyword);
    });

    // Add hashtags
    hashtags.forEach(hashtag => {
      const cleanHashtag = hashtag.replace(/^#/, '');
      searchQueries.push(\`#\${cleanHashtag}\`);
    });

    if (searchQueries.length === 0 && monitorProfiles.length === 0) {
      console.log('⚠️ No TikTok search queries or profiles configured');
      return [];
    }

    // Update progress
    await this.updateJobProgress(job.id, 0, searchQueries.length + monitorProfiles.length, 'Scraping TikTok...');

    try {
      const mentions = await scrapeTikTok({
        searchQueries: searchQueries.slice(0, 5), // Limit to 5 queries
        profileUrls: monitorProfiles,
        maxVideosPerQuery: config.max_videos_per_scrape || 50,
        apifyToken: this.apifyToken
      });

      console.log(\`🎵 TikTok scraping complete: \${mentions.length} videos found\`);
      return mentions;

    } catch (error) {
      console.error('❌ TikTok scraping error:', error);
      throw new Error(\`TikTok scraping failed: \${error.message}\`);
    }
  }

  /**
   * Save mentions to database (batch insert)
   */
  async saveMentions(mentions, jobId, campaignId, platform) {
    if (!mentions || mentions.length === 0) {
      return 0;
    }

    console.log(\`💾 Saving \${mentions.length} \${platform} mentions to database...\`);

    let savedCount = 0;

    try {
      // Process mentions in batches of 50 to avoid payload limits
      const batchSize = 50;
      for (let i = 0; i < mentions.length; i += batchSize) {
        const batch = mentions.slice(i, i + batchSize);

        // Prepare mention records
        const mentionRecords = batch.map(mention => ({
          campaign_id: campaignId,
          scrape_job_id: jobId,
          platform: platform,
          post_id: mention.post_id || mention.id,
          post_url: mention.post_url || mention.url,
          author_username: mention.author_username || mention.authorMeta?.name || 'unknown',
          author_id: mention.author_id || mention.authorMeta?.id,
          caption: mention.caption || mention.text || mention.desc || '',
          post_timestamp: mention.timestamp || mention.createTime || new Date().toISOString(),
          likes: mention.likes || mention.diggCount || 0,
          comments: mention.comments || mention.commentCount || 0,
          shares: mention.shares || mention.shareCount || 0,
          views: mention.views || mention.playCount || 0,
          // AI fields will be populated in Phase 3
          sentiment_label: null,
          sentiment_score: null,
          is_relevant: null,
          relevance_confidence: null,
          relevance_reasoning: null,
          emotions: null,
          // Platform-specific data stored in JSONB
          instagram_data: platform === 'instagram' ? {
            post_type: mention.type,
            is_video: mention.isVideo,
            is_sponsored: mention.isSponsored || false,
            hashtags: mention.hashtags || [],
            mentions: mention.mentions || [],
            location: mention.locationName
          } : null,
          tiktok_data: platform === 'tiktok' ? {
            is_duet: mention.duetEnabled || false,
            is_stitch: mention.stitchEnabled || false,
            music: mention.musicMeta ? {
              id: mention.musicMeta.musicId,
              title: mention.musicMeta.musicName,
              author: mention.musicMeta.musicAuthor
            } : null,
            author: mention.authorMeta ? {
              id: mention.authorMeta.id,
              name: mention.authorMeta.name,
              nickname: mention.authorMeta.nickName,
              followers: mention.authorMeta.fans,
              verified: mention.authorMeta.verified
            } : null,
            hashtags: mention.hashtags || [],
            effects: mention.effectStickers || []
          } : null
        }));

        // Insert mentions
        const { data, error } = await this.supabase
          .from('social_listening.mentions')
          .insert(mentionRecords)
          .select();

        if (error) {
          console.error(\`❌ Error saving mentions batch \${i}-\${i + batch.length}:\`, error);
          // Continue with next batch even if one fails
          continue;
        }

        savedCount += data?.length || 0;
        console.log(\`  ✓ Batch \${Math.floor(i / batchSize) + 1}: Saved \${data?.length || 0} mentions\`);
      }

      console.log(\`✅ Total saved: \${savedCount}/\${mentions.length} mentions\`);
      return savedCount;

    } catch (error) {
      console.error('❌ Error in saveMentions:', error);
      throw error;
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(jobId, status, progress = null) {
    const updateData = {
      status,
      ...(status === 'running' && { started_at: new Date().toISOString() }),
      ...(progress && { progress })
    };

    const { error } = await this.supabase
      .from('social_listening.scrape_jobs')
      .update(updateData)
      .eq('id', jobId);

    if (error) {
      console.error(\`❌ Error updating job status:\`, error);
    }
  }

  /**
   * Update job progress
   */
  async updateJobProgress(jobId, current, total, message) {
    const { error } = await this.supabase
      .from('social_listening.scrape_jobs')
      .update({
        progress: {
          current,
          total,
          message
        }
      })
      .eq('id', jobId);

    if (error) {
      console.error(\`❌ Error updating job progress:\`, error);
    }
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId, results) {
    const { error } = await this.supabase
      .from('social_listening.scrape_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results,
        items_scraped: results.totalMentions || 0,
        progress: {
          current: results.totalMentions || 0,
          total: results.totalMentions || 0,
          message: 'Processing complete'
        }
      })
      .eq('id', jobId);

    if (error) {
      console.error(\`❌ Error completing job:\`, error);
      throw error;
    }

    console.log(\`✅ Job \${jobId.slice(0, 8)} marked as completed\`);
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId, errorMessage) {
    const { error } = await this.supabase
      .from('social_listening.scrape_jobs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
        progress: {
          current: 0,
          total: 0,
          message: \`Failed: \${errorMessage}\`
        }
      })
      .eq('id', jobId);

    if (error) {
      console.error(\`❌ Error marking job as failed:\`, error);
    }

    console.log(\`❌ Job \${jobId.slice(0, 8)} marked as failed: \${errorMessage}\`);
  }
}
