import { supabase } from '../lib/supabase'
import '../styles/modern-buttons.css'

export default function Header({ user }) {
  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  return (
    <header className="app-header">
      <div className="header-content">
        <h1>SEO Keyword Research</h1>
        <div className="user-info">
          <span className="user-email">{user.email}</span>
          <button onClick={handleLogout} className="btn-modern-base btn-danger-modern btn-sm">
            🚪 Logout
          </button>
        </div>
      </div>
    </header>
  )
}
