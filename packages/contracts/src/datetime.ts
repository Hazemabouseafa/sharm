import { Temporal } from 'temporal-polyfill';

export const CAIRO_TIMEZONE = 'Africa/Cairo';

export function getTemporal(): typeof Temporal {
  return typeof (globalThis as { Temporal?: typeof Temporal }).Temporal !== 'undefined'
    ? (globalThis as unknown as { Temporal: typeof Temporal }).Temporal
    : Temporal;
}

/**
 * Validates and parses a calendar date YYYY-MM-DD as a location-agnostic PlainDate.
 * Prevents browser/server timezone drift across UTC boundaries.
 */
export function parsePlainDate(isoDate: string): Temporal.PlainDate {
  const T = getTemporal();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error(`Invalid YYYY-MM-DD date string: ${isoDate}`);
  }
  return T.PlainDate.from(isoDate);
}

export function parsePlainTime(hhmm: string): Temporal.PlainTime {
  const T = getTemporal();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(hhmm)) {
    throw new Error(`Invalid HH:MM time string: ${hhmm}`);
  }
  return T.PlainTime.from(hhmm);
}

export function todayInCairo(nowEpochMs?: number): Temporal.PlainDate {
  const T = getTemporal();
  const instant =
    nowEpochMs !== undefined
      ? T.Instant.fromEpochMilliseconds(nowEpochMs)
      : T.Now.instant();
  return instant.toZonedDateTimeISO(CAIRO_TIMEZONE).toPlainDate();
}

export interface CairoZonedResult {
  zoned: Temporal.ZonedDateTime;
  utcDate: Date;
  offset: string;
  dstConflict: boolean;
}

/**
 * Converts a local Egypt operational date + wall-clock time in IANA Africa/Cairo
 * to an exact UTC instant with DST-awareness (never assuming fixed UTC+2).
 */
export function cairoLocalToUtc(
  isoDate: string,
  hhmm: string,
  timeZone: string = CAIRO_TIMEZONE,
): CairoZonedResult {
  const T = getTemporal();
  const plainDate = parsePlainDate(isoDate);
  const plainTime = parsePlainTime(hhmm);
  const plainDateTime = plainDate.toPlainDateTime(plainTime);

  let dstConflict = false;
  try {
    plainDateTime.toZonedDateTime(timeZone, { disambiguation: 'reject' });
  } catch (err) {
    if (err instanceof RangeError) {
      dstConflict = true;
    } else {
      throw err;
    }
  }

  const zoned = plainDateTime.toZonedDateTime(timeZone, { disambiguation: 'compatible' });
  return {
    zoned,
    utcDate: new Date(zoned.epochMilliseconds),
    offset: zoned.offset,
    dstConflict,
  };
}

/**
 * Checks whether a departure has passed its booking cutoff (in hours before Cairo departure time).
 */
export function isPastBookingCutoff(params: {
  departureDate: string;
  startTime: string;
  cutoffHours: number;
  nowUtc?: Date;
  timeZone?: string;
}): boolean {
  const { departureDate, startTime, cutoffHours, nowUtc = new Date(), timeZone = CAIRO_TIMEZONE } = params;
  const { zoned } = cairoLocalToUtc(departureDate, startTime, timeZone);
  const cutoffMs = zoned.epochMilliseconds - cutoffHours * 3600 * 1000;
  return nowUtc.getTime() >= cutoffMs;
}

/**
 * Generates recurring PlainDate strings matching ISO weekdays (1=Mon .. 7=Sun) within [fromDate, toDate],
 * excluding blackout YYYY-MM-DD dates, completely immune to DST drift.
 */
export function generateRecurringCairoDates(params: {
  fromDate: string;
  toDate: string;
  weekdays: number[]; // ISO 1=Mon .. 7=Sun
  blackoutDates?: Set<string> | string[];
}): string[] {
  const start = parsePlainDate(params.fromDate);
  const end = parsePlainDate(params.toDate);
  const weekdaySet = new Set(params.weekdays);
  const blackoutSet =
    params.blackoutDates instanceof Set
      ? params.blackoutDates
      : new Set(params.blackoutDates ?? []);

  const dates: string[] = [];
  let cursor = start;
  let guard = 0;
  while (getTemporal().PlainDate.compare(cursor, end) <= 0 && guard < 730) {
    const iso = cursor.toString();
    if (weekdaySet.has(cursor.dayOfWeek) && !blackoutSet.has(iso)) {
      dates.push(iso);
    }
    cursor = cursor.add({ days: 1 });
    guard++;
  }
  return dates;
}

export function formatCairoDateDisplay(isoDate: string): string {
  const plain = parsePlainDate(isoDate);
  const zoned = plain.toZonedDateTime({ timeZone: CAIRO_TIMEZONE, plainTime: '12:00' });
  return new Date(zoned.epochMilliseconds).toLocaleDateString('en-GB', {
    timeZone: CAIRO_TIMEZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatCairoDateTimeDisplay(isoDate: string, hhmm: string): string {
  const { utcDate, offset } = cairoLocalToUtc(isoDate, hhmm);
  const datePart = utcDate.toLocaleDateString('en-GB', {
    timeZone: CAIRO_TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${datePart}, ${hhmm} (Cairo ${offset})`;
}
