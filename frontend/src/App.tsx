import { useState } from 'react'
import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Search, Kanban, Cloud, LogOut, FileSearch2, MessageSquare, TrendingUp, Menu, X } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import JobsPage from './pages/JobsPage'
import TrackerPage from './pages/TrackerPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProfilePage from './pages/ProfilePage'
import ResumeEnhancerPage from './pages/ResumeEnhancerPage'
import InterviewCoachPage from './pages/InterviewCoachPage'
import PrepTrackerPage from './pages/PrepTrackerPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

const NAV_LINKS = [
  { to: '/',                end: true,  icon: Search,       label: 'Search Jobs'     },
  { to: '/tracker',         end: false, icon: Kanban,        label: 'Tracker'         },
  { to: '/resume-enhancer', end: false, icon: FileSearch2,   label: 'Resume Enhancer' },
  { to: '/interview-coach', end: false, icon: MessageSquare, label: 'Interview Coach' },
  { to: '/prep-tracker',    end: false, icon: TrendingUp,    label: 'Prep Tracker'    },
]

export default function App() {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      {user && (
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2 font-bold text-lg text-brand-400 shrink-0">
              <Cloud size={22} />
              <span className="hidden xs:inline">JobHunters</span>
            </div>

            {/* Desktop nav */}
            <nav className="hidden md:flex items-center gap-1 ml-2">
              {NAV_LINKS.map(({ to, end, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      isActive ? 'bg-brand-500/20 text-brand-400' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                    }`
                  }
                >
                  <Icon size={15} />{label}
                </NavLink>
              ))}
            </nav>

            {/* Right side */}
            <div className="ml-auto flex items-center gap-2">
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-brand-500/20 text-brand-400' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`
                }
              >
                <div className="w-6 h-6 rounded-full bg-brand-500/30 text-brand-300 flex items-center justify-center text-[11px] font-bold uppercase">
                  {user.name[0]}
                </div>
                <span className="hidden sm:inline text-sm">{user.name}</span>
              </NavLink>
              <button
                onClick={logout}
                className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>

              {/* Hamburger — mobile only */}
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                aria-label="Toggle menu"
              >
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>

          {/* Mobile dropdown menu */}
          {menuOpen && (
            <div className="md:hidden border-t border-slate-800 bg-slate-950 px-4 py-3 space-y-1">
              {NAV_LINKS.map(({ to, end, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors w-full ${
                      isActive ? 'bg-brand-500/20 text-brand-400' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                    }`
                  }
                >
                  <Icon size={16} />{label}
                </NavLink>
              ))}
              <div className="border-t border-slate-800 pt-2 mt-2">
                <button
                  onClick={() => { setMenuOpen(false); logout() }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors w-full"
                >
                  <LogOut size={16} />Sign out
                </button>
              </div>
            </div>
          )}
        </header>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-4 sm:py-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><JobsPage /></ProtectedRoute>} />
          <Route path="/tracker" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/resume-enhancer" element={<ProtectedRoute><ResumeEnhancerPage /></ProtectedRoute>} />
          <Route path="/interview-coach" element={<ProtectedRoute><InterviewCoachPage /></ProtectedRoute>} />
          <Route path="/prep-tracker" element={<ProtectedRoute><PrepTrackerPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

