import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Save, Loader2, CheckCircle2, AlertCircle, X, PenLine, LogOut,
  ShieldCheck, Sliders, FileText, Upload, Star, Trash2, Lock, Plus,
  Phone, Link2, Briefcase, DollarSign, Clock, Globe, MonitorSmartphone, ChevronDown,
} from 'lucide-react'
import {
  getProfile, updateProfile,
  getApplicationProfile, updateApplicationProfile,
  getQuestionnaire, updateQuestionnaire,
  listResumes, uploadResume, setResumeAsPrimary, deleteResume,
  listCredentials, upsertCredential, deleteCredential,
  createSessionSSE, checkSessionStatus,
} from '../lib/api'
import type { ApplicationProfile, UserResume, JobCredential, Questionnaire } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const INTEREST_GROUPS = [
  { label: 'Roles',            tags: ['Frontend', 'Backend', 'Full Stack', 'DevOps', 'Mobile', 'Data Engineer', 'ML / AI', 'QA', 'Platform Engineer', 'SRE'] },
  { label: 'Languages',        tags: ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C#', 'PHP', 'Ruby', 'Swift', 'Kotlin'] },
  { label: 'Frameworks & Tools', tags: ['React', 'Vue', 'Angular', 'Next.js', 'Node.js', 'Django', 'Spring', '.NET', 'Laravel', 'Flutter'] },
  { label: 'Cloud & Infra',    tags: ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'PostgreSQL', 'MongoDB', 'Redis'] },
]

const EXPERIENCE_LEVELS = ['Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal']
const JOB_TYPES = ['Full-time', 'Contract', 'Part-time', 'Freelance']

const JOB_SITES = [
  { id: 'linkedin',    label: 'LinkedIn',    url: 'linkedin.com' },
  { id: 'naukri',     label: 'Naukri',      url: 'naukri.com' },
  { id: 'indeed',     label: 'Indeed',      url: 'indeed.com' },
  { id: 'glassdoor',  label: 'Glassdoor',   url: 'glassdoor.com' },
  { id: 'monster',    label: 'Monster',     url: 'monster.com' },
  { id: 'shine',      label: 'Shine',       url: 'shine.com' },
  { id: 'foundit',    label: 'Foundit',     url: 'foundit.in' },
  { id: 'internshala',label: 'Internshala', url: 'internshala.com' },
]

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

// ── Application Profile section ──────────────────────────────────────────────

