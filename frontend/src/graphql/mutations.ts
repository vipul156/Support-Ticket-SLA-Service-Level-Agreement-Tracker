import { gql } from './client'
import type { AuthPayload, Ticket } from './types'

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

export async function createTicket(vars: {
  title: string
  description: string
  priority: string
}): Promise<Ticket> {
  const data = await gql<{ createTicket: Ticket }>(
    `mutation CreateTicket($title: String!, $description: String!, $priority: Priority!) {
      createTicket(title: $title, description: $description, priority: $priority) {
        ${TICKET_FIELDS}
      }
    }`,
    vars,
  )
  return data.createTicket
}

export async function assignTicket(
  ticketId: string,
  assigneeId: string,
): Promise<Ticket> {
  const data = await gql<{ assignTicket: Ticket }>(
    `mutation AssignTicket($ticketId: ID!, $assigneeId: ID!) {
      assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) {
        ${TICKET_FIELDS}
      }
    }`,
    { ticketId, assigneeId },
  )
  return data.assignTicket
}

export async function changeTicketStatus(
  ticketId: string,
  status: string,
): Promise<Ticket> {
  const data = await gql<{ changeTicketStatus: Ticket }>(
    `mutation ChangeStatus($ticketId: ID!, $status: TicketStatus!) {
      changeTicketStatus(ticketId: $ticketId, status: $status) {
        ${TICKET_FIELDS}
      }
    }`,
    { ticketId, status },
  )
  return data.changeTicketStatus
}

export async function addComment(
  ticketId: string,
  body: string,
): Promise<{ id: string }> {
  const data = await gql<{ addComment: { id: string } }>(
    `mutation AddComment($ticketId: ID!, $body: String!) {
      addComment(ticketId: $ticketId, body: $body) { id }
    }`,
    { ticketId, body },
  )
  return data.addComment
}

export async function resolveTicket(ticketId: string): Promise<Ticket> {
  const data = await gql<{ resolveTicket: Ticket }>(
    `mutation ResolveTicket($ticketId: ID!) {
      resolveTicket(ticketId: $ticketId) {
        ${TICKET_FIELDS}
      }
    }`,
    { ticketId },
  )
  return data.resolveTicket
}

export async function login(email: string, password: string): Promise<AuthPayload> {
  const data = await gql<{ login: AuthPayload }>(
    `mutation Login($email: String!, $password: String!) {
      login(email: $email, password: $password) { token user { id email name role } }
    }`,
    { email, password },
  )
  return data.login
}

export async function register(
  email: string,
  name: string,
  password: string,
  role: string,
): Promise<AuthPayload> {
  const data = await gql<{ register: AuthPayload }>(
    `mutation Register($email: String!, $name: String!, $password: String!, $role: UserRole) {
      register(email: $email, name: $name, password: $password, role: $role) {
        token user { id email name role }
      }
    }`,
    { email, name, password, role },
  )
  return data.register
}
