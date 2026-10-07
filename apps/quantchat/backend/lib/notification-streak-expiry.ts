// ============================================================================
// QuantChat - Streak-Expiry Warning (Task 10.3)
//
// When a streak has less than 4 hours remaining before it expires (and has not
// already expired), queue a STREAKS-category notification to each participant
// so they can keep the streak alive (Req 9.4).
//
// Pure logic: the `enqueue` callback is injected (typically the
// NotificationBatcher / dispatcher) so this module stays testable and free of
// transport concerns.
// ============================================================================

import type { NotificationPayload } from './notification-dispatch';

/** Threshold under which a warning fires: 4 hours, in milliseconds. */
export const STREAK_EXPIRY_WARNING_MS = 4 * 60 * 60 * 1000;

export interface StreakRecord {
  id?: string;
  userAId: string;
  userBId: string;
  count: number;
  /** When the streak expires (epoch ms or ISO/Date). */
  expiresAt: Date | string | number;
  /** Conversation id used for the deep-link, if known. */
  conversationId?: string;
}

function toMillis(value: Date | string | number): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
}

/** Milliseconds remaining until the streak expires (negative if already past). */
export function msUntilExpiry(streak: StreakRecord, now: number = Date.now()): number {
  return toMillis(streak.expiresAt) - now;
}

/**
 * True when a streak should trigger an expiry warning: it has NOT yet expired
 * and has strictly less than 4 hours remaining.
 */
export function shouldWarnStreakExpiry(streak: StreakRecord, now: number = Date.now()): boolean {
  const remaining = msUntilExpiry(streak, now);
  return remaining > 0 && remaining < STREAK_EXPIRY_WARNING_MS;
}

/** Formats the human-readable "Xh Ym left" portion of the warning body. */
function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Builds the warning notification payload for one streak participant.
 */
export function buildStreakExpiryNotification(
  streak: StreakRecord,
  recipientUserId: string,
  now: number = Date.now(),
): NotificationPayload {
  const remaining = msUntilExpiry(streak, now);
  const otherUserId = recipientUserId === streak.userAId ? streak.userBId : streak.userAId;
  return {
    userId: recipientUserId,
    category: 'STREAKS',
    title: '🔥 Your streak is about to end!',
    body: `Only ${formatRemaining(remaining)} left to keep your ${streak.count}-day streak alive. Send a message!`,
    contentId: streak.conversationId ?? otherUserId,
    priority: 'normal',
    tag: `streak:${streak.id ?? `${streak.userAId}-${streak.userBId}`}`,
  };
}

/** Callback used to queue a notification for delivery. */
export type EnqueueNotification = (payload: NotificationPayload) => void | Promise<void>;

/**
 * Scans the provided streaks and queues an expiry warning for BOTH participants
 * of each streak that is within the warning window. Returns the number of
 * notifications queued.
 *
 * @param streaks  Streaks to evaluate (typically those with expiresAt soon).
 * @param enqueue  Callback that queues/sends a notification.
 * @param now      Injected clock for deterministic tests.
 */
export async function queueStreakExpiryWarnings(
  streaks: StreakRecord[],
  enqueue: EnqueueNotification,
  now: number = Date.now(),
): Promise<number> {
  let queued = 0;
  for (const streak of streaks) {
    if (!shouldWarnStreakExpiry(streak, now)) continue;
    for (const recipient of [streak.userAId, streak.userBId]) {
      await enqueue(buildStreakExpiryNotification(streak, recipient, now));
      queued += 1;
    }
  }
  return queued;
}
