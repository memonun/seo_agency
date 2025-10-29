import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { callDomainAnalyticsApi } from '../utils/apiConfig'
import { sendDomainAnalyticsEmail } from '../utils/emailService'
import DomainAnalyticsResults from './DomainAnalyticsResults'

export default function DomainAnalyticsForm({ user }) {
  const [formData, setFormData] = useState({
    domainPattern: '',
    filterType: 'all',
    limit: '10',
    email: ''
  })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [results, setResults] = useState(null)
  const [showResults, setShowResults] = useState(false)

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setMessage({ text: '', type: '' })
    setShowResults(false)
    setResults(null)


    try {
      // Generate session_id on client side
      const sessionId = uuidv4()

      // Create session record in Supabase
      const { error: sessionError } = await supabase
        .from('domain_analytics_sessions')
        .insert({
          id: sessionId,
          user_id: user.id,
          domain_pattern: formData.domainPattern,
          filter_type: formData.filterType,
          limit_value: parseInt(formData.limit)
        })

      if (sessionError) throw sessionError

      // Call domain analytics API (server handles all complexity)
      const apiResponse = await callDomainAnalyticsApi({
        domainPattern: formData.domainPattern,
        limit: parseInt(formData.limit),
        filterType: formData.filterType,
        user_id: user.id,
        session_id: sessionId
      })

      // Extract results from API response
      const { results: { primary: primaryResults, enhanced: enhancedData }, meta } = apiResponse
      
      // Store primary results for immediate display
      setResults(primaryResults)
      setShowResults(true)

      // Update results with enhanced data
      setResults({ primary: primaryResults, enhanced: enhancedData })

      // Get metrics from API response
      const successfulEndpoints = meta.endpointsSuccessful
      const totalDataPoints = meta.totalDataPoints

      // Update session in Supabase
      await supabase
        .from('domain_analytics_sessions')
        .update({
          results_count: totalDataPoints,
          completed_at: new Date().toISOString(),
          endpoints_called: meta.totalEndpoints,
          endpoints_successful: successfulEndpoints
        })
        .eq('id', sessionId)

      // Send email with both primary and enhanced results
      const recipientEmail = formData.email || user.email
      const emailResult = await sendDomainAnalyticsEmail({
        toEmail: recipientEmail,
        fromName: 'Comprehensive Domain Analytics Report',
        results: { primary: primaryResults, enhanced: enhancedData },
        searchParams: {
          domainPattern: formData.domainPattern,
          filterType: formData.filterType,
          limit: formData.limit
        }
      })

      // Show success message with comprehensive status
      const endpointSummary = `${successfulEndpoints}/${meta.totalEndpoints} endpoints successful`
      if (emailResult.success) {
        setMessage({
          text: `Domain analysis complete! ${endpointSummary}. Report sent to ${recipientEmail}`,
          type: 'success'
        })
      } else {
        setMessage({
          text: `Domain analysis complete! ${endpointSummary}. Warning: ${emailResult.message}`,
          type: 'success'
        })
      }

    } catch (error) {
      console.error('Error:', error)
      setMessage({
        text: error.message || 'Failed to retrieve domain analytics. Please check your credentials and try again.',
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleNewSearch = () => {
    setFormData({
      domainPattern: '',
      filterType: 'all',
      limit: '10',
      email: ''
    })
    setShowResults(false)
    setResults(null)
    setMessage({ text: '', type: '' })
  }

  const handleCloseResults = () => {
    setShowResults(false)
  }

  return (
    <>
      <div className="container">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="domainPattern">Domain Pattern</label>
            <input
              type="text"
              id="domainPattern"
              name="domainPattern"
              value={formData.domainPattern}
              onChange={handleChange}
              placeholder="example.com or %keyword%"
              disabled={showResults}
              required
            />
            <small>Use % as wildcard (e.g., %seo% to find domains containing "seo")</small>
          </div>

          <div className="form-group">
            <label htmlFor="filterType">Filter Type</label>
            <select
              id="filterType"
              name="filterType"
              value={formData.filterType}
              onChange={handleChange}
              disabled={showResults}
              className="form-select"
            >
              <option value="all">All Domains</option>
              <option value="expiring">Expiring Soon (90 days)</option>
              <option value="high_traffic">High Organic Traffic</option>
              <option value="high_backlinks">High Backlinks</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="limit">Limit</label>
            <input
              type="number"
              id="limit"
              name="limit"
              value={formData.limit}
              onChange={handleChange}
              min="1"
              max="1000"
              disabled={showResults}
              required
            />
            <small>Maximum: 1000 results</small>
          </div>

          <div className="form-group">
            <label htmlFor="email">Client Email (optional)</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              disabled={showResults}
              placeholder={user.email}
            />
            <small>Leave empty to use your account email</small>
          </div>

          {!showResults && (
            <button type="submit" disabled={loading}>
              {loading ? 'Analyzing...' : 'Analyze Domains'}
            </button>
          )}
        </form>

        {/* Message display */}
        {message.text && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}

        {/* New search button */}
        {showResults && (
          <div className="action-buttons">
            <button onClick={handleNewSearch} className="primary-btn">
              Start New Analysis
            </button>
          </div>
        )}
      </div>

      {/* Results display */}
      {showResults && results && (
        <div className="results-wrapper">
          <DomainAnalyticsResults 
            results={Array.isArray(results) ? results : results.primary} 
            onClose={handleCloseResults}
            enhancedData={results.enhanced || null}
          />
        </div>
      )}
    </>
  )
}
