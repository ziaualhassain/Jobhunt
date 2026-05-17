import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Briefcase, Plus, X, Loader2, AlertCircle, Users, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, CheckCircle2, Clock, Building2, MapPin,
} from 'lucide-react'
import {
  getMyRecruiterJobs,
  postRecruiterJob,
  updateRecruiterJob,
  getJobApplicants,
  updateApplicantStatus,
} from '../lib/api'
import type { RecruiterJob, Applicant } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Remote']
const EXP_LEVELS = ['Junior', 'Mid-level', 'Senior', 'Lead']
const APPLICANT_STATUSES = ['Applied', 'Reviewing', 'Shortlisted', 'Rejected', 'Hired']

const STATUS_COLORS: Record<string, string> = {
  Applied:     'bg-slate-700 text-slate-300',
  Reviewing:   'bg-blue-500/20 text-blue-300',
  Shortlisted: 'bg-brand-500/20 text-brand-300',
  Rejected:    'bg-red-500/20 text-red-400',
  Hired:       'bg-emerald-500/20 text-emerald-400',
}

function SkillChips({ raw }: { raw: string }) {
  const chips = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map(chip => (
        <span key={chip} className="badge bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">{chip}</span>
      ))}
    </div>
  )
}

interface PostJobFormProps {
  onClose: () => void
}

