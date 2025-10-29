-- YouTube Filter Enhancement - Database Migration
-- Phase 1: Add 4 filter columns to youtube_analytics_sessions table

-- Add new filter columns with proper constraints
ALTER TABLE youtube_analytics_sessions 
ADD COLUMN upload_date_filter TEXT CHECK (upload_date_filter IN ('hour', 'today', 'week', 'month', 'year')) DEFAULT NULL,
ADD COLUMN sort_by_filter TEXT CHECK (sort_by_filter IN ('relevance', 'rating', 'date', 'views')) DEFAULT 'relevance',
ADD COLUMN geo_filter TEXT DEFAULT 'US',
ADD COLUMN content_type_filter TEXT CHECK (content_type_filter IN ('video', 'shorts', 'channel', 'playlist')) DEFAULT 'video';

-- Add indexes for efficient querying
CREATE INDEX idx_youtube_filters ON youtube_analytics_sessions (upload_date_filter, sort_by_filter, geo_filter, content_type_filter);
CREATE INDEX idx_youtube_content_type ON youtube_analytics_sessions (content_type_filter);
CREATE INDEX idx_youtube_geo ON youtube_analytics_sessions (geo_filter);

-- Add comment for documentation
COMMENT ON COLUMN youtube_analytics_sessions.upload_date_filter IS 'YT-API upload_date filter: hour, today, week, month, year';
COMMENT ON COLUMN youtube_analytics_sessions.sort_by_filter IS 'YT-API sort_by filter: relevance, rating, date, views';
COMMENT ON COLUMN youtube_analytics_sessions.geo_filter IS 'YT-API geo filter: ISO 3166-2 country codes (US, GB, CA, etc.)';
COMMENT ON COLUMN youtube_analytics_sessions.content_type_filter IS 'YT-API type filter: video, shorts, channel, playlist';

-- Verify migration
SELECT 
  column_name, 
  data_type, 
  column_default, 
  is_nullable,
  check_constraints.constraint_name
FROM information_schema.columns 
LEFT JOIN information_schema.check_constraints 
  ON check_constraints.constraint_name LIKE '%' || column_name || '%'
WHERE table_name = 'youtube_analytics_sessions' 
  AND column_name LIKE '%filter%'
ORDER BY ordinal_position;