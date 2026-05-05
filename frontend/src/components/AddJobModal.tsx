import { useEffect, useRef, useState } from 'react'
import { X, Plus } from 'lucide-react'
import type { ApplicationStatus } from '../types'
import { STATUS_CONFIG } from '../types'

const ALL_STATUSES = Object.keys(STATUS_CONFIG) as ApplicationStatus[]
const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship']

interface FormData {
  title: string
  company: string
  status: ApplicationStatus
  location: string
  url: string
  salary: string
  job_type: string
  tags: string
  notes: string
}

interface Props {
  onClose: () => void
  onSubmit: (data: FormData) => Promise<void>
}

const EMPTY: FormData = {
  title: '',
  company: '',
  status: 'saved',
  location: '',
  url: '',
  salary: '',
  job_type: 'Full-time',
  tags: '',
  notes: '',
}

export default function AddJobModal({ onClose, onSubmit }: Props) {
  const [form, setForm] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<Partial<FormData>>({})
  const [submitting, setSubmitting] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstInputRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function set(field: keyof FormData, value: string) {
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: Partial<FormData> = {}
    if (!form.title.trim()) newErrors.title = 'Required'
    if (!form.company.trim()) newErrors.company = 'Required'
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return }

    setSubmitting(true)
    try {
      await onSubmit(form)
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Plus size={18} className="text-brand-400" />
            <h2 className="text-base font-semibold text-slate-100">Add Job to Tracker</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Title + Company row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Job Title <span className="text-red-500">*</span>
              </label>
              <input
                ref={firstInputRef}
                type="text"
                className={`input text-sm ${errors.title ? 'border-red-600 focus:ring-red-600' : ''}`}
                placeholder="e.g. Senior Engineer"
                value={form.title}
                onChange={e => set('title', e.target.value)}
              />
              {errors.title && <p className="text-red-500 text-[10px] mt-0.5">{errors.title}</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Company <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className={`input text-sm ${errors.company ? 'border-red-600 focus:ring-red-600' : ''}`}
                placeholder="e.g. Acme Corp"
                value={form.company}
                onChange={e => set('company', e.target.value)}
              />
              {errors.company && <p className="text-red-500 text-[10px] mt-0.5">{errors.company}</p>}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Status</label>
            <select
              className="input text-sm"
              value={form.status}
              onChange={e => set('status', e.target.value)}
            >
              {ALL_STATUSES.map(s => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>

          {/* Location + Job Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Location</label>
              <input
                type="text"
                className="input text-sm"
                placeholder="e.g. Remote / Bangalore"
                value={form.location}
                onChange={e => set('location', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Job Type</label>
              <select
                className="input text-sm"
                value={form.job_type}
                onChange={e => set('job_type', e.target.value)}
              >
                {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* URL + Salary */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Job URL</label>
              <input
                type="url"
                className="input text-sm"
                placeholder="https://..."
                value={form.url}
                onChange={e => set('url', e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Salary</label>
              <input
                type="text"
                className="input text-sm"
                placeholder="e.g. ₹20L – ₹35L"
                value={form.salary}
                onChange={e => set('salary', e.target.value)}
              />
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tags <span className="text-slate-600">(comma-separated)</span></label>
            <input
              type="text"
              className="input text-sm"
              placeholder="e.g. react, node, aws"
              value={form.tags}
              onChange={e => set('tags', e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes</label>
            <textarea
              className="input text-sm resize-none h-20"
              placeholder="Recruiter contact, interview notes…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary px-5 py-2 text-sm disabled:opacity-50"
            >
              {submitting ? 'Adding…' : 'Add to Tracker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
