// Reddit Module Constants
// Centralized configuration for Reddit analytics module

// Default Values
export const DEFAULT_MAX_ITEMS = 25;
export const DEFAULT_MOCK_LIMIT = 10;
export const DEFAULT_TIMEOUT = 60000; // 60 seconds in milliseconds

// Sentiment Analysis Configuration
export const POSITIVE_WORDS = [
  'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 
  'love', 'best', 'awesome', 'perfect', 'thanks', 'helpful'
];

export const NEGATIVE_WORDS = [
  'bad', 'terrible', 'awful', 'hate', 'worst', 'horrible', 
  'disappointing', 'sucks', 'stupid', 'annoying', 'broken', 'useless'
];

// Mock Data Configuration
export const MOCK_AUTHORS = ['user1', 'user2', 'user3', 'poweruser', 'expert_redditor'];
export const MOCK_SUBREDDITS = ['technology', 'science', 'AskReddit', 'worldnews', 'funny'];

// Score and Rating Constants
export const MIN_SENTIMENT_SCORE = -1;
export const MAX_SENTIMENT_SCORE = 1;
export const SENTIMENT_CONFIDENCE_DIVISOR = 10;
export const MAX_VIRAL_POTENTIAL = 100;
export const VIRAL_POTENTIAL_DIVISOR = 100;

// Time Constants
export const MILLISECONDS_PER_SECOND = 1000;
export const HOURS_PER_DAY = 24;
export const MINUTES_PER_HOUR = 60;
export const SECONDS_PER_MINUTE = 60;
export const DAYS_IN_WEEK = 7;

// Mock Data Generation Constants
export const MOCK_SCORE_BASE = 10;
export const MOCK_SCORE_RANGE = 10000;
export const MOCK_UPVOTE_RATIO_MIN = 0.6;
export const MOCK_UPVOTE_RATIO_RANGE = 0.4;
export const MOCK_COMMENTS_RANGE = 500;
export const MOCK_COMMENTS_BASE = 5;
export const MOCK_AWARDS_RANGE = 10;

// Search Types
export const SEARCH_TYPES = {
  SUBREDDIT: 'subreddit',
  SEARCH: 'search', 
  USER: 'user'
};

// Sort Orders
export const SORT_ORDERS = {
  HOT: 'hot',
  NEW: 'new',
  TOP: 'top',
  RISING: 'rising',
  RELEVANCE: 'relevance'
};

// Time Ranges for Top Sort
export const TIME_RANGES = {
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
  ALL: 'all'
};

// Sentiment Labels
export const SENTIMENT_LABELS = {
  POSITIVE: 'positive',
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral'
};

// Error Messages
export const ERROR_MESSAGES = {
  AUTHENTICATION_FAILED: 'Authentication failed',
  INVALID_CREDENTIALS: 'Invalid Apify credentials',
  NO_RESULTS_FOUND: 'No results found',
  NO_POSTS_FOUND: 'No Reddit posts found for your search query',
  INTERNAL_SERVER_ERROR: 'Internal server error',
  UNEXPECTED_ERROR: 'An unexpected error occurred',
  MISSING_SUBREDDIT: 'Subreddit name is required',
  MISSING_QUERY: 'Search query is required',
  MISSING_USERNAME: 'Username is required',
  MISSING_SEARCH_TYPE: 'searchType is required (subreddit, search, user)',
  INVALID_SEARCH_TYPE: 'searchType must be: subreddit, search, or user',
  METHOD_NOT_ALLOWED: 'Only POST requests are supported',
  MISSING_ACTION: 'Action must be "search"'
};

// API Configuration
export const API_CONFIG = {
  APIFY_BASE_URL: 'https://api.apify.com/v2',
  APIFY_ACTOR: 'trudax~reddit-scraper-lite',
  DEFAULT_POLLING_INTERVAL: 2000, // 2 seconds
  CONTENT_TYPE: 'application/json'
};

// Cache Configuration
export const CACHE_CONFIG = {
  MAX_TEXT_LENGTH: 300,
  RECENT_THRESHOLD_HOURS: 1,
  VALIDATION_TIMEOUT: 100 // milliseconds
};

// UI Constants
export const UI_CONSTANTS = {
  POSTS_PER_PAGE_OPTIONS: [10, 25, 50, 100],
  MAX_HISTORY_ITEMS: 20,
  LOADING_ANIMATION_DELAY: 100, // milliseconds per item
  TRUNCATE_TEXT_LENGTH: 300
};