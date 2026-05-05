import { useState } from 'react'
import { ExternalLink, Trash2, Edit3, Check, X, Calendar, Building2, GripVertical } from 'lucide-react'
import type { Application, ApplicationStatus } from '../types'
import { STATUS_CONFIG } from '../types'

interface Props {
  app: Application
  onStatusChange: (id: number, status: ApplicationStatus) => void
  onNotesChange: (id: number, notes: string) => void
  onDelete: (id: number) => void
  onDragStart: (id: number) => void
  onDragEnd: () => void
  isDragging: boolean
}

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as ApplicationStatus[]

export default function ApplicationCard({
  app, onStatusChange, onNotesChange, onDelete,
  onDragStart, onDragEnd, isDragging,
}: Props) {
  const [editingNotes, setEditingNotes] = useState(false)
  const [noteDraft, setNoteDraft] = useState(app.notes || '')
  const cfg = STATUS_CONFIG[app.status]

  function saveNotes() {
    onNotesChange(app.id, noteDraft)
    setEditingNotes(false)
  }

  const dateStr = app.applied_date
    ? new Date(app.applied_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div
      draggable
      onDragStart={() => onDragStart(app.id)}
      onDragEnd={onDragEnd}
      className={`card p-3 space-y-2 group transition-opacity ${isDragging ? 'opacity-40' : 'opacity-100'}`}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical
          size={14}
          className="text-slate-700 group-hover:text-slate-500 cursor-grab active:cursor-grabbing mt-0.5 shrink-0 transition-colors"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-200 leading-snug truncate">{app.title}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <Building2 size={11} />
                {app.company}
              </p>
            </div>
            <button
              onClick={() => onDelete(app.id)}
              className="text-slate-700 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Status selector */}
          <select
            value={app.status}
            onChange={e => onStatusChange(app.id, e.target.value as ApplicationStatus)}
            className={`mt-2 text-xs font-medium rounded-md px-2 py-1 border w-full focus:outline-none focus:ring-1 focus:ring-brand-500 ${cfg.bg} ${cfg.color} ${cfg.border} bg-opacity-50`}
          >
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>

          {/* Notes */}
          {editingNotes ? (
            <div className="space-y-1 mt-2">
              <textarea
                className="input text-xs resize-none h-16"
                value={noteDraft}
                onChange={e => setNoteDraft(e.target.value)}
                placeholder="Add notes…"
                autoFocus
              />
              <div className="flex gap-1 justify-end">
                <button onClick={() => setEditingNotes(false)} className="text-slate-500 hover:text-slate-300 p-1 rounded"><X size={13} /></button>
                <button onClick={saveNotes} className="text-brand-400 hover:text-brand-300 p-1 rounded"><Check size={13} /></button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => setEditingNotes(true)}
              className="mt-1 text-xs text-slate-600 hover:text-slate-400 cursor-pointer min-h-[20px] transition-colors flex items-start gap-1"
            >
              <Edit3 size={10} className="mt-0.5 shrink-0" />
              <span>{app.notes || 'Add notes…'}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-slate-800 mt-2">
            <span className="text-[10px] text-slate-600 flex items-center gap-0.5">
              <Calendar size={9} />{dateStr}
            </span>
            {app.url && (
              <a
                href={app.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-brand-500 hover:text-brand-400 flex items-center gap-0.5"
              >
                <ExternalLink size={9} />Open
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
