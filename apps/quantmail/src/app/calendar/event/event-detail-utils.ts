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
  /** Server-computed: is the signed-in viewer the event's organizer/owner. */
  viewerIsOwner?: boolean;
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

// ============================================================================
// RSVP occurrence-vs-series scope confirmation (v1 contract).
// The backend RSVP always writes the series-level attendee list (occurrences
// are virtual rows — see docs/quant-architecture/products/quantmail/backend/
// calendar-rsvp-occurrence-contract.md). After a successful RSVP the response carries
// rsvpScope; these helpers build the honest confirmation copy so the user
// knows exactly what their response covered, instead of implying a
// per-occurrence write.
// ============================================================================

export interface RsvpScopeInfo {
  kind: 'occurrence' | 'event';
  appliesTo: 'series' | 'event';
  fromOccurrence: string | null;
}

/** "2026-10-15T09:00:00.000Z" -> "Wed, Oct 15 · 2:30 PM" in the event's zone. */
export function formatOccurrenceLabel(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(d);
  } catch {
    return iso;
  }
}

/**
 * Honest confirmation copy for a completed RSVP. Never claims a
 * per-occurrence write: v1 applies the status to the whole series.
 */
export function buildRsvpScopeCopy(
  status: RsvpStatus,
  scope: RsvpScopeInfo,
  occurrenceLabel?: string | null,
): string {
  const label = RSVP_LABELS[status] ?? status;
  if (scope.appliesTo === 'event') {
    return `${label} — recorded for this event.`;
  }
  const from = occurrenceLabel ?? scope.fromOccurrence;
  if (scope.kind === 'occurrence' && from) {
    return (
      `${label} — recorded for the entire series. ` +
      `You responded from the ${from} occurrence; every occurrence in this series shares this response.`
    );
  }
  return `${label} — recorded for the entire series. Every occurrence in this series shares this response.`;
}

/**
 * Fallback scope when the backend predates rsvpScope (deploy skew): derive
 * the same shape client-side from the page's event id and recurrence flag.
 */
export function fallbackRsvpScope(eventId: string, recurrence?: string | null): RsvpScopeInfo {
  const idx = eventId.indexOf('_');
  return {
    kind: idx === -1 ? 'event' : 'occurrence',
    appliesTo: recurrence ? 'series' : 'event',
    fromOccurrence: idx === -1 ? null : decodeURIComponent(eventId.slice(idx + 1)),
  };
}

// ============================================================================
// RSVP pre-write confirmation gate (CODEX-REVIEW follow-up on #1100).
//
// The v1 contract writes every RSVP to the series-level attendee list, but
// the old UI POSTed first and explained the scope only AFTER success — the
// user clicked "Accepted" on an occurrence believing they answered that one
// occurrence. Before ANY request from a recurring series, the UI must show
// the authoritative effect and require explicit confirm; Cancel/back must
// produce zero mutation. Non-recurring events post directly (no scope
// surprise is possible).
//
// Kept pure (no React) so the no-POST-before-confirm / cancel-no-POST /
// confirm-sends-once contract is unit-testable without a DOM.
// ============================================================================

export interface RsvpWriteIntent {
  /** True when the RSVP must not POST until the user explicitly confirms. */
  requiresPreConfirm: boolean;
  scope: RsvpScopeInfo;
}

/**
 * Pre-write copy: future tense ("will apply"), never claims a per-occurrence
 * write. Mirrors buildRsvpScopeCopy's shape so the pre- and post-action
 * messages agree on scope.
 */
export function buildRsvpPreWriteCopy(
  status: RsvpStatus,
  scope: RsvpScopeInfo,
  occurrenceLabel?: string | null,
): string {
  const label = RSVP_LABELS[status] ?? status;
  const from = occurrenceLabel ?? scope.fromOccurrence;
  if (scope.kind === 'occurrence' && from) {
    return (
      `${label} — your response will apply to the entire series. ` +
      `You are responding from the ${from} occurrence; every occurrence in this series will share this response.`
    );
  }
  return (
    `${label} — your response will apply to the entire series. ` +
    `Every occurrence in this series will share this response.`
  );
}

/** Decide whether an RSVP needs the pre-write confirmation dialog. */
export function planRsvpWrite(
  eventId: string,
  recurrence: string | null | undefined,
): RsvpWriteIntent {
  const scope = fallbackRsvpScope(eventId, recurrence);
  return { requiresPreConfirm: scope.appliesTo === 'series', scope };
}

export interface RsvpWriteGateActions {
  /** The single mutation trigger — the gate guarantees it fires at most once. */
  post: (status: RsvpStatus) => Promise<unknown>;
}

/**
 * A one-shot gate around the RSVP mutation. The page resolves the intent
 * with planRsvpWrite, then:
 * - direct (non-recurring) → request() returns false and posts immediately,
 * - series → request() returns true WITHOUT posting; confirm() posts exactly
 *   once (later calls are no-ops), cancel() performs zero mutation.
 */
export function createRsvpWriteGate(actions: RsvpWriteGateActions) {
  let pending: { status: RsvpStatus; confirmed: boolean } | null = null;

  return {
    /**
     * Start an RSVP write. Returns true when the caller must show the
     * pre-write confirmation first; false when the write posted directly.
     */
    request(status: RsvpStatus, intent: RsvpWriteIntent): boolean {
      if (!intent.requiresPreConfirm) {
        void actions.post(status);
        return false;
      }
      pending = { status, confirmed: false };
      return true;
    },
    /**
     * The dialog's Confirm path. Posts exactly once per pending intent;
     * a second call (double-tap, key repeat) is a no-op.
     */
    confirm(): Promise<unknown> | null {
      if (!pending || pending.confirmed) return null;
      pending.confirmed = true;
      return actions.post(pending.status);
    },
    /** The dialog's Cancel/back path — zero mutation, by construction. */
    cancel(): void {
      pending = null;
    },
  };
}
