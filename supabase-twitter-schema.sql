-- Twitter Analytics Module Database Schema
-- Execute this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Twitter searches table
-- Stores each search query performed by users
CREATE TABLE IF NOT EXISTS twitter_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- Storing as TEXT for flexibility with different auth systems
  search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('keyword', 'hashtag')),
  query TEXT NOT NULL,
  mentions_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Twitter results table
-- Stores individual tweets from search results
CREATE TABLE IF NOT EXISTS twitter_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_id UUID NOT NULL REFERENCES twitter_searches(id) ON DELETE CASCADE,
  tweet_id VARCHAR(100) NOT NULL, -- Twitter tweet ID
  content TEXT NOT NULL,
  author_username VARCHAR(100),
  author_name TEXT,
  engagement_metrics JSONB DEFAULT '{}', -- likes, retweets, replies, views
  sentiment_score DECIMAL(4,3) DEFAULT 0, -- -1.000 to 1.000
  hashtags TEXT[] DEFAULT '{}', -- Array of hashtags
  tweet_url TEXT,
  tweet_created_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique tweets per search (prevent duplicates)
  UNIQUE(search_id, tweet_id)
);

-- Twitter analytics table
-- Stores aggregated analytics for each search
CREATE TABLE IF NOT EXISTS twitter_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  search_id UUID NOT NULL REFERENCES twitter_searches(id) ON DELETE CASCADE,
  total_tweets INTEGER DEFAULT 0,
  avg_sentiment DECIMAL(4,3) DEFAULT 0,
  sentiment_distribution JSONB DEFAULT '{"positive": 0, "negative": 0, "neutral": 0}',
  top_hashtags JSONB DEFAULT '[]', -- Array of top hashtags
  influencers JSONB DEFAULT '[]', -- Array of top influencers
  engagement_stats JSONB DEFAULT '{}', -- avg_likes, avg_retweets, total_engagement
  insights TEXT, -- AI-generated insights about the search
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_twitter_searches_user_id ON twitter_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_twitter_searches_created_at ON twitter_searches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_twitter_searches_type ON twitter_searches(search_type);

CREATE INDEX IF NOT EXISTS idx_twitter_results_search_id ON twitter_results(search_id);
CREATE INDEX IF NOT EXISTS idx_twitter_results_tweet_id ON twitter_results(tweet_id);
CREATE INDEX IF NOT EXISTS idx_twitter_results_sentiment ON twitter_results(sentiment_score);
CREATE INDEX IF NOT EXISTS idx_twitter_results_created_at ON twitter_results(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_twitter_analytics_search_id ON twitter_analytics(search_id);
CREATE INDEX IF NOT EXISTS idx_twitter_analytics_total_tweets ON twitter_analytics(total_tweets DESC);
CREATE INDEX IF NOT EXISTS idx_twitter_analytics_avg_sentiment ON twitter_analytics(avg_sentiment);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for auto-updating updated_at columns
DROP TRIGGER IF EXISTS update_twitter_searches_updated_at ON twitter_searches;
CREATE TRIGGER update_twitter_searches_updated_at
    BEFORE UPDATE ON twitter_searches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_twitter_analytics_updated_at ON twitter_analytics;
CREATE TRIGGER update_twitter_analytics_updated_at
    BEFORE UPDATE ON twitter_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for data protection
ALTER TABLE twitter_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitter_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE twitter_analytics ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust based on your auth system)
-- For now, allowing all operations - you should customize based on your auth requirements

-- Allow users to see their own searches
CREATE POLICY "Users can view own searches" ON twitter_searches
    FOR SELECT USING (user_id = current_setting('app.current_user_id', true));

-- Allow users to create their own searches
CREATE POLICY "Users can create own searches" ON twitter_searches
    FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Allow users to see results for their searches
CREATE POLICY "Users can view own results" ON twitter_results
    FOR SELECT USING (
        search_id IN (
            SELECT id FROM twitter_searches 
            WHERE user_id = current_setting('app.current_user_id', true)
        )
    );

-- Allow inserting results for own searches
CREATE POLICY "Users can create results for own searches" ON twitter_results
    FOR INSERT WITH CHECK (
        search_id IN (
            SELECT id FROM twitter_searches 
            WHERE user_id = current_setting('app.current_user_id', true)
        )
    );

-- Allow users to see analytics for their searches
CREATE POLICY "Users can view own analytics" ON twitter_analytics
    FOR SELECT USING (
        search_id IN (
            SELECT id FROM twitter_searches 
            WHERE user_id = current_setting('app.current_user_id', true)
        )
    );

-- Allow inserting analytics for own searches
CREATE POLICY "Users can create analytics for own searches" ON twitter_analytics
    FOR INSERT WITH CHECK (
        search_id IN (
            SELECT id FROM twitter_searches 
            WHERE user_id = current_setting('app.current_user_id', true)
        )
    );

-- For development/testing, you might want to temporarily disable RLS
-- ALTER TABLE twitter_searches DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE twitter_results DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE twitter_analytics DISABLE ROW LEVEL SECURITY;

-- Sample data for testing (optional)
-- INSERT INTO twitter_searches (user_id, search_type, query, mentions_enabled) 
-- VALUES ('test_user_123', 'keyword', 'artificial intelligence', false);

COMMENT ON TABLE twitter_searches IS 'Stores Twitter search queries performed by users';
COMMENT ON TABLE twitter_results IS 'Stores individual tweets retrieved from Twitter searches';
COMMENT ON TABLE twitter_analytics IS 'Stores aggregated analytics and insights for Twitter searches';

-- Grant necessary permissions to authenticated users
-- GRANT ALL ON twitter_searches TO authenticated;
-- GRANT ALL ON twitter_results TO authenticated;
-- GRANT ALL ON twitter_analytics TO authenticated;

-- Note: Uncomment the GRANT statements above if using Supabase auth
-- Adjust the RLS policies based on your authentication system