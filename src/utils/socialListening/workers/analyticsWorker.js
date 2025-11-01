import { createClient } from '@supabase/supabase-js';
import { TrendDetector } from '../analytics/trendDetector.js';
import { InfluencerScorer } from '../analytics/influencerScorer.js';
import { DailyStatsAggregator } from '../analytics/dailyStatsAggregator.js';
import { AlertGenerator } from '../analytics/alertGenerator.js';

/**
 * Analytics Worker
 *
 * Orchestrates all analytics processes for a campaign:
 * - Trend detection
 * - Influencer scoring
 * - Daily statistics aggregation
 * - Alert generation
 *
 * Can be triggered manually or on a schedule
 */
export class AnalyticsWorker {
  constructor({ supabaseUrl, supabaseKey }) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('AnalyticsWorker requires supabaseUrl and supabaseKey');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Initialize analyzers
    this.trendDetector = new TrendDetector({ supabaseUrl, supabaseKey });
    this.influencerScorer = new InfluencerScorer({ supabaseUrl, supabaseKey });
    this.dailyStatsAggregator = new DailyStatsAggregator({ supabaseUrl, supabaseKey });
    this.alertGenerator = new AlertGenerator({ supabaseUrl, supabaseKey });

    console.log('✅ AnalyticsWorker initialized with all analyzers');
  }

  /**
   * Run all analytics for a campaign
   */
  async runAnalytics(campaignId) {
    console.log(\`\n🔬 Running analytics for campaign \${campaignId.slice(0, 8)}...\`);

    const results = {
      campaignId,
      startedAt: new Date().toISOString(),
      completedAt: null,
      success: false,
      errors: [],
      results: {}
    };

    try {
      // 1. Aggregate daily statistics
      console.log('\n📊 Step 1/4: Aggregating daily statistics...');
      try {
        const statsResult = await this.dailyStatsAggregator.aggregateStats(campaignId);
        results.results.dailyStats = statsResult;
        console.log(\`✅ Daily stats: \${statsResult.daysProcessed} days processed\`);
      } catch (error) {
        console.error('❌ Error in daily stats:', error.message);
        results.errors.push({ step: 'dailyStats', error: error.message });
      }

      // 2. Detect trends
      console.log('\n📈 Step 2/4: Detecting trends...');
      try {
        const trendsResult = await this.trendDetector.analyzeTrends(campaignId);
        results.results.trends = trendsResult;
        console.log(\`✅ Trends: \${trendsResult.trendsDetected} trends detected\`);
      } catch (error) {
        console.error('❌ Error in trend detection:', error.message);
        results.errors.push({ step: 'trends', error: error.message });
      }

      // 3. Score influencers
      console.log('\n👥 Step 3/4: Scoring influencers...');
      try {
        const influencersResult = await this.influencerScorer.scoreInfluencers(campaignId);
        results.results.influencers = influencersResult;
        console.log(\`✅ Influencers: \${influencersResult.influencersScored} influencers scored\`);
      } catch (error) {
        console.error('❌ Error in influencer scoring:', error.message);
        results.errors.push({ step: 'influencers', error: error.message });
      }

      // 4. Generate alerts
      console.log('\n🚨 Step 4/4: Generating alerts...');
      try {
        const alertsResult = await this.alertGenerator.generateAlerts(campaignId);
        results.results.alerts = alertsResult;
        console.log(\`✅ Alerts: \${alertsResult.alertsGenerated} alerts generated\`);
      } catch (error) {
        console.error('❌ Error in alert generation:', error.message);
        results.errors.push({ step: 'alerts', error: error.message });
      }

      results.completedAt = new Date().toISOString();
      results.success = results.errors.length === 0;

      console.log(\`\n✅ Analytics complete for campaign \${campaignId.slice(0, 8)}\`);
      console.log(\`   Daily Stats: \${results.results.dailyStats?.daysProcessed || 0} days\`);
      console.log(\`   Trends: \${results.results.trends?.trendsDetected || 0} detected\`);
      console.log(\`   Influencers: \${results.results.influencers?.influencersScored || 0} scored\`);
      console.log(\`   Alerts: \${results.results.alerts?.alertsGenerated || 0} generated\`);

      if (results.errors.length > 0) {
        console.log(\`   ⚠️ Errors: \${results.errors.length}\`);
      }

      return results;

    } catch (error) {
      console.error('❌ Critical error in analytics worker:', error);
      results.completedAt = new Date().toISOString();
      results.success = false;
      results.errors.push({ step: 'critical', error: error.message });
      return results;
    }
  }

  /**
   * Run analytics for all active campaigns
   */
  async runAnalyticsForAllCampaigns(userId = null) {
    console.log('\n🔬 Running analytics for all active campaigns...');

    try {
      // Get all active campaigns
      let query = this.supabase
        .from('social_listening.campaigns')
        .select('id, name, user_id')
        .eq('is_active', true);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: campaigns, error } = await query;

      if (error) throw error;

      if (!campaigns || campaigns.length === 0) {
        console.log('⚠️ No active campaigns found');
        return { processed: 0, results: [] };
      }

      console.log(\`📋 Found \${campaigns.length} active campaign(s)\`);

      // Run analytics for each campaign
      const results = [];
      for (const campaign of campaigns) {
        console.log(\`\n▶️ Processing campaign: \${campaign.name} (\${campaign.id.slice(0, 8)})\`);
        try {
          const result = await this.runAnalytics(campaign.id);
          results.push(result);
        } catch (error) {
          console.error(\`❌ Error processing campaign \${campaign.id}:\`, error.message);
          results.push({
            campaignId: campaign.id,
            success: false,
            error: error.message
          });
        }
      }

      console.log(\`\n✅ Analytics complete for \${campaigns.length} campaign(s)\`);

      return {
        processed: campaigns.length,
        results
      };

    } catch (error) {
      console.error('❌ Error in runAnalyticsForAllCampaigns:', error);
      throw error;
    }
  }

  /**
   * Get analytics summary for a campaign
   */
  async getAnalyticsSummary(campaignId, days = 7) {
    console.log(\`📊 Getting analytics summary for campaign \${campaignId.slice(0, 8)}...\`);

    try {
      // Get daily stats summary
      const statsSummary = await this.dailyStatsAggregator.getSummaryStats(campaignId, days);

      // Get active trends
      const trends = await this.trendDetector.getActiveTrends(campaignId, null, 10);

      // Get top influencers
      const influencers = await this.influencerScorer.getTopInfluencers(campaignId, null, null, 10);

      // Get active alerts
      const alerts = await this.alertGenerator.getActiveAlerts(campaignId, false, null, 10);

      return {
        campaignId,
        period_days: days,
        statistics: statsSummary,
        top_trends: trends,
        top_influencers: influencers,
        active_alerts: alerts,
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ Error getting analytics summary:', error);
      throw error;
    }
  }
}
