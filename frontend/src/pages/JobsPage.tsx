import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Loader2, AlertCircle, Layers, SortAsc, Sparkles, Search, UserCog, MapPin, X } from 'lucide-react'
import SearchForm, { REGIONS } from '../components/SearchForm'
import JobCard from '../components/JobCard'
import ResumeUpload from '../components/ResumeUpload'
import { searchJobs, saveApplication, getApplications, getProfile, updateProfile } from '../lib/api'
import type { ResumeAnalysis } from '../lib/api'
import type { Job, SearchFilters } from '../types'
import { scoreJob } from '../lib/jobScorer'
import type { FitScore } from '../lib/jobScorer'

type SortKey = 'default' | 'title' | 'company' | 'source' | 'match'
type Tab = 'curated' | 'browse'

// ISO 3166-1 alpha-2 → our region tags
const COUNTRY_TO_REGION: Record<string, string> = {
  IN: 'India',
  US: 'US', GB: 'UK', AE: 'UAE',
  CA: 'Canada', AU: 'Australia', SG: 'Singapore',
  DE: 'Europe', FR: 'Europe', NL: 'Europe', ES: 'Europe',
  IT: 'Europe', SE: 'Europe', CH: 'Europe', PL: 'Europe',
  BE: 'Europe', AT: 'Europe', DK: 'Europe', FI: 'Europe',
  NO: 'Europe', IE: 'Europe', PT: 'Europe', CZ: 'Europe',
  RO: 'Europe', HU: 'Europe', GR: 'Europe',
}

