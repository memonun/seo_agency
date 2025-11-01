import { useState, useEffect } from 'react';
import './SocialListening.css';

export default function CampaignForm({ user, campaign = null, onSubmit, onCancel, loading = false }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    keywords: [],
    hashtags: [],
    brand_mentions: [],
    competitors: [],
    platforms: {
      instagram: true,
      tiktok: true
    },
    instagram_config: {
      profile_url: '',
      track_stories: true,
      track_reels: true
    },
    tiktok_config: {
      monitor_profiles: []
    }
  });

  const [keywordInput, setKeywordInput] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [brandInput, setBrandInput] = useState('');
  const [competitorInput, setCompetitorInput] = useState('');
  const [tiktokProfileInput, setTiktokProfileInput] = useState('');

  // Load campaign data if editing
  useEffect(() => {
    if (campaign) {
      setFormData({
        name: campaign.name || '',
        description: campaign.description || '',
        keywords: campaign.keywords || [],
        hashtags: campaign.hashtags || [],
        brand_mentions: campaign.brand_mentions || [],
        competitors: campaign.competitors || [],
        platforms: campaign.platforms || { instagram: true, tiktok: true },
        instagram_config: campaign.instagram_config || {
          profile_url: '',
          track_stories: true,
          track_reels: true
        },
        tiktok_config: campaign.tiktok_config || {
          monitor_profiles: []
        }
      });
    }
  }, [campaign]);

  const handleSubmit = (e) => {
    e.preventDefault();

    const dataToSubmit = {
      ...formData,
      user_id: user.id
    };

    if (campaign) {
      dataToSubmit.campaign_id = campaign.id;
    }

    onSubmit(dataToSubmit);
  };

  const addToArray = (field, value, setValue) => {
    if (!value.trim()) return;

    const cleanValue = field === 'hashtags' ? value.replace(/^#/, '').trim() : value.trim();

    if (!formData[field].includes(cleanValue)) {
      setFormData(prev => ({
        ...prev,
        [field]: [...prev[field], cleanValue]
      }));
    }
    setValue('');
  };

  const removeFromArray = (field, index) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  };

  const addTikTokProfile = () => {
    if (!tiktokProfileInput.trim()) return;

    const profile = tiktokProfileInput.trim();
    if (!formData.tiktok_config.monitor_profiles.includes(profile)) {
      setFormData(prev => ({
        ...prev,
        tiktok_config: {
          ...prev.tiktok_config,
          monitor_profiles: [...prev.tiktok_config.monitor_profiles, profile]
        }
      }));
    }
    setTiktokProfileInput('');
  };

  const removeTikTokProfile = (index) => {
    setFormData(prev => ({
      ...prev,
      tiktok_config: {
        ...prev.tiktok_config,
        monitor_profiles: prev.tiktok_config.monitor_profiles.filter((_, i) => i !== index)
      }
    }));
  };

  return (
    <form className="campaign-form" onSubmit={handleSubmit}>
      <div className="form-header">
        <h2>{campaign ? 'Edit Campaign' : 'Create New Campaign'}</h2>
        <button type="button" className="btn-close" onClick={onCancel}>×</button>
      </div>

      <div className="form-body">
        {/* Basic Info */}
        <div className="form-section">
          <h3>Basic Information</h3>

          <div className="form-group">
            <label>Campaign Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="E.g., Brand Monitoring Q1 2025"
              required
            />
          </div>

          <div className="form-group">
            <label>Description</label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="What is this campaign monitoring?"
              rows={3}
            />
          </div>
        </div>

        {/* Platforms */}
        <div className="form-section">
          <h3>Platforms to Monitor</h3>
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.platforms.instagram}
                onChange={e => setFormData({
                  ...formData,
                  platforms: { ...formData.platforms, instagram: e.target.checked }
                })}
              />
              <span>Instagram</span>
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.platforms.tiktok}
                onChange={e => setFormData({
                  ...formData,
                  platforms: { ...formData.platforms, tiktok: e.target.checked }
                })}
              />
              <span>TikTok</span>
            </label>
          </div>
        </div>

        {/* Search Terms */}
        <div className="form-section">
          <h3>What to Monitor</h3>

          <div className="form-group">
            <label>Keywords</label>
            <div className="tag-input-wrapper">
              <input
                type="text"
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addToArray('keywords', keywordInput, setKeywordInput))}
                placeholder="Enter keyword and press Enter"
              />
              <button type="button" onClick={() => addToArray('keywords', keywordInput, setKeywordInput)}>
                Add
              </button>
            </div>
            <div className="tags">
              {formData.keywords.map((keyword, i) => (
                <span key={i} className="tag">
                  {keyword}
                  <button type="button" onClick={() => removeFromArray('keywords', i)}>×</button>
                </span>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Hashtags</label>
            <div className="tag-input-wrapper">
              <input
                type="text"
                value={hashtagInput}
                onChange={e => setHashtagInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addToArray('hashtags', hashtagInput, setHashtagInput))}
                placeholder="Enter hashtag (with or without #)"
              />
              <button type="button" onClick={() => addToArray('hashtags', hashtagInput, setHashtagInput)}>
                Add
              </button>
            </div>
            <div className="tags">
              {formData.hashtags.map((tag, i) => (
                <span key={i} className="tag">
                  #{tag}
                  <button type="button" onClick={() => removeFromArray('hashtags', i)}>×</button>
                </span>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Brand Mentions</label>
            <div className="tag-input-wrapper">
              <input
                type="text"
                value={brandInput}
                onChange={e => setBrandInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addToArray('brand_mentions', brandInput, setBrandInput))}
                placeholder="Brand names to track"
              />
              <button type="button" onClick={() => addToArray('brand_mentions', brandInput, setBrandInput)}>
                Add
              </button>
            </div>
            <div className="tags">
              {formData.brand_mentions.map((brand, i) => (
                <span key={i} className="tag">
                  {brand}
                  <button type="button" onClick={() => removeFromArray('brand_mentions', i)}>×</button>
                </span>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Competitors</label>
            <div className="tag-input-wrapper">
              <input
                type="text"
                value={competitorInput}
                onChange={e => setCompetitorInput(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addToArray('competitors', competitorInput, setCompetitorInput))}
                placeholder="Competitor names"
              />
              <button type="button" onClick={() => addToArray('competitors', competitorInput, setCompetitorInput)}>
                Add
              </button>
            </div>
            <div className="tags">
              {formData.competitors.map((comp, i) => (
                <span key={i} className="tag">
                  {comp}
                  <button type="button" onClick={() => removeFromArray('competitors', i)}>×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Instagram Config */}
        {formData.platforms.instagram && (
          <div className="form-section">
            <h3>Instagram Configuration</h3>

            <div className="form-group">
              <label>Brand Profile URL (Optional)</label>
              <input
                type="url"
                value={formData.instagram_config.profile_url}
                onChange={e => setFormData({
                  ...formData,
                  instagram_config: { ...formData.instagram_config, profile_url: e.target.value }
                })}
                placeholder="https://www.instagram.com/yourbrand/"
              />
              <small className="form-help">Monitor your brand's own Instagram profile</small>
            </div>

            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.instagram_config.track_stories}
                  onChange={e => setFormData({
                    ...formData,
                    instagram_config: { ...formData.instagram_config, track_stories: e.target.checked }
                  })}
                />
                <span>Track Stories</span>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.instagram_config.track_reels}
                  onChange={e => setFormData({
                    ...formData,
                    instagram_config: { ...formData.instagram_config, track_reels: e.target.checked }
                  })}
                />
                <span>Track Reels</span>
              </label>
            </div>
          </div>
        )}

        {/* TikTok Config */}
        {formData.platforms.tiktok && (
          <div className="form-section">
            <h3>TikTok Configuration</h3>

            <div className="form-group">
              <label>Monitor Profiles (Optional)</label>
              <div className="tag-input-wrapper">
                <input
                  type="text"
                  value={tiktokProfileInput}
                  onChange={e => setTiktokProfileInput(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && (e.preventDefault(), addTikTokProfile())}
                  placeholder="@username or profile URL"
                />
                <button type="button" onClick={addTikTokProfile}>
                  Add
                </button>
              </div>
              <div className="tags">
                {formData.tiktok_config.monitor_profiles.map((profile, i) => (
                  <span key={i} className="tag">
                    {profile}
                    <button type="button" onClick={() => removeTikTokProfile(i)}>×</button>
                  </span>
                ))}
              </div>
              <small className="form-help">Track specific TikTok accounts</small>
            </div>
          </div>
        )}
      </div>

      <div className="form-footer">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Saving...' : (campaign ? 'Update Campaign' : 'Create Campaign')}
        </button>
      </div>
    </form>
  );
}
