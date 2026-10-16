// ============================================================================
// QuantChat - Location Service (Snap Map friend-location sharing)
//
// Wires the previously-unused Prisma `FriendLocation` model into a real
// "Snap Map" feature:
//   - updateLocation()    upsert the caller's current location (opt-in sharing)
//   - clearLocation()     stop sharing (idempotent delete of the caller's row)
//   - getFriendsOnMap()   the locations of the caller's CLOSE FRIENDS who are
//                         currently sharing, shaped for the map view
//
// PRIVACY CONTRACT: getFriendsOnMap only ever returns rows for users the caller
// has added as a CLOSE FRIEND (`CloseFriend` where userId = caller), and only
// those friends who currently have a `FriendLocation` row (actively sharing).
// Users who are not the caller's close friends are never exposed, and a close
// friend who has stopped sharing (no row) is silently omitted. QC-F-042 adds
// the owner-side half: an owner whose `whoCanSeeLocation` pref is 'nobody'
// or 'ghost' is omitted even for their close friends. QC-F-437 adds the
// time half: a row only counts as "currently sharing" while it is fresh —
// see `FRIEND_LOCATION_MAX_AGE_MS` below; a stale row is omitted even for
// close friends, so a once-published location cannot leak forever.
//
// The service is decoupled from the generated Prisma client types via the
// `LocationPrismaClient` structural interface — mirroring the casting pattern
// used elsewhere in this backend (see `memory.service.ts`) — so it type-checks
// regardless of whether `prisma generate` has been run for these delegates.
// ============================================================================
import { createAppError } from '@quant/server-core';
import { extractPrivacyPrefs } from './privacy.service';

/** Latitude/longitude bounds for WGS84 coordinates. */
export const LATITUDE_MIN = -90;
export const LATITUDE_MAX = 90;
export const LONGITUDE_MIN = -180;
export const LONGITUDE_MAX = 180;

/**
 * QC-F-437: how long a published location stays visible on friends' maps
 * after its last refresh — 8 hours, matching Snapchat's rule (a pin
 * disappears 8 hours after the owner last opened/shared). `updatedAt` is
 * Prisma-maintained (`@updatedAt`) and clients cannot supply it
 * (`updateLocationSchema` accepts only latitude/longitude), so this window
 * cannot be forged fresh. Rows older than this still exist in the DB (the
 * periodic cleanup / `expiresAt` migration is a separate slice) — they are
 * simply never returned by `getFriendsOnMap`.
 */
export const FRIEND_LOCATION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

/** A persisted `FriendLocation` row. */
export interface FriendLocationRecord {
  id: string;
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt: Date;
}

/** A `CloseFriend` edge row (userId considers friendId a close friend). */
export interface CloseFriendRecord {
  id: string;
  userId: string;
  friendId: string;
  createdAt: Date;
}

/** Public-safe slice of a `User` used to shape map entries. */
export interface MapUserRecord {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /**
   * QC-F-042: the owner's raw preferences, carried only so the owner's own
   * `whoCanSeeLocation` pref can be enforced in getFriendsOnMap. It is
   * never copied into the returned FriendOnMap shape.
   */
  preferences?: unknown;
}

/** Coordinates supplied by the caller when publishing a location. */
export interface LocationInput {
  latitude: number;
  longitude: number;
}

/** A close friend's location shaped for the Snap Map view. */
export interface FriendOnMap {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  latitude: number;
  longitude: number;
  updatedAt: Date;
}

/**
 * Minimal structural surface of the Prisma client this service relies on.
 * Keeps the service unit-testable (a plain mock satisfies it) and decoupled
 * from the generated delegate types.
 */
export interface LocationPrismaClient {
  friendLocation: {
    upsert(args: unknown): Promise<FriendLocationRecord>;
    deleteMany(args: unknown): Promise<{ count: number }>;
    findMany(args: unknown): Promise<FriendLocationRecord[]>;
  };
  closeFriend: {
    findMany(args: unknown): Promise<CloseFriendRecord[]>;
  };
  user: {
    findMany(args: unknown): Promise<MapUserRecord[]>;
  };
}

/**
 * Validate that coordinates fall within valid WGS84 bounds. Throws a 400
 * `createAppError` when latitude/longitude are out of range or not finite.
 * Pure and exported for unit testing.
 */
