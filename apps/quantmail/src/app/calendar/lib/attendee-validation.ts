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
