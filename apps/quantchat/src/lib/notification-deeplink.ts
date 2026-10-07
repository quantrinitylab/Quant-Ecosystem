// ============================================================================
// QuantChat - Notification Deep-Link Resolution (Task 10.5)
//
// Maps a notification (category + content id) to the in-app route the user
// should land on when they tap a push notification.
//
//   MESSAGES -> /chat/{id}
//   CALLS    -> /call
//   STORIES  -> /stories/{id}
//   REELS    -> /reels/{id}
//   STREAKS  -> /chat/{id}    (a streak always relates to a conversation)
//   SYSTEM   -> /notifications
//
// This mirrors the resolveDeepLink() logic embedded in public/sw.js (which
// cannot import TypeScript modules) so client navigation and service-worker
// navigation stay in lock-step.
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
 * Categories that target a specific piece of content (messages, stories,
 * reels, streaks) include the `contentId` in the path. Categories that target
 * a singleton screen (calls, system) ignore `contentId`.
 *
 * @param category  The notification category.
 * @param contentId The id of the content the notification refers to (chat id,
 *                   story id, reel id, ...). Optional for CALLS / SYSTEM.
 * @returns An absolute in-app route path beginning with '/'.
 */
export function resolveDeepLink(
  category: NotificationCategory | string,
  contentId?: string | null,
): string {
  const id = (contentId ?? '').trim();

  switch (String(category).toUpperCase()) {
    case 'MESSAGES':
      return id ? `/chat/${id}` : '/chat';
    case 'CALLS':
      return '/call';
    case 'STORIES':
      return id ? `/stories/${id}` : '/stories';
    case 'REELS':
      return id ? `/reels/${id}` : '/reels';
    case 'STREAKS':
      // A streak notification deep-links to the friend's conversation.
      return id ? `/chat/${id}` : '/chat';
    case 'SYSTEM':
      return '/notifications';
    default:
      // Unknown categories fall back to the notification center.
      return '/notifications';
  }
}

export default resolveDeepLink;
