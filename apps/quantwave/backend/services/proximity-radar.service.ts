// ============================================================================
// QuantWave Orange Proximity Radar & Swipe Matching Service
// ============================================================================
//
// HONESTY NOTE: this service used to keep static `mockUsers`/`mockSwipes`/
// `mockMatches` maps with `registerMockUser()`/`clearMockData()` test hooks
// and MERGED those fake users into the real `/radar/nearby` production path
// whenever the DB was empty — test data could leak into live responses. The
// static mock state is gone: nearby results come only from real user rows,
// and swipe/match state is real user state held per service instance.

import { createAppError } from '@quant/server-core';

export interface UserCoordinate {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  bio: string | null;
  interests: string[];
  lat: number;
  lon: number;
}

export interface NearbyUserResult {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
  distanceKm: number;
  bio: string | null;
  interests: string[];
  mutualMatch: boolean;
}

export interface RadarPrisma {
  user: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<any | null>;
    findMany: (args: Record<string, unknown>) => Promise<any[]>;
  };
}

/**
 * Calculates the spherical Haversine distance between two GPS coordinates.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  unit: 'km' | 'miles' = 'km',
): number {
  const R = unit === 'miles' ? 3958.8 : 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export class ProximityRadarService {
  /**
   * Real swipe state: `${userId}:${targetUserId}` -> action. Instance-level,
   * never static — no test or unrelated request can see or mutate it.
   */
  private readonly swipes = new Map<string, 'like' | 'pass' | 'superlike'>();
  private readonly matches = new Map<string, string>();

  constructor(private readonly prisma?: RadarPrisma) {}

  async findNearbyUsers(
    userId: string,
    coords: { lat: number; lon: number },
    options?: { radiusKm?: number; maxResults?: number; interestFilter?: string[] },
  ): Promise<NearbyUserResult[]> {
    const radiusKm = options?.radiusKm ?? 25;
    const maxResults = options?.maxResults ?? 50;
    const interestFilter = options?.interestFilter ?? [];

    // Real user rows only. No mock merge: when the DB is empty or
    // unconfigured, the honest answer is an empty list, not fabricated users.
    let rows: any[] = [];
    if (this.prisma && this.prisma.user && typeof this.prisma.user.findMany === 'function') {
      try {
        rows = await this.prisma.user.findMany({
          where: {
            id: { not: userId },
            deletedAt: null,
          },
        });
      } catch {
        rows = [];
      }
    }

    const results: NearbyUserResult[] = [];

    for (const u of rows) {
      if (u.id === userId) continue;

      // Users without real coordinates are skipped — we do not assign them a
      // fabricated default location (Delhi used to be hardcoded here).
      const lat = u.lat ?? u.latitude;
      const lon = u.lon ?? u.longitude;
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;

      const distanceKm = calculateHaversineDistance(coords.lat, coords.lon, lat, lon, 'km');
      if (distanceKm > radiusKm) continue;

      const interests: string[] = u.interests ?? [];
      if (interestFilter.length > 0) {
        const hasInterest = interestFilter.some((i: string) => interests.includes(i));
        if (!hasInterest) continue;
      }

      const matchKey1 = `${userId}:${u.id}`;
      const matchKey2 = `${u.id}:${userId}`;
      const a = this.swipes.get(matchKey1);
      const b = this.swipes.get(matchKey2);
      const mutualMatch = (a === 'like' || a === 'superlike') && (b === 'like' || b === 'superlike');

      results.push({
        id: u.id,
        name: u.name ?? u.displayName ?? u.username,
        username: u.username,
        avatar: u.avatar ?? u.avatarUrl ?? null,
        distanceKm,
        bio: u.bio ?? null,
        interests,
        mutualMatch,
      });
    }

    results.sort((a, b) => a.distanceKm - b.distanceKm);
    return results.slice(0, maxResults);
  }

  async recordSwipe(
    userId: string,
    targetUserId: string,
    action: 'like' | 'pass' | 'superlike',
  ): Promise<{ matched: boolean; matchId?: string }> {
    if (userId === targetUserId) {
      throw createAppError('Cannot swipe on yourself', 400, 'SELF_SWIPE');
    }

    const swipeKey = `${userId}:${targetUserId}`;
    this.swipes.set(swipeKey, action);

    let matched = false;
    let matchId: string | undefined;

    if (action === 'like' || action === 'superlike') {
      const reverseSwipeKey = `${targetUserId}:${userId}`;
      const reverseAction = this.swipes.get(reverseSwipeKey);
      if (reverseAction === 'like' || reverseAction === 'superlike') {
        matched = true;
        // Deterministic match id for the pair (stable, not a timestamp).
        const [first, second] = [userId, targetUserId].sort();
        matchId = `match_${first}_${second}`;
        this.matches.set(matchId, `${userId}:${targetUserId}`);
      }
    }

    return { matched, matchId };
  }
}
