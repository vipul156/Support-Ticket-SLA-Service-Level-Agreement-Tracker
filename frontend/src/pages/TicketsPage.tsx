import { useCallback, useEffect, useState } from 'react'
import { fetchDashboard, fetchTickets, fetchUsers } from '../graphql/queries'
import { createTicket } from '../graphql/mutations'
import { ApiError } from '../graphql/client'
import { useAuth } from '../auth/AuthContext'
import { formatDateTime, formatMinutes } from '../format/time'
import {
  priorityStyles,
  slaStyles,
  statusStyles,
} from '../format/badges'
import type {
  Priority,
  SLAState,
  Ticket,
  TicketStatus,
  User,
} from '../graphql/types'

const PRIORITIES: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']
const STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']
const SLA_STATES: SLAState[] = ['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET']

type SortKey = 'createdAt' | 'priority' | 'sla'

export function TicketsPage(): JSX.Element {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [total, setTotal] = useState(0)
  const [users, setUsers] = useState<User[]>([])
  const [dashboard, setDashboard] = useState<{
    openTickets: number
    inProgressTickets: number
    atRiskTickets: number
    breachedTickets: number
  } | null>(null)

  const [status, setStatus] = useState<'' | TicketStatus>('')
  const [priority, setPriority] = useState<'' | Priority>('')
  const [assigneeId, setAssigneeId] = useState('')
  const [slaState, setSlaState] = useState<'' | SLAState>('')
  const [sort, setSort] = useState<SortKey>('createdAt')
  const [search, setSearch] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    try {
      const conn = await fetchTickets({
        status: status === '' ? undefined : status,
        priority: priority === '' ? undefined : priority,
        assigneeId: assigneeId === '' ? undefined : assigneeId,
        slaState: slaState === '' ? undefined : slaState,
        take: 50,
      })
      setTickets(conn.nodes)
      setTotal(conn.nodes.length)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Failed to load')
    }
  }, [status, priority, assigneeId, slaState])

  useEffect(() => {
    void load()
    void fetchDashboard().then(setDashboard).catch(() => undefined)
    void fetchUsers('AGENT').then(setUsers).catch(() => undefined)
  }, [load])

  const visible = applySort(
    tickets.filter((t) =>
      search === ''
        ? true
        : `${t.title} ${t.reporter.email} ${t.assignee?.email ?? ''}`
            .toLowerCase()
            .includes(search.toLowerCase()),
    ),
    sort,
  )

  return (
    <>
      <section className="stats-row">
        <StatCard label="Open" value={dashboard?.openTickets} tone="open" />
        <StatCard label="In progress" value={dashboard?.inProgressTickets} tone="wip" />
        <StatCard label="At risk" value={dashboard?.atRiskTickets} tone="risk" />
        <StatCard label="Breached" value={dashboard?.breachedTickets} tone="breach" />
      </section>

      <section className="toolbar">
        <input
          className="search"
          placeholder="Search title or people…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | TicketStatus)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value as '' | Priority)}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Any assignee</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={slaState} onChange={(e) => setSlaState(e.target.value as '' | SLAState)}>
          <option value="">Any SLA state</option>
          {SLA_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="createdAt">Newest first</option>
          <option value="priority">Priority</option>
          <option value="sla">SLA remaining</option>
        </select>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          New ticket
        </button>
      </section>

      {error !== null && <div className="error-banner">{error}</div>}

      <table className="ticket-table">
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Assignee</th>
            <th>SLA</th>
            <th>First response due</th>
            <th>Resolution due</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((t) => (
            <TicketRow key={t.id} ticket={t} />
          ))}
        </tbody>
      </table>
      <p className="hint">
        {visible.length} of {total} tickets shown (server-filtered, take 50).
      </p>

      {showCreate && (
        <CreateDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            void load()
            void fetchDashboard().then(setDashboard).catch(() => undefined)
          }}
        />
      )}
      {user === null && <p className="hint">Sign in to create tickets.</p>}
    </>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number | undefined
  tone: 'open' | 'wip' | 'risk' | 'breach'
}): JSX.Element {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-value">{value ?? '…'}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function applySort(tickets: Ticket[], sort: SortKey): Ticket[] {
  const copy = [...tickets]
  if (sort === 'priority') {
    const order: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
    copy.sort((a, b) => order[a.priority] - order[b.priority])
  } else if (sort === 'sla') {
    copy.sort((a, b) => worstRemaining(a) - worstRemaining(b))
  } else {
    copy.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  }
  return copy
}

function worstRemaining(t: Ticket): number {
  return Math.min(t.sla.firstResponseRemainingMinutes, t.sla.resolutionRemainingMinutes)
}

function TicketRow({ ticket }: { ticket: Ticket }): JSX.Element {
  const worst = worstRemaining(ticket)
  return (
    <tr>
      <td>
        <a className="ticket-link" href={`#/tickets/${ticket.id}`}>
          <strong>{ticket.title}</strong>
          <div className="sub">#{ticket.id.slice(0, 8)} · {ticket.reporter.name}</div>
        </a>
      </td>
      <td><span className={statusStyles[ticket.status]}>{ticket.status}</span></td>
      <td><span className={priorityStyles[ticket.priority]}>{ticket.priority}</span></td>
      <td>{ticket.assignee?.name ?? <em>unassigned</em>}</td>
      <td>
        <span className={slaStyles[ticket.sla.resolutionState]}>
          {ticket.sla.resolutionState}
        </span>
        {worst !== null && (
          <div className="sub">{formatMinutes(worst)} left</div>
        )}
      </td>
      <td>
        <span className={slaStyles[ticket.sla.firstResponseState]}>
          {ticket.sla.firstResponseState}
        </span>
        {ticket.sla.firstResponseRemainingMinutes !== null && (
          <div className="sub">{formatMinutes(ticket.sla.firstResponseRemainingMinutes)} left</div>
        )}
      </td>
      <td>{formatDateTime(ticket.sla.firstResponseDueAt)}</td>
      <td>{formatDateTime(ticket.sla.resolutionDueAt)}</td>
      <td>{formatDateTime(ticket.createdAt)}</td>
    </tr>
  )
}

function CreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await createTicket({ title, description, priority })
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Failed to create')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2>New ticket</h2>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        {error !== null && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            Create
          </button>
        </div>
      </form>
    </div>
  )
}

