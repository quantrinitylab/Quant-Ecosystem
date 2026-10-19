/**
 * Share-availability ("drop open calendar slots into a draft") — the shared
 * logic behind the compose availability picker used by EmailComposer and
 * DockedComposer.
 *
 * Uses ONLY the signed-in user's own calendar via GET
 * /api/calendar/events/free-busy (the endpoint exposes no per-guest view).
 * Guest calendars are not visible to QuantMail, so the UI must say that
 * honestly instead of inventing per-guest availability.
 */
import { apiFetchRaw } from '@quant/api-client';
import {
  suggestFreeSlots,
  formatSlotLabel,
  type FreeSlot,
} from '../app/calendar/lib/free-busy-slots';

export type { FreeSlot };

/** Backend endpoint that returns the user's own busy intervals. */
export const AVAILABILITY_ENDPOINT = '/api/calendar/events/free-busy';

/** Local-time scanning window, mirroring the calendar "Find a time" panel. */
export const AVAILABILITY_WINDOW_START_HOUR = 8;
export const AVAILABILITY_WINDOW_END_HOUR = 20;

export interface BusyInterval {
  start: string;
  end: string;
}

/**
 * Fetch the user's own busy intervals for [startISO, endISO) from the
 * calendar free-busy endpoint. Throws an honest Error (message carries the
 * HTTP status or the transport failure) — never returns invented data.
 */
export async function fetchBusyIntervals(
  startISO: string,
  endISO: string,
  fetchImpl: typeof apiFetchRaw = apiFetchRaw,
): Promise<BusyInterval[]> {
  const res = await fetchImpl(AVAILABILITY_ENDPOINT, {
    params: { start: startISO, end: endISO },
    timeout: 15000,
  });
  if (!res.ok) {
    throw new Error(`Availability check failed (${res.status})`);
  }
  const json = (await res.json()) as {
    data?: { busy?: Array<{ start?: unknown; end?: unknown }> };
  };
  const busy = Array.isArray(json?.data?.busy) ? json.data.busy : [];
  return busy.filter(
    (b): b is BusyInterval =>
      !!b &&
      typeof b.start === 'string' &&
      b.start.length > 0 &&
      typeof b.end === 'string' &&
      b.end.length > 0,
  );
}

/** Local-time 08:00–20:00 window for the given calendar day. */
export function availabilityDayWindow(date: Date): {
  dayStart: Date;
  dayEnd: Date;
} {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  return {
    dayStart: new Date(y, m, d, AVAILABILITY_WINDOW_START_HOUR, 0, 0, 0),
    dayEnd: new Date(y, m, d, AVAILABILITY_WINDOW_END_HOUR, 0, 0, 0),
  };
}

export interface AvailabilityDayResult {
  dayStart: Date;
  dayEnd: Date;
  slots: FreeSlot[];
}

/**
 * Suggest up to 6 open slots of `durationMin` minutes on `day` (local time,
 * 08:00–20:00), skipping the user's real busy blocks and anything in the
 * past. Returns an empty slot list (not invented slots) when nothing is open.
 */
export async function fetchAvailability(
  day: Date,
  durationMin: number,
  opts?: { nowMs?: number; fetchImpl?: typeof apiFetchRaw },
): Promise<AvailabilityDayResult> {
  const { dayStart, dayEnd } = availabilityDayWindow(day);
  const busy = await fetchBusyIntervals(
    dayStart.toISOString(),
    dayEnd.toISOString(),
    opts?.fetchImpl,
  );
  const slots = suggestFreeSlots({
    busy,
    windowStart: dayStart,
    windowEnd: dayEnd,
    durationMin,
    stepMin: 30,
    maxSlots: 6,
    nowMs: opts?.nowMs,
  });
  return { dayStart, dayEnd, slots };
}

/** "Wed, Oct 21" — the day label used in the inserted draft text. */
export function formatAvailabilityDay(day: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(day);
}

/** Short local timezone name ("IST", "PST", …) for the recipient's clarity. */
export function formatLocalTzShort(day: Date): string {
  return new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(day)
    .find((p) => p.type === 'timeZoneName')?.value ?? '';
}

/**
 * The plain-text block inserted into the draft — e.g.
 *
 *   I'm available on Wed, Oct 21 (IST):
 *   • 10:30 – 11:00
 *   • 14:00 – 14:30
 *
 * Times are the user's local time; the zone short-name keeps the recipient
 * honest about whose clock this is.
 */
export function buildAvailabilityInsertText(
  day: Date,
  slots: FreeSlot[],
): string {
  const tz = formatLocalTzShort(day);
  const header = `I'm available on ${formatAvailabilityDay(day)}${tz ? ` (${tz})` : ''}:`;
  const lines = slots.map((s) => `\u2022 ${formatSlotLabel(s)}`);
  return `${header}\n${lines.join('\n')}`;
}

/**
 * The local date (no time component) for a day offset from today, e.g.
 * `dayOffsetDate(1)` is tomorrow. Used for the picker's quick day chips.
 */
export function dayOffsetDate(offsetDays: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
}

/** "YYYY-MM-DD" for a native date input's value. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Parse a native date input's "YYYY-MM-DD" into a local-time Date at noon
 * (noon avoids DST-midnight edge cases; only the day matters downstream).
 * Returns null for anything that isn't a real calendar date.
 */
export function parseDateInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}
