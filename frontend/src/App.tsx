import { Routes, Route, NavLink } from 'react-router-dom'
import { Search, Kanban, Cloud } from 'lucide-react'
import JobsPage from './pages/JobsPage'
import TrackerPage from './pages/TrackerPage'

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
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
                  isActive
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
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
                  isActive
                    ? 'bg-brand-500/20 text-brand-400'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`
              }
            >
              <Kanban size={15} />
              Tracker
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        <Routes>
          <Route path="/" element={<JobsPage />} />
          <Route path="/tracker" element={<TrackerPage />} />
        </Routes>
      </main>
    </div>
  )
}
