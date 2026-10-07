// ============================================================================
// Unit Tests: Orange Proximity Radar & Swipe Matching Deck
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistance,
  ProximityRadarService,
  type RadarPrisma,
} from '../services/proximity-radar.service';

// Real-shaped user rows from a stubbed "database" — the service under test
// reads these like production rows; there is no mock-user injection path
// anymore (registerMockUser/clearMockData were removed with the leak).
function stubPrisma(rows: Array<Record<string, unknown>>): RadarPrisma {
  return {
    user: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) =>
        rows.find((r) => r.id === (where as { id: string }).id) ?? null,
      findMany: async () => rows,
    },
  };
}

const USER_ROWS = [
  {
    id: 'user_close',
    name: 'Close User',
    username: 'close_guy',
    avatar: null,
    bio: 'Nearby buddy',
    interests: ['tech'],
    lat: 28.65, // ~4 km from center
    lon: 77.22,
  },
  {
    id: 'user_far',
    name: 'Far User',
    username: 'far_guy',
    avatar: null,
    bio: 'Far away',
    interests: ['travel'],
    lat: 32.0, // ~400+ km away
    lon: 75.0,
  },
  {
    id: 'user_no_location',
    name: 'No Location User',
    username: 'no_loc',
    avatar: null,
    bio: 'No coords',
    interests: ['tech'],
    lat: null,
    lon: null,
  },
];

describe('Orange Proximity Radar & Swipe Matching Suite', () => {
  describe('Haversine Distance Calculation', () => {
    it('calculates accurate distance between New York and London', () => {
      // New York: 40.7128° N, 74.0060° W (-74.0060)
      // London: 51.5074° N, 0.1278° W (-0.1278)
      const nyLat = 40.7128;
      const nyLon = -74.006;
      const lonLat = 51.5074;
      const lonLon = -0.1278;

      const distKm = calculateHaversineDistance(nyLat, nyLon, lonLat, lonLon, 'km');
      // Expected distance is approx 5570 km
      expect(distKm).toBeGreaterThan(5500);
      expect(distKm).toBeLessThan(5650);

      const distMiles = calculateHaversineDistance(nyLat, nyLon, lonLat, lonLon, 'miles');
      expect(distMiles).toBeGreaterThan(3400);
      expect(distMiles).toBeLessThan(3550);
    });

    it('calculates accurate distance between Delhi and Mumbai', () => {
      // Delhi: 28.6139° N, 77.2090° E
      // Mumbai: 18.9750° N, 72.8258° E
      const delhiLat = 28.6139;
      const delhiLon = 77.209;
      const mumbaiLat = 18.975;
      const mumbaiLon = 72.8258;

      const distKm = calculateHaversineDistance(delhiLat, delhiLon, mumbaiLat, mumbaiLon, 'km');
      // Expected distance is approx 1140-1160 km
      expect(distKm).toBeGreaterThan(1130);
      expect(distKm).toBeLessThan(1170);
    });

    it('returns zero for identical coordinates', () => {
      const dist = calculateHaversineDistance(28.6139, 77.209, 28.6139, 77.209, 'km');
      expect(dist).toBe(0);
    });
  });

  describe('Proximity Radar Find Nearby Users', () => {
    it('filters users within radius boundaries correctly', async () => {
      const service = new ProximityRadarService(stubPrisma(USER_ROWS));

      // Search with default 25km radius
      const nearbyDefault = await service.findNearbyUsers(
        'user_center',
        { lat: 28.6139, lon: 77.209 },
        { radiusKm: 25 },
      );
      expect(nearbyDefault.length).toBe(1);
      expect(nearbyDefault[0].id).toBe('user_close');
      expect(nearbyDefault[0].distanceKm).toBeLessThan(25);

      // Search with 500km radius
      const nearbyWide = await service.findNearbyUsers(
        'user_center',
        { lat: 28.6139, lon: 77.209 },
        { radiusKm: 500 },
      );
      expect(nearbyWide.length).toBe(2);
      expect(nearbyWide.map((u) => u.id)).toContain('user_far');
    });

    it('excludes users without real coordinates instead of fabricating a location', async () => {
      const service = new ProximityRadarService(stubPrisma(USER_ROWS));

      const nearby = await service.findNearbyUsers(
        'user_center',
        { lat: 28.6139, lon: 77.209 },
        { radiusKm: 500 },
      );
      expect(nearby.map((u) => u.id)).not.toContain('user_no_location');
    });

    it('returns an empty list — not fabricated users — when the DB is unconfigured', async () => {
      const service = new ProximityRadarService();

      const nearby = await service.findNearbyUsers(
        'user_center',
        { lat: 28.6139, lon: 77.209 },
        { radiusKm: 500 },
      );
      expect(nearby).toEqual([]);
    });
  });

  describe('Swipe Matching & Mutual Detection', () => {
    it('detects mutual match when both users swipe like', async () => {
      const service = new ProximityRadarService(stubPrisma(USER_ROWS));

      // User A likes User B
      const swipe1 = await service.recordSwipe('user_a', 'user_b', 'like');
      expect(swipe1.matched).toBe(false);
      expect(swipe1.matchId).toBeUndefined();

      // User B likes User A -> Mutual match!
      const swipe2 = await service.recordSwipe('user_b', 'user_a', 'like');
      expect(swipe2.matched).toBe(true);
      expect(swipe2.matchId).toBeDefined();
    });

    it('does not match on pass or one-way like', async () => {
      const service = new ProximityRadarService(stubPrisma(USER_ROWS));

      const swipe1 = await service.recordSwipe('user_c', 'user_d', 'like');
      expect(swipe1.matched).toBe(false);

      const swipe2 = await service.recordSwipe('user_d', 'user_c', 'pass');
      expect(swipe2.matched).toBe(false);
    });

    it('reflects mutual matches in nearby results', async () => {
      const service = new ProximityRadarService(stubPrisma(USER_ROWS));

      await service.recordSwipe('user_center', 'user_close', 'like');
      await service.recordSwipe('user_close', 'user_center', 'like');

      const nearby = await service.findNearbyUsers(
        'user_center',
        { lat: 28.6139, lon: 77.209 },
        { radiusKm: 25 },
      );
      expect(nearby[0].mutualMatch).toBe(true);
    });
  });
});
