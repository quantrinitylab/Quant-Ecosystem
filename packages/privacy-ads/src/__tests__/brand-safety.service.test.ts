// ============================================================================
// Privacy-First Ads - Brand Safety Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { BrandSafetyService } from '../services/brand-safety.service';
import type { BrandSafetyCategory, CandidateAd } from '../types';

function createCandidate(
  id: string,
  safetyCategories: BrandSafetyCategory[] = ['safe'],
): CandidateAd {
  return {
    id,
    campaignId: `campaign_${id}`,
    creativeUrl: `https://cdn.example.com/ads/${id}.png`,
    headline: `Ad ${id}`,
    description: `Description for ${id}`,
    callToAction: 'Learn More',
    landingUrl: `https://example.com/${id}`,
    contextCategories: ['tech'],
    brandSafetyCategories: safetyCategories,
    bidAmount: 5.0,
  };
}

describe('BrandSafetyService', () => {
  let service: BrandSafetyService;

  beforeEach(() => {
    service = new BrandSafetyService();
  });

  describe('classifyContent', () => {
    it('should classify safe content', () => {
      const categories = service.classifyContent(
        'A great article about cooking recipes and healthy food.',
      );
      expect(categories).toContain('safe');
    });

    it('should detect adult content', () => {
      const categories = service.classifyContent('This page contains explicit nsfw adult content.');
      expect(categories).toContain('adult');
    });

    it('should detect violence', () => {
      const categories = service.classifyContent(
        'Breaking news: violent attack leaves multiple victims.',
      );
      expect(categories).toContain('violence');
    });

    it('should NOT flag "skill" as violence (word boundary)', () => {
      const categories = service.classifyContent('She has great skill in cooking and baking.');
      expect(categories).not.toContain('violence');
    });

    it('should NOT flag "whatever" as hate speech (word boundary)', () => {
      const categories = service.classifyContent('Whatever you choose to do, enjoy the day.');
      expect(categories).not.toContain('hate_speech');
    });

    it('should still detect actual violence keyword at word boundary', () => {
      const categories = service.classifyContent('The murder suspect was arrested downtown.');
      expect(categories).toContain('violence');
    });

    it('should detect gambling content', () => {
      const categories = service.classifyContent(
        'Best online casino offers for betting and poker games.',
      );
      expect(categories).toContain('gambling');
    });

    it('should detect drugs content', () => {
      const categories = service.classifyContent(
        'Authorities seized cocaine and heroin in the raid.',
      );
      expect(categories).toContain('drugs');
    });

    it('should detect multiple unsafe categories', () => {
      const categories = service.classifyContent('Violent attack at casino with explicit content.');
      expect(categories).toContain('violence');
      expect(categories).toContain('gambling');
    });

    it('should reject empty content', () => {
      expect(() => service.classifyContent('')).toThrow();
    });
  });

  describe('isAdSafe', () => {
    it('should mark ad as safe for safe content', () => {
      const ad = createCandidate('ad_1');
      const result = service.isAdSafe(ad, ['safe']);
      expect(result).toBe(true);
    });

    it('should mark ad as unsafe for violent content', () => {
      const ad = createCandidate('ad_1', ['violence']);
      const result = service.isAdSafe(ad, ['violence']);
      expect(result).toBe(false);
    });

    it('should mark ad as unsafe for adult content', () => {
      const ad = createCandidate('ad_1');
      const result = service.isAdSafe(ad, ['adult']);
      expect(result).toBe(false);
    });

    it('should allow ad when content is safe', () => {
      const ad = createCandidate('ad_1', ['violence', 'adult']);
      const result = service.isAdSafe(ad, ['safe']);
      expect(result).toBe(true);
    });
  });

  describe('getBlockedCategories', () => {
    it('should return default blocked categories', () => {
      const blocked = service.getBlockedCategories();
      expect(blocked).toContain('adult');
      expect(blocked).toContain('violence');
      expect(blocked).toContain('hate_speech');
      expect(blocked).toContain('gambling');
      expect(blocked).toContain('drugs');
      expect(blocked).toContain('weapons');
    });

    it('should not include safe in blocked list', () => {
      const blocked = service.getBlockedCategories();
      expect(blocked).not.toContain('safe');
    });
  });
});
