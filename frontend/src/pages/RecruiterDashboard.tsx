import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Briefcase, Plus, X, Loader2, AlertCircle, Users, ChevronDown, ChevronUp,
  ToggleLeft, ToggleRight, CheckCircle2, Clock, Building2, MapPin, Phone,
  Linkedin, Globe, DollarSign, Star, FileText, StickyNote, User, PowerOff,
  Trash2, Download,
} from 'lucide-react'
import type { CustomQuestion } from '../types'
import {
  getMyRecruiterJobs, postRecruiterJob, updateRecruiterJob,
  getJobApplicants, updateApplicantStatus,
} from '../lib/api'
import type { RecruiterJob, Applicant } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const JOB_TYPES   = ['Full-time', 'Part-time', 'Contract', 'Remote']
const EXP_LEVELS  = ['Junior', 'Mid-level', 'Senior', 'Lead']
const PIPELINE     = ['Applied', 'Phone Screen', 'Technical', 'Final Interview', 'Offer', 'Rejected'] as const
type PipelineStatus = typeof PIPELINE[number] | 'All'

const STATUS_COLORS: Record<string, string> = {
  'Applied':         'bg-slate-700/80 text-slate-300',
  'Phone Screen':    'bg-blue-500/20 text-blue-300',
  'Technical':       'bg-orange-500/20 text-orange-300',
  'Final Interview': 'bg-yellow-500/20 text-yellow-300',
  'Offer':           'bg-emerald-500/20 text-emerald-400',
  'Rejected':        'bg-red-500/20 text-red-400',
}

const MATCH_COLOR = (score: number) =>
  score >= 70 ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
  : score >= 40 ? 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30'
  : 'text-slate-400 bg-slate-700/50 border-slate-600'

