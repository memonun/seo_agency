import { useState } from 'react'
import NewsDashboard from './NewsDashboard'
import './NewsModule.css'

export default function NewsModule({ user }) {
  return (
    <div className="news-module">
      <div className="module-header">
        <h1>📰 News & Sentiment Analysis</h1>
        <p>Analyze news articles from SERP results or custom URLs with AI-powered sentiment analysis</p>
      </div>
      
      <NewsDashboard user={user} />
    </div>
  )
}