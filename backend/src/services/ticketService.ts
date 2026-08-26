/**
 * Ticket business logic: creation, transitions, assignment, comments,
 * first-response recording, listing with SLA-state filtering, dashboard.
 */

import type { Priority, TicketStatus } from '@prisma/client';
import { AppError } from '../errors.js';
import { AuthUser, requireAgent, requireUser } from '../auth/index.js';
import { TicketRepository, TicketFilters, TicketWithRelations } from '../repositories/ticketRepository.js';
import { UserRepository } from '../repositories/userRepository.js';
import { HolidayRepository } from '../repositories/userRepository.js';
import { AppConfig } from '../config.js';
import {
  computeDueTimes,
  evaluateSla,
  SLAEvaluation,
  SLAState,
} from './sla/slaEngine.js';
import { HolidaySource } from './sla/businessCalendar.js';

/** Allowed transitions. CLOSED can only go to OPEN (explicit reopen). */
export const STATUS_TRANSITIONS: Readonly<Record<TicketStatus, readonly TicketStatus[]>> = {
  OPEN: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'OPEN', 'CLOSED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};

export function assertTransition(from: TicketStatus, to: TicketStatus): void {
  if (from === to) return; // idempotent no-op transitions allowed
  const allowed = STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new AppError(
      'INVALID_STATUS_TRANSITION',
      `Ticket cannot transition from ${from} to ${to}`,
    );
  }
}

export interface TicketPage {
  nodes: TicketWithRelations[];
  hasNextPage: boolean;
  endCursor: number | null;
}

export interface TicketDashboardStats {
  openTickets: number;
  inProgressTickets: number;
  atRiskTickets: number;
  breachedTickets: number;
}

export class TicketService {
  constructor(
    private readonly tickets: TicketRepository,
    private readonly users: UserRepository,
    private readonly holidays: HolidayRepository,
    private readonly config: AppConfig,
  ) {}

  private async holidaySource(): Promise<HolidaySource> {
    const dates = await this.holidays.holidayDates();
    return { isHoliday: (d: string): boolean => dates.has(d) };
  }

  evaluate(ticket: TicketWithRelations, now: Date): SLAEvaluation {
    return evaluateSla(
      {
        createdAt: ticket.createdAt,
        priority: ticket.priority,
        firstResponseAt: ticket.firstResponseAt,
        resolvedAt: ticket.resolvedAt,
        firstResponseDueAt: ticket.firstResponseDueAt,
        resolutionDueAt: ticket.resolutionDueAt,
      },
      now,
      this.config.businessHours,
      this.emptyHolidaySource(),
    );
  }

  private emptyHolidaySource(): HolidaySource {
    return { isHoliday: () => false };
  }

  /** SLA evaluation with live holidays from the DB (used in listings). */
  async evaluateWithHolidays(ticket: TicketWithRelations, now: Date): Promise<SLAEvaluation> {
    const source = await this.holidaySource();
    return evaluateSla(
      {
        createdAt: ticket.createdAt,
        priority: ticket.priority,
        firstResponseAt: ticket.firstResponseAt,
        resolvedAt: ticket.resolvedAt,
        firstResponseDueAt: ticket.firstResponseDueAt,
        resolutionDueAt: ticket.resolutionDueAt,
      },
      now,
      this.config.businessHours,
      source,
      this.config.slaPolicies,
    );
  }

  async createTicket(actor: AuthUser | null, title: string, description: string, priority: Priority): Promise<TicketWithRelations> {
    requireUser(actor);
    const now = new Date();
    const source = await this.holidaySource();
    const due = computeDueTimes(now, priority, this.config.businessHours, source, this.config.slaPolicies);
    return this.tickets.create({
      title,
      description,
      priority,
      status: 'OPEN',
      reporter: { connect: { id: (actor as AuthUser).id } },
      firstResponseDueAt: due.firstResponseDueAt,
      resolutionDueAt: due.resolutionDueAt,
      createdAt: now,
    });
  }

  async getTicket(id: number): Promise<TicketWithRelations> {
    const t = await this.tickets.findById(id);
    if (t === null) throw new AppError('TICKET_NOT_FOUND', `Ticket ${id} not found`);
    return t;
  }

  async listTickets(actor: AuthUser | null, filters: TicketFilters): Promise<TicketPage> {
    requireUser(actor);
    const take = filters.take ?? 20;
    if (filters.slaState === undefined) {
      const rows = await this.tickets.findMany({ ...filters, take: take + 1 });
      const hasNextPage = rows.length > take;
      const nodes = rows.slice(0, take);
      const lastRow = nodes[nodes.length - 1];
      return { nodes, hasNextPage, endCursor: lastRow !== undefined ? lastRow.id : null };
    }
    // SLA-state filter: scan tickets (bounded), evaluate with holidays, filter,
    // then page in-memory.
    const state = filters.slaState;
    const all = await this.tickets.findManyForSlaScan({
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
      ...(filters.assigneeId !== undefined ? { assigneeId: filters.assigneeId } : {}),
    });
    const now = new Date();
    const source = await this.holidaySource();
    const matching: TicketWithRelations[] = [];
    for (const t of all) {
      const full = await this.tickets.findById(t.id);
      if (full === null) continue;
      const evalResult = evaluateSla(
        {
          createdAt: full.createdAt,
          priority: full.priority,
          firstResponseAt: full.firstResponseAt,
          resolvedAt: full.resolvedAt,
          firstResponseDueAt: full.firstResponseDueAt,
          resolutionDueAt: full.resolutionDueAt,
        },
        now,
        this.config.businessHours,
        source,
        this.config.slaPolicies,
      );
      if (governingState(evalResult) === state) matching.push(full);
    }
    const cursor = filters.cursor ?? null;
    const startIdx = matching.findIndex((t) => t.id === cursor);
    const slice = cursor === null ? matching : startIdx >= 0 ? matching.slice(startIdx + 1) : matching;
    const nodes = slice.slice(0, take);
    const lastNode = nodes[nodes.length - 1];
    return { nodes, hasNextPage: slice.length > take, endCursor: lastNode !== undefined ? lastNode.id : null };
  }

