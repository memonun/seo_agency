import { useState, useEffect } from 'react';
import { getMentions } from '../../utils/socialListeningApi';
import MentionCard from './MentionCard';
import './SocialListening.css';

export default function MentionFeed({ campaignId, refreshTrigger = 0 }) {
  const [mentions, setMentions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    platform: 'all',
    sentiment: 'all',
    relevance: 'all',
    sortBy: 'published_at',
    order: 'desc'
  });

  useEffect(() => {
    if (!campaignId) return;

    const loadMentions = async () => {
      setLoading(true);
      setError(null);

      try {
        const filterParams = {};

        if (filters.platform !== 'all') {
          filterParams.platform = filters.platform;
        }

        if (filters.relevance === 'relevant') {
          filterParams.is_relevant = 'true';
        } else if (filters.relevance === 'not-relevant') {
          filterParams.is_relevant = 'false';
        }

        filterParams.sort_by = filters.sortBy;
        filterParams.order = filters.order;

        const response = await getMentions(campaignId, filterParams);
        setMentions(response.mentions || []);
      } catch (err) {
        console.error('Error loading mentions:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadMentions();
  }, [campaignId, filters, refreshTrigger]);

  const filteredMentions = mentions.filter(mention => {
    // Filter by sentiment if AI analysis is complete
    if (filters.sentiment !== 'all' && mention.sentiment_label) {
      if (filters.sentiment !== mention.sentiment_label.toLowerCase()) {
        return false;
      }
    }

    return true;
  });

  if (loading) {
    return (
      <div className="mention-feed">
        <div className="loading-spinner"></div>
        <p style={{ textAlign: 'center', color: '#666' }}>Loading mentions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="#666">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <h3>Error Loading Mentions</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (filteredMentions.length === 0) {
    return (
      <div className="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="#666">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
        <h3>No Mentions Found</h3>
        <p>
          {mentions.length === 0
            ? 'No mentions have been scraped yet. Start a scrape job to collect data.'
            : 'No mentions match your current filters. Try adjusting the filters.'
          }
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div className="mention-filters" style={{
        background: 'white',
        padding: '16px',
        borderRadius: '8px',
        marginBottom: '20px',
        border: '1px solid #e0e0e0'
      }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600' }}>
              Platform
            </label>
            <select
              value={filters.platform}
              onChange={e => setFilters({ ...filters, platform: e.target.value })}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value="all">All Platforms</option>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600' }}>
              Sentiment
            </label>
            <select
              value={filters.sentiment}
              onChange={e => setFilters({ ...filters, sentiment: e.target.value })}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value="all">All Sentiment</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600' }}>
              Relevance
            </label>
            <select
              value={filters.relevance}
              onChange={e => setFilters({ ...filters, relevance: e.target.value })}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value="all">All</option>
              <option value="relevant">Relevant Only</option>
              <option value="not-relevant">Not Relevant</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '600' }}>
              Sort By
            </label>
            <select
              value={filters.sortBy}
              onChange={e => setFilters({ ...filters, sortBy: e.target.value })}
              style={{
                padding: '8px 12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            >
              <option value="published_at">Date Published</option>
              <option value="likes">Likes</option>
              <option value="comments">Comments</option>
              <option value="views">Views</option>
              <option value="sentiment_score">Sentiment</option>
            </select>
          </div>

          <div style={{ marginTop: '18px' }}>
            <div className="badge" style={{
              background: '#e3f2fd',
              color: '#1976d2',
              padding: '8px 12px',
              fontSize: '14px',
              fontWeight: '600'
            }}>
              {filteredMentions.length} {filteredMentions.length === 1 ? 'mention' : 'mentions'}
            </div>
          </div>
        </div>
      </div>

      {/* Mention Feed */}
      <div className="mention-feed">
        {filteredMentions.map(mention => (
          <MentionCard key={mention.id} mention={mention} />
        ))}
      </div>
    </div>
  );
}
