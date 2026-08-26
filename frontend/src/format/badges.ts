import type { SLAState, TicketStatus, Priority } from '../graphql/types'

export const statusStyles: Record<TicketStatus, string> = {
  OPEN: 'badge status-open',
  IN_PROGRESS: 'badge status-inprogress',
  RESOLVED: 'badge status-resolved',
  CLOSED: 'badge status-closed',
}

export const priorityStyles: Record<Priority, string> = {
  LOW: 'badge priority-low',
  MEDIUM: 'badge priority-medium',
  HIGH: 'badge priority-high',
  URGENT: 'badge priority-urgent',
}

export const slaStyles: Record<SLAState, string> = {
  ON_TRACK: 'badge sla-ontrack',
  AT_RISK: 'badge sla-atrisk',
  BREACHED: 'badge sla-breached',
  MET: 'badge sla-met',
}
