import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Header from './components/Header'
import SideNav from './components/SideNav'
import SEOModule from './pages/SEOModule'
import YouTubeModule from './pages/YouTubeModule'
import SocialListeningModule from './pages/SocialListeningModule'
import TwitterAnalyticsModule from './pages/TwitterAnalyticsModule'
import RedditModule from './pages/RedditModule'
import NewsModule from './pages/NewsModule'
import AnalyticsModule from './pages/AnalyticsModule'
import GenerativeModule from './pages/GenerativeModule'

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for changes on auth state (logged in, signed out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    )
  }

  return user ? (
    <div className="app">
      <SideNav />
      <div className="app-content">
        <Header user={user} />
        <Routes>
          <Route path="/" element={<Navigate to="/modules/seo" replace />} />
          <Route path="/modules/seo" element={<SEOModule user={user} />} />
          <Route path="/modules/youtube" element={<YouTubeModule user={user} />} />
          <Route path="/modules/social-listening" element={<SocialListeningModule user={user} />} />
          <Route path="/modules/twitter" element={<TwitterAnalyticsModule user={user} />} />
          <Route path="/modules/reddit" element={<RedditModule user={user} />} />
          <Route path="/modules/news" element={<NewsModule user={user} />} />
          <Route path="/modules/analytics" element={<AnalyticsModule user={user} />} />
          <Route path="/modules/generative" element={<GenerativeModule user={user} />} />
        </Routes>
      </div>
    </div>
  ) : (
    <Auth />
  )
}

export default App
