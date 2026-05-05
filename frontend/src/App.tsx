import { Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { Search, Kanban, Cloud, LogOut } from 'lucide-react'
import { useAuth } from './context/AuthContext'
import JobsPage from './pages/JobsPage'
import TrackerPage from './pages/TrackerPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProfilePage from './pages/ProfilePage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      {user && (
        <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
            <div className="flex items-center gap-2 font-bold text-lg text-brand-400">
              <Cloud size={22} />
              JobHunt
            </div>
            <nav className="flex items-center gap-1 ml-4">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-brand-500/20 text-brand-400' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`
                }
              >
                <Search size={15} />
                Search Jobs
              </NavLink>
              <NavLink
                to="/tracker"
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-brand-500/20 text-brand-400' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`
                }
              >
                <Kanban size={15} />
                Tracker
              </NavLink>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-brand-500/20 text-brand-400' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  }`
                }
              >
                <div className="w-6 h-6 rounded-full bg-brand-500/30 text-brand-300 flex items-center justify-center text-[11px] font-bold uppercase">
                  {user.name[0]}
                </div>
                <span className="hidden sm:inline">{user.name}</span>
              </NavLink>
              <button
                onClick={logout}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
                title="Sign out"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<ProtectedRoute><JobsPage /></ProtectedRoute>} />
          <Route path="/tracker" element={<ProtectedRoute><TrackerPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}
