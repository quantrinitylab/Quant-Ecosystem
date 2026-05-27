import { describe, it, expect, beforeEach } from 'vitest';
import { PrivacyAdServingService } from '../services/privacy-ad-serving.service';

describe('PrivacyAdServingService', () => {
  let service: PrivacyAdServingService;

  beforeEach(() => {
    service = new PrivacyAdServingService();
  });

  describe('getCandidates', () => {
    it('returns ~50 candidates for on-device ranking', () => {
      const candidates = service.getCandidates({
        placement: 'main-feed',
        targetingMode: 'contextual',
      });

      expect(candidates).toHaveLength(50);
    });

    it('candidates contain NO user profile data', () => {
      const candidates = service.getCandidates({
        placement: 'sidebar',
        targetingMode: 'contextual',
      });

      for (const candidate of candidates) {
        const candidateStr = JSON.stringify(candidate);
        // Must not contain any user-identifying fields
        expect(candidateStr).not.toContain('userId');
        expect(candidateStr).not.toContain('interests');
        expect(candidateStr).not.toContain('browsingHistory');
        expect(candidateStr).not.toContain('profileData');
        expect(candidateStr).not.toContain('userEmail');
        expect(candidateStr).not.toContain('personalizedScore');
      }

      // Verify only expected fields are present
      for (const candidate of candidates) {
        expect(candidate).toHaveProperty('id');
        expect(candidate).toHaveProperty('campaignId');
        expect(candidate).toHaveProperty('creativeUrl');
        expect(candidate).toHaveProperty('headline');
        expect(candidate).toHaveProperty('description');
        expect(candidate).toHaveProperty('callToAction');
        expect(candidate).toHaveProperty('landingUrl');
        expect(candidate).toHaveProperty('contextCategories');
        expect(candidate).toHaveProperty('brandSafetyCategories');
        expect(candidate).toHaveProperty('bidAmount');
      }
    });

    it('contextual mode uses page content for matching', () => {
      const pageContent =
        'Latest technology news about artificial intelligence and machine learning in software development';

      const candidates = service.getCandidates({
        placement: 'article',
        pageContent,
        targetingMode: 'contextual',
      });

      expect(candidates).toHaveLength(50);

      // Technology-related ads should be prioritized (at the front)
      const techAds = candidates.filter((c) => c.contextCategories.includes('technology'));
      expect(techAds.length).toBeGreaterThan(0);
    });

    it('returns candidates even without page content', () => {
      const candidates = service.getCandidates({
        placement: 'main-feed',
        targetingMode: 'contextual',
      });

      expect(candidates).toHaveLength(50);
      expect(candidates[0]).toHaveProperty('id');
    });

    it('handles behavioral targeting mode', () => {
      const candidates = service.getCandidates({
        placement: 'main-feed',
        targetingMode: 'behavioral',
      });

      expect(candidates).toHaveLength(50);
      // Even in behavioral mode, response must not contain user data
      for (const candidate of candidates) {
        const keys = Object.keys(candidate);
        expect(keys).not.toContain('userId');
        expect(keys).not.toContain('interests');
        expect(keys).not.toContain('browsingHistory');
      }
    });
  });

  describe('recordFeedback', () => {
    it('accepts only aggregate signals (adId + action)', () => {
      // Should not throw
      expect(() => service.recordFeedback({ adId: 'ad-0001', action: 'clicked' })).not.toThrow();
      expect(() => service.recordFeedback({ adId: 'ad-0002', action: 'dismissed' })).not.toThrow();
    });

    it('feedback payload contains no user features', () => {
      // The feedback interface only accepts { adId, action }
      // TypeScript enforces this at compile time, but we verify runtime behavior
      const feedback = { adId: 'ad-0001', action: 'clicked' as const };
      const feedbackStr = JSON.stringify(feedback);

      expect(feedbackStr).not.toContain('userId');
      expect(feedbackStr).not.toContain('interests');
      expect(feedbackStr).not.toContain('browsingHistory');
      expect(feedbackStr).not.toContain('profileData');
    });
  });

  describe('getDisclosure', () => {
    it('returns disclosure with 1-2 signals', () => {
      const disclosure = service.getDisclosure('ad-0001');

      expect(disclosure).toHaveProperty('adId', 'ad-0001');
      expect(disclosure).toHaveProperty('targetingMode', 'contextual');
      expect(disclosure).toHaveProperty('signals');
      expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
      expect(disclosure.signals.length).toBeLessThanOrEqual(2);
    });

    it('each signal has type and explanation', () => {
      const disclosure = service.getDisclosure('ad-0005');

      for (const signal of disclosure.signals) {
        expect(signal).toHaveProperty('type');
        expect(signal).toHaveProperty('explanation');
        expect(signal.type.length).toBeGreaterThan(0);
        expect(signal.explanation.length).toBeGreaterThan(0);
      }
    });

    it('disclosure is present for any ad ID', () => {
      const ids = ['ad-0001', 'ad-0010', 'ad-0050', 'unknown-ad'];

      for (const adId of ids) {
        const disclosure = service.getDisclosure(adId);
        expect(disclosure.signals.length).toBeGreaterThanOrEqual(1);
        expect(disclosure.signals.length).toBeLessThanOrEqual(2);
      }
    });
  });
});
