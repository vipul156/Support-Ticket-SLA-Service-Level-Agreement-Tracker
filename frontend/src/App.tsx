import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './pages/LoginPage'
import { TicketsPage } from './pages/TicketsPage'
import { TicketDetailPage } from './pages/TicketDetailPage'
import type { User } from './graphql/types'
import { getToken } from './graphql/client'

function decodeUser(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''))
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') return null
    return {
      id: String(payload.sub),
      name: typeof payload.name === 'string' ? payload.name : '',
      email: typeof payload.email === 'string' ? payload.email : '',
      role: payload.role === 'AGENT' ? 'AGENT' : 'REPORTER',
    }
  } catch {
    return null
  }
}

function CurrentUserChip(): JSX.Element {
  const { user } = useAuth()
  if (user === null) return <span className="user-chip">not signed in</span>
  return (
    <span className="user-chip">
      {user.name} · {user.role === 'AGENT' ? 'Agent' : 'Reporter'}
    </span>
  )
}

function Shell(): JSX.Element {
  const { token, user, signOut } = useAuth()
  const [route, setRoute] = useState<string>(window.location.hash)

  useEffect(() => {
    const onHash = (): void => setRoute(window.location.hash)
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (token === null || user === null) {
    return <LoginPage />
  }

  const detailMatch = /^#\/tickets\/(.+)$/.exec(route)
  let page: ReactNode
  if (detailMatch !== null && detailMatch[1] !== undefined) {
    page = <TicketDetailPage ticketId={detailMatch[1]} />
  } else {
    page = <TicketsPage />
  }

  return (
    <div className="app">
      <header className="topbar">
        <a href="#/" className="brand">
          SLA&nbsp;Tracker
        </a>
        <nav>
          <a href="#/">Tickets</a>
        </nav>
        <CurrentUserChip />
        <button className="btn btn-ghost" onClick={signOut}>
          Sign out
        </button>
      </header>
      <main className="main">{page}</main>
    </div>
  )
}

function Root(): JSX.Element {
  const { signIn } = useAuth()
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const storedToken = getToken()
    if (storedToken !== null) {
      const user = decodeUser(storedToken)
      if (user !== null) {
        signIn(user, storedToken)
      } else {
        window.localStorage.removeItem('sla_tracker_token')
      }
    }
    setBooting(false)
  }, [signIn])

  if (booting) return <div className="boot">Loading…</div>
  return <Shell />
}

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}
