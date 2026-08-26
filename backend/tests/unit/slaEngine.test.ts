import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SLA_POLICIES,
  evaluateSla,
  computeDueTimes,
  SLAState,
} from '../../src/services/sla/slaEngine.js';
import { DEFAULT_BUSINESS_HOURS, zonedTimeToUtc } from '../../src/services/sla/businessCalendar.js';
import { businessMinutesBetween } from '../../src/services/sla/businessMinutes.js';

const IST = 'Asia/Kolkata';
const config = { ...DEFAULT_BUSINESS_HOURS, timezone: IST };
const noHolidays = { isHoliday: (_d: string): boolean => false };

function at(dateStr: string, hour: number, minute: number): Date {
  return zonedTimeToUtc(dateStr, hour, minute, IST);
}

describe('computeDueTimes', () => {
  it.each([
    { priority: 'URGENT', fr: 60, res: 240 },
    { priority: 'HIGH', fr: 240, res: 1440 },
    { priority: 'MEDIUM', fr: 480, res: 2880 },
    { priority: 'LOW', fr: 1440, res: 4320 },
  ] as const)('applies default policies ($priority)', ({ priority, fr, res }) => {
    const from = at('2026-08-24', 9, 0); // Monday 09:00
    const due = computeDueTimes(from, priority, config, noHolidays);
    // Verify in business minutes (wall-clock deltas include nights/weekends).
    expect(businessMinutesBetween(from, due.firstResponseDueAt, config, noHolidays)).toBe(fr);
    expect(businessMinutesBetween(from, due.resolutionDueAt, config, noHolidays)).toBe(res);
    expect(DEFAULT_SLA_POLICIES[priority].firstResponseBusinessMinutes).toBe(fr);
    expect(DEFAULT_SLA_POLICIES[priority].resolutionBusinessMinutes).toBe(res);
  });
});

