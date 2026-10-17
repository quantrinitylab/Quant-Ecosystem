// ============================================================================
// QuantChat — birthday helpers (QC-F-467)
//
// Pure date logic for the birthday layer. The stored value is the existing
// `User.dateOfBirth` column (a full DateTime); everything here works in UTC
// date-only terms so a birthday never shifts a day because of a server or
// client timezone conversion:
//
//   parseDateOfBirth(str, now)  — strict 'YYYY-MM-DD' validation (real
//     calendar date, not in the future, year >= 1900) → UTC-midnight Date,
//     or null when invalid. The route maps null to 400.
//   toDateOnlyString(date)      — the inverse: UTC 'YYYY-MM-DD'.
//   monthDayOf(dob)             — { month, day } (UTC) — the ONLY birthday
//     fact ever shared with other users (never the year, never an age).
//   isBirthdayOn(dob, m, d, y)  — the leap rule: a Feb 29 birthday is
//     observed on Feb 28 in non-leap years, and ONLY on Feb 29 in leap
//     years (never both).
//   todayMonthDayIn(tz, now)    — "today" for the viewer: the server clock
//     (`now`) read in the viewer's IANA timezone. Throws (RangeError from
//     Intl) on an unknown timezone — the route maps that to 400 so a buggy
//     client sees its bug instead of silently getting the wrong day.
// ============================================================================

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOfBirth(input: string, now: Date = new Date()): Date | null {
  if (typeof input !== 'string' || !DATE_ONLY_RE.test(input)) return null;
  const year = Number(input.slice(0, 4));
  const month = Number(input.slice(5, 7));
  const day = Number(input.slice(8, 10));
  if (year < 1900) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Round-trip: Date.UTC rolls impossible dates (Feb 30) into the next
  // month — a mismatch means the calendar date does not exist.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  // Not in the future, compared date-only in UTC against the server's day.
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (date.getTime() > todayUtc) return null;
  return date;
}

export function toDateOnlyString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function monthDayOf(dob: Date): { month: number; day: number } {
  return { month: dob.getUTCMonth() + 1, day: dob.getUTCDate() };
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function isBirthdayOn(
  dob: Date,
  month: number,
  day: number,
  yearOfDay: number,
): boolean {
  const md = monthDayOf(dob);
  if (md.month === 2 && md.day === 29) {
    // Feb 29 birthdays: leap years observe the real day only; non-leap
    // years observe Feb 28 (the last day of the birth month).
    return isLeapYear(yearOfDay) ? month === 2 && day === 29 : month === 2 && day === 28;
  }
  return md.month === month && md.day === day;
}

export function todayMonthDayIn(
  timeZone: string,
  now: Date = new Date(),
): { month: number; day: number; year: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  let month = 0;
  let day = 0;
  let year = 0;
  for (const part of parts) {
    if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
    else if (part.type === 'year') year = Number(part.value);
  }
  return { month, day, year };
}
