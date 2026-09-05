import type { Email } from '../types';

/**
 * True when a value is safe to place in a route segment or query param.
 *
 * The two strings that matter are `'null'` and `'undefined'`: they arrive from
 * template interpolation, not from data — `router.push(`/thread/${id}`)` with an
 * absent id produces a URL that looks perfectly valid and resolves to nothing.
 * `/thread/[id]` already refuses both on arrival, so this is the same rule stated
 * at the departure gate, where there is still a row to fall back to.
 */
export function isValidRouteId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== 'null' && trimmed !== 'undefined';
}

/**
 * Which id opens a conversation: its thread if it has one, else the message.
 *
 * Not every row carries a `threadId` — a send that never got threaded, a row
 * seeded from an offline cache — and the thread view resolves a message id just
 * as well. `null` means the row cannot be opened at all, which is a state to
 * report rather than navigate into.
 */
export function resolveThreadTarget(email: Pick<Email, 'id' | 'threadId'>): string | null {
  if (isValidRouteId(email.threadId)) return email.threadId;
  if (isValidRouteId(email.id)) return email.id;
  return null;
}
