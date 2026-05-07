import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MessageSquare, Plus, Trash2, Send, Loader2, Bot, User,
  ChevronRight, Briefcase, Building2, X, TrendingUp, CheckCircle2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  listInterviewSessions, createInterviewSession,
  getInterviewSession, sendInterviewMessage, deleteInterviewSession,
  addPlanFromMessage,
} from '../lib/api'
import type { InterviewMessage } from '../lib/api'

function looksLikePlan(text: string): boolean {
  return (
    /week\s*\d/i.test(text) ||
    /\bday\s+\d+\b/i.test(text) ||
    /phase\s+\d/i.test(text) ||
    /(study|prep(aration)?|learning|interview)\s+plan/i.test(text) ||
    /\broadmap\b/i.test(text) ||
    /week[- ]by[- ]week/i.test(text) ||
    (/\bweek\b/i.test(text) && /\b(study|practice|learn|review|focus)\b/i.test(text))
  )
}

const MODE_OPTIONS = [
  { value: 'mock',      label: 'Mock Interview',     desc: 'Full interview simulation with Q&A' },
  { value: 'practice',  label: 'Practice Q&A',        desc: 'Practice questions with feedback' },
  { value: 'tips',      label: 'Interview Tips',       desc: 'Strategies and preparation advice' },
  { value: 'technical', label: 'Technical Prep',       desc: 'Coding & system design focus' },
]

const MODE_LABELS: Record<string, string> = {
  mock: 'Mock Interview', practice: 'Practice Q&A',
  tips: 'Interview Tips', technical: 'Technical Prep',
}

function NewSessionModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (data: { title: string; company: string; role: string; mode: string }) => void
}) {
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [mode, setMode] = useState('mock')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!role.trim()) return
    const title = company.trim() ? `${role.trim()} @ ${company.trim()}` : role.trim()
    onCreate({ title, company: company.trim(), role: role.trim(), mode })
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">New Interview Session</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Target Role <span className="text-red-400">*</span></label>
            <div className="relative">
              <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input pl-8" placeholder="e.g. Senior Backend Engineer"
                value={role} onChange={e => setRole(e.target.value)} required autoFocus
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Company <span className="text-slate-600">(optional)</span></label>
            <div className="relative">
              <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input pl-8" placeholder="e.g. Google"
                value={company} onChange={e => setCompany(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Mode</label>
            <div className="grid grid-cols-2 gap-2">
              {MODE_OPTIONS.map(opt => (
                <button
                  key={opt.value} type="button"
                  onClick={() => setMode(opt.value)}
                  className={`p-2.5 rounded-xl border text-left transition-colors ${
                    mode === opt.value
                      ? 'bg-brand-500/20 border-brand-500/50 text-brand-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  <p className="text-xs font-medium">{opt.label}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={!role.trim()}>
            Start Session
          </button>
        </form>
      </div>
    </div>
  )
}

function MessageBubble({ msg, onAddToTracker, addingPlan, addedPlan }: {
  msg: InterviewMessage
  onAddToTracker?: (content: string) => void
  addingPlan?: boolean
  addedPlan?: boolean
}) {
  const isUser = msg.role === 'user'
  const showAddButton = !isUser && looksLikePlan(msg.content)

  return (
    <div className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
        isUser ? 'bg-brand-500/30' : 'bg-slate-700'
      }`}>
        {isUser ? <User size={13} className="text-brand-300" /> : <Bot size={13} className="text-slate-300" />}
      </div>
      <div className="max-w-[80%] flex flex-col gap-1.5">
        <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-brand-500/20 text-brand-100 rounded-tr-sm'
            : 'bg-slate-800 text-slate-200 rounded-tl-sm'
        }`}>
          {msg.content}
        </div>
        {showAddButton && (
          <button
            type="button"
            onClick={() => onAddToTracker?.(msg.content)}
            disabled={addingPlan || addedPlan}
            className={`self-start flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors ${
              addedPlan
                ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400 cursor-default'
                : 'bg-brand-500/15 border-brand-500/30 text-brand-400 hover:bg-brand-500/25'
            }`}
          >
            {addingPlan ? (
              <><Loader2 size={11} className="animate-spin" />Adding…</>
            ) : addedPlan ? (
              <><CheckCircle2 size={11} />Added! Opening tracker…</>
            ) : (
              <><TrendingUp size={11} />Add to Prep Tracker</>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

export default function InterviewCoachPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [activeId, setActiveId] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [addingPlan, setAddingPlan] = useState<number | null>(null)
  const [addedPlan, setAddedPlan] = useState<number | null>(null)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { data: sessions = [] } = useQuery({
    queryKey: ['interview-sessions'],
    queryFn: listInterviewSessions,
  })

  const { data: session } = useQuery({
    queryKey: ['interview-session', activeId],
    queryFn: () => getInterviewSession(activeId!),
    enabled: activeId !== null,
  })

  const createMutation = useMutation({
    mutationFn: createInterviewSession,
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['interview-sessions'] })
      setActiveId(s.id)
      setShowNew(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteInterviewSession,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['interview-sessions'] })
      if (activeId === id) setActiveId(null)
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session?.messages])

  async function handleSend() {
    if (!input.trim() || !activeId || sending) return
    const text = input.trim()
    setInput('')
    setSending(true)
    setAiError(null)
    try {
      await sendInterviewMessage(activeId, text)
      qc.invalidateQueries({ queryKey: ['interview-session', activeId] })
      qc.invalidateQueries({ queryKey: ['interview-sessions'] })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      setAiError(msg || 'Failed to get a response. Is Ollama running?')
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  async function handleAddToTracker(content: string, msgId: number) {
    if (addingPlan === msgId) return
    setAddingPlan(msgId)
    try {
      await addPlanFromMessage({
        content,
        role: session?.role || '',
        company: session?.company || '',
      })
      qc.invalidateQueries({ queryKey: ['prep-plans'] })
      setAddedPlan(msgId)
      setTimeout(() => navigate('/prep-tracker'), 1200)
    } catch {
      // silently fail — button just re-enables
    } finally {
      setAddingPlan(null)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function openSession(id: number) {
    setActiveId(id)
    setMobileView('chat')
  }

  const sessionListPanel = (
    <div className="flex flex-col gap-2 h-full">
      <button
        onClick={() => setShowNew(true)}
        className="btn-primary flex items-center gap-2 justify-center w-full shrink-0"
      >
        <Plus size={14} /> New Session
      </button>

      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {sessions.length === 0 && (
          <div className="text-center text-slate-600 text-xs pt-8 px-2">
            <MessageSquare size={24} className="mx-auto mb-2 text-slate-700" />
            No sessions yet. Start a new one!
          </div>
        )}
        {sessions.map(s => (
          <button
            key={s.id}
            onClick={() => openSession(s.id)}
            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors group relative ${
              activeId === s.id
                ? 'bg-brand-500/15 border-brand-500/40 text-brand-200'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div className="flex items-start justify-between gap-1">
              <p className="text-xs font-medium truncate flex-1">{s.title}</p>
              <button
                onClick={e => { e.stopPropagation(); deleteMutation.mutate(s.id) }}
                className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-slate-600">{MODE_LABELS[s.mode] ?? s.mode}</span>
              {(s.message_count ?? 0) > 0 && (
                <span className="text-[10px] text-slate-700">· {s.message_count} msgs</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )

  const chatPanel = (
    <div className="flex-1 flex flex-col card overflow-hidden min-h-0">
      {!activeId ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
            <Bot size={32} className="text-slate-500" />
          </div>
          <div>
            <p className="text-slate-300 font-medium">Interview Coach</p>
            <p className="text-slate-600 text-sm mt-1">Select a session or start a new one to begin</p>
          </div>
          <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14} /> New Session <ChevronRight size={14} />
          </button>
        </div>
      ) : (
        <>
          {/* Header */}
          {session && (
            <div className="border-b border-slate-800 px-4 py-3 flex items-center gap-3 shrink-0">
              {/* Back to list — mobile only */}
              <button
                onClick={() => setMobileView('list')}
                className="lg:hidden text-slate-500 hover:text-slate-300 shrink-0"
                aria-label="Back to sessions"
              >
                <ChevronRight size={18} className="rotate-180" />
              </button>
              <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
                <Bot size={16} className="text-brand-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{session.title}</p>
                <p className="text-xs text-slate-500">{MODE_LABELS[session.mode] ?? session.mode}</p>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {session?.messages.length === 0 && (
              <div className="text-center text-slate-600 text-sm pt-8">
                <p>Say hi or ask your first question to get started.</p>
              </div>
            )}
            {session?.messages.map(msg => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onAddToTracker={
                  addedPlan === msg.id ? undefined :
                  addingPlan === msg.id ? undefined :
                  (content) => handleAddToTracker(content, msg.id)
                }
                addingPlan={addingPlan === msg.id}
                addedPlan={addedPlan === msg.id}
              />
            ))}
            {sending && (
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                  <Bot size={13} className="text-slate-300" />
                </div>
                <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  <Loader2 size={14} className="text-slate-400 animate-spin" />
                </div>
              </div>
            )}
            {aiError && (
              <div className="text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
                {aiError}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-800 p-3 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                rows={1}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
                placeholder="Type your message… (Enter to send)"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{ maxHeight: '120px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="btn-primary p-2.5 shrink-0 disabled:opacity-40"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )

  return (
    <div className="h-[calc(100vh-7rem)]">
      {/* Desktop: side-by-side */}
      <div className="hidden lg:flex gap-4 h-full">
        <div className="w-64 shrink-0">{sessionListPanel}</div>
        {chatPanel}
      </div>

      {/* Mobile: single-panel toggle */}
      <div className="flex lg:hidden flex-col h-full">
        {mobileView === 'list' ? (
          <div className="flex-1 overflow-hidden">{sessionListPanel}</div>
        ) : (
          chatPanel
        )}
      </div>

      {showNew && (
        <NewSessionModal
          onClose={() => setShowNew(false)}
          onCreate={data => createMutation.mutate(data)}
        />
      )}
    </div>
  )
}
