import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Zap, FileText, Loader2, CheckCircle2, AlertCircle, ChevronDown, PauseCircle, PlayCircle } from 'lucide-react'
import { listResumes, startAutoApply, resumeAutoApply } from '../lib/api'
import type { Job } from '../types'

interface Props {
  job: Job
  onClose: () => void
}

type Phase = 'setup' | 'running' | 'paused' | 'done' | 'error'

export default function AutoApplyModal({ job, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [selectedResumeId, setSelectedResumeId] = useState<number | undefined>()
  const [logs, setLogs] = useState<string[]>([])
  const [result, setResult] = useState<{ status: string; result?: string } | null>(null)
  const [pauseReason, setPauseReason] = useState<string | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [resuming, setResuming] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  const { data: resumes = [], isLoading: resumesLoading } = useQuery({
    queryKey: ['resumes'],
    queryFn: listResumes,
  })

  // Auto-select primary resume
  useEffect(() => {
    const primary = resumes.find(r => r.is_primary)
    if (primary && !selectedResumeId) setSelectedResumeId(primary.id)
    else if (resumes.length > 0 && !selectedResumeId) setSelectedResumeId(resumes[0].id)
  }, [resumes, selectedResumeId])

  // Scroll logs to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Close SSE on unmount
  useEffect(() => () => { esRef.current?.close() }, [])

  function startApply() {
    setPhase('running')
    setLogs(['🚀 Starting auto-apply agent…'])

    startAutoApply({
      jobUrl: job.url,
      jobTitle: job.title,
      jobCompany: job.company,
      jobSource: job.source,
      jobId: job.job_id,
      jobLocation: job.location,
      resumeId: selectedResumeId,
    }).then(({ runId: id }) => {
      setRunId(id)
      const token = localStorage.getItem('token')
      const es = new EventSource(`/api/auto-apply/stream/${id}?token=${token}`)
      esRef.current = es

      es.onmessage = (e) => {
        const data = JSON.parse(e.data)
        if (data.type === 'log') setLogs(prev => [...prev, data.msg])
      }

      es.addEventListener('paused', (e) => {
        const data = JSON.parse((e as MessageEvent).data)
        setPauseReason(data.reason ?? 'Human action required')
        setPhase('paused')
      })

      es.addEventListener('done', (e) => {
        const data = JSON.parse((e as MessageEvent).data)
        setResult(data)
        setPhase(data.status === 'complete' ? 'done' : 'error')
        es.close()
      })

      es.onerror = () => {
        setLogs(prev => [...prev, '⚠️ Connection lost — check the backend logs.'])
        setPhase('error')
        es.close()
      }
    }).catch(err => {
      setLogs(prev => [...prev, `❌ Failed to start: ${err?.response?.data?.error ?? err.message}`])
      setPhase('error')
    })
  }

  async function handleResume() {
    if (!runId) return
    setResuming(true)
    try {
      await resumeAutoApply(runId)
      setPauseReason(null)
      setPhase('running')
    } catch {
      setLogs(prev => [...prev, '⚠️ Could not resume — check the backend.'])
    } finally {
      setResuming(false)
    }
  }

  const primaryResume = resumes.find(r => r.id === selectedResumeId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
              <Zap size={15} className="text-brand-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Auto Apply</h2>
              <p className="text-xs text-slate-500 truncate max-w-[280px]">{job.title} · {job.company}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Setup phase */}
          {phase === 'setup' && (
            <>
              {/* Resume picker */}
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium">Resume to submit</label>
                {resumesLoading ? (
                  <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 size={13} className="animate-spin" />Loading…</div>
                ) : resumes.length === 0 ? (
                  <p className="text-xs text-red-400 flex items-center gap-1.5">
                    <AlertCircle size={12} />No resumes found — upload one in your Profile first.
                  </p>
                ) : (
                  <div className="relative">
                    <select
                      className="input w-full appearance-none pr-8"
                      value={selectedResumeId ?? ''}
                      onChange={e => setSelectedResumeId(Number(e.target.value))}
                    >
                      {resumes.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.label}{r.is_primary ? ' ★' : ''} — {r.original_name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Info box */}
              <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-3 space-y-1.5 text-xs text-slate-400">
                <p className="flex items-center gap-1.5 text-slate-300 font-medium"><FileText size={12} />What the agent will do</p>
                <ul className="space-y-1 ml-4 list-disc">
                  <li>Open the job page in a visible browser window</li>
                  <li>Locate and click the Apply / Easy Apply button</li>
                  <li>Fill your profile details into the form</li>
                  <li>Upload your selected resume</li>
                  <li>Submit — and log every step here</li>
                </ul>
                <p className="text-slate-500 pt-1">Credentials for <span className="text-slate-300">{job.source}</span> will be used automatically if saved in your profile.</p>
              </div>

              <button
                onClick={startApply}
                disabled={resumes.length === 0}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5"
              >
                <Zap size={14} />
                Start Auto Apply
              </button>
            </>
          )}

          {/* Running / paused / done / error phase */}
          {(phase === 'running' || phase === 'paused' || phase === 'done' || phase === 'error') && (
            <div className="space-y-3">
              {/* Status bar */}
              <div className="flex items-center gap-2">
                {phase === 'running' && <Loader2 size={14} className="animate-spin text-brand-400" />}
                {phase === 'paused'  && <PauseCircle size={14} className="text-amber-400" />}
                {phase === 'done'    && <CheckCircle2 size={14} className="text-emerald-400" />}
                {phase === 'error'   && <AlertCircle size={14} className="text-red-400" />}
                <span className={`text-sm font-medium ${
                  phase === 'running' ? 'text-brand-300' :
                  phase === 'paused'  ? 'text-amber-300' :
                  phase === 'done'    ? 'text-emerald-300' : 'text-red-300'
                }`}>
                  {phase === 'running' ? 'Agent working…' :
                   phase === 'paused'  ? 'Waiting for you…' :
                   phase === 'done'    ? 'Application submitted!' : 'Something went wrong'}
                </span>
              </div>

              {/* Resume being used */}
              {primaryResume && (
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <FileText size={11} />Using: {primaryResume.label} — {primaryResume.original_name}
                </p>
              )}

              {/* Log stream */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 h-52 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1">
                {logs.map((line, i) => (
                  <p key={i} className={`leading-relaxed ${line.startsWith('⏸️') ? 'text-amber-400' : line.startsWith('▶️') ? 'text-brand-400' : ''}`}>{line}</p>
                ))}
                {phase === 'running' && (
                  <p className="text-slate-600 animate-pulse">▌</p>
                )}
                <div ref={logsEndRef} />
              </div>

              {/* Paused — human action required */}
              {phase === 'paused' && pauseReason && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 space-y-2.5">
                  <p className="text-xs text-amber-300 font-medium">🧩 Human action needed</p>
                  <p className="text-xs text-amber-200/80">{pauseReason}</p>
                  <p className="text-[10px] text-amber-300/60">The browser window is open on your machine. Complete the action, then click Continue below.</p>
                  <button
                    onClick={handleResume}
                    disabled={resuming}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                  >
                    {resuming ? <Loader2 size={11} className="animate-spin" /> : <PlayCircle size={11} />}
                    {resuming ? 'Resuming…' : 'Continue — I\'ve completed the action'}
                  </button>
                </div>
              )}

              {/* Result message */}
              {result?.result && (
                <p className={`text-xs rounded-lg px-3 py-2 ${
                  phase === 'done' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                     'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {result.result}
                </p>
              )}

              <button
                onClick={onClose}
                className="w-full px-4 py-2 rounded-xl border border-slate-700 text-sm text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
              >
                {phase === 'running' || phase === 'paused' ? 'Close (agent continues in background)' : 'Close'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
