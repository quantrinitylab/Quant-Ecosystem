import { describe, it, expect, beforeEach } from 'vitest';
import { AdPolicyEnforcementService } from './ad-policy-enforcement';

describe('AdPolicyEnforcementService', () => {
  let service: AdPolicyEnforcementService;

  beforeEach(() => {
    service = new AdPolicyEnforcementService();
  });

  describe('prohibited category rejection', () => {
    it('should reject ads in prohibited categories', () => {
      const result = service.checkAd({
        content: 'Buy our premium tobacco products',
        category: 'tobacco',
      });
      expect(result.decision).toBe('rejected');
      expect(result.violations.some((v) => v.type === 'prohibited_category')).toBe(true);
    });

    it('should reject weapons category', () => {
      const result = service.checkAd({
        content: 'Shop for firearms',
        category: 'weapons',
      });
      expect(result.decision).toBe('rejected');
    });

    it('should reject gambling category', () => {
      const result = service.checkAd({
        content: 'Online casino',
        category: 'gambling',
      });
      expect(result.decision).toBe('rejected');
    });

    it('should approve non-prohibited categories', () => {
      const result = service.checkAd({
        content: 'Fresh organic vegetables delivered to your door',
        category: 'food',
      });
      expect(result.decision).toBe('approved');
      expect(result.violations.length).toBe(0);
    });

    it('should be case insensitive for categories', () => {
      const result = service.checkAd({
        content: 'Ad content',
        category: 'TOBACCO',
      });
      expect(result.decision).toBe('rejected');
    });
  });

  describe('misleading claim detection', () => {
    it('should detect guaranteed results claims', () => {
      const result = service.checkAd({
        content: 'Guaranteed results in 7 days or your money back',
      });
      expect(result.violations.some((v) => v.type === 'misleading_claim')).toBe(true);
    });

    it('should detect 100% cure claims', () => {
      const result = service.checkAd({
        content: 'This supplement is 100% effective against all diseases',
      });
      expect(result.violations.some((v) => v.type === 'misleading_claim')).toBe(true);
    });

    it('should detect miracle cure claims', () => {
      const result = service.checkAd({
        content: 'Our miracle cure will fix everything',
      });
      expect(result.violations.some((v) => v.type === 'misleading_claim')).toBe(true);
    });

    it('should detect no risk claims', () => {
      const result = service.checkAd({
        content: 'Invest now with no risk whatsoever',
      });
      expect(result.violations.some((v) => v.type === 'misleading_claim')).toBe(true);
    });

    it('should allow honest advertising', () => {
      const result = service.checkAd({
        content: 'Try our new software. 30-day free trial available.',
      });
      expect(result.violations.some((v) => v.type === 'misleading_claim')).toBe(false);
    });
  });

  describe('targeting minors rejection', () => {
    it('should reject ads targeting users under 18', () => {
      const result = service.checkAd({
        content: 'Cool new app for teens',
        targetAgeMin: 13,
      });
      expect(result.decision).toBe('rejected');
      expect(result.violations.some((v) => v.type === 'targeting_minors')).toBe(true);
    });

    it('should approve ads targeting adults', () => {
      const result = service.checkAd({
        content: 'Professional networking platform',
        targetAgeMin: 25,
      });
      expect(result.violations.some((v) => v.type === 'targeting_minors')).toBe(false);
    });

    it('should approve when no age target specified', () => {
      const result = service.checkAd({
        content: 'General audience product',
      });
      expect(result.violations.some((v) => v.type === 'targeting_minors')).toBe(false);
    });
  });

  describe('creative compliance', () => {
    it('should flag excessive text in image', () => {
      const result = service.checkAd({
        content: 'Buy now',
        imageTextRatio: 0.9,
      });
      expect(result.violations.some((v) => v.type === 'creative_violation')).toBe(true);
    });

    it('should approve acceptable image text ratio', () => {
      const result = service.checkAd({
        content: 'Buy now',
        imageTextRatio: 0.5,
      });
      expect(result.violations.some((v) => v.type === 'creative_violation')).toBe(false);
    });

    it('should approve when no image text ratio provided', () => {
      const result = service.checkAd({ content: 'Simple text ad' });
      expect(result.violations.some((v) => v.type === 'creative_violation')).toBe(false);
    });
  });

  describe('decision logic', () => {
    it('should approve clean ads', () => {
      const result = service.checkAd({
        content: 'Great software for your business needs',
        category: 'technology',
        targetAgeMin: 21,
        imageTextRatio: 0.3,
      });
      expect(result.decision).toBe('approved');
    });

    it('should return needs_review for low severity violations only', () => {
      const result = service.checkAd({
        content: 'Normal product ad',
        imageTextRatio: 0.85, // creative violation is low severity
      });
      expect(result.decision).toBe('needs_review');
    });
  });

  describe('addProhibitedCategory', () => {
    it('should add new prohibited category', () => {
      service.addProhibitedCategory('crypto');
      const result = service.checkAd({
        content: 'Buy crypto now',
        category: 'crypto',
      });
      expect(result.decision).toBe('rejected');
    });
  });

  describe('addMisleadingPattern', () => {
    it('should add new misleading pattern', () => {
      service.addMisleadingPattern(/free money/i);
      const result = service.checkAd({
        content: 'Get free money today',
      });
      expect(result.violations.some((v) => v.type === 'misleading_claim')).toBe(true);
    });
  });
});
