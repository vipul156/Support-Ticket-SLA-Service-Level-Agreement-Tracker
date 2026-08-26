import { gql } from './client'
import type {
  Dashboard,
  Holiday,
  Ticket,
  TicketConnection,
  User,
} from './types'

const TICKET_FIELDS = `
  id title description status priority
  createdAt updatedAt firstResponseAt resolvedAt
  reporter { id email name role }
  assignee { id email name role }
  sla {
    firstResponseDueAt resolutionDueAt
    firstResponseState resolutionState
    firstResponseRemainingMinutes resolutionRemainingMinutes
  }
`

export async function fetchTickets(vars: {
  status?: string
  priority?: string
  assigneeId?: string
  slaState?: string
  take?: number
  cursor?: string
}): Promise<TicketConnection> {
  const data = await gql<{ tickets: TicketConnection }>(
    `query Tickets($status: TicketStatus, $priority: Priority, $assigneeId: ID, $slaState: SLAState, $take: Int, $cursor: String) {
      tickets(status: $status, priority: $priority, assigneeId: $assigneeId, slaState: $slaState, take: $take, cursor: $cursor) {
        totalCount
        pageInfo { hasNextPage endCursor }
        edges { cursor node { ${TICKET_FIELDS} } }
      }
    }`,
    vars,
  )
  return data.tickets
}

export async function fetchTicket(id: string): Promise<Ticket> {
  const data = await gql<{ ticket: Ticket }>(
    `query Ticket($id: ID!) {
      ticket(id: $id) { ${TICKET_FIELDS} comments { id body createdAt author { id email name role } } }
    }`,
    { id },
  )
  return data.ticket
}

export async function fetchDashboard(): Promise<Dashboard> {
  const data = await gql<{ dashboard: Dashboard }>(
    `query Dashboard { dashboard { openTickets inProgressTickets atRiskTickets breachedTickets } }`,
  )
  return data.dashboard
}

export async function fetchUsers(role?: string): Promise<User[]> {
  const data = await gql<{ users: User[] }>(
    `query Users($role: UserRole) { users(role: $role) { id email name role } }`,
    role !== undefined && role !== '' ? { role } : {},
  )
  return data.users
}

export async function fetchHolidays(): Promise<Holiday[]> {
  const data = await gql<{ holidays: Holiday[] }>(
    `query Holidays { holidays { id date name } }`,
  )
  return data.holidays
}
