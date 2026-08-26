export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
export type SLAState = 'ON_TRACK' | 'AT_RISK' | 'BREACHED' | 'MET'
export type UserRole = 'REPORTER' | 'AGENT'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
}

export interface Comment {
  id: string
  body: string
  createdAt: string
  author: User
}

export interface SLAInfo {
  firstResponseDueAt: string
  resolutionDueAt: string
  firstResponseState: SLAState
  resolutionState: SLAState
  firstResponseRemainingMinutes: number | null
  resolutionRemainingMinutes: number | null
}

export interface Ticket {
  id: string
  title: string
  description: string
  status: TicketStatus
  priority: Priority
  reporter: User
  assignee: User | null
  createdAt: string
  updatedAt: string
  firstResponseAt: string | null
  resolvedAt: string | null
  sla: SLAInfo
}

export interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

export interface TicketConnection {
  totalCount: number
  pageInfo: PageInfo
  edges: { cursor: string; node: Ticket }[]
}

export interface Dashboard {
  openTickets: number
  inProgressTickets: number
  atRiskTickets: number
  breachedTickets: number
}

export interface Holiday {
  id: string
  date: string
  name: string
}

export interface AuthPayload {
  token: string
  user: User
}
