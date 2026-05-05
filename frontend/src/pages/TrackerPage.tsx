import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Kanban, TrendingUp } from 'lucide-react'
import { getApplications, updateApplication, deleteApplication, getStats } from '../lib/api'
import ApplicationCard from '../components/ApplicationCard'
import type { Application, ApplicationStatus } from '../types'
import { STATUS_CONFIG } from '../types'

const COLUMNS: ApplicationStatus[] = [
  'saved', 'applied', 'phone_screen', 'technical', 'final_interview', 'offer', 'rejected',
]

export default function TrackerPage() {
  const qc = useQueryClient()

  const { data: applications = [], isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => getApplications(),
  })

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: getStats,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { status?: ApplicationStatus; notes?: string } }) =>
      updateApplication(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteApplication,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  const byStatus: Record<ApplicationStatus, Application[]> = {} as Record<ApplicationStatus, Application[]>
  COLUMNS.forEach(col => { byStatus[col] = [] })
  applications.forEach(app => {
    if (byStatus[app.status]) byStatus[app.status].push(app)
  })

  const statsByStatus = Object.fromEntries(
    (stats?.byStatus ?? []).map(s => [s.status, s.count])
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <Loader2 size={24} className="animate-spin mr-2" />
        Loading tracker…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Kanban size={22} className="text-brand-400" />
            Application Tracker
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {stats?.total ?? 0} total applications
          </p>
        </div>
      </div>

      {/* Stats row */}
      {stats && stats.total > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
          {COLUMNS.map(col => {
            const cfg = STATUS_CONFIG[col]
            const count = statsByStatus[col] ?? 0
            return (
              <div key={col} className={`card p-2.5 text-center border ${cfg.border}`}>
                <p className={`text-lg font-bold ${cfg.color}`}>{count}</p>
                <p className="text-[10px] text-slate-500 leading-tight mt-0.5">{cfg.label}</p>
              </div>
            )
          })}
        </div>
      )}

      {applications.length === 0 ? (
        <div className="card p-12 text-center">
          <TrendingUp size={36} className="mx-auto text-slate-700 mb-3" />
          <p className="text-slate-400 font-medium">No applications yet</p>
          <p className="text-slate-600 text-sm mt-1">
            Search for jobs and save them to start tracking
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {COLUMNS.map(col => {
              const cfg = STATUS_CONFIG[col]
              const colApps = byStatus[col]
              return (
                <div key={col} className="w-64 shrink-0">
                  <div className={`flex items-center justify-between mb-2 px-1`}>
                    <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <span className={`badge ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                      {colApps.length}
                    </span>
                  </div>
                  <div className={`rounded-xl p-2 space-y-2 min-h-[200px] border ${cfg.border} bg-slate-900/40`}>
                    {colApps.length === 0 && (
                      <p className="text-center text-slate-700 text-xs py-8">Empty</p>
                    )}
                    {colApps.map(app => (
                      <ApplicationCard
                        key={app.id}
                        app={app}
                        onStatusChange={(id, status) =>
                          updateMutation.mutate({ id, data: { status } })
                        }
                        onNotesChange={(id, notes) =>
                          updateMutation.mutate({ id, data: { notes } })
                        }
                        onDelete={id => deleteMutation.mutate(id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
