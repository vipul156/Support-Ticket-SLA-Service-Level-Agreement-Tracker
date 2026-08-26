/**
 * Integration tests against a REAL PostgreSQL database (sla_tracker_test).
 * PostgreSQL is not mocked: these exercise the actual Prisma persistence
 * layer end-to-end, including first-response recording and persisted SLA data.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient, Priority } from '@prisma/client';
import { hash } from 'bcryptjs';
import { TicketService } from '../../src/services/ticketService.js';
import { TicketRepository } from '../../src/repositories/ticketRepository.js';
import { UserRepository, HolidayRepository } from '../../src/repositories/userRepository.js';
import { AuthService } from '../../src/services/authService.js';
import { buildServices } from '../../src/graphql/context.js';
import { AppError } from '../../src/errors.js';
import { computeDueTimes } from '../../src/services/sla/slaEngine.js';
import { DEFAULT_BUSINESS_HOURS } from '../../src/services/sla/businessCalendar.js';

const TEST_DB = 'postgresql://sla_app:sla_app_password@127.0.0.1:5432/sla_tracker_test';

const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
const config = {
  port: 3000,
  databaseUrl: TEST_DB,
  jwtSecret: 'integration-test-secret',
  jwtExpiresIn: '1h',
  businessHours: { ...DEFAULT_BUSINESS_HOURS, timezone: 'Asia/Kolkata' },
  slaPolicies: {
    URGENT: { firstResponseBusinessMinutes: 60, resolutionBusinessMinutes: 240 },
    HIGH: { firstResponseBusinessMinutes: 240, resolutionBusinessMinutes: 1440 },
    MEDIUM: { firstResponseBusinessMinutes: 480, resolutionBusinessMinutes: 2880 },
    LOW: { firstResponseBusinessMinutes: 1440, resolutionBusinessMinutes: 4320 },
  },
};

const services = buildServices(prisma, config);

let reporterId: number;
let agentId: number;

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  // Clean slate per test for deterministic assertions.
  await prisma.comment.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.holiday.deleteMany({});
  await prisma.user.deleteMany({});

  const reporter = await prisma.user.create({
    data: { name: 'R', email: 'r@t.dev', passwordHash: await hash('password123', 10), role: 'REPORTER' },
  });
  const agent = await prisma.user.create({
    data: { name: 'A', email: 'a@t.dev', passwordHash: await hash('password123', 10), role: 'AGENT' },
  });
  reporterId = reporter.id;
  agentId = agent.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const reporterUser = (): { id: number; name: string; email: string; role: 'REPORTER' } => ({
  id: reporterId, name: 'R', email: 'r@t.dev', role: 'REPORTER',
});
const agentUser = (): { id: number; name: string; email: string; role: 'AGENT' } => ({
  id: agentId, name: 'A', email: 'a@t.dev', role: 'AGENT',
});

describe('ticket persistence (integration, real PostgreSQL)', () => {
  it('creates a ticket with persisted SLA due times', async () => {
    const ticket = await services.tickets.createTicket(reporterUser(), 'DB ticket', 'desc', Priority.URGENT);
    expect(ticket.id).toBeGreaterThan(0);
    expect(ticket.status).toBe('OPEN');
    expect(ticket.reporterId).toBe(reporterId);

    // Persisted due times must exist and be in the future.
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.firstResponseDueAt).toBeInstanceOf(Date);
    expect(stored.resolutionDueAt.getTime()).toBeGreaterThan(stored.firstResponseDueAt.getTime());

    // And must equal the engine's computation for the stored creation time.
    const due = computeDueTimes(stored.createdAt, 'URGENT', config.businessHours, { isHoliday: () => false });
    expect(stored.firstResponseDueAt.toISOString()).toBe(due.firstResponseDueAt.toISOString());
    expect(stored.resolutionDueAt.toISOString()).toBe(due.resolutionDueAt.toISOString());
  });

  it('records firstResponseAt on the first agent comment and freezes it', async () => {
    const ticket = await services.tickets.createTicket(reporterUser(), 'FR ticket', 'desc', Priority.HIGH);
    expect(ticket.firstResponseAt).toBeNull();

    // Reporter comments do NOT count as first response.
    await services.tickets.addComment(reporterUser(), ticket.id, 'reporter comment 1');
    await services.tickets.addComment(reporterUser(), ticket.id, 'reporter comment 2');
    let after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.firstResponseAt).toBeNull();

    // Agent (non-reporter) comment counts.
    const first = await services.tickets.addComment(agentUser(), ticket.id, 'agent response');
    after = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.firstResponseAt).not.toBeNull();
    expect(after.firstResponseAt?.toISOString()).toBe(first.comment.createdAt.toISOString());

    // Subsequent comments must not modify the timestamp.
    await services.tickets.addComment(agentUser(), ticket.id, 'agent follow-up');
    await services.tickets.addComment(reporterUser(), ticket.id, 'reporter reply');
    const frozen = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(frozen.firstResponseAt?.toISOString()).toBe(first.comment.createdAt.toISOString());

    // Comments are persisted with their author.
    const comments = await prisma.comment.findMany({ where: { ticketId: ticket.id }, orderBy: { id: 'asc' } });
    expect(comments).toHaveLength(5);
    expect(comments.map((c) => c.authorId)).toEqual([reporterId, reporterId, agentId, agentId, reporterId]);
  });

  it('persists status transitions and resolvedAt', async () => {
    const ticket = await services.tickets.createTicket(reporterUser(), 'T3', 'desc', Priority.MEDIUM);
    await services.tickets.assignTicket(agentUser(), ticket.id, agentId);

    let updated = await services.tickets.changeStatus(agentUser(), ticket.id, 'IN_PROGRESS');
    expect(updated.status).toBe('IN_PROGRESS');
    expect(updated.resolvedAt).toBeNull();
    expect((await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).assigneeId).toBe(agentId);

    updated = await services.tickets.resolveTicket(agentUser(), ticket.id);
    expect(updated.status).toBe('RESOLVED');
    expect(updated.resolvedAt).not.toBeNull();
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored.resolvedAt).not.toBeNull();

    // CLOSED → IN_PROGRESS must be rejected at the service layer.
    await services.tickets.changeStatus(agentUser(), ticket.id, 'CLOSED');
    await expect(services.tickets.changeStatus(agentUser(), ticket.id, 'IN_PROGRESS')).rejects.toMatchObject({
      code: 'INVALID_STATUS_TRANSITION',
    });
    // Reopen works.
    const reopened = await services.tickets.changeStatus(agentUser(), ticket.id, 'OPEN');
    expect(reopened.status).toBe('OPEN');
    expect(reopened.resolvedAt).toBeNull(); // clock resumed
  });

  it('enforces authorization against persisted roles', async () => {
    const ticket = await services.tickets.createTicket(reporterUser(), 'T4', 'desc', Priority.LOW);
    await expect(services.tickets.assignTicket(reporterUser(), ticket.id, agentId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(services.tickets.changeStatus(reporterUser, ticket.id, 'IN_PROGRESS')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(services.tickets.createTicket(null, 'T5', 'desc', Priority.LOW)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(services.tickets.assignTicket(agentUser(), ticket.id, 999_999)).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
    await expect(services.tickets.getTicket(999_999)).rejects.toBeInstanceOf(AppError);
  });

  it('lists with pagination, filters and SLA-state filtering', async () => {
    // Create tickets with staggered due times: one fresh ON_TRACK, one
    // backdated so its first-response clock is BREACHED.
    const fresh = await services.tickets.createTicket(reporterUser(), 'fresh', 'd', Priority.LOW);
    const backdated = await prisma.ticket.create({
      data: {
        title: 'old',
        description: 'd',
        priority: Priority.URGENT,
        status: 'OPEN',
        reporterId,
        createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
        firstResponseDueAt: new Date(Date.now() - 9 * 24 * 3600 * 1000),
        resolutionDueAt: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      },
    });

    const page = await services.tickets.listTickets(agentUser(), { take: 10 });
    expect(page.nodes.map((t) => t.id)).toContain(fresh.id);
    expect(page.nodes.map((t) => t.id)).toContain(backdated.id);
    expect(page.hasNextPage).toBe(false);

    const breachedOnly = await services.tickets.listTickets(agentUser(), { slaState: 'BREACHED', take: 10 });
    expect(breachedOnly.nodes.map((t) => t.id)).toContain(backdated.id);
    expect(breachedOnly.nodes.map((t) => t.id)).not.toContain(fresh.id);

    const byPriority = await services.tickets.listTickets(agentUser(), { priority: 'URGENT', take: 10 } as never);
    expect(byPriority.nodes.every((t) => t.priority === 'URGENT')).toBe(true);

    const byAssignee = await services.tickets.listTickets(agentUser(), { assigneeId: agentId, take: 10 });
    expect(byAssignee.nodes.every((t) => t.assigneeId === agentId)).toBe(true);
  });

  it('dashboard aggregates open/in-progress/at-risk/breached', async () => {
    await services.tickets.createTicket(reporterUser(), 'd1', 'd', Priority.LOW);
    await services.tickets.createTicket(reporterUser(), 'd2', 'd', Priority.MEDIUM);
    const t3 = await services.tickets.createTicket(reporterUser(), 'd3', 'd', Priority.HIGH);
    await services.tickets.changeStatus(agentUser(), t3.id, 'IN_PROGRESS');
    await prisma.ticket.create({
      data: {
        title: 'ancient',
        description: 'd',
        priority: Priority.URGENT,
        status: 'OPEN',
        reporterId,
        createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
        firstResponseDueAt: new Date(Date.now() - 29 * 24 * 3600 * 1000),
        resolutionDueAt: new Date(Date.now() - 28 * 24 * 3600 * 1000),
      },
    });
    const stats = await services.tickets.dashboard();
    expect(stats.openTickets).toBe(3);
    expect(stats.inProgressTickets).toBe(1);
    expect(stats.breachedTickets).toBeGreaterThanOrEqual(1);
  });

  it('auth service registers and logs in against the real DB', async () => {
    const payload = await services.auth.register('New', 'new@t.dev', 'password123', 'REPORTER');
    expect(payload.token).toBeTruthy();
    expect(payload.user.role).toBe('REPORTER');
    const login = await services.auth.login('new@t.dev', 'password123');
    expect(login.user.id).toBe(payload.user.id);
    await expect(services.auth.login('new@t.dev', 'wrong-password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await expect(services.auth.register('New', 'new@t.dev', 'password123', 'REPORTER')).rejects.toMatchObject({
      code: 'EMAIL_TAKEN',
    });
    const me = await services.auth.me(payload.user.id);
    expect(me.email).toBe('new@t.dev');
  });

  it('holidays persist and affect nothing until configured (query path)', async () => {
    const holiday = await services.holidays.create({ date: '2026-12-25', name: 'Christmas Day' });
    expect(holiday.id).toBeGreaterThan(0);
    const dates = await services.holidays.holidayDates();
    expect(dates.has('2026-12-25')).toBe(true);
    // Duplicate rejected by the unique constraint.
    await expect(services.holidays.create({ date: '2026-12-25', name: 'X2' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

void TicketRepository;
void UserRepository;
void HolidayRepository;
void AuthService;
