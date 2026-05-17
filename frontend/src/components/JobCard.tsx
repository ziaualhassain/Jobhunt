import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ExternalLink, Bookmark, BookmarkCheck, MapPin, Briefcase, Building2, Tag,
  ChevronDown, ChevronUp, Send, CheckCircle2, X, Loader2, Phone, Linkedin,
  Globe, Clock, DollarSign, User, Bot, AlertCircle,
} from 'lucide-react'
import type { Job } from '../types'
import type { FitScore } from '../lib/jobScorer'
import { scoreColor, scoreLabel } from '../lib/jobScorer'
import type { ResumeAnalysis } from '../lib/api'
import { deepScoreJob, applyToJob, getMyApplicationsToJobs } from '../lib/api'
import type { DeepScore, ApplyPayload } from '../lib/api'
import { PERCENTAGE_ENABLE } from '../lib/config'

const SOURCE_COLORS: Record<string, string> = {
  RemoteOK:           'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800',
  'We Work Remotely': 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800',
  Himalayas:          'bg-blue-100   dark:bg-blue-900/50   text-blue-700   dark:text-blue-400   border-blue-300   dark:border-blue-800',
  ArbeitNow:          'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800',
  TheirStack:         'bg-rose-100   dark:bg-rose-900/50   text-rose-700   dark:text-rose-400   border-rose-300   dark:border-rose-800',
  JobHunters:         'bg-brand-500/20 text-brand-300 border-brand-500/40',
  'Company Watch':    'bg-teal-100   dark:bg-teal-900/50   text-teal-700   dark:text-teal-400   border-teal-300   dark:border-teal-800',
}

interface Props {
  job: Job
  isSaved: boolean
  onSave: (job: Job) => void
  fitScore?: FitScore
  resumeAnalysis?: ResumeAnalysis | null
}

// ── Apply Modal ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  )
}

