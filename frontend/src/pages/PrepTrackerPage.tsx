import { useState, useRef, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Target, Trash2, CheckCircle2, Circle, ChevronDown, ChevronUp,
  Loader2, Upload, Flame, Clock, Sparkles, X,
  TrendingUp, AlertCircle, ExternalLink, BookOpen, ChevronLeft, ChevronRight,
  Link2, MessageCircle, Send, Bot, User,
} from 'lucide-react'
import {
  listPrepPlans, getPrepPlan, generatePrepPlan, uploadPrepPlan,
  deletePrepPlan, togglePrepTask, checkInToday, chatAboutTask,
} from '../lib/api'
import type { PrepPlan, PrepTask } from '../lib/api'

// ─── constants ────────────────────────────────────────────────────────────────

const CAT_COLORS = [
  { border: 'border-l-blue-500',    dot: 'bg-blue-500',    bar: 'bg-blue-500',    text: 'text-blue-400'    },
  { border: 'border-l-purple-500',  dot: 'bg-purple-500',  bar: 'bg-purple-500',  text: 'text-purple-400'  },
  { border: 'border-l-emerald-500', dot: 'bg-emerald-500', bar: 'bg-emerald-500', text: 'text-emerald-400' },
  { border: 'border-l-orange-500',  dot: 'bg-orange-500',  bar: 'bg-orange-500',  text: 'text-orange-400'  },
  { border: 'border-l-pink-500',    dot: 'bg-pink-500',    bar: 'bg-pink-500',    text: 'text-pink-400'    },
  { border: 'border-l-cyan-500',    dot: 'bg-cyan-500',    bar: 'bg-cyan-500',    text: 'text-cyan-400'    },
  { border: 'border-l-amber-500',   dot: 'bg-amber-500',   bar: 'bg-amber-500',   text: 'text-amber-400'   },
  { border: 'border-l-rose-500',    dot: 'bg-rose-500',    bar: 'bg-rose-500',    text: 'text-rose-400'    },
]

const PRIORITY_CONFIG = {
  high:   { label: 'High',   cls: 'bg-red-900/40 text-red-300 border-red-700/60'         },
  medium: { label: 'Medium', cls: 'bg-yellow-900/30 text-yellow-300 border-yellow-700/50' },
  low:    { label: 'Low',    cls: 'bg-slate-800 text-slate-400 border-slate-700'          },
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function pct(done: number, total: number) {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

function isUrl(s: string) {
  try { new URL(s); return s.startsWith('http'); } catch { return false }
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, color = 'bg-brand-500', height = 'h-1.5' }: {
  value: number; color?: string; height?: string
}) {
  return (
    <div className={`w-full ${height} bg-slate-800 rounded-full overflow-hidden`}>
      <div
        className={`h-full ${color} rounded-full transition-all duration-700 ease-out`}
        style={{ width: `${value}%` }}
      />
    </div>
  )
}

// ─── ResourceLinks ────────────────────────────────────────────────────────────
// Split by comma/semicolon/newline to get individual resource items.
// Each item: if it's a URL → direct link; otherwise → Google search link.

function splitResourceItems(text: string): string[] {
  return text.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean)
}

function ResourceLinks({ text }: { text: string }) {
  if (!text) return null
  const items = splitResourceItems(text)

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((item, i) => {
        const url = isUrl(item)
          ? item
          : `https://www.google.com/search?q=${encodeURIComponent(item)}`
        const label = isUrl(item) ? hostname(item) : item
        const icon = isUrl(item) ? ExternalLink : Link2
        const Icon = icon
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-brand-500/10 border border-brand-500/30 text-brand-400 hover:bg-brand-500/20 hover:text-brand-300 transition-colors"
          >
            <Icon size={10} />
            {label}
          </a>
        )
      })}
    </div>
  )
}

// ─── TaskChatModal ────────────────────────────────────────────────────────────

interface ChatMessage { role: 'user' | 'assistant'; content: string }

