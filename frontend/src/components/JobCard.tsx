import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ExternalLink, Bookmark, BookmarkCheck, MapPin, Briefcase, Building2, Tag, ChevronDown, ChevronUp, Bot, Loader2, AlertCircle, Zap } from 'lucide-react'
import type { Job } from '../types'
import type { FitScore } from '../lib/jobScorer'
import { scoreLabel } from '../lib/jobScorer'
import type { ResumeAnalysis } from '../lib/api'
import { deepScoreJob } from '../lib/api'
import type { DeepScore } from '../lib/api'
import { PERCENTAGE_ENABLE } from '../lib/config'
import AutoApplyModal from './AutoApplyModal'

const SOURCE_COLORS: Record<string, string> = {
  RemoteOK:           'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800',
  'We Work Remotely': 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400 border-purple-300 dark:border-purple-800',
  Himalayas:          'bg-blue-100   dark:bg-blue-900/50   text-blue-700   dark:text-blue-400   border-blue-300   dark:border-blue-800',
  ArbeitNow:          'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-800',
  TheirStack:         'bg-rose-100   dark:bg-rose-900/50   text-rose-700   dark:text-rose-400   border-rose-300   dark:border-rose-800',
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
  const color = score >= 90 ? '#10b981' : score >= 75 ? '#eab308' : score >= 50 ? '#f97316' : '#64748b'
  const textColor = score >= 90 ? 'text-emerald-400' : score >= 75 ? 'text-yellow-400' : score >= 50 ? 'text-orange-400' : 'text-slate-400'
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

export default function JobCard({ job, isSaved, onSave, fitScore, resumeAnalysis, profileRegion }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [aiScore, setAiScore] = useState<DeepScore | null>(null)
  const [autoApplyOpen, setAutoApplyOpen] = useState(false)

  const sourceClass = SOURCE_COLORS[job.source] ?? 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
  const tags = job.tags ? job.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 6) : []

  const deepMutation = useMutation({
    mutationFn: () => deepScoreJob(resumeAnalysis!, job),
    onSuccess: (data) => setAiScore(data),
  })

  const displayScore = aiScore ? { ...fitScore!, overall: aiScore.score } : fitScore

  return (
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
                <ScoreCircle score={displayScore.overall} onClick={() => setScoreOpen(v => !v)} />
              )}
              <span className={`badge border text-[10px] ${sourceClass}`}>{job.source}</span>
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

              {/* Score formula explanation */}
              <div className="rounded-lg bg-slate-900/50 border border-slate-700/40 px-2.5 py-2 space-y-1.5">
                <p className="text-[10px] text-slate-500 font-medium mb-2">How this score is calculated</p>
                <ScoreBar value={aiScore ? aiScore.score : fitScore.skills} label="Skills" />
                <p className="text-[9px] text-slate-600 pl-12 -mt-0.5">Skill overlap with your resume keywords · weight 50%</p>
                <ScoreBar value={fitScore.level} label="Level" />
                <p className="text-[9px] text-slate-600 pl-12 -mt-0.5">Seniority match + years-of-experience fit · weight 30%</p>
                <ScoreBar value={fitScore.role}  label="Role" />
                <p className="text-[9px] text-slate-600 pl-12 -mt-0.5">Job title alignment with your target roles · weight 20%</p>
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
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors font-medium"
            >
              <ExternalLink size={12} />
              View Job
            </a>

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

      {autoApplyOpen && (
        <AutoApplyModal job={job} onClose={() => setAutoApplyOpen(false)} />
      )}
    </article>
  )
}
