import { createClient } from '@supabase/supabase-js';

/**
 * Alert Generation System
 *
 * Detects anomalies and creates alerts for:
 * - Negative sentiment spikes
 * - Volume spikes (unusual increase in mentions)
 * - Influencer mentions (high-impact authors)
 * - Viral content detection
 * - Crisis detection (rapid negative sentiment)
 *
 * Stores results in social_listening.alerts table
 */
export class AlertGenerator {
  constructor({ supabaseUrl, supabaseKey }) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('AlertGenerator requires supabaseUrl and supabaseKey');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('✅ AlertGenerator initialized');
  }

  /**
   * Generate alerts for a campaign
   */
  async generateAlerts(campaignId) {
    console.log(\`\n🚨 Generating alerts for campaign \${campaignId.slice(0, 8)}...\`);

    try {
      // Get campaign alert configuration
      const { data: campaign, error: campaignError } = await this.supabase
        .from('social_listening.campaigns')
        .select('alert_config')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;

      const alertConfig = campaign.alert_config || {
        sentiment_threshold: -0.3,
        volume_spike_multiplier: 2.5,
        influencer_follower_threshold: 10000,
        enable_email: true,
        enable_slack: false
      };

      const alerts = [];

      // 1. Check for negative sentiment spikes
      const sentimentAlerts = await this.detectSentimentSpikes(campaignId, alertConfig);
      alerts.push(...sentimentAlerts);

      // 2. Check for volume spikes
      const volumeAlerts = await this.detectVolumeSpikes(campaignId, alertConfig);
      alerts.push(...volumeAlerts);

      // 3. Check for influencer mentions
      const influencerAlerts = await this.detectInfluencerMentions(campaignId, alertConfig);
      alerts.push(...influencerAlerts);

      // 4. Check for viral content
      const viralAlerts = await this.detectViralContent(campaignId, alertConfig);
      alerts.push(...viralAlerts);

      // Save alerts to database
      await this.saveAlerts(campaignId, alerts);

      console.log(\`✅ Alert generation complete: \${alerts.length} alerts created\`);

      return {
        success: true,
        alertsGenerated: alerts.length,
        alerts
      };

    } catch (error) {
      console.error('❌ Error generating alerts:', error);
      throw error;
    }
  }

  /**
   * Detect negative sentiment spikes
   */
  async detectSentimentSpikes(campaignId, config) {
    console.log('😢 Checking for negative sentiment spikes...');

    const alerts = [];

    try {
      // Get mentions from last 24 hours with sentiment data
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentMentions, error } = await this.supabase
        .from('social_listening.mentions')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('post_timestamp', yesterday)
        .not('sentiment_score', 'is', null);

      if (error) throw error;

      if (!recentMentions || recentMentions.length < 5) {
        return []; // Not enough data
      }

      // Count negative mentions
      const negativeMentions = recentMentions.filter(m => 
        m.sentiment_score < config.sentiment_threshold
      );

      const negativeRatio = negativeMentions.length / recentMentions.length;

      // Alert if >30% of recent mentions are negative
      if (negativeRatio > 0.3 && negativeMentions.length >= 5) {
        alerts.push({
          alert_type: 'negative_sentiment_spike',
          severity: negativeRatio > 0.5 ? 'high' : 'medium',
          title: 'Negative Sentiment Spike Detected',
          description: \`\${(negativeRatio * 100).toFixed(0)}% of recent mentions have negative sentiment (\${negativeMentions.length}/\${recentMentions.length})\`,
          mention_id: negativeMentions[0].id, // Link to first negative mention
          metadata: {
            negative_count: negativeMentions.length,
            total_count: recentMentions.length,
            negative_ratio: negativeRatio.toFixed(2),
            sample_posts: negativeMentions.slice(0, 3).map(m => ({
              post_url: m.post_url,
              author: m.author_username,
              caption: m.caption?.substring(0, 100)
            }))
          }
        });

        console.log(\`  🚨 Negative sentiment spike: \${negativeRatio.toFixed(2)}%\`);
      }

      return alerts;

    } catch (error) {
      console.error('❌ Error detecting sentiment spikes:', error);
      return [];
    }
  }

  /**
   * Detect volume spikes
   */
  async detectVolumeSpikes(campaignId, config) {
    console.log('📈 Checking for volume spikes...');

    const alerts = [];

    try {
      // Get mention counts for last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: mentions, error } = await this.supabase
        .from('social_listening.mentions')
        .select('post_timestamp')
        .eq('campaign_id', campaignId)
        .gte('post_timestamp', sevenDaysAgo);

      if (error) throw error;

      if (!mentions || mentions.length < 10) {
        return []; // Not enough data
      }

      // Group by day
      const dailyCounts = {};
      mentions.forEach(m => {
        const date = m.post_timestamp.split('T')[0];
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      });

      const dates = Object.keys(dailyCounts).sort();
      const counts = dates.map(d => dailyCounts[d]);

      // Check if today is a spike
      const today = dates[dates.length - 1];
      const todayCount = counts[counts.length - 1];
      const avgPrevious = counts.slice(0, -1).reduce((a, b) => a + b, 0) / (counts.length - 1);

      const spikeMultiplier = todayCount / avgPrevious;

      if (spikeMultiplier >= config.volume_spike_multiplier && todayCount >= 20) {
        alerts.push({
          alert_type: 'volume_spike',
          severity: spikeMultiplier >= 5 ? 'high' : 'medium',
          title: 'Mention Volume Spike Detected',
          description: \`Mentions increased by \${((spikeMultiplier - 1) * 100).toFixed(0)}% today (\${todayCount} vs avg \${Math.round(avgPrevious)})\`,
          metadata: {
            today_count: todayCount,
            average_count: Math.round(avgPrevious),
            spike_multiplier: spikeMultiplier.toFixed(2),
            date: today
          }
        });

        console.log(\`  🚨 Volume spike: \${spikeMultiplier.toFixed(1)}x increase\`);
      }

      return alerts;

    } catch (error) {
      console.error('❌ Error detecting volume spikes:', error);
      return [];
    }
  }

  /**
   * Detect influencer mentions
   */
  async detectInfluencerMentions(campaignId, config) {
    console.log('👥 Checking for influencer mentions...');

    const alerts = [];

    try {
      // Get recent mentions from influencers (last 24 hours)
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data: recentMentions, error } = await this.supabase
        .from('social_listening.mentions')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('post_timestamp', yesterday);

      if (error) throw error;

      if (!recentMentions || recentMentions.length === 0) {
        return [];
      }

      // Check for high-follower authors
      const influencerMentions = recentMentions.filter(m => {
        if (m.platform === 'tiktok' && m.tiktok_data?.author?.followers) {
          return m.tiktok_data.author.followers >= config.influencer_follower_threshold;
        } else if (m.platform === 'instagram' && m.instagram_data?.author?.followers) {
          return m.instagram_data.author.followers >= config.influencer_follower_threshold;
        }
        return false;
      });

      // Create alert for each influencer mention
      influencerMentions.forEach(m => {
        const followers = m.platform === 'tiktok' 
          ? m.tiktok_data.author.followers 
          : m.instagram_data.author.followers;

        alerts.push({
          alert_type: 'influencer_mention',
          severity: followers > 1000000 ? 'high' : 'medium',
          title: 'Influencer Mention Detected',
          description: \`@\${m.author_username} (\${formatNumber(followers)} followers) mentioned your brand on \${m.platform}\`,
          mention_id: m.id,
          metadata: {
            author_username: m.author_username,
            platform: m.platform,
            follower_count: followers,
            post_url: m.post_url,
            caption: m.caption?.substring(0, 100),
            likes: m.likes,
            comments: m.comments
          }
        });

        console.log(\`  🚨 Influencer mention: @\${m.author_username} (\${formatNumber(followers)} followers)\`);
      });

      return alerts;

    } catch (error) {
      console.error('❌ Error detecting influencer mentions:', error);
      return [];
    }
  }

  /**
   * Detect viral content
   */
  async detectViralContent(campaignId, config) {
    console.log('🔥 Checking for viral content...');

    const alerts = [];

    try {
      // Get mentions from last 48 hours
      const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: recentMentions, error } = await this.supabase
        .from('social_listening.mentions')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('post_timestamp', twoDaysAgo);

      if (error) throw error;

      if (!recentMentions || recentMentions.length === 0) {
        return [];
      }

      // Find posts with exceptional engagement
      const viralPosts = recentMentions.filter(m => {
        const totalEngagement = (m.likes || 0) + (m.comments || 0) + (m.views || 0);
        
        // Viral threshold: >100k engagement OR >50k likes
        return totalEngagement > 100000 || m.likes > 50000;
      });

      viralPosts.forEach(m => {
        const totalEngagement = (m.likes || 0) + (m.comments || 0) + (m.views || 0);

        alerts.push({
          alert_type: 'viral_content',
          severity: totalEngagement > 1000000 ? 'high' : 'medium',
          title: 'Viral Content Detected',
          description: \`A post about your brand went viral on \${m.platform}: \${formatNumber(totalEngagement)} total engagement\`,
          mention_id: m.id,
          metadata: {
            author_username: m.author_username,
            platform: m.platform,
            post_url: m.post_url,
            caption: m.caption?.substring(0, 100),
            likes: m.likes,
            comments: m.comments,
            views: m.views,
            total_engagement: totalEngagement
          }
        });

        console.log(\`  🚨 Viral content: \${formatNumber(totalEngagement)} engagement\`);
      });

      return alerts;

    } catch (error) {
      console.error('❌ Error detecting viral content:', error);
      return [];
    }
  }

  /**
   * Save alerts to database
   */
  async saveAlerts(campaignId, alerts) {
    if (!alerts || alerts.length === 0) {
      console.log('⚠️ No alerts to save');
      return;
    }

    console.log(\`💾 Saving \${alerts.length} alerts to database...\`);

    try {
      // Prepare alert records
      const alertRecords = alerts.map(a => ({
        campaign_id: campaignId,
        alert_type: a.alert_type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        mention_id: a.mention_id || null,
        metadata: a.metadata,
        is_read: false,
        dismissed: false
      }));

      // Insert alerts
      const { data, error } = await this.supabase
        .from('social_listening.alerts')
        .insert(alertRecords)
        .select();

      if (error) {
        console.error('❌ Error saving alerts:', error);
        throw error;
      }

      console.log(\`✅ Saved \${data?.length || 0} alerts\`);

    } catch (error) {
      console.error('❌ Error in saveAlerts:', error);
      throw error;
    }
  }

  /**
   * Get active alerts for a campaign
   */
  async getActiveAlerts(campaignId, isRead = false, severity = null, limit = 50) {
    let query = this.supabase
      .from('social_listening.alerts')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (isRead !== null) {
      query = query.eq('is_read', isRead);
    }

    if (severity) {
      query = query.eq('severity', severity);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching alerts:', error);
      return [];
    }

    return data || [];
  }
}

// Helper function
function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}