function SkillChips({ raw, highlight = '' }: { raw: string; highlight?: string }) {
  const jobSkills = highlight.toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
  const chips = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(chip => {
        const matched = jobSkills.length > 0 && jobSkills.some(j => chip.toLowerCase().includes(j) || j.includes(chip.toLowerCase()))
        return (
          <span
            key={chip}
            className={`badge text-[10px] border ${matched ? 'bg-brand-500/20 text-brand-300 border-brand-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
          >
            {chip}
          </span>
        )
      })}
    </div>
  )
}

// ── Post Job Form ─────────────────────────────────────────────────────────────

function newQuestion(): CustomQuestion {
  return { id: crypto.randomUUID(), label: '', type: 'text', required: false }
}

function PostJobForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [jobType, setJobType] = useState(JOB_TYPES[0])
  const [experienceLevel, setExperienceLevel] = useState(EXP_LEVELS[1])
  const [skills, setSkills] = useState('')
  const [salary, setSalary] = useState('')
  const [questions, setQuestions] = useState<CustomQuestion[]>([])
  const [error, setError] = useState('')

  function addQuestion() {
    setQuestions(prev => [...prev, newQuestion()])
  }

  function removeQuestion(id: string) {
    setQuestions(prev => prev.filter(q => q.id !== id))
  }

  function updateQuestion(id: string, patch: Partial<CustomQuestion>) {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q))
  }

  const mutation = useMutation({
    mutationFn: () => postRecruiterJob({
      title, description, location,
      job_type: jobType, experience_level: experienceLevel,
      skills, salary, is_active: true,
      custom_questions: questions.filter(q => q.label.trim()),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recruiter-jobs'] }); onClose() },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Failed to post job')
    },
  })

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
          <Plus size={16} className="text-brand-400" />Post New Job
        </h2>
        <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800">
          <X size={14} />
        </button>
      </div>

      <form onSubmit={e => { e.preventDefault(); setError(''); mutation.mutate() }} className="space-y-3">
        <input className="input w-full" placeholder="Job Title *" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
        <textarea className="input w-full min-h-[110px] resize-y" placeholder="Job description — responsibilities, requirements, nice-to-haves…" value={description} onChange={e => setDescription(e.target.value)} required />
        <input className="input w-full" placeholder="Location (e.g. Remote, Bangalore, New York) *" value={location} onChange={e => setLocation(e.target.value)} required />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Job Type</label>
            <select className="input w-full" value={jobType} onChange={e => setJobType(e.target.value)}>
              {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">Experience Level</label>
            <select className="input w-full" value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)}>
              {EXP_LEVELS.map(l => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-slate-500">Required Skills (comma-separated)</label>
          <input className="input w-full" placeholder="e.g. React, TypeScript, Node.js, PostgreSQL" value={skills} onChange={e => setSkills(e.target.value)} />
          {skills && <SkillChips raw={skills} />}
        </div>

        <input className="input w-full" placeholder="Salary range (optional — e.g. $80k–$120k, ₹12–18 LPA)" value={salary} onChange={e => setSalary(e.target.value)} />

        {/* Custom questions builder */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Custom Questions</p>
            <button
              type="button"
              onClick={addQuestion}
              className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 font-medium"
            >
              <Plus size={12} />Add Question
            </button>
          </div>

          {questions.length === 0 && (
            <p className="text-[11px] text-slate-600 italic">
              No custom questions — click "+ Add Question" to ask applicants something specific.
            </p>
          )}

          {questions.map((q, idx) => (
            <div key={q.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 font-mono shrink-0">Q{idx + 1}</span>
                <input
                  className="input flex-1 text-sm py-1.5"
                  placeholder="Question label e.g. 'Are you authorized to work in the US?'"
                  value={q.label}
                  onChange={e => updateQuestion(q.id, { label: e.target.value })}
                />
                <button type="button" onClick={() => removeQuestion(q.id)} className="text-slate-600 hover:text-red-400 shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  className="input text-xs py-1 pr-6"
                  value={q.type}
                  onChange={e => updateQuestion(q.id, { type: e.target.value as CustomQuestion['type'] })}
                >
                  <option value="text">Short text</option>
                  <option value="textarea">Long text</option>
                  <option value="select">Multiple choice</option>
                </select>

                <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={e => updateQuestion(q.id, { required: e.target.checked })}
                    className="w-3 h-3 accent-brand-500"
                  />
                  Required
                </label>
              </div>

              {q.type === 'select' && (
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-600">Options (one per line)</p>
                  <textarea
                    className="input w-full text-xs h-16 resize-none"
                    placeholder={"Yes\nNo\nMaybe"}
                    value={(q.options ?? []).join('\n')}
                    onChange={e => updateQuestion(q.id, { options: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded-lg p-3">
            <AlertCircle size={14} className="shrink-0" />{error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {mutation.isPending ? 'Posting…' : 'Post Job'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </form>
    </div>
  )
}

// ── Applicant Card ────────────────────────────────────────────────────────────

function ApplicantCard({ applicant, job, onUpdate }: {
  applicant: Applicant
  job: RecruiterJob
  onUpdate: (userId: number, updates: { status?: string; recruiterNotes?: string }) => void
}) {
  const [showCover, setShowCover] = useState(false)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notes, setNotes] = useState(applicant.recruiter_notes ?? '')

  const initials = (applicant.applicant_name ?? '?')
    .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-9 h-9 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0 text-sm font-bold text-brand-300">
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-slate-200">{applicant.applicant_name}</p>
              <p className="text-xs text-slate-500">{applicant.applicant_email}</p>
            </div>

            {/* Match score */}
            {(applicant.skill_match_score ?? 0) > 0 && (
              <span className={`badge border text-[10px] font-semibold shrink-0 ${MATCH_COLOR(applicant.skill_match_score ?? 0)}`}>
                <Star size={9} className="inline mr-0.5" />
                {applicant.skill_match_score}% match
              </span>
            )}
          </div>

          {/* Meta: current role, experience */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-slate-500">
            {applicant.applicant_role && (
              <span className="flex items-center gap-1"><User size={10} />{applicant.applicant_role}</span>
            )}
            {applicant.experience_years && (
              <span className="flex items-center gap-1"><Briefcase size={10} />{applicant.experience_years} yrs</span>
            )}
            {applicant.expected_salary && (
              <span className="flex items-center gap-1"><DollarSign size={10} />{applicant.expected_salary}</span>
            )}
            {applicant.notice_period && (
              <span className="flex items-center gap-1"><Clock size={10} />{applicant.notice_period}</span>
            )}
          </div>
        </div>
      </div>

      {/* Contact links */}
      {(applicant.phone || applicant.linkedin_url || applicant.portfolio_url) && (
        <div className="flex flex-wrap gap-2 text-[11px]">
          {applicant.phone && (
            <a href={`tel:${applicant.phone}`} className="flex items-center gap-1 text-slate-400 hover:text-brand-400">
              <Phone size={10} />{applicant.phone}
            </a>
          )}
          {applicant.linkedin_url && (
            <a href={applicant.linkedin_url.startsWith('http') ? applicant.linkedin_url : `https://${applicant.linkedin_url}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-slate-400 hover:text-brand-400">
              <Linkedin size={10} />LinkedIn
            </a>
          )}
          {applicant.portfolio_url && (
            <a href={applicant.portfolio_url.startsWith('http') ? applicant.portfolio_url : `https://${applicant.portfolio_url}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-slate-400 hover:text-brand-400">
              <Globe size={10} />Portfolio
            </a>
          )}
        </div>
      )}

      {/* Skills */}
      {applicant.applicant_skills && (
        <SkillChips raw={applicant.applicant_skills} highlight={job.skills} />
      )}

      {/* Resume */}
      {applicant.resume_original_name && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Download size={10} className="text-brand-400 shrink-0" />
          <span className="font-medium text-slate-300">Resume:</span>
          <span>{applicant.resume_original_name}</span>
        </div>
      )}

      {/* Cover letter */}
      {applicant.cover_letter && (
        <div>
          <button
            type="button"
            onClick={() => setShowCover(v => !v)}
            className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300"
          >
            <FileText size={10} />
            {showCover ? <><ChevronUp size={10} />Hide cover letter</> : <><ChevronDown size={10} />Read cover letter</>}
          </button>
          {showCover && (
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed bg-slate-900/50 rounded-lg p-3 border border-slate-700/50">
              {applicant.cover_letter}
            </p>
          )}
        </div>
      )}

      {/* Custom question answers */}
      {applicant.custom_answers && Object.keys(applicant.custom_answers).length > 0 && job.custom_questions && job.custom_questions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Answers</p>
          {job.custom_questions.map(q => {
            const answer = (applicant.custom_answers ?? {})[q.id]
            if (!answer) return null
            return (
              <div key={q.id} className="bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-800">
                <p className="text-[10px] text-slate-500 mb-0.5">{q.label}</p>
                <p className="text-xs text-slate-300">{answer}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Recruiter notes */}
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => setEditingNotes(v => !v)}
          className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300"
        >
          <StickyNote size={10} />
          {editingNotes ? 'Close notes' : applicant.recruiter_notes ? 'Edit notes' : 'Add recruiter notes'}
        </button>
        {editingNotes && (
          <div className="space-y-1.5">
            <textarea
              className="input w-full h-20 resize-none text-xs"
              placeholder="Private notes about this candidate…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <button
              type="button"
              onClick={() => { onUpdate(applicant.user_id, { recruiterNotes: notes }); setEditingNotes(false) }}
              className="text-[11px] btn-primary px-3 py-1"
            >
              Save Notes
            </button>
          </div>
        )}
        {!editingNotes && applicant.recruiter_notes && (
          <p className="text-[11px] text-slate-500 italic bg-slate-900/40 rounded-lg px-3 py-2 border border-slate-800">
            {applicant.recruiter_notes}
          </p>
        )}
      </div>

      {/* Footer: date + status */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-700/40">
        <p className="text-[10px] text-slate-600 flex items-center gap-1">
          <Clock size={9} />Applied {new Date(applicant.applied_at).toLocaleDateString()}
        </p>
        <select
          value={applicant.status}
          onChange={e => onUpdate(applicant.user_id, { status: e.target.value })}
          className={`text-[11px] px-2 py-1 rounded-lg border-0 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500 ${STATUS_COLORS[applicant.status] ?? 'bg-slate-700 text-slate-300'}`}
        >
          {PIPELINE.map(s => (
            <option key={s} value={s} className="bg-slate-800 text-slate-200">{s}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ── Applicant Panel ───────────────────────────────────────────────────────────

function ApplicantPanel({ job, onClose }: { job: RecruiterJob; onClose: () => void }) {
  const qc = useQueryClient()
  const [tab, setTab] = useState<PipelineStatus>('All')

  const { data: applicants = [], isLoading, isError } = useQuery({
    queryKey: ['applicants', job.id],
    queryFn: () => getJobApplicants(job.id),
  })

  const updateMutation = useMutation({
    mutationFn: ({ userId, updates }: { userId: number; updates: { status?: string; recruiterNotes?: string } }) =>
      updateApplicantStatus(job.id, userId, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['applicants', job.id] }),
  })

  const counts = PIPELINE.reduce((acc, s) => {
    acc[s] = applicants.filter(a => a.status === s).length
    return acc
  }, {} as Record<string, number>)

  const visible = tab === 'All' ? applicants : applicants.filter(a => a.status === tab)

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Applicants</h2>
          <p className="text-xs text-slate-500 mt-0.5">{job.title} · {applicants.length} total</p>
        </div>
        <button type="button" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800">
          <X size={14} />
        </button>
      </div>

      {/* Pipeline tabs */}
      {applicants.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(['All', ...PIPELINE] as PipelineStatus[]).map(s => {
            const count = s === 'All' ? applicants.length : counts[s]
            const active = tab === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setTab(s)}
                className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors ${
                  active ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                         : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800 border border-transparent'
                }`}
              >
                {s}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-brand-500/30' : 'bg-slate-800'}`}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-slate-500 py-4">
          <Loader2 size={15} className="animate-spin" />Loading applicants…
        </div>
      )}
      {isError && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={14} />Failed to load applicants
        </div>
      )}
      {!isLoading && !isError && applicants.length === 0 && (
        <div className="text-center py-8 space-y-2">
          <Users size={32} className="mx-auto text-slate-700" />
          <p className="text-slate-500 text-sm">No applicants yet</p>
          <p className="text-xs text-slate-600">Share the job link to attract candidates</p>
        </div>
      )}
      {!isLoading && visible.length > 0 && (
        <div className="space-y-3">
          {visible.map(applicant => (
            <ApplicantCard
              key={applicant.id}
              applicant={applicant}
              job={job}
              onUpdate={(userId, updates) => updateMutation.mutate({ userId, updates })}
            />
          ))}
        </div>
      )}
      {!isLoading && applicants.length > 0 && visible.length === 0 && (
        <p className="text-center text-slate-600 text-sm py-4">No applicants in "{tab}" stage</p>
      )}
    </div>
  )
}

