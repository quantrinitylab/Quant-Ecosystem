import { describe, expect, it } from 'vitest';
import React from 'react';
import {
  SocialMapView,
  INITIAL_MAP_PINS,
  type SocialMapViewProps,
} from '../components/SocialMapView';
import {
  computeStoryClusters,
  filterPinsByPrivacy,
  updatePrivacyShield,
  DEFAULT_PRIVACY_SHIELD,
} from '../features/map/social-map';

describe('QuantGram Geospatial SocialMapView (Task W39-G07)', () => {
  it('exports SocialMapView component function', () => {
    expect(SocialMapView).toBeDefined();
    expect(typeof SocialMapView).toBe('function');
  });

  it('provides INITIAL_MAP_PINS with key metadata across major cities', () => {
    expect(INITIAL_MAP_PINS.length).toBeGreaterThanOrEqual(5);

    for (const pin of INITIAL_MAP_PINS) {
      expect(pin.id).toBeDefined();
      expect(pin.storyId).toBeDefined();
      expect(pin.userId).toBeDefined();
      expect(pin.cityName).toBeDefined();
      expect(pin.lat).toBeGreaterThan(0);
      expect(pin.lng).toBeGreaterThan(0);
      expect(pin.mediaThumbnail).toBeDefined();
    }
  });

  describe('Story Cluster Integration', () => {
    it('aggregates Delhi pins into a single cluster at zoom level 5', () => {
      const clusters = computeStoryClusters(INITIAL_MAP_PINS, 5);
      const delhiCluster = clusters.find((c) => c.cityName === 'New Delhi');
      expect(delhiCluster).toBeDefined();
      expect(delhiCluster?.count).toBe(2);
      expect(delhiCluster?.representativePin.cityName).toBe('New Delhi');
    });

    it('aggregates Mumbai pins into a distinct cluster at zoom level 5', () => {
      const clusters = computeStoryClusters(INITIAL_MAP_PINS, 5);
      const mumbaiCluster = clusters.find((c) => c.cityName === 'Mumbai');
      expect(mumbaiCluster).toBeDefined();
      expect(mumbaiCluster?.count).toBe(2);
      expect(mumbaiCluster?.representativePin.cityName).toBe('Mumbai');
    });

    it('aggregates Bengaluru pins into a distinct cluster at zoom level 5', () => {
      const clusters = computeStoryClusters(INITIAL_MAP_PINS, 5);
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
        INITIAL_MAP_PINS,
        'user-alice',
        ghostPrivacy,
        () => false,
      );
      expect(viewerIsAlice.some((p) => p.userId === 'user-alice')).toBe(true);

      const viewerIsStranger = filterPinsByPrivacy(
        INITIAL_MAP_PINS,
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
        initialPins: INITIAL_MAP_PINS,
      });
      expect(React.isValidElement(element)).toBe(true);
      expect(element.props.currentUserId).toBe('test-user');
    });
  });
});
