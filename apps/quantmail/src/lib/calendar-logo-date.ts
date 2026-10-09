/**
 * Date model for the QuantCalendar logo.
 *
 * The logo shows the *authoritative* calendar date: the user's configured
 * calendar timezone (`localStorage['quant_calendar_timezone']`, the same key
 * the calendar app itself uses), falling back to the app default
 * ('Asia/Kolkata') and finally the device timezone.
 *
 * All functions here are pure and timezone-explicit so they are unit-testable:
 * no `new Date()` inside, no ambient locale.
 */

export interface CalendarLogoDate {
  /** Day of month, 1-31. */
  day: number;
  /** Short weekday, e.g. "FRI" (uppercased by the caller for paint). */
  weekday: string;
  /** Short month, e.g. "Oct". */
  month: string;
  /** Full year, e.g. 2026. */
  year: number;
  /** "Oct 2026" — the header label. */
  monthYear: string;
  /** Stable key that changes exactly when the visible date changes. */
  key: string;
}

const CALENDAR_TZ_KEY = 'quant_calendar_timezone';
const APP_DEFAULT_TZ = 'Asia/Kolkata';

/**
 * Resolve the calendar timezone: user-configured > app default > device.
 * Never throws — an invalid stored value falls through to the default.
 */
export function resolveCalendarTimezone(): string {
  try {
    const stored =
      typeof localStorage !== 'undefined' ? localStorage.getItem(CALENDAR_TZ_KEY) : null;
    if (stored) {
      // Validate: throws RangeError for unknown zones.
      new Intl.DateTimeFormat('en-US', { timeZone: stored }).format(new Date(0));
      return stored;
    }
  } catch {
    // fall through
  }
  return APP_DEFAULT_TZ;
}

/**
 * The date parts the logo paints, in the given timezone and locale.
 * Uses Intl so month lengths, leap years and DST are handled by the platform.
 */
export function getCalendarLogoDate(
  now: Date,
  timeZone: string,
  locale = 'en-US',
): CalendarLogoDate {
  const dayFmt = new Intl.DateTimeFormat(locale, { timeZone, day: 'numeric' });
  const weekdayFmt = new Intl.DateTimeFormat(locale, { timeZone, weekday: 'short' });
  const monthFmt = new Intl.DateTimeFormat(locale, { timeZone, month: 'short' });
  const yearFmt = new Intl.DateTimeFormat(locale, { timeZone, year: 'numeric' });

  const day = Number(dayFmt.format(now));
  const weekday = weekdayFmt.format(now);
  const month = monthFmt.format(now);
  const year = Number(yearFmt.format(now));
  return {
    day,
    weekday,
    month,
    year,
    monthYear: `${month} ${year}`,
    key: `${year}-${month}-${day}`,
  };
}

/**
 * Offset of `timeZone` from UTC in minutes at the given instant.
 * Positive east of Greenwich (matches -Date.getTimezoneOffset() sign).
 */
export function tzOffsetMinutes(at: Date, timeZone: string): number {
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }));
  const zoned = new Date(at.toLocaleString('en-US', { timeZone }));
  return Math.round((zoned.getTime() - utc.getTime()) / 60000);
}

/**
 * Milliseconds from `now` until the next local midnight in `timeZone`.
 * Refines once against the offset at the candidate midnight so a DST
 * transition between now and midnight does not skew the timer.
 */
export function msUntilMidnight(now: Date, timeZone: string): number {
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = dateFmt.format(now).split('-').map(Number);
  // Candidate: midnight *after* today, expressed in UTC, then shifted by the
  // zone offset. One refinement pass absorbs a DST change overnight.
  let candidate = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0);
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMinutes(new Date(candidate), timeZone);
    candidate = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0) - off * 60_000;
  }
  return Math.max(0, candidate - now.getTime());
}
