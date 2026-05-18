import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  ExternalLink, Bookmark, BookmarkCheck, MapPin, Briefcase, Building2, Tag,
  ChevronDown, ChevronUp, Send, CheckCircle2, X, Loader2, Phone, Linkedin,
  Globe, Clock, DollarSign, User, Bot, AlertCircle, Zap,
} from 'lucide-react'
import type { Job } from '../types'
import type { FitScore } from '../lib/jobScorer'
import { scoreLabel, extractTitleFromDescription } from '../lib/jobScorer'
import type { ResumeAnalysis } from '../lib/api'
import { deepScoreJob, applyToJob, getMyApplicationsToJobs, getApplicationProfile, listResumes, uploadResume } from '../lib/api'
import type { DeepScore, ApplyPayload } from '../lib/api'
import { PERCENTAGE_ENABLE } from '../lib/config'
import AutoApplyModal from './AutoApplyModal'

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
  profileRegion?: string
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
  const [customAnswers, setCustomAnswers] = useState<Record<string, string>>({})
  const [selectedResumeId, setSelectedResumeId] = useState<number | 'new' | null>(null)
  const [newResumeFile, setNewResumeFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const { data: appProfile } = useQuery({
    queryKey: ['application-profile'],
    queryFn: getApplicationProfile,
  })

  const { data: resumes = [] } = useQuery({
    queryKey: ['resumes'],
    queryFn: listResumes,
  })

  // Pre-fill contact/experience from application profile
  useEffect(() => {
    if (!appProfile) return
    setForm(prev => ({
      ...prev,
      phone:          appProfile.phone        ?? prev.phone,
      linkedinUrl:    appProfile.linkedinUrl   ?? prev.linkedinUrl,
      portfolioUrl:   appProfile.portfolioUrl  ?? prev.portfolioUrl,
      noticePeriod:   appProfile.noticePeriod  ?? prev.noticePeriod,
      expectedSalary: appProfile.expectedCTC   ?? prev.expectedSalary,
    }))
  }, [appProfile])

  // Default to primary resume once resumes load
  useEffect(() => {
    if (resumes.length > 0 && selectedResumeId === null) {
      const primary = resumes.find(r => r.is_primary) ?? resumes[0]
      setSelectedResumeId(primary.id)
    }
  }, [resumes])

  function set(key: keyof ApplyPayload) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [key]: e.target.value }))
  }

  const mutation = useMutation({
    mutationFn: async () => {
      let finalResumeId: number | undefined
      if (selectedResumeId === 'new' && newResumeFile) {
        const uploaded = await uploadResume(newResumeFile, 'Resume')
        finalResumeId = uploaded.id
      } else if (typeof selectedResumeId === 'number') {
        finalResumeId = selectedResumeId
      }
      await applyToJob(job.job_id, { ...form, resumeId: finalResumeId, customAnswers })
    },
    onSuccess: () => { onApplied(); onClose() },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Failed to submit application')
    },
  })

  const jobSkills = (job.tags ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const customQuestions = job.custom_questions ?? []

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

          {/* Resume */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Resume</p>
            {resumes.length > 0 ? (
              <div className="space-y-2">
                <select
                  className="input w-full text-sm"
                  value={selectedResumeId === 'new' ? 'new' : (selectedResumeId ?? '')}
                  onChange={e => setSelectedResumeId(e.target.value === 'new' ? 'new' : Number(e.target.value))}
                >
                  {resumes.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.is_primary ? '★ ' : ''}{r.label} — {r.original_name}
                    </option>
                  ))}
                  <option value="new">Upload new resume…</option>
                </select>
                {selectedResumeId === 'new' && (
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    className="input w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-500/20 file:text-brand-300"
                    onChange={e => setNewResumeFile(e.target.files?.[0] ?? null)}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">No resumes saved — upload one to attach</p>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="input w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-brand-500/20 file:text-brand-300"
                  onChange={e => {
                    setNewResumeFile(e.target.files?.[0] ?? null)
                    setSelectedResumeId('new')
                  }}
                />
              </div>
            )}
          </div>

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

          {/* Custom questions */}
          {customQuestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest">Additional Questions</p>
              {customQuestions.map(q => (
                <Field key={q.id} label={`${q.label}${q.required ? ' *' : ''}`}>
                  {q.type === 'textarea' ? (
                    <textarea
                      className="input w-full h-20 resize-none text-sm"
                      placeholder="Your answer…"
                      value={customAnswers[q.id] ?? ''}
                      onChange={e => setCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      required={q.required}
                    />
                  ) : q.type === 'select' && q.options?.length ? (
                    <select
                      className="input w-full text-sm"
                      value={customAnswers[q.id] ?? ''}
                      onChange={e => setCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      required={q.required}
                    >
                      <option value="">Select…</option>
                      {q.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : (
                    <input
                      className="input w-full text-sm"
                      placeholder="Your answer…"
                      value={customAnswers[q.id] ?? ''}
                      onChange={e => setCustomAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      required={q.required}
                    />
                  )}
                </Field>
              ))}
            </div>
          )}

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

// ── Score helpers ─────────────────────────────────────────────────────────────

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

function ScoreCircle({ score, onClick }: { score: number; onClick: () => void }) {
  const r = 16
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const color = score >= 80 ? '#166534' : score >= 65 ? '#4ade80' : score >= 45 ? '#eab308' : '#64748b'
  const textColor = score >= 80 ? 'text-green-800' : score >= 65 ? 'text-green-400' : score >= 45 ? 'text-yellow-400' : 'text-slate-400'
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Match score: ${score}% — click for breakdown`}
      className="relative shrink-0 hover:scale-110 transition-transform cursor-pointer"
    >
      <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#1e293b" strokeWidth="3.5" />
        <circle
          cx="20" cy="20" r={r}
          fill="none"
          stroke={color}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold leading-none ${textColor}`}>
        {score}
      </span>
    </button>
  )
}

// ── Job Card ──────────────────────────────────────────────────────────────────

export default function JobCard({ job, isSaved, onSave, fitScore, resumeAnalysis, profileRegion }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [appliedLocally, setAppliedLocally] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [aiScore, setAiScore] = useState<DeepScore | null>(null)
  const [autoApplyOpen, setAutoApplyOpen] = useState(false)

  const isJobHuntersJob = job.source === 'JobHunters'

  const { data: appliedJobIds = [] } = useQuery({
    queryKey: ['my-job-applications'],
    queryFn: getMyApplicationsToJobs,
    enabled: isJobHuntersJob,
    staleTime: 30_000,
  })

  const hasApplied = appliedLocally || appliedJobIds.includes(job.job_id)

  const sourceClass = SOURCE_COLORS[job.source] ?? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
  const tags = job.tags ? job.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 6) : []
  const displayTitle = job.title?.trim() || extractTitleFromDescription(job.description ?? '') || 'Untitled Position'
  const isTitleExtracted = !job.title?.trim() && displayTitle !== 'Untitled Position'

  const deepMutation = useMutation({
    mutationFn: () => deepScoreJob(resumeAnalysis!, job),
    onSuccess: (data) => setAiScore(data),
  })

  const displayScore = aiScore ? { ...fitScore!, overall: aiScore.score } : fitScore

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
                <h3 className="font-semibold text-slate-100 truncate leading-snug">
                  {displayTitle}
                  {isTitleExtracted && (
                    <span className="ml-1.5 text-[9px] font-normal text-slate-500 align-middle">from description</span>
                  )}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5 text-sm text-slate-400">
                  <Building2 size={13} className="shrink-0" />
                  <span className="truncate">{job.company}</span>
                </div>
              </div>

              {/* Badges: fit score + source + new */}
              <div className="flex items-center gap-1.5 shrink-0">
                {PERCENTAGE_ENABLE && displayScore && (
                  <ScoreCircle score={displayScore.overall} onClick={() => setScoreOpen(v => !v)} />
                )}
                <span className={`badge border text-[10px] ${sourceClass}`}>{job.source}</span>
                {job.date_posted && (() => {
                  const daysOld = (Date.now() - new Date(job.date_posted).getTime()) / 86_400_000
                  return daysOld <= 3 ? (
                    <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">New</span>
                  ) : null
                })()}
              </div>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
              {job.location && (
                <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>
              )}
              {job.job_type && (
                <span className="flex items-center gap-1"><Briefcase size={11} />{job.job_type}</span>
              )}
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

            {/* ── Fit score breakdown panel ─────────────────────────────────── */}
            {PERCENTAGE_ENABLE && fitScore && scoreOpen && (
              <div className="mt-3 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3 space-y-3">

                {/* Header with overall score */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">Match score breakdown</p>
                  <span className={`text-xs font-bold ${displayScore!.overall >= 90 ? 'text-emerald-400' : displayScore!.overall >= 75 ? 'text-yellow-400' : displayScore!.overall >= 50 ? 'text-orange-400' : 'text-slate-400'}`}>
                    {displayScore!.overall}% — {scoreLabel(displayScore!.overall)}
                  </span>
                </div>

                {/* Your profile requirements */}
                {resumeAnalysis && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1.5">Your requirements</p>
                    <div className="flex flex-wrap gap-1">
                      {profileRegion && (() => {
                        const jobText = `${job.title} ${job.tags ?? ''} ${job.description ?? ''} ${job.location ?? ''}`.toLowerCase()
                        const matched = jobText.includes(profileRegion.toLowerCase()) || profileRegion.toLowerCase() === 'remote'
                        return (
                          <span className={`badge border text-[10px] ${matched ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700/50 text-slate-500 border-slate-600'}`}>
                            {matched ? '✓' : '·'} 📍{profileRegion}
                          </span>
                        )
                      })()}
                      {resumeAnalysis.experienceLevel && (() => {
                        const lvlMap: Record<string, number> = { Junior: 1, 'Mid-level': 2, Senior: 3, Lead: 4, Staff: 5, Principal: 6 }
                        const jText = `${job.title} ${job.description ?? ''}`.toLowerCase()
                        const jLvl = /\bsenior\b/.test(jText) ? 3 : /\b(junior|entry)\b/.test(jText) ? 1 : /\b(mid[- ]level|intermediate)\b/.test(jText) ? 2 : /\b(lead|staff|principal)\b/.test(jText) ? 4 : 2
                        const pLvl = lvlMap[resumeAnalysis.experienceLevel] ?? 2
                        const matched = Math.abs(jLvl - pLvl) <= 1
                        return (
                          <span className={`badge border text-[10px] ${matched ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700/50 text-slate-500 border-slate-600'}`}>
                            {matched ? '✓' : '·'} {resumeAnalysis.experienceLevel}{resumeAnalysis.yearsOfExperience ? ` (${resumeAnalysis.yearsOfExperience}y)` : ''}
                          </span>
                        )
                      })()}
                      {[...new Set([...resumeAnalysis.skills, ...(resumeAnalysis.searchKeywords ?? [])])].slice(0, 12).map(skill => {
                        const jobText = `${job.title} ${job.tags ?? ''} ${job.description ?? ''}`.toLowerCase()
                        const matched = jobText.includes(skill.toLowerCase())
                        return (
                          <span key={skill} className={`badge border text-[10px] ${matched ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-700/50 text-slate-500 border-slate-600'}`}>
                            {matched ? '✓' : '·'} {skill}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Why this job: reasons chips */}
                {fitScore.reasons && fitScore.reasons.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {fitScore.reasons.map(r => (
                      <span key={r} className="badge bg-slate-800/60 text-slate-400 border border-slate-700/60 text-[10px]">
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                {/* Score formula explanation */}
                <div className="rounded-lg bg-slate-900/50 border border-slate-700/40 px-2.5 py-2 space-y-1.5">
                  <p className="text-[10px] text-slate-500 font-medium mb-2">How this score is calculated</p>
                  <ScoreBar value={aiScore ? aiScore.score : fitScore.skills} label="Skills" />
                  <p className="text-[9px] text-slate-600 pl-12 -mt-0.5">
                    Skill overlap with your profile keywords · {fitScore.roleActive ? '40%' : '50%'}
                  </p>
                  <ScoreBar value={fitScore.level} label="Level" />
                  <p className="text-[9px] text-slate-600 pl-12 -mt-0.5">
                    Seniority match + years-of-experience fit · {fitScore.roleActive ? '25%' : '35%'}
                  </p>
                  {fitScore.roleActive && (
                    <>
                      <ScoreBar value={fitScore.role} label="Role" />
                      <p className="text-[9px] text-slate-600 pl-12 -mt-0.5">Job title alignment with your target roles · 20%</p>
                    </>
                  )}
                  <ScoreBar value={fitScore.location ?? 60} label="Location" />
                  <p className="text-[9px] text-slate-600 pl-12 -mt-0.5">Region preference match (remote / country) · 15%</p>
                  {!fitScore.roleActive && (
                    <p className="text-[9px] text-slate-500 italic mt-1">
                      Role dimension inactive — add target job titles via resume upload to enable it
                    </p>
                  )}
                </div>

                {/* Pros — matched skills */}
                {fitScore.matchedSkills.length > 0 && (
                  <div>
                    <p className="text-[10px] text-emerald-500 font-semibold mb-1.5">✓ Pros — skills you have</p>
                    <div className="flex flex-wrap gap-1">
                      {fitScore.matchedSkills.map(s => (
                        <span key={s} className="badge bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">✓ {s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cons — skill gaps */}
                {(aiScore?.skill_gaps ?? fitScore.missingSignals).length > 0 && (
                  <div>
                    <p className="text-[10px] text-red-400 font-semibold mb-1.5">✗ Cons — skills to develop</p>
                    <div className="flex flex-wrap gap-1">
                      {(aiScore?.skill_gaps ?? fitScore.missingSignals).map(s => (
                        <span key={s} className="badge bg-red-500/10 text-red-400 border border-red-500/20 text-[10px]">✗ {s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI deep analysis */}
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
                <>
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
                    >
                      <ExternalLink size={12} />
                      View Job
                    </a>
                  )}
                  {job.url && (
                    <button
                      type="button"
                      onClick={() => setAutoApplyOpen(true)}
                      className="flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      <Zap size={12} />
                      Auto Apply
                    </button>
                  )}
                </>
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

      {autoApplyOpen && (
        <AutoApplyModal job={job} onClose={() => setAutoApplyOpen(false)} />
      )}
    </>
  )
}
