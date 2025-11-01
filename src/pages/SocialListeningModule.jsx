import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import CampaignList from '../components/social/CampaignList';
import CampaignForm from '../components/social/CampaignForm';
import JobMonitor from '../components/social/JobMonitor';
import MentionFeed from '../components/social/MentionFeed';
import ScraperTestModal from '../components/social/ScraperTestModal';
import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  scrapeAndProcess
} from '../utils/socialListeningApi';

export default function SocialListeningModule({ user }) {
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCampaignForm, setShowCampaignForm] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [mentionRefreshTrigger, setMentionRefreshTrigger] = useState(0);
  const [showScraperTest, setShowScraperTest] = useState(false);

  // Load campaigns on mount
  useEffect(() => {
    if (user) {
      loadCampaigns();
    }
  }, [user]);

  const loadCampaigns = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await listCampaigns(user.id, true);
      setCampaigns(response.campaigns || []);

      // Auto-select first campaign if none selected
      if (!selectedCampaign && response.campaigns && response.campaigns.length > 0) {
        setSelectedCampaign(response.campaigns[0]);
      }
    } catch (err) {
      console.error('Error loading campaigns:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = () => {
    setEditingCampaign(null);
    setShowCampaignForm(true);
  };

  const handleEditCampaign = (campaign) => {
    setEditingCampaign(campaign);
    setShowCampaignForm(true);
  };

  const handleCampaignSubmit = async (formData) => {
    setLoading(true);
    setError(null);

    try {
      if (editingCampaign) {
        // Update existing campaign
        await updateCampaign(editingCampaign.id, formData);
      } else {
        // Create new campaign
        await createCampaign(formData);
      }

      setShowCampaignForm(false);
      setEditingCampaign(null);
      await loadCampaigns();
    } catch (err) {
      console.error('Error saving campaign:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (campaignId) => {
    if (!confirm('Are you sure you want to delete this campaign?')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await deleteCampaign(campaignId);

      // Clear selection if deleted campaign was selected
      if (selectedCampaign && selectedCampaign.id === campaignId) {
        setSelectedCampaign(null);
      }

      await loadCampaigns();
    } catch (err) {
      console.error('Error deleting campaign:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartScrape = async (campaign) => {
    setLoading(true);
    setError(null);

    try {
      // Get platforms to scrape
      const platforms = [];
      if (campaign.platforms.instagram) platforms.push('instagram');
      if (campaign.platforms.tiktok) platforms.push('tiktok');

      // Start scrape and trigger processing
      const job = await scrapeAndProcess(campaign.id, user.id, platforms);

      // Set active job for monitoring
      setActiveJob(job);

      console.log('Scrape job started:', job);
    } catch (err) {
      console.error('Error starting scrape:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJobComplete = (job) => {
    console.log('Job completed:', job);

    // Refresh mentions feed
    setMentionRefreshTrigger(prev => prev + 1);

    // Clear active job after a delay
    setTimeout(() => {
      setActiveJob(null);
    }, 5000);
  };

  return (
    <div className="module-page">
      {/* Header */}
      <div className="module-header" style={{
        borderBottom: '2px solid #0066cc',
        paddingBottom: '15px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start'
      }}>
        <div>
          <h1 style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '0 0 10px 0'
          }}>
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="#0066cc"
              aria-label="Social Listening Logo"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
              <circle cx="18" cy="6" r="2" fill="#0066cc"/>
            </svg>
            Social Listening Module
          </h1>
          <p className="module-description" style={{ margin: 0 }}>
            Monitor Instagram and TikTok for brand mentions, sentiment analysis, and trend detection
          </p>
        </div>
        <button
          onClick={() => setShowScraperTest(true)}
          className="btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>
          </svg>
          Test Scraper
        </button>
      </div>

      <div className="container">
        {/* Error Display */}
        {error && (
          <div className="message error" style={{
            background: '#f8d7da',
            border: '1px solid #f5c2c7',
            color: '#842029',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {/* Campaign Form Modal */}
        {showCampaignForm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}>
            <CampaignForm
              user={user}
              campaign={editingCampaign}
              onSubmit={handleCampaignSubmit}
              onCancel={() => {
                setShowCampaignForm(false);
                setEditingCampaign(null);
              }}
              loading={loading}
            />
          </div>
        )}

        {/* Main Content */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', marginBottom: '24px' }}>
          {/* Left Column: Campaigns */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Campaigns</h2>
              <button
                className="btn-primary"
                onClick={handleCreateCampaign}
                disabled={loading}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
                New Campaign
              </button>
            </div>

            <CampaignList
              campaigns={campaigns}
              loading={loading}
              onSelect={setSelectedCampaign}
              onEdit={handleEditCampaign}
              onDelete={handleDeleteCampaign}
              onStartScrape={handleStartScrape}
              selectedCampaignId={selectedCampaign?.id}
            />
          </div>

          {/* Right Column: Job Monitor */}
          <div>
            {activeJob && (
              <div>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>Active Job</h2>
                <JobMonitor
                  jobId={activeJob.id}
                  onComplete={handleJobComplete}
                />
              </div>
            )}

            {!activeJob && selectedCampaign && (
              <div style={{
                background: 'white',
                border: '2px solid #e0e0e0',
                borderRadius: '8px',
                padding: '20px',
                textAlign: 'center'
              }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="#ccc" style={{ marginBottom: '12px' }}>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <h3 style={{ margin: '0 0 8px 0', color: '#666' }}>No Active Jobs</h3>
                <p style={{ margin: '0 0 16px 0', color: '#999' }}>
                  Start a scrape job to monitor social media
                </p>
                <button
                  className="btn-primary"
                  onClick={() => handleStartScrape(selectedCampaign)}
                  disabled={loading}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  Start Scraping
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mention Feed */}
        {selectedCampaign && (
          <div>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '20px' }}>
              Mentions for {selectedCampaign.name}
            </h2>
            <MentionFeed
              campaignId={selectedCampaign.id}
              refreshTrigger={mentionRefreshTrigger}
            />
          </div>
        )}

        {!selectedCampaign && campaigns.length === 0 && !loading && (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="#ccc">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <h3>Welcome to Social Listening!</h3>
            <p>Create your first campaign to start monitoring Instagram and TikTok</p>
            <button
              className="btn-primary"
              onClick={handleCreateCampaign}
              style={{ marginTop: '16px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              Create First Campaign
            </button>
          </div>
        )}

        {/* Scraper Test Modal */}
        {showScraperTest && (
          <ScraperTestModal onClose={() => setShowScraperTest(false)} />
        )}
      </div>
    </div>
  );
}
