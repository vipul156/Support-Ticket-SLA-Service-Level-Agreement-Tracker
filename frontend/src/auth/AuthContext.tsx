import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { getToken, setToken } from '../graphql/client'
import type { User } from '../graphql/types'

export interface AuthContextValue {
  user: User | null
  token: string | null
  signIn: (user: User, token: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTokenState] = useState<string | null>(getToken())

  const signIn = useCallback((nextUser: User, nextToken: string): void => {
    setToken(nextToken)
    setTokenState(nextToken)
    setUser(nextUser)
  }, [])

  const signOut = useCallback((): void => {
    setToken(null)
    setTokenState(null)
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, signIn, signOut }),
    [user, token, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
