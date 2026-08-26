import { describe, expect, it } from 'vitest';
import {
  requireNonEmptyString,
  requireEmail,
  requirePassword,
  requirePriority,
  requireStatus,
  requireDateLiteral,
} from '../../src/validation/index.js';
import { AppError } from '../../src/errors.js';

describe('validation', () => {
  it('rejects empty/whitespace strings', () => {
    expect(() => requireNonEmptyString('', 'title')).toThrowError(AppError);
    expect(() => requireNonEmptyString('   ', 'title')).toThrowError(AppError);
    expect(() => requireNonEmptyString(undefined, 'title')).toThrowError(AppError);
    expect(requireNonEmptyString('  ok  ', 'title')).toBe('ok');
  });

  it('enforces max length', () => {
    expect(() => requireNonEmptyString('a'.repeat(201), 'title', 200)).toThrowError(AppError);
  });

  it('validates emails', () => {
    expect(() => requireEmail('not-an-email')).toThrowError(AppError);
    expect(() => requireEmail('a@b')).toThrowError(AppError);
    expect(requireEmail('Mixed@Case.COM')).toBe('mixed@case.com');
  });

  it('requires 8+ char passwords', () => {
    expect(() => requirePassword('short')).toThrowError(AppError);
    expect(requirePassword('longenough1')).toBe('longenough1');
  });

  it('validates priority', () => {
    expect(requirePriority('URGENT')).toBe('URGENT');
    expect(() => requirePriority('INVALID' as unknown as string)).toThrowError(AppError);
  });

  it('validates status', () => {
    expect(requireStatus('OPEN')).toBe('OPEN');
    expect(() => requireStatus('ARCHIVED' as unknown as string)).toThrowError(AppError);
  });

  it('validates date literals', () => {
    expect(requireDateLiteral('2026-08-15', 'date')).toBe('2026-08-15');
    expect(() => requireDateLiteral('15-08-2026', 'date')).toThrowError(AppError);
    expect(() => requireDateLiteral('2026-13-01', 'date')).toThrowError(AppError);
  });

  it('errors carry machine-readable codes', () => {
    try {
      requirePriority('NOPE');
      expect.unreachable();
    } catch (e: unknown) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('INVALID_PRIORITY');
      expect(err.message).toContain('Invalid priority');
    }
  });
});
