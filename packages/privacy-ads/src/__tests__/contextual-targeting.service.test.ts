// ============================================================================
// Privacy-First Ads - Contextual Targeting Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextualTargetingService } from '../services/contextual-targeting.service';
import type { CandidateAd } from '../types';

function createCandidate(id: string, categories: string[]): CandidateAd {
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

describe('ContextualTargetingService', () => {
  let service: ContextualTargetingService;

  beforeEach(() => {
    service = new ContextualTargetingService();
  });

  describe('extractContentSignals', () => {
    it('should extract keywords from page content', () => {
      const content =
        'TypeScript programming language for web development. JavaScript frameworks and React components.';

      const signals = service.extractContentSignals(content);

      expect(signals.length).toBeGreaterThan(0);
      expect(signals.length).toBeLessThanOrEqual(10);
    });

    it('should filter out stop words', () => {
      const content = 'The quick brown fox is a very fast animal that can run';

      const signals = service.extractContentSignals(content);

      expect(signals).not.toContain('the');
      expect(signals).not.toContain('is');
      expect(signals).not.toContain('very');
      expect(signals).not.toContain('that');
      expect(signals).not.toContain('can');
    });

    it('should return unique words sorted by frequency', () => {
      const content = 'tech tech tech sports sports food';

      const signals = service.extractContentSignals(content);

      expect(signals[0]).toBe('tech');
      expect(signals[1]).toBe('sports');
      expect(signals[2]).toBe('food');
    });

    it('should handle content with special characters', () => {
      const content = 'Programming! Is @great for #developers & engineers.';

      const signals = service.extractContentSignals(content);

      expect(signals.length).toBeGreaterThan(0);
      expect(signals).toContain('programming');
    });

    it('should return max 10 signals', () => {
      const content = Array.from({ length: 50 }, (_, i) => `keyword${i}`).join(' ');

      const signals = service.extractContentSignals(content);

      expect(signals.length).toBeLessThanOrEqual(10);
    });

    it('should reject empty content', () => {
      expect(() => service.extractContentSignals('')).toThrow();
    });
  });

  describe('matchAdsByContext', () => {
    it('should match ads by context categories only', () => {
      const candidates = [
        createCandidate('tech_ad', ['tech', 'programming']),
        createCandidate('sports_ad', ['sports', 'fitness']),
        createCandidate('food_ad', ['food', 'cooking']),
      ];

      const matched = service.matchAdsByContext(['tech', 'programming'], candidates);

      expect(matched).toHaveLength(1);
      expect(matched[0]!.id).toBe('tech_ad');
    });

    it('should match multiple ads if signals overlap', () => {
      const candidates = [
        createCandidate('ad_1', ['tech', 'news']),
        createCandidate('ad_2', ['news', 'politics']),
        createCandidate('ad_3', ['sports']),
      ];

      const matched = service.matchAdsByContext(['news'], candidates);

      expect(matched).toHaveLength(2);
    });

    it('should return empty if no signals match', () => {
      const candidates = [createCandidate('ad_1', ['tech']), createCandidate('ad_2', ['sports'])];

      const matched = service.matchAdsByContext(['music'], candidates);

      expect(matched).toHaveLength(0);
    });

    it('should return empty for empty signals', () => {
      const candidates = [createCandidate('ad_1', ['tech'])];

      const matched = service.matchAdsByContext([], candidates);

      expect(matched).toHaveLength(0);
    });

    it('should be case-insensitive in matching', () => {
      const candidates = [createCandidate('ad_1', ['Tech', 'PROGRAMMING'])];

      const matched = service.matchAdsByContext(['tech'], candidates);

      expect(matched).toHaveLength(1);
    });
  });
});
