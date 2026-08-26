import { useCallback, useEffect, useState } from 'react'
import { fetchTicket, fetchUsers } from '../graphql/queries'
import {
  addComment,
  assignTicket,
  changeTicketStatus,
  resolveTicket,
} from '../graphql/mutations'
import { ApiError } from '../graphql/client'
import { useAuth } from '../auth/AuthContext'
import { formatDateTime, formatMinutes } from '../format/time'
import { priorityStyles, slaStyles, statusStyles } from '../format/badges'
import type { Ticket, TicketStatus, User } from '../graphql/types'

const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

interface TicketWithComments extends Ticket {
  comments: {
    id: string
    body: string
    createdAt: string
    author: User
  }[]
}

export function TicketDetailPage({ ticketId }: { ticketId: string }): JSX.Element {
  const { user } = useAuth()
  const [ticket, setTicket] = useState<TicketWithComments | null>(null)
  const [agents, setAgents] = useState<User[]>([])
  const [commentBody, setCommentBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const t = await fetchTicket(ticketId)
      setTicket(t as TicketWithComments)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Failed to load')
    }
  }, [ticketId])

  useEffect(() => {
    void load()
    void fetchUsers('AGENT').then(setAgents).catch(() => undefined)
  }, [load])

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
      await load()
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  if (ticket === null) {
    return <div className="boot">{error ?? 'Loading…'}</div>
  }

  const isAgent = user?.role === 'AGENT'

  return (
    <article className="detail">
      <a href="#/" className="back-link">← All tickets</a>
      <header className="detail-head">
        <h1>{ticket.title}</h1>
        <div className="badge-row">
          <span className={statusStyles[ticket.status]}>{ticket.status}</span>
          <span className={priorityStyles[ticket.priority]}>{ticket.priority}</span>
          <span className={slaStyles[ticket.sla.resolutionState]}>
            {ticket.sla.resolutionState}
          </span>
        </div>
      </header>

      <div className="detail-grid">
        <div className="panel">
          <h3>Description</h3>
          <p className="pre-wrap">{ticket.description}</p>
          <dl className="meta">
            <div><dt>Reporter</dt><dd>{ticket.reporter.name} ({ticket.reporter.email})</dd></div>
            <div><dt>Assignee</dt><dd>{ticket.assignee?.name ?? 'unassigned'}</dd></div>
            <div><dt>Created</dt><dd>{formatDateTime(ticket.createdAt)}</dd></div>
            <div><dt>First response</dt><dd>{ticket.firstResponseAt !== null ? formatDateTime(ticket.firstResponseAt) : '—'}</dd></div>
            <div><dt>Resolved</dt><dd>{ticket.resolvedAt !== null ? formatDateTime(ticket.resolvedAt) : '—'}</dd></div>
          </dl>
        </div>

        <div className="panel">
          <h3>SLA</h3>
          <dl className="meta">
            <div>
              <dt>First response due</dt>
              <dd>
                {formatDateTime(ticket.sla.firstResponseDueAt)}
                <span className={slaStyles[ticket.sla.firstResponseState]}>
                  {' '}{ticket.sla.firstResponseState}
                </span>
                {ticket.sla.firstResponseRemainingMinutes !== null && (
                  <div className="sub">
                    {formatMinutes(ticket.sla.firstResponseRemainingMinutes)} remaining
                  </div>
                )}
              </dd>
            </div>
            <div>
              <dt>Resolution due</dt>
              <dd>
                {formatDateTime(ticket.sla.resolutionDueAt)}
                <span className={slaStyles[ticket.sla.resolutionState]}>
                  {' '}{ticket.sla.resolutionState}
                </span>
                {ticket.sla.resolutionRemainingMinutes !== null && (
                  <div className="sub">
                    {formatMinutes(ticket.sla.resolutionRemainingMinutes)} remaining
                  </div>
                )}
              </dd>
            </div>
          </dl>
          <p className="hint">
            SLA states are computed server-side in business hours; the browser only
            displays the values returned by the API.
          </p>
        </div>
      </div>

      <div className="panel actions-panel">
        <h3>Actions</h3>
        {error !== null && <div className="error-banner">{error}</div>}
        <div className="action-row">
          <label>
            Assign to
            <select
              value={ticket.assignee?.id ?? ''}
              disabled={!isAgent || busy}
              onChange={(e) => void run(() => assignTicket(ticketId, e.target.value))}
            >
              <option value="" disabled>
                {ticket.assignee === null ? 'unassigned' : 'change assignee'}
              </option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={ticket.status}
              disabled={!isAgent || busy}
              onChange={(e) => void run(() => changeTicketStatus(ticketId, e.target.value))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-primary"
            disabled={!isAgent || busy || ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'}
            onClick={() => void run(() => resolveTicket(ticketId))}
          >
            Resolve
          </button>
        </div>
        {!isAgent && (
          <p className="hint">Sign in as an agent to assign or change status.</p>
        )}
      </div>

      <div className="panel">
        <h3>Comments</h3>
        <ul className="comment-thread">
          {ticket.comments.map((c) => (
            <li key={c.id} className="comment">
              <div className="comment-head">
                <strong>{c.author.name}</strong>
                <span className="role-chip">{c.author.role}</span>
                <time>{formatDateTime(c.createdAt)}</time>
              </div>
              <p className="pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
        <form
          className="comment-form"
          onSubmit={async (e) => {
            e.preventDefault()
            if (commentBody.trim() === '') return
            await run(async () => {
              await addComment(ticketId, commentBody)
              setCommentBody('')
            })
          }}
        >
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment…"
            required
          />
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Comment
          </button>
        </form>
      </div>
    </article>
  )
}
