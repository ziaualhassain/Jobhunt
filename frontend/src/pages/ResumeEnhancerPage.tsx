import { useState, useRef } from 'react'
import { Upload, FileText, Loader2, AlertCircle, CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp, Target, Sparkles } from 'lucide-react'
import { enhanceResume } from '../lib/api'
import type { ResumeEnhancement } from '../lib/api'

const SECTION_LABELS: Record<string, string> = {
  ats_compatibility: 'ATS Compatibility',
  keyword_match: 'Keyword Match',
  experience_presentation: 'Experience',
  skills_section: 'Skills',
  quantification: 'Quantification',
}

function ScoreRing({ score, grade }: { score: number; grade: string }) {
  const color = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'
  const ring = score >= 80 ? 'border-emerald-500' : score >= 60 ? 'border-yellow-500' : 'border-red-500'
  return (
    <div className={`w-32 h-32 rounded-full border-4 ${ring} flex flex-col items-center justify-center`}>
      <span className={`text-4xl font-bold ${color}`}>{score}</span>
      <span className={`text-sm font-semibold ${color}`}>{grade}</span>
    </div>
  )
}

function SectionBar({ label, score, feedback }: { label: string; score: number; feedback: string }) {
  const [open, setOpen] = useState(false)
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
  return (
    <div className="space-y-1">
      <button type="button" onClick={() => setOpen(v => !v)} className="w-full flex items-center gap-3 hover:bg-slate-800/50 px-1 py-0.5 rounded transition-colors">
        <span className="text-sm text-slate-300 w-44 text-left shrink-0">{label}</span>
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${score}%` }} />
        </div>
        <span className="text-sm font-medium text-slate-300 w-8 text-right shrink-0">{score}</span>
        {open ? <ChevronUp size={13} className="text-slate-500 shrink-0" /> : <ChevronDown size={13} className="text-slate-500 shrink-0" />}
      </button>
      {open && <p className="text-xs text-slate-400 pl-1 pb-1 leading-relaxed">{feedback}</p>}
    </div>
  )
}

const SEVERITY_CONFIG = {
  high:   { icon: XCircle,       color: 'text-red-400',    bg: 'bg-red-900/20 border-red-800',    label: 'High' },
  medium: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-900/20 border-yellow-800', label: 'Medium' },
  low:    { icon: AlertCircle,   color: 'text-blue-400',   bg: 'bg-blue-900/20 border-blue-800',  label: 'Low' },
}

export default function ResumeEnhancerPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [targetRole, setTargetRole] = useState('')
  const [targetSkills, setTargetSkills] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResumeEnhancement | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !targetRole.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await enhanceResume(file, targetRole.trim(), targetSkills.trim())
      setResult(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Analysis failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Sparkles size={22} className="text-brand-400" />
          Resume Enhancer
        </h1>
        <p className="text-slate-500 text-sm mt-1">Upload your resume, set your target role, and get an AI-powered score with actionable improvements</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-4">
        {/* File upload */}
        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
            file ? 'border-brand-500/50 bg-brand-500/5' : 'border-slate-700 hover:border-slate-500'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <FileText size={28} className="text-brand-400" />
              <p className="text-sm font-medium text-brand-300">{file.name}</p>
              <p className="text-xs text-slate-500">Click to change file</p>
            </>
          ) : (
            <>
              <Upload size={28} className="text-slate-500" />
              <p className="text-sm font-medium text-slate-300">Click to upload your resume</p>
              <p className="text-xs text-slate-500">PDF, DOCX, or TXT · max 10 MB</p>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Target Role <span className="text-red-400">*</span></label>
            <div className="relative">
              <Target size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                className="input pl-8"
                placeholder="e.g. Senior Backend Engineer"
                value={targetRole}
                onChange={e => setTargetRole(e.target.value)}
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Target Skills / Keywords <span className="text-slate-600">(optional)</span></label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Python, AWS, Kubernetes, microservices"
              value={targetSkills}
              onChange={e => setTargetSkills(e.target.value)}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!file || !targetRole.trim() || loading}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {loading ? (
            <><Loader2 size={15} className="animate-spin" />Analysing with Claude…</>
          ) : (
            <><Sparkles size={15} />Analyse Resume</>
          )}
        </button>
      </form>

      {error && (
        <div className="card p-4 flex items-center gap-3 text-red-400 border-red-900">
          <AlertCircle size={18} />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {/* Score overview */}
          <div className="card p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
              <ScoreRing score={result.overall_score} grade={result.grade} />
              <div className="flex-1 space-y-1">
                <h2 className="text-lg font-semibold text-slate-100">Overall Score</h2>
                <p className="text-sm text-slate-400 leading-relaxed">{result.summary}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {result.sections.keyword_match.matched.slice(0, 10).map(k => (
                    <span key={k} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-800">
                      <CheckCircle2 size={9} />{k}
                    </span>
                  ))}
                  {result.sections.keyword_match.missing.slice(0, 10).map(k => (
                    <span key={k} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-red-900/20 text-red-400 border border-red-800">
                      <XCircle size={9} />{k}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section scores */}
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Section Breakdown</h3>
            {Object.entries(result.sections).map(([key, val]) => (
              <SectionBar
                key={key}
                label={SECTION_LABELS[key] ?? key}
                score={val.score}
                feedback={val.feedback}
              />
            ))}
          </div>

          {/* Issues */}
          {result.issues.length > 0 && (
            <div className="card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Issues Found</h3>
              <div className="space-y-2">
                {result.issues.map((issue, i) => {
                  const cfg = SEVERITY_CONFIG[issue.severity]
                  const Icon = cfg.icon
                  return (
                    <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${cfg.bg}`}>
                      <Icon size={15} className={`${cfg.color} shrink-0 mt-0.5`} />
                      <div>
                        <p className={`text-sm font-medium ${cfg.color}`}>{issue.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{issue.detail}</p>
                      </div>
                      <span className={`ml-auto text-[10px] font-medium uppercase tracking-wide ${cfg.color} shrink-0`}>{cfg.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Improvements */}
          {result.improvements.length > 0 && (
            <div className="card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Recommended Improvements</h3>
              <ol className="space-y-3">
                {result.improvements.sort((a, b) => a.priority - b.priority).map((imp, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-300 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{imp.priority}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{imp.action}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{imp.impact}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