function ApplicationProfileSection() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['applicationProfile'], queryFn: getApplicationProfile })

  const [form, setForm] = useState<ApplicationProfile>({})
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const mutation = useMutation({
    mutationFn: updateApplicationProfile,
    onSuccess: (updated) => {
      qc.setQueryData(['applicationProfile'], updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  function set(key: keyof ApplicationProfile, val: string) {
    setForm(f => ({ ...f, [key]: val }))
  }

  if (isLoading) return <div className="flex items-center gap-2 text-slate-500 text-sm py-2"><Loader2 size={13} className="animate-spin" />Loading…</div>

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><Phone size={10} />Phone</label>
          <input className="input w-full" placeholder="+91 98765 43210" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><Link2 size={10} />LinkedIn URL</label>
          <input className="input w-full" placeholder="https://linkedin.com/in/…" value={form.linkedinUrl ?? ''} onChange={e => set('linkedinUrl', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><Globe size={10} />GitHub URL</label>
          <input className="input w-full" placeholder="https://github.com/…" value={form.githubUrl ?? ''} onChange={e => set('githubUrl', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><Globe size={10} />Portfolio / Website</label>
          <input className="input w-full" placeholder="https://yoursite.com" value={form.portfolioUrl ?? ''} onChange={e => set('portfolioUrl', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><DollarSign size={10} />Current CTC</label>
          <input className="input w-full" placeholder="e.g. 12 LPA" value={form.currentCTC ?? ''} onChange={e => set('currentCTC', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><DollarSign size={10} />Expected CTC</label>
          <input className="input w-full" placeholder="e.g. 18 LPA" value={form.expectedCTC ?? ''} onChange={e => set('expectedCTC', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><Clock size={10} />Notice Period</label>
          <input className="input w-full" placeholder="e.g. 30 days, Immediate" value={form.noticePeriod ?? ''} onChange={e => set('noticePeriod', e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1"><Briefcase size={10} />Professional Summary / Cover Note</label>
        <textarea
          className="input w-full resize-none"
          rows={4}
          placeholder="A short intro the agent will use when filling application forms…"
          value={form.intro ?? ''}
          onChange={e => set('intro', e.target.value)}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending}
          className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
        >
          {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Save
        </button>
        {saved && <span className="flex items-center gap-1.5 text-emerald-400 text-sm"><CheckCircle2 size={13} />Saved</span>}
        {mutation.isError && (
          <span className="flex items-center gap-1.5 text-red-400 text-sm">
            <AlertCircle size={13} />
            {(mutation.error as {response?:{data?:{error?:string}}})?.response?.data?.error ?? 'Save failed'}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Resumes section ──────────────────────────────────────────────────────────

function ResumesSection() {
  const qc = useQueryClient()
  const { data: resumes = [], isLoading } = useQuery({ queryKey: ['resumes'], queryFn: listResumes })
  const fileRef = useRef<HTMLInputElement>(null)
  const [label, setLabel] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')

  const primaryMutation = useMutation({
    mutationFn: setResumeAsPrimary,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resumes'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteResume,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resumes'] }),
  })

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadErr('')
    setUploading(true)
    try {
      await uploadResume(file, label || file.name.replace(/\.[^.]+$/, ''))
      await qc.invalidateQueries({ queryKey: ['resumes'] })
      setLabel('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: unknown) {
      const axiosErr = err as {response?:{data?:{error?:string}}}
      setUploadErr(axiosErr?.response?.data?.error ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload row */}
      <div className="rounded-xl border border-dashed border-slate-700 p-4 space-y-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Label <span className="text-slate-600">(optional)</span></label>
          <input
            className="input w-full"
            placeholder="e.g. Senior Dev Resume, Startup Version"
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={handleUpload}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-700 text-sm text-slate-300 hover:border-brand-500 hover:text-brand-300 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? 'Uploading…' : 'Choose file (PDF / DOCX)'}
          </button>
          {uploadErr && <p className="text-xs text-red-400 mt-1 flex items-center gap-1"><AlertCircle size={11} />{uploadErr}</p>}
        </div>
      </div>

      {/* Resume list */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 size={13} className="animate-spin" />Loading…</div>
      ) : resumes.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No resumes yet — upload one above.</p>
      ) : (
        <div className="space-y-2">
          {resumes.map((r: UserResume) => (
            <div key={r.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${r.is_primary ? 'border-brand-500/40 bg-brand-500/5' : 'border-slate-700 bg-slate-800/40'}`}>
              <FileText size={14} className={r.is_primary ? 'text-brand-400 shrink-0' : 'text-slate-500 shrink-0'} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate font-medium">{r.label}</p>
                <p className="text-xs text-slate-500 truncate">{r.original_name} · {fmtBytes(r.file_size)}</p>
              </div>
              {r.is_primary && (
                <span className="flex items-center gap-1 text-[10px] text-brand-400 font-semibold bg-brand-500/10 border border-brand-500/20 rounded px-1.5 py-0.5 shrink-0">
                  <Star size={9} />Primary
                </span>
              )}
              {!r.is_primary && (
                <button
                  type="button"
                  onClick={() => primaryMutation.mutate(r.id)}
                  disabled={primaryMutation.isPending}
                  title="Set as primary"
                  className="text-xs text-slate-500 hover:text-brand-400 transition-colors px-2 py-1 rounded hover:bg-slate-700 shrink-0"
                >
                  <Star size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Delete "${r.label}"?`)) deleteMutation.mutate(r.id)
                }}
                disabled={deleteMutation.isPending}
                title="Delete"
                className="text-slate-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-900/20 shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Job Site Credentials section ─────────────────────────────────────────────

// ── Questionnaire section ────────────────────────────────────────────────────

const YES_NO = [{ v: '', l: '— select —' }, { v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }]
const YES_NO_OPEN = [{ v: '', l: '— select —' }, { v: 'yes', l: 'Yes' }, { v: 'no', l: 'No' }, { v: 'open', l: 'Open to discussion' }]
const PRIVACY = [{ v: '', l: '— select —' }, { v: 'no', l: 'No' }, { v: 'yes', l: 'Yes' }, { v: 'prefer_not_to_say', l: 'Prefer not to say' }]
const DEGREES = [
  { v: '', l: '— select —' }, { v: 'high_school', l: 'High School' },
  { v: 'associate', l: "Associate's" }, { v: 'bachelor', l: "Bachelor's" },
  { v: 'master', l: "Master's" }, { v: 'phd', l: 'PhD / Doctorate' }, { v: 'other', l: 'Other' },
]
const CITIZENSHIP = [
  { v: '', l: '— select —' }, { v: 'citizen', l: 'Citizen' },
  { v: 'permanent_resident', l: 'Permanent Resident' }, { v: 'work_visa', l: 'Work Visa' },
  { v: 'student_visa', l: 'Student Visa' }, { v: 'other', l: 'Other' },
]
const WORK_MODES = [
  { v: '', l: '— select —' }, { v: 'remote', l: 'Remote' },
  { v: 'hybrid', l: 'Hybrid' }, { v: 'onsite', l: 'On-site' }, { v: 'flexible', l: 'Flexible / Any' },
]
const GENDERS = [
  { v: '', l: '— select —' }, { v: 'male', l: 'Male' }, { v: 'female', l: 'Female' },
  { v: 'non_binary', l: 'Non-binary' }, { v: 'other', l: 'Other' }, { v: 'prefer_not_to_say', l: 'Prefer not to say' },
]
const ETHNICITIES = [
  { v: '', l: '— select —' },
  { v: 'asian', l: 'Asian' }, { v: 'black', l: 'Black / African American' },
  { v: 'hispanic', l: 'Hispanic / Latino' }, { v: 'white', l: 'White / Caucasian' },
  { v: 'middle_eastern', l: 'Middle Eastern' }, { v: 'native_american', l: 'Native American' },
  { v: 'pacific_islander', l: 'Pacific Islander' }, { v: 'two_or_more', l: 'Two or more races' },
  { v: 'other', l: 'Other' }, { v: 'prefer_not_to_say', l: 'Prefer not to say' },
]

function QSelect({ label, options, value, onChange }: {
  label: string
  options: { v: string; l: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-[10px] text-slate-500 mb-1">{label}</label>
      <div className="relative">
        <select
          className="input w-full appearance-none pr-7 text-sm"
          value={value}
          onChange={e => onChange(e.target.value)}
        >
          {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
        <ChevronDown size={11} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      </div>
    </div>
  )
}

function QInput({ label, placeholder, value, onChange }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-[10px] text-slate-500 mb-1">{label}</label>
      <input className="input w-full text-sm" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  )
}

function QuestionnaireSection() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['questionnaire'], queryFn: getQuestionnaire })
  const [form, setForm] = useState<Questionnaire>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  function set(key: keyof Questionnaire, val: string) {
    setForm(prev => ({ ...prev, [key]: val }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await updateQuestionnaire(form)
      await qc.invalidateQueries({ queryKey: ['questionnaire'] })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 size={13} className="animate-spin" />Loading…</div>

  const f = form

  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">These answers are injected into the agent's context so it can fill common application questions automatically.</p>

      {/* Work authorization */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Work Authorization</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QSelect label="Legally authorized to work?" options={YES_NO} value={f.workAuthorized ?? ''} onChange={v => set('workAuthorized', v)} />
          <QSelect label="Require visa sponsorship?" options={YES_NO} value={f.requiresSponsorship ?? ''} onChange={v => set('requiresSponsorship', v)} />
          <QSelect label="Citizenship / visa status" options={CITIZENSHIP} value={f.citizenshipStatus ?? ''} onChange={v => set('citizenshipStatus', v)} />
        </div>
      </div>

      {/* Education */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Education</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QSelect label="Highest degree" options={DEGREES} value={f.highestDegree ?? ''} onChange={v => set('highestDegree', v)} />
          <QInput label="Field of study / major" placeholder="Computer Science" value={f.degreeField ?? ''} onChange={v => set('degreeField', v)} />
          <QInput label="University / college" placeholder="IIT Delhi" value={f.university ?? ''} onChange={v => set('university', v)} />
          <QInput label="Graduation year" placeholder="2021" value={f.graduationYear ?? ''} onChange={v => set('graduationYear', v)} />
        </div>
      </div>

      {/* Work preferences */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Work Preferences</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QSelect label="Willing to relocate?" options={YES_NO_OPEN} value={f.willingToRelocate ?? ''} onChange={v => set('willingToRelocate', v)} />
          <QSelect label="Preferred work mode" options={WORK_MODES} value={f.preferredWorkMode ?? ''} onChange={v => set('preferredWorkMode', v)} />
          <QSelect label="Driving license?" options={YES_NO} value={f.drivingLicense ?? ''} onChange={v => set('drivingLicense', v)} />
          <QInput label="Languages spoken" placeholder="English, Hindi" value={f.languages ?? ''} onChange={v => set('languages', v)} />
        </div>
      </div>

      {/* EEO / diversity */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Diversity & EEO</p>
          <span className="text-[10px] text-slate-600 bg-slate-800 rounded px-1.5 py-0.5">optional — choose "Prefer not to say" to skip</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <QSelect label="Gender" options={GENDERS} value={f.gender ?? ''} onChange={v => set('gender', v)} />
          <QSelect label="Ethnicity / race" options={ETHNICITIES} value={f.ethnicity ?? ''} onChange={v => set('ethnicity', v)} />
          <QSelect label="Veteran status" options={PRIVACY} value={f.veteranStatus ?? ''} onChange={v => set('veteranStatus', v)} />
          <QSelect label="Disability status" options={PRIVACY} value={f.disabilityStatus ?? ''} onChange={v => set('disabilityStatus', v)} />
        </div>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="btn-primary text-xs px-4 py-1.5 flex items-center gap-1.5"
      >
        {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <CheckCircle2 size={11} /> : <Save size={11} />}
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Questionnaire'}
      </button>
    </div>
  )
}

function CredentialsSection() {
  const qc = useQueryClient()
  const { data: creds = [], isLoading } = useQuery({ queryKey: ['credentials'], queryFn: listCredentials })

  const [addingSite, setAddingSite] = useState<string | null>(null)
  const [siteEmail, setSiteEmail] = useState('')
  const [sitePassword, setSitePassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  // Session connect state — keyed by site id
  const [connectingSite, setConnectingSite] = useState<string | null>(null)
  const [sessionLogs, setSessionLogs] = useState<string[]>([])
  const [sessionDone, setSessionDone] = useState(false)
  const [sessionSaved, setSessionSaved] = useState(false)
  const [sessionSites, setSessionSites] = useState<Set<string>>(new Set())
  const sessionESRef = useRef<EventSource | null>(null)
  const logsEndRef = useRef<HTMLDivElement | null>(null)

  const deleteMutation = useMutation({
    mutationFn: deleteCredential,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
  })

  // Check which sites already have a saved browser session
  useEffect(() => {
    Promise.all(
      JOB_SITES.map(s =>
        checkSessionStatus(s.id)
          .then(r => r.hasSession ? s.id : null)
          .catch(() => null)
      )
    ).then(results => {
      setSessionSites(new Set(results.filter(Boolean) as string[]))
    })
  }, [])

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionLogs])

  async function saveCred() {
    if (!addingSite || !siteEmail || !sitePassword) return
    setSaveErr('')
    setSaving(true)
    try {
      await upsertCredential(addingSite, siteEmail, sitePassword)
      await qc.invalidateQueries({ queryKey: ['credentials'] })
      setAddingSite(null)
      setSiteEmail('')
      setSitePassword('')
    } catch (err: unknown) {
      const axiosErr = err as {response?:{data?:{error?:string}}}
      setSaveErr(axiosErr?.response?.data?.error ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function startAdd(site: string) {
    setAddingSite(site)
    setSiteEmail('')
    setSitePassword('')
    setSaveErr('')
  }

  function startConnect(siteId: string) {
    // Close any existing SSE
    if (sessionESRef.current) {
      sessionESRef.current.close()
      sessionESRef.current = null
    }
    setConnectingSite(siteId)
    setSessionLogs(['Opening browser… please complete the login in the browser window that appears.'])
    setSessionDone(false)
    setSessionSaved(false)

    const es = createSessionSSE(siteId)
    sessionESRef.current = es

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.msg) setSessionLogs(prev => [...prev, data.msg])
      } catch { /* ignore */ }
    }

    es.addEventListener('done', (e: Event) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        setSessionDone(true)
        setSessionSaved(!!data.saved)
        if (data.saved) setSessionSites(prev => new Set([...prev, siteId]))
      } catch { /* ignore */ }
      es.close()
      sessionESRef.current = null
    })

    es.addEventListener('error', (e: Event) => {
      try {
        const data = JSON.parse((e as MessageEvent).data)
        setSessionLogs(prev => [...prev, `Error: ${data.error}`])
      } catch { /* ignore */ }
      setSessionDone(true)
      setSessionSaved(false)
      es.close()
      sessionESRef.current = null
    })
  }

  function closeConnectPanel() {
    if (sessionESRef.current) {
      sessionESRef.current.close()
      sessionESRef.current = null
    }
    setConnectingSite(null)
    setSessionLogs([])
    setSessionDone(false)
  }

  const credMap = new Map((creds as JobCredential[]).map(c => [c.site, c]))

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Credentials are stored with AES-256 encryption and only used by the auto-apply agent on your device.</p>
      <p className="text-xs text-slate-500">
        <span className="text-violet-400 font-medium">Connect Account</span> saves your browser session so the agent skips login (and 2FA) on future runs.
      </p>

      <div className="space-y-2">
        {JOB_SITES.map(site => {
          const existing = credMap.get(site.id)
          const isAdding = addingSite === site.id
          const isConnecting = connectingSite === site.id
          const hasStoredSession = sessionSites.has(site.id)

          return (
            <div key={site.id} className={`rounded-xl border p-3 space-y-2 ${existing ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-700 bg-slate-800/30'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Lock size={12} className={existing ? 'text-emerald-400' : 'text-slate-600'} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200">{site.label}</p>
                    <p className="text-xs text-slate-600">{site.url}</p>
                  </div>
                  {existing && (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 font-medium whitespace-nowrap">
                      ✓ {existing.site_email}
                    </span>
                  )}
                  {hasStoredSession && (
                    <span className="text-[10px] text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-1.5 py-0.5 font-medium whitespace-nowrap">
                      session saved
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {existing && (
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Remove credentials for ${site.label}?`)) deleteMutation.mutate(existing.id) }}
                      className="text-slate-600 hover:text-red-400 transition-colors p-1 rounded hover:bg-red-900/20"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => isAdding ? setAddingSite(null) : startAdd(site.id)}
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
                  >
                    {isAdding ? <X size={10} /> : <Plus size={10} />}
                    {existing ? 'Update' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => isConnecting ? closeConnectPanel() : startConnect(site.id)}
                    className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                      isConnecting
                        ? 'border-violet-500/50 text-violet-400 bg-violet-500/10'
                        : 'border-slate-700 text-slate-400 hover:text-violet-400 hover:border-violet-500/50'
                    }`}
                  >
                    <MonitorSmartphone size={10} />
                    {isConnecting ? 'Stop' : hasStoredSession ? 'Reconnect' : 'Connect'}
                  </button>
                </div>
              </div>

              {isAdding && (
                <div className="space-y-2 pt-1 border-t border-slate-700">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Email / Username</label>
                      <input
                        className="input w-full text-sm"
                        type="email"
                        placeholder="your@email.com"
                        value={siteEmail}
                        onChange={e => setSiteEmail(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-1">Password</label>
                      <input
                        className="input w-full text-sm"
                        type="password"
                        placeholder="••••••••"
                        value={sitePassword}
                        onChange={e => setSitePassword(e.target.value)}
                      />
                    </div>
                  </div>
                  {saveErr && <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={10} />{saveErr}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={saveCred}
                      disabled={saving || !siteEmail || !sitePassword}
                      className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
                    >
                      {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                      Save
                    </button>
                    <button type="button" onClick={() => setAddingSite(null)} className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
                  </div>
                </div>
              )}

              {isConnecting && (
                <div className="pt-1 border-t border-slate-700 space-y-2">
                  <p className="text-[10px] text-slate-500">
                    A browser window will open on your machine. Log in to {site.label} (including any 2FA). The session will be saved automatically once you reach the home page.
                  </p>
                  <div className="bg-slate-900 rounded-lg p-2.5 max-h-32 overflow-y-auto font-mono text-[10px] space-y-0.5">
                    {sessionLogs.map((line, i) => (
                      <p key={i} className={line.startsWith('✅') ? 'text-emerald-400' : line.startsWith('⏰') ? 'text-amber-400' : line.startsWith('Error') ? 'text-red-400' : 'text-slate-400'}>{line}</p>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                  {sessionDone && (
                    <div className={`flex items-center gap-1.5 text-xs ${sessionSaved ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {sessionSaved
                        ? <><CheckCircle2 size={12} /> Session saved — auto-apply will skip login for {site.label}.</>
                        : <><AlertCircle size={12} /> Session not saved. Try again or use password login.</>
                      }
                    </div>
                  )}
                  {sessionDone && (
                    <button type="button" onClick={closeConnectPanel} className="btn-ghost text-xs px-3 py-1.5">Close</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isLoading && <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 size={13} className="animate-spin" />Loading…</div>}
    </div>
  )
}

// ── Main ProfilePage ─────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, login, logout, token } = useAuth()
  const qc = useQueryClient()

  const { data: profile, isLoading } = useQuery({ queryKey: ['profile'], queryFn: getProfile })

  const [editingAccount, setEditingAccount] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')

  const [interests, setInterests] = useState<string[]>([])
  const [keywords, setKeywords] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [yearsOfExperience, setYearsOfExperience] = useState<string>('')
  const [jobType, setJobType] = useState('')
  const [location, setLocation] = useState('')
  const [remote, setRemote] = useState(true)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (!profile) return
    setEditName(profile.name)
    setEditBio(profile.preferences?.bio ?? '')
    setInterests(profile.preferences?.interests ?? [])
    setKeywords((profile.preferences?.keywords ?? []).join(', '))
    setExperienceLevel(profile.preferences?.experienceLevel ?? '')
    setYearsOfExperience(profile.preferences?.yearsOfExperience != null ? String(profile.preferences.yearsOfExperience) : '')
    setJobType(profile.preferences?.jobType ?? '')
    setLocation(profile.preferences?.location ?? '')
    setRemote(profile.preferences?.remote ?? true)
  }, [profile])

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: updated => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      if (updated.name !== user?.name && token) {
        login(token, { id: updated.id, email: updated.email, name: updated.name })
      }
      setCurrentPassword('')
      setNewPassword('')
      setEditingAccount(false)
      setSuccessMsg('Saved')
      setTimeout(() => setSuccessMsg(''), 3000)
    },
  })

  function saveAccount() {
    mutation.mutate({ name: editName, preferences: { bio: editBio } })
  }

  function handleSavePrefs(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      preferences: {
        interests,
        keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        experienceLevel,
        yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : undefined,
        jobType,
        location,
        remote,
      },
      ...(newPassword ? { currentPassword, newPassword } : {}),
    })
  }

  function cancelAccountEdit() {
    setEditName(profile?.name ?? '')
    setEditBio(profile?.preferences?.bio ?? '')
    setEditingAccount(false)
  }

  function toggleInterest(tag: string) {
    setInterests(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-slate-500">
      <Loader2 size={20} className="animate-spin mr-2" />Loading profile…
    </div>
  )

  const initials = (profile?.name ?? user?.name ?? '?')[0].toUpperCase()
  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* ── Profile header ──────────────────────────────────────────────── */}
      <div className="card p-5">
        {!editingAccount ? (
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-2xl font-bold text-white uppercase shadow-lg shadow-brand-500/20 shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-slate-100 leading-tight">{profile?.name}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{profile?.email}</p>
                  {profile?.preferences?.bio ? (
                    <p className="text-sm text-slate-400 mt-2 leading-relaxed">{profile.preferences.bio}</p>
                  ) : (
                    <p className="text-sm text-slate-600 italic mt-2">No bio yet</p>
                  )}
                </div>
                <button
                  onClick={() => setEditingAccount(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors shrink-0"
                >
                  <PenLine size={12} strokeWidth={2} />Edit
                </button>
              </div>
              {joinDate && <p className="text-xs text-slate-600 mt-3">Member since {joinDate}</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-2xl font-bold text-white uppercase shadow-lg shadow-brand-500/20 shrink-0">
                {(editName[0] ?? initials).toUpperCase()}
              </div>
              <div className="flex-1">
                <label className="block text-xs text-slate-500 mb-1">Display name</label>
                <input
                  className="input w-full"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Bio <span className="text-slate-600">(optional)</span></label>
              <textarea
                className="input w-full resize-none"
                rows={3}
                placeholder="A short bio about yourself…"
                value={editBio}
                onChange={e => setEditBio(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <div>
                {successMsg && (
                  <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
                    <CheckCircle2 size={14} />{successMsg}
                  </span>
                )}
                {mutation.isError && (
                  <span className="flex items-center gap-1.5 text-red-400 text-sm">
                    <AlertCircle size={14} />
                    {(mutation.error as {response?:{data?:{error?:string}}})?.response?.data?.error ?? 'Save failed'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={cancelAccountEdit} className="btn-ghost text-sm px-3 py-1.5">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAccount}
                  disabled={mutation.isPending}
                  className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5"
                >
                  {mutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Application Profile ──────────────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Briefcase size={14} strokeWidth={1.75} className="text-brand-400" />
          <div>
            <h2 className="font-semibold text-slate-200 text-sm">Application Profile</h2>
            <p className="text-xs text-slate-500 mt-0.5">Used by the auto-apply agent to fill application forms</p>
          </div>
        </div>
        <ApplicationProfileSection />
      </div>

      {/* ── Application Questionnaire ───────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} strokeWidth={1.75} className="text-brand-400" />
          <div>
            <h2 className="font-semibold text-slate-200 text-sm">Application Questionnaire</h2>
            <p className="text-xs text-slate-500 mt-0.5">Answers to common screening questions — filled automatically by the agent</p>
          </div>
        </div>
        <QuestionnaireSection />
      </div>

      {/* ── My Resumes ──────────────────────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <FileText size={14} strokeWidth={1.75} className="text-brand-400" />
          <div>
            <h2 className="font-semibold text-slate-200 text-sm">My Resumes</h2>
            <p className="text-xs text-slate-500 mt-0.5">Upload multiple resumes — the ★ primary is used by default</p>
          </div>
        </div>
        <ResumesSection />
      </div>

      {/* ── Job Site Credentials ─────────────────────────────────────────── */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={14} strokeWidth={1.75} className="text-brand-400" />
          <div>
            <h2 className="font-semibold text-slate-200 text-sm">Job Site Credentials</h2>
            <p className="text-xs text-slate-500 mt-0.5">Saved securely so the agent can log in on your behalf</p>
          </div>
        </div>
        <CredentialsSection />
      </div>

      {/* ── Job preferences ─────────────────────────────────────────────── */}
      <form onSubmit={handleSavePrefs} className="space-y-5">
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Sliders size={14} strokeWidth={1.75} className="text-brand-400" />
            <h2 className="font-semibold text-slate-200 text-sm">Job Preferences</h2>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-2">
              Interests <span className="text-slate-600">— used as default search filters</span>
            </label>
            <div className="space-y-3">
              {INTEREST_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold mb-1.5">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.tags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleInterest(tag)}
                        className={`badge cursor-pointer transition-all duration-100 border text-xs ${
                          interests.includes(tag)
                            ? 'bg-brand-500/20 text-brand-300 border-brand-500/40 ring-1 ring-brand-500/20'
                            : 'bg-slate-800/80 text-slate-400 border-slate-700/80 hover:border-slate-500 hover:text-slate-300'
                        }`}
                      >
                        {interests.includes(tag) && <X size={9} className="mr-1 opacity-70" />}
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1">Extra keywords <span className="text-slate-600">(comma separated)</span></label>
            <input
              className="input w-full"
              placeholder="e.g. microservices, graphql, kafka"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Experience level</label>
              <select className="input w-full" value={experienceLevel} onChange={e => setExperienceLevel(e.target.value)}>
                <option value="">Any</option>
                {EXPERIENCE_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Years of experience</label>
              <input
                type="number"
                className="input w-full"
                placeholder="e.g. 5"
                min={0}
                max={50}
                value={yearsOfExperience}
                onChange={e => setYearsOfExperience(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Job type</label>
              <select className="input w-full" value={jobType} onChange={e => setJobType(e.target.value)}>
                <option value="">Any</option>
                {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Preferred location</label>
              <input
                className="input w-full"
                placeholder="e.g. Remote, London, US"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2.5 pt-5">
              <button
                type="button"
                onClick={() => setRemote(v => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${remote ? 'bg-brand-500' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${remote ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-slate-400">Remote preferred</span>
            </div>
          </div>
        </div>

        {/* ── Change password ──────────────────────────────────────────── */}
        <div className="card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} strokeWidth={1.75} className="text-brand-400" />
            <h2 className="font-semibold text-slate-200 text-sm">Security</h2>
          </div>
          <p className="text-xs text-slate-500">Leave blank to keep your current password. Not applicable for social login accounts.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Current password</label>
              <input type="password" className="input w-full" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">New password</label>
              <input type="password" className="input w-full" minLength={8} placeholder="Min 8 characters" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            </div>
          </div>
        </div>

        {mutation.isError && !editingAccount && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900/50 rounded-lg p-3">
            <AlertCircle size={14} className="shrink-0" />
            {(mutation.error as {response?:{data?:{error?:string}}})?.response?.data?.error ?? 'Failed to save'}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary flex items-center gap-2" disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {mutation.isPending ? 'Saving…' : 'Save preferences'}
          </button>
          {successMsg && !editingAccount && (
            <span className="flex items-center gap-1.5 text-emerald-400 text-sm">
              <CheckCircle2 size={14} />{successMsg}
            </span>
          )}
        </div>
      </form>

      {/* ── Sign out ────────────────────────────────────────────────────── */}
      <div className="card p-5 border-red-900/20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Sign out</h3>
            <p className="text-xs text-slate-500 mt-0.5">Sign out of your JobHunters account on this device</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 border border-red-900/40 transition-colors shrink-0"
          >
            <LogOut size={14} strokeWidth={2} />Sign out
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-slate-600 pb-2">
        Made with <span className="text-red-400">♥</span> by Team Insighters &copy; 2026
      </p>

    </div>
  )
}
