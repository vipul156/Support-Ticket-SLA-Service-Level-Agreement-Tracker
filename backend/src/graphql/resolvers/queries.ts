import type { GraphQLContext } from '../context.js';
import { requireUser } from '../../auth/index.js';

export function meResolver(
  _parent: unknown,
  _args: Record<string, never>,
  ctx: GraphQLContext,
): { id: string; name: string; email: string; role: string } {
  const user = requireUser(ctx.currentUser);
  return { id: String(user.id), name: user.name, email: user.email, role: user.role };
}

export function ticketResolver(
  _parent: unknown,
  args: { id: string },
  ctx: GraphQLContext,
): Promise<import('../../repositories/ticketRepository.js').TicketWithRelations> {
  requireUser(ctx.currentUser);
  const id = Number(args.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new (require('../../errors.js').AppError)('VALIDATION_ERROR', 'id must be a positive integer');
  }
  return ctx.services.tickets.getTicket(id);
}

export function ticketsResolver(
  _parent: unknown,
  args: { filters?: { status?: string; priority?: string; assigneeId?: string; slaState?: string }; take?: number; cursor?: string | null },
  ctx: GraphQLContext,
) {
  requireUser(ctx.currentUser);
  const f = args.filters ?? {};
  const take = args.take !== undefined ? Math.min(Math.max(args.take, 1), 100) : 20;
  return ctx.services.tickets.listTickets(ctx.currentUser, {
    ...(f.status !== undefined && f.status !== null ? { status: f.status as never } : {}),
    ...(f.priority !== undefined && f.priority !== null ? { priority: f.priority as never } : {}),
    ...(f.assigneeId !== undefined && f.assigneeId !== null ? { assigneeId: Number(f.assigneeId) } : {}),
    ...(f.slaState !== undefined && f.slaState !== null && f.slaState !== 'MET'
      ? { slaState: f.slaState as 'ON_TRACK' | 'AT_RISK' | 'BREACHED' }
      : {}),
    take,
    ...(args.cursor !== undefined && args.cursor !== null && args.cursor !== '' ? { cursor: Number(args.cursor) } : {}),
  });
}

export function dashboardResolver(
  _parent: unknown,
  _args: Record<string, never>,
  ctx: GraphQLContext,
): Promise<{ openTickets: number; inProgressTickets: number; atRiskTickets: number; breachedTickets: number }> {
  requireUser(ctx.currentUser);
  return ctx.services.tickets.dashboard();
}

export function usersResolver(
  _parent: unknown,
  args: { role?: string },
  ctx: GraphQLContext,
) {
  requireUser(ctx.currentUser);
  return ctx.services.users.findMany(
    args.role !== undefined && args.role !== null ? (args.role as 'REPORTER' | 'AGENT') : undefined,
  );
}

export function holidaysResolver(
  _parent: unknown,
  _args: Record<string, never>,
  ctx: GraphQLContext,
) {
  requireUser(ctx.currentUser);
  return ctx.services.holidays.findAll();
}
