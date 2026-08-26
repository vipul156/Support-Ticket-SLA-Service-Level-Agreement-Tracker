import { describe, expect, it } from 'vitest';
import { assertTransition, STATUS_TRANSITIONS, governingState } from '../../src/services/ticketService.js';

describe('status transitions', () => {
  it('allows the happy path', () => {
    expect(() => assertTransition('OPEN', 'IN_PROGRESS')).not.toThrow();
    expect(() => assertTransition('IN_PROGRESS', 'RESOLVED')).not.toThrow();
    expect(() => assertTransition('RESOLVED', 'CLOSED')).not.toThrow();
  });

  it('rejects CLOSED → IN_PROGRESS', () => {
    expect(() => assertTransition('CLOSED', 'IN_PROGRESS')).toThrowError(
      'Ticket cannot transition from CLOSED to IN_PROGRESS',
    );
  });

  it('allows the explicit reopen CLOSED → OPEN', () => {
    expect(() => assertTransition('CLOSED', 'OPEN')).not.toThrow();
  });

  it('allows OPEN → CLOSED (cancel without work)', () => {
    expect(() => assertTransition('OPEN', 'CLOSED')).not.toThrow();
  });

  it('allows RESOLVED → OPEN (reopen after resolution)', () => {
    expect(() => assertTransition('RESOLVED', 'OPEN')).not.toThrow();
  });

  it('rejects IN_PROGRESS → IN_PROGRESS? no: same-status is idempotent', () => {
    expect(() => assertTransition('IN_PROGRESS', 'IN_PROGRESS')).not.toThrow();
  });

  it('rejects RESOLVED → IN_PROGRESS (must reopen first)', () => {
    expect(() => assertTransition('RESOLVED', 'IN_PROGRESS')).toThrowError(
      'Ticket cannot transition from RESOLVED to IN_PROGRESS',
    );
  });

  it('transition table matches documented rules', () => {
    expect(STATUS_TRANSITIONS.OPEN).toEqual(['IN_PROGRESS', 'CLOSED']);
    expect(STATUS_TRANSITIONS.IN_PROGRESS).toEqual(['RESOLVED', 'OPEN', 'CLOSED']);
    expect(STATUS_TRANSITIONS.RESOLVED).toEqual(['CLOSED', 'OPEN']);
    expect(STATUS_TRANSITIONS.CLOSED).toEqual(['OPEN']);
  });
});

describe('governingState', () => {
  it('resolution state governs once first response is MET', () => {
    expect(
      governingState({
        firstResponse: { state: 'MET', remainingMinutes: 10, dueAt: new Date() },
        resolution: { state: 'ON_TRACK', remainingMinutes: 500, dueAt: new Date() },
      }),
    ).toBe('ON_TRACK');
  });

  it('first-response AT_RISK/BREACHED governs while unanswered', () => {
    expect(
      governingState({
        firstResponse: { state: 'AT_RISK', remainingMinutes: 10, dueAt: new Date() },
        resolution: { state: 'ON_TRACK', remainingMinutes: 500, dueAt: new Date() },
      }),
    ).toBe('AT_RISK');
    expect(
      governingState({
        firstResponse: { state: 'BREACHED', remainingMinutes: 0, dueAt: new Date() },
        resolution: { state: 'ON_TRACK', remainingMinutes: 500, dueAt: new Date() },
      }),
    ).toBe('BREACHED');
  });
});
