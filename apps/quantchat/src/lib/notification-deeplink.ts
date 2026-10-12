// ============================================================================
// QuantChat - Notification Deep-Link Resolution (Task 10.5)
//
// Maps a notification (category + content id) to the in-app route the user
// should land on when they tap a push notification.
//
//   MESSAGES -> /chat/{id}    (no id -> / , the chat list; there is no
//              /chat index route)
//   CALLS    -> /calls        (the real call-history page; it takes no
//              call id in the URL today)
//   STORIES  -> /stories      (the page reads no story id from the URL,
//              so an id cannot be honoured — land on the real page)
//   REELS    -> /reels        (same: the page reads no reel id from the URL)
//   STREAKS  -> /chat/{id}    (a streak always relates to a conversation;
//              no id -> /)
//   SYSTEM   -> /             (no /notifications page exists yet — QC-F-101;
//              unknown     when it lands, SYSTEM moves there in one line)
//
// QC-F-142: the previous map sent CALLS / SYSTEM / unknown to a
// non-existent '/notifications', STORIES / REELS with an id to
// non-existent '/stories/<id>' / '/reels/<id>', and MESSAGES / STREAKS
// without an id to a non-existent '/chat' — every one landed on a 404.
// Every target above is a real route (classified 'app' by
// src/lib/route-access.ts); the test suite asserts exactly that.
//
// This mirrors the resolveDeepLink() logic embedded in public/sw.js (which
// cannot import TypeScript modules) so client navigation and service-worker
// navigation stay in lock-step. The copies cannot drift silently: the
// shared vectors in test-fixtures/notification-deeplink-vectors.json run
// against this resolver, the sw.js copy, and the backend copy.
//
// Validates: Requirements 9.7 (Property 22 - deep-link resolution)
// ============================================================================

/** The six supported push-notification categories (mirrors NotificationCategory). */
export type NotificationCategory =
  | 'MESSAGES'
  | 'CALLS'
  | 'STORIES'
  | 'STREAKS'
  | 'REELS'
  | 'SYSTEM';

/** All categories, exported for iteration in settings UIs and tests. */
export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'MESSAGES',
  'CALLS',
  'STORIES',
  'STREAKS',
  'REELS',
  'SYSTEM',
] as const;

/**
 * Resolves the in-app route for a tapped notification.
 *
 * Only MESSAGES / STREAKS put the `contentId` in the path (the
 * conversation route). STORIES / REELS / CALLS target screens that take no
 * id in the URL today, and SYSTEM / unknown land on the chat list — every
 * branch returns a route that actually exists.
 *
 * @param category  The notification category.
 * @param contentId The id of the content the notification refers to (chat id
 *                   for MESSAGES / STREAKS). Ignored by the other categories.
 * @returns An absolute in-app route path beginning with '/'.
 */
export function resolveDeepLink(
  category: NotificationCategory | string,
  contentId?: string | null,
): string {
  const id = (contentId ?? '').trim();

  switch (String(category).toUpperCase()) {
    case 'MESSAGES':
      return id ? `/chat/${id}` : '/';
    case 'CALLS':
      // The real call-history page exists; it takes no call id in the URL.
      return '/calls';
    case 'STORIES':
      return '/stories';
    case 'REELS':
      return '/reels';
    case 'STREAKS':
      // A streak notification deep-links to the friend's conversation.
      return id ? `/chat/${id}` : '/';
    case 'SYSTEM':
      return '/';
    default:
      // Unknown categories fall back to the chat list — a real route,
      // never a page that does not exist.
      return '/';
  }
}

export default resolveDeepLink;
