/**
 * Business-minute arithmetic: the core of the SLA engine.
 *
 * Given a starting instant, a budget in business minutes, a business-hours
 * config and a holiday source, `addBusinessMinutes` computes the instant at
 * which the budget is exhausted, and `businessMinutesBetween` measures
 * business time between two instants. Both are pure functions.
 */

import {
  businessEndOf,
  businessStartOf,
  isBusinessDay,
  localDateOf,
  LocalDate,
  nextBusinessDate,
  BusinessHoursConfig,
  HolidaySource,
  normalizeToBusinessStart,
} from './businessCalendar.js';

const MINUTE_MS = 60_000;

/**
 * Business minutes between two instants (clamped at zero — interval must be
 * ordered). Counts only time inside business hours on business days.
 */
export function businessMinutesBetween(
  from: Date,
  to: Date,
  config: BusinessHoursConfig,
  holidays: HolidaySource,
): number {
  const start = from.getTime();
  const end = to.getTime();
  if (end <= start) return 0;

  let total = 0;
  let cursorDate = localDateOf(from, config.timezone);
  const endDate = localDateOf(to, config.timezone);

  for (let guard = 0; guard < 100_000; guard++) {
    if (!isBusinessDay(cursorDate, config, holidays)) {
      if (cursorDate === endDate) break;
      cursorDate = nextBusinessDate(cursorDate, config, holidays);
      if (cursorDate > endDate) break;
      continue;
    }
    const dayStart = businessStartOf(cursorDate, config);
    const dayEnd = businessEndOf(cursorDate, config);
    if (dayStart === null || dayEnd === null) {
      cursorDate = nextBusinessDate(cursorDate, config, holidays);
      continue;
    }
    const s = Math.max(dayStart.getTime(), start);
    const e = Math.min(dayEnd.getTime(), end);
    if (e > s) {
      total += (e - s) / MINUTE_MS;
    }
    if (cursorDate === endDate) break;
    cursorDate = nextBusinessDate(cursorDate, config, holidays);
    if (cursorDate > endDate) break;
  }
  return Math.round(total * 100) / 100;
}

/**
 * Instant at which `budgetMinutes` of business time elapse after `from`.
 * `from` is normalized: time outside business hours does not count and the
 * clock effectively starts at the next business period.
 */
export function addBusinessMinutes(
  from: Date,
  budgetMinutes: number,
  config: BusinessHoursConfig,
  holidays: HolidaySource,
): Date {
  if (budgetMinutes <= 0) {
    return new Date(from.getTime());
  }
  // Start counting from the next business instant at/after `from`.
  let cursor = normalizeToBusinessStart(from, config, holidays);
  let remaining = budgetMinutes;

  for (let guard = 0; guard < 100_000; guard++) {
    const date = localDateOf(cursor, config.timezone);
    if (!isBusinessDay(date, config, holidays)) {
      const next = nextBusinessDate(date, config, holidays);
      const nextStart = businessStartOf(next, config);
      if (nextStart === null) throw new Error(`No business start for ${next}`);
      cursor = nextStart;
      continue;
    }
    const dayStart = businessStartOf(date, config);
    const dayEnd = businessEndOf(date, config);
    if (dayStart === null || dayEnd === null) {
      throw new Error(`Business hours undefined for ${date}`);
    }
    const activeFrom = Math.max(dayStart.getTime(), cursor.getTime());
    const availableToday = (dayEnd.getTime() - activeFrom) / MINUTE_MS;
    if (remaining <= availableToday) {
      return new Date(activeFrom + remaining * MINUTE_MS);
    }
    remaining -= availableToday;
    const next = nextBusinessDate(date, config, holidays);
    const nextStart = businessStartOf(next, config);
    if (nextStart === null) throw new Error(`No business start for ${next}`);
    cursor = nextStart;
  }
  throw new Error('Could not compute due date within guard limit');
}

/**
 * Business minutes remaining from `now` until `due`. Negative when overdue —
 * callers can use sign for BREACHED and magnitude for "how late".
 */
export function businessMinutesRemaining(
  now: Date,
  due: Date,
  config: BusinessHoursConfig,
  holidays: HolidaySource,
): number {
  return Math.round(businessMinutesBetween(now, due, config, holidays));
}

/** Percentage (0..1+) of the budget consumed between `start` and `now`. */
export function budgetConsumedRatio(
  start: Date,
  now: Date,
  budgetMinutes: number,
  config: BusinessHoursConfig,
  holidays: HolidaySource,
): number {
  if (budgetMinutes <= 0) return 1;
  const consumed = businessMinutesBetween(start, now, config, holidays);
  return consumed / budgetMinutes;
}

export type { LocalDate };
