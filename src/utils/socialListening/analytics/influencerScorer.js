import { createClient } from '@supabase/supabase-js';

/**
 * Influencer Scoring System
 *
 * Analyzes authors to identify high-impact influencers based on:
 * - Follower count
 * - Engagement rate (likes + comments / followers)
 * - Mention frequency
 * - Sentiment of their mentions
 * - Cross-platform presence
 *
 * Stores results in social_listening.influencer_scores table
 */
export class InfluencerScorer {
  constructor({ supabaseUrl, supabaseKey }) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('InfluencerScorer requires supabaseUrl and supabaseKey');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    console.log('✅ InfluencerScorer initialized');
  }

  /**
   * Score influencers for a campaign
   */
  async scoreInfluencers(campaignId) {
    console.log(\`\n👥 Scoring influencers for campaign \${campaignId.slice(0, 8)}...\`);

    try {
      // Get all mentions with author data from last 30 days
      const { data: mentions, error } = await this.supabase
        .from('social_listening.mentions')
        .select('*')
        .eq('campaign_id', campaignId)
        .gte('post_timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

      if (error) throw error;

      if (!mentions || mentions.length === 0) {
        console.log('⚠️ No mentions found for influencer scoring');
        return { success: true, influencersScored: 0 };
      }

      console.log(\`📊 Analyzing \${mentions.length} mentions for influencer scoring...\`);

      // Group mentions by author
      const authorData = {};

      mentions.forEach(m => {
        const authorKey = \`\${m.platform}:\${m.author_username}\`;

        if (!authorData[authorKey]) {
          authorData[authorKey] = {
            platform: m.platform,
            author_username: m.author_username,
            author_id: m.author_id,
            mentions: [],
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            totalViews: 0,
            followers: 0,
            verified: false
          };
        }

        const author = authorData[authorKey];
        author.mentions.push(m);
        author.totalLikes += m.likes || 0;
        author.totalComments += m.comments || 0;
        author.totalShares += m.shares || 0;
        author.totalViews += m.views || 0;

        // Extract follower count from platform-specific data
        if (m.platform === 'tiktok' && m.tiktok_data?.author?.followers) {
          author.followers = Math.max(author.followers, m.tiktok_data.author.followers);
          author.verified = author.verified || m.tiktok_data.author.verified;
        } else if (m.platform === 'instagram' && m.instagram_data?.author?.followers) {
          author.followers = Math.max(author.followers, m.instagram_data.author.followers);
        }
      });

      // Score each author
      const influencerScores = [];

      for (const [authorKey, author] of Object.entries(authorData)) {
        const score = this.calculateInfluencerScore(author);
        
        if (score.overall_score > 0) {
          influencerScores.push({
            campaign_id: campaignId,
            platform: author.platform,
            author_username: author.author_username,
            author_id: author.author_id,
            ...score
          });
        }
      }

      // Sort by overall score
      influencerScores.sort((a, b) => b.overall_score - a.overall_score);

      // Save to database
      await this.saveInfluencerScores(campaignId, influencerScores);

      console.log(\`✅ Influencer scoring complete: \${influencerScores.length} influencers scored\`);

      return {
        success: true,
        influencersScored: influencerScores.length,
        topInfluencers: influencerScores.slice(0, 10)
      };

    } catch (error) {
      console.error('❌ Error scoring influencers:', error);
      throw error;
    }
  }

  /**
   * Calculate influencer score for an author
   */
  calculateInfluencerScore(author) {
    const mentionCount = author.mentions.length;

    // 1. Reach Score (based on followers)
    let reachScore = 0;
    if (author.followers > 1000000) {
      reachScore = 100; // Mega influencer
    } else if (author.followers > 100000) {
      reachScore = 80; // Macro influencer
    } else if (author.followers > 10000) {
      reachScore = 60; // Mid-tier influencer
    } else if (author.followers > 1000) {
      reachScore = 40; // Micro influencer
    } else {
      reachScore = 20; // Nano influencer
    }

    // 2. Engagement Score (likes + comments per post)
    const avgLikes = author.totalLikes / mentionCount;
    const avgComments = author.totalComments / mentionCount;
    const avgEngagement = avgLikes + avgComments;

    // Engagement rate (if we have follower count)
    const engagementRate = author.followers > 0 
      ? (avgEngagement / author.followers) * 100 
      : 0;

    const engagementScore = Math.min(100, engagementRate * 10);

    // 3. Frequency Score (how often they mention the campaign)
    const frequencyScore = Math.min(100, mentionCount * 10);

    // 4. Impact Score (total reach across all mentions)
    const totalReach = author.totalViews || (author.followers * mentionCount);
    const impactScore = Math.min(100, Math.log10(totalReach + 1) * 10);

    // 5. Sentiment Score (average sentiment of their mentions)
    const sentiments = author.mentions
      .filter(m => m.sentiment_score !== null)
      .map(m => m.sentiment_score);

    const avgSentiment = sentiments.length > 0
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : 0.5;

    const sentimentScore = avgSentiment * 100;

    // 6. Verification Bonus
    const verificationBonus = author.verified ? 20 : 0;

    // Calculate overall score (weighted average)
    const overallScore = (
      reachScore * 0.3 +
      engagementScore * 0.25 +
      frequencyScore * 0.15 +
      impactScore * 0.15 +
      sentimentScore * 0.10 +
      verificationBonus * 0.05
    );

    // Determine tier
    let tier = 'nano';
    if (author.followers > 1000000) tier = 'mega';
    else if (author.followers > 100000) tier = 'macro';
    else if (author.followers > 10000) tier = 'mid';
    else if (author.followers > 1000) tier = 'micro';

    return {
      overall_score: Math.round(overallScore),
      reach_score: Math.round(reachScore),
      engagement_score: Math.round(engagementScore),
      frequency_score: Math.round(frequencyScore),
      impact_score: Math.round(impactScore),
      sentiment_score: Math.round(sentimentScore),
      follower_count: author.followers,
      mention_count: mentionCount,
      total_engagement: author.totalLikes + author.totalComments,
      avg_engagement_rate: engagementRate.toFixed(2),
      is_verified: author.verified,
      tier,
      last_mention_at: author.mentions[author.mentions.length - 1].post_timestamp,
      metadata: {
        total_likes: author.totalLikes,
        total_comments: author.totalComments,
        total_shares: author.totalShares,
        total_views: author.totalViews,
        avg_likes: Math.round(avgLikes),
        avg_comments: Math.round(avgComments),
        avg_sentiment: avgSentiment.toFixed(2)
      }
    };
  }

  /**
   * Save influencer scores to database
   */
  async saveInfluencerScores(campaignId, scores) {
    if (!scores || scores.length === 0) {
      console.log('⚠️ No influencer scores to save');
      return;
    }

    console.log(\`💾 Saving \${scores.length} influencer scores to database...\`);

    try {
      // Delete old scores for this campaign
      await this.supabase
        .from('social_listening.influencer_scores')
        .delete()
        .eq('campaign_id', campaignId);

      // Insert new scores in batches
      const batchSize = 50;
      let savedCount = 0;

      for (let i = 0; i < scores.length; i += batchSize) {
        const batch = scores.slice(i, i + batchSize);

        const { data, error } = await this.supabase
          .from('social_listening.influencer_scores')
          .insert(batch)
          .select();

        if (error) {
          console.error(\`❌ Error saving batch \${i}-\${i + batch.length}:\`, error);
          continue;
        }

        savedCount += data?.length || 0;
      }

      console.log(\`✅ Saved \${savedCount}/\${scores.length} influencer scores\`);

    } catch (error) {
      console.error('❌ Error in saveInfluencerScores:', error);
      throw error;
    }
  }

  /**
   * Get top influencers for a campaign
   */
  async getTopInfluencers(campaignId, platform = null, tier = null, limit = 20) {
    let query = this.supabase
      .from('social_listening.influencer_scores')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('overall_score', { ascending: false })
      .limit(limit);

    if (platform) {
      query = query.eq('platform', platform);
    }

    if (tier) {
      query = query.eq('tier', tier);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ Error fetching influencers:', error);
      return [];
    }

    return data || [];
  }
}
