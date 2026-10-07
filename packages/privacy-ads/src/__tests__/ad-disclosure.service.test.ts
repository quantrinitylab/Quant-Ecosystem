// ============================================================================
// Privacy-First Ads - Ad Disclosure Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AdDisclosureService } from '../services/ad-disclosure.service';
import type { CandidateAd } from '../types';

function createCandidate(id: string, categories: string[] = ['tech']): CandidateAd {
  return {
    id,
    campaignId: `campaign_${id}`,
    creativeUrl: `https://cdn.example.com/ads/${id}.png`,
    headline: `Ad ${id}`,
    description: `Description for ${id}`,
    callToAction: 'Learn More',
    landingUrl: `https://example.com/${id}`,
    contextCategories: categories,
    brandSafetyCategories: ['safe'],
    bidAmount: 5.0,
  };
}

describe('AdDisclosureService', () => {
  let service: AdDisclosureService;

  beforeEach(() => {
    service = new AdDisclosureService();
  });

  describe('generateDisclosure', () => {
    it('should always return 1-2 signals for contextual mode with signals', () => {
      const ad = createCandidate('ad_1', ['tech']);

      const disclosure = service.generateDisclosure(ad, 'contextual', ['programming', 'tech']);

      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
      expect(disclosure.adId).toBe('ad_1');
      expect(disclosure.targetingMode).toBe('contextual');
    });

    it('should always return 1-2 signals for behavioral mode with signals', () => {
      const ad = createCandidate('ad_1', ['tech']);

      const disclosure = service.generateDisclosure(ad, 'behavioral', ['interest_tech']);

      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
      expect(disclosure.targetingMode).toBe('behavioral');
    });

    it('should return at least 1 signal even with empty signals array', () => {
      const ad = createCandidate('ad_1', ['tech']);

      const disclosure = service.generateDisclosure(ad, 'contextual', []);

      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
    });

    it('should return at least 1 signal with no context categories', () => {
      const ad = createCandidate('ad_1', []);

      const disclosure = service.generateDisclosure(ad, 'contextual', []);

      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
    });

    it('should never return more than 2 signals', () => {
      const ad = createCandidate('ad_1', ['tech', 'programming', 'software']);

      const disclosure = service.generateDisclosure(ad, 'behavioral', [
        'signal1',
        'signal2',
        'signal3',
        'signal4',
      ]);

      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
    });

    it('should never return 0 signals', () => {
      const ad = createCandidate('ad_empty', []);

      const disclosure = service.generateDisclosure(ad, 'contextual', []);

      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
    });

    it('should include targeting mode explanation in contextual mode', () => {
      const ad = createCandidate('ad_1', ['tech']);

      const disclosure = service.generateDisclosure(ad, 'contextual', ['tech']);

      expect(disclosure.signals[0]!.type).toBe('targeting_mode');
      expect(disclosure.signals[0]!.explanation).toContain('page');
    });

    it('should include targeting mode explanation in behavioral mode', () => {
      const ad = createCandidate('ad_1', ['tech']);

      const disclosure = service.generateDisclosure(ad, 'behavioral', ['tech']);

      expect(disclosure.signals[0]!.type).toBe('targeting_mode');
      expect(disclosure.signals[0]!.explanation).toContain('opted in');
    });
  });
});
