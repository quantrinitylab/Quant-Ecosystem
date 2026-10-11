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
 * Value for a "Date:"-style field: the locale date-time of the best real
 * date, or the honest `fallback` when none exists. Never "Invalid Date",
 * never the raw input.
 */
export function formatDetailDate(message: DatedMessage, fallback = 'Unknown date'): string {
  const date = resolveMessageDate(message);
  return date ? date.toLocaleString() : fallback;
}
