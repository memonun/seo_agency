import { useState } from 'react'
import SearchForm from './SearchForm'
import DomainAnalyticsForm from './DomainAnalyticsForm'

export default function FormContainer({ user }) {
  const [activeTab, setActiveTab] = useState('keyword-research')

  return (
    <div className="form-container-wrapper">
      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === 'keyword-research' ? 'active' : ''}`}
          onClick={() => setActiveTab('keyword-research')}
        >
          Keyword Research
        </button>
        <button
          className={`tab-btn ${activeTab === 'domain-analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('domain-analytics')}
        >
          Domain Analytics
        </button>
      </div>

      {/* Form Content */}
      <div className="tab-content">
        {activeTab === 'keyword-research' ? (
          <SearchForm user={user} />
        ) : (
          <DomainAnalyticsForm user={user} />
        )}
      </div>
    </div>
  )
}
