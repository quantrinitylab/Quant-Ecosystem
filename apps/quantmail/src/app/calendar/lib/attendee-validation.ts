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

/**
 * Casefold key for attendee comparison. Mail delivery treats the whole
 * address case-insensitively in practice, and the backend's
 * `toStoredAttendees` already collapses on `email.toLowerCase()` — so the
 * frontend must fold the same way, or "A@x.com" and "a@x.com" show up as
 * two chips (and double-count in guest prompts) even though only one
 * invite is ever stored/sent.
 */
export function attendeeDedupKey(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Dedupe an attendee list case-insensitively, keeping the FIRST-seen
 * casing (matching the backend, which keeps the first occurrence). Also
 * drops non-email entries via `toAttendeeEmail`, so legacy garbage rows
 * never survive the edit-sheet loader.
 */
export function dedupeAttendeeEmails(entries: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    const email = toAttendeeEmail(entry);
    if (email === null) continue;
    const key = attendeeDedupKey(email);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(email);
  }
  return result;
}

/**
 * Add one email to an attendee list, or return the list unchanged when a
 * case-variant is already present ("A@x.com" after "a@x.com" is a dup, not
 * a second guest). Non-email input is also refused — callers already
 * validate, this is belt-and-braces so a bad value can never sneak in
 * through a new call site.
 */
export function addAttendeeEmail(list: readonly string[], email: string): string[] {
  const clean = toAttendeeEmail(email);
  if (clean === null) return [...list];
  if (list.some((existing) => attendeeDedupKey(existing) === attendeeDedupKey(clean))) {
    return [...list];
  }
  return [...list, clean];
}