function JobGrid({
  jobs, savedIds, onSave, scores, resumeAnalysis,
}: {
  jobs: Job[]
  savedIds: Set<string>
  onSave: (j: Job) => void
  scores?: Map<string, FitScore>
  resumeAnalysis?: ResumeAnalysis | null
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {jobs.map(job => (
        <JobCard
          key={job.job_id}
          job={job}
          isSaved={savedIds.has(job.job_id)}
          onSave={onSave}
          fitScore={scores?.get(job.job_id)}
          resumeAnalysis={resumeAnalysis}
        />
      ))}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card p-4 animate-pulse">
          <div className="flex gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-800 rounded w-2/3" />
              <div className="h-3 bg-slate-800 rounded w-1/3" />
              <div className="h-3 bg-slate-800 rounded w-full" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function JobsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('curated')
  const [filters, setFilters] = useState<Partial<SearchFilters> | null>(null)
  const [sort, setSort] = useState<SortKey>('default')
  const [toast, setToast] = useState<string | null>(null)
  const [searchKey, setSearchKey] = useState(0)
  const [resumeFilters, setResumeFilters] = useState<Partial<SearchFilters> | null>(null)
  const [resumeAnalysis, setResumeAnalysis] = useState<ResumeAnalysis | null>(null)

  // ── IP geolocation ──────────────────────────────────────────────────────────
  const [detectedRegion, setDetectedRegion] = useState<string | null>(null)
  const [detectedCity, setDetectedCity] = useState<string>('')
  const [showGeoBanner, setShowGeoBanner] = useState(false)
  const geoFetchedRef = useRef(false)

  const { data: profile } = useQuery({ queryKey: ['profile'], queryFn: getProfile })
  const { data: applications } = useQuery({ queryKey: ['applications'], queryFn: () => getApplications() })

  const savedIds = new Set((applications ?? []).map(a => a.job_id))

  // Fire geo detection once profile loads and location is not yet set
  useEffect(() => {
    if (!profile || profile.preferences?.location || geoFetchedRef.current) return
    if (sessionStorage.getItem('geo-banner-dismissed')) return
    geoFetchedRef.current = true

    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then((data: { country_code?: string; city?: string; country_name?: string }) => {
        const region = data.country_code ? COUNTRY_TO_REGION[data.country_code] : undefined
        if (region) {
          setDetectedRegion(region)
          setDetectedCity(data.city || data.country_name || '')
          setShowGeoBanner(true)
        }
      })
      .catch(() => {}) // fail silently — VPNs, ad-blockers, rate limits
  }, [profile])

  function confirmGeoRegion() {
    if (!detectedRegion) return
    updateProfile({ preferences: { location: detectedRegion } })
      .then(() => qc.invalidateQueries({ queryKey: ['profile'] }))
      .catch(() => {})
    setShowGeoBanner(false)
  }

  function dismissGeoBanner() {
    sessionStorage.setItem('geo-banner-dismissed', '1')
    setShowGeoBanner(false)
  }

  // ── Curated: built from profile preferences ─────────────────────────────────
  const profileInterests = profile?.preferences?.interests ?? []
  const profileKeywords = profile?.preferences?.keywords ?? []
  const hasProfileData = profileInterests.length > 0 || profileKeywords.length > 0

  // Map years of experience → seniority label when user hasn't picked one explicitly
  function deriveExperienceLevel(years: number): string {
    if (years <= 2) return 'Junior'
    if (years <= 5) return 'Mid-level'
    if (years <= 9) return 'Senior'
    if (years <= 14) return 'Lead'
    return 'Staff'
  }

  const profileYears = profile?.preferences?.yearsOfExperience
  const effectiveExperienceLevel = profile?.preferences?.experienceLevel ||
    (profileYears != null ? deriveExperienceLevel(profileYears) : '')

  // Map free-text profile location → normalised region tag
  function deriveRegion(): string {
    const loc = (profile?.preferences?.location ?? '').toLowerCase()
    const isRemote = profile?.preferences?.remote ?? true
    if (!loc && isRemote) return 'Remote'
    if (loc.includes('remote')) return 'Remote'
    if (loc.includes('india')) return 'India'
    if (loc.includes('us') || loc.includes('usa') || loc.includes('united states') || loc.includes('america')) return 'US'
    if (loc.includes('uk') || loc.includes('united kingdom') || loc.includes('london') || loc.includes('england')) return 'UK'
    if (loc.includes('uae') || loc.includes('dubai') || loc.includes('united arab')) return 'UAE'
    if (loc.includes('canada') || loc.includes('toronto') || loc.includes('vancouver')) return 'Canada'
    if (loc.includes('australia') || loc.includes('sydney') || loc.includes('melbourne')) return 'Australia'
    if (loc.includes('europe') || loc.includes('germany') || loc.includes('france') || loc.includes('netherlands')) return 'Europe'
    if (loc.includes('singapore')) return 'Singapore'
    return ''
  }

  const profileRegion = profile ? deriveRegion() : ''

  const curatedFilters: Partial<SearchFilters> = {
    tags: profileInterests,
    keywords: profileKeywords,
    experienceLevel: effectiveExperienceLevel,
    jobType: profile?.preferences?.jobType ?? '',
    region: profileRegion,
    remote: profile?.preferences?.remote ?? true,
  }

  // Build a ResumeAnalysis-compatible object from profile data so fit scores
  // show on For You cards even when no resume has been uploaded.
  const ROLE_TAGS = new Set(['Frontend', 'Backend', 'Full Stack', 'DevOps', 'Mobile', 'Data Engineer', 'ML / AI', 'QA', 'Platform Engineer', 'SRE'])
  const CLOUD_TAGS = new Set(['AWS', 'Azure', 'GCP'])
  const profileAsAnalysis: ResumeAnalysis | null = profile && hasProfileData ? {
    skills: [...profileInterests, ...profileKeywords],
    experienceLevel: effectiveExperienceLevel || 'Mid-level',
    yearsOfExperience: profileYears ?? 0,
    jobTitles: profileInterests.filter(i => ROLE_TAGS.has(i)),
    searchKeywords: profileKeywords,
    cloudPlatforms: profileInterests.filter(i => CLOUD_TAGS.has(i)),
    summary: '',
  } : null

  const { data: curatedData, isLoading: curatedLoading } = useQuery({
    queryKey: ['jobs', 'curated', curatedFilters],
    queryFn: () => searchJobs(curatedFilters),
    enabled: !!profile && hasProfileData,
  })

  // ── Browse: user-controlled search ─────────────────────────────────────────

  const browseFilters: Partial<SearchFilters> = filters ?? {}

  const { data: browseData, isLoading: browseLoading, isError, error } = useQuery({
    queryKey: ['jobs', browseFilters],
    queryFn: () => searchJobs(browseFilters),
    enabled: activeTab === 'browse',
  })

  const saveMutation = useMutation({
    mutationFn: (job: Job) => saveApplication(job),
    onSuccess: (_, job) => {
      qc.invalidateQueries({ queryKey: ['applications'] })
      showToast(`"${job.title}" saved to tracker`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      if (msg === 'Job already saved') showToast('Already in your tracker')
      else showToast('Failed to save job')
    },
  })

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  function handleSearch(f: Partial<SearchFilters>) {
    setFilters(f)
    setResumeFilters(null)
  }

  function handleClear() {
    setFilters(null)
    setResumeFilters(null)
  }

  function handleResumeAnalyzed(analysis: ResumeAnalysis) {
    setResumeAnalysis(analysis)
    const f: Partial<SearchFilters> = {
      keywords: analysis.searchKeywords,
      tags: [],
      experienceLevel: analysis.experienceLevel,
      remote: true,
    }
    setResumeFilters(f)
    setFilters(f)
    setSearchKey(k => k + 1)
    showToast(`Searching ${analysis.searchKeywords.length} keywords from your resume`)
  }

  // ── Fit scores ───────────────────────────────────────────────────────────────
  // Resume upload takes priority; fall back to profile-derived analysis so For
  // You cards show badges without requiring a resume.
  const effectiveAnalysis = resumeAnalysis ?? profileAsAnalysis
  const fitScores = useMemo<Map<string, FitScore>>(() => {
    if (!effectiveAnalysis) return new Map()
    const allJobs = [...(browseData?.jobs ?? []), ...(curatedData?.jobs ?? [])]
    return new Map(allJobs.map(job => [job.job_id, scoreJob(job, effectiveAnalysis)]))
  }, [effectiveAnalysis, browseData, curatedData])

  const browseJobs = [...(browseData?.jobs ?? [])]
  if (sort === 'title')   browseJobs.sort((a, b) => a.title.localeCompare(b.title))
  else if (sort === 'company') browseJobs.sort((a, b) => a.company.localeCompare(b.company))
  else if (sort === 'source')  browseJobs.sort((a, b) => a.source.localeCompare(b.source))
  else if (sort === 'match' && resumeAnalysis)
    browseJobs.sort((a, b) => (fitScores.get(b.job_id)?.overall ?? 0) - (fitScores.get(a.job_id)?.overall ?? 0))

  const curatedJobs = curatedData?.jobs ?? []

  // Chips showing which profile attributes drive the curated feed
  const expChip = effectiveExperienceLevel
    ? profileYears != null && !profile?.preferences?.experienceLevel
      ? `${effectiveExperienceLevel} (${profileYears}y)`
      : effectiveExperienceLevel
    : null
  const matchChips: string[] = [
    ...(profileRegion ? [profileRegion] : []),
    ...profileInterests.slice(0, 4),
    ...(expChip ? [expChip] : []),
  ]

  const detectedRegionMeta = REGIONS.find(r => r.value === detectedRegion)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Find Your Next Tech Role</h1>
        <p className="text-slate-500 text-sm mt-1">Remote tech jobs aggregated from RemoteOK, We Work Remotely, Himalayas &amp; more</p>
      </div>

      {/* ── Geo detection banner ────────────────────────────────────────────── */}
      {showGeoBanner && detectedRegion && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-slate-800/80 border border-slate-700 rounded-xl">
          <MapPin size={15} className="text-brand-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-200 font-medium">
              Looks like you're in {detectedRegionMeta?.flag} <span className="text-brand-300">{detectedRegion}</span>
              {detectedCity ? <span className="text-slate-500 font-normal"> ({detectedCity})</span> : null}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Set this as your preferred location to get curated jobs for your region.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={confirmGeoRegion}
              className="px-3 py-1.5 rounded-lg bg-brand-500/20 text-brand-300 border border-brand-500/30 text-xs font-medium hover:bg-brand-500/30 transition-colors"
            >
              Yes, set {detectedRegion}
            </button>
            <button
              onClick={() => { dismissGeoBanner(); navigate('/profile') }}
              className="px-3 py-1.5 rounded-lg bg-slate-700/50 text-slate-400 border border-slate-700 text-xs font-medium hover:text-slate-200 transition-colors"
            >
              Change
            </button>
            <button
              onClick={dismissGeoBanner}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ── Tab switcher ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('curated')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            activeTab === 'curated'
              ? 'bg-brand-500/20 text-brand-300 shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Sparkles size={14} />
          For You
        </button>
        <button
          onClick={() => setActiveTab('browse')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            activeTab === 'browse'
              ? 'bg-slate-800 text-slate-200 shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <Search size={14} />
          Browse All
        </button>
      </div>

      {/* ══════════════════ FOR YOU TAB ══════════════════ */}
      {activeTab === 'curated' && (
        <div className="space-y-4">
          {!profile ? (
            <SkeletonGrid />
          ) : !hasProfileData ? (
            <div className="card p-8 text-center space-y-3">
              <UserCog size={36} className="mx-auto text-slate-600" />
              <div>
                <p className="font-semibold text-slate-300">Your feed is empty</p>
                <p className="text-sm text-slate-500 mt-1">
                  Add your skills and preferences in your Profile to get curated job recommendations.
                </p>
              </div>
              <button
                onClick={() => navigate('/profile')}
                className="inline-flex items-center gap-2 btn-primary text-sm px-4 py-2"
              >
                <UserCog size={13} />
                Set up your profile
              </button>
            </div>
          ) : (
            <>
              {/* Match context banner */}
              <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-brand-500/10 border border-brand-500/20 rounded-xl">
                <Sparkles size={13} className="text-brand-400 shrink-0" />
                <span className="text-xs text-brand-300 font-medium">Matched to your profile:</span>
                <div className="flex flex-wrap gap-1.5">
                  {matchChips.map(chip => {
                    const regionMeta = REGIONS.find(r => r.value === chip)
                    return (
                      <span key={chip} className="badge bg-brand-500/15 text-brand-300 border border-brand-500/30 text-[11px]">
                        {regionMeta ? `${regionMeta.flag} ${chip}` : chip}
                      </span>
                    )
                  })}
                  {profileKeywords.length > 0 && (
                    <span className="badge bg-slate-800 text-slate-400 border-slate-700 text-[11px]">
                      +{profileKeywords.length} keywords
                    </span>
                  )}
                </div>
              </div>

              {curatedLoading && <SkeletonGrid />}

              {!curatedLoading && curatedJobs.length === 0 && (
                <div className="card p-10 text-center">
                  <Layers size={32} className="mx-auto text-slate-700 mb-3" />
                  <p className="text-slate-400 font-medium">No curated matches right now</p>
                  <p className="text-slate-600 text-sm mt-1">Try adding more skills in your profile or use Browse to search manually</p>
                </div>
              )}

              {!curatedLoading && curatedJobs.length > 0 && (
                <>
                  <p className="text-sm text-slate-500">
                    <span className="text-slate-200 font-medium">{curatedData?.total ?? curatedJobs.length}</span> jobs curated for you
                  </p>
                  <JobGrid jobs={curatedJobs} savedIds={savedIds} onSave={j => saveMutation.mutate(j)} scores={fitScores} resumeAnalysis={effectiveAnalysis} />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ══════════════════ BROWSE TAB ══════════════════ */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          <ResumeUpload onAnalyzed={handleResumeAnalyzed} />

          {resumeFilters && (
            <div className="flex items-center gap-2 text-xs bg-brand-900/20 border border-brand-800 text-brand-300 rounded-lg px-3 py-2">
              <span className="font-medium">Showing resume-matched results</span>
              <span className="text-brand-500">·</span>
              <span>{filters?.keywords?.slice(0, 4).join(', ')}{(filters?.keywords?.length ?? 0) > 4 ? '…' : ''}</span>
              <button
                onClick={() => { setResumeFilters(null); setFilters(null); setSearchKey(k => k + 1) }}
                className="ml-auto text-brand-500 hover:text-brand-300 underline"
              >
                Clear
              </button>
            </div>
          )}

          <SearchForm
            key={searchKey}
            onSearch={handleSearch}
            onClear={handleClear}
            loading={browseLoading}
            initialFilters={resumeFilters ?? (filters ?? browseFilters)}
          />

          {(browseData || browseLoading) && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                {browseLoading ? (
                  <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" />Fetching jobs…</span>
                ) : (
                  <span><span className="text-slate-200 font-medium">{browseData?.total ?? 0}</span> jobs found</span>
                )}
              </p>
              <div className="flex items-center gap-1.5">
                <SortAsc size={13} className="text-slate-500" />
                <select
                  className="text-xs bg-slate-800 border border-slate-700 text-slate-400 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  value={sort}
                  onChange={e => setSort(e.target.value as SortKey)}
                >
                  {resumeAnalysis && <option value="match">Sort: Best Match</option>}
                  <option value="default">Sort: Default</option>
                  <option value="title">Sort: Title</option>
                  <option value="company">Sort: Company</option>
                  <option value="source">Sort: Source</option>
                </select>
              </div>
            </div>
          )}

          {browseLoading && <SkeletonGrid />}

          {isError && (
            <div className="card p-5 flex items-center gap-3 text-red-400 border-red-900">
              <AlertCircle size={18} />
              <div>
                <p className="font-medium">Failed to load jobs</p>
                <p className="text-xs text-red-500 mt-0.5">
                  {(error as Error)?.message ?? 'Make sure the backend is running'}
                </p>
              </div>
            </div>
          )}

          {!browseLoading && !isError && browseJobs.length === 0 && browseData && (
            <div className="card p-10 text-center">
              <Layers size={32} className="mx-auto text-slate-700 mb-3" />
              <p className="text-slate-400 font-medium">No jobs found</p>
              <p className="text-slate-600 text-sm mt-1">Try different keywords or remove some filters</p>
            </div>
          )}

          {!browseLoading && browseJobs.length > 0 && (
            <JobGrid jobs={browseJobs} savedIds={savedIds} onSave={j => saveMutation.mutate(j)} scores={fitScores} resumeAnalysis={effectiveAnalysis} />
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-slate-200 text-sm px-4 py-2.5 rounded-xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
