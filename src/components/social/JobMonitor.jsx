import { useEffect, useState } from 'react';
import { getJobStatus } from '../../utils/socialListeningApi';
import './SocialListening.css';

export default function JobMonitor({ jobId, onComplete }) {
  const [job, setJob] = useState(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    if (!jobId || !polling) return;

    let intervalId;

    const poll = async () => {
      try {
        const response = await getJobStatus(jobId);
        setJob(response.job);

        // Stop polling if job is complete
        if (response.job.status === 'completed' || response.job.status === 'failed' || response.job.status === 'cancelled') {
          setPolling(false);
          if (onComplete) {
            onComplete(response.job);
          }
        }
      } catch (error) {
        console.error('Error polling job status:', error);
      }
    };

    // Initial poll
    poll();

    // Poll every 2 seconds
    intervalId = setInterval(poll, 2000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [jobId, polling, onComplete]);

  if (!job) {
    return (
      <div className="job-monitor">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  const getProgress = () => {
    if (job.progress && job.progress.total > 0) {
      return (job.progress.current / job.progress.total) * 100;
    }
    return 0;
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'queued':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
          </svg>
        );
      case 'running':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      case 'completed':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      case 'failed':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/>
          </svg>
        );
      default:
        return null;
    }
  };

  const progress = getProgress();

  return (
    <div className={`job-card ${job.status}`}>
      <div className="job-header">
        <div>
          <strong>Job {job.id.slice(0, 8)}</strong>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
            {job.platforms?.join(', ') || 'Unknown platforms'}
          </div>
        </div>
        <span className={`job-status ${job.status}`}>
          {getStatusIcon(job.status)}
          {job.status}
        </span>
      </div>

      {job.status === 'running' && job.progress && (
        <>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="progress-text">
            {job.progress.message || `${job.progress.current}/${job.progress.total} items`}
          </div>
        </>
      )}

      {job.status === 'completed' && job.results && (
        <div style={{ marginTop: '12px', fontSize: '13px' }}>
          <div style={{ color: '#666' }}>
            <strong>Results:</strong>
          </div>
          <div style={{ marginTop: '4px' }}>
            {Object.entries(job.results.platforms || {}).map(([platform, data]) => (
              <div key={platform} style={{ marginTop: '4px' }}>
                <strong style={{ textTransform: 'capitalize' }}>{platform}:</strong>{' '}
                {data.mentions_saved} mentions scraped
                {data.errors && data.errors.length > 0 && (
                  <span style={{ color: '#d32f2f' }}> ({data.errors.length} errors)</span>
                )}
              </div>
            ))}
          </div>
          <div style={{ marginTop: '8px', color: '#666' }}>
            Total: {job.items_scraped || 0} items
          </div>
        </div>
      )}

      {job.status === 'failed' && (
        <div style={{ marginTop: '12px', color: '#d32f2f', fontSize: '13px' }}>
          <strong>Error:</strong> {job.error_message || 'Job failed'}
        </div>
      )}

      <div style={{ marginTop: '12px', fontSize: '12px', color: '#999' }}>
        Started: {new Date(job.queued_at).toLocaleString()}
      </div>
    </div>
  );
}