// ── Job Card (Recruiter) ──────────────────────────────────────────────────────

function JobCardRecruiter({ job, onViewApplicants, activeJobId }: {
  job: RecruiterJob
  onViewApplicants: (job: RecruiterJob) => void
  activeJobId: number | null
}) {
  const qc = useQueryClient()
  const toggleMutation = useMutation({
    mutationFn: () => updateRecruiterJob(job.id, { isActive: !job.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recruiter-jobs'] }),
  })
  const isViewing = activeJobId === job.id
  const deactivated = !job.is_active

  return (
    <div className={`card p-4 space-y-3 transition-all ${
      deactivated
        ? 'opacity-60 border-slate-700/30 bg-slate-900/60 grayscale-[30%]'
        : isViewing
          ? 'border-brand-500/40 bg-brand-500/5'
          : ''
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-semibold ${deactivated ? 'text-slate-500 line-through decoration-slate-600' : 'text-slate-100'}`}>
              {job.title}
            </h3>
            {deactivated && (
              <span className="badge bg-red-900/40 text-red-400 border border-red-800/50 text-[10px] flex items-center gap-0.5">
                <PowerOff size={8} />Deactivated
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
            <MapPin size={11} />{job.location || 'Remote'}
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
          (job.applicant_count ?? 0) > 0 ? 'bg-brand-500/15 text-brand-300' : 'bg-slate-800 text-slate-500'
        }`}>
          <Users size={11} />{job.applicant_count ?? 0}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {job.location && <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>}
        {job.job_type && <span className="flex items-center gap-1"><Briefcase size={11} />{job.job_type}</span>}
        {job.experience_level && <span className="badge bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">{job.experience_level}</span>}
        {job.salary && <span className={`font-medium ${deactivated ? 'text-slate-500' : 'text-emerald-400'}`}>{job.salary}</span>}
      </div>

      {job.skills && <SkillChips raw={job.skills} />}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-800/60">
        <p className="text-[11px] text-slate-600 flex items-center gap-1">
          <Clock size={10} />Posted {new Date(job.created_at).toLocaleDateString()}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewApplicants(job)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
              isViewing ? 'bg-brand-500/20 text-brand-300' : 'text-slate-400 hover:text-brand-400 hover:bg-brand-500/10'
            }`}
          >
            <Users size={12} />View Applicants
          </button>
          <button
            type="button"
            onClick={() => toggleMutation.mutate()}
            disabled={toggleMutation.isPending}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${
              deactivated
                ? 'text-emerald-400 hover:bg-emerald-500/10 border border-emerald-700/40'
                : 'text-slate-400 hover:text-red-400 hover:bg-red-500/10'
            }`}
          >
            {toggleMutation.isPending
              ? <Loader2 size={12} className="animate-spin" />
              : deactivated ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
            {deactivated ? 'Activate' : 'Deactivate'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function RecruiterDashboard() {
  const { user } = useAuth()
  const [showPostForm, setShowPostForm] = useState(false)
  const [activeJob, setActiveJob] = useState<RecruiterJob | null>(null)

  const { data: jobs = [], isLoading, isError } = useQuery({
    queryKey: ['recruiter-jobs'],
    queryFn: getMyRecruiterJobs,
  })

  const totalApplicants = jobs.reduce((s, j) => s + (j.applicant_count ?? 0), 0)
  const activeJobs = jobs.filter(j => j.is_active).length

  // Pipeline totals across all jobs (requires fetching per job — skip for now; show only totals)

  function handleViewApplicants(job: RecruiterJob) {
    setActiveJob(prev => prev?.id === job.id ? null : job)
    setShowPostForm(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Briefcase size={22} className="text-brand-400" />Recruiter Dashboard
          </h1>
          {user?.companyName && (
            <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1">
              <Building2 size={12} />{user.companyName}
            </p>
          )}
        </div>
        <button type="button" onClick={() => { setShowPostForm(true); setActiveJob(null) }} className="btn-primary flex items-center gap-2">
          <Plus size={15} />Post New Job
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 text-center space-y-1">
          <p className="text-2xl font-bold text-slate-100">{jobs.length}</p>
          <p className="text-xs text-slate-500">Total Jobs</p>
        </div>
        <div className="card p-4 text-center space-y-1">
          <p className="text-2xl font-bold text-brand-400">{totalApplicants}</p>
          <p className="text-xs text-slate-500">Total Applicants</p>
        </div>
        <div className="card p-4 text-center space-y-1">
          <p className="text-2xl font-bold text-emerald-400">{activeJobs}</p>
          <p className="text-xs text-slate-500">Active Listings</p>
        </div>
      </div>

      {/* Post Job Form */}
      {showPostForm && <PostJobForm onClose={() => setShowPostForm(false)} />}

      {/* Applicant Panel */}
      {activeJob && <ApplicantPanel job={activeJob} onClose={() => setActiveJob(null)} />}

      {/* Jobs list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Your Job Listings</h2>
          {jobs.length > 0 && <span className="text-xs text-slate-600">{jobs.length} total</span>}
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="card p-4 animate-pulse space-y-2">
                <div className="h-4 bg-slate-800 rounded w-1/3" />
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
              <p className="text-sm text-slate-500 mt-1">Post your first job to start receiving applications.</p>
            </div>
            <button type="button" onClick={() => setShowPostForm(true)} className="inline-flex items-center gap-2 btn-primary text-sm">
              <Plus size={14} />Post New Job
            </button>
          </div>
        )}

        {!isLoading && jobs.length > 0 && (
          <div className="space-y-3">
            {jobs.map(job => (
              <JobCardRecruiter
                key={job.id}
                job={job}
                onViewApplicants={handleViewApplicants}
                activeJobId={activeJob?.id ?? null}
              />
            ))}
          </div>
        )}
      </div>

      {user?.companyEmail && (
        <div className="flex items-center gap-2 text-xs text-slate-600 border-t border-slate-800 pt-4">
          <CheckCircle2 size={12} className="text-emerald-600" />
          Posting as {user.companyEmail}
        </div>
      )}
    </div>
  )
}
