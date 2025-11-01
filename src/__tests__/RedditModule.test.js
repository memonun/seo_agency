// Reddit Module Unit Tests
// Tests for Reddit components and utility functions

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Import components
import RedditModule from '../pages/RedditModule';
import RedditSearch from '../components/RedditSearch';
import RedditResults from '../components/RedditResults';
import RedditDashboard from '../components/RedditDashboard';

// Import constants for testing
import { 
  POSITIVE_WORDS, 
  NEGATIVE_WORDS, 
  DEFAULT_MAX_ITEMS,
  SEARCH_TYPES,
  SORT_ORDERS,
  ERROR_MESSAGES 
} from '../constants/reddit';

// Mock the API config
jest.mock('../utils/apiConfig', () => ({
  callRedditApi: jest.fn(),
  isDev: jest.fn(() => false),
  getRedditApiUrl: jest.fn(() => '/api/reddit-analytics')
}));

// Mock Supabase
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => ({
            limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => Promise.resolve({ data: [{ id: 'test-id' }], error: null }))
      }))
    }))
  }
}));

// Mock search cache utilities
jest.mock('../utils/searchCache', () => ({
  loadRedditSearchParams: jest.fn(() => null),
  saveRedditSearchParams: jest.fn(),
  clearRedditSearchParams: jest.fn(),
  saveRedditResults: jest.fn(),
  loadRedditResults: jest.fn(() => null),
  clearRedditResults: jest.fn(),
  SEARCH_STATES: {
    SEARCHING: 'searching',
    COMPLETED: 'completed',
    ERROR: 'error',
    CANCELLED: 'cancelled'
  },
  saveRedditSearchProgress: jest.fn(),
  loadRedditSearchProgress: jest.fn(() => null),
  updateRedditSearchProgress: jest.fn(),
  clearRedditSearchProgress: jest.fn(),
  hasOngoingRedditSearch: jest.fn(() => false),
  getRedditSearchStatus: jest.fn(() => null)
}));

// Mock data for testing
const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com'
};

const mockRedditPosts = [
  {
    id: 'post1',
    title: 'Test Reddit Post 1',
    selftext: 'This is a test post content',
    author: 'testuser1',
    subreddit: 'testsubreddit',
    score: 150,
    num_comments: 25,
    created_utc: Math.floor(Date.now() / 1000),
    upvote_ratio: 0.95,
    url: 'https://reddit.com/r/test/comments/test1',
    permalink: '/r/test/comments/test1',
    sentiment: { label: 'positive', score: 0.7, confidence: 0.8 }
  },
  {
    id: 'post2',
    title: 'Test Reddit Post 2',
    selftext: 'This is another test post',
    author: 'testuser2',
    subreddit: 'testsubreddit',
    score: 75,
    num_comments: 12,
    created_utc: Math.floor(Date.now() / 1000) - 3600,
    upvote_ratio: 0.88,
    url: 'https://reddit.com/r/test/comments/test2',
    permalink: '/r/test/comments/test2',
    sentiment: { label: 'neutral', score: 0.1, confidence: 0.6 }
  }
];

const mockAnalytics = {
  totalPosts: 2,
  totalComments: 37,
  totalScore: 225,
  avgScore: 112,
  avgCommentsPerPost: 18,
  topPostScore: 150,
  viralPotential: 65,
  avgSentiment: 0.4,
  sentimentBreakdown: {
    positive: 1,
    negative: 0,
    neutral: 1
  },
  topAuthors: [
    { username: 'testuser1', posts: 1 },
    { username: 'testuser2', posts: 1 }
  ],
  topSubreddits: [
    { name: 'testsubreddit', posts: 2 }
  ],
  peakHour: 14
};

const mockRedditResponse = {
  success: true,
  data: mockRedditPosts,
  analytics: mockAnalytics,
  searchQuery: 'testsubreddit',
  searchType: 'subreddit',
  total: 2,
  timestamp: new Date().toISOString()
};

describe('Reddit Constants', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_MAX_ITEMS).toBe(25);
    expect(SEARCH_TYPES.SUBREDDIT).toBe('subreddit');
    expect(SEARCH_TYPES.SEARCH).toBe('search');
    expect(SEARCH_TYPES.USER).toBe('user');
  });

  it('should have sentiment words arrays', () => {
    expect(POSITIVE_WORDS).toContain('good');
    expect(POSITIVE_WORDS).toContain('excellent');
    expect(NEGATIVE_WORDS).toContain('bad');
    expect(NEGATIVE_WORDS).toContain('terrible');
  });

  it('should have error messages defined', () => {
    expect(ERROR_MESSAGES.MISSING_SUBREDDIT).toBeDefined();
    expect(ERROR_MESSAGES.MISSING_QUERY).toBeDefined();
    expect(ERROR_MESSAGES.MISSING_USERNAME).toBeDefined();
  });
});

