import './SocialListening.css';

export default function MentionCard({ mention }) {
  const getSentimentBadge = () => {
    if (!mention.sentiment_label) {
      return <span className="sentiment-badge neutral">Analyzing...</span>;
    }

    const label = mention.sentiment_label.toLowerCase();
    const score = mention.sentiment_score;

    const emoji = {
      'positive': '😊',
      'neutral': '😐',
      'negative': '😢'
    }[label] || '📊';

    return (
      <span className={`sentiment-badge ${label}`}>
        {emoji} {label.charAt(0).toUpperCase() + label.slice(1)}
        {score && ` (${(score * 100).toFixed(0)}%)`}
      </span>
    );
  };

  const getRelevanceBadge = () => {
    if (mention.is_relevant === null || mention.is_relevant === undefined) {
      return <span className="relevance-badge">Analyzing...</span>;
    }

    if (mention.is_relevant) {
      return (
        <span className="relevance-badge">
          ✓ Relevant
          {mention.relevance_confidence && ` (${(mention.relevance_confidence * 100).toFixed(0)}%)`}
        </span>
      );
    }

    return (
      <span className="relevance-badge not-relevant">
        ✗ Not Relevant
      </span>
    );
  };

  const formatNumber = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getPlatformIcon = () => {
    if (mention.platform === 'instagram') {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153.509.5.902 1.105 1.153 1.772.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 0 1-1.153 1.772c-.5.509-1.105.902-1.772 1.153-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 0 1-1.772-1.153 4.904 4.904 0 0 1-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 0 1 1.153-1.772A4.897 4.897 0 0 1 5.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6.5-.25a1.25 1.25 0 0 0-2.5 0 1.25 1.25 0 0 0 2.5 0zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
        </svg>
      );
    } else if (mention.platform === 'tiktok') {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
        </svg>
      );
    }
    return null;
  };

  return (
    <div className="mention-card">
      <div className="mention-header">
        <div className="mention-author">
          {getPlatformIcon()}
          <div>
            <strong>@{mention.author_username}</strong>
            <div style={{ fontSize: '12px', color: '#666' }}>
              <span className={`mention-platform ${mention.platform}`}>
                {mention.platform}
              </span>
              {mention.post_timestamp && (
                <span style={{ marginLeft: '8px' }}>
                  {new Date(mention.post_timestamp).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        {mention.post_url && (
          <a
            href={mention.post_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 12px',
              background: '#0066cc',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            View Post
          </a>
        )}
      </div>

      <div className="mention-content">
        <p className="mention-caption">{mention.caption || 'No caption'}</p>
      </div>

      <div className="mention-stats">
        {mention.likes > 0 && (
          <div className="mention-stat">
            ❤️ {formatNumber(mention.likes)}
          </div>
        )}
        {mention.comments > 0 && (
          <div className="mention-stat">
            💬 {formatNumber(mention.comments)}
          </div>
        )}
        {mention.shares > 0 && (
          <div className="mention-stat">
            🔄 {formatNumber(mention.shares)}
          </div>
        )}
        {mention.views > 0 && (
          <div className="mention-stat">
            👁️ {formatNumber(mention.views)}
          </div>
        )}
      </div>

      {/* AI Insights */}
      <div className="mention-ai-insights">
        {getSentimentBadge()}
        {getRelevanceBadge()}

        {mention.emotions && Object.keys(mention.emotions).length > 0 && (
          <div style={{
            fontSize: '13px',
            color: '#666',
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
          }}>
            <span>Emotions:</span>
            {Object.entries(mention.emotions).slice(0, 3).map(([emotion, score]) => (
              <span key={emotion} style={{
                padding: '4px 8px',
                background: '#f5f5f5',
                borderRadius: '12px',
                fontSize: '12px'
              }}>
                {emotion}: {(score * 100).toFixed(0)}%
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Platform-specific data */}
      {mention.platform === 'instagram' && mention.instagram_data && (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          background: '#fafafa',
          borderRadius: '6px',
          fontSize: '13px',
          color: '#666'
        }}>
          <div style={{ marginBottom: '6px' }}>
            <strong>Instagram:</strong> {mention.instagram_data.post_type}
            {mention.instagram_data.is_sponsored && ' • Sponsored'}
          </div>
          {mention.instagram_data.hashtags && mention.instagram_data.hashtags.length > 0 && (
            <div>
              Hashtags: {mention.instagram_data.hashtags.slice(0, 5).join(' ')}
            </div>
          )}
        </div>
      )}

      {mention.platform === 'tiktok' && mention.tiktok_data && (
        <div style={{
          marginTop: '12px',
          padding: '12px',
          background: '#fafafa',
          borderRadius: '6px',
          fontSize: '13px',
          color: '#666'
        }}>
          <div style={{ marginBottom: '6px' }}>
            <strong>TikTok:</strong>
            {mention.tiktok_data.music && ` 🎵 ${mention.tiktok_data.music.title}`}
            {mention.tiktok_data.is_duet && ' • Duet'}
            {mention.tiktok_data.is_stitch && ' • Stitch'}
          </div>
          {mention.tiktok_data.author && (
            <div>
              Author: {mention.tiktok_data.author.followers ? `${formatNumber(mention.tiktok_data.author.followers)} followers` : 'Unknown followers'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
