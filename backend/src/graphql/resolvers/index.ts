/** Resolver map assembled from query/mutation/object resolver modules. */

import type { IResolvers } from '@graphql-tools/utils';
import * as queries from './queries.js';
import * as mutations from './mutations.js';
import * as objects from './objects.js';
import type { TicketWithRelations } from '../../repositories/ticketRepository.js';
import type { Comment, User } from '@prisma/client';

export const resolvers: IResolvers = {
  Query: {
    me: queries.meResolver,
    ticket: queries.ticketResolver,
    tickets: queries.ticketsResolver,
    dashboard: queries.dashboardResolver,
    users: queries.usersResolver,
    holidays: queries.holidaysResolver,
  },
  Mutation: {
    register: mutations.registerResolver,
    login: mutations.loginResolver,
    createTicket: mutations.createTicketResolver,
    assignTicket: mutations.assignTicketResolver,
    changeTicketStatus: mutations.changeTicketStatusResolver,
    addComment: mutations.addCommentResolver,
    resolveTicket: mutations.resolveTicketResolver,
    addHoliday: mutations.addHolidayResolver,
  },
  Ticket: {
    id: (t: TicketWithRelations): string => String(t.id),
    createdAt: (t: TicketWithRelations): string => t.createdAt.toISOString(),
    firstResponseAt: (t: TicketWithRelations): string | null =>
      t.firstResponseAt === null ? null : t.firstResponseAt.toISOString(),
    resolvedAt: (t: TicketWithRelations): string | null =>
      t.resolvedAt === null ? null : t.resolvedAt.toISOString(),
    reporter: (t: TicketWithRelations): User => t.reporter,
    assignee: (t: TicketWithRelations): User | null => t.assignee,
    comments: (t: TicketWithRelations): (Comment & { author: User })[] => t.comments,
    sla: objects.ticketSlaResolver,
  },
  User: {
    id: (u: User | { id: number }): string => String(u.id),
  },
  Comment: {
    id: (c: Comment & { author: User }): string => String(c.id),
    createdAt: (c: Comment & { author: User }): string => c.createdAt.toISOString(),
    author: (c: Comment & { author: User }): User => c.author,
  },
  TicketConnection: {
    nodes: (page: { nodes: TicketWithRelations[] }): TicketWithRelations[] => page.nodes,
    pageInfo: (page: { hasNextPage: boolean; endCursor: number | null }): { hasNextPage: boolean; endCursor: string | null } => ({
      hasNextPage: page.hasNextPage,
      endCursor: page.endCursor === null ? null : String(page.endCursor),
    }),
  },
};
