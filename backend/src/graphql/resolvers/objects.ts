/** Object-level resolvers: User, Ticket, Comment, TicketConnection. */

import type { GraphQLContext } from '../context.js';
import type { TicketWithRelations } from '../../repositories/ticketRepository.js';
import type { Comment, User } from '@prisma/client';
import { slaInfoFor } from './helpers.js';

export function userFieldResolver(
  user: User | { id: number; name: string; email: string; role: string },
): { id: string; name: string; email: string; role: string } {
  return { id: String(user.id), name: user.name, email: user.email, role: user.role };
}

export function commentFieldResolver(comment: Comment & { author: User }): {
  id: string; content: string; createdAt: string; author: ReturnType<typeof userFieldResolver>;
} {
  return {
    id: String(comment.id),
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    author: userFieldResolver(comment.author),
  };
}

export async function ticketSlaResolver(
  ticket: TicketWithRelations,
  _args: Record<string, never>,
  ctx: GraphQLContext,
) {
  const dates = await ctx.services.holidays.holidayDates();
  return slaInfoFor(ticket, new Date(), {
    businessHours: ctx.config.businessHours,
    holidaySource: { isHoliday: (d: string): boolean => dates.has(d) },
    slaPolicies: ctx.config.slaPolicies,
  });
}

export function ticketConnectionResolver(page: {
  nodes: TicketWithRelations[];
  hasNextPage: boolean;
  endCursor: number | null;
}): { nodes: TicketWithRelations[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } {
  return {
    nodes: page.nodes,
    pageInfo: {
      hasNextPage: page.hasNextPage,
      endCursor: page.endCursor === null ? null : String(page.endCursor),
    },
  };
}
