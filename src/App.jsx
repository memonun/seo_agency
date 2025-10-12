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
import NewsModule from './pages/NewsModule'

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

  return (
    <div className="app">
      {user ? (
        <>
          <SideNav />
          <div className="app-content">
            <Header user={user} />
            <Routes>
              <Route path="/" element={<Navigate to="/modules/seo" replace />} />
              <Route path="/modules/seo" element={<SEOModule user={user} />} />
              <Route path="/modules/youtube" element={<YouTubeModule user={user} />} />
              <Route path="/modules/social-listening" element={<SocialListeningModule user={user} />} />
              <Route path="/modules/twitter" element={<TwitterAnalyticsModule user={user} />} />
              <Route path="/modules/news" element={<NewsModule user={user} />} />
            </Routes>
          </div>
        </>
      ) : (
        <Auth />
      )}
    </div>
  )
}

export default App
