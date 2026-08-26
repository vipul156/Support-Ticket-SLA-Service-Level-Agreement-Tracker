/**
 * Pure business-calendar primitives.
 *
 * All functions are pure: no I/O, no clock access, no Prisma. "Now" is always
 * injected by callers. Dates are handled as UTC instants (JS Date); conversion
 * to the configured business timezone uses Intl parts so no external tz
 * dependency is required (and DST is handled by the ICU database).
 */

/** A local calendar date in the business timezone, e.g. "2026-08-24". */
export type LocalDate = string;

export interface BusinessHoursConfig {
  /** IANA timezone, e.g. "Asia/Kolkata". */
  timezone: string;
  /** 0 = Sunday … 6 = Saturday. Business days are the listed weekdays. */
  businessDays: readonly number[];
  /** Local wall-clock start hour, inclusive. */
  startHour: number;
  /** Local wall-clock end hour, exclusive. */
  endHour: number;
}

export interface HolidaySource {
  /** Returns true when the given local date is a holiday. */
  isHoliday(date: LocalDate): boolean;
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  timezone: 'Asia/Kolkata',
  businessDays: [1, 2, 3, 4, 5],
  startHour: 9,
  endHour: 18,
};

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0-6
}

/** Convert a UTC instant to wall-clock parts in the business timezone. */
export function toZonedParts(instant: Date, timezone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(instant);
  const get = (type: string): string => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw new Error(`DateTimeFormat part ${type} not found`);
    return p.value;
  };
  const weekdayNames: ReadonlyMap<string, number> = new Map([
    ['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6],
  ]);
  const weekday = weekdayNames.get(get('weekday'));
  if (weekday === undefined) throw new Error(`Unknown weekday ${get('weekday')}`);
  const hour = Number(get('hour')) % 24; // ICU may emit "24" for midnight
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour,
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday,
  };
}

/** Local date string "YYYY-MM-DD" of the instant in the business timezone. */
export function localDateOf(instant: Date, timezone: string): LocalDate {
  const p = toZonedParts(instant, timezone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Epoch ms of a local wall-clock time on the given local date. */
export function zonedTimeToUtc(
  localDate: LocalDate,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  // Step by 15-minute offsets around the naive guess to be DST-safe.
  const naive = Date.UTC(
    Number(localDate.slice(0, 4)),
    Number(localDate.slice(5, 7)) - 1,
    Number(localDate.slice(8, 10)),
    hour,
    minute,
  );
  let best: { delta: number; instant: number } | null = null;
  for (let offset = -840; offset <= 840; offset += 15) {
    const candidate = naive + offset * 60_000;
    const parts = toZonedParts(new Date(candidate), timezone);
    if (
      `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` === localDate &&
      parts.hour === hour &&
      parts.minute === minute
    ) {
      if (best === null || Math.abs(offset) < Math.abs(best.delta)) {
        best = { delta: offset, instant: candidate };
      }
    }
  }
  if (best === null) {
    throw new Error(`Cannot resolve ${localDate}T${hour}:${minute} in ${timezone}`);
  }
  return new Date(best.instant);
}

export function isBusinessDay(localDate: LocalDate, config: BusinessHoursConfig, holidays: HolidaySource): boolean {
  // Weekday derived from the date itself (UTC interpretation is fine for
  // weekday math because we only need the day-of-week, computed via Date.UTC).
  const t = Date.UTC(
    Number(localDate.slice(0, 4)),
    Number(localDate.slice(5, 7)) - 1,
    Number(localDate.slice(8, 10)),
  );
  const weekday = new Date(t).getUTCDay();
  if (!config.businessDays.includes(weekday)) return false;
  return !holidays.isHoliday(localDate);
}

/** Business-start instant of a local date (e.g. 09:00) — null if not a business day. */
export function businessStartOf(localDate: LocalDate, config: BusinessHoursConfig): Date | null {
  return zonedTimeToUtc(localDate, config.startHour, 0, config.timezone);
}

/** Business-end instant of a local date (e.g. 18:00) — null if not a business day. */
export function businessEndOf(localDate: LocalDate, config: BusinessHoursConfig): Date | null {
  return zonedTimeToUtc(localDate, config.endHour, 0, config.timezone);
}

/** Next local date (strictly after the given one) that is a business day. */
export function nextBusinessDate(localDate: LocalDate, config: BusinessHoursConfig, holidays: HolidaySource): LocalDate {
  const year = Number(localDate.slice(0, 4));
  const month = Number(localDate.slice(5, 7));
  const day = Number(localDate.slice(8, 10));
  let cursor = new Date(Date.UTC(year, month - 1, day + 1));
  for (let i = 0; i < 400; i++) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cursor.getUTCDate()).padStart(2, '0');
    const candidate = `${y}-${m}-${d}`;
    if (isBusinessDay(candidate, config, holidays)) return candidate;
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  throw new Error('No business day found within 400 days');
}

export function addDaysToLocalDate(localDate: LocalDate, days: number): LocalDate {
  const t = Date.UTC(
    Number(localDate.slice(0, 4)),
    Number(localDate.slice(5, 7)) - 1,
    Number(localDate.slice(8, 10)) + days,
  );
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** The local date that follows the instant in the business timezone. */
export function nextLocalDateOf(instant: Date, timezone: string): LocalDate {
  const p = toZonedParts(instant, timezone);
  const today = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return addDaysToLocalDate(today, 1);
}

/**
 * Clamp an arbitrary instant to the start of the next (or current) business
 * period: if `instant` is before today's 09:00 → today 09:00; if after 18:00
 * or on a non-business day → next business day 09:00; otherwise unchanged.
 */
export function normalizeToBusinessStart(
  instant: Date,
  config: BusinessHoursConfig,
  holidays: HolidaySource,
): Date {
  const localDate = localDateOf(instant, config.timezone);
  if (isBusinessDay(localDate, config, holidays)) {
    const start = businessStartOf(localDate, config);
    const end = businessEndOf(localDate, config);
    if (start !== null && end !== null && instant.getTime() >= start.getTime() && instant.getTime() < end.getTime()) {
      return new Date(instant.getTime());
    }
    if (start !== null && instant.getTime() < start.getTime()) {
      return new Date(start.getTime());
    }
  }
  const next = nextBusinessDate(localDate, config, holidays);
  const nextStart = businessStartOf(next, config);
  if (nextStart === null) {
    throw new Error(`No business start for ${next}`);
  }
  return new Date(nextStart.getTime());
}

/** Total business minutes available on one local date (from startHour to endHour). */
export function businessMinutesOnDate(config: BusinessHoursConfig): number {
  return (config.endHour - config.startHour) * 60;
}
