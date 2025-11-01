import { createClient } from '@supabase/supabase-js';

/**
 * Daily Statistics Aggregator
 *
 * Aggregates daily metrics for campaign monitoring:
 * - Total mentions per day
 * - Platform breakdown
 * - Sentiment distribution
 * - Engagement metrics (likes, comments, shares, views)
 * - Unique authors
 * - Top performing posts
 *
 * Stores results in social_listening.daily_stats table
 */
export class DailyStatsAggregator {
  constructor({ supabaseUrl, supabaseKey }) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('DailyStatsAggregator requires supabaseUrl and supabaseKey');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('✅ DailyStatsAggregator initialized');
  }

  /**
   * Aggregate daily statistics for a campaign
   * Can specify date range or default to last 30 days
   */
  async aggregateStats(campaignId, startDate = null, endDate = null) {
    console.log(\`\n📊 Aggregating daily statistics for campaign \${campaignId.slice(0, 8)}...\`);

    try {
      // Default to last 30 days if not specified
      const end = endDate || new Date().toISOString().split('T')[0];
      const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      console.log(\`📅 Date range: \${start} to \${end}\`);

      // Get all mentions for the campaign in date range
      const { data: mentions, error } = await this.supabase
        .from('social_listening.mentions')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('post_timestamp', \`\${start}T00:00:00Z\`)
        .lte('post_timestamp', \`\${end}T23:59:59Z\`)
        .order('post_timestamp', { ascending: true });

      if (error) throw error;

      if (!mentions || mentions.length === 0) {
        console.log('⚠️ No mentions found for date range');
        return { success: true, daysProcessed: 0 };
      }

      console.log(\`📥 Processing \${mentions.length} mentions...\`);

      // Group by date
      const dailyData = {};

      mentions.forEach(m => {
        const date = m.post_timestamp.split('T')[0];

        if (!dailyData[date]) {
          dailyData[date] = {
            date,
            mentions: [],
            authors: new Set(),
            platforms: { instagram: 0, tiktok: 0 },
            sentiments: { positive: 0, neutral: 0, negative: 0 },
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            totalViews: 0
          };
        }

        const day = dailyData[date];
        day.mentions.push(m);
        day.authors.add(\`\${m.platform}:\${m.author_username}\`);
        day.platforms[m.platform]++;
        day.totalLikes += m.likes || 0;
        day.totalComments += m.comments || 0;
        day.totalShares += m.shares || 0;
        day.totalViews += m.views || 0;

        // Count sentiments
        if (m.sentiment_label) {
          const sentiment = m.sentiment_label.toLowerCase();
          if (day.sentiments[sentiment] !== undefined) {
            day.sentiments[sentiment]++;
          }
        }
      });

      // Convert to stats records
      const statsRecords = [];

      for (const [date, data] of Object.entries(dailyData)) {
        const mentionCount = data.mentions.length;
        const uniqueAuthors = data.authors.size;

        // Calculate averages
        const avgLikes = mentionCount > 0 ? data.totalLikes / mentionCount : 0;
        const avgComments = mentionCount > 0 ? data.totalComments / mentionCount : 0;
        const avgShares = mentionCount > 0 ? data.totalShares / mentionCount : 0;
        const avgViews = mentionCount > 0 ? data.totalViews / mentionCount : 0;

        // Calculate sentiment distribution
        const totalSentiments = data.sentiments.positive + data.sentiments.neutral + data.sentiments.negative;
        const sentimentDistribution = totalSentiments > 0 ? {
          positive: (data.sentiments.positive / totalSentiments * 100).toFixed(1),
          neutral: (data.sentiments.neutral / totalSentiments * 100).toFixed(1),
          negative: (data.sentiments.negative / totalSentiments * 100).toFixed(1)
        } : null;

        // Find top post
        const topPost = data.mentions.sort((a, b) => 
          (b.likes + b.comments + b.views) - (a.likes + a.comments + a.views)
        )[0];

        statsRecords.push({
          campaign_id: campaignId,
          date,
          mention_count: mentionCount,
          unique_authors: uniqueAuthors,
          instagram_count: data.platforms.instagram,
          tiktok_count: data.platforms.tiktok,
          total_likes: data.totalLikes,
          total_comments: data.totalComments,
          total_shares: data.totalShares,
          total_views: data.totalViews,
          avg_likes: Math.round(avgLikes),
          avg_comments: Math.round(avgComments),
          avg_shares: Math.round(avgShares),
          avg_views: Math.round(avgViews),
          positive_sentiment_count: data.sentiments.positive,
          neutral_sentiment_count: data.sentiments.neutral,
          negative_sentiment_count: data.sentiments.negative,
          sentiment_distribution: sentimentDistribution,
          top_post_id: topPost.id,
          metadata: {
            top_post: {
              post_url: topPost.post_url,
              author_username: topPost.author_username,
              likes: topPost.likes,
              comments: topPost.comments,
              views: topPost.views
            }
          }
        });
      }

      // Save to database
      await this.saveDailyStats(campaignId, statsRecords);

      console.log(\`✅ Daily stats aggregation complete: \${statsRecords.length} days processed\`);

      return {
        success: true,
        daysProcessed: statsRecords.length,
        stats: statsRecords
      };

    } catch (error) {
      console.error('❌ Error aggregating daily stats:', error);
      throw error;
    }
  }

  /**
   * Save daily statistics to database
   */
  async saveDailyStats(campaignId, stats) {
    if (!stats || stats.length === 0) {
      console.log('⚠️ No stats to save');
      return;
    }

    console.log(\`💾 Saving \${stats.length} daily stats records...\`);

    try {
      // Delete existing stats for the same dates
      const dates = stats.map(s => s.date);
      
      await this.supabase
        .from('social_listening.daily_stats')
        .delete()
        .eq('campaign_id', campaignId)
        .in('date', dates);

      // Insert new stats
      const { data, error } = await this.supabase
        .from('social_listening.daily_stats')
        .insert(stats)
        .select();

      if (error) {
        console.error('❌ Error saving daily stats:', error);
        throw error;
      }

      console.log(\`✅ Saved \${data?.length || 0} daily stats records\`);

    } catch (error) {
      console.error('❌ Error in saveDailyStats:', error);
      throw error;
    }
  }

  /**
   * Get daily stats for a campaign
   */
  async getDailyStats(campaignId, startDate = null, endDate = null, limit = 30) {
    let query = this.supabase
      .from('social_listening.daily_stats')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('date', { ascending: false })
      .limit(limit);

    if (startDate) {
      query = query.gte('date', startDate);
    }

    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching daily stats:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get summary statistics for a campaign
   */
  async getSummaryStats(campaignId, days = 7) {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const stats = await this.getDailyStats(campaignId, startDate);

    if (stats.length === 0) {
      return null;
    }

    // Calculate aggregates
    const totalMentions = stats.reduce((sum, s) => sum + s.mention_count, 0);
    const totalLikes = stats.reduce((sum, s) => sum + s.total_likes, 0);
    const totalComments = stats.reduce((sum, s) => sum + s.total_comments, 0);
    const totalViews = stats.reduce((sum, s) => sum + s.total_views, 0);

    const avgMentionsPerDay = totalMentions / stats.length;
    const avgLikesPerDay = totalLikes / stats.length;
    const avgCommentsPerDay = totalComments / stats.length;

    // Calculate sentiment breakdown
    const totalPositive = stats.reduce((sum, s) => sum + s.positive_sentiment_count, 0);
    const totalNeutral = stats.reduce((sum, s) => sum + s.neutral_sentiment_count, 0);
    const totalNegative = stats.reduce((sum, s) => sum + s.negative_sentiment_count, 0);
    const totalSentiments = totalPositive + totalNeutral + totalNegative;

    return {
      period_days: days,
      total_mentions: totalMentions,
      avg_mentions_per_day: Math.round(avgMentionsPerDay),
      total_likes: totalLikes,
      total_comments: totalComments,
      total_views: totalViews,
      avg_likes_per_day: Math.round(avgLikesPerDay),
      avg_comments_per_day: Math.round(avgCommentsPerDay),
      sentiment_breakdown: totalSentiments > 0 ? {
        positive: (totalPositive / totalSentiments * 100).toFixed(1),
        neutral: (totalNeutral / totalSentiments * 100).toFixed(1),
        negative: (totalNegative / totalSentiments * 100).toFixed(1)
      } : null,
      daily_stats: stats
    };
  }
}
