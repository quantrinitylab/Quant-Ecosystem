/**
 * Email-shape validation for calendar attendees.
 *
 * One canonical helper so the guest chip input, the `?attendee=` deep link,
 * and the edit-sheet loader all agree on what counts as an email address.
 * This is intentionally a *shape* check (local@domain.tld), not a
 * deliverability check — the backend applies the same shape before
 * persisting and before emitting ICS, and drops anything that fails it.
 */
export const ATTENDEE_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Result of parsing the `?attendee=` deep link the contacts
 * "Schedule meeting" button sends to /calendar.
 *
 * - `absent`: no `attendee` param at all — the calendar must do nothing.
 * - `blank`: the param is present but empty/whitespace — happens for
 *   email-less (phone-only) contacts. The caller should still open a
 *   meeting sheet, just with no guest prefilled, instead of landing
 *   silently on the grid.
 * - `valid`: an email-shaped address, trimmed, ready to become a guest.
 * - `invalid`: a non-blank value that is not an email — the caller shows
 *   an honest error and adds no guest. `raw` is the original value for
 *   the toast; it is never added as a guest or baked into the title.
 */
export type AttendeeDeepLink =
  | { kind: 'absent' }
  | { kind: 'blank' }
  | { kind: 'valid'; email: string }
  | { kind: 'invalid'; raw: string };

/** Parse the raw `?attendee=` query value (null when absent). */
export function parseAttendeeDeepLink(raw: string | null): AttendeeDeepLink {
  if (raw === null) return { kind: 'absent' };
  const trimmed = raw.trim();
  if (trimmed === '') return { kind: 'blank' };
  if (!isEmailShaped(trimmed)) return { kind: 'invalid', raw };
  return { kind: 'valid', email: trimmed };
}

/** True when `value` is a string with the shape of an email address. */
export function isEmailShaped(value: unknown): value is string {
  return typeof value === 'string' && ATTENDEE_EMAIL_PATTERN.test(value.trim());
}

/**
 * Pull the displayable email out of a stored attendee entry
 * (bare string or `{ email }` object), trimmed and email-shape-checked.
 * Returns `null` for anything that is not an email — legacy garbage rows
 * must never surface as invitee chips.
 */
export function toAttendeeEmail(entry: unknown): string | null {
  const raw =
    typeof entry === 'string'
      ? entry
      : typeof (entry as { email?: unknown } | null)?.email === 'string'
        ? (entry as { email: string }).email
        : '';
  const email = raw.trim();
  return isEmailShaped(email) ? email : null;
}
