import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Target, Trash2, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Loader2, Upload, Flame, Calendar, Clock, Sparkles, X, BookOpen,
  TrendingUp, AlertCircle,
} from 'lucide-react'
import {
  listPrepPlans, getPrepPlan, generatePrepPlan, uploadPrepPlan,
  deletePrepPlan, togglePrepTask, checkInToday,
} from '../lib/api'
import type { PrepPlan, PrepTask } from '../lib/api'

// ─── helpers ──────────────────────────────────────────────────────────────────

const PRIORITY_COLORS = {
  high:   'text-red-400 bg-red-900/20 border-red-800',
  medium: 'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  low:    'text-slate-400 bg-slate-800 border-slate-700',
}

function pct(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

function ProgressBar({ value, color = 'bg-brand-500', height = 'h-2' }: { value: number; color?: string; height?: string }) {
  return (
    <div className={`w-full ${height} bg-slate-800 rounded-full overflow-hidden`}>
      <div className={`${height} ${color} rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
    </div>
  )
}

// ─── Generate modal ──────────────────────────────────────────────────────────

function GenerateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (id: number) => void }) {
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [weeks, setWeeks] = useState(8)
  const [focus, setFocus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const qc = useQueryClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role.trim()) return
    setLoading(true); setError('')
    try {
      const { id } = await generatePrepPlan({ role: role.trim(), company: company.trim(), timelineWeeks: weeks, focusAreas: focus.trim() })
      qc.invalidateQueries({ queryKey: ['prep-plans'] })
      onCreate(id)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Generation failed. Is Ollama running or ANTHROPIC_API_KEY set?')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2"><Sparkles size={17} className="text-brand-400" />Generate Prep Plan</h2>
          <button onClick={onClose}><X size={18} className="text-slate-500 hover:text-slate-300" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Target Role <span className="text-red-400">*</span></label>
            <input className="input" placeholder="e.g. Senior Backend Engineer" value={role} onChange={e => setRole(e.target.value)} required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Company</label>
              <input className="input" placeholder="e.g. Google" value={company} onChange={e => setCompany(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Timeline (weeks)</label>
              <input className="input" type="number" min={1} max={52} value={weeks} onChange={e => setWeeks(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Focus Areas <span className="text-slate-600">(optional)</span></label>
            <input className="input" placeholder="e.g. DSA, System Design, Behavioural" value={focus} onChange={e => setFocus(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
          <button type="submit" disabled={!role.trim() || loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><Loader2 size={14} className="animate-spin" />Generating plan…</> : <><Sparkles size={14} />Generate with AI</>}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Upload modal ─────────────────────────────────────────────────────────────

function UploadModal({ onClose, onCreate }: { onClose: () => void; onCreate: (id: number) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const qc = useQueryClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setLoading(true); setError('')
    try {
      const { id } = await uploadPrepPlan(file, title.trim() || file.name)
      qc.invalidateQueries({ queryKey: ['prep-plans'] })
      onCreate(id)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setError(msg || 'Upload failed')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2"><Upload size={17} className="text-brand-400" />Upload Plan</h2>
          <button onClick={onClose}><X size={18} className="text-slate-500 hover:text-slate-300" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${file ? 'border-brand-500/50 bg-brand-500/5' : 'border-slate-700 hover:border-slate-500'}`}
          >
            <input ref={fileRef} type="file" className="hidden" accept=".json,.csv,.xlsx,.xls,.docx,.txt" onChange={e => { setFile(e.target.files?.[0] ?? null); setTitle(e.target.files?.[0]?.name?.replace(/\.[^.]+$/, '') ?? '') }} />
            <Upload size={22} className={`mx-auto mb-1 ${file ? 'text-brand-400' : 'text-slate-600'}`} />
            <p className="text-sm text-slate-400">{file ? file.name : 'Click to upload'}</p>
            <p className="text-xs text-slate-600 mt-0.5">JSON · CSV · XLSX · DOCX · TXT</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Plan title</label>
            <input className="input" placeholder="My Prep Plan" value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
          <button type="submit" disabled={!file || loading} className="btn-primary w-full flex items-center justify-center gap-2">
            {loading ? <><Loader2 size={14} className="animate-spin" />Importing…</> : <><Upload size={14} />Import Tasks</>}
          </button>
        </form>
        <p className="text-xs text-slate-600 text-center">For CSV/XLSX: columns category, title, description, estimated_hours, resources, priority</p>
      </div>
    </div>
  )
}

// ─── Category section ─────────────────────────────────────────────────────────

function CategorySection({ name, tasks, onToggle }: { name: string; tasks: PrepTask[]; onToggle: (id: number, done: boolean) => void }) {
  const [open, setOpen] = useState(true)
  const done = tasks.filter(t => t.completed).length
  const p = pct(done, tasks.length)
  const barColor = p === 100 ? 'bg-emerald-500' : p >= 50 ? 'bg-brand-500' : 'bg-slate-600'

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-slate-900 hover:bg-slate-800/80 transition-colors">
        <BookOpen size={14} className="text-brand-400 shrink-0" />
        <span className="text-sm font-medium text-slate-200 flex-1 text-left">{name}</span>
        <span className="text-xs text-slate-500">{done}/{tasks.length}</span>
        <div className="w-20"><ProgressBar value={p} color={barColor} height="h-1.5" /></div>
        {open ? <ChevronUp size={13} className="text-slate-600" /> : <ChevronDown size={13} className="text-slate-600" />}
      </button>
      {open && (
        <div className="divide-y divide-slate-800/50">
          {tasks.map(task => (
            <div key={task.id} className={`flex items-start gap-3 px-4 py-3 transition-colors ${task.completed ? 'bg-slate-900/30' : 'bg-slate-900/10 hover:bg-slate-800/30'}`}>
              <button type="button" onClick={() => onToggle(task.id, !task.completed)} className="mt-0.5 shrink-0">
                {task.completed
                  ? <CheckCircle2 size={17} className="text-emerald-400" />
                  : <Circle size={17} className="text-slate-600 hover:text-brand-400" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${task.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{task.title}</p>
                {task.description && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{task.description}</p>}
                <div className="flex items-center flex-wrap gap-2 mt-1.5">
                  {task.estimated_hours > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-600"><Clock size={9} />{task.estimated_hours}h</span>
                  )}
                  {task.resources && (
                    <span className="text-[10px] text-brand-500 truncate max-w-xs">{task.resources}</span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium}`}>{task.priority}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Streak dots ──────────────────────────────────────────────────────────────

function StreakDots({ checkins }: { checkins: string[] }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (13 - i)); d.setHours(0,0,0,0)
    const checked = checkins.some(c => new Date(c).toDateString() === d.toDateString())
    const isToday = i === 13
    return { checked, isToday, label: d.toLocaleDateString('en', { weekday: 'short' }) }
  })
  return (
    <div className="flex items-end gap-1">
      {days.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <div className={`w-3 h-3 rounded-full border transition-colors ${
            d.checked ? 'bg-brand-500 border-brand-400' :
            d.isToday ? 'bg-transparent border-brand-600 border-dashed' :
            'bg-slate-800 border-slate-700'
          }`} />
          {i % 3 === 0 && <span className="text-[8px] text-slate-700">{d.label[0]}</span>}
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PrepTrackerPage() {
  const qc = useQueryClient()
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)

  const { data: plans = [] } = useQuery({ queryKey: ['prep-plans'], queryFn: listPrepPlans })
  const { data: plan } = useQuery({
    queryKey: ['prep-plan', activeId],
    queryFn: () => getPrepPlan(activeId!),
    enabled: activeId !== null,
  })

  const deleteMutation = useMutation({
    mutationFn: deletePrepPlan,
    onSuccess: (_, id) => { qc.invalidateQueries({ queryKey: ['prep-plans'] }); if (activeId === id) setActiveId(null) },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ taskId, completed }: { taskId: number; completed: boolean }) => togglePrepTask(taskId, completed),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prep-plan', activeId] }); qc.invalidateQueries({ queryKey: ['prep-plans'] }) },
  })

  async function handleCheckin() {
    if (!activeId || checkingIn || plan?.todayCheckin) return
    setCheckingIn(true)
    try {
      await checkInToday(activeId)
      qc.invalidateQueries({ queryKey: ['prep-plan', activeId] })
    } finally { setCheckingIn(false) }
  }

  function openPlan(id: number) {
    setActiveId(id)
    setShowGenerate(false)
    setShowUpload(false)
  }

  // Group tasks by category
  const categories = plan ? Object.entries(
    plan.tasks.reduce<Record<string, typeof plan.tasks>>((acc, t) => {
      acc[t.category] = acc[t.category] || []
      acc[t.category].push(t)
      return acc
    }, {})
  ) : []

  const totalTasks = plan?.tasks.length ?? 0
  const completedTasks = plan?.tasks.filter(t => t.completed).length ?? 0
  const overallPct = pct(completedTasks, totalTasks)

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">
      {/* Sidebar */}
      <div className="w-64 shrink-0 flex flex-col gap-2">
        <div className="flex gap-1.5">
          <button onClick={() => setShowGenerate(true)} className="btn-primary flex-1 flex items-center gap-1.5 justify-center text-xs py-2">
            <Sparkles size={13} />AI Generate
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600 text-xs transition-colors">
            <Upload size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {plans.length === 0 && (
            <div className="text-center text-slate-600 text-xs pt-8 px-2">
              <Target size={24} className="mx-auto mb-2 text-slate-700" />
              No plans yet. Generate one with AI or upload a file!
            </div>
          )}
          {(plans as PrepPlan[]).map(p => {
            const prog = pct(p.completed_tasks ?? 0, p.total_tasks ?? 0)
            return (
              <button key={p.id} onClick={() => setActiveId(p.id)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors group ${
                  activeId === p.id ? 'bg-brand-500/15 border-brand-500/40 text-brand-200' : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}>
                <div className="flex items-start justify-between gap-1">
                  <p className="text-xs font-medium truncate flex-1">{p.title}</p>
                  <button onClick={e => { e.stopPropagation(); deleteMutation.mutate(p.id) }}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 shrink-0 transition-all">
                    <Trash2 size={11} />
                  </button>
                </div>
                <div className="mt-1.5 space-y-1">
                  <ProgressBar value={prog} color={prog === 100 ? 'bg-emerald-500' : 'bg-brand-500'} height="h-1" />
                  <p className="text-[10px] text-slate-600">{p.completed_tasks}/{p.total_tasks} tasks · {prog}%</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main panel */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {!activeId ? (
          <div className="card h-full flex flex-col items-center justify-center text-center p-8 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
              <TrendingUp size={32} className="text-slate-500" />
            </div>
            <div>
              <p className="text-slate-300 font-medium">Preparation Tracker</p>
              <p className="text-slate-600 text-sm mt-1">Generate an AI study plan or upload your own to start tracking</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowGenerate(true)} className="btn-primary flex items-center gap-2">
                <Sparkles size={14} />Generate with AI
              </button>
              <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 text-sm transition-colors">
                <Upload size={14} />Upload File
              </button>
            </div>
          </div>
        ) : plan ? (
          <>
            {/* Header stats */}
            <div className="card p-5">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-slate-100">{plan.title}</h2>
                  {plan.goal && <p className="text-sm text-slate-400 mt-0.5">{plan.goal}</p>}
                  <div className="flex items-center gap-3 mt-3">
                    {plan.role && <span className="text-xs text-slate-500 flex items-center gap-1"><Target size={11} />{plan.role}</span>}
                    {plan.company && <span className="text-xs text-slate-500">@ {plan.company}</span>}
                    {plan.timeline_weeks > 0 && <span className="text-xs text-slate-500 flex items-center gap-1"><Calendar size={11} />{plan.timeline_weeks}w plan</span>}
                  </div>
                </div>
                {/* Streak */}
                <div className="text-center">
                  <div className="flex items-center gap-1 justify-center">
                    <Flame size={20} className={plan.streak.current > 0 ? 'text-orange-400' : 'text-slate-600'} />
                    <span className={`text-2xl font-bold ${plan.streak.current > 0 ? 'text-orange-400' : 'text-slate-600'}`}>{plan.streak.current}</span>
                  </div>
                  <p className="text-[10px] text-slate-600">day streak</p>
                  {plan.streak.longest > 0 && <p className="text-[10px] text-slate-700">best: {plan.streak.longest}</p>}
                </div>
              </div>

              {/* Overall progress */}
              <div className="mt-4 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Overall Progress</span>
                  <span className="text-slate-300 font-medium">{completedTasks}/{totalTasks} tasks · {overallPct}%</span>
                </div>
                <ProgressBar value={overallPct} color={overallPct === 100 ? 'bg-emerald-500' : 'bg-brand-500'} height="h-2.5" />
              </div>

              {/* Streak dots */}
              <div className="mt-3 flex items-center gap-3">
                <span className="text-[10px] text-slate-600 shrink-0">Last 14 days</span>
                <StreakDots checkins={plan.checkins} />
              </div>

              {/* Check-in */}
              <div className="mt-4">
                {plan.todayCheckin ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800 rounded-lg px-3 py-2">
                    <CheckCircle2 size={13} />Checked in today! Keep going.
                  </div>
                ) : (
                  <button onClick={handleCheckin} disabled={checkingIn}
                    className="flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-orange-500/20 border border-orange-600/40 text-orange-300 hover:bg-orange-500/30 transition-colors disabled:opacity-50">
                    {checkingIn ? <Loader2 size={14} className="animate-spin" /> : <Flame size={14} />}
                    Check in for today
                  </button>
                )}
              </div>
            </div>

            {/* Task categories */}
            {categories.length === 0 ? (
              <div className="card p-8 text-center text-slate-600 text-sm">No tasks found in this plan.</div>
            ) : (
              <div className="space-y-3">
                {categories.map(([name, tasks]) => (
                  <CategorySection
                    key={name} name={name} tasks={tasks}
                    onToggle={(taskId, done) => toggleMutation.mutate({ taskId, completed: done })}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="card p-8 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-slate-500" />
          </div>
        )}
      </div>

      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} onCreate={openPlan} />}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onCreate={openPlan} />}
    </div>
  )
}
