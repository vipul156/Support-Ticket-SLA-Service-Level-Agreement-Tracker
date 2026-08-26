import type { GraphQLContext } from '../context.js';
import { AppError } from '../../errors.js';
import {
  requireNonEmptyString,
  requireEmail,
  requirePassword,
  requirePriority,
  requireStatus,
  requireDateLiteral,
} from '../../validation/index.js';

function idArg(value: string | number, field: string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a positive integer`);
  }
  return n;
}

export async function registerResolver(
  _parent: unknown,
  args: { name: string; email: string; password: string; role?: string },
  ctx: GraphQLContext,
) {
  const name = requireNonEmptyString(args.name, 'name', 200);
  const email = requireEmail(args.email);
  const password = requirePassword(args.password);
  // Public registration only creates REPORTER accounts. Agent accounts are
  // provisioned via seed/CLI (assignment decision, documented in README).
  const role = 'REPORTER';
  void args.role;
  const payload = await ctx.services.auth.register(name, email, password, role);
  return { token: payload.token, user: payload.user };
}

export async function loginResolver(
  _parent: unknown,
  args: { email: string; password: string },
  ctx: GraphQLContext,
) {
  const email = requireEmail(args.email);
  const password = requireNonEmptyString(args.password, 'password', 200);
  const payload = await ctx.services.auth.login(email, password);
  return { token: payload.token, user: payload.user };
}

export async function createTicketResolver(
  _parent: unknown,
  args: { title: string; description: string; priority: string },
  ctx: GraphQLContext,
) {
  const title = requireNonEmptyString(args.title, 'title', 200);
  const description = requireNonEmptyString(args.description, 'description', 10000);
  const priority = requirePriority(args.priority);
  return ctx.services.tickets.createTicket(ctx.currentUser, title, description, priority);
}

export async function assignTicketResolver(
  _parent: unknown,
  args: { ticketId: string; assigneeId: string },
  ctx: GraphQLContext,
) {
  const ticketId = idArg(args.ticketId, 'ticketId');
  const assigneeId = idArg(args.assigneeId, 'assigneeId');
  return ctx.services.tickets.assignTicket(ctx.currentUser, ticketId, assigneeId);
}

export async function changeTicketStatusResolver(
  _parent: unknown,
  args: { ticketId: string; status: string },
  ctx: GraphQLContext,
) {
  const ticketId = idArg(args.ticketId, 'ticketId');
  const status = requireStatus(args.status);
  return ctx.services.tickets.changeStatus(ctx.currentUser, ticketId, status);
}

export async function addCommentResolver(
  _parent: unknown,
  args: { ticketId: string; content: string },
  ctx: GraphQLContext,
) {
  const ticketId = idArg(args.ticketId, 'ticketId');
  const content = requireNonEmptyString(args.content, 'content', 10000);
  const result = await ctx.services.tickets.addComment(ctx.currentUser, ticketId, content);
  return {
    id: String(result.comment.id),
    content: result.comment.content,
    createdAt: result.comment.createdAt.toISOString(),
    author: result.comment.author,
  };
}

export async function resolveTicketResolver(
  _parent: unknown,
  args: { ticketId: string },
  ctx: GraphQLContext,
) {
  const ticketId = idArg(args.ticketId, 'ticketId');
  return ctx.services.tickets.resolveTicket(ctx.currentUser, ticketId);
}

export async function addHolidayResolver(
  _parent: unknown,
  args: { date: string; name: string },
  ctx: GraphQLContext,
) {
  const { requireAgent } = await import('../../auth/index.js');
  requireAgent(ctx.currentUser);
  const date = requireDateLiteral(args.date, 'date');
  const name = requireNonEmptyString(args.name, 'name', 200);
  return ctx.services.holidays.create({ date, name });
}
