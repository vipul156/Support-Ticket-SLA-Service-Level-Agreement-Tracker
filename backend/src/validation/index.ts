/** Server-side input validation. All GraphQL inputs flow through these. */

import { AppError } from '../errors.js';

export function requireNonEmptyString(value: unknown, field: string, maxLength = 5000): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new AppError('VALIDATION_ERROR', `${field} must be at most ${maxLength} characters`);
  }
  return value.trim();
}

export function requireEmail(value: unknown): string {
  const s = requireNonEmptyString(value, 'email', 320);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    throw new AppError('VALIDATION_ERROR', 'email must be a valid email address');
  }
  return s.toLowerCase();
}

export function requirePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8) {
    throw new AppError('VALIDATION_ERROR', 'password must be at least 8 characters');
  }
  return value;
}

export type PriorityLiteral = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export function requirePriority(value: unknown): PriorityLiteral {
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'URGENT') return value;
  throw new AppError('INVALID_PRIORITY', `Invalid priority: ${String(value)}`);
}

export type StatusLiteral = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export function requireStatus(value: unknown): StatusLiteral {
  if (value === 'OPEN' || value === 'IN_PROGRESS' || value === 'RESOLVED' || value === 'CLOSED') return value;
  throw new AppError('VALIDATION_ERROR', `Invalid status: ${String(value)}`);
}

export function requireSlaState(value: unknown): 'ON_TRACK' | 'AT_RISK' | 'BREACHED' {
  if (value === 'ON_TRACK' || value === 'AT_RISK' || value === 'BREACHED') return value;
  throw new AppError('VALIDATION_ERROR', `Invalid SLA state: ${String(value)}`);
}

export function requirePositiveIntId(value: unknown, field: string): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a positive integer ID`);
  }
  return n;
}

export function requireDateLiteral(value: unknown, field: string): string {
  const s = requireNonEmptyString(value, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) {
    throw new AppError('VALIDATION_ERROR', `${field} must be a YYYY-MM-DD date`);
  }
  return s;
}
