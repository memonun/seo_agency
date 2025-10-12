export default function NewsModule({ user }) {
  return (
    <div className="module-page">
      <div className="module-header">
        <h1>News Module</h1>
        <p className="module-description">Aggregate and analyze news content and trends</p>
      </div>

      <div className="container">
        <div className="coming-soon">
          <div className="coming-soon-icon">📰</div>
          <h2>Coming Soon</h2>
          <p>News aggregation and content analysis features are currently in development.</p>
          <div className="feature-list">
            <h3>Planned Features:</h3>
            <ul>
              <li>Industry news aggregation</li>
              <li>Trending topics detection</li>
              <li>Content summarization</li>
              <li>News sentiment analysis</li>
              <li>Custom news alerts</li>
              <li>Competitive intelligence</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
