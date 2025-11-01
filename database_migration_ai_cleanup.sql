-- Database Migration: AI Cleanup - Remove unused columns while preserving critical functionality
-- Execute this in your Supabase SQL Editor
-- 
-- IMPORTANT: This migration removes unused columns from twitter_tweets table
-- Critical columns for account evolution are preserved
--
-- Date: $(date '+%Y-%m-%d')
-- Purpose: Clean up database after AI functionality removal

BEGIN;

-- First, let's check what columns exist in twitter_tweets table
-- You should run this query first to verify the current schema:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'twitter_tweets' 
-- ORDER BY ordinal_position;

-- ===================================================================
-- CRITICAL COLUMNS TO PRESERVE (used by account evolution features):
-- ===================================================================
-- - id (primary key)
-- - account_id (foreign key to twitter_accounts)
-- - is_account_specific (boolean, critical for account evolution)
-- - engagement_rate (used in analytics calculations)
-- - sentiment_label (used by account evolution analytics)
-- - sentiment_score (used by account evolution analytics)  
-- - tweet_id (Twitter's unique tweet identifier)
-- - tweet_text (tweet content)
-- - created_at (timestamp, used for evolution tracking)
-- - likes, retweets, replies, views (engagement metrics)
-- - account_followers_at_time (follower count snapshot)
-- - author_username, author_name (account identification)
-- - author_verified, author_profile_image (account metadata)

-- ===================================================================
-- COLUMNS TO REMOVE (unused or deprecated):
-- ===================================================================

-- Remove session tracking column (not used by account evolution)
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS session_id;

-- Remove URL storage (not used in current analytics)
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS urls;

-- Remove media type tracking (not used in current analytics)  
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS media_type;

-- Remove sentiment confidence (AI-specific, no longer needed)
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS sentiment_confidence;

-- Remove matched keywords (search-specific, not used in account evolution)
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS matched_keywords;

-- Remove quote tweets count (public_metrics covers this)
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS quotes;

-- Remove search type tracking (not needed for account evolution)
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS search_type;

-- Remove tweet URL (can be reconstructed from username + tweet_id)
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS tweet_url;

-- Remove hashtags and mentions arrays if they exist as separate columns
-- (these are often stored in the tweet text or separate junction tables)
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS hashtags;
ALTER TABLE twitter_tweets DROP COLUMN IF EXISTS mentions;

-- ===================================================================
-- PRESERVE THESE CRITICAL COLUMNS (DO NOT REMOVE):
-- ===================================================================
-- The following columns MUST be preserved for account evolution:
-- 
-- Core identification:
-- - id, account_id, tweet_id, is_account_specific
--
-- Content and timing:
-- - tweet_text, created_at
--
-- Engagement metrics (all used in calculations):
-- - likes, retweets, replies, views, engagement_rate
--
-- Account snapshots:
-- - account_followers_at_time, author_username, author_name
-- - author_verified, author_profile_image
--
-- Sentiment (used in analytics even if now neutral):
-- - sentiment_label, sentiment_score

-- ===================================================================
-- VERIFICATION QUERIES:
-- ===================================================================

-- After running this migration, verify the remaining columns:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'twitter_tweets' 
-- ORDER BY ordinal_position;

-- Verify account evolution still works by checking sample data:
-- SELECT tweet_id, account_id, is_account_specific, engagement_rate, 
--        sentiment_label, sentiment_score, likes, retweets, replies
-- FROM twitter_tweets 
-- WHERE is_account_specific = true 
-- LIMIT 5;

COMMIT;

-- ===================================================================
-- ROLLBACK INSTRUCTIONS:
-- ===================================================================
-- If you need to rollback this migration, you would need to:
-- 1. Re-add the dropped columns with appropriate data types
-- 2. Restore data from backups if available
-- 
-- Example rollback for critical columns (if needed):
-- ALTER TABLE twitter_tweets ADD COLUMN session_id UUID;
-- ALTER TABLE twitter_tweets ADD COLUMN urls TEXT[];
-- ALTER TABLE twitter_tweets ADD COLUMN media_type TEXT;
-- ALTER TABLE twitter_tweets ADD COLUMN sentiment_confidence DECIMAL(4,3);
-- ALTER TABLE twitter_tweets ADD COLUMN matched_keywords TEXT[];
-- ALTER TABLE twitter_tweets ADD COLUMN quotes INTEGER DEFAULT 0;
-- ALTER TABLE twitter_tweets ADD COLUMN search_type TEXT;
-- ALTER TABLE twitter_tweets ADD COLUMN tweet_url TEXT;
-- ALTER TABLE twitter_tweets ADD COLUMN hashtags TEXT[];
-- ALTER TABLE twitter_tweets ADD COLUMN mentions TEXT[];

-- ===================================================================
-- NOTES:
-- ===================================================================
-- 1. This migration is conservative - it only removes clearly unused columns
-- 2. All columns used by twitterAccountEvolution.js are preserved
-- 3. Sentiment columns are kept because account evolution uses them for analytics
-- 4. The AI removal makes sentiment analysis return neutral values, but the
--    columns remain functional for future use
-- 5. Test account evolution functionality after running this migration