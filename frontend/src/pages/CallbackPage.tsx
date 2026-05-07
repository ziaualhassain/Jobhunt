import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth0 } from '@auth0/auth0-react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { loginWithAuth0Token } from '../lib/api'

export default function CallbackPage() {
  const { isAuthenticated, isLoading, error, getIdTokenClaims } = useAuth0()
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (isLoading) return
    if (error || !isAuthenticated) { navigate('/login', { replace: true }); return }

    getIdTokenClaims().then(async claims => {
      const rawToken = claims?.__raw
      if (!rawToken) { navigate('/login', { replace: true }); return }
      try {
        const { token, user } = await loginWithAuth0Token(rawToken)
        login(token, user)
        navigate('/', { replace: true })
      } catch (err) {
        console.error('[Callback] token exchange failed:', err)
        navigate('/login', { replace: true })
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isAuthenticated, error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-400">
      <Loader2 size={32} className="animate-spin text-brand-400" />
      <span className="text-sm">Signing you in…</span>
    </div>
  )
}
