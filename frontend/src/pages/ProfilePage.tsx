import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { User, Save, Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { getProfile, updateProfile } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const INTEREST_GROUPS = [
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

const EXPERIENCE_LEVELS = ['Junior', 'Mid-level', 'Senior', 'Lead', 'Staff', 'Principal']
const JOB_TYPES = ['Full-time', 'Contract', 'Part-time', 'Freelance']

export default function ProfilePage() {
  const { user, login, token } = useAuth()
  const qc = useQueryClient()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
  })

  const [name, setName] = useState('')
  const [interests, setInterests] = useState<string[]>([])
  const [keywords, setKeywords] = useState('')
  const [experienceLevel, setExperienceLevel] = useState('')
  const [jobType, setJobType] = useState('')
  const [location, setLocation] = useState('')
  const [remote, setRemote] = useState(true)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (profile) {
      setName(profile.name)
      setInterests(profile.preferences?.interests ?? [])
      setKeywords((profile.preferences?.keywords ?? []).join(', '))
      setExperienceLevel(profile.preferences?.experienceLevel ?? '')
      setJobType(profile.preferences?.jobType ?? '')
      setLocation(profile.preferences?.location ?? '')
      setRemote(profile.preferences?.remote ?? true)
    }
  }, [profile])

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
      // Update auth context name if changed
      if (updated.name !== user?.name && token) {
        login(token, { id: updated.id, email: updated.email, name: updated.name })
      }
      setCurrentPassword('')
      setNewPassword('')
      setSuccessMsg('Profile saved')
      setTimeout(() => setSuccessMsg(''), 3000)
    },
  })

  function toggleInterest(tag: string) {
    setInterests(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      name,
      preferences: {
        interests,
        keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
        experienceLevel,
        jobType,
        location,
        remote,
      },
      ...(newPassword ? { currentPassword, newPassword } : {}),
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <Loader2 size={20} className="animate-spin mr-2" /> Loading profile…
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Profile &amp; Preferences</h1>
        <p className="text-slate-500 text-sm mt-1">Your interests are used as default search filters on the jobs page</p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Account info */}
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <User size={15} className="text-brand-400" />
            <h2 className="font-medium text-slate-200 text-sm">Account</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Display name</label>
              <input
                className="input w-full"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Email</label>
              <input className="input w-full opacity-50 cursor-not-allowed" value={profile?.email ?? ''} disabled />
            </div>
          </div>
        </div>

        {/* Job preferences */}
        <div className="card p-5 space-y-4">
          <h2 className="font-medium text-slate-200 text-sm">Job Preferences</h2>

          <div>
            <label className="block text-xs text-slate-500 mb-2">Interests <span className="text-slate-600">(used as default search filters)</span></label>
            <div className="space-y-2.5">
              {INTEREST_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wide font-medium mb-1.5">{group.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.tags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleInterest(tag)}
                        className={`badge cursor-pointer transition-colors border ${
                          interests.includes(tag)
                            ? 'bg-brand-500/20 text-brand-300 border-brand-500/40'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {interests.includes(tag) && <X size={9} className="mr-1" />}
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
                placeholder="e.g. Remote, US, UK"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <button
                type="button"
                onClick={() => setRemote(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${remote ? 'bg-brand-500' : 'bg-slate-700'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${remote ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm text-slate-400">Remote preferred</span>
            </div>
          </div>
        </div>

        {/* Change password */}
        <div className="card p-5 space-y-3">
          <h2 className="font-medium text-slate-200 text-sm">Change Password <span className="text-slate-600 font-normal">(optional)</span></h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Current password</label>
              <input
                type="password"
                className="input w-full"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">New password</label>
              <input
                type="password"
                className="input w-full"
                minLength={8}
                placeholder="Min 8 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
            </div>
          </div>
        </div>

        {mutation.isError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded-lg p-3">
            <AlertCircle size={14} className="shrink-0" />
            {(mutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save profile'}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {mutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
          {successMsg && (
            <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
              <CheckCircle2 size={15} />
              {successMsg}
            </div>
          )}
        </div>
      </form>
    </div>
  )
}
