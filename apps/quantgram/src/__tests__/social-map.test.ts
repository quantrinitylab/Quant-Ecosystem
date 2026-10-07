import { describe, it, expect } from 'vitest';
import {
  haversineDistanceKm,
  computeStoryClusters,
  filterPinsByPrivacy,
  updatePrivacyShield,
  findPinsNearLocation,
  DEFAULT_PRIVACY_SHIELD,
  type StoryLocationPin,
  type PrivacyShieldSettings,
} from '../features/map/social-map';

describe('Geospatial Social Map Engine (W39-G07)', () => {
  const mockPins: StoryLocationPin[] = [
    {
      id: 'pin-1',
      storyId: 'story-101',
      userId: 'user-alice',
      username: 'alice',
      displayName: 'Alice M.',
      avatarUrl: 'https://cdn.quantneon.in/avatars/alice.jpg',
      mediaThumbnail: 'https://cdn.quantneon.in/stories/delhi-gate.jpg',
      caption: 'Evening at India Gate #Delhi',
      lat: 28.6129,
      lng: 77.2295,
      cityName: 'New Delhi',
      landmarkName: 'India Gate',
      postedAt: 1727180000000,
    },
    {
      id: 'pin-2',
      storyId: 'story-102',
      userId: 'user-bob',
      username: 'bob',
      displayName: 'Bob K.',
      avatarUrl: 'https://cdn.quantneon.in/avatars/bob.jpg',
      mediaThumbnail: 'https://cdn.quantneon.in/stories/cp-market.jpg',
      caption: 'Coffee in CP',
      lat: 28.6304,
      lng: 77.2177,
      cityName: 'New Delhi',
      landmarkName: 'Connaught Place',
      postedAt: 1727185000000, // Newer
    },
    {
      id: 'pin-3',
      storyId: 'story-103',
      userId: 'user-charlie',
      username: 'charlie',
      displayName: 'Charlie D.',
      avatarUrl: 'https://cdn.quantneon.in/avatars/charlie.jpg',
      mediaThumbnail: 'https://cdn.quantneon.in/stories/marine-drive.jpg',
      caption: 'Sunset at Marine Drive #Mumbai',
      lat: 18.944,
      lng: 72.8238,
      cityName: 'Mumbai',
      landmarkName: 'Marine Drive',
      postedAt: 1727170000000,
    },
  ];

  describe('haversineDistanceKm', () => {
    it('returns 0 for identical coordinates', () => {
      const dist = haversineDistanceKm(28.6129, 77.2295, 28.6129, 77.2295);
      expect(dist).toBe(0);
    });

    it('calculates approximately correct distance between Delhi and Mumbai (~1150 km)', () => {
      const dist = haversineDistanceKm(28.6129, 77.2295, 18.944, 72.8238);
      expect(dist).toBeGreaterThan(1100);
      expect(dist).toBeLessThan(1200);
    });
  });

  describe('computeStoryClusters', () => {
    it('returns empty array when given no pins', () => {
      expect(computeStoryClusters([], 5)).toEqual([]);
    });

    it('clusters nearby pins in the same city bucket at lower zoom levels', () => {
      const clusters = computeStoryClusters(mockPins, 3);
      expect(clusters.length).toBeGreaterThanOrEqual(1);

      const delhiCluster = clusters.find((c) => c.cityName === 'New Delhi');
      expect(delhiCluster).toBeDefined();
      expect(delhiCluster?.count).toBe(2);
      // Newest pin should be representative
      expect(delhiCluster?.representativePin.id).toBe('pin-2');
    });

    it('keeps distant pins in separate clusters at appropriate zoom', () => {
      const clusters = computeStoryClusters(mockPins, 5);
      const cities = clusters.map((c) => c.cityName);
      expect(cities).toContain('New Delhi');
      expect(cities).toContain('Mumbai');
    });
  });

  describe('filterPinsByPrivacy (Privacy Shield & Ghost Mode)', () => {
    const privacySettings: Record<string, PrivacyShieldSettings> = {
      'user-alice': {
        ghostModeEnabled: true,
        sharingScope: 'ghost',
        ghostUntil: null,
        lastUpdated: new Date().toISOString(),
      },
      'user-bob': {
        ghostModeEnabled: false,
        sharingScope: 'close_friends',
        ghostUntil: null,
        lastUpdated: new Date().toISOString(),
      },
      'user-charlie': {
        ghostModeEnabled: false,
        sharingScope: 'followers',
        ghostUntil: null,
        lastUpdated: new Date().toISOString(),
      },
    };

    it('always allows the current user to view their own pin even in ghost mode', () => {
      const filtered = filterPinsByPrivacy(mockPins, 'user-alice', privacySettings, () => false);
      expect(filtered.some((p) => p.userId === 'user-alice')).toBe(true);
    });

    it('hides ghost mode pins from other users', () => {
      const filtered = filterPinsByPrivacy(mockPins, 'other-user', privacySettings, () => true);
      expect(filtered.some((p) => p.userId === 'user-alice')).toBe(false);
    });

    it('shows close_friends pins only when caller is a verified close friend', () => {
      const notCloseFriend = filterPinsByPrivacy(
        mockPins,
        'stranger',
        privacySettings,
        () => false,
      );
      expect(notCloseFriend.some((p) => p.userId === 'user-bob')).toBe(false);

      const isCloseFriend = filterPinsByPrivacy(
        mockPins,
        'friend-1',
        privacySettings,
        (id) => id === 'user-bob',
      );
      expect(isCloseFriend.some((p) => p.userId === 'user-bob')).toBe(true);
    });

    it('shows public follower pins to non-ghost users', () => {
      const filtered = filterPinsByPrivacy(mockPins, 'follower-1', privacySettings, () => false);
      expect(filtered.some((p) => p.userId === 'user-charlie')).toBe(true);
    });
  });

  describe('updatePrivacyShield', () => {
    it('sets sharingScope to ghost when ghostModeEnabled is true', () => {
      const updated = updatePrivacyShield(DEFAULT_PRIVACY_SHIELD, {
        ghostModeEnabled: true,
      });
      expect(updated.ghostModeEnabled).toBe(true);
      expect(updated.sharingScope).toBe('ghost');
    });

    it('restores sharingScope when ghostModeEnabled is disabled', () => {
      const activeGhost: PrivacyShieldSettings = {
        ghostModeEnabled: true,
        sharingScope: 'ghost',
        ghostUntil: null,
        lastUpdated: new Date().toISOString(),
      };

      const restored = updatePrivacyShield(activeGhost, {
        ghostModeEnabled: false,
        sharingScope: 'close_friends',
      });
      expect(restored.ghostModeEnabled).toBe(false);
      expect(restored.sharingScope).toBe('close_friends');
    });
  });

  describe('findPinsNearLocation', () => {
    it('finds pins within specified radius', () => {
      // Search near India Gate within 5km (should find Delhi pins, not Mumbai)
      const nearDelhi = findPinsNearLocation(mockPins, 28.6129, 77.2295, 5);
      expect(nearDelhi.map((p) => p.id)).toContain('pin-1');
      expect(nearDelhi.map((p) => p.id)).toContain('pin-2');
      expect(nearDelhi.map((p) => p.id)).not.toContain('pin-3');
    });

    it('returns empty array when no pins are within radius', () => {
      // Search in London (lat: 51.5, lng: -0.1)
      const nearLondon = findPinsNearLocation(mockPins, 51.5074, -0.1278, 50);
      expect(nearLondon).toEqual([]);
    });
  });
});
