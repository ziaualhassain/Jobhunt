import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { getMe, loginWithAuth0Token } from '../lib/api'

export interface User {
  id: number
  email: string
  name: string
}

interface AuthContextValue {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: auth0Loading, getIdTokenClaims, logout: auth0Logout } = useAuth0()
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (auth0Loading) return

    async function init() {
      // Case 1: stored app JWT → verify with backend
      const stored = localStorage.getItem('token')
      if (stored) {
        try {
          const u = await getMe()
          setUser(u)
        } catch {
          localStorage.removeItem('token')
          setToken(null)
        } finally {
          setLoading(false)
        }
        return
      }

      // Case 2: Auth0 just completed social login → exchange ID token for app JWT
      if (isAuthenticated) {
        try {
          const claims = await getIdTokenClaims()
          const rawToken = claims?.__raw
          if (!rawToken) { setLoading(false); return }
          const { token: appToken, user: appUser } = await loginWithAuth0Token(rawToken)
          localStorage.setItem('token', appToken)
          setToken(appToken)
          setUser(appUser)
        } catch (err) {
          console.error('[Auth] Auth0 token exchange failed:', err)
        } finally {
          setLoading(false)
        }
        return
      }

      // Case 3: no session at all
      setLoading(false)
    }

    init()
  // auth0Loading and isAuthenticated are the only external triggers;
  // intentionally excluding token/getMe/getIdTokenClaims to avoid re-run loops
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth0Loading, isAuthenticated])

  const login = useCallback((t: string, u: User) => {
    localStorage.setItem('token', t)
    setToken(t)
    setUser(u)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    auth0Logout({ logoutParams: { returnTo: window.location.origin } })
  }, [auth0Logout])

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading: loading || auth0Loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
