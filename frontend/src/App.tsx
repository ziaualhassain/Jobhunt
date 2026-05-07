import { useState } from 'react'
import { Routes, Route, NavLink, Navigate, Link } from 'react-router-dom'
import { Briefcase, Kanban, Cloud, FileSearch2, MessageSquare, TrendingUp, Menu, X, UserCircle2, Sun, Moon } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import { useTheme } from './context/ThemeContext'
import JobsPage from './pages/JobsPage'
import TrackerPage from './pages/TrackerPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProfilePage from './pages/ProfilePage'
import ResumeEnhancerPage from './pages/ResumeEnhancerPage'
import InterviewCoachPage from './pages/InterviewCoachPage'
import PrepTrackerPage from './pages/PrepTrackerPage'
import CallbackPage from './pages/CallbackPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

const NAV_LINKS = [
  { to: '/',                end: true,  icon: Briefcase,     label: 'Job Listings'              },
  { to: '/tracker',         end: false, icon: Kanban,        label: 'Interview Tracker'         },
  { to: '/resume-enhancer', end: false, icon: FileSearch2,   label: 'Resume Creator & Enhancer' },
  { to: '/interview-coach', end: false, icon: MessageSquare, label: 'Interview Coach'           },
  { to: '/prep-tracker',    end: false, icon: TrendingUp,    label: 'Preparation Tracker'       },
]

// CSS variable inversion means a single slate class works in both themes.
// e.g. text-slate-400: dark=#94a3b8, light=#475569 (both readable as muted text)
//      hover:bg-slate-800/70: dark=#1e293b@70%, light=#e2e8f0@70%
function navCls(isActive: boolean) {
  return `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
    isActive
      ? 'bg-brand-500/15 text-brand-400 ring-1 ring-inset ring-brand-500/25'
      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
  }`
}

export default function App() {
  const { user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      {user && (
        <header className="border-b border-slate-800/60 bg-slate-950/95 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center">

            {/* Logo — fixed left */}
            <Link to="/" className="flex items-center gap-2 flex-none group">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20 group-hover:shadow-brand-500/40 transition-shadow">
                <Cloud size={14} strokeWidth={2.5} className="text-white" />
              </div>
              <span className="hidden xs:inline font-bold text-base text-slate-100 tracking-tight transition-colors">
                Job<span className="text-brand-400">Hunters</span>
              </span>
            </Link>

            {/* Desktop nav — centered between logo and profile */}
            <nav className="hidden md:flex flex-1 items-center justify-center gap-1">
              {NAV_LINKS.map(({ to, end, icon: Icon, label }) => (
                <NavLink key={to} to={to} end={end} className={({ isActive }) => navCls(isActive)}>
                  <Icon size={15} strokeWidth={1.75} />
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Profile avatar — fixed right */}
            <div className="flex-none ml-auto md:ml-0 flex items-center gap-1.5">
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `flex items-center gap-2.5 pl-1.5 pr-3 py-1.5 rounded-xl transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-500/15 ring-1 ring-inset ring-brand-500/25'
                      : 'hover:bg-slate-800/70'
                  }`
                }
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-[11px] font-bold text-white uppercase shadow-md shadow-brand-500/25 ring-2 ring-brand-500/20">
                  {user.name[0]}
                </div>
                <span className="hidden sm:inline text-sm font-medium text-slate-300">{user.name}</span>
              </NavLink>

              {/* Theme toggle */}
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
              </button>

              {/* Hamburger — mobile only */}
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                aria-label="Toggle menu"
              >
                {menuOpen ? <X size={17} strokeWidth={2} /> : <Menu size={17} strokeWidth={2} />}
              </button>
            </div>
          </div>

          {/* Mobile dropdown */}
          {menuOpen && (
            <div className="md:hidden border-t border-slate-800/60 bg-slate-950 px-3 py-2 space-y-0.5">
              {NAV_LINKS.map(({ to, end, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full ${
                      isActive ? 'bg-brand-500/15 text-brand-400 ring-1 ring-inset ring-brand-500/25' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                    }`
                  }
                >
                  <Icon size={16} strokeWidth={1.75} />{label}
                </NavLink>
              ))}
              <div className="border-t border-slate-800/50 pt-1.5 mt-1.5">
                <NavLink
                  to="/profile"
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full ${
                      isActive ? 'bg-brand-500/15 text-brand-400 ring-1 ring-inset ring-brand-500/25' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                    }`
                  }
                >
                  <UserCircle2 size={16} strokeWidth={1.75} />Profile &amp; Settings
                </NavLink>
              </div>
            </div>
          )}
        </header>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 sm:py-6">
        <Routes>
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/callback"        element={<CallbackPage />} />
          <Route path="/"                element={<ProtectedRoute><JobsPage /></ProtectedRoute>} />
          <Route path="/tracker"         element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
          <Route path="/profile"         element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/resume-enhancer" element={<ProtectedRoute><ResumeEnhancerPage /></ProtectedRoute>} />
          <Route path="/interview-coach" element={<ProtectedRoute><InterviewCoachPage /></ProtectedRoute>} />
          <Route path="/prep-tracker"    element={<ProtectedRoute><PrepTrackerPage /></ProtectedRoute>} />
          <Route path="*"                element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
