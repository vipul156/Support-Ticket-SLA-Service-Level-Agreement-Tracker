import type { PrismaClient, Prisma, User, Role, Holiday } from '@prisma/client';
import { AppError } from '../errors.js';

export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  async findById(id: number): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    try {
      return await this.db.user.create({ data });
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new AppError('EMAIL_TAKEN', 'A user with this email already exists');
      }
      throw e;
    }
  }

  async findMany(role?: Role): Promise<User[]> {
    return this.db.user.findMany({
      where: role !== undefined ? { role } : undefined,
      orderBy: { id: 'asc' },
    });
  }
}

export class HolidayRepository {
  constructor(private readonly db: PrismaClient) {}

  async findAll(): Promise<Holiday[]> {
    return this.db.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  async holidayDates(): Promise<Set<string>> {
    const rows = await this.db.holiday.findMany({ select: { date: true } });
    return new Set(rows.map((r) => r.date));
  }

  async create(data: Prisma.HolidayCreateInput): Promise<Holiday> {
    try {
      return await this.db.holiday.create({ data });
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002') {
        throw new AppError('VALIDATION_ERROR', 'A holiday already exists on this date');
      }
      throw e;
    }
  }
}