function TaskChatModal({ task, onClose }: { task: PrepTask; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Seed opening message from the AI
  useEffect(() => {
    async function seed() {
      setSending(true)
      try {
        const seedMsg: ChatMessage = {
          role: 'user',
          content: `I want to learn about: ${task.title}. Can you give me a quick overview and tell me what I should focus on?`,
        }
        setMessages([seedMsg])
        const reply = await chatAboutTask([seedMsg], {
          title: task.title,
          description: task.description,
          resources: task.resources,
        })
        setMessages([seedMsg, { role: 'assistant', content: reply }])
      } catch {
        setError('Could not start chat. Is Ollama running?')
      } finally { setSending(false) }
    }
    seed()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setError('')
    const userMsg: ChatMessage = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setSending(true)
    try {
      const reply = await chatAboutTask(next, {
        title: task.title,
        description: task.description,
        resources: task.resources,
      })
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch {
      setError('Reply failed. Is Ollama running?')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl flex flex-col" style={{ height: '80vh' }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center">
            <Bot size={15} className="text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-200 truncate">{task.title}</p>
            <p className="text-[10px] text-slate-500">AI tutor · powered by Ollama</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={17} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                msg.role === 'user' ? 'bg-brand-500/30' : 'bg-slate-700'
              }`}>
                {msg.role === 'user'
                  ? <User size={13} className="text-brand-300" />
                  : <Bot size={13} className="text-slate-300" />
                }
              </div>
              <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-brand-500/20 text-brand-100 rounded-tr-sm'
                  : 'bg-slate-800 text-slate-200 rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center">
                <Bot size={13} className="text-slate-300" />
              </div>
              <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                <Loader2 size={14} className="text-slate-400 animate-spin" />
              </div>
            </div>
          )}
          {error && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <AlertCircle size={12} />{error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Resources strip */}
        {task.resources && (
          <div className="px-4 py-2 border-t border-slate-800/60 bg-slate-900/40 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-slate-600 font-medium uppercase tracking-wide shrink-0">Resources:</span>
              <ResourceLinks text={task.resources} />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-slate-800 p-3 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              placeholder="Ask a question… (Enter to send)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              style={{ maxHeight: '100px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="btn-primary p-2.5 shrink-0 disabled:opacity-40"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

function TaskCard({ task, onToggle, accentText }: {
  task: PrepTask
  onToggle: (id: number, done: boolean) => void
  accentText: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const hasExpandable = !!(task.description)
  const priority = PRIORITY_CONFIG[task.priority] ?? PRIORITY_CONFIG.medium

  return (
    <>
    <div className={`group rounded-xl border transition-all duration-200 ${
      task.completed
        ? 'bg-slate-900/30 border-slate-800/60'
        : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/60'
    }`}>
      {/* Main row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => onToggle(task.id, !task.completed)}
          className="mt-0.5 shrink-0 transition-transform hover:scale-110"
        >
          {task.completed
            ? <CheckCircle2 size={18} className="text-emerald-400" />
            : <Circle size={18} className="text-slate-600 group-hover:text-brand-400 transition-colors" />
          }
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-semibold leading-snug ${
              task.completed ? 'text-slate-500 line-through' : 'text-slate-100'
            }`}>
              {task.title}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {task.estimated_hours > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-slate-500 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded-md">
                  <Clock size={9} />{task.estimated_hours}h
                </span>
              )}
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border ${priority.cls}`}>
                {priority.label}
              </span>
            </div>
          </div>

          {/* Description preview / expanded */}
          {task.description && !expanded && (
            <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{task.description}</p>
          )}
          {expanded && task.description && (
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{task.description}</p>
          )}

          {/* Resources — always visible */}
          {task.resources && <ResourceLinks text={task.resources} />}

          {/* Footer actions */}
          <div className="flex items-center gap-3 mt-2">
            {hasExpandable && (
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className={`flex items-center gap-1 text-[10px] font-medium transition-colors ${accentText} opacity-70 hover:opacity-100`}
              >
                {expanded ? <><ChevronUp size={10} />Less</> : <><ChevronDown size={10} />More</>}
              </button>
            )}
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-brand-400 transition-colors ml-auto"
            >
              <MessageCircle size={11} />Discuss with AI
            </button>
          </div>
        </div>
      </div>
    </div>
    {chatOpen && <TaskChatModal task={task} onClose={() => setChatOpen(false)} />}
    </>
  )
}

// ─── CategorySection ─────────────────────────────────────────────────────────

function CategorySection({ name, tasks, colorIdx, onToggle }: {
  name: string
  tasks: PrepTask[]
  colorIdx: number
  onToggle: (id: number, done: boolean) => void
}) {
  const [open, setOpen] = useState(true)
  const col = CAT_COLORS[colorIdx % CAT_COLORS.length]
  const done = tasks.filter(t => t.completed).length
  const p = pct(done, tasks.length)

  return (
    <div className={`rounded-xl border border-slate-800 border-l-4 ${col.border} overflow-hidden`}>
      {/* Category header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 bg-slate-900/80 hover:bg-slate-800/60 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full shrink-0 ${col.dot}`} />
        <span className="text-sm font-semibold text-slate-200 flex-1 text-left">{name}</span>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-24">
              <ProgressBar value={p} color={col.bar} height="h-1.5" />
            </div>
            <span className="text-[11px] font-medium text-slate-400 w-8 text-right">{p}%</span>
          </div>
          <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
            {done}/{tasks.length}
          </span>
          {open
            ? <ChevronUp size={14} className="text-slate-500 shrink-0" />
            : <ChevronDown size={14} className="text-slate-500 shrink-0" />
          }
        </div>
      </button>

      {/* Task list */}
      {open && (
        <div className="p-3 space-y-2 bg-slate-900/30">
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onToggle={onToggle}
              accentText={col.text}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MiniCalendar ─────────────────────────────────────────────────────────────

function MiniCalendar({ checkins }: { checkins: string[] }) {
  const [offset, setOffset] = useState(0) // 0 = current month, -1 = prev, etc.

  const checkinSet = useMemo(
    () => new Set(checkins.map(c => {
      const d = new Date(c); d.setHours(0, 0, 0, 0); return d.toDateString()
    })),
    [checkins]
  )

  const now = new Date()
  const viewDate = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const monthLabel = viewDate.toLocaleDateString('en', { month: 'long', year: 'numeric' })

  const cells: ({ day: number; isToday: boolean; checked: boolean; isPast: boolean } | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(year, month, i + 1); d.setHours(0, 0, 0, 0)
      const today = new Date(now); today.setHours(0, 0, 0, 0)
      return {
        day: i + 1,
        isToday: d.toDateString() === today.toDateString(),
        checked: checkinSet.has(d.toDateString()),
        isPast: d <= today,
      }
    }),
  ]

  return (
    <div className="card p-4">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setOffset(o => o - 1)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-slate-300">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setOffset(o => o + 1)}
          disabled={offset >= 0}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[9px] font-semibold text-slate-600 py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((cell, i) =>
          cell === null ? (
            <div key={`pad-${i}`} />
          ) : (
            <div
              key={cell.day}
              className={`aspect-square flex items-center justify-center rounded-lg text-[11px] font-medium transition-colors ${
                cell.checked
                  ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30'
                  : cell.isToday
                  ? 'ring-1 ring-brand-500 text-brand-400 bg-brand-500/10'
                  : cell.isPast
                  ? 'text-slate-500 hover:bg-slate-800 cursor-default'
                  : 'text-slate-700'
              }`}
            >
              {cell.day}
            </div>
          )
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-800">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-2.5 h-2.5 rounded-sm bg-brand-500" />
          Checked in
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
          <div className="w-2.5 h-2.5 rounded-sm ring-1 ring-brand-500" />
          Today
        </div>
      </div>
    </div>
  )
}

// ─── StreakWidget ─────────────────────────────────────────────────────────────

function StreakWidget({ streak, checkins, todayCheckin, onCheckin, checkingIn }: {
  streak: { current: number; longest: number }
  checkins: string[]
  todayCheckin: boolean
  onCheckin: () => void
  checkingIn: boolean
}) {
  // Last 7 days for mini heatmap
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const set = new Set(checkins.map(c => { const d = new Date(c); d.setHours(0,0,0,0); return d.toDateString() }))

  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (6 - i))
    return {
      label: d.toLocaleDateString('en', { weekday: 'short' }).slice(0, 2),
      checked: set.has(d.toDateString()),
      isToday: i === 6,
    }
  })

  return (
    <div className="card p-4 space-y-4">
      {/* Streak numbers */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            streak.current > 0 ? 'bg-orange-500/20 border border-orange-600/30' : 'bg-slate-800 border border-slate-700'
          }`}>
            <Flame size={20} className={streak.current > 0 ? 'text-orange-400' : 'text-slate-600'} />
          </div>
          <div>
            <p className={`text-2xl font-bold leading-none ${streak.current > 0 ? 'text-orange-400' : 'text-slate-600'}`}>
              {streak.current}
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">day streak</p>
          </div>
        </div>
        {streak.longest > 0 && (
          <div className="text-right">
            <p className="text-sm font-bold text-slate-400">{streak.longest}</p>
            <p className="text-[10px] text-slate-600">best</p>
          </div>
        )}
      </div>

      {/* 7-day dots */}
      <div className="flex items-end justify-between gap-1">
        {week.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1 flex-1">
            <div className={`w-full aspect-square rounded-md border transition-colors ${
              d.checked
                ? 'bg-brand-500 border-brand-400'
                : d.isToday
                ? 'border-brand-600 border-dashed bg-brand-500/5'
                : 'bg-slate-800 border-slate-700'
            }`} />
            <span className="text-[9px] text-slate-700">{d.label}</span>
          </div>
        ))}
      </div>

      {/* Check-in button */}
      {todayCheckin ? (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/60 rounded-xl px-3 py-2.5 font-medium">
          <CheckCircle2 size={14} />
          Checked in today!
        </div>
      ) : (
        <button
          onClick={onCheckin}
          disabled={checkingIn}
          className="w-full flex items-center justify-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl bg-orange-500/20 border border-orange-600/40 text-orange-300 hover:bg-orange-500/30 transition-colors disabled:opacity-50"
        >
          {checkingIn ? <Loader2 size={14} className="animate-spin" /> : <Flame size={14} />}
          Check in for today
        </button>
      )}
    </div>
  )
}

// ─── GenerateModal ────────────────────────────────────────────────────────────

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
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Sparkles size={17} className="text-brand-400" />Generate Prep Plan
          </h2>
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

// ─── UploadModal ──────────────────────────────────────────────────────────────

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
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Upload size={17} className="text-brand-400" />Upload Plan
          </h2>
          <button onClick={onClose}><X size={18} className="text-slate-500 hover:text-slate-300" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
              file ? 'border-brand-500/50 bg-brand-500/5' : 'border-slate-700 hover:border-slate-500'
            }`}
          >
            <input
              ref={fileRef} type="file" className="hidden"
              accept=".json,.csv,.xlsx,.xls,.docx,.txt"
              onChange={e => {
                setFile(e.target.files?.[0] ?? null)
                setTitle(e.target.files?.[0]?.name?.replace(/\.[^.]+$/, '') ?? '')
              }}
            />
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
      </div>
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
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['prep-plans'] })
      if (activeId === id) setActiveId(null)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ taskId, completed }: { taskId: number; completed: boolean }) =>
      togglePrepTask(taskId, completed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prep-plan', activeId] })
      qc.invalidateQueries({ queryKey: ['prep-plans'] })
    },
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

  const categories = useMemo(() => {
    if (!plan) return []
    const map = new Map<string, PrepTask[]>()
    for (const t of plan.tasks) {
      const arr = map.get(t.category) ?? []
      arr.push(t)
      map.set(t.category, arr)
    }
    return Array.from(map.entries())
  }, [plan])

  const totalTasks = plan?.tasks.length ?? 0
  const completedTasks = plan?.tasks.filter(t => t.completed).length ?? 0
  const overallPct = pct(completedTasks, totalTasks)

  return (
    <div className="flex gap-4 h-[calc(100vh-7rem)]">

      {/* ── Left sidebar: plan list ── */}
      <div className="w-60 shrink-0 flex flex-col gap-2">
        <div className="flex gap-1.5">
          <button
            onClick={() => setShowGenerate(true)}
            className="btn-primary flex-1 flex items-center gap-1.5 justify-center text-xs py-2"
          >
            <Sparkles size={13} />AI Generate
          </button>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600 text-xs transition-colors"
          >
            <Upload size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
          {plans.length === 0 && (
            <div className="text-center text-slate-600 text-xs pt-10 px-2 space-y-2">
              <Target size={28} className="mx-auto text-slate-700" />
              <p>No plans yet. Generate one with AI or upload a file.</p>
            </div>
          )}
          {(plans as PrepPlan[]).map(p => {
            const prog = pct(p.completed_tasks ?? 0, p.total_tasks ?? 0)
            const isActive = activeId === p.id
            return (
              <button
                key={p.id}
                onClick={() => setActiveId(p.id)}
                className={`w-full text-left px-3 py-3 rounded-xl border transition-all duration-150 group ${
                  isActive
                    ? 'bg-brand-500/12 border-brand-500/40'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-2">
                  <p className={`text-xs font-semibold truncate flex-1 leading-snug ${isActive ? 'text-brand-200' : 'text-slate-300'}`}>
                    {p.title}
                  </p>
                  <button
                    onClick={e => { e.stopPropagation(); deleteMutation.mutate(p.id) }}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 shrink-0 transition-all"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                <ProgressBar value={prog} color={prog === 100 ? 'bg-emerald-500' : 'bg-brand-500'} height="h-1" />
                <p className="text-[10px] text-slate-600 mt-1.5">
                  {p.completed_tasks ?? 0}/{p.total_tasks ?? 0} tasks · {prog}%
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Centre: tasks ── */}
      <div className="flex-1 overflow-y-auto min-w-0">
        {!activeId ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-5 card">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
              <TrendingUp size={30} className="text-slate-500" />
            </div>
            <div>
              <p className="text-slate-200 font-semibold text-base">Preparation Tracker</p>
              <p className="text-slate-500 text-sm mt-1 max-w-xs">
                Generate an AI study plan tailored to your role, or upload your own from a file.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowGenerate(true)} className="btn-primary flex items-center gap-2">
                <Sparkles size={14} />Generate with AI
              </button>
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 text-sm transition-colors"
              >
                <Upload size={14} />Upload File
              </button>
            </div>
          </div>
        ) : !plan ? (
          <div className="h-32 flex items-center justify-center">
            <Loader2 size={20} className="animate-spin text-slate-500" />
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            {/* Plan header */}
            <div className="card p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-slate-100 leading-tight">{plan.title}</h2>
                  {plan.goal && (
                    <p className="text-sm text-slate-400 mt-1 leading-relaxed">{plan.goal}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {plan.role && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                        <Target size={10} />{plan.role}
                      </span>
                    )}
                    {plan.company && (
                      <span className="text-[11px] text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                        @ {plan.company}
                      </span>
                    )}
                    {plan.timeline_weeks > 0 && (
                      <span className="text-[11px] text-slate-500 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full">
                        {plan.timeline_weeks} week plan
                      </span>
                    )}
                    <span className="text-[11px] text-slate-600 bg-slate-800/50 border border-slate-800 px-2 py-0.5 rounded-full capitalize">
                      {plan.source} source
                    </span>
                  </div>
                </div>

                {/* Circular-style progress */}
                <div className="shrink-0 text-center">
                  <div className="relative w-16 h-16">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="26" fill="none" stroke="rgb(30,41,59)" strokeWidth="6" />
                      <circle
                        cx="32" cy="32" r="26" fill="none"
                        stroke={overallPct === 100 ? '#10b981' : '#6366f1'}
                        strokeWidth="6"
                        strokeDasharray={`${2 * Math.PI * 26}`}
                        strokeDashoffset={`${2 * Math.PI * 26 * (1 - overallPct / 100)}`}
                        strokeLinecap="round"
                        className="transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-slate-100">{overallPct}%</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">{completedTasks}/{totalTasks}</p>
                </div>
              </div>

              {/* Category progress bars */}
              {categories.length > 0 && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {categories.map(([name, tasks], i) => {
                    const col = CAT_COLORS[i % CAT_COLORS.length]
                    const d = tasks.filter(t => t.completed).length
                    const p = pct(d, tasks.length)
                    return (
                      <div key={name} className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${col.dot}`} />
                        <span className="text-[11px] text-slate-500 truncate flex-1">{name}</span>
                        <div className="w-16 shrink-0">
                          <ProgressBar value={p} color={col.bar} height="h-1" />
                        </div>
                        <span className="text-[10px] text-slate-600 w-6 text-right">{p}%</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Category sections */}
            {categories.length === 0 ? (
              <div className="card p-8 text-center text-slate-600 text-sm">
                <BookOpen size={24} className="mx-auto mb-2 opacity-40" />
                No tasks found in this plan.
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map(([name, tasks], i) => (
                  <CategorySection
                    key={name}
                    name={name}
                    tasks={tasks}
                    colorIdx={i}
                    onToggle={(taskId, done) => toggleMutation.mutate({ taskId, completed: done })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Right panel: calendar + streak ── */}
      <div className="w-64 shrink-0 flex flex-col gap-3 overflow-y-auto">
        {plan ? (
          <>
            <StreakWidget
              streak={plan.streak}
              checkins={plan.checkins}
              todayCheckin={plan.todayCheckin}
              onCheckin={handleCheckin}
              checkingIn={checkingIn}
            />
            <MiniCalendar checkins={plan.checkins} />
          </>
        ) : (
          <div className="card p-5 text-center text-slate-700 text-xs space-y-2">
            <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-800 flex items-center justify-center mx-auto">
              <Flame size={18} className="text-slate-700" />
            </div>
            <p>Select a plan to see your streak and check-in calendar</p>
          </div>
        )}
      </div>

      {showGenerate && <GenerateModal onClose={() => setShowGenerate(false)} onCreate={openPlan} />}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onCreate={openPlan} />}
    </div>
  )
}
