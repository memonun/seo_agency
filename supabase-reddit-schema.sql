-- Reddit Analytics Module Database Schema
-- Execute this in your Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Reddit analytics sessions table
-- Stores each Reddit search/analysis session performed by users
CREATE TABLE IF NOT EXISTS reddit_analytics_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- Storing as TEXT for flexibility with different auth systems
  search_id TEXT NOT NULL, -- Client-generated unique identifier for this search session
  search_query TEXT, -- For keyword searches
  search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('subreddit', 'search', 'user')),
  subreddit TEXT, -- For subreddit analysis
  username TEXT, -- For user analysis
  search_description TEXT, -- Human-readable description of the search
  sort_order VARCHAR(20) DEFAULT 'hot' CHECK (sort_order IN ('hot', 'new', 'top', 'rising', 'relevance')),
  time_range VARCHAR(20), -- For 'top' sort: hour, day, week, month, year, all
  max_items INTEGER DEFAULT 25,
  include_comments BOOLEAN DEFAULT false,
  include_community_info BOOLEAN DEFAULT true,
  raw_response JSONB, -- Complete API response for debugging/analysis
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Analytics columns for quick access
  total_posts INTEGER DEFAULT 0,
  total_comments INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  avg_score INTEGER DEFAULT 0,
  avg_comments_per_post INTEGER DEFAULT 0,
  top_post_score INTEGER DEFAULT 0,
  viral_potential INTEGER DEFAULT 0, -- 0-100 score
  avg_sentiment_score DECIMAL(4,3) DEFAULT 0, -- -1.000 to 1.000
  positive_posts INTEGER DEFAULT 0,
  negative_posts INTEGER DEFAULT 0,
  neutral_posts INTEGER DEFAULT 0,
  peak_hour INTEGER, -- Hour of day when most posts were created
  date_range_start TIMESTAMP WITH TIME ZONE,
  date_range_end TIMESTAMP WITH TIME ZONE,
  top_authors JSONB DEFAULT '[]', -- Array of top authors with post counts
  top_subreddits JSONB DEFAULT '[]', -- Array of top subreddits (for multi-subreddit searches)
  
  -- Ensure unique search sessions per user
  UNIQUE(user_id, search_id)
);

-- Reddit posts table
-- Stores individual Reddit posts from search/analysis results
CREATE TABLE IF NOT EXISTS reddit_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES reddit_analytics_sessions(id) ON DELETE CASCADE,
  post_id VARCHAR(100) NOT NULL, -- Reddit post ID
  title TEXT NOT NULL,
  content TEXT, -- selftext content
  author VARCHAR(100),
  subreddit VARCHAR(100) NOT NULL,
  score INTEGER DEFAULT 0,
  upvote_ratio DECIMAL(4,3) DEFAULT 0, -- 0.000 to 1.000
  num_comments INTEGER DEFAULT 0,
  created_utc TIMESTAMP WITH TIME ZONE,
  url TEXT,
  permalink TEXT,
  is_video BOOLEAN DEFAULT false,
  is_original_content BOOLEAN DEFAULT false,
  over_18 BOOLEAN DEFAULT false,
  spoiler BOOLEAN DEFAULT false,
  locked BOOLEAN DEFAULT false,
  gilded INTEGER DEFAULT 0,
  total_awards_received INTEGER DEFAULT 0,
  sentiment_label VARCHAR(20), -- positive, negative, neutral
  sentiment_score DECIMAL(4,3), -- -1.000 to 1.000
  post_hint VARCHAR(50), -- image, video, link, etc.
  domain TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique posts per session (prevent duplicates)
  UNIQUE(session_id, post_id)
);