export function assertValidCoordinates(input: LocationInput): void {
  const { latitude, longitude } = input;
  if (!Number.isFinite(latitude) || latitude < LATITUDE_MIN || latitude > LATITUDE_MAX) {
    throw createAppError(
      `latitude must be a number between ${LATITUDE_MIN} and ${LATITUDE_MAX}`,
      400,
      'INVALID_LATITUDE',
    );
  }
  if (!Number.isFinite(longitude) || longitude < LONGITUDE_MIN || longitude > LONGITUDE_MAX) {
    throw createAppError(
      `longitude must be a number between ${LONGITUDE_MIN} and ${LONGITUDE_MAX}`,
      400,
      'INVALID_LONGITUDE',
    );
  }
}

export class LocationService {
  constructor(private readonly prisma: LocationPrismaClient) {}

  /**
   * Publish (or refresh) the caller's current location. Validates the
   * coordinates then upserts the caller's single `FriendLocation` row keyed by
   * the unique `userId`. `updatedAt` is maintained by Prisma's `@updatedAt`.
   */
  async updateLocation(userId: string, input: LocationInput): Promise<FriendLocationRecord> {
    assertValidCoordinates(input);
    return this.prisma.friendLocation.upsert({
      where: { userId },
      create: {
        userId,
        latitude: input.latitude,
        longitude: input.longitude,
      },
      update: {
        latitude: input.latitude,
        longitude: input.longitude,
      },
    });
  }

  /**
   * Stop sharing: delete the caller's location row. Idempotent — a no-op when
   * the caller has no row (uses `deleteMany` so a missing row never throws).
   * Returns whether a row was actually removed.
   */
  async clearLocation(userId: string): Promise<{ cleared: boolean }> {
    const result = await this.prisma.friendLocation.deleteMany({ where: { userId } });
    return { cleared: result.count > 0 };
  }

  /**
   * Return the locations of the caller's CLOSE FRIENDS who are currently
   * sharing (updated within the last 8 hours — see
   * `FRIEND_LOCATION_MAX_AGE_MS`), shaped for the map. Privacy invariants:
   *   - only `CloseFriend` edges where `userId` = caller are considered;
   *   - only friends with a live `FriendLocation` row are included;
   *   - only rows fresh within the staleness window are included (QC-F-437);
   *   - non-close-friends are never returned.
   * Results are ordered most-recently-updated first.
   */
  async getFriendsOnMap(userId: string): Promise<FriendOnMap[]> {
    // 1. The caller's close-friend edges → the set of friend ids.
    const edges = await this.prisma.closeFriend.findMany({
      where: { userId },
      select: { friendId: true },
    });
    const friendIds = edges.map((e) => e.friendId);
    if (friendIds.length === 0) {
      return [];
    }

    // 2. Of those friends, the ones actively sharing a location.
    const locations = await this.prisma.friendLocation.findMany({
      where: { userId: { in: friendIds } },
      orderBy: { updatedAt: 'desc' },
    });
    // QC-F-437: staleness window — a row counts as "currently sharing" only
    // while it is fresh. Filtering here (service-side, before any profile
    // fetch) means every present and future reader of this method is bound
    // by the same window, and a stale friend's profile is never even read.
    const cutoff = new Date(Date.now() - FRIEND_LOCATION_MAX_AGE_MS);
    const freshLocations = locations.filter((loc) => loc.updatedAt.getTime() >= cutoff.getTime());
    if (freshLocations.length === 0) {
      return [];
    }

    // 3. Shape with the friend's public profile fields.
    const sharingIds = freshLocations.map((loc) => loc.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: sharingIds } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        preferences: true,
      },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const onMap: FriendOnMap[] = [];
    for (const loc of freshLocations) {
      const profile = userById.get(loc.userId);
      // A location whose user record is missing (e.g. mid-deletion) is skipped
      // rather than exposed with placeholder identity.
      if (!profile) continue;
      // QC-F-042: the OWNER's own whoCanSeeLocation pref is the second gate.
      // The viewer-side close-friend rule above decides whose locations the
      // caller may ask for; this decides whether the owner agreed to be
      // seen at all. 'nobody' and 'ghost' both hide the owner (the row
      // stays — publishing and being seen are different acts); 'friends'
      // (the default) keeps the existing close-friend behaviour. Malformed
      // prefs resolve most-restrictive ('nobody') via extractPrivacyPrefs,
      // so a broken row hides the owner instead of crashing or leaking.
      if (extractPrivacyPrefs(profile.preferences).prefs.whoCanSeeLocation !== 'friends') {
        continue;
      }
      onMap.push({
        userId: loc.userId,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl ?? null,
        latitude: loc.latitude,
        longitude: loc.longitude,
        updatedAt: loc.updatedAt,
      });
    }
    return onMap;
  }
}
