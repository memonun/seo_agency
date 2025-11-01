import { createClient } from '@supabase/supabase-js';

/**
 * Trend Detection Analyzer
 *
 * Analyzes mention data to detect:
 * - Volume spikes (sudden increase in mentions)
 * - Trending hashtags
 * - Trending keywords
 * - Emerging trends
 *
 * Stores results in social_listening.trends table
 */
export class TrendDetector {
  constructor({ supabaseUrl, supabaseKey }) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('TrendDetector requires supabaseUrl and supabaseKey');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('✅ TrendDetector initialized');
  }

  /**
   * Analyze trends for a campaign
   */
  async analyzeTrends(campaignId) {
    console.log(\`\n📊 Analyzing trends for campaign \${campaignId.slice(0, 8)}...\`);

    try {
      const trends = [];

      // 1. Detect volume spikes
      const volumeTrends = await this.detectVolumeSpikes(campaignId);
      trends.push(...volumeTrends);

      // 2. Analyze hashtag trends
      const hashtagTrends = await this.analyzeHashtagTrends(campaignId);
      trends.push(...hashtagTrends);

      // 3. Analyze keyword trends
      const keywordTrends = await this.analyzeKeywordTrends(campaignId);
      trends.push(...keywordTrends);

      // 4. Save trends to database
      await this.saveTrends(campaignId, trends);

      console.log(\`✅ Trend analysis complete: \${trends.length} trends detected\`);

      return {
        success: true,
        trendsDetected: trends.length,
        trends
      };

    } catch (error) {
      console.error('❌ Error analyzing trends:', error);
      throw error;
    }
  }

  /**
   * Detect volume spikes - sudden increases in mention volume
   */
  async detectVolumeSpikes(campaignId) {
    console.log('📈 Detecting volume spikes...');

    const trends = [];

    try {
      // Get mention counts by day for last 30 days
      const { data: mentions, error } = await this.supabase
        .from('social_listening.mentions')
        .select('post_timestamp, platform')
        .eq('campaign_id', campaignId)
        .gte('post_timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('post_timestamp', { ascending: true });

      if (error) throw error;

      if (!mentions || mentions.length < 7) {
        console.log('⚠️ Not enough data for volume spike detection (need 7+ days)');
        return [];
      }

      // Group by day
      const dailyCounts = {};
      mentions.forEach(m => {
        const date = m.post_timestamp.split('T')[0];
        if (!dailyCounts[date]) {
          dailyCounts[date] = { total: 0, instagram: 0, tiktok: 0 };
        }
        dailyCounts[date].total++;
        dailyCounts[date][m.platform]++;
      });

      // Calculate average and detect spikes
      const dates = Object.keys(dailyCounts).sort();
      const counts = dates.map(d => dailyCounts[d].total);
      
      // Calculate rolling 7-day average
      for (let i = 7; i < counts.length; i++) {
        const avg7day = counts.slice(i - 7, i).reduce((a, b) => a + b, 0) / 7;
        const today = counts[i];
        const spikeRatio = today / avg7day;

        // Spike detected if today's count is 2.5x the 7-day average
        if (spikeRatio >= 2.5 && today >= 10) {
          const date = dates[i];
          trends.push({
            trend_type: 'volume_spike',
            trend_value: 'Overall Mention Volume',
            platform: 'all',
            trend_score: spikeRatio * 10, // Higher spike = higher score
            mention_count: today,
            velocity: ((today - avg7day) / avg7day) * 100,
            first_detected_at: new Date(date).toISOString(),
            last_seen_at: new Date().toISOString(),
            metadata: {
              spike_ratio: spikeRatio.toFixed(2),
              previous_avg: Math.round(avg7day),
              current_count: today,
              date
            }
          });

          console.log(\`  📊 Volume spike detected on \${date}: \${today} mentions (avg: \${Math.round(avg7day)}, \${spikeRatio.toFixed(1)}x spike)\`);
        }
      }

      console.log(\`✅ Volume spike detection complete: \${trends.length} spikes found\`);
      return trends;

    } catch (error) {
      console.error('❌ Error detecting volume spikes:', error);
      return [];
    }
  }

  /**
   * Analyze hashtag trends - most frequently used hashtags
   */
  async analyzeHashtagTrends(campaignId) {
    console.log('🏷️ Analyzing hashtag trends...');

    const trends = [];

    try {
      // Get all mentions with hashtags from last 7 days
      const { data: mentions, error } = await this.supabase
        .from('social_listening.mentions')
        .select('post_timestamp, platform, instagram_data, tiktok_data')
        .eq('campaign_id', campaignId)
        .gte('post_timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      if (!mentions || mentions.length === 0) {
        console.log('⚠️ No mentions found for hashtag analysis');
        return [];
      }

      // Extract and count hashtags
      const hashtagCounts = {};
      const hashtagFirstSeen = {};
      const hashtagLastSeen = {};
      const hashtagPlatforms = {};

      mentions.forEach(m => {
        let hashtags = [];

        // Extract hashtags based on platform
        if (m.platform === 'instagram' && m.instagram_data?.hashtags) {
          hashtags = m.instagram_data.hashtags;
        } else if (m.platform === 'tiktok' && m.tiktok_data?.hashtags) {
          hashtags = m.tiktok_data.hashtags;
        }

        hashtags.forEach(tag => {
          const cleanTag = tag.toLowerCase().replace(/^#/, '');
          if (!cleanTag) return;

          if (!hashtagCounts[cleanTag]) {
            hashtagCounts[cleanTag] = 0;
            hashtagFirstSeen[cleanTag] = m.post_timestamp;
            hashtagPlatforms[cleanTag] = new Set();
          }

          hashtagCounts[cleanTag]++;
          hashtagLastSeen[cleanTag] = m.post_timestamp;
          hashtagPlatforms[cleanTag].add(m.platform);
        });
      });

      // Convert to trends (top 20 hashtags)
      const sortedHashtags = Object.entries(hashtagCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

      sortedHashtags.forEach(([hashtag, count]) => {
        // Calculate velocity (mentions per day)
        const firstSeen = new Date(hashtagFirstSeen[hashtag]);
        const lastSeen = new Date(hashtagLastSeen[hashtag]);
        const daysDiff = Math.max(1, (lastSeen - firstSeen) / (24 * 60 * 60 * 1000));
        const velocity = count / daysDiff;

        // Calculate trend score (count * velocity)
        const trendScore = count * Math.log10(velocity + 1) * 10;

        trends.push({
          trend_type: 'hashtag',
          trend_value: \`#\${hashtag}\`,
          platform: hashtagPlatforms[hashtag].size > 1 ? 'all' : Array.from(hashtagPlatforms[hashtag])[0],
          trend_score: trendScore,
          mention_count: count,
          velocity,
          first_detected_at: hashtagFirstSeen[hashtag],
          last_seen_at: hashtagLastSeen[hashtag],
          metadata: {
            platforms: Array.from(hashtagPlatforms[hashtag]),
            mentions_per_day: velocity.toFixed(2)
          }
        });
      });

      console.log(\`✅ Hashtag analysis complete: \${trends.length} trending hashtags found\`);
      return trends;

    } catch (error) {
      console.error('❌ Error analyzing hashtag trends:', error);
      return [];
    }
  }

  /**
   * Analyze keyword trends - frequently mentioned words/phrases
   */
  async analyzeKeywordTrends(campaignId) {
    console.log('🔍 Analyzing keyword trends...');

    const trends = [];

    try {
      // Get all mentions with captions from last 7 days
      const { data: mentions, error } = await this.supabase
        .from('social_listening.mentions')
        .select('post_timestamp, platform, caption')
        .eq('campaign_id', campaignId)
        .gte('post_timestamp', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .not('caption', 'is', null);

      if (error) throw error;

      if (!mentions || mentions.length === 0) {
        console.log('⚠️ No mentions with captions found for keyword analysis');
        return [];
      }

      // Extract keywords (simple approach: 2-3 word phrases)
      const keywordCounts = {};
      const keywordFirstSeen = {};
      const keywordLastSeen = {};
      const keywordPlatforms = {};

      // Stopwords to filter out
      const stopwords = new Set([
        'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
        'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
        'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
        'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their',
        'is', 'are', 'was', 'were', 'been', 'am', 'if', 'can', 'so', 'just'
      ]);

      mentions.forEach(m => {
        if (!m.caption) return;

        // Tokenize caption
        const words = m.caption
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 2 && !stopwords.has(w));

        // Extract 2-word phrases
        for (let i = 0; i < words.length - 1; i++) {
          const phrase = \`\${words[i]} \${words[i + 1]}\`;

          if (!keywordCounts[phrase]) {
            keywordCounts[phrase] = 0;
            keywordFirstSeen[phrase] = m.post_timestamp;
            keywordPlatforms[phrase] = new Set();
          }

          keywordCounts[phrase]++;
          keywordLastSeen[phrase] = m.post_timestamp;
          keywordPlatforms[phrase].add(m.platform);
        }
      });

      // Convert to trends (top 15 keywords with at least 3 mentions)
      const sortedKeywords = Object.entries(keywordCounts)
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

      sortedKeywords.forEach(([keyword, count]) => {
        // Calculate velocity
        const firstSeen = new Date(keywordFirstSeen[keyword]);
        const lastSeen = new Date(keywordLastSeen[keyword]);
        const daysDiff = Math.max(1, (lastSeen - firstSeen) / (24 * 60 * 60 * 1000));
        const velocity = count / daysDiff;

        // Calculate trend score
        const trendScore = count * Math.log10(velocity + 1) * 5;

        trends.push({
          trend_type: 'keyword',
          trend_value: keyword,
          platform: keywordPlatforms[keyword].size > 1 ? 'all' : Array.from(keywordPlatforms[keyword])[0],
          trend_score: trendScore,
          mention_count: count,
          velocity,
          first_detected_at: keywordFirstSeen[keyword],
          last_seen_at: keywordLastSeen[keyword],
          metadata: {
            platforms: Array.from(keywordPlatforms[keyword]),
            mentions_per_day: velocity.toFixed(2)
          }
        });
      });

      console.log(\`✅ Keyword analysis complete: \${trends.length} trending keywords found\`);
      return trends;

    } catch (error) {
      console.error('❌ Error analyzing keyword trends:', error);
      return [];
    }
  }

  /**
   * Save trends to database
   */
  async saveTrends(campaignId, trends) {
    if (!trends || trends.length === 0) {
      console.log('⚠️ No trends to save');
      return;
    }

    console.log(\`💾 Saving \${trends.length} trends to database...\`);

    try {
      // Deactivate old trends
      await this.supabase
        .from('social_listening.trends')
        .update({ is_active: false })
        .eq('campaign_id', campaignId);

      // Prepare trend records
      const trendRecords = trends.map(t => ({
        campaign_id: campaignId,
        trend_type: t.trend_type,
        trend_value: t.trend_value,
        platform: t.platform,
        trend_score: t.trend_score,
        mention_count: t.mention_count,
        velocity: t.velocity,
        first_detected_at: t.first_detected_at,
        last_seen_at: t.last_seen_at,
        is_active: true,
        metadata: t.metadata
      }));

      // Insert new trends
      const { data, error } = await this.supabase
        .from('social_listening.trends')
        .insert(trendRecords)
        .select();

      if (error) {
        console.error('❌ Error saving trends:', error);
        throw error;
      }

      console.log(\`✅ Saved \${data?.length || 0} trends to database\`);

    } catch (error) {
      console.error('❌ Error in saveTrends:', error);
      throw error;
    }
  }

  /**
   * Get active trends for a campaign
   */
  async getActiveTrends(campaignId, platform = null, limit = 20) {
    let query = this.supabase
      .from('social_listening.trends')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('is_active', true)
      .order('trend_score', { ascending: false })
      .limit(limit);

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching trends:', error);
      return [];
    }

    return data || [];
  }
}