  async assignTicket(actor: AuthUser | null, ticketId: number, assigneeId: number): Promise<TicketWithRelations> {
    requireAgent(actor);
    const ticket = await this.getTicket(ticketId);
    const assignee = await this.users.findById(assigneeId);
    if (assignee === null) throw new AppError('USER_NOT_FOUND', `User ${assigneeId} not found`);
    if (assignee.role !== 'AGENT') {
      throw new AppError('VALIDATION_ERROR', 'Tickets can only be assigned to AGENT users');
    }
    return this.tickets.update(ticket.id, { assignee: { connect: { id: assigneeId } } });
  }

  async changeStatus(actor: AuthUser | null, ticketId: number, status: TicketStatus): Promise<TicketWithRelations> {
    requireAgent(actor);
    const ticket = await this.getTicket(ticketId);
    assertTransition(ticket.status, status);
    const data: { status: TicketStatus; resolvedAt?: Date | null } = { status };
    if (status === 'RESOLVED' && ticket.resolvedAt === null) {
      data.resolvedAt = new Date();
    }
    if (status === 'OPEN' && ticket.resolvedAt !== null) {
      // Reopening after resolution clears the resolution timestamp so the
      // resolution SLA clock resumes (documented rule).
      data.resolvedAt = null;
    }
    return this.tickets.update(ticket.id, data);
  }

  async resolveTicket(actor: AuthUser | null, ticketId: number): Promise<TicketWithRelations> {
    requireAgent(actor);
    const ticket = await this.getTicket(ticketId);
    assertTransition(ticket.status, 'RESOLVED');
    if (ticket.resolvedAt === null) {
      return this.tickets.update(ticket.id, { status: 'RESOLVED', resolvedAt: new Date() });
    }
    return this.tickets.update(ticket.id, { status: 'RESOLVED' });
  }

  async addComment(actor: AuthUser | null, ticketId: number, content: string): Promise<{ comment: { id: number; content: string; createdAt: Date; author: AuthUser }; ticket: TicketWithRelations }> {
    const user = requireUser(actor);
    const ticket = await this.getTicket(ticketId);
    const comment = await this.tickets.addComment({
      content,
      author: { connect: { id: user.id } },
      ticket: { connect: { id: ticket.id } },
    });
    let updated = ticket;
    if (ticket.firstResponseAt === null && user.id !== ticket.reporterId) {
      await this.tickets.setFirstResponseIfUnset(ticket.id, comment.createdAt);
      const full = await this.tickets.findById(ticket.id);
      if (full !== null) updated = full;
    }
    return {
      comment: { id: comment.id, content: comment.content, createdAt: comment.createdAt, author: user },
      ticket: updated,
    };
  }

  async dashboard(): Promise<TicketDashboardStats> {
    const [openTickets, inProgressTickets] = await Promise.all([
      this.tickets.count({ status: 'OPEN' }),
      this.tickets.count({ status: 'IN_PROGRESS' }),
    ]);
    const all = await this.tickets.findManyForSlaScan({});
    const now = new Date();
    const source = await this.holidaySource();
    let atRisk = 0;
    let breached = 0;
    for (const t of all) {
      const evalResult = evaluateSla(
        {
          createdAt: t.createdAt,
          priority: t.priority,
          firstResponseAt: t.firstResponseAt,
          resolvedAt: t.resolvedAt,
          firstResponseDueAt: t.firstResponseDueAt,
          resolutionDueAt: t.resolutionDueAt,
        },
        now,
        this.config.businessHours,
        source,
        this.config.slaPolicies,
      );
      const state = governingState(evalResult);
      if (state === 'AT_RISK') atRisk += 1;
      else if (state === 'BREACHED') breached += 1;
    }
    return { openTickets, inProgressTickets, atRiskTickets: atRisk, breachedTickets: breached };
  }
}

/** The governing SLA clock: first-response until answered, then resolution. */
export function governingState(sla: SLAEvaluation): SLAState {
  if (sla.firstResponse.state !== 'MET' && sla.firstResponse.state !== 'ON_TRACK') {
    // Frozen-or-active logic: if the FR clock is not yet answered and not
    // healthy, it governs.
    if (sla.firstResponse.state === 'BREACHED') return 'BREACHED';
    if (sla.firstResponse.state === 'AT_RISK') return 'AT_RISK';
  }
  return sla.resolution.state;
}
