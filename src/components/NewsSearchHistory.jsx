import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './NewsSearchHistory.css'

// Export saveSearch function for use in NewsDashboard
export const saveSearch = async (user, searchParams, results) => {
  if (!user) return

  try {
    const { error } = await supabase
      .from('news_searches')
      .insert([
        {
          user_id: user.id,
          mode: searchParams.mode,
          input_data: { 
            input: searchParams.input,
            limit: searchParams.limit 
          },
          context: searchParams.context,
          results: results.data,
          sentiment_distribution: results.data?.sentiment_distribution,
          key_findings: results.data?.key_findings,
          executive_summary: results.data?.executive_summary
        }
      ])

    if (error) throw error
    return true
  } catch (error) {
    console.error('Error saving search history:', error)
    return false
  }
}

export default function NewsSearchHistory({ user, refreshTrigger, onSelectHistory }) {
  const [history, setHistory] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [expandedItems, setExpandedItems] = useState(new Set())

  useEffect(() => {
    if (user) {
      fetchHistory()
    }
  }, [user, refreshTrigger])

  const fetchHistory = async () => {
    if (!user) return

    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('news_searches')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      setHistory(data || [])
    } catch (error) {
      console.error('Error fetching news history:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const deleteHistoryItem = async (id) => {
    try {
      const { error } = await supabase
        .from('news_searches')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      fetchHistory() // Refresh history
    } catch (error) {
      console.error('Error deleting history item:', error)
    }
  }

  const toggleItemExpansion = (id) => {
    const newExpanded = new Set(expandedItems)
    if (newExpanded.has(id)) {
      newExpanded.delete(id)
    } else {
      newExpanded.add(id)
    }
    setExpandedItems(newExpanded)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getSentimentEmoji = (sentiment) => {
    const positive = sentiment?.positive_news || 0
    const negative = sentiment?.negative_news || 0
    const neutral = sentiment?.neutral_news || 0
    
    if (positive > negative && positive > neutral) return '😊'
    if (negative > positive && negative > neutral) return '😟'
    return '😐'
  }

  if (!user) {
    return (
      <div className="news-history">
        <h3>Search History</h3>
        <p className="login-prompt">Login to save and view your search history</p>
      </div>
    )
  }

  return (
    <div className="news-history">
      <div className="history-header">
        <h3>📚 Search History</h3>
        {history.length > 0 && (
          <button onClick={fetchHistory} className="refresh-btn" disabled={isLoading}>
            🔄
          </button>
        )}
      </div>

      {isLoading && <p className="loading">Loading history...</p>}

      {!isLoading && history.length === 0 && (
        <p className="no-history">No search history yet</p>
      )}

      {!isLoading && history.length > 0 && (
        <div className="history-list">
          {history.map(item => (
            <div key={item.id} className="history-item">
              <div className="history-item-header">
                <div className="history-meta">
                  <span className="history-mode">
                    {item.mode === 'serp' ? '🔍' : '🔗'} {item.mode?.toUpperCase()}
                  </span>
                  <span className="history-sentiment">
                    {getSentimentEmoji(item.sentiment_distribution)}
                  </span>
                </div>
                <button 
                  className="expand-btn"
                  onClick={() => toggleItemExpansion(item.id)}
                >
                  {expandedItems.has(item.id) ? '▼' : '▶'}
                </button>
              </div>
              
              <div className="history-input">
                {item.input_data?.input}
              </div>
              
              <div className="history-date">
                {formatDate(item.created_at)}
              </div>

              {expandedItems.has(item.id) && (
                <div className="history-details">
                  {item.context && (
                    <div className="detail-item">
                      <strong>Context:</strong> {item.context}
                    </div>
                  )}
                  
                  {item.sentiment_distribution && (
                    <div className="detail-item">
                      <strong>Sentiment:</strong>
                      <span className="sentiment-summary">
                        +{item.sentiment_distribution.positive_news || 0} 
                        ~{item.sentiment_distribution.neutral_news || 0} 
                        -{item.sentiment_distribution.negative_news || 0}
                      </span>
                    </div>
                  )}
                  
                  <div className="history-actions">
                    <button 
                      className="load-btn"
                      onClick={() => onSelectHistory(item)}
                    >
                      📊 Load Results
                    </button>
                    <button 
                      className="delete-btn"
                      onClick={() => deleteHistoryItem(item.id)}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}