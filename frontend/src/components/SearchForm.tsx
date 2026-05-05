import { useState } from 'react'
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { SearchFilters } from '../types'

const QUICK_TAGS = [
  'AWS', 'Azure', 'GCP', 'Kubernetes', 'Terraform', 'Docker',
  'Ansible', 'CI/CD', 'SRE', 'Platform Engineer', 'DevOps',
  'Helm', 'ArgoCD', 'GitOps', 'Prometheus', 'Grafana', 'Linux',
]

const JOB_TYPES = ['Full-time', 'Contract', 'Part-time', 'Freelance']
const EXPERIENCE_LEVELS = ['Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal']

interface Props {
  onSearch: (filters: Partial<SearchFilters>) => void
  loading: boolean
}

export default function SearchForm({ onSearch, loading }: Props) {
  const [keywordInput, setKeywordInput] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>(['AWS', 'Kubernetes', 'Terraform'])
  const [jobType, setJobType] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [location, setLocation] = useState('')
  const [remote, setRemote] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const keywords = keywordInput
      .split(',')
      .map(k => k.trim())
      .filter(Boolean)

    onSearch({ keywords, tags: selectedTags, jobType, experienceLevel, location, remote })
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4">
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            className="input pl-9"
            placeholder="Keywords: terraform, kubernetes, aws... (comma separated)"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary flex items-center gap-2 whitespace-nowrap" disabled={loading}>
          <Search size={15} />
          {loading ? 'Searching…' : 'Search Jobs'}
        </button>
      </div>

      {/* Quick tag pills */}
      <div>
        <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Quick filters</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`badge cursor-pointer transition-colors border ${
                selectedTags.includes(tag)
                  ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
              }`}
            >
              {selectedTags.includes(tag) && <X size={10} className="mr-1" />}
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(v => !v)}
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        Advanced filters
      </button>

      {showAdvanced && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Job Type</label>
            <select
              className="input"
              value={jobType}
              onChange={e => setJobType(e.target.value)}
            >
              <option value="">Any</option>
              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Experience Level</label>
            <select
              className="input"
              value={experienceLevel}
              onChange={e => setExperienceLevel(e.target.value)}
            >
              <option value="">Any</option>
              {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Location</label>
            <input
              className="input"
              placeholder="e.g. Remote, US, UK"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 pt-3">
            <button
              type="button"
              onClick={() => setRemote(v => !v)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${remote ? 'bg-brand-500' : 'bg-slate-700'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${remote ? 'translate-x-5' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm text-slate-400">Remote only</span>
          </div>
        </div>
      )}
    </form>
  )
}
