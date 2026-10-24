/**
 * Honest date resolution for message metadata display.
 *
 * QM-FIX (thread-view "Date:" field): the thread details accordion rendered
 * `new Date(message.receivedAt).toLocaleString()` directly, and the sender
 * header fell back to `new Date()` — i.e. *today* — when `receivedAt` was
 * absent. A message whose `receivedAt` was missing or unparseable (for
 * example, non-date text landing in the field) therefore displayed
 * "Invalid Date" — or worse, a fabricated current date — in a field labelled
 * "Date:". These helpers resolve the best available REAL date
 * (receivedAt → createdAt → updatedAt) and degrade to an explicit honest
 * fallback instead of inventing or garbling one. The raw input is never
 * returned, so body text can never leak into a date field.
 */

export type DateLike = string | Date | number | null | undefined;

function toValidDate(value: DateLike): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export interface DatedMessage {
  receivedAt?: DateLike;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

/**
 * Best real timestamp for a message, newest semantic first.
 * Returns null only when the message carries no usable date at all.
 */
export function resolveMessageDate(message: DatedMessage): Date | null {
  return (
    toValidDate(message.receivedAt) ??
    toValidDate(message.createdAt) ??
    toValidDate(message.updatedAt)
  );
}

/**
 * Machine-readable ISO-8601 for a `<time dateTime={...}>` attribute.
 * `Date.prototype.toISOString()` THROWS a RangeError on an invalid date
 * (unlike `getTime()`, which merely returns NaN), so an unguarded
 * `new Date(thread.receivedAt).toISOString()` crashed the whole inbox row
 * render for a thread with a bad timestamp. Returns undefined for missing
 * or unparseable input — React then omits the attribute — never throws.
 */
export function safeISODateTime(value: DateLike): string | undefined {
  const date = toValidDate(value);
  return date ? date.toISOString() : undefined;
}

/**
 * Value for a "Date:"-style field: the locale date-time of the best real
 * date, or the honest `fallback` when none exists. Never "Invalid Date",
 * never the raw input.
 */
export function formatDetailDate(message: DatedMessage, fallback = 'Unknown date'): string {
  const date = resolveMessageDate(message);
  return date ? date.toLocaleString() : fallback;
}

/**
 * Compact list-row date, the way the inbox writes it: a time for today
 * ("1:53 PM"), "Oct 13" earlier this year, "Oct 13, 2025" before that.
 * Returns '' for a missing or unparseable value, never "Invalid Date".
 *
 * Trash rows printed a bare `toLocaleDateString()` ("10/13/2026"). On a
 * phone that number sat in the action cluster and squeezed the subject into
 * a column that wrapped over three lines.
 */
export function formatListDate(value: DateLike, now: Date = new Date()): string {
  const date = toValidDate(value);
  if (!date) return '';
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}
