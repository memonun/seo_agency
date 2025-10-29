// Twitter Account Evolution Tracking and Historical Analysis
// Provides utilities for tracking account growth and tweet evolution over time

import { supabase } from '../lib/supabase';

/**
 * Get account evolution data showing growth over time
 * @param {string} username - Twitter username (without @)
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Object} Account evolution data
 */
export const getAccountEvolution = async (username, days = 30) => {
  try {
    const { data, error } = await supabase
      .rpc('get_account_evolution', {
        p_username: username,
        p_days: days
      });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error('❌ Failed to get account evolution:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get tweet evolution data for individual posts
 * @param {string} tweetId - Tweet ID to track
 * @returns {Object} Tweet evolution data
 */
export const getTweetEvolution = async (tweetId) => {
  try {
    const { data, error } = await supabase
      .from('twitter_tweets')
      .select(`
        tweet_id,
        tweet_text,
        created_at,
        likes,
        retweets,
        replies,
        views,
        engagement_rate,
        account_followers_at_time,
        sentiment_label,
        sentiment_score
      `)
      .eq('tweet_id', tweetId)
      .eq('is_account_specific', true)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Calculate evolution metrics
    const evolution = data.map((tweet, index) => {
      const previous = data[index - 1];
      const totalEngagement = tweet.likes + tweet.retweets + tweet.replies;
      const previousEngagement = previous ? 
        previous.likes + previous.retweets + previous.replies : 0;

      return {
        ...tweet,
        total_engagement: totalEngagement,
        snapshot_number: index + 1,
        engagement_growth: previousEngagement > 0 ? 
          ((totalEngagement - previousEngagement) / previousEngagement * 100).toFixed(2) : '0.00',
        likes_growth: previous ? tweet.likes - previous.likes : 0,
        retweets_growth: previous ? tweet.retweets - previous.retweets : 0,
        replies_growth: previous ? tweet.replies - previous.replies : 0,
        virality_score: totalEngagement > 100 ? 'High' : 
                       totalEngagement > 50 ? 'Medium' : 'Low'
      };
    });

    return { success: true, data: evolution };
  } catch (error) {
    console.error('❌ Failed to get tweet evolution:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get account performance metrics and trends
 * @param {string} username - Twitter username (without @)
 * @param {number} days - Number of days to analyze (default: 30)
 * @returns {Object} Performance metrics
 */
export const getAccountPerformanceMetrics = async (username, days = 30) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get account data
    const { data: accountData, error: accountError } = await supabase
      .from('twitter_accounts')
      .select('*')
      .eq('username', username)
      .single();

    if (accountError) throw accountError;

    // Get tweets within the period
    const { data: tweetsData, error: tweetsError } = await supabase
      .from('twitter_tweets')
      .select(`
        tweet_id,
        created_at,
        likes,
        retweets,
        replies,
        views,
        engagement_rate,
        account_followers_at_time,
        sentiment_label
      `)
      .eq('account_id', accountData.id)
      .eq('is_account_specific', true)
      .gte('created_at', cutoffDate.toISOString())
      .order('created_at', { ascending: true });

    if (tweetsError) throw tweetsError;

    if (tweetsData.length === 0) {
      return {
        success: true,
        data: {
          account: accountData,
          metrics: {
            total_tweets: 0,
            avg_engagement_rate: 0,
            total_engagement: 0,
            follower_growth: 0,
            best_performing_tweet: null,
            posting_frequency: 0,
            sentiment_distribution: { positive: 0, negative: 0, neutral: 0 }
          }
        }
      };
    }

    // Calculate metrics
    const totalTweets = tweetsData.length;
    const totalEngagement = tweetsData.reduce((sum, tweet) => 
      sum + tweet.likes + tweet.retweets + tweet.replies, 0);
    const avgEngagementRate = tweetsData.reduce((sum, tweet) => 
      sum + parseFloat(tweet.engagement_rate || 0), 0) / totalTweets;

    // Follower growth
    const oldestTweet = tweetsData[0];
    const newestTweet = tweetsData[tweetsData.length - 1];
    const followerGrowth = newestTweet.account_followers_at_time - 
      oldestTweet.account_followers_at_time;

    // Best performing tweet
    const bestTweet = tweetsData.reduce((best, current) => {
      const currentEngagement = current.likes + current.retweets + current.replies;
      const bestEngagement = best.likes + best.retweets + best.replies;
      return currentEngagement > bestEngagement ? current : best;
    });

    // Posting frequency (tweets per day)
    const daysDiff = Math.max(1, 
      (new Date(newestTweet.created_at) - new Date(oldestTweet.created_at)) / 
      (1000 * 60 * 60 * 24));
    const postingFrequency = totalTweets / daysDiff;

    // Sentiment distribution
    const sentimentCounts = tweetsData.reduce((acc, tweet) => {
      const sentiment = tweet.sentiment_label || 'neutral';
      acc[sentiment] = (acc[sentiment] || 0) + 1;
      return acc;
    }, {});

    return {
      success: true,
      data: {
        account: accountData,
        period: {
          days,
          start_date: cutoffDate.toISOString(),
          end_date: new Date().toISOString()
        },
        metrics: {
          total_tweets: totalTweets,
          avg_engagement_rate: avgEngagementRate.toFixed(4),
          total_engagement: totalEngagement,
          follower_growth: followerGrowth,
          follower_growth_percent: oldestTweet.account_followers_at_time > 0 ? 
            (followerGrowth / oldestTweet.account_followers_at_time * 100).toFixed(2) : '0.00',
          best_performing_tweet: {
            tweet_id: bestTweet.tweet_id,
            total_engagement: bestTweet.likes + bestTweet.retweets + bestTweet.replies,
            engagement_rate: bestTweet.engagement_rate
          },
          posting_frequency: postingFrequency.toFixed(2),
          sentiment_distribution: {
            positive: sentimentCounts.positive || 0,
            negative: sentimentCounts.negative || 0,
            neutral: sentimentCounts.neutral || 0
          }
        }
      }
    };

  } catch (error) {
    console.error('❌ Failed to get account performance metrics:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Compare account performance between two time periods
 * @param {string} username - Twitter username (without @)
 * @param {number} currentPeriod - Current period in days (default: 7)
 * @param {number} previousPeriod - Previous period in days (default: 7)
 * @returns {Object} Comparison data
 */
export const compareAccountPeriods = async (username, currentPeriod = 7, previousPeriod = 7) => {
  try {
    // Get current period data
    const currentEndDate = new Date();
    const currentStartDate = new Date();
    currentStartDate.setDate(currentStartDate.getDate() - currentPeriod);

    // Get previous period data
    const previousEndDate = new Date(currentStartDate);
    const previousStartDate = new Date(previousEndDate);
    previousStartDate.setDate(previousStartDate.getDate() - previousPeriod);

    const [currentData, previousData] = await Promise.all([
      getAccountPerformanceMetrics(username, currentPeriod),
      getPeriodSpecificMetrics(username, previousStartDate, previousEndDate)
    ]);

    if (!currentData.success || !previousData.success) {
      throw new Error('Failed to fetch comparison data');
    }

    const current = currentData.data.metrics;
    const previous = previousData.metrics;

    // Calculate percentage changes
    const changes = {
      tweets: calculatePercentageChange(previous.total_tweets, current.total_tweets),
      engagement: calculatePercentageChange(previous.total_engagement, current.total_engagement),
      engagement_rate: calculatePercentageChange(
        parseFloat(previous.avg_engagement_rate), 
        parseFloat(current.avg_engagement_rate)
      ),
      posting_frequency: calculatePercentageChange(
        parseFloat(previous.posting_frequency), 
        parseFloat(current.posting_frequency)
      )
    };

    return {
      success: true,
      data: {
        current_period: {
          ...current,
          period: `Last ${currentPeriod} days`
        },
        previous_period: {
          ...previous,
          period: `Previous ${previousPeriod} days`
        },
        changes,
        trends: {
          tweets: changes.tweets > 0 ? 'increasing' : changes.tweets < 0 ? 'decreasing' : 'stable',
          engagement: changes.engagement > 0 ? 'improving' : changes.engagement < 0 ? 'declining' : 'stable',
          overall: calculateOverallTrend(changes)
        }
      }
    };

  } catch (error) {
    console.error('❌ Failed to compare account periods:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get all tracked accounts with basic stats
 * @returns {Object} List of tracked accounts
 */
export const getTrackedAccounts = async () => {
  try {
    const { data, error } = await supabase
      .from('twitter_accounts')
      .select(`
        id,
        username,
        display_name,
        followers_count,
        verified,
        profile_image_url,
        first_tracked_at,
        last_updated_at,
        last_seen_at,
        tweet_count
      `)
      .eq('is_active', true)
      .order('last_seen_at', { ascending: false });

    if (error) throw error;

    // Get tweet counts for each account
    const accountsWithStats = await Promise.all(
      data.map(async (account) => {
        const { count } = await supabase
          .from('twitter_tweets')
          .select('*', { count: 'exact', head: true })
          .eq('account_id', account.id)
          .eq('is_account_specific', true);

        return {
          ...account,
          total_tracked_tweets: count || 0,
          tracking_duration_days: Math.ceil(
            (new Date() - new Date(account.first_tracked_at)) / (1000 * 60 * 60 * 24)
          )
        };
      })
    );

    return { success: true, data: accountsWithStats };

  } catch (error) {
    console.error('❌ Failed to get tracked accounts:', error);
    return { success: false, error: error.message };
  }
};

// Helper function to get metrics for a specific period
const getPeriodSpecificMetrics = async (username, startDate, endDate) => {
  const { data: accountData, error: accountError } = await supabase
    .from('twitter_accounts')
    .select('*')
    .eq('username', username)
    .single();

  if (accountError) throw accountError;

  const { data: tweetsData, error: tweetsError } = await supabase
    .from('twitter_tweets')
    .select(`
      likes,
      retweets,
      replies,
      engagement_rate,
      sentiment_label
    `)
    .eq('account_id', accountData.id)
    .eq('is_account_specific', true)
    .gte('created_at', startDate.toISOString())
    .lte('created_at', endDate.toISOString());

  if (tweetsError) throw tweetsError;

  const totalTweets = tweetsData.length;
  if (totalTweets === 0) {
    return {
      metrics: {
        total_tweets: 0,
        total_engagement: 0,
        avg_engagement_rate: '0.0000',
        posting_frequency: '0.00'
      }
    };
  }

  const totalEngagement = tweetsData.reduce((sum, tweet) => 
    sum + tweet.likes + tweet.retweets + tweet.replies, 0);
  const avgEngagementRate = tweetsData.reduce((sum, tweet) => 
    sum + parseFloat(tweet.engagement_rate || 0), 0) / totalTweets;
  
  const daysDiff = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
  const postingFrequency = totalTweets / daysDiff;

  return {
    metrics: {
      total_tweets: totalTweets,
      total_engagement: totalEngagement,
      avg_engagement_rate: avgEngagementRate.toFixed(4),
      posting_frequency: postingFrequency.toFixed(2)
    }
  };
};

// Helper function to calculate percentage change
const calculatePercentageChange = (oldValue, newValue) => {
  if (oldValue === 0) return newValue > 0 ? 100 : 0;
  return Number(((newValue - oldValue) / oldValue * 100).toFixed(2));
};

// Helper function to calculate overall trend
const calculateOverallTrend = (changes) => {
  const positiveChanges = Object.values(changes).filter(change => change > 0).length;
  const totalChanges = Object.values(changes).length;
  
  if (positiveChanges >= totalChanges * 0.75) return 'very_positive';
  if (positiveChanges >= totalChanges * 0.5) return 'positive';
  if (positiveChanges >= totalChanges * 0.25) return 'mixed';
  return 'declining';
};