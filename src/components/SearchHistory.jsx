import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { generateSearchExcel } from '../utils/exportToExcel'

export default function SearchHistory({ user, refreshTrigger }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(null) // Track which search is being exported

  useEffect(() => {
    fetchHistory()
  }, [user.id, refreshTrigger])

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('search_sessions')
        .select('id, main_keyword, location, language, created_at, completed')
        .eq('user_id', user.id)
        .eq('completed', true)
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      setHistory(data || [])
    } catch (error) {
      console.error('Error fetching search history:', error)
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

  const handleExport = async (searchId, mainKeyword) => {
    setExporting(searchId)
    try {
      await generateSearchExcel(searchId, mainKeyword)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Failed to export data. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  if (loading) {
    return (
      <div className="search-history">
        <h2>Search History</h2>
        <div className="history-empty">Loading...</div>
      </div>
    )
  }

  return (
    <div className="search-history">
      <h2>Search History</h2>
      {history.length === 0 ? (
        <div className="history-empty">No search history yet</div>
      ) : (
        <>
          <div className="history-header">
            <span>Keyword</span>
            <span>Location</span>
            <span>Language</span>
            <span>Date</span>
            <span>Export</span>
          </div>
          {history.map((session) => (
            <div key={session.id} className="history-row">
              <span>{session.main_keyword}</span>
              <span>{session.location}</span>
              <span>{session.language}</span>
              <span>{formatDate(session.created_at)}</span>
              <span>
                <button
                  className="export-btn"
                  onClick={() => handleExport(session.id, session.main_keyword)}
                  disabled={exporting === session.id}
                >
                  {exporting === session.id ? 'Generating...' : <>↓ Excel <span className="file-icon">📄</span></>}
                </button>
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
