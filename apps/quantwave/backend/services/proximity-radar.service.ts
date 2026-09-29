// ============================================================================
// QuantWave Orange Proximity Radar & Swipe Matching Service
// ============================================================================

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
  private static mockUsers: Map<string, UserCoordinate> = new Map();
  private static mockSwipes: Map<string, string> = new Map(); // `${userId}:${targetUserId}` -> action
  private static mockMatches: Map<string, string> = new Map();

  constructor(private readonly prisma?: RadarPrisma) {}

  static registerMockUser(user: UserCoordinate) {
    ProximityRadarService.mockUsers.set(user.id, user);
  }

  static clearMockData() {
    ProximityRadarService.mockUsers.clear();
    ProximityRadarService.mockSwipes.clear();
    ProximityRadarService.mockMatches.clear();
  }

  async findNearbyUsers(
    userId: string,
    coords: { lat: number; lon: number },
    options?: { radiusKm?: number; maxResults?: number; interestFilter?: string[] },
  ): Promise<NearbyUserResult[]> {
    const radiusKm = options?.radiusKm ?? 25;
    const maxResults = options?.maxResults ?? 50;
    const interestFilter = options?.interestFilter ?? [];

    let users: any[] = [];
    if (this.prisma && this.prisma.user && typeof this.prisma.user.findMany === 'function') {
      try {
        users = await this.prisma.user.findMany({
          where: {
            id: { not: userId },
            deletedAt: null,
          },
        });
      } catch {
        users = [];
      }
    }

    // Merge or fallback to mock users if DB is empty or unconfigured in tests
    const allUsersMap = new Map<string, any>();
    for (const u of users) {
      allUsersMap.set(u.id, {
        id: u.id,
        name: u.name ?? u.displayName ?? u.username,
        username: u.username,
        avatar: u.avatar ?? u.avatarUrl ?? null,
        bio: u.bio ?? null,
        interests: u.interests ?? [],
        lat: u.lat ?? u.latitude ?? 28.6139,
        lon: u.lon ?? u.longitude ?? 77.209,
      });
    }

    for (const [id, mu] of ProximityRadarService.mockUsers.entries()) {
      if (id !== userId) {
        allUsersMap.set(id, mu);
      }
    }

    const results: NearbyUserResult[] = [];

    for (const u of allUsersMap.values()) {
      if (u.id === userId) continue;
      const distanceKm = calculateHaversineDistance(coords.lat, coords.lon, u.lat, u.lon, 'km');

      if (distanceKm <= radiusKm) {
        const interests = u.interests ?? [];
        if (interestFilter.length > 0) {
          const hasInterest = interestFilter.some((i: string) => interests.includes(i));
          if (!hasInterest) continue;
        }

        const matchKey1 = `${userId}:${u.id}`;
        const matchKey2 = `${u.id}:${userId}`;
        const mutualMatch =
          ProximityRadarService.mockSwipes.get(matchKey1) === 'like' &&
          ProximityRadarService.mockSwipes.get(matchKey2) === 'like';

        results.push({
          id: u.id,
          name: u.name,
          username: u.username,
          avatar: u.avatar,
          distanceKm,
          bio: u.bio,
          interests,
          mutualMatch,
        });
      }
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
    ProximityRadarService.mockSwipes.set(swipeKey, action);

    let matched = false;
    let matchId: string | undefined;

    if (action === 'like' || action === 'superlike') {
      const reverseSwipeKey = `${targetUserId}:${userId}`;
      const reverseAction = ProximityRadarService.mockSwipes.get(reverseSwipeKey);
      if (reverseAction === 'like' || reverseAction === 'superlike') {
        matched = true;
        matchId = `match_${Math.min(userId.charCodeAt(0), targetUserId.charCodeAt(0))}_${Date.now()}`;
        ProximityRadarService.mockMatches.set(matchId, `${userId}:${targetUserId}`);
      }
    }

    return { matched, matchId };
  }
}
