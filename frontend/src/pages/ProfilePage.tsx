import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Loader2, CheckCircle2, AlertCircle, X, PenLine, LogOut, ShieldCheck, Sliders } from 'lucide-react'
import { getProfile, updateProfile } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const INTEREST_GROUPS = [
  { label: 'Roles',            tags: ['Frontend', 'Backend', 'Full Stack', 'DevOps', 'Mobile', 'Data Engineer', 'ML / AI', 'QA', 'Platform Engineer', 'SRE'] },
  { label: 'Languages',        tags: ['JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C#', 'PHP', 'Ruby', 'Swift', 'Kotlin'] },
  { label: 'Frameworks & Tools', tags: ['React', 'Vue', 'Angular', 'Next.js', 'Node.js', 'Django', 'Spring', '.NET', 'Laravel', 'Flutter'] },
  { label: 'Cloud & Infra',    tags: ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'PostgreSQL', 'MongoDB', 'Redis'] },
]

const EXPERIENCE_LEVELS = ['Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal']
const JOB_TYPES = ['Full-time', 'Contract', 'Part-time', 'Freelance']

export default function ProfilePage() {
  const { user, login, logout, token } = useAuth()
  const qc = useQueryClient()

  const { data: profile, isLoading } = useQuery({ queryKey: ['profile'], queryFn: getProfile })

  // ── Account edit state ────────────────────────────────────────────────────
  const [editingAccount, setEditingAccount] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')

  // ── Preferences state ─────────────────────────────────────────────────────
  const [interests, setInterests] = useState<string[]>([])
  const [keywords, setKeywords] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [yearsOfExperience, setYearsOfExperience] = useState<string>('')
  const [jobType, setJobType] = useState('')
  const [location, setLocation] = useState('')
  const [remote, setRemote] = useState(true)

  // ── Password state ────────────────────────────────────────────────────────
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

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <p className="text-center text-xs text-slate-600 pb-2">
        Made with <span className="text-red-400">♥</span> by Team Insighters &copy; 2026
      </p>

    </div>
  )
}
