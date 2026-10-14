// ============================================================================
// Pure friend-search logic for the map page (QC-F-331 Slice 1).
//
// Extracted from page.tsx so the search semantics can be unit-tested without
// rendering the map — the same pure-helper pattern as friendLocationUpdate.ts
// and locationBroadcast.ts. The search corpus is ONLY the friends list the
// page already loaded from the real backend (GET /api/map/friends — close
// friends who are sharing their location, privacy gates already applied
// server-side). Nothing is fetched here and no result is ever invented: a
// friend who is not in the list cannot appear in the results.
// ============================================================================

import type { FriendLocation } from '../../components/map';

/** Ek friend par khoj — sirf woh fields jo backend asal me deta hai. */
export function friendMatchesQuery(friend: FriendLocation, normalizedQuery: string): boolean {
  if (normalizedQuery === '') return true;
  const username = friend.username.toLowerCase();
  if (username.includes(normalizedQuery)) return true;
  const displayName = friend.displayName?.toLowerCase();
  return displayName !== undefined && displayName !== '' && displayName.includes(normalizedQuery);
}

/**
 * Friends-on-map search (QC-F-331 Slice 1): maujood asal friends list par
 * naam-filter. Query sirf username/displayName par lagti hai — userId ya
 * coordinates par NAHI. Khaali query par poori list, backend ki order me,
 * input array mutate kiye bina. Koi result kabhi invent NAHI hota: jo list
 * me NAHI hai woh result me NAHI aa sakta.
 */
export function filterFriendsOnMap(
  friends: readonly FriendLocation[],
  rawQuery: string,
): FriendLocation[] {
  const q = rawQuery.trim().toLowerCase();
  if (q === '') return [...friends];
  return friends.filter((f) => friendMatchesQuery(f, q));
}
