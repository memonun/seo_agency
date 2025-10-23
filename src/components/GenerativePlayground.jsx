import { useState } from 'react'
import './GenerativePlayground.css'

export default function GenerativePlayground({ user }) {
  const [selectedTemplate, setSelectedTemplate] = useState('crisis-response')
  const [generationMode, setGenerationMode] = useState('text')

  return (
    <div className="generative-playground">
      <div className="playground-header">
        <h1>🎨 Generative Playground</h1>
        <p>AI-powered content generation based on your data insights</p>
      </div>

      {/* Generation Mode Selector */}
      <div className="mode-selector">
        <button 
          className={generationMode === 'text' ? 'active' : ''}
          onClick={() => setGenerationMode('text')}
        >
          📝 Text Content
        </button>
        <button 
          className={generationMode === 'image' ? 'active' : ''}
          onClick={() => setGenerationMode('image')}
        >
          🎨 Image Generation
        </button>
        <button 
          className={generationMode === 'social' ? 'active' : ''}
          onClick={() => setGenerationMode('social')}
        >
          💬 Social Media
        </button>
        <button 
          className={generationMode === 'email' ? 'active' : ''}
          onClick={() => setGenerationMode('email')}
        >
          📧 Email Templates
        </button>
      </div>

      <div className="playground-content">
        {/* Left Panel - Data Sources & Configuration */}
        <div className="config-panel">
          <h3>📊 Data Sources</h3>
          
          <div className="data-sources">
            <div className="source-card active">
              <div className="source-header">
                <span className="source-icon">📰</span>
                <span className="source-name">News Analysis</span>
                <span className="source-status">✓</span>
              </div>
              <div className="source-info">
                <p>Latest: <strong>3 negative articles detected</strong></p>
                <p>Sentiment: 65% negative in last 24h</p>
              </div>
            </div>

            <div className="source-card active">
              <div className="source-header">
                <span className="source-icon">🐦</span>
                <span className="source-name">Twitter Sentiment</span>
                <span className="source-status">✓</span>
              </div>
              <div className="source-info">
                <p>Trending: <strong>#BrandCrisis</strong></p>
                <p>Mentions: 1,247 (↑ 340%)</p>
              </div>
            </div>

            <div className="source-card">
              <div className="source-header">
                <span className="source-icon">🔍</span>
                <span className="source-name">SEO Data</span>
                <span className="source-status">✓</span>
              </div>
              <div className="source-info">
                <p>Top keywords: "product review", "alternatives"</p>
                <p>SERP Position: #4 (↓2)</p>
              </div>
            </div>

            <div className="source-card">
              <div className="source-header">
                <span className="source-icon">📺</span>
                <span className="source-name">YouTube Insights</span>
                <span className="source-status">✓</span>
              </div>
              <div className="source-info">
                <p>Top video: "Complete Guide" (125K views)</p>
                <p>Comments sentiment: 78% positive</p>
              </div>
            </div>
          </div>

          <h3>🎯 Content Templates</h3>
          <div className="template-selector">
            <select 
              value={selectedTemplate} 
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              <option value="crisis-response">Crisis Response</option>
              <option value="blog-post">Blog Post (SEO Optimized)</option>
              <option value="social-campaign">Social Media Campaign</option>
              <option value="press-release">Press Release</option>
              <option value="email-newsletter">Email Newsletter</option>
              <option value="product-description">Product Description</option>
              <option value="faq">FAQ Section</option>
            </select>
          </div>

          <h3>⚙️ Generation Settings</h3>
          <div className="settings">
            <div className="setting-group">
              <label>Tone</label>
              <select>
                <option>Professional</option>
                <option>Friendly</option>
                <option>Formal</option>
                <option>Casual</option>
                <option>Empathetic</option>
              </select>
            </div>
            
            <div className="setting-group">
              <label>Length</label>
              <select>
                <option>Short (100-200 words)</option>
                <option>Medium (300-500 words)</option>
                <option>Long (800+ words)</option>
              </select>
            </div>

            <div className="setting-group">
              <label>Target Audience</label>
              <select>
                <option>General Public</option>
                <option>Customers</option>
                <option>Investors</option>
                <option>Media</option>
                <option>Employees</option>
              </select>
            </div>
          </div>

          <button className="generate-btn">
            ✨ Generate Content
          </button>
        </div>

        {/* Right Panel - Generated Content & Preview */}
        <div className="generation-panel">
          <div className="generation-header">
            <h3>Generated Content</h3>
            <div className="generation-actions">
              <button className="action-btn">📋 Copy</button>
              <button className="action-btn">💾 Save</button>
              <button className="action-btn">🔄 Regenerate</button>
              <button className="action-btn">📤 Export</button>
            </div>
          </div>

          <div className="generated-content">
            {generationMode === 'text' && (
              <div className="text-content">
                <h2>Official Response to Recent Media Coverage</h2>
                
                <p className="lead">
                  We are aware of the recent discussions surrounding our latest product update and want to address 
                  the concerns raised by our community.
                </p>

                <h3>Our Commitment</h3>
                <p>
                  Based on the feedback analyzed from over 1,247 social media mentions and comprehensive sentiment 
                  analysis showing 65% negative sentiment, we understand the importance of immediate action. Our team 
                  has been working around the clock to address these concerns.
                </p>

                <h3>Immediate Actions</h3>
                <ul>
                  <li>Rolling back the controversial changes within the next 24 hours</li>
                  <li>Implementing a new feedback system based on YouTube comments analysis</li>
                  <li>Launching a transparent communication channel for real-time updates</li>
                </ul>

                <h3>Looking Forward</h3>
                <p>
                  Our SEO analysis shows that customers are searching for "alternatives" and "reviews" - we hear you. 
                  We're committed to not just meeting but exceeding your expectations. The insights from our comprehensive 
                  data analysis across news outlets, social media, and search trends have shaped our new approach.
                </p>

                <p className="signature">
                  <em>Thank you for your patience and continued support.</em>
                </p>
              </div>
            )}

            {generationMode === 'image' && (
              <div className="image-generation">
                <div className="prompt-card">
                  <h4>Generated Image Prompt</h4>
                  <p className="prompt">
                    "Professional crisis management meeting, diverse team collaborating around modern conference table, 
                    data dashboards on screens showing positive trend arrows, bright natural lighting, corporate setting, 
                    photorealistic style, conveying trust and transparency, blue and white color scheme"
                  </p>
                  <button className="generate-image-btn">🎨 Generate Image with DALL-E</button>
                </div>
                
                <div className="image-preview">
                  <div className="placeholder-image">
                    <span>🖼️</span>
                    <p>Image will appear here</p>
                  </div>
                </div>
              </div>
            )}

            {generationMode === 'social' && (
              <div className="social-posts">
                <div className="post-card twitter">
                  <div className="post-header">
                    <span className="platform">Twitter/X</span>
                    <span className="chars">247/280</span>
                  </div>
                  <p className="post-content">
                    📢 We hear you. After analyzing your feedback across all channels, we're taking immediate action:
                    
                    ✅ Rolling back recent changes
                    🔄 New feedback system launching
                    💬 24/7 support activated
                    
                    Your voice matters. Thread below 👇
                    
                    #CustomerFirst #Transparency
                  </p>
                </div>

                <div className="post-card linkedin">
                  <div className="post-header">
                    <span className="platform">LinkedIn</span>
                    <span className="chars">892/3000</span>
                  </div>
                  <p className="post-content">
                    <strong>Turning Feedback into Action: Our Response to Recent Concerns</strong><br/><br/>
                    
                    Over the past week, we've been closely monitoring sentiment across all channels - from the 1,247 
                    Twitter mentions to comprehensive news coverage analysis. The message is clear, and we're responding 
                    with decisive action.<br/><br/>
                    
                    Key insights from our data analysis:<br/>
                    • 65% negative sentiment requires immediate attention<br/>
                    • Top search queries show customers seeking alternatives<br/>
                    • YouTube community provided 300+ constructive suggestions<br/><br/>
                    
                    Our response plan includes immediate rollback of controversial features and the launch of a new 
                    transparent communication framework. Full details in our blog post [link]
                  </p>
                </div>

                <div className="post-card instagram">
                  <div className="post-header">
                    <span className="platform">Instagram</span>
                    <span className="chars">145/2200</span>
                  </div>
                  <p className="post-content">
                    We're listening and taking action 💙<br/><br/>
                    
                    Your feedback shapes our future. Swipe to see the changes we're making based on your input →<br/><br/>
                    
                    #CommunityFirst #Transparency #Update
                  </p>
                </div>
              </div>
            )}

            {generationMode === 'email' && (
              <div className="email-template">
                <div className="email-preview">
                  <div className="email-header">
                    <p><strong>Subject:</strong> Important Update: We're Making Changes Based on Your Feedback</p>
                    <p><strong>From:</strong> CEO Name &lt;ceo@company.com&gt;</p>
                    <p><strong>To:</strong> Valued Customers</p>
                  </div>
                  
                  <div className="email-body">
                    <h2>Dear Valued Customer,</h2>
                    
                    <p>
                      I wanted to personally reach out regarding the recent feedback we've received about our latest 
                      product update. Your voice matters, and we've been listening carefully.
                    </p>
                    
                    <div className="email-section">
                      <h3>What We've Learned</h3>
                      <p>
                        Through comprehensive analysis of customer feedback across multiple channels - including over 
                        1,200 social media mentions, news coverage, and direct customer communications - we've gained 
                        valuable insights into your concerns.
                      </p>
                    </div>
                    
                    <div className="email-section">
                      <h3>Our Immediate Response</h3>
                      <ul>
                        <li>Rolling back the recent changes within 24 hours</li>
                        <li>Implementing a new customer advisory board</li>
                        <li>Launching monthly transparency reports</li>
                        <li>Enhancing our customer support with 24/7 availability</li>
                      </ul>
                    </div>
                    
                    <div className="email-section">
                      <h3>Moving Forward Together</h3>
                      <p>
                        We're committed to rebuilding your trust through actions, not just words. Expect to see 
                        significant improvements in the coming weeks, all guided by your valuable feedback.
                      </p>
                    </div>
                    
                    <p className="email-signature">
                      Thank you for your patience and continued support.<br/><br/>
                      
                      Sincerely,<br/>
                      [CEO Name]<br/>
                      Chief Executive Officer
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Suggestions Panel */}
          <div className="suggestions-panel">
            <h4>💡 AI Suggestions Based on Current Data</h4>
            <div className="suggestions-list">
              <div className="suggestion">
                <span className="suggestion-icon">🚨</span>
                <p><strong>High Priority:</strong> Address the negative sentiment spike immediately with a public statement</p>
              </div>
              <div className="suggestion">
                <span className="suggestion-icon">📝</span>
                <p><strong>Blog Topic:</strong> "How We're Listening: Our Response to Your Feedback" - optimized for "company response" keywords</p>
              </div>
              <div className="suggestion">
                <span className="suggestion-icon">📺</span>
                <p><strong>Video Content:</strong> CEO message video addressing top 5 concerns from YouTube comments</p>
              </div>
              <div className="suggestion">
                <span className="suggestion-icon">🎯</span>
                <p><strong>SEO Opportunity:</strong> Create content targeting "alternatives" searches with comparison guides</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}