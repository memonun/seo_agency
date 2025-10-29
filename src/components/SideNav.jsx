import { useNavigate, useLocation } from 'react-router-dom'
import './SideNav.css'

// Icon Components
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
)

const SocialIcon = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <g>
      {/* Instagram gradient */}
      <defs>
        <linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="25%" stopColor="#e6683c" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="75%" stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      {/* Instagram icon (left side) */}
      <g transform="translate(-2, 0)">
        <rect x="3" y="3" width="9" height="9" rx="2" stroke="url(#ig-gradient)" strokeWidth="1.5" fill="none"/>
        <circle cx="7.5" cy="7.5" r="2" stroke="url(#ig-gradient)" strokeWidth="1.5" fill="none"/>
        <circle cx="10.5" cy="4.5" r="0.5" fill="url(#ig-gradient)"/>
      </g>
      {/* TikTok icon (right side) */}
      <g transform="translate(3, 0)">
        <path d="M16 8.5a3.5 3.5 0 0 0 3-1.7V5a5 5 0 0 1-3 1V3.5A3.5 3.5 0 0 0 12.5 0H11v9a2 2 0 1 1-2-2v-1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 3.5-3.5V6.5a5 5 0 0 0 3 1z"
              fill="currentColor" transform="scale(0.6) translate(6, 3)"/>
      </g>
    </g>
  </svg>
)

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
)

const RedditIcon = () => (
  <svg viewBox="0 0 24 24" fill="#FF4500">
    <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.526-.73a.326.326 0 0 0-.218-.095z"/>
  </svg>
)

const NewsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
    <path d="M18 14h-8"/>
    <path d="M15 18h-5"/>
    <path d="M10 6h8v4h-8z"/>
  </svg>
)

const DashboardIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
)

const GenerativeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3"/>
  </svg>
)

const inputModules = [
  {
    id: 'seo',
    name: 'SEO',
    path: '/modules/seo',
    icon: SearchIcon
  },
  {
    id: 'youtube',
    name: 'YouTube',
    path: '/modules/youtube',
    icon: YouTubeIcon
  },
  {
    id: 'social',
    name: 'Social Listening',
    path: '/modules/social-listening',
    icon: SocialIcon
  },
  {
    id: 'twitter',
    name: 'Twitter Analytics',
    path: '/modules/twitter',
    icon: XIcon
  },
  {
    id: 'reddit',
    name: 'Reddit Analytics',
    path: '/modules/reddit',
    icon: RedditIcon
  },
  {
    id: 'news',
    name: 'News',
    path: '/modules/news',
    icon: NewsIcon
  }
]

const outputModules = [
  {
    id: 'analytics',
    name: 'Analytics Dashboard',
    path: '/modules/analytics',
    icon: DashboardIcon
  },
  {
    id: 'generative',
    name: 'Generative Playground',
    path: '/modules/generative',
    icon: GenerativeIcon
  }
]

export default function SideNav() {
  const navigate = useNavigate()
  const location = useLocation()

  const handleNavClick = (path) => {
    navigate(path)
  }

  return (
    <>
      {/* Left side container */}
      <div className="sidenav-container">
        {/* The vertical wall */}
        <div className="sidenav-wall"></div>

        {/* Input modules - left side */}
        <div className="sidenav-buttons sidenav-left">
        {inputModules.map((module) => {
          const isActive = location.pathname === module.path
          const IconComponent = module.icon

          return (
            <button
              key={module.id}
              className={`sidenav-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleNavClick(module.path)}
              title={module.name}
            >
              <span className="sidenav-icon">
                <IconComponent />
              </span>
              <span className="sidenav-label">{module.name}</span>
            </button>
          )
        })}
      </div>

      </div>

      {/* Right side wall */}
      <div className="sidenav-wall-right"></div>

      {/* Output modules - right side */}
      <div className="sidenav-buttons sidenav-right">
        {outputModules.map((module) => {
          const isActive = location.pathname === module.path
          const IconComponent = module.icon

          return (
            <button
              key={module.id}
              className={`sidenav-btn ${isActive ? 'active' : ''}`}
              onClick={() => handleNavClick(module.path)}
              title={module.name}
            >
              <span className="sidenav-icon">
                <IconComponent />
              </span>
              <span className="sidenav-label">{module.name}</span>
            </button>
          )
        })}
      </div>
    </>
  )
}
