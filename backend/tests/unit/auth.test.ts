import { describe, expect, it } from 'vitest';
import { hash, compare } from 'bcryptjs';
import { signToken, verifyToken, extractBearer, requireUser, requireAgent } from '../../src/auth/index.js';
import { AppError } from '../../src/errors.js';

const SECRET = 'test-secret';
const USER = { id: 42, name: 'A', email: 'a@b.c', role: 'REPORTER' as const };
const AGENT = { id: 7, name: 'G', email: 'g@b.c', role: 'AGENT' as const };

describe('JWT auth', () => {
  it('round-trips a token', () => {
    const token = signToken(USER, SECRET, '1h');
    const payload = verifyToken(token, SECRET);
    expect(payload.sub).toBe(42);
    expect(payload.role).toBe('REPORTER');
  });

  it('rejects tampered/wrong-secret tokens', () => {
    const token = signToken(USER, SECRET, '1h');
    expect(() => verifyToken(token, 'other-secret')).toThrowError(AppError);
    expect(() => verifyToken('garbage.token.here', SECRET)).toThrowError(AppError);
  });

  it('rejects expired tokens', () => {
    const expired = signToken(USER, SECRET, '-1s');
    expect(() => verifyToken(expired, SECRET)).toThrowError(AppError);
  });

  it('extracts bearer tokens from headers', () => {
    expect(extractBearer('Bearer abc123')).toBe('abc123');
    expect(extractBearer('bearer abc123')).toBe('abc123');
    expect(extractBearer('Basic xyz')).toBeNull();
    expect(extractBearer(null)).toBeNull();
    expect(extractBearer(undefined)).toBeNull();
  });
});

describe('role guards', () => {
  it('requireUser throws UNAUTHORIZED when null', () => {
    try {
      requireUser(null);
      expect.unreachable();
    } catch (e: unknown) {
      expect((e as AppError).code).toBe('UNAUTHORIZED');
    }
    expect(requireUser(USER).id).toBe(42);
  });

  it('requireAgent throws FORBIDDEN for reporters', () => {
    try {
      requireAgent(USER);
      expect.unreachable();
    } catch (e: unknown) {
      expect((e as AppError).code).toBe('FORBIDDEN');
    }
    expect(requireAgent(AGENT).id).toBe(7);
  });

  it('requireAgent throws UNAUTHORIZED when null', () => {
    try {
      requireAgent(null);
      expect.unreachable();
    } catch (e: unknown) {
      expect((e as AppError).code).toBe('UNAUTHORIZED');
    }
  });
});

describe('password hashing', () => {
  it('bcrypt hashes and verifies (never plain text)', async () => {
    const pw = 'supersecret1';
    const digest = await hash(pw, 10);
    expect(digest).not.toBe(pw);
    expect(digest.startsWith('$2')).toBe(true);
    expect(await compare(pw, digest)).toBe(true);
    expect(await compare('wrong', digest)).toBe(false);
  });
});
