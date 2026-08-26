import type { Prisma, PrismaClient, Priority, TicketStatus, User, Comment, Ticket } from '@prisma/client';
import { AppError } from '../errors.js';

export type TicketWithRelations = Prisma.TicketGetPayload<{
  include: { reporter: true; assignee: true; comments: { include: { author: true } } };
}>;

export interface TicketFilters {
  status?: TicketStatus;
  priority?: Priority;
  assigneeId?: number;
  reporterId?: number;
  slaState?: 'ON_TRACK' | 'AT_RISK' | 'BREACHED';
  take?: number;
  cursor?: number | null;
}

export class TicketRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: number): Promise<TicketWithRelations | null> {
    return this.db.ticket.findUnique({
      where: { id },
      include: { reporter: true, assignee: true, comments: { include: { author: true }, orderBy: { id: 'asc' } } },
    });
  }

  async findMany(filters: TicketFilters): Promise<TicketWithRelations[]> {
    const take = filters.take ?? 20;
    const where: Prisma.TicketWhereInput = {
      ...(filters.status !== undefined ? { status: filters.status } : {}),
      ...(filters.priority !== undefined ? { priority: filters.priority } : {}),
      ...(filters.assigneeId !== undefined ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.reporterId !== undefined ? { reporterId: filters.reporterId } : {}),
    };
    // SLA-state filtering is applied in the service layer (needs business-minute
    // math); here we over-fetch with an upper bound so pagination metadata
    // stays correct. See README tradeoff.
    const limit = filters.slaState !== undefined ? Math.min(Math.max(take, 1) * 50, 2000) : take;
    return this.db.ticket.findMany({
      where,
      orderBy: [{ id: 'desc' }],
      take: limit + (filters.slaState !== undefined ? 0 : 1),
      ...(filters.cursor !== undefined && filters.cursor !== null
        ? { cursor: { id: filters.cursor }, skip: 1 }
        : {}),
      include: { reporter: true, assignee: true, comments: { include: { author: true } } },
    });
  }

  async count(where: Prisma.TicketWhereInput): Promise<number> {
    return this.db.ticket.count({ where });
  }

  async findManyForSlaScan(where: Prisma.TicketWhereInput): Promise<Ticket[]> {
    return this.db.ticket.findMany({ where, orderBy: [{ id: 'desc' }] });
  }

  async create(data: Prisma.TicketCreateInput): Promise<TicketWithRelations> {
    return this.db.ticket.create({
      data,
      include: { reporter: true, assignee: true, comments: { include: { author: true } } },
    });
  }

  async update(id: number, data: Prisma.TicketUpdateInput): Promise<TicketWithRelations> {
    try {
      return await this.db.ticket.update({
        where: { id },
        data,
        include: { reporter: true, assignee: true, comments: { include: { author: true } } },
      });
    } catch (e: unknown) {
      if (this.isRecordNotFound(e)) {
        throw new AppError('TICKET_NOT_FOUND', `Ticket ${id} not found`);
      }
      throw e;
    }
  }

  async setFirstResponseIfUnset(id: number, at: Date): Promise<Ticket> {
    // updateMany so a racing second comment cannot overwrite the timestamp.
    await this.db.ticket.updateMany({ where: { id, firstResponseAt: null }, data: { firstResponseAt: at } });
    return this.db.ticket.findUniqueOrThrow({ where: { id } });
  }

  async addComment(data: Prisma.CommentCreateInput): Promise<Comment & { author: User; ticket: Ticket }> {
    return this.db.comment.create({ data, include: { author: true, ticket: true } });
  }

  private isRecordNotFound(e: unknown): boolean {
    return (
      typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2025'
    );
  }
}
