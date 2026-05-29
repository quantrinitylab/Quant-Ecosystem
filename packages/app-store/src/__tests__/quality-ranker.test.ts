import { describe, it, expect, beforeEach } from 'vitest';
import { QualityRanker } from '../ranking/quality-ranker.js';
import { AppListing } from '../types.js';

describe('QualityRanker', () => {
  let ranker: QualityRanker;

  const createListing = (id: string, overrides: Partial<AppListing> = {}): AppListing => ({
    id,
    name: `App ${id}`,
    creatorId: 'creator-1',
    description: 'Test app',
    version: '1.0.0',
    category: 'productivity',
    subcategory: 'tools',
    rating: 4.0,
    reviewCount: 10,
    trustScore: 80,
    qualityScore: 80,
    price: 0,
    downloads: 100,
    screenshots: [],
    status: 'published',
    ...overrides,
  });

  beforeEach(() => {
    ranker = new QualityRanker();
  });

  describe('calculateScore', () => {
    it('should return 0 for unknown app', () => {
      expect(ranker.calculateScore('unknown')).toBe(0);
    });

    it('should calculate score based on quality and trust factors', () => {
      ranker.updateMetrics('app-1', {
        qualityScore: 90,
        trustScore: 85,
        userRating: 4.5,
        freshness: 0.8,
        relevance: 0.9,
      });

      const score = ranker.calculateScore('app-1');
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should weight quality and trust higher than other factors', () => {
      // High quality+trust, low engagement (freshness/relevance)
      ranker.updateMetrics('quality-app', {
        qualityScore: 95,
        trustScore: 90,
        userRating: 3.0,
        freshness: 0.2,
        relevance: 0.3,
      });

      // Low quality+trust, high engagement
      ranker.updateMetrics('engagement-app', {
        qualityScore: 30,
        trustScore: 25,
        userRating: 4.8,
        freshness: 1.0,
        relevance: 1.0,
      });

      const qualityScore = ranker.calculateScore('quality-app');
      const engagementScore = ranker.calculateScore('engagement-app');

      // Quality+trust should outweigh pure engagement metrics
      expect(qualityScore).toBeGreaterThan(engagementScore);
    });

    it('should cap score at 100', () => {
      ranker.updateMetrics('max-app', {
        qualityScore: 100,
        trustScore: 100,
        userRating: 5.0,
        freshness: 1.0,
        relevance: 1.0,
      });

      expect(ranker.calculateScore('max-app')).toBeLessThanOrEqual(100);
    });
  });

  describe('rankResults', () => {
    it('should rank listings by calculated score (descending)', () => {
      ranker.updateMetrics('high', {
        qualityScore: 95,
        trustScore: 90,
        userRating: 4.5,
        freshness: 0.8,
        relevance: 0.9,
      });
      ranker.updateMetrics('medium', {
        qualityScore: 60,
        trustScore: 55,
        userRating: 3.5,
        freshness: 0.5,
        relevance: 0.5,
      });
      ranker.updateMetrics('low', {
        qualityScore: 20,
        trustScore: 15,
        userRating: 2.0,
        freshness: 0.2,
        relevance: 0.2,
      });

      const listings = [createListing('low'), createListing('high'), createListing('medium')];

      const ranked = ranker.rankResults(listings);
      expect(ranked[0]!.id).toBe('high');
      expect(ranked[1]!.id).toBe('medium');
      expect(ranked[2]!.id).toBe('low');
    });

    it('should not mutate the original array', () => {
      ranker.updateMetrics('a', {
        qualityScore: 50,
        trustScore: 50,
        userRating: 3.0,
        freshness: 0.5,
        relevance: 0.5,
      });
      ranker.updateMetrics('b', {
        qualityScore: 90,
        trustScore: 90,
        userRating: 5.0,
        freshness: 1.0,
        relevance: 1.0,
      });

      const listings = [createListing('a'), createListing('b')];
      const ranked = ranker.rankResults(listings);

      expect(listings[0]!.id).toBe('a');
      expect(ranked[0]!.id).toBe('b');
    });

    it('should prioritize quality+trust over pure engagement in ranking', () => {
      // Trusted quality app
      ranker.updateMetrics('trusted', {
        qualityScore: 92,
        trustScore: 88,
        userRating: 3.8,
        freshness: 0.3,
        relevance: 0.4,
      });
      // Engagement-heavy but low trust
      ranker.updateMetrics('viral', {
        qualityScore: 25,
        trustScore: 20,
        userRating: 4.9,
        freshness: 1.0,
        relevance: 1.0,
      });

      const listings = [createListing('viral'), createListing('trusted')];
      const ranked = ranker.rankResults(listings);

      expect(ranked[0]!.id).toBe('trusted');
    });
  });

  describe('getFactors', () => {
    it('should return null for unknown app', () => {
      expect(ranker.getFactors('unknown')).toBeNull();
    });

    it('should return stored factors', () => {
      ranker.updateMetrics('app-f', {
        qualityScore: 80,
        trustScore: 70,
        userRating: 4.0,
        freshness: 0.5,
        relevance: 0.6,
      });
      const factors = ranker.getFactors('app-f');

      expect(factors).not.toBeNull();
      expect(factors!.qualityScore).toBe(80);
      expect(factors!.trustScore).toBe(70);
    });
  });

  describe('updateMetrics', () => {
    it('should update existing metrics partially', () => {
      ranker.updateMetrics('app-m', {
        qualityScore: 50,
        trustScore: 50,
        userRating: 3.0,
        freshness: 0.5,
        relevance: 0.5,
      });
      ranker.updateMetrics('app-m', { qualityScore: 80 });

      const factors = ranker.getFactors('app-m');
      expect(factors!.qualityScore).toBe(80);
      expect(factors!.trustScore).toBe(50);
    });

    it('should initialize with defaults if no prior metrics', () => {
      ranker.updateMetrics('new-app', { qualityScore: 75 });
      const factors = ranker.getFactors('new-app');

      expect(factors!.qualityScore).toBe(75);
      expect(factors!.trustScore).toBe(50); // default
    });
  });
});
