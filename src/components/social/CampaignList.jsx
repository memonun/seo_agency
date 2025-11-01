import { useState } from 'react';
import './SocialListening.css';

export default function CampaignList({
  campaigns = [],
  loading = false,
  onSelect,
  onEdit,
  onDelete,
  onStartScrape,
  selectedCampaignId = null
}) {
  const [confirmDelete, setConfirmDelete] = useState(null);

  if (loading) {
    return (
      <div className="campaign-list loading">
        <div className="loading-spinner"></div>
        <p>Loading campaigns...</p>
      </div>
    );
  }

  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="campaign-list empty">
        <p>No campaigns yet. Create your first campaign to start monitoring!</p>
      </div>
    );
  }

  const handleDelete = (campaignId) => {
    if (confirmDelete === campaignId) {
      onDelete(campaignId);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(campaignId);
    }
  };

  return (
    <div className="campaign-list">
      {campaigns.map(campaign => (
        <div
          key={campaign.id}
          className={`campaign-card ${selectedCampaignId === campaign.id ? 'selected' : ''} ${!campaign.is_active ? 'inactive' : ''}`}
          onClick={() => onSelect(campaign)}
        >
          <div className="campaign-header">
            <h3>{campaign.name}</h3>
            <div className="campaign-badges">
              {campaign.platforms?.instagram && (
                <span className="badge instagram">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153.509.5.902 1.105 1.153 1.772.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 0 1-1.153 1.772c-.5.509-1.105.902-1.772 1.153-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 0 1-1.772-1.153 4.904 4.904 0 0 1-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 0 1 1.153-1.772A4.897 4.897 0 0 1 5.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6.5-.25a1.25 1.25 0 0 0-2.5 0 1.25 1.25 0 0 0 2.5 0zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
                  </svg>
                  Instagram
                </span>
              )}
              {campaign.platforms?.tiktok && (
                <span className="badge tiktok">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                  </svg>
                  TikTok
                </span>
              )}
              {!campaign.is_active && (
                <span className="badge inactive-badge">Inactive</span>
              )}
            </div>
          </div>

          {campaign.description && (
            <p className="campaign-description">{campaign.description}</p>
          )}

          <div className="campaign-meta">
            <div className="meta-row">
              <span className="meta-label">Keywords:</span>
              <span className="meta-value">
                {campaign.keywords?.length > 0
                  ? campaign.keywords.slice(0, 3).join(', ') + (campaign.keywords.length > 3 ? '...' : '')
                  : 'None'
                }
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Hashtags:</span>
              <span className="meta-value">
                {campaign.hashtags?.length > 0
                  ? campaign.hashtags.slice(0, 3).map(h => `#${h}`).join(', ') + (campaign.hashtags.length > 3 ? '...' : '')
                  : 'None'
                }
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Created:</span>
              <span className="meta-value">
                {new Date(campaign.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="campaign-actions" onClick={e => e.stopPropagation()}>
            <button
              className="btn-primary btn-small"
              onClick={() => onStartScrape(campaign)}
              disabled={!campaign.is_active}
              title={!campaign.is_active ? 'Campaign is inactive' : 'Start scraping'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              Scrape Now
            </button>
            <button
              className="btn-secondary btn-small"
              onClick={() => onEdit(campaign)}
            >
              Edit
            </button>
            <button
              className={`btn-danger btn-small ${confirmDelete === campaign.id ? 'confirm' : ''}`}
              onClick={() => handleDelete(campaign.id)}
            >
              {confirmDelete === campaign.id ? 'Confirm?' : 'Delete'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
