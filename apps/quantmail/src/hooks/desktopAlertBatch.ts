// ============================================================================
// QuantMail — desktop alert batching rule (split out of
// useNewMailDesktopAlerts so it is unit-testable without rendering the hook:
// quantmail has no @testing-library/react dependency).
//
// The watcher polls GET /api/notifications (newest-first) every 30s. An
// earlier version inspected only data[0] and advanced a single newest-pointer
// past the whole batch, so three emails landing in one poll window produced
// one alert and silently dropped the other two — while the tab-closed push
// path (inbound webhook → deliverPushToUser per email) fires per email.
// This module is the per-batch rule that closes that gap: every row that
// appears in a batch and was never polled before gets its own alert.
// ============================================================================

import type { AppNotification } from './useNotifications';

// Cap on the seen-ids set: the watch only ever needs recent ids (one batch
// per 30s poll, WATCH_LIMIT rows each), so anything older is pruned rather
// than growing the set for the whole session.
export const SEEN_IDS_CAP = 100;

/**
 * The batch items this session has never polled before, OLDEST FIRST.
 *
 * The feed is newest-first, so the unseen items are collected in batch order
 * and then reversed: firing oldest-first matches the per-email push path's
 * arrival order, so the newest alert is the one left on top.
 *
 * NOTE on the WATCH_LIMIT edge: more than WATCH_LIMIT arrivals in one poll
 * window still cannot surface here — the feed only ever returns the newest
 * WATCH_LIMIT rows, so rows pushed below that window never appear in any
 * later batch either. That is a feed-window limit, not a batching drop: every
 * row that DOES appear in a batch now gets its own alert.
 */
export function unseenNotifications(
  batch: AppNotification[],
  seenIds: ReadonlySet<string>,
): AppNotification[] {
  const fresh: AppNotification[] = [];
  for (const notification of batch) {
    if (!seenIds.has(notification.id)) fresh.push(notification);
  }
  return fresh.reverse();
}

/** Adds a whole polled batch to the seen set, pruning the oldest ids past the cap. */
export function recordBatchSeen(seenIds: Set<string>, batch: AppNotification[]): void {
  for (const notification of batch) seenIds.add(notification.id);
  while (seenIds.size > SEEN_IDS_CAP) {
    const oldest = seenIds.values().next().value;
    if (oldest === undefined) break;
    seenIds.delete(oldest);
  }
}