describe('evaluateSla — states', () => {
  const createdAt = at('2026-08-24', 9, 0); // Monday 09:00, MEDIUM: FR 8h, RES 48h

  it('freshly created ticket is ON_TRACK', () => {
    const now = at('2026-08-24', 10, 0);
    const sla = evaluateSla(
      { createdAt, priority: 'MEDIUM', firstResponseAt: null, resolvedAt: null, firstResponseDueAt: at('2026-08-24', 17, 0), resolutionDueAt: at('2026-08-26', 17, 0) },
      now, config, noHolidays,
    );
    expect(sla.firstResponse.state).toBe<SLAState>('ON_TRACK');
    expect(sla.firstResponse.remainingMinutes).toBe(420);
    expect(sla.resolution.state).toBe<SLAState>('ON_TRACK');
  });

  it('becomes AT_RISK strictly above 75% consumed (FR 8h budget: 361m consumed)', () => {
    const now = at('2026-08-24', 15, 1); // 361 minutes consumed > 360 (75% of 480)
    const sla = evaluateSla(
      { createdAt, priority: 'MEDIUM', firstResponseAt: null, resolvedAt: null, firstResponseDueAt: at('2026-08-24', 17, 0), resolutionDueAt: at('2026-08-26', 17, 0) },
      now, config, noHolidays,
    );
    expect(sla.firstResponse.state).toBe<SLAState>('AT_RISK');
    expect(sla.firstResponse.remainingMinutes).toBe(119);
  });

  it('exactly 75% consumed remains ON_TRACK (documented boundary)', () => {
    const now = at('2026-08-24', 15, 0); // exactly 360 = 75% of 480
    const sla = evaluateSla(
      { createdAt, priority: 'MEDIUM', firstResponseAt: null, resolvedAt: null, firstResponseDueAt: at('2026-08-24', 17, 0), resolutionDueAt: at('2026-08-26', 17, 0) },
      now, config, noHolidays,
    );
    expect(sla.firstResponse.state).toBe<SLAState>('ON_TRACK');
  });

  it('becomes BREACHED after the deadline, even across weekends (FR due Monday 17:00)', () => {
    const now = at('2026-08-28', 10, 0); // following Friday
    const sla = evaluateSla(
      { createdAt, priority: 'MEDIUM', firstResponseAt: null, resolvedAt: null, firstResponseDueAt: at('2026-08-24', 17, 0), resolutionDueAt: at('2026-08-26', 17, 0) },
      now, config, noHolidays,
    );
    expect(sla.firstResponse.state).toBe<SLAState>('BREACHED');
    expect(sla.firstResponse.remainingMinutes).toBe(0);
  });

  it('completed first-response stays MET forever (clock freezing)', () => {
    const sla = evaluateSla(
      { createdAt, priority: 'MEDIUM', firstResponseAt: at('2026-08-24', 11, 0), resolvedAt: null, firstResponseDueAt: at('2026-08-24', 17, 0), resolutionDueAt: at('2026-08-26', 17, 0) },
      at('2026-09-15', 10, 0), // weeks later — must NOT flip to BREACHED
      config, noHolidays,
    );
    expect(sla.firstResponse.state).toBe<SLAState>('MET');
    expect(sla.firstResponse.remainingMinutes).toBe(360); // 11:00 → 17:00 = 6h business
  });

  it('first response recorded after deadline is still MET (frozen), remaining 0', () => {
    const sla = evaluateSla(
      { createdAt, priority: 'MEDIUM', firstResponseAt: at('2026-08-25', 10, 0), resolvedAt: null, firstResponseDueAt: at('2026-08-24', 17, 0), resolutionDueAt: at('2026-08-26', 17, 0) },
      at('2026-08-26', 9, 0), config, noHolidays,
    );
    expect(sla.firstResponse.state).toBe<SLAState>('MET');
    expect(sla.firstResponse.remainingMinutes).toBe(0);
  });

  it('resolution clock freezes at resolvedAt (MET within budget)', () => {
    const sla = evaluateSla(
      { createdAt, priority: 'MEDIUM', firstResponseAt: at('2026-08-24', 10, 0), resolvedAt: at('2026-08-25', 14, 0), firstResponseDueAt: at('2026-08-24', 17, 0), resolutionDueAt: at('2026-08-26', 17, 0) },
      at('2026-10-01', 9, 0), config, noHolidays,
    );
    expect(sla.resolution.state).toBe<SLAState>('MET');
    expect(sla.resolution.remainingMinutes).toBeGreaterThan(0);
  });

  it('resolution SLA BREACHED when unresolved past due', () => {
    const sla = evaluateSla(
      { createdAt, priority: 'URGENT', firstResponseAt: at('2026-08-24', 9, 30), resolvedAt: null, firstResponseDueAt: at('2026-08-24', 10, 0), resolutionDueAt: at('2026-08-24', 13, 0) },
      at('2026-08-24', 15, 0), config, noHolidays,
    );
    expect(sla.resolution.state).toBe<SLAState>('BREACHED');
  });

  it('holidays push remaining time: due Monday but Monday is a holiday', () => {
    const mondayHoliday = { isHoliday: (d: string): boolean => d === '2026-08-24' };
    const created = at('2026-08-21', 17, 0); // Friday 17:00
    const due = computeDueTimes(created, 'HIGH', config, mondayHoliday);
    // 4h: Fri 1h + Tue 3h ⇒ Tuesday 12:00 (Monday holiday skipped)
    expect(due.firstResponseDueAt.toISOString()).toBe(at('2026-08-25', 12, 0).toISOString());
    const sla = evaluateSla(
      { createdAt: created, priority: 'HIGH', firstResponseAt: null, resolvedAt: null, ...due },
      at('2026-08-21', 18, 30), config, mondayHoliday,
    );
    expect(sla.firstResponse.state).toBe<SLAState>('ON_TRACK');
    expect(sla.firstResponse.remainingMinutes).toBe(180); // 3h left, all on Tuesday (Mon holiday)
  });
});

describe('evaluateSla — governing clock semantics', () => {
  it('each clock evaluated independently (FR MET while resolution BREACHED)', () => {
    const sla = evaluateSla(
      {
        createdAt: at('2026-08-24', 9, 0),
        priority: 'URGENT',
        firstResponseAt: at('2026-08-24', 9, 45),
        resolvedAt: null,
        firstResponseDueAt: at('2026-08-24', 10, 0),
        resolutionDueAt: at('2026-08-24', 13, 0),
      },
      at('2026-08-25', 9, 0), config, noHolidays,
    );
    expect(sla.firstResponse.state).toBe<SLAState>('MET');
    expect(sla.resolution.state).toBe<SLAState>('BREACHED');
  });
});
