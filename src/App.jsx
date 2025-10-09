import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import './App.css'
import { supabase } from './lib/supabase'
import Auth from './components/Auth'
import Header from './components/Header'
import FormContainer from './components/FormContainer'
import YouTubeContents from './components/YouTubeContents'

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
          <Header user={user} />
          <Routes>
            <Route path="/" element={<FormContainer user={user} />} />
            <Route path="/youtube-contents" element={<YouTubeContents user={user} />} />
          </Routes>
        </>
      ) : (
        <Auth />
      )}
    </div>
  )
}

export default App
