import type { Priority, Role, TicketStatus, User } from '@prisma/client';
import jwt from 'jsonwebtoken';
const { sign, verify } = jwt;
import { AppError } from '../errors.js';

export interface JwtPayload {
  sub: number;
  role: Role;
  name: string;
  email: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export function signToken(user: Pick<User, 'id' | 'role' | 'name' | 'email'>, secret: string, expiresIn: string): string {
  return sign({ sub: user.id, role: user.role, name: user.name, email: user.email }, secret, {
    expiresIn: expiresIn as unknown as number,
  });
}

export function verifyToken(token: string, secret: string): JwtPayload {
  try {
    const decoded = verify(token, secret);
    if (typeof decoded === 'string' || typeof decoded.sub !== 'number' || typeof decoded.role !== 'string') {
      throw new AppError('UNAUTHORIZED', 'Invalid token');
    }
    if (decoded.role !== 'AGENT' && decoded.role !== 'REPORTER') {
      throw new AppError('UNAUTHORIZED', 'Invalid token role');
    }
    return {
      sub: decoded.sub,
      role: decoded.role,
      name: typeof decoded.name === 'string' ? decoded.name : '',
      email: typeof decoded.email === 'string' ? decoded.email : '',
    };
  } catch (e: unknown) {
    if (e instanceof AppError) throw e;
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token');
  }
}

export function extractBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

export function requireUser(user: AuthUser | null): AuthUser {
  if (user === null) throw new AppError('UNAUTHORIZED', 'Authentication required');
  return user;
}

export function requireAgent(user: AuthUser | null): AuthUser {
  requireUser(user);
  if (user !== null && user.role !== 'AGENT') {
    throw new AppError('FORBIDDEN', 'Only agents can perform this action');
  }
  return user as AuthUser;
}

/** Convenience re-exports of Prisma enum literals for downstream typing. */
export type { Priority, Role, TicketStatus };