-- Reddit comments table (optional, for detailed comment analysis)
CREATE TABLE IF NOT EXISTS reddit_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES reddit_analytics_sessions(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES reddit_posts(id) ON DELETE CASCADE,
  comment_id VARCHAR(100) NOT NULL, -- Reddit comment ID
  parent_id VARCHAR(100), -- Parent comment ID (for threading)
  content TEXT NOT NULL,
  author VARCHAR(100),
  score INTEGER DEFAULT 0,
  created_utc TIMESTAMP WITH TIME ZONE,
  permalink TEXT,
  is_submitter BOOLEAN DEFAULT false, -- Comment by original post author
  sentiment_label VARCHAR(20), -- positive, negative, neutral
  sentiment_score DECIMAL(4,3), -- -1.000 to 1.000
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure unique comments per session
  UNIQUE(session_id, comment_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_reddit_sessions_user_id ON reddit_analytics_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_reddit_sessions_created_at ON reddit_analytics_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reddit_sessions_search_type ON reddit_analytics_sessions(search_type);
CREATE INDEX IF NOT EXISTS idx_reddit_sessions_completed ON reddit_analytics_sessions(completed);
CREATE INDEX IF NOT EXISTS idx_reddit_sessions_subreddit ON reddit_analytics_sessions(subreddit);
CREATE INDEX IF NOT EXISTS idx_reddit_sessions_username ON reddit_analytics_sessions(username);

CREATE INDEX IF NOT EXISTS idx_reddit_posts_session_id ON reddit_posts(session_id);
CREATE INDEX IF NOT EXISTS idx_reddit_posts_post_id ON reddit_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_reddit_posts_subreddit ON reddit_posts(subreddit);
CREATE INDEX IF NOT EXISTS idx_reddit_posts_author ON reddit_posts(author);
CREATE INDEX IF NOT EXISTS idx_reddit_posts_score ON reddit_posts(score DESC);
CREATE INDEX IF NOT EXISTS idx_reddit_posts_sentiment ON reddit_posts(sentiment_score);
CREATE INDEX IF NOT EXISTS idx_reddit_posts_created_utc ON reddit_posts(created_utc DESC);

CREATE INDEX IF NOT EXISTS idx_reddit_comments_session_id ON reddit_comments(session_id);
CREATE INDEX IF NOT EXISTS idx_reddit_comments_post_id ON reddit_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_reddit_comments_comment_id ON reddit_comments(comment_id);
CREATE INDEX IF NOT EXISTS idx_reddit_comments_author ON reddit_comments(author);
CREATE INDEX IF NOT EXISTS idx_reddit_comments_score ON reddit_comments(score DESC);
CREATE INDEX IF NOT EXISTS idx_reddit_comments_sentiment ON reddit_comments(sentiment_score);

-- Create updated_at trigger function (reuse existing one if available)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for auto-updating updated_at columns
DROP TRIGGER IF EXISTS update_reddit_sessions_updated_at ON reddit_analytics_sessions;
CREATE TRIGGER update_reddit_sessions_updated_at
    BEFORE UPDATE ON reddit_analytics_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) for data protection
ALTER TABLE reddit_analytics_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reddit_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reddit_comments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Allow users to see their own sessions
CREATE POLICY "Users can view own reddit sessions" ON reddit_analytics_sessions
    FOR SELECT USING (user_id = current_setting('app.current_user_id', true));

-- Allow users to create their own sessions
CREATE POLICY "Users can create own reddit sessions" ON reddit_analytics_sessions
    FOR INSERT WITH CHECK (user_id = current_setting('app.current_user_id', true));

-- Allow users to update their own sessions
CREATE POLICY "Users can update own reddit sessions" ON reddit_analytics_sessions
    FOR UPDATE USING (user_id = current_setting('app.current_user_id', true));

-- Allow users to see posts for their sessions
CREATE POLICY "Users can view own reddit posts" ON reddit_posts
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM reddit_analytics_sessions 
            WHERE user_id = current_setting('app.current_user_id', true)
        )
    );

-- Allow inserting posts for own sessions
CREATE POLICY "Users can create reddit posts for own sessions" ON reddit_posts
    FOR INSERT WITH CHECK (
        session_id IN (
            SELECT id FROM reddit_analytics_sessions 
            WHERE user_id = current_setting('app.current_user_id', true)
        )
    );

-- Allow users to see comments for their sessions
CREATE POLICY "Users can view own reddit comments" ON reddit_comments
    FOR SELECT USING (
        session_id IN (
            SELECT id FROM reddit_analytics_sessions 
            WHERE user_id = current_setting('app.current_user_id', true)
        )
    );

-- Allow inserting comments for own sessions
CREATE POLICY "Users can create reddit comments for own sessions" ON reddit_comments
    FOR INSERT WITH CHECK (
        session_id IN (
            SELECT id FROM reddit_analytics_sessions 
            WHERE user_id = current_setting('app.current_user_id', true)
        )
    );

-- For development/testing, you might want to temporarily disable RLS
-- ALTER TABLE reddit_analytics_sessions DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE reddit_posts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE reddit_comments DISABLE ROW LEVEL SECURITY;

-- Create view for easy session analytics lookup
CREATE OR REPLACE VIEW reddit_session_summary AS
SELECT 
    s.id,
    s.user_id,
    s.search_id,
    s.search_description,
    s.search_type,
    s.subreddit,
    s.username,
    s.sort_order,
    s.max_items,
    s.total_posts,
    s.total_comments,
    s.avg_score,
    s.viral_potential,
    s.avg_sentiment_score,
    s.completed,
    s.created_at,
    COUNT(p.id) as actual_posts_count,
    AVG(p.score) as actual_avg_score,
    MAX(p.score) as actual_max_score,
    SUM(p.num_comments) as actual_total_comments
FROM reddit_analytics_sessions s
LEFT JOIN reddit_posts p ON s.id = p.session_id
GROUP BY s.id, s.user_id, s.search_id, s.search_description, s.search_type, 
         s.subreddit, s.username, s.sort_order, s.max_items, s.total_posts,
         s.total_comments, s.avg_score, s.viral_potential, s.avg_sentiment_score,
         s.completed, s.created_at;

-- Sample data for testing (optional)
-- INSERT INTO reddit_analytics_sessions (user_id, search_id, search_type, subreddit, search_description, completed) 
-- VALUES ('test_user_123', 'reddit_search_1', 'subreddit', 'technology', 'r/technology analysis', true);

-- Comments on tables
COMMENT ON TABLE reddit_analytics_sessions IS 'Stores Reddit search/analysis sessions with aggregated metrics';
COMMENT ON TABLE reddit_posts IS 'Stores individual Reddit posts retrieved from searches and analysis';
COMMENT ON TABLE reddit_comments IS 'Stores Reddit comments for detailed analysis (optional)';
COMMENT ON VIEW reddit_session_summary IS 'Provides combined session and post metrics for easy querying';

-- Grant necessary permissions to authenticated users (uncomment if using Supabase auth)
-- GRANT ALL ON reddit_analytics_sessions TO authenticated;
-- GRANT ALL ON reddit_posts TO authenticated;
-- GRANT ALL ON reddit_comments TO authenticated;
-- GRANT SELECT ON reddit_session_summary TO authenticated;

-- Note: Adjust the RLS policies based on your authentication system
-- The current policies assume you're setting 'app.current_user_id' in your application