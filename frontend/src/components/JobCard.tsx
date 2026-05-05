import { useState } from 'react'
import { ExternalLink, Bookmark, BookmarkCheck, MapPin, Briefcase, Building2, Tag, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'
import type { Job } from '../types'

const SOURCE_COLORS: Record<string, string> = {
  RemoteOK: 'bg-emerald-900/50 text-emerald-400 border-emerald-800',
  'We Work Remotely': 'bg-purple-900/50 text-purple-400 border-purple-800',
  Himalayas: 'bg-blue-900/50 text-blue-400 border-blue-800',
  ArbeitNow: 'bg-orange-900/50 text-orange-400 border-orange-800',
}

interface Props {
  job: Job
  isSaved: boolean
  onSave: (job: Job, status?: 'saved' | 'applied') => void
}

export default function JobCard({ job, isSaved, onSave }: Props) {
  const [expanded, setExpanded] = useState(false)
  const sourceClass = SOURCE_COLORS[job.source] ?? 'bg-slate-800 text-slate-400 border-slate-700'
  const tags = job.tags ? job.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 6) : []

  return (
    <article className="card p-4 hover:border-slate-700 transition-colors group">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 overflow-hidden">
          {job.logo ? (
            <img src={job.logo} alt={job.company} className="w-full h-full object-contain" />
          ) : (
            <span className="text-sm font-bold text-slate-500">{job.company.charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-100 truncate leading-snug">{job.title}</h3>
              <div className="flex items-center gap-1.5 mt-0.5 text-sm text-slate-400">
                <Building2 size={13} className="shrink-0" />
                <span className="truncate">{job.company}</span>
              </div>
            </div>
            <span className={`badge border text-[10px] shrink-0 ${sourceClass}`}>{job.source}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-500">
            {job.location && (
              <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>
            )}
            {job.job_type && (
              <span className="flex items-center gap-1"><Briefcase size={11} />{job.job_type}</span>
            )}
            {job.salary && <span className="text-emerald-400 font-medium">{job.salary}</span>}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map(tag => (
                <span key={tag} className="flex items-center gap-0.5 badge bg-slate-800 text-slate-400 border border-slate-700 text-[10px]">
                  <Tag size={9} />{tag}
                </span>
              ))}
            </div>
          )}

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

            {isSaved ? (
              <span className="flex items-center gap-1.5 text-xs text-brand-400 ml-auto">
                <BookmarkCheck size={13} />
                Saved
              </span>
            ) : (
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  type="button"
                  onClick={() => onSave(job, 'saved')}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-brand-400 transition-colors font-medium"
                >
                  <Bookmark size={13} />
                  Save
                </button>
                <span className="text-slate-700">·</span>
                <button
                  type="button"
                  onClick={() => onSave(job, 'applied')}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-400 transition-colors font-medium"
                >
                  <CheckCircle2 size={13} />
                  Applied
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
