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

  // Restore session from stored JWT on mount (wait for Auth0 to finish loading first)
  useEffect(() => {
    if (auth0Loading) return
    if (!token) { setLoading(false); return }
    getMe()
      .then(setUser)
      .catch(() => { localStorage.removeItem('token'); setToken(null) })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth0Loading])

  // Exchange Auth0 ID token for our app JWT after social login
  useEffect(() => {
    if (auth0Loading || !isAuthenticated || token) return
    getIdTokenClaims().then(async claims => {
      const rawToken = claims?.__raw
      if (!rawToken) return
      try {
        const { token: appToken, user: appUser } = await loginWithAuth0Token(rawToken)
        localStorage.setItem('token', appToken)
        setToken(appToken)
        setUser(appUser)
      } catch (err) {
        console.error('[Auth] Auth0 token exchange failed:', err)
      } finally {
        setLoading(false)
      }
    })
  }, [isAuthenticated, auth0Loading, token, getIdTokenClaims])

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
