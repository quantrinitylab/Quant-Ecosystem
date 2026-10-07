// ============================================================================
// Privacy-First Ads - On-Device Ranker Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { OnDeviceRankerService } from '../services/on-device-ranker.service';
import type { CandidateAd, OnDeviceInterestModel, AggregateFeedback } from '../types';

function createCandidate(id: string, bid: number, categories: string[] = []): CandidateAd {
  return {
    id,
    campaignId: `campaign_${id}`,
    creativeUrl: `https://cdn.example.com/ads/${id}.png`,
    headline: `Ad ${id} headline`,
    description: `Description for ad ${id}`,
    callToAction: 'Learn More',
    landingUrl: `https://example.com/ad/${id}`,
    contextCategories: categories,
    brandSafetyCategories: ['safe'],
    bidAmount: bid,
  };
}

function createModel(
  interests: { category: string; weight: number }[] = [],
): OnDeviceInterestModel {
  return {
    userId: 'user_123',
    interests: interests.map((i) => ({
      category: i.category,
      weight: i.weight,
      lastSeen: Date.now(),
      decayRate: 0.1,
    })),
    lastDecay: Date.now(),
  };
}

describe('OnDeviceRankerService', () => {
  let service: OnDeviceRankerService;

  beforeEach(() => {
    service = new OnDeviceRankerService();
  });

  describe('rankCandidates', () => {
    it('should rank 50 candidates and return only top 3', () => {
      const candidates = Array.from({ length: 50 }, (_, i) =>
        createCandidate(`ad_${i}`, i * 0.5, ['tech']),
      );
      const model = createModel([{ category: 'tech', weight: 1.0 }]);

      const ranked = service.rankCandidates(candidates, model, 'contextual');

      expect(ranked).toHaveLength(3);
      expect(ranked[0]!.rank).toBe(1);
      expect(ranked[1]!.rank).toBe(2);
      expect(ranked[2]!.rank).toBe(3);
    });

    it('should rank by bid amount in contextual mode', () => {
      const candidates = [
        createCandidate('low', 1.0, ['tech']),
        createCandidate('high', 10.0, ['tech']),
        createCandidate('mid', 5.0, ['tech']),
      ];
      const model = createModel();

      const ranked = service.rankCandidates(candidates, model, 'contextual');

      expect(ranked[0]!.id).toBe('high');
      expect(ranked[1]!.id).toBe('mid');
      expect(ranked[2]!.id).toBe('low');
    });

    it('should use interest weights in behavioral mode', () => {
      const candidates = [
        createCandidate('sports_ad', 1.0, ['sports']),
        createCandidate('tech_ad', 1.0, ['tech']),
        createCandidate('food_ad', 1.0, ['food']),
      ];
      const model = createModel([
        { category: 'tech', weight: 5.0 },
        { category: 'sports', weight: 2.0 },
      ]);

      const ranked = service.rankCandidates(candidates, model, 'behavioral');

      expect(ranked[0]!.id).toBe('tech_ad');
      expect(ranked[1]!.id).toBe('sports_ad');
    });

    it('should never expose raw user features in the ranked output', () => {
      const candidates = [createCandidate('ad_1', 5.0, ['tech'])];
      const model = createModel([{ category: 'tech', weight: 10.0 }]);

      const ranked = service.rankCandidates(candidates, model, 'behavioral');

      // The ranked ad should only contain ad properties + score/rank
      const output = JSON.stringify(ranked);
      expect(output).not.toContain('userId');
      expect(output).not.toContain('user_123');
      expect(output).not.toContain('decayRate');
      expect(output).not.toContain('lastDecay');
    });

    it('should return fewer results if fewer candidates exist', () => {
      const candidates = [createCandidate('ad_1', 5.0, ['tech'])];
      const model = createModel();

      const ranked = service.rankCandidates(candidates, model, 'contextual');

      expect(ranked).toHaveLength(1);
      expect(ranked[0]!.rank).toBe(1);
    });

    it('should handle empty candidates array', () => {
      const model = createModel();
      const ranked = service.rankCandidates([], model, 'contextual');
      expect(ranked).toHaveLength(0);
    });
  });

  describe('updateLocalInterests', () => {
    it('should increase weight only for matched categories on click feedback', () => {
      const model = createModel([
        { category: 'tech', weight: 1.0 },
        { category: 'sports', weight: 1.0 },
      ]);
      const feedback: AggregateFeedback = {
        adId: 'ad_1',
        action: 'clicked',
        timestamp: Date.now(),
        contextCategories: ['tech'],
      };

      const updated = service.updateLocalInterests(model, feedback);

      // Only 'tech' should be updated
      expect(updated.interests[0]!.weight).toBeGreaterThan(1.0);
      // 'sports' should remain unchanged
      expect(updated.interests[1]!.weight).toBe(1.0);
    });

    it('should decrease weight only for matched categories on dismiss feedback', () => {
      const model = createModel([
        { category: 'tech', weight: 1.0 },
        { category: 'sports', weight: 1.0 },
      ]);
      const feedback: AggregateFeedback = {
        adId: 'ad_1',
        action: 'dismissed',
        timestamp: Date.now(),
        contextCategories: ['tech'],
      };

      const updated = service.updateLocalInterests(model, feedback);

      // Only 'tech' should be decreased
      expect(updated.interests[0]!.weight).toBeLessThan(1.0);
      // 'sports' should remain unchanged
      expect(updated.interests[1]!.weight).toBe(1.0);
    });

    it('should update all interests when no contextCategories provided (legacy)', () => {
      const model = createModel([
        { category: 'tech', weight: 1.0 },
        { category: 'sports', weight: 1.0 },
      ]);
      const feedback: AggregateFeedback = {
        adId: 'ad_1',
        action: 'clicked',
        timestamp: Date.now(),
      };

      const updated = service.updateLocalInterests(model, feedback);

      expect(updated.interests[0]!.weight).toBeGreaterThan(1.0);
      expect(updated.interests[1]!.weight).toBeGreaterThan(1.0);
    });

    it('should not let weight go below 0 on dismiss', () => {
      const model = createModel([{ category: 'tech', weight: 0.01 }]);
      const feedback: AggregateFeedback = {
        adId: 'ad_1',
        action: 'dismissed',
        timestamp: Date.now(),
        contextCategories: ['tech'],
      };

      const updated = service.updateLocalInterests(model, feedback);

      expect(updated.interests[0]!.weight).toBeGreaterThanOrEqual(0);
    });

    it('should apply decay over time', () => {
      const model: OnDeviceInterestModel = {
        userId: 'user_123',
        interests: [{ category: 'tech', weight: 1.0, lastSeen: Date.now(), decayRate: 0.1 }],
        lastDecay: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
      };

      const candidates = [createCandidate('ad_1', 0, ['tech'])];
      const ranked = service.rankCandidates(candidates, model, 'behavioral');

      // After 3 days of decay at 10% per day, weight should be less than 1.0
      expect(ranked[0]!.score).toBeLessThan(1.0);
    });
  });

  describe('getDisclosure', () => {
    it('should return disclosure with 1-2 signals for contextual mode', () => {
      const ad = { ...createCandidate('ad_1', 5.0, ['tech']), score: 5.1, rank: 1 };

      const disclosure = service.getDisclosure(ad, 'contextual');

      expect(disclosure.adId).toBe('ad_1');
      expect(disclosure.targetingMode).toBe('contextual');
      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
    });

    it('should return disclosure with 1-2 signals for behavioral mode', () => {
      const ad = { ...createCandidate('ad_1', 5.0, ['tech']), score: 5.1, rank: 1 };

      const disclosure = service.getDisclosure(ad, 'behavioral');

      expect(disclosure.adId).toBe('ad_1');
      expect(disclosure.targetingMode).toBe('behavioral');
      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
    });
  });
});