describe('RedditSearch Component', () => {
  const mockOnSearch = jest.fn();
  const mockOnNewSearch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders search form correctly', () => {
    render(
      <RedditSearch 
        onSearch={mockOnSearch}
        loading={false}
        showNewSearchButton={false}
      />
    );

    expect(screen.getByText('Search Type')).toBeInTheDocument();
    expect(screen.getByText('📋 Subreddit Analysis')).toBeInTheDocument();
    expect(screen.getByText('🔍 Keyword Search')).toBeInTheDocument();
    expect(screen.getByText('👤 User Analysis')).toBeInTheDocument();
  });

  it('validates required fields based on search type', async () => {
    // Mock alert
    window.alert = jest.fn();

    render(
      <RedditSearch 
        onSearch={mockOnSearch}
        loading={false}
      />
    );

    // Try to submit without filling required field
    const submitButton = screen.getByRole('button', { name: /analyze subreddit/i });
    fireEvent.click(submitButton);

    expect(window.alert).toHaveBeenCalledWith('Please enter a subreddit name');
    expect(mockOnSearch).not.toHaveBeenCalled();
  });

  it('calls onSearch with correct data when form is submitted', async () => {
    render(
      <RedditSearch 
        onSearch={mockOnSearch}
        loading={false}
      />
    );

    // Fill in subreddit name
    const subredditInput = screen.getByPlaceholderText(/enter subreddit name/i);
    fireEvent.change(subredditInput, { target: { value: 'technology' } });

    // Submit form
    const submitButton = screen.getByRole('button', { name: /analyze subreddit/i });
    fireEvent.click(submitButton);

    expect(mockOnSearch).toHaveBeenCalledWith({
      searchType: 'subreddit',
      subreddit: 'technology',
      query: '',
      username: '',
      sortOrder: 'hot',
      timeRange: null,
      maxItems: 25,
      includeComments: false,
      includeCommunityInfo: true
    });
  });

  it('shows New Search button when showNewSearchButton is true', () => {
    render(
      <RedditSearch 
        onSearch={mockOnSearch}
        loading={false}
        showNewSearchButton={true}
        onNewSearch={mockOnNewSearch}
      />
    );

    const newSearchButton = screen.getByText('🔍 New Reddit Search');
    expect(newSearchButton).toBeInTheDocument();

    fireEvent.click(newSearchButton);
    expect(mockOnNewSearch).toHaveBeenCalled();
  });

  it('disables form when loading', () => {
    render(
      <RedditSearch 
        onSearch={mockOnSearch}
        loading={true}
      />
    );

    const submitButton = screen.getByRole('button', { name: /analyzing reddit/i });
    expect(submitButton).toBeDisabled();

    const clearButton = screen.getByRole('button', { name: /clear/i });
    expect(clearButton).toBeDisabled();
  });
});

describe('RedditResults Component', () => {
  const mockOnClear = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders results correctly', () => {
    render(
      <RedditResults 
        data={mockRedditPosts}
        analytics={mockAnalytics}
        onClear={mockOnClear}
        searchQuery="testsubreddit"
        searchType="subreddit"
      />
    );

    expect(screen.getByText('Reddit Results: r/testsubreddit')).toBeInTheDocument();
    expect(screen.getByText('Test Reddit Post 1')).toBeInTheDocument();
    expect(screen.getByText('Test Reddit Post 2')).toBeInTheDocument();
  });

  it('shows no results message when data is empty', () => {
    render(
      <RedditResults 
        data={[]}
        analytics={{}}
        onClear={mockOnClear}
        searchQuery="empty"
        searchType="subreddit"
      />
    );

    expect(screen.getByText('No Results Found')).toBeInTheDocument();
    expect(screen.getByText('No Reddit posts were found for your search criteria.')).toBeInTheDocument();
  });

  it('calls onClear when clear button is clicked', () => {
    render(
      <RedditResults 
        data={mockRedditPosts}
        analytics={mockAnalytics}
        onClear={mockOnClear}
        searchQuery="testsubreddit"
        searchType="subreddit"
      />
    );

    const clearButton = screen.getByText('🗑️ Clear Results');
    fireEvent.click(clearButton);

    expect(mockOnClear).toHaveBeenCalled();
  });

  it('filters posts correctly', () => {
    render(
      <RedditResults 
        data={mockRedditPosts}
        analytics={mockAnalytics}
        onClear={mockOnClear}
        searchQuery="testsubreddit"
        searchType="subreddit"
      />
    );

    // Test high score filter
    const filterSelect = screen.getByDisplayValue('All Posts');
    fireEvent.change(filterSelect, { target: { value: 'high-score' } });

    // Should only show posts with score > 100 (post1 has 150)
    expect(screen.getByText('Test Reddit Post 1')).toBeInTheDocument();
    // Post2 with 75 score should be filtered out
  });
});

