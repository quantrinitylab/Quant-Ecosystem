// ============================================================================
// QuantMail — Calendar event-detail pure helpers (K10 / M09).
//
// Kept free of React so the formatting contract is unit-testable.
// ============================================================================

import { tzOffsetMinutes } from '../../../lib/calendar-logo-date';

export type RsvpStatus = 'accepted' | 'declined' | 'tentative' | 'pending';

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  accepted: 'Accepted',
  declined: 'Declined',
  tentative: 'Maybe',
  pending: 'No response',
};

export function formatWhen(
  start: string | Date,
  end: string | Date,
  allDay: boolean,
  timeZone?: string,
): string {
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime())) return 'Unknown time';
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  };
  if (allDay) return s.toLocaleDateString([], dateOpts);
  const timeOpts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  };
  const startStr = s.toLocaleString([], { ...dateOpts, ...timeOpts });
  if (Number.isNaN(e.getTime()) || e.getTime() === s.getTime()) return startStr;
  const sameDay = s.toDateString() === e.toDateString();
  const endStr = sameDay
    ? e.toLocaleTimeString([], timeOpts)
    : e.toLocaleString([], { ...dateOpts, ...timeOpts });
  return `${startStr} – ${endStr}`;
}

export function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function rsvpTone(status: string): string {
  switch (status) {
    case 'accepted':
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    case 'declined':
      return 'bg-red-500/15 text-red-400 border-red-500/30';
    case 'tentative':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    default:
      return 'bg-[var(--quant-muted)] text-[var(--quant-muted-foreground)] border-[var(--quant-border)]';
  }
}

export function toLocalInputValue(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Strip the embedded __QUANT_META__ JSON block the backend stores inside
 * descriptions before rendering or seeding the edit form.
 */
export function stripQuantMeta(description: string | undefined): string {
  return (description ?? '').replace(/__QUANT_META__:[\s\S]*?:__END_QUANT_META__/g, '').trim();
}

// The backend DTO is looser than the CalendarEvent interface (attendees are
// {email,name,status}, reminders are label strings, recurrence is an RRULE).
export interface EventDetailDto {
  id: string;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  location?: string;
  status?: string;
  timeZone?: string;
  /** Server-computed: is the signed-in viewer in this event's attendee list. */
  viewerIsAttendee?: boolean;
  attendees?: Array<{ email: string; name?: string; status?: string }>;
  reminders?: string[];
  recurrence?: string | null;
  // Parsed by the backend out of the stored __QUANT_META__ description header.
  driveLink?: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Render a stored UTC instant as a `datetime-local` wall-clock value in the
 * event's own timezone. Rendering in the *browser* timezone instead made a
 * user editing an event saved in another zone see a shifted time and
 * "correct" it — silently moving the meeting. Falls back to browser-local
 * rendering for a missing or invalid zone name.
 */
export function toZonedInputValue(value: string | Date, timeZone?: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  let offsetMinutes: number;
  try {
    offsetMinutes = timeZone ? tzOffsetMinutes(d, timeZone) : -d.getTimezoneOffset();
  } catch {
    offsetMinutes = -d.getTimezoneOffset();
  }
  const shifted = new Date(d.getTime() + offsetMinutes * 60_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}T${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}

/**
 * Parse a `datetime-local` wall-clock value as belonging to `timeZone`,
 * returning the UTC ISO instant. Two refinement passes absorb a DST offset
 * change between the first guess and the resolved instant. Falls back to
 * browser-local parsing for a missing or invalid zone name.
 */
export function zonedInputToIso(value: string, timeZone?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?/.exec(value.trim());
  if (!match) return new Date(value).toISOString();
  const parts = match.slice(1).map(Number);
  const y = parts[0] as number;
  const mo = parts[1] as number;
  const da = parts[2] as number;
  const h = parts[3] as number;
  const mi = parts[4] as number;
  const wallAsUtc = Date.UTC(y, mo - 1, da, h, mi);
  if (timeZone) {
    try {
      let candidate = wallAsUtc;
      for (let i = 0; i < 2; i++) {
        candidate = wallAsUtc - tzOffsetMinutes(new Date(candidate), timeZone) * 60_000;
      }
      return new Date(candidate).toISOString();
    } catch {
      // Invalid zone name — fall through to browser-local parsing.
    }
  }
  return new Date(value).toISOString();
}
