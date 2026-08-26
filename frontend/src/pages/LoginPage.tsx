import { useState } from 'react'
import { login, register } from '../graphql/mutations'
import { ApiError } from '../graphql/client'
import { useAuth } from '../auth/AuthContext'

export function LoginPage(): JSX.Element {
  const { signIn } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'REPORTER' | 'AGENT'>('REPORTER')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const payload =
        mode === 'login'
          ? await login(email, password)
          : await register(email, name, password, role)
      signIn(payload.user, payload.token)
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Support Ticket &amp; SLA Tracker</h1>
        <p className="hint">
          {mode === 'login' ? 'Sign in to continue' : 'Create an account'}
        </p>
        {mode === 'register' && (
          <>
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label>
              Role
              <select value={role} onChange={(e) => setRole(e.target.value === 'AGENT' ? 'AGENT' : 'REPORTER')}>
                <option value="REPORTER">Reporter</option>
                <option value="AGENT">Agent</option>
              </select>
            </label>
          </>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error !== null && <div className="error-banner">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Register'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </form>
    </div>
  )
}
