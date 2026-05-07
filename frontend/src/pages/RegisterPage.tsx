import { useState } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { Cloud, Loader2, AlertCircle } from 'lucide-react'
import { useAuth0 } from '@auth0/auth0-react'
import { registerUser } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const { login, user } = useAuth()
  const { loginWithRedirect, isLoading: auth0Loading } = useAuth0()
  const navigate = useNavigate()

  if (user) return <Navigate to="/" replace />
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { token, user } = await registerUser(name, email, password)
      login(token, user)
      navigate('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error ?? 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Cloud size={28} className="text-brand-400" />
          <span className="text-2xl font-bold text-brand-400">JobHunters</span>
        </div>

        <div className="card p-6 space-y-4">
          <h1 className="text-lg font-semibold text-slate-100">Create account</h1>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              className="input w-full"
              placeholder="Full name"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              autoFocus
            />
            <input
              type="email"
              className="input w-full"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="input w-full"
              placeholder="Password (min 8 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              minLength={8}
              required
            />

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/20 border border-red-900 rounded-lg p-3">
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={loading}
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700" /></div>
            <div className="relative flex justify-center text-xs text-slate-500"><span className="bg-slate-900 px-2">or</span></div>
          </div>

          <button
            type="button"
            onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } })}
            disabled={auth0Loading}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            {auth0Loading ? <Loader2 size={15} className="animate-spin" /> : (
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/>
              </svg>
            )}
            Sign up with Google / Social
          </button>

          <p className="text-sm text-slate-500 text-center">
            Have an account?{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
