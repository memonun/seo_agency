import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function TwitterSearchHistory({ user, refreshTrigger, onLoadHistory }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchHistory()
  }, [user.id, refreshTrigger])

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('twitter_analytics_sessions')
        .select('id, keyword, hashtags, account_username, action, search_description, sort_order, include_mentions, global_search, language, created_at')
        .eq('user_id', user.id)
        .eq('completed', true)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      setHistory(data || [])
    } catch (error) {
      console.error('Error fetching Twitter search history:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    })
  }

  const getSearchType = (session) => {
    const parts = []
    if (session.hashtags && session.hashtags.length > 0) {
      parts.push('Hashtags')
    }
    if (session.keyword) {
      parts.push('Keyword')
    }
    return parts.join(' + ') || 'Search'
  }

  const handleReSearch = (session) => {
    const searchData = {
      keyword: session.keyword || '',
      hashtags: session.hashtags || [],
      accountUsername: session.account_username || '',  // Include account username
      action: session.action || 'combined-search',  // Use action from database
      language: session.language || '',
      sortOrder: session.sort_order || 'recent',
      includeMentions: session.include_mentions || false,
      global: session.global_search || false,
      limit: 25,
      hashtagMode: 'manual'
    }
    
    if (onLoadHistory) {
      onLoadHistory(searchData)
    }
  }

  if (loading) {
    return (
      <div className="search-history">
        <h2>🐦 Search History</h2>
        <div className="history-empty">Loading...</div>
      </div>
    )
  }

  return (
    <div className="search-history">
      <h2>🐦 Search History</h2>
      {history.length === 0 ? (
        <div className="history-empty">No search history yet</div>
      ) : (
        <>
          <div className="history-header">
            <span>Keyword</span>
            <span>Search Type</span>
            <span>Date</span>
            <span>Re-search</span>
          </div>
          {history.map((session) => (
            <div key={session.id} className="history-row">
              <span>{session.keyword || session.search_description || 'Unknown'}</span>
              <span>{getSearchType(session)}</span>
              <span>{formatDate(session.created_at)}</span>
              <span>
                <button
                  className="export-btn"
                  onClick={() => handleReSearch(session)}
                  title="Re-run this search"
                >
                  Re-search <span className="file-icon">🔄</span>
                </button>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}