function ApplyModal({ job, onClose, onApplied }: { job: Job; onClose: () => void; onApplied: () => void }) {
  const [form, setForm] = useState<ApplyPayload>({
    phone: '', linkedinUrl: '', portfolioUrl: '',
    currentRole: '', experienceYears: '', expectedSalary: '', noticePeriod: '',
    applicantSkills: '', coverLetter: '',
  })
  const [error, setError] = useState('')

  function set(key: keyof ApplyPayload) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  const mutation = useMutation({
    mutationFn: () => applyToJob(job.job_id, form),
    onSuccess: () => { onApplied(); onClose() },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Failed to submit application')
    },
  })

  const jobSkills = (job.tags ?? '').split(',').map(s => s.trim()).filter(Boolean)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="card w-full max-w-lg my-4 p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-100 leading-snug">Apply to {job.title}</h2>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Building2 size={11} />{job.company}
              {job.location && <><span className="text-slate-700">·</span><MapPin size={11} />{job.location}</>}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200 mt-0.5 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Contact</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Phone">
                <div className="relative">
                  <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className="input w-full pl-8 text-sm" placeholder="+1 555 000 0000" value={form.phone} onChange={set('phone')} />
                </div>
              </Field>
              <Field label="LinkedIn URL">
                <div className="relative">
                  <Linkedin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className="input w-full pl-8 text-sm" placeholder="linkedin.com/in/you" value={form.linkedinUrl} onChange={set('linkedinUrl')} />
                </div>
              </Field>
            </div>
            <Field label="Portfolio / GitHub URL">
              <div className="relative">
                <Globe size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input className="input w-full pl-8 text-sm" placeholder="github.com/you or yoursite.com" value={form.portfolioUrl} onChange={set('portfolioUrl')} />
              </div>
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Experience</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Current / Last Role">
                <div className="relative">
                  <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className="input w-full pl-8 text-sm" placeholder="e.g. Senior Engineer" value={form.currentRole} onChange={set('currentRole')} />
                </div>
              </Field>
              <Field label="Years of Experience">
                <select className="input w-full text-sm" value={form.experienceYears} onChange={set('experienceYears')}>
                  <option value="">Select…</option>
                  {['0–1', '1–2', '2–4', '4–6', '6–10', '10+'].map(y => <option key={y} value={y}>{y} years</option>)}
                </select>
              </Field>
              <Field label="Expected Salary">
                <div className="relative">
                  <DollarSign size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className="input w-full pl-8 text-sm" placeholder="e.g. $80k–$100k / ₹18 LPA" value={form.expectedSalary} onChange={set('expectedSalary')} />
                </div>
              </Field>
              <Field label="Notice Period / Availability">
                <div className="relative">
                  <Clock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input className="input w-full pl-8 text-sm" placeholder="e.g. Immediate / 2 weeks" value={form.noticePeriod} onChange={set('noticePeriod')} />
                </div>
              </Field>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Skills</p>
            {jobSkills.length > 0 && (
              <p className="text-[11px] text-slate-600">
                Job requires: <span className="text-slate-500">{jobSkills.join(', ')}</span>
              </p>
            )}
            <Field label="Your Skills (comma-separated)">
              <input
                className="input w-full text-sm"
                placeholder={jobSkills.length ? jobSkills.slice(0, 4).join(', ') + '…' : 'React, TypeScript, Node.js…'}
                value={form.applicantSkills}
                onChange={set('applicantSkills')}
              />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Cover Letter</p>
            <textarea
              className="input w-full h-28 resize-none text-sm"
              placeholder="Tell the recruiter why you're a great fit for this role…"
              value={form.coverLetter}
              onChange={set('coverLetter')}
            />
          </div>

          {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {mutation.isPending ? 'Submitting…' : 'Submit Application'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Fit score bar ─────────────────────────────────────────────────────────────

function ScoreBar({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-10 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-700/60 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${value >= 65 ? 'bg-emerald-500' : value >= 45 ? 'bg-yellow-500' : 'bg-slate-500'}`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-[10px] text-slate-400 w-7 text-right">{value}%</span>
    </div>
  )
}

// ── Job Card ──────────────────────────────────────────────────────────────────

export default function JobCard({ job, isSaved, onSave, fitScore, resumeAnalysis }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [appliedLocally, setAppliedLocally] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [aiScore, setAiScore] = useState<DeepScore | null>(null)

  const isJobHuntersJob = job.source === 'JobHunters'

  const { data: appliedJobIds = [] } = useQuery({
    queryKey: ['my-job-applications'],
    queryFn: getMyApplicationsToJobs,
    enabled: isJobHuntersJob,
    staleTime: 30_000,
  })

  const hasApplied = appliedLocally || appliedJobIds.includes(job.job_id)

  const deepMutation = useMutation({
    mutationFn: () => deepScoreJob(resumeAnalysis!, job),
    onSuccess: (data) => setAiScore(data),
  })

  const displayScore = aiScore ? { ...fitScore!, overall: aiScore.score } : fitScore

  const sourceClass = SOURCE_COLORS[job.source] ?? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
  const tags = job.tags ? job.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 6) : []

  return (
    <>
      <article className="card p-4 hover:border-slate-700 transition-colors group">
        <div className="flex items-start gap-3">
          {/* Company logo */}
          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
            {job.logo ? (
              <img src={job.logo} alt={job.company} className="w-full h-full object-contain" />
            ) : (
              <span className="text-sm font-bold text-slate-500">{job.company.charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold text-slate-100 truncate leading-snug">{job.title}</h3>
                <div className="flex items-center gap-1.5 mt-0.5 text-sm text-slate-400">
                  <Building2 size={13} className="shrink-0" />
                  <span className="truncate">{job.company}</span>
                </div>
              </div>

              {/* Badges: fit score + source */}
              <div className="flex items-center gap-1.5 shrink-0">
                {PERCENTAGE_ENABLE && displayScore && (
                  <button
                    type="button"
                    onClick={() => setScoreOpen(v => !v)}
                    className={`badge border text-[10px] font-semibold cursor-pointer hover:opacity-90 transition-opacity ${scoreColor(displayScore.overall)}`}
                    title={scoreLabel(displayScore.overall)}
                  >
                    {displayScore.overall}% match
                  </button>
                )}
                <span className={`badge border text-[10px] ${sourceClass}`}>{job.source}</span>
              </div>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
              {job.location && <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>}
              {job.job_type && <span className="flex items-center gap-1"><Briefcase size={11} />{job.job_type}</span>}
              {job.salary && <span className="text-emerald-400 font-medium">{job.salary}</span>}
            </div>

            {/* Skill tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map(tag => (
                  <span key={tag} className="flex items-center gap-0.5 badge bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 text-[10px]">
                    <Tag size={9} />{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Description */}
            {job.description && (
              <div className="mt-2">
                <p className={`text-xs text-slate-500 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
                  {job.description.slice(0, expanded ? undefined : 300)}
                </p>
                {job.description.length > 200 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(v => !v)}
                    className="text-[10px] text-brand-400 hover:text-brand-300 mt-0.5 flex items-center gap-0.5"
                  >
                    {expanded ? <><ChevronUp size={10} />Less</> : <><ChevronDown size={10} />More</>}
                  </button>
                )}
              </div>
            )}

            {/* Fit score breakdown panel */}
            {PERCENTAGE_ENABLE && fitScore && scoreOpen && (
              <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3 space-y-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">Resume fit breakdown</p>

                <div className="space-y-1.5">
                  <ScoreBar value={aiScore ? aiScore.score : fitScore.skills} label="Skills" />
                  <ScoreBar value={fitScore.level} label="Level" />
                  <ScoreBar value={fitScore.role}  label="Role" />
                </div>

                {fitScore.matchedSkills.length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-600 mb-1">Matched</p>
                    <div className="flex flex-wrap gap-1">
                      {fitScore.matchedSkills.map(s => (
                        <span key={s} className="badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">✓ {s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {(aiScore?.skill_gaps ?? fitScore.missingSignals).length > 0 && (
                  <div>
                    <p className="text-[10px] text-slate-600 mb-1">Gaps</p>
                    <div className="flex flex-wrap gap-1">
                      {(aiScore?.skill_gaps ?? fitScore.missingSignals).map(s => (
                        <span key={s} className="badge bg-red-500/10 text-red-400 border border-red-500/20 text-[10px]">✗ {s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {aiScore ? (
                  <div className="space-y-1.5 pt-1 border-t border-slate-700/40">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold">AI analysis</p>
                    <p className="text-xs text-slate-400 italic leading-relaxed">{aiScore.seniority_fit}</p>
                    <p className="text-xs text-slate-400 leading-relaxed">{aiScore.reasoning}</p>
                  </div>
                ) : resumeAnalysis ? (
                  <button
                    type="button"
                    onClick={() => deepMutation.mutate()}
                    disabled={deepMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors disabled:opacity-50 mt-1"
                  >
                    {deepMutation.isPending
                      ? <><Loader2 size={11} className="animate-spin" />Analysing with AI…</>
                      : <><Bot size={11} />Get AI breakdown</>
                    }
                  </button>
                ) : null}

                {deepMutation.isError && (
                  <p className="flex items-center gap-1 text-[10px] text-red-400">
                    <AlertCircle size={10} />
                    {(deepMutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'AI unavailable'}
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              {isJobHuntersJob ? (
                <button
                  type="button"
                  disabled={hasApplied}
                  onClick={() => setApplyOpen(true)}
                  className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                    hasApplied ? 'text-emerald-400 cursor-default' : 'text-brand-400 hover:text-brand-300'
                  }`}
                >
                  {hasApplied ? <><CheckCircle2 size={12} />Applied</> : <><Send size={12} />Apply Now</>}
                </button>
              ) : (
                job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
                  >
                    <ExternalLink size={12} />View Job
                  </a>
                )
              )}

              <button
                type="button"
                onClick={() => onSave(job)}
                disabled={isSaved}
                className={`flex items-center gap-1.5 text-xs transition-colors font-medium ml-auto ${
                  isSaved ? 'text-brand-400 cursor-default' : 'text-slate-500 hover:text-brand-400'
                }`}
              >
                {isSaved ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
                {isSaved ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </article>

      {applyOpen && (
        <ApplyModal
          job={job}
          onClose={() => setApplyOpen(false)}
          onApplied={() => setAppliedLocally(true)}
        />
      )}
    </>
  )
}
