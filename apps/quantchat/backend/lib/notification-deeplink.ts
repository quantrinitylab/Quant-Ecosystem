// ============================================================================
// QuantChat - Backend notification deep-link resolver (QC-F-142)
// ============================================================================
//
// The backend computes the deep link for every push it sends, in the SAME
// canonical map the client uses:
//
//   MESSAGES / STREAKS + id -> /chat/<id>   (the conversation itself)
//   MESSAGES / STREAKS no id -> /           (the chat list — there is no
//                                            /chat index route)
//   CALLS                    -> /calls      (the real call-history page)
//   STORIES                  -> /stories    (the page takes no URL id today)
//   REELS                    -> /reels      (the page takes no URL id today)
//   SYSTEM / unknown         -> /           (no /notifications page exists
//                                            yet — QC-F-101; when it lands,
//                                            SYSTEM moves there in one line)
//
// Every target above is a REAL route (classified 'app' by
// src/lib/route-access.ts). The previous map sent CALLS / SYSTEM / unknown
// to a non-existent '/notifications', STORIES / REELS with an id to
// non-existent '/stories/<id>' / '/reels/<id>', and MESSAGES / STREAKS
// without an id to a non-existent '/chat' — every one of those landed the
// user on a 404 (QC-F-142).
//
// This is deliberately a small COPY of src/lib/notification-deeplink.ts:
// the backend must not import the frontend src/ tree. The copy cannot drift
// silently — backend and frontend tests both run this exact map against the
// shared vectors in test-fixtures/notification-deeplink-vectors.json, and
// the frontend suite asserts every vector output is a real 'app' route.
// ============================================================================

/**
 * Resolves the in-app route for a notification. Mirrors `resolveDeepLink`
 * in src/lib/notification-deeplink.ts and the copy embedded in public/sw.js.
 *
 * @param category  Notification category (case-insensitive).
 * @param contentId The content the notification refers to (conversation id
 *                  for MESSAGES / STREAKS). Ignored by CALLS / STORIES /
 *                  REELS / SYSTEM, whose target screens take no URL id.
 * @returns An absolute in-app route path beginning with '/'.
 */
export function resolveNotificationDeepLink(
  category: string,
  contentId?: string | null,
): string {
  const id = (contentId ?? '').trim();

  switch (String(category ?? '').toUpperCase()) {
    case 'MESSAGES':
      return id ? `/chat/${id}` : '/';
    case 'STREAKS':
      // A streak notification refers to the friend's conversation.
      return id ? `/chat/${id}` : '/';
    case 'CALLS':
      // The real call-history page; it takes no call id in the URL today.
      return '/calls';
    case 'STORIES':
      // The stories page does not read a story id from the URL, so the id
      // cannot be honoured — land on the real page instead of a dead one.
      return '/stories';
    case 'REELS':
      // Same as STORIES: the reels page takes no URL id today.
      return '/reels';
    case 'SYSTEM':
    default:
      // No notification-centre page exists yet (QC-F-101); the chat list
      // is the honest home until it does.
      return '/';
  }
}

export default resolveNotificationDeepLink;
