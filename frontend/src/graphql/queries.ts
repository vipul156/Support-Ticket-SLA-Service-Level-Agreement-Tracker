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
  createdAt firstResponseAt resolvedAt
  reporter { id name email role }
  assignee { id name email role }
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
    `query Tickets($filters: TicketFiltersInput, $take: Int, $cursor: String) {
      tickets(filters: $filters, take: $take, cursor: $cursor) {
        nodes { ${TICKET_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    {
      filters:
        vars.status === undefined &&
        vars.priority === undefined &&
        vars.assigneeId === undefined &&
        vars.slaState === undefined
          ? undefined
          : {
              status: vars.status,
              priority: vars.priority,
              assigneeId: vars.assigneeId,
              slaState: vars.slaState,
            },
      take: vars.take,
      cursor: vars.cursor,
    },
  )
  return data.tickets
}

export async function fetchTicket(id: string): Promise<Ticket> {
  const data = await gql<{ ticket: Ticket }>(
    `query Ticket($id: ID!) {
      ticket(id: $id) {
        ${TICKET_FIELDS}
        comments { id content createdAt author { id name email role } }
      }
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
    `query Users($role: UserRole) { users(role: $role) { id name email role } }`,
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
