import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, AlertCircle, Layers, SortAsc } from 'lucide-react'
import SearchForm from '../components/SearchForm'
import JobCard from '../components/JobCard'
import { searchJobs, saveApplication, getApplications } from '../lib/api'
import type { SearchFilters } from '../types'

const DEFAULT_FILTERS: Partial<SearchFilters> = {
  tags: ['DevOps', 'Kubernetes', 'AWS', 'Terraform'],
  remote: true,
}

type SortKey = 'default' | 'title' | 'company' | 'source'

export default function JobsPage() {
  const qc = useQueryClient()
  const [filters, setFilters] = useState<Partial<SearchFilters>>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<SortKey>('default')
  const [toast, setToast] = useState<string | null>(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['jobs', filters],
    queryFn: () => searchJobs(filters),
    enabled: true,
  })

  const { data: applications } = useQuery({
    queryKey: ['applications'],
    queryFn: () => getApplications(),
  })

  const savedIds = new Set((applications ?? []).map(a => a.job_id))

  const saveMutation = useMutation({
    mutationFn: saveApplication,
    onSuccess: (_, job) => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      showToast(`"${job.title}" saved to tracker`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      if (msg === 'Job already saved') showToast('Already in your tracker')
      else showToast('Failed to save job')
    },
  })

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function handleSearch(f: Partial<SearchFilters>) {
    setFilters(f)
  }

  const jobs = [...(data?.jobs ?? [])]
  if (sort === 'title') jobs.sort((a, b) => a.title.localeCompare(b.title))
  else if (sort === 'company') jobs.sort((a, b) => a.company.localeCompare(b.company))
  else if (sort === 'source') jobs.sort((a, b) => a.source.localeCompare(b.source))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">DevOps &amp; Cloud Jobs</h1>
        <p className="text-slate-500 text-sm mt-1">Aggregated from RemoteOK, We Work Remotely, Himalayas &amp; more</p>
      </div>

      <SearchForm onSearch={handleSearch} loading={isLoading} />

      {/* Results header */}
      {(data || isLoading) && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {isLoading ? (
              <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />Fetching jobs…</span>
            ) : (
              <span><span className="text-slate-200 font-medium">{data?.total ?? 0}</span> jobs found</span>
            )}
          </p>
          <div className="flex items-center gap-1.5">
            <SortAsc size={13} className="text-slate-500" />
            <select
              className="text-xs bg-slate-800 border border-slate-700 text-slate-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
              value={sort}
              onChange={e => setSort(e.target.value as SortKey)}
            >
              <option value="default">Sort: Default</option>
              <option value="title">Sort: Title</option>
              <option value="company">Sort: Company</option>
              <option value="source">Sort: Source</option>
            </select>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-800 rounded w-2/3" />
                  <div className="h-3 bg-slate-800 rounded w-1/3" />
                  <div className="h-3 bg-slate-800 rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="card p-5 flex items-center gap-3 text-red-400 border-red-900">
          <AlertCircle size={18} />
          <div>
            <p className="font-medium">Failed to load jobs</p>
            <p className="text-xs text-red-500 mt-0.5">
              {(error as Error)?.message ?? 'Make sure the backend is running'}
            </p>
          </div>
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && jobs.length === 0 && data && (
        <div className="card p-10 text-center">
          <Layers size={32} className="mx-auto text-slate-700 mb-3" />
          <p className="text-slate-400 font-medium">No jobs found</p>
          <p className="text-slate-600 text-sm mt-1">Try adjusting your keywords or filters</p>
        </div>
      )}

      {/* Job grid */}
      {!isLoading && jobs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {jobs.map(job => (
            <JobCard
              key={job.job_id}
              job={job}
              isSaved={savedIds.has(job.job_id)}
              onSave={j => saveMutation.mutate(j)}
            />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-slate-200 text-sm px-4 py-2.5 rounded-xl shadow-xl z-50 animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  )
}
