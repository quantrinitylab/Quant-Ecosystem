// ============================================================================
// Payments - Tax Document Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { TaxDocumentService } from '../tax-document.service';

describe('TaxDocumentService', () => {
  let service: TaxDocumentService;

  beforeEach(() => {
    service = new TaxDocumentService();
  });

  describe('generateTaxDoc', () => {
    it('should generate 1099-NEC when earnings exceed threshold', () => {
      const doc = service.generateTaxDoc({
        creatorId: 'creator_1',
        year: 2024,
        totalEarnings: 1500,
      });

      expect(doc.creatorId).toBe('creator_1');
      expect(doc.year).toBe(2024);
      expect(doc.type).toBe('1099-NEC');
      expect(doc.totalEarnings).toBe(1500);
      expect(doc.generatedAt).toBeDefined();
      expect(doc.downloadUrl).toContain('creator_1');
      expect(doc.downloadUrl).toContain('2024');
    });

    it('should generate at exact threshold ($600)', () => {
      const doc = service.generateTaxDoc({
        creatorId: 'creator_1',
        year: 2024,
        totalEarnings: 600,
      });

      expect(doc.type).toBe('1099-NEC');
      expect(doc.totalEarnings).toBe(600);
    });

    it('should throw when earnings below threshold', () => {
      expect(() =>
        service.generateTaxDoc({
          creatorId: 'creator_1',
          year: 2024,
          totalEarnings: 599,
        }),
      ).toThrow('below $600 threshold');
    });

    it('should reject invalid year', () => {
      expect(() =>
        service.generateTaxDoc({
          creatorId: 'creator_1',
          year: 2019,
          totalEarnings: 1000,
        }),
      ).toThrow();
    });

    it('should reject empty creatorId', () => {
      expect(() =>
        service.generateTaxDoc({
          creatorId: '',
          year: 2024,
          totalEarnings: 1000,
        }),
      ).toThrow();
    });
  });

  describe('isThresholdMet', () => {
    it('should return true for $600', () => {
      expect(service.isThresholdMet(600)).toBe(true);
    });

    it('should return true for amounts above $600', () => {
      expect(service.isThresholdMet(1000)).toBe(true);
    });

    it('should return false for amounts below $600', () => {
      expect(service.isThresholdMet(599.99)).toBe(false);
    });

    it('should return false for zero', () => {
      expect(service.isThresholdMet(0)).toBe(false);
    });
  });

  describe('getEarningsSummary', () => {
    it('should return earnings breakdown by source', () => {
      service.recordEarnings('creator_1', 2024, 'tips', 200);
      service.recordEarnings('creator_1', 2024, 'paywalls', 300);
      service.recordEarnings('creator_1', 2024, 'storefront', 150);
      service.recordEarnings('creator_1', 2024, 'subscriptions', 100);

      const summary = service.getEarningsSummary('creator_1', 2024);
      expect(summary.totalEarnings).toBe(750);
      expect(summary.tips).toBe(200);
      expect(summary.paywalls).toBe(300);
      expect(summary.storefront).toBe(150);
      expect(summary.subscriptions).toBe(100);
    });

    it('should return zeros for creator with no earnings', () => {
      const summary = service.getEarningsSummary('creator_new', 2024);
      expect(summary.totalEarnings).toBe(0);
      expect(summary.tips).toBe(0);
      expect(summary.paywalls).toBe(0);
      expect(summary.storefront).toBe(0);
      expect(summary.subscriptions).toBe(0);
    });

    it('should separate earnings by year', () => {
      service.recordEarnings('creator_1', 2023, 'tips', 500);
      service.recordEarnings('creator_1', 2024, 'tips', 200);

      const summary2023 = service.getEarningsSummary('creator_1', 2023);
      const summary2024 = service.getEarningsSummary('creator_1', 2024);

      expect(summary2023.totalEarnings).toBe(500);
      expect(summary2024.totalEarnings).toBe(200);
    });
  });

  describe('getDocuments', () => {
    it('should return all documents for a creator', () => {
      service.generateTaxDoc({ creatorId: 'creator_1', year: 2023, totalEarnings: 800 });
      service.generateTaxDoc({ creatorId: 'creator_1', year: 2024, totalEarnings: 1200 });

      const docs = service.getDocuments('creator_1');
      expect(docs).toHaveLength(2);
    });

    it('should return empty array for creator with no documents', () => {
      expect(service.getDocuments('creator_new')).toHaveLength(0);
    });
  });
});
