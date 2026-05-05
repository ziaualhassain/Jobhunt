import { useState } from 'react'
import { Search, X, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
import type { SearchFilters } from '../types'

const TAG_GROUPS = [
  {
    label: 'Roles',
    tags: ['Frontend', 'Backend', 'Full Stack', 'DevOps', 'Mobile', 'Data Engineer', 'ML / AI', 'QA', 'Platform Engineer', 'SRE'],
  },
  {
    label: 'Languages',
    tags: ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C#', 'PHP', 'Ruby', 'Swift', 'Kotlin'],
  },
  {
    label: 'Frameworks & Tools',
    tags: ['React', 'Vue', 'Angular', 'Next.js', 'Node.js', 'Django', 'Spring', '.NET', 'Laravel', 'Flutter'],
  },
  {
    label: 'Cloud & Infra',
    tags: ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'PostgreSQL', 'MongoDB', 'Redis'],
  },
]

const JOB_TYPES = ['Full-time', 'Contract', 'Part-time', 'Freelance']
const EXPERIENCE_LEVELS = ['Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal']

interface Props {
  onSearch: (filters: Partial<SearchFilters>) => void
  loading: boolean
  initialFilters?: Partial<SearchFilters>
}

export default function SearchForm({ onSearch, loading, initialFilters }: Props) {
  const [keywordInput, setKeywordInput] = useState(initialFilters?.keywords?.join(', ') ?? '')
  const [selectedTags, setSelectedTags] = useState<string[]>(initialFilters?.tags ?? [])
  const [jobType, setJobType] = useState(initialFilters?.jobType ?? '')
  const [experienceLevel, setExperienceLevel] = useState(initialFilters?.experienceLevel ?? '')
  const [location, setLocation] = useState(initialFilters?.location ?? '')
  const [remote, setRemote] = useState(initialFilters?.remote ?? true)
  const [showFilters, setShowFilters] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const keywords = keywordInput.split(',').map(k => k.trim()).filter(Boolean)
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
            placeholder="e.g. React developer, Java backend, Python data engineer…"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors ${
            showFilters || selectedTags.length > 0
              ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
          }`}
          title="Toggle filters"
        >
          <SlidersHorizontal size={15} />
          {selectedTags.length > 0 && (
            <span className="text-xs font-medium">{selectedTags.length}</span>
          )}
        </button>
        <button type="submit" className="btn-primary flex items-center gap-2 whitespace-nowrap" disabled={loading}>
          <Search size={15} />
          {loading ? 'Searching…' : 'Search Jobs'}
        </button>
      </div>

      {/* Grouped tag pills — shown only when filter panel is open */}
      {showFilters && (
        <div className="space-y-2.5 pt-1 border-t border-slate-800">
          {TAG_GROUPS.map(group => (
            <div key={group.label}>
              <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-1.5">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.tags.map(tag => (
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
                    {selectedTags.includes(tag) && <X size={9} className="mr-1" />}
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Clear {selectedTags.length} selected filter{selectedTags.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      )}

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
            <select className="input" value={jobType} onChange={e => setJobType(e.target.value)}>
              <option value="">Any</option>
              {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Experience Level</label>
            <select className="input" value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)}>
              <option value="">Any</option>
              {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Location</label>
            <input
              className="input"
              placeholder="e.g. Remote, US, UK, Berlin"
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
