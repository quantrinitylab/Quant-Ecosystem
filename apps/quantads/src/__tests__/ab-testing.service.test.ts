import { describe, it, expect, beforeEach } from 'vitest';
import { ABTestingService } from '../services/ab-testing.service';

describe('ABTestingService', () => {
  let service: ABTestingService;

  beforeEach(() => {
    service = new ABTestingService();
  });

  describe('createTest', () => {
    it('should create an A/B test', () => {
      const test = service.createTest(
        'Button Color Test',
        [
          { name: 'Red', content: { color: 'red' } },
          { name: 'Blue', content: { color: 'blue' } },
        ],
        [50, 50],
      );
      expect(test.id).toBeDefined();
      expect(test.name).toBe('Button Color Test');
      expect(test.status).toBe('draft');
      expect(test.variants).toHaveLength(2);
      expect(test.variants[0]?.impressions).toBe(0);
      expect(test.variants[0]?.conversions).toBe(0);
    });
  });

  describe('startTest', () => {
    it('should start a draft test', () => {
      const test = service.createTest('T', [{ name: 'A', content: {} }], [100]);
      const started = service.startTest(test.id);
      expect(started?.status).toBe('running');
      expect(started?.startedAt).toBeGreaterThan(0);
    });

    it('should return null for non-existent test', () => {
      expect(service.startTest('fake')).toBeNull();
    });

    it('should not restart a running test', () => {
      const test = service.createTest('T', [{ name: 'A', content: {} }], [100]);
      service.startTest(test.id);
      expect(service.startTest(test.id)).toBeNull();
    });
  });

  describe('pauseTest', () => {
    it('should pause a running test', () => {
      const test = service.createTest('T', [{ name: 'A', content: {} }], [100]);
      service.startTest(test.id);
      const paused = service.pauseTest(test.id);
      expect(paused?.status).toBe('paused');
    });

    it('should return null if test is not running', () => {
      const test = service.createTest('T', [{ name: 'A', content: {} }], [100]);
      expect(service.pauseTest(test.id)).toBeNull();
    });
  });

  describe('recordImpression / recordConversion', () => {
    it('should record impressions', () => {
      const test = service.createTest(
        'T',
        [
          { name: 'A', content: {} },
          { name: 'B', content: {} },
        ],
        [50, 50],
      );
      const variantId = test.variants[0]!.id;
      service.recordImpression(test.id, variantId);
      service.recordImpression(test.id, variantId);

      const results = service.getResults(test.id);
      const variant = results?.variants.find((v) => v.id === variantId);
      expect(variant?.impressions).toBe(2);
    });

    it('should record conversions', () => {
      const test = service.createTest('T', [{ name: 'A', content: {} }], [100]);
      const variantId = test.variants[0]!.id;
      service.recordConversion(test.id, variantId);

      const results = service.getResults(test.id);
      const variant = results?.variants.find((v) => v.id === variantId);
      expect(variant?.conversions).toBe(1);
    });
  });

  describe('getResults', () => {
    it('should return null for non-existent test', () => {
      expect(service.getResults('fake')).toBeNull();
    });

    it('should not declare a winner without sufficient confidence', () => {
      const test = service.createTest(
        'T',
        [
          { name: 'A', content: {} },
          { name: 'B', content: {} },
        ],
        [50, 50],
      );
      const results = service.getResults(test.id);
      expect(results?.winner).toBeNull();
    });
  });

  describe('declareWinner', () => {
    it('should mark the test as completed with a winner', () => {
      const test = service.createTest(
        'T',
        [
          { name: 'A', content: {} },
          { name: 'B', content: {} },
        ],
        [50, 50],
      );
      const variantId = test.variants[0]!.id;
      const updated = service.declareWinner(test.id, variantId);
      expect(updated?.status).toBe('completed');
      expect(updated?.winnerId).toBe(variantId);
    });

    it('should return null for invalid variant', () => {
      const test = service.createTest('T', [{ name: 'A', content: {} }], [100]);
      expect(service.declareWinner(test.id, 'fake-variant')).toBeNull();
    });
  });

  describe('calculateSignificance', () => {
    it('should return 0 when no impressions', () => {
      const result = service.calculateSignificance(
        { id: 'a', name: 'A', content: {}, impressions: 0, conversions: 0 },
        { id: 'b', name: 'B', content: {}, impressions: 0, conversions: 0 },
      );
      expect(result).toBe(0);
    });

    it('should calculate significance with data', () => {
      const result = service.calculateSignificance(
        { id: 'a', name: 'A', content: {}, impressions: 1000, conversions: 100 },
        { id: 'b', name: 'B', content: {}, impressions: 1000, conversions: 50 },
      );
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1);
    });
  });
});