function PostJobForm({ onClose }: PostJobFormProps) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [jobType, setJobType] = useState(JOB_TYPES[0])
  const [experienceLevel, setExperienceLevel] = useState(EXP_LEVELS[0])
  const [skills, setSkills] = useState('')
  const [salary, setSalary] = useState('')
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => postRecruiterJob({ title, description, location, jobType, experienceLevel, skills, salary }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recruiter-jobs'] })
      onClose()
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Failed to post job')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    mutation.mutate()
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <Plus size={16} className="text-brand-400" />
          Post New Job
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          className="input w-full"
          placeholder="Job Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
          autoFocus
        />

        <textarea
          className="input w-full min-h-[120px] resize-y"
          placeholder="Job description…"
          value={description}
          onChange={e => setDescription(e.target.value)}
          required
        />

        <input
          type="text"
          className="input w-full"
          placeholder="Location (e.g. Remote, New York, London)"
          value={location}
          onChange={e => setLocation(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Job Type</label>
            <select
              className="input w-full"
              value={jobType}
              onChange={e => setJobType(e.target.value)}
            >
              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Experience Level</label>
            <select
              className="input w-full"
              value={experienceLevel}
              onChange={e => setExperienceLevel(e.target.value)}
            >
              {EXP_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">Required Skills (comma-separated)</label>
          <input
            type="text"
            className="input w-full"
            placeholder="e.g. React, TypeScript, Node.js"
            value={skills}
            onChange={e => setSkills(e.target.value)}
          />
          {skills && <SkillChips raw={skills} />}
        </div>

        <input
          type="text"
          className="input w-full"
          placeholder="Salary (optional, e.g. $80k–$120k)"
          value={salary}
          onChange={e => setSalary(e.target.value)}
        />

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded-lg p-3">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {mutation.isPending ? 'Posting…' : 'Post Job'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

interface ApplicantPanelProps {
  job: RecruiterJob
  onClose: () => void
}

function ApplicantPanel({ job, onClose }: ApplicantPanelProps) {
  const qc = useQueryClient()
  const [expandedCovers, setExpandedCovers] = useState<Set<number>>(new Set())

  const { data: applicants = [], isLoading, isError } = useQuery({
    queryKey: ['applicants', job.job_id],
    queryFn: () => getJobApplicants(job.job_id),
  })

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: number; status: string }) =>
      updateApplicantStatus(job.job_id, userId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicants', job.job_id] }),
  })

  function toggleCover(id: number) {
    setExpandedCovers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Applicants</h2>
          <p className="text-xs text-slate-500 mt-0.5">{job.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-500 py-4">
          <Loader2 size={15} className="animate-spin" />
          Loading applicants…
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={14} />
          Failed to load applicants
        </div>
      )}

      {!isLoading && !isError && applicants.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <Users size={32} className="mx-auto text-slate-700" />
          <p className="text-slate-500 text-sm">No applicants yet</p>
        </div>
      )}

      {!isLoading && applicants.length > 0 && (
        <div className="space-y-3">
          {applicants.map((applicant: Applicant) => (
            <div key={applicant.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{applicant.name}</p>
                  <p className="text-xs text-slate-500 truncate">{applicant.email}</p>
                  <p className="text-[11px] text-slate-600 mt-0.5 flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(applicant.applied_at).toLocaleDateString()}
                  </p>
                </div>
                <select
                  value={applicant.status}
                  onChange={e => statusMutation.mutate({ userId: applicant.user_id, status: e.target.value })}
                  className={`text-xs px-2 py-1 rounded-lg border-0 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500 ${STATUS_COLORS[applicant.status] ?? 'bg-slate-700 text-slate-300'}`}
                >
                  {APPLICANT_STATUSES.map(s => (
                    <option key={s} value={s} className="bg-slate-800 text-slate-200">{s}</option>
                  ))}
                </select>
              </div>

              {applicant.cover_letter && (
                <div>
                  <button
                    type="button"
                    onClick={() => toggleCover(applicant.id)}
                    className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    {expandedCovers.has(applicant.id) ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    Cover letter
                  </button>
                  {expandedCovers.has(applicant.id) && (
                    <p className="text-xs text-slate-400 mt-1.5 leading-relaxed bg-slate-900/50 rounded-lg p-2.5 border border-slate-700/50">
                      {applicant.cover_letter}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface JobCardRecruiterProps {
  job: RecruiterJob
  onViewApplicants: (job: RecruiterJob) => void
  activeApplicantJobId: string | null
}

function JobCardRecruiter({ job, onViewApplicants, activeApplicantJobId }: JobCardRecruiterProps) {
  const qc = useQueryClient()

  const toggleMutation = useMutation({
    mutationFn: () => updateRecruiterJob(job.job_id, { is_active: !job.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruiter-jobs'] }),
  })

  const isViewing = activeApplicantJobId === job.job_id

  return (
    <div className={`card p-4 space-y-3 transition-colors ${isViewing ? 'border-brand-500/40 bg-brand-500/5' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-slate-100 truncate">{job.title}</h3>
            {!job.is_active && (
              <span className="badge bg-slate-700 text-slate-400 border border-slate-600 text-[10px]">Inactive</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-400">
            <Building2 size={11} className="shrink-0" />
            <span className="truncate">{job.company}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Applicant count badge */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-500/15 text-brand-300 text-xs font-medium">
            <Users size={11} />
            {job.applicant_count}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {job.location && (
          <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>
        )}
        {job.job_type && (
          <span className="flex items-center gap-1"><Briefcase size={11} />{job.job_type}</span>
        )}
        {job.experience_level && (
          <span className="badge bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">{job.experience_level}</span>
        )}
        {job.salary && (
          <span className="text-emerald-400 font-medium">{job.salary}</span>
        )}
      </div>

      {job.skills && <SkillChips raw={job.skills} />}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
        <p className="text-[11px] text-slate-600 flex items-center gap-1">
          <Clock size={10} />
          Posted {new Date(job.created_at).toLocaleDateString()}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewApplicants(job)}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors px-2.5 py-1 rounded-lg ${
              isViewing
                ? 'bg-brand-500/20 text-brand-300'
                : 'text-slate-400 hover:text-brand-400 hover:bg-brand-500/10'
            }`}
          >
            <Users size={12} />
            View Applicants
          </button>

          <button
            type="button"
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            className={`flex items-center gap-1.5 text-xs font-medium transition-colors px-2.5 py-1 rounded-lg ${
              job.is_active
                ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
                : 'text-emerald-400 hover:bg-emerald-500/10'
            }`}
            title={job.is_active ? 'Deactivate job listing' : 'Activate job listing'}
          >
            {toggleMutation.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : job.is_active ? (
              <ToggleRight size={14} />
            ) : (
              <ToggleLeft size={14} />
            )}
            {job.is_active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function RecruiterDashboard() {
  const { user } = useAuth()
  const [showPostForm, setShowPostForm] = useState(false)
  const [activeApplicantJob, setActiveApplicantJob] = useState<RecruiterJob | null>(null)

  const { data: jobs = [], isLoading, isError } = useQuery({
    queryKey: ['recruiter-jobs'],
    queryFn: getMyRecruiterJobs,
  })

  const totalJobs = jobs.length
  const activeJobs = jobs.filter(j => j.is_active).length
  const totalApplicants = jobs.reduce((sum, j) => sum + j.applicant_count, 0)

  function handleViewApplicants(job: RecruiterJob) {
    setActiveApplicantJob(prev => prev?.job_id === job.job_id ? null : job)
    setShowPostForm(false)
  }

  function handlePostNew() {
    setShowPostForm(true)
    setActiveApplicantJob(null)
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Briefcase size={22} className="text-brand-400" />
            Recruiter Dashboard
          </h1>
          {user?.companyName && (
            <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1">
              <Building2 size={12} />
              {user.companyName}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handlePostNew}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={15} />
          Post New Job
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center space-y-1">
          <p className="text-2xl font-bold text-slate-100">{totalJobs}</p>
          <p className="text-xs text-slate-500">Total Jobs</p>
        </div>
        <div className="card p-4 text-center space-y-1">
          <p className="text-2xl font-bold text-brand-400">{totalApplicants}</p>
          <p className="text-xs text-slate-500">Total Applicants</p>
        </div>
        <div className="card p-4 text-center space-y-1">
          <p className="text-2xl font-bold text-emerald-400">{activeJobs}</p>
          <p className="text-xs text-slate-500">Active Jobs</p>
        </div>
      </div>

      {/* Post Job Form */}
      {showPostForm && (
        <PostJobForm onClose={() => setShowPostForm(false)} />
      )}

      {/* Applicant Panel */}
      {activeApplicantJob && (
        <ApplicantPanel job={activeApplicantJob} onClose={() => setActiveApplicantJob(null)} />
      )}

      {/* Jobs list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
            Your Job Listings
          </h2>
          {jobs.length > 0 && (
            <span className="text-xs text-slate-600">{jobs.length} total</span>
          )}
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-4 animate-pulse">
                <div className="h-4 bg-slate-800 rounded w-1/3 mb-2" />
                <div className="h-3 bg-slate-800 rounded w-1/4" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="card p-5 flex items-center gap-3 text-red-400 border-red-900/50">
            <AlertCircle size={18} />
            <div>
              <p className="font-medium">Failed to load jobs</p>
              <p className="text-xs text-red-500 mt-0.5">Make sure the backend is running</p>
            </div>
          </div>
        )}

        {!isLoading && !isError && jobs.length === 0 && (
          <div className="card p-10 text-center space-y-3">
            <Briefcase size={36} className="mx-auto text-slate-700" />
            <div>
              <p className="font-semibold text-slate-300">No jobs posted yet</p>
              <p className="text-sm text-slate-500 mt-1">Click "Post New Job" to create your first listing.</p>
            </div>
            <button
              type="button"
              onClick={handlePostNew}
              className="inline-flex items-center gap-2 btn-primary text-sm"
            >
              <Plus size={14} />
              Post New Job
            </button>
          </div>
        )}

        {!isLoading && jobs.length > 0 && (
          <div className="space-y-3">
            {jobs.map(job => (
              <JobCardRecruiter
                key={job.job_id}
                job={job}
                onViewApplicants={handleViewApplicants}
                activeApplicantJobId={activeApplicantJob?.job_id ?? null}
              />
            ))}
          </div>
        )}
      </div>

      {/* "Verified recruiter" badge at bottom */}
      {user?.companyEmail && (
        <div className="flex items-center gap-2 text-xs text-slate-600 border-t border-slate-800 pt-4">
          <CheckCircle2 size={12} className="text-emerald-600" />
          Posting as {user.companyEmail}
        </div>
      )}
    </div>
  )
}
