import { describe, it, expect, beforeEach } from 'vitest';
import { RequestCostLogger } from '../core/request-cost-logger';

describe('RequestCostLogger', () => {
  let logger: RequestCostLogger;

  beforeEach(() => {
    logger = new RequestCostLogger();
  });

  describe('logRequest', () => {
    it('calculates cost correctly (inputTokens * costPerInput + outputTokens * costPerOutput)', () => {
      const entry = logger.logRequest('gpt-4o', 1000, 500, 0.000005, 0.000015);
      // 1000 * 0.000005 + 500 * 0.000015 = 0.005 + 0.0075 = 0.0125
      expect(entry.estimatedCost).toBeCloseTo(0.0125, 10);
      expect(entry.modelId).toBe('gpt-4o');
      expect(entry.inputTokens).toBe(1000);
      expect(entry.outputTokens).toBe(500);
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('handles zero tokens', () => {
      const entry = logger.logRequest('gpt-4o', 0, 0, 0.000005, 0.000015);
      expect(entry.estimatedCost).toBe(0);
    });

    it('handles free models (zero cost per token)', () => {
      const entry = logger.logRequest('omni-moderation-latest', 1000, 500, 0, 0);
      expect(entry.estimatedCost).toBe(0);
    });
  });

  describe('getTotal', () => {
    it('returns 0 when no requests logged', () => {
      expect(logger.getTotal()).toBe(0);
    });

    it('accumulates cost across multiple requests', () => {
      logger.logRequest('gpt-4o', 1000, 500, 0.000005, 0.000015);
      logger.logRequest('gpt-4o-mini', 2000, 1000, 0.00000015, 0.0000006);
      // First: 0.005 + 0.0075 = 0.0125
      // Second: 0.0003 + 0.0006 = 0.0009
      const total = logger.getTotal();
      expect(total).toBeCloseTo(0.0134, 4);
    });

    it('accumulates across different models', () => {
      logger.logRequest('gpt-4o', 100, 50, 0.000005, 0.000015);
      logger.logRequest('claude-sonnet-4', 100, 50, 0.000003, 0.000015);
      // First: 0.0005 + 0.00075 = 0.00125
      // Second: 0.0003 + 0.00075 = 0.00105
      expect(logger.getTotal()).toBeCloseTo(0.0023, 4);
    });
  });

  describe('getByModel', () => {
    it('returns empty array for unknown model', () => {
      expect(logger.getByModel('unknown')).toEqual([]);
    });

    it('filters entries by model ID', () => {
      logger.logRequest('gpt-4o', 100, 50, 0.000005, 0.000015);
      logger.logRequest('gpt-4o-mini', 200, 100, 0.00000015, 0.0000006);
      logger.logRequest('gpt-4o', 300, 150, 0.000005, 0.000015);

      const gpt4oEntries = logger.getByModel('gpt-4o');
      expect(gpt4oEntries.length).toBe(2);
      expect(gpt4oEntries[0]!.inputTokens).toBe(100);
      expect(gpt4oEntries[1]!.inputTokens).toBe(300);

      const miniEntries = logger.getByModel('gpt-4o-mini');
      expect(miniEntries.length).toBe(1);
    });
  });

  describe('reset', () => {
    it('clears all logged entries', () => {
      logger.logRequest('gpt-4o', 100, 50, 0.000005, 0.000015);
      logger.logRequest('gpt-4o-mini', 200, 100, 0.00000015, 0.0000006);
      logger.reset();
      expect(logger.getTotal()).toBe(0);
      expect(logger.getByModel('gpt-4o')).toEqual([]);
    });
  });
});
