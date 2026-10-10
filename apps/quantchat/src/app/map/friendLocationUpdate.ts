// ============================================================================
// Pure friend-location update logic for the map page (Task 8.2 / 8.4).
//
// Extracted from page.tsx so the update semantics can be unit-tested without
// rendering the map: an existing friend's position/online state is refreshed
// in place (the movement animation is handled by FriendPin's CSS transition);
// a new friend is appended.
// ============================================================================

import type { FriendLocation } from '../../components/map';

/** One friend-location update as carried by a `friend-location-update` frame. */
export interface FriendLocationUpdate {
  userId: string;
  username: string;
  avatarUrl: string;
  position: [number, number];
  isOnline: boolean;
}

/** Apply one friend-location update to the friend list. */
export function applyFriendLocationUpdate(
  friends: FriendLocation[],
  update: FriendLocationUpdate,
): FriendLocation[] {
  const idx = friends.findIndex((f) => f.userId === update.userId);
  if (idx >= 0) {
    const updated = [...friends];
    updated[idx] = {
      ...updated[idx],
      position: update.position,
      lastUpdated: new Date(),
      isOnline: update.isOnline,
    };
    return updated;
  }
  return [
    ...friends,
    {
      userId: update.userId,
      username: update.username,
      avatarUrl: update.avatarUrl,
      position: update.position,
      lastUpdated: new Date(),
      isOnline: update.isOnline,
    },
  ];
}
