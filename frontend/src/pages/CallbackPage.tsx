import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { loginWithAuth0Token } from '../lib/api'

export default function CallbackPage() {
  const { isAuthenticated, isLoading, error: auth0Error, getIdTokenClaims } = useAuth0()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoading) return
    if (auth0Error) { setError(`Auth0 error: ${auth0Error.message}`); return }
    if (!isAuthenticated) { navigate('/login', { replace: true }); return }

    getIdTokenClaims()
      .then(async claims => {
        console.log('[Callback] claims:', claims)
        const rawToken = claims?.__raw
        if (!rawToken) {
          setError('No ID token returned from Auth0. Make sure the openid scope is enabled.')
          return
        }
        const { token, user } = await loginWithAuth0Token(rawToken)
        login(token, user)
        navigate('/', { replace: true })
      })
      .catch((err: unknown) => {
        console.error('[Callback] error:', err)
        const e = err as { response?: { data?: { error?: string } }; message?: string }
        setError(e.response?.data?.error ?? e.message ?? 'Unknown error during sign-in')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, auth0Error])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="card p-6 max-w-sm w-full space-y-3">
          <div className="flex items-center gap-2 text-red-400">
            <AlertCircle size={18} />
            <span className="font-semibold text-sm">Sign-in failed</span>
          </div>
          <p className="text-sm text-slate-300 font-mono break-all bg-slate-800 rounded p-2">{error}</p>
          <Link to="/login" replace className="btn-primary w-full text-center block text-sm">
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-400">
      <Loader2 size={32} className="animate-spin text-brand-400" />
      <span className="text-sm">Signing you in…</span>
    </div>
  )
}