describe('RedditDashboard Component', () => {
  it('renders analytics dashboard correctly', () => {
    render(
      <RedditDashboard 
        analytics={mockAnalytics}
        searchQuery="testsubreddit"
        searchType="subreddit"
        mock={false}
      />
    );

    expect(screen.getByText('📊 Reddit Analytics Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Analysis for r/testsubreddit')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Total posts
    expect(screen.getByText('37')).toBeInTheDocument(); // Total comments
  });

  it('shows mock badge when in demo mode', () => {
    render(
      <RedditDashboard 
        analytics={mockAnalytics}
        searchQuery="testsubreddit"
        searchType="subreddit"
        mock={true}
      />
    );

    expect(screen.getByText('Demo Mode')).toBeInTheDocument();
  });

  it('renders tab navigation correctly', () => {
    render(
      <RedditDashboard 
        analytics={mockAnalytics}
        searchQuery="testsubreddit"
        searchType="subreddit"
        mock={false}
      />
    );

    expect(screen.getByText('📈 Overview')).toBeInTheDocument();
    expect(screen.getByText('💬 Engagement')).toBeInTheDocument();
    expect(screen.getByText('😊 Sentiment')).toBeInTheDocument();
    expect(screen.getByText('👥 Community')).toBeInTheDocument();
  });

  it('switches tabs correctly', () => {
    render(
      <RedditDashboard 
        analytics={mockAnalytics}
        searchQuery="testsubreddit"
        searchType="subreddit"
        mock={false}
      />
    );

    // Click on Sentiment tab
    const sentimentTab = screen.getByText('😊 Sentiment');
    fireEvent.click(sentimentTab);

    // Should show sentiment content
    expect(screen.getByText('📊 Sentiment Distribution')).toBeInTheDocument();
  });

  it('handles empty analytics gracefully', () => {
    render(
      <RedditDashboard 
        analytics={{}}
        searchQuery="empty"
        searchType="subreddit"
        mock={false}
      />
    );

    expect(screen.getByText('No analytics data available')).toBeInTheDocument();
  });
});

describe('RedditModule Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders main module structure correctly', () => {
    render(<RedditModule user={mockUser} />);

    expect(screen.getByText('Reddit Analytics')).toBeInTheDocument();
    expect(screen.getByText('Analyze Reddit posts, subreddits, and user activity with detailed insights')).toBeInTheDocument();
    expect(screen.getByText('Search Type')).toBeInTheDocument();
  });

  it('shows search history sidebar when user is logged in', () => {
    render(<RedditModule user={mockUser} />);

    expect(screen.getByText('🔍 Reddit Search History')).toBeInTheDocument();
  });

  it('handles search flow correctly', async () => {
    const { callRedditApi } = require('../utils/apiConfig');
    callRedditApi.mockResolvedValueOnce(mockRedditResponse);

    render(<RedditModule user={mockUser} />);

    // Fill in search form
    const subredditInput = screen.getByPlaceholderText(/enter subreddit name/i);
    fireEvent.change(subredditInput, { target: { value: 'technology' } });

    // Submit search
    const submitButton = screen.getByRole('button', { name: /analyze subreddit/i });
    fireEvent.click(submitButton);

    // Should show loading state
    await waitFor(() => {
      expect(screen.getByText('Analyzing Reddit data...')).toBeInTheDocument();
    });

    // Should show results after API call
    await waitFor(() => {
      expect(screen.getByText('Test Reddit Post 1')).toBeInTheDocument();
    });
  });
});

// Utility function tests
describe('Reddit Utility Functions', () => {
  // These would test utility functions from the constants and other utilities
  // For example, sentiment analysis, data formatting, etc.
  
  it('should format numbers correctly', () => {
    // This would test number formatting utilities
    // Implementation depends on your utility functions
  });

  it('should calculate time ago correctly', () => {
    // This would test time formatting utilities
    // Implementation depends on your utility functions
  });
});