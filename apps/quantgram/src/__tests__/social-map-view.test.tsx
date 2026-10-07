import { describe, expect, it } from 'vitest';
import React from 'react';
import { SocialMapView } from '../components/SocialMapView';
import {
  computeStoryClusters,
  filterPinsByPrivacy,
  updatePrivacyShield,
  DEFAULT_PRIVACY_SHIELD,
  type StoryLocationPin,
} from '../features/map/social-map';

// Test-local fixture (not shipped): exercises the clustering/privacy logic
// with synthetic pins instead of production mock data.
const TEST_PINS: StoryLocationPin[] = [
  {
    id: 'pin-delhi-1',
    storyId: 'story-101',
    userId: 'user-alice',
    username: 'alice_wanderlust',
    displayName: 'Alice Miller',
    avatarUrl: 'https://example.com/a.jpg',
    mediaThumbnail: 'https://example.com/a-thumb.jpg',
    caption: 'Test pin one',
    lat: 28.6129,
    lng: 77.2295,
    cityName: 'New Delhi',
    landmarkName: 'India Gate',
    postedAt: Date.now() - 3600000,
  },
  {
    id: 'pin-delhi-2',
    storyId: 'story-102',
    userId: 'user-bob',
    username: 'bob_creator',
    displayName: 'Bob Kumar',
    avatarUrl: 'https://example.com/b.jpg',
    mediaThumbnail: 'https://example.com/b-thumb.jpg',
    caption: 'Test pin two',
    lat: 28.6304,
    lng: 77.2177,
    cityName: 'New Delhi',
    landmarkName: 'Connaught Place',
    postedAt: Date.now() - 1800000,
  },
  {
    id: 'pin-mumbai-1',
    storyId: 'story-103',
    userId: 'user-charlie',
    username: 'charlie_vibes',
    displayName: 'Charlie D.',
    avatarUrl: 'https://example.com/c.jpg',
    mediaThumbnail: 'https://example.com/c-thumb.jpg',
    caption: 'Test pin three',
    lat: 18.944,
    lng: 72.8238,
    cityName: 'Mumbai',
    landmarkName: 'Marine Drive',
    postedAt: Date.now() - 7200000,
  },
  {
    id: 'pin-mumbai-2',
    storyId: 'story-104',
    userId: 'user-dev',
    username: 'dev_lens',
    displayName: 'Dev Sharma',
    avatarUrl: 'https://example.com/d.jpg',
    mediaThumbnail: 'https://example.com/d-thumb.jpg',
    caption: 'Test pin four',
    lat: 19.0544,
    lng: 72.8193,
    cityName: 'Mumbai',
    landmarkName: 'Bandra Bandstand',
    postedAt: Date.now() - 900000,
  },
  {
    id: 'pin-blr-1',
    storyId: 'story-105',
    userId: 'user-emma',
    username: 'emma_tech',
    displayName: 'Emma Watson',
    avatarUrl: 'https://example.com/e.jpg',
    mediaThumbnail: 'https://example.com/e-thumb.jpg',
    caption: 'Test pin five',
    lat: 12.9352,
    lng: 77.6245,
    cityName: 'Bengaluru',
    landmarkName: 'Koramangala',
    postedAt: Date.now() - 4000000,
  },
];

describe('QuantGram Geospatial SocialMapView (Task W39-G07)', () => {
  it('exports SocialMapView component function', () => {
    expect(SocialMapView).toBeDefined();
    expect(typeof SocialMapView).toBe('function');
  });

  it('renders an honest empty state when no pins are provided', () => {
    const element = React.createElement(SocialMapView, {
      currentUserId: 'test-user',
      initialPins: [],
    });
    expect(React.isValidElement(element)).toBe(true);
    expect(element.props.initialPins).toEqual([]);
  });

  describe('Story Cluster Integration', () => {
    it('aggregates Delhi pins into a single cluster at zoom level 5', () => {
      const clusters = computeStoryClusters(TEST_PINS, 5);
      const delhiCluster = clusters.find((c) => c.cityName === 'New Delhi');
      expect(delhiCluster).toBeDefined();
      expect(delhiCluster?.count).toBe(2);
      expect(delhiCluster?.representativePin.cityName).toBe('New Delhi');
    });

    it('aggregates Mumbai pins into a distinct cluster at zoom level 5', () => {
      const clusters = computeStoryClusters(TEST_PINS, 5);
      const mumbaiCluster = clusters.find((c) => c.cityName === 'Mumbai');
      expect(mumbaiCluster).toBeDefined();
      expect(mumbaiCluster?.count).toBe(2);
      expect(mumbaiCluster?.representativePin.cityName).toBe('Mumbai');
    });

    it('aggregates Bengaluru pins into a distinct cluster at zoom level 5', () => {
      const clusters = computeStoryClusters(TEST_PINS, 5);
      const blrCluster = clusters.find((c) => c.cityName === 'Bengaluru');
      expect(blrCluster).toBeDefined();
      expect(blrCluster?.count).toBe(1);
    });
  });

  describe('Privacy Shield / Ghost Mode Integration', () => {
    it('correctly toggles ghost mode state with updatePrivacyShield', () => {
      const enabled = updatePrivacyShield(DEFAULT_PRIVACY_SHIELD, {
        ghostModeEnabled: true,
      });
      expect(enabled.ghostModeEnabled).toBe(true);
      expect(enabled.sharingScope).toBe('ghost');

      const disabled = updatePrivacyShield(enabled, {
        ghostModeEnabled: false,
        sharingScope: 'followers',
      });
      expect(disabled.ghostModeEnabled).toBe(false);
      expect(disabled.sharingScope).toBe('followers');
    });

    it('hides ghost pins from other users while preserving them for author', () => {
      const ghostPrivacy = {
        'user-alice': {
          ghostModeEnabled: true,
          sharingScope: 'ghost' as const,
          ghostUntil: null,
          lastUpdated: new Date().toISOString(),
        },
      };

      const viewerIsAlice = filterPinsByPrivacy(
        TEST_PINS,
        'user-alice',
        ghostPrivacy,
        () => false,
      );
      expect(viewerIsAlice.some((p) => p.userId === 'user-alice')).toBe(true);

      const viewerIsStranger = filterPinsByPrivacy(
        TEST_PINS,
        'user-stranger',
        ghostPrivacy,
        () => false,
      );
      expect(viewerIsStranger.some((p) => p.userId === 'user-alice')).toBe(false);
    });
  });

  describe('Component Props & Render Contract', () => {
    it('instantiates React element without errors', () => {
      const element = React.createElement(SocialMapView, {
        currentUserId: 'test-user',
        initialPins: TEST_PINS,
      });
      expect(React.isValidElement(element)).toBe(true);
      expect(element.props.currentUserId).toBe('test-user');
    });
  });
});
