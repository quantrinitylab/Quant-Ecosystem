/**
 * Small, pure copy/format helpers shared by the calendar views.
 *
 * Kept free of React so they are trivially unit-testable: the views used to
 * hand-roll strings like "1 entries · 1 holidays" and seconds-precision
 * `toLocaleString()` ranges ("10/13/2026, 10:00:00 AM – 11:00:00 AM").
 */

import { FULL_WEEKDAYS, MONTH_NAMES, MONTHS_SHORT } from '../types';

/** "1 event", "2 events" — never "1 events". */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "9:30 AM" in the viewer's locale/zone; '' for an invalid date. */
export function clockTime(date: Date, timeZone?: string): string {
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    });
  } catch {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}

/** "Tuesday, Oct 13". */
export function weekdayMonthDay(date: Date): string {
  return `${FULL_WEEKDAYS[date.getDay()]}, ${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}`;
}

/** "Tuesday, October 13" — for accessible names. */
export function longDayLabel(date: Date): string {
  return `${FULL_WEEKDAYS[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

const startOfDayMs = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 'Today' / 'Tomorrow' / 'Yesterday' relative to `now`, else null. */
export function relativeDayLabel(date: Date, now: Date): 'Today' | 'Tomorrow' | 'Yesterday' | null {
  const diff = Math.round((startOfDayMs(date) - startOfDayMs(now)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return null;
}

/** "30 min", "1 hr", "1 hr 30 min", "3 hrs". */
export function durationLabel(start: Date, end: Date): string {
  const mins = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (!Number.isFinite(mins) || mins <= 0) return '';
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hours = `${h} ${h === 1 ? 'hr' : 'hrs'}`;
  return m ? `${hours} ${m} min` : hours;
}

type AttendeeLike = string | { email?: string; name?: string; status?: string } | null | undefined;

export interface AttendeeIdentity {
  key: string;
  label: string;
  email: string;
  initials: string;
  status: string;
}

/**
 * Normalise an attendee — the backend DTO returns {email,name,status}
 * objects even though CalendarEventLike types them as strings.
 */
export function attendeeIdentity(a: AttendeeLike): AttendeeIdentity | null {
  if (!a) return null;
  const email = (typeof a === 'string' ? a : a.email ?? '').trim();
  const name = (typeof a === 'string' ? '' : a.name ?? '').trim();
  const status = (typeof a === 'string' ? '' : a.status ?? '').trim() || 'pending';
  const label = name || email;
  if (!label) return null;
  const base = name || email.split('@')[0] || '';
  const words = base.split(/[\s._-]+/).filter(Boolean);
  const initials = (
    words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : base.slice(0, 2)
  ).toUpperCase();
  return { key: email || name, label, email, initials, status };
}

/** Stable 0–359 hue per person, for initials avatars. */
export function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}
