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

export const REGIONS = [
  { value: 'Remote',    label: 'Remote',     flag: '🌐' },
  { value: 'India',     label: 'India',      flag: '🇮🇳' },
  { value: 'US',        label: 'US',         flag: '🇺🇸' },
  { value: 'UK',        label: 'UK',         flag: '🇬🇧' },
  { value: 'UAE',       label: 'UAE',        flag: '🇦🇪' },
  { value: 'Europe',    label: 'Europe',     flag: '🇪🇺' },
  { value: 'Canada',    label: 'Canada',     flag: '🇨🇦' },
  { value: 'Australia', label: 'Australia',  flag: '🇦🇺' },
  { value: 'Singapore', label: 'Singapore',  flag: '🇸🇬' },
]

interface Props {
  onSearch: (filters: Partial<SearchFilters>) => void
  onClear: () => void
  loading: boolean
  initialFilters?: Partial<SearchFilters>
}

export default function SearchForm({ onSearch, onClear, loading, initialFilters }: Props) {
  const [keywordInput, setKeywordInput] = useState(initialFilters?.keywords?.join(', ') ?? '')
  const [selectedTags, setSelectedTags] = useState<string[]>(initialFilters?.tags ?? [])
  const [region, setRegion] = useState(initialFilters?.region ?? '')
  const [jobType, setJobType] = useState(initialFilters?.jobType ?? '')
  const [experienceLevel, setExperienceLevel] = useState(initialFilters?.experienceLevel ?? '')
  const [location, setLocation] = useState(initialFilters?.location ?? '')
  const [remote, setRemote] = useState(initialFilters?.remote ?? false)
  const [showFilters, setShowFilters] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const hasActiveFilters = keywordInput.trim() || selectedTags.length > 0 || region ||
    location.trim() || jobType || experienceLevel || !remote

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const keywords = keywordInput.split(',').map(k => k.trim()).filter(Boolean)
    onSearch({ keywords, tags: selectedTags, region, jobType, experienceLevel, location, remote })
  }

  function handleClear() {
    setKeywordInput('')
    setSelectedTags([])
    setRegion('')
    setJobType('')
    setExperienceLevel('')
    setLocation('')
    setRemote(true)
    onClear()
  }

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3">
      {/* Keyword row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            className="input pl-9"
            placeholder="e.g. React developer, Python data engineer…"
            value={keywordInput}
            onChange={e => setKeywordInput(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-colors shrink-0 ${
            showFilters || selectedTags.length > 0
              ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
              : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
          }`}
          title="Toggle skill filters"
        >
          <SlidersHorizontal size={15} />
          {selectedTags.length > 0 && (
            <span className="text-xs font-medium">{selectedTags.length}</span>
          )}
        </button>
      </div>

      {/* Region selector — horizontal scroll on mobile */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide -mx-0.5 px-0.5">
        {REGIONS.map(r => (
          <button
            key={r.value}
            type="button"
            onClick={() => setRegion(prev => prev === r.value ? '' : r.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium whitespace-nowrap shrink-0 transition-all duration-100 ${
              region === r.value
                ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 ring-1 ring-brand-500/20'
                : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:border-slate-500 hover:text-slate-300'
            }`}
          >
            <span>{r.flag}</span>
            {r.label}
          </button>
        ))}
      </div>

      {/* Action row */}
      <div className="flex gap-2">
        {hasActiveFilters && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-500 text-sm transition-colors shrink-0"
          >
            <X size={14} />
            <span className="hidden sm:inline">Clear</span>
          </button>
        )}
        <button type="submit" className="btn-primary flex items-center gap-2 flex-1 justify-center sm:flex-none" disabled={loading}>
          <Search size={15} />
          <span>{loading ? 'Searching…' : 'Search'}</span>
        </button>
      </div>

      {/* Skill tag groups */}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
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
            <label className="block text-xs text-slate-500 mb-1">City / Area</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Bangalore, London"
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
