import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Upload, Loader2, CheckCircle2, AlertCircle, Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react'
import { analyzeResume } from '../lib/api'
import type { ResumeAnalysis } from '../lib/api'

interface Props {
  onAnalyzed: (analysis: ResumeAnalysis) => void
}

export default function ResumeUpload({ onAnalyzed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null)
  const [filename, setFilename] = useState('')
  const [expanded, setExpanded] = useState(true)

  const mutation = useMutation({
    mutationFn: analyzeResume,
    onSuccess: ({ analysis: a, filename: f }) => {
      setAnalysis(a)
      setFilename(f)
    },
  })

  function handleFile(file: File) {
    setAnalysis(null)
    mutation.mutate(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function applyToSearch() {
    if (analysis) onAnalyzed(analysis)
  }

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-brand-400" />
          <span className="font-medium text-slate-200 text-sm">Resume-Based Job Matching</span>
          <span className="badge bg-brand-500/20 text-brand-300 border border-brand-500/30 text-[10px]">AI</span>
        </div>
        {expanded ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-800">
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`mt-4 border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragging
                ? 'border-brand-500 bg-brand-500/10'
                : 'border-slate-700 hover:border-slate-600 hover:bg-slate-800/30'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              className="hidden"
              onChange={handleChange}
            />
            {mutation.isPending ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={24} className="animate-spin text-brand-400" />
                <p className="text-sm text-slate-400">Analyzing with Claude AI…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload size={24} className="text-slate-600" />
                <p className="text-sm text-slate-400">
                  <span className="text-brand-400 font-medium">Click to upload</span> or drag your resume here
                </p>
                <p className="text-xs text-slate-600">PDF, DOCX, DOC, TXT — up to 10 MB</p>
              </div>
            )}
          </div>

          {/* Error */}
          {mutation.isError && (
            <div className="flex items-start gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded-lg p-3">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{(mutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Analysis failed. Make sure ANTHROPIC_API_KEY is set in backend/.env'}</span>
            </div>
          )}

          {/* Result */}
          {analysis && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 size={15} className="text-emerald-400" />
                  <span className="text-slateald-400 text-slate-400">Analyzed:</span>
                  <span className="text-slate-200 font-medium truncate max-w-[180px]">{filename}</span>
                </div>
                <button
                  onClick={() => { setAnalysis(null); mutation.reset() }}
                  className="text-slate-600 hover:text-slate-400 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>

              {/* Summary */}
              <p className="text-xs text-slate-400 italic leading-relaxed">{analysis.summary}</p>

              {/* Meta badges */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="badge bg-brand-500/20 text-brand-300 border border-brand-500/30">
                  {analysis.experienceLevel}
                </span>
                <span className="badge bg-slate-800 text-slate-300 border border-slate-700">
                  ~{analysis.yearsOfExperience} yrs exp
                </span>
                {analysis.cloudPlatforms.slice(0, 3).map(p => (
                  <span key={p} className="badge bg-emerald-900/40 text-emerald-300 border border-emerald-800">
                    {p}
                  </span>
                ))}
              </div>

              {/* Skills */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mb-1.5">Detected skills</p>
                <div className="flex flex-wrap gap-1">
                  {analysis.skills.slice(0, 18).map(skill => (
                    <span key={skill} className="badge bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Suggested titles */}
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mb-1.5">Matching job titles</p>
                <div className="flex flex-wrap gap-1">
                  {analysis.jobTitles.map(title => (
                    <span key={title} className="badge bg-purple-900/40 text-purple-300 border border-purple-800 text-[10px]">
                      {title}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={applyToSearch}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
              >
                <Sparkles size={14} />
                Search jobs matching my resume
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
