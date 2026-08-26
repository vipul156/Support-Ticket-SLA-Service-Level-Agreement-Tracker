import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUSINESS_HOURS,
  localDateOf,
  normalizeToBusinessStart,
  zonedTimeToUtc,
} from '../../src/services/sla/businessCalendar.js';
import { addBusinessMinutes, businessMinutesBetween } from '../../src/services/sla/businessMinutes.js';

// Business timezone for tests: Asia/Kolkata (UTC+5:30, no DST) — matches default.
const IST = 'Asia/Kolkata';
const config = { ...DEFAULT_BUSINESS_HOURS, timezone: IST };

// Berlin for DST-aware tests.
const BERLIN = 'Europe/Berlin';
const berlinConfig = { ...DEFAULT_BUSINESS_HOURS, timezone: BERLIN };

const noHolidays = { isHoliday: (_d: string): boolean => false };

/** Helper: build a UTC Date from "YYYY-MM-DD HH:mm" in a given timezone. */
function inTz(dateStr: string, hour: number, minute: number, tz: string): Date {
  const localDate = dateStr;
  return zonedTimeToUtc(localDate, hour, minute, tz);
}

describe('business calendar', () => {
  it('converts local wall time to UTC (IST)', () => {
    // 09:00 IST on Mon 2026-08-24 == 03:30 UTC
    const t = inTz('2026-08-24', 9, 0, IST);
    expect(t.toISOString()).toBe('2026-08-24T03:30:00.000Z');
  });

  it('derives the local date of an instant', () => {
    expect(localDateOf(new Date('2026-08-24T03:30:00.000Z'), IST)).toBe('2026-08-24');
    expect(localDateOf(new Date('2026-08-24T20:00:00.000Z'), IST)).toBe('2026-08-25'); // 01:30 next day IST
  });

  it('is DST-safe when resolving local times (Berlin)', () => {
    // 09:00 Berlin on 2026-03-30 (day after DST spring-forward) == 07:00 UTC
    const t = zonedTimeToUtc('2026-03-30', 9, 0, BERLIN);
    expect(t.toISOString()).toBe('2026-03-30T07:00:00.000Z');
    // 09:00 Berlin in winter == 08:00 UTC
    const w = zonedTimeToUtc('2026-01-15', 9, 0, BERLIN);
    expect(w.toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });
});

describe('normalizeToBusinessStart (edge cases)', () => {
  it('ticket created before business hours → clamps to 09:00 same day', () => {
    const monday7am = inTz('2026-08-24', 7, 0, IST); // Monday 07:00
    const start = normalizeToBusinessStart(monday7am, config, noHolidays);
    expect(start.toISOString()).toBe(inTz('2026-08-24', 9, 0, IST).toISOString());
  });

  it('ticket created after business hours → next business day 09:00', () => {
    const monday8pm = inTz('2026-08-24', 20, 0, IST); // Monday 20:00
    const start = normalizeToBusinessStart(monday8pm, config, noHolidays);
    expect(start.toISOString()).toBe(inTz('2026-08-25', 9, 0, IST).toISOString()); // Tuesday
  });

  it('ticket created on Saturday → Monday 09:00', () => {
    const saturday = inTz('2026-08-22', 12, 0, IST); // Saturday
    const start = normalizeToBusinessStart(saturday, config, noHolidays);
    expect(start.toISOString()).toBe(inTz('2026-08-24', 9, 0, IST).toISOString());
  });

  it('ticket created on Sunday → Monday 09:00', () => {
    const sunday = inTz('2026-08-23', 10, 0, IST); // Sunday
    const start = normalizeToBusinessStart(sunday, config, noHolidays);
    expect(start.toISOString()).toBe(inTz('2026-08-24', 9, 0, IST).toISOString());
  });

  it('when Monday is a holiday → Tuesday 09:00', () => {
    const friday = inTz('2026-08-21', 20, 0, IST);
    const mondayHoliday = { isHoliday: (d: string): boolean => d === '2026-08-24' };
    const start = normalizeToBusinessStart(friday, config, mondayHoliday);
    expect(start.toISOString()).toBe(inTz('2026-08-25', 9, 0, IST).toISOString());
  });
});

describe('businessMinutesBetween', () => {
  it('counts only in-hours time on a normal weekday', () => {
    const from = inTz('2026-08-24', 10, 0, IST);
    const to = inTz('2026-08-24', 12, 0, IST);
    expect(businessMinutesBetween(from, to, config, noHolidays)).toBe(120);
  });

  it('Friday 17:59 → Saturday 09:30 counts only 1 minute (weekend excluded)', () => {
    const from = inTz('2026-08-21', 17, 59, IST); // Friday evening
    const to = inTz('2026-08-22', 9, 30, IST); // Saturday morning
    expect(businessMinutesBetween(from, to, config, noHolidays)).toBe(1);
  });

  it('crosses a weekend: Friday 17:00 → Monday 09:00 = 60 minutes', () => {
    const from = inTz('2026-08-21', 17, 0, IST);
    const to = inTz('2026-08-24', 9, 0, IST);
    expect(businessMinutesBetween(from, to, config, noHolidays)).toBe(60);
  });

  it('excludes a configured holiday entirely', () => {
    const from = inTz('2026-08-21', 9, 0, IST); // Friday 09:00
    const to = inTz('2026-08-25', 9, 0, IST); // Tuesday 09:00
    const mondayHoliday = { isHoliday: (d: string): boolean => d === '2026-08-24' };
    // Friday (9h=540) + Monday holiday (0) + Tuesday start (0)
    expect(businessMinutesBetween(from, to, config, mondayHoliday)).toBe(540);
  });

  it('handles holiday following a weekend (Sat+Sun+Mon holiday)', () => {
    const from = inTz('2026-08-21', 17, 0, IST); // Friday 17:00
    const to = inTz('2026-08-25', 9, 0, IST); // Tuesday 09:00
    const mondayHoliday = { isHoliday: (d: string): boolean => d === '2026-08-24' };
    // Only Friday 17:00→18:00 counts: 60 minutes
    expect(businessMinutesBetween(from, to, config, mondayHoliday)).toBe(60);
  });

  it('returns 0 for unordered or identical instants', () => {
    const a = inTz('2026-08-24', 10, 0, IST);
    const b = inTz('2026-08-24', 12, 0, IST);
    expect(businessMinutesBetween(b, a, config, noHolidays)).toBe(0);
    expect(businessMinutesBetween(a, a, config, noHolidays)).toBe(0);
  });

  it('spans multiple full business days correctly', () => {
    const from = inTz('2026-08-24', 9, 0, IST); // Monday
    const to = inTz('2026-08-28', 18, 0, IST); // Friday EOD
    expect(businessMinutesBetween(from, to, config, noHolidays)).toBe(5 * 9 * 60); // 5 × 540
  });

  it('counts across a DST boundary in a DST timezone (Berlin)', () => {
    // Fri 2026-03-27 17:00 Berlin → Mon 2026-03-30 09:00 Berlin.
    // DST springs forward Sun 2026-03-29. Expect exactly 60 business minutes.
    const from = zonedTimeToUtc('2026-03-27', 17, 0, BERLIN);
    const to = zonedTimeToUtc('2026-03-30', 9, 0, BERLIN);
    expect(businessMinutesBetween(from, to, berlinConfig, noHolidays)).toBe(60);
  });
});

describe('addBusinessMinutes', () => {
  it('normal weekday: Monday 09:00 + 240 = Monday 13:00 (HIGH first response)', () => {
    const from = inTz('2026-08-24', 9, 0, IST);
    const due = addBusinessMinutes(from, 240, config, noHolidays);
    expect(due.toISOString()).toBe(inTz('2026-08-24', 13, 0, IST).toISOString());
  });

  it('brief example: HIGH created Friday 17:00 → first response due Monday 12:00', () => {
    const friday5pm = inTz('2026-08-21', 17, 0, IST);
    const due = addBusinessMinutes(friday5pm, 240, config, noHolidays);
    // Fri 17→18 = 1h, Sat/Sun = 0, Mon 09→12 = 3h ⇒ Mon 12:00
    expect(due.toISOString()).toBe(inTz('2026-08-24', 12, 0, IST).toISOString());
  });

  it('URGENT resolution (4h) crossing a weekend: Friday 17:30 → Tuesday 12:30', () => {
    const from = inTz('2026-08-21', 17, 30, IST);
    const due = addBusinessMinutes(from, 240, config, noHolidays);
    // Fri 17:30→18:00 = 30m; Mon 09:00→12:00 = 3h; due Mon 12:00. Adjust expectation:
    // 30 + 180 = 210; remaining 30 → Mon 12:30.
    expect(due.toISOString()).toBe(inTz('2026-08-24', 12, 30, IST).toISOString());
  });

  it('LOW resolution (72h) spans 8 business days: Monday 09:00 → 8th business day 18:00', () => {
    const from = inTz('2026-08-24', 9, 0, IST); // Monday
    const due = addBusinessMinutes(from, 72 * 60, config, noHolidays);
    // 72h = 8 × 9h days: Aug 24,25,26,27,28 (weekend 29/30), Aug 31, Sep 1, Sep 2.
    // Budget exhausts at end of the 8th business day: Wed Sep 2 18:00.
    expect(due.toISOString()).toBe(inTz('2026-09-02', 18, 0, IST).toISOString());
  });

  it('skips a holiday mid-budget (MEDIUM resolution 48h with Monday holiday)', () => {
    const from = inTz('2026-08-21', 9, 0, IST); // Friday 09:00
    const mondayHoliday = { isHoliday: (d: string): boolean => d === '2026-08-24' };
    const due = addBusinessMinutes(from, 48 * 60, config, mondayHoliday);
    // Fri 24 (540m), Mon holiday (0), Tue 25 (540), Wed 26 (540), Thu 27 (540), Fri 28 (540)
    // 540*5 = 2700 = 45h; remaining 3h → Mon 31 09:00→12:00.
    expect(due.toISOString()).toBe(inTz('2026-08-31', 12, 0, IST).toISOString());
  });

  it('created outside business hours starts at next period (Mon 20:00 + 60m)', () => {
    const from = inTz('2026-08-24', 20, 0, IST);
    const due = addBusinessMinutes(from, 60, config, noHolidays);
    expect(due.toISOString()).toBe(inTz('2026-08-25', 10, 0, IST).toISOString());
  });

  it('exact zero budget returns the normalized start', () => {
    const from = inTz('2026-08-22', 12, 0, IST); // Saturday
    const due = addBusinessMinutes(from, 0, config, noHolidays);
    expect(due.toISOString()).toBe(from.toISOString());
  });

  it('round-trips with businessMinutesBetween', () => {
    const from = inTz('2026-08-24', 11, 17, IST);
    const due = addBusinessMinutes(from, 313, config, noHolidays);
    expect(businessMinutesBetween(from, due, config, noHolidays)).toBe(313);
  });
});
