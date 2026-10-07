import { describe, it, expect, beforeEach } from 'vitest';
import { MonetizationEngine } from '../monetization/monetization-engine.js';

describe('MonetizationEngine', () => {
  let engine: MonetizationEngine;

  beforeEach(() => {
    engine = new MonetizationEngine();
  });

  describe('recordTip', () => {
    it('records a tip event', () => {
      const event = engine.recordTip('user-1', 'creator-1', 5.0);
      expect(event.type).toBe('tip');
      expect(event.amount).toBe(5.0);
      expect(event.creatorId).toBe('creator-1');
      expect(event.sourceId).toBe('user-1');
    });

    it('generates a unique event id', () => {
      const e1 = engine.recordTip('user-1', 'creator-1', 5.0);
      const e2 = engine.recordTip('user-2', 'creator-1', 10.0);
      expect(e1.id).not.toBe(e2.id);
    });
  });

  describe('recordIAP', () => {
    it('records an IAP event with 30% platform fee', () => {
      const event = engine.recordIAP('user-1', 'creator-1', 'item-1', 10.0);
      expect(event.type).toBe('iap');
      expect(event.amount).toBe(7.0);
      expect(event.creatorId).toBe('creator-1');
    });

    it('sets sourceId to userId:itemId', () => {
      const event = engine.recordIAP('user-1', 'creator-1', 'item-abc', 10.0);
      expect(event.sourceId).toBe('user-1:item-abc');
    });
  });

  describe('recordAdRevenue', () => {
    it('records ad revenue with 55% creator share', () => {
      const event = engine.recordAdRevenue('creator-1', 'ad-1', 10000, 5.0);
      // 10000 impressions at $5 CPM = $50 total, 55% creator share = $27.50
      expect(event.type).toBe('ad_revenue');
      expect(event.amount).toBeCloseTo(27.5);
      expect(event.creatorId).toBe('creator-1');
    });

    it('handles low impression counts', () => {
      const event = engine.recordAdRevenue('creator-1', 'ad-2', 100, 2.0);
      // 100 impressions at $2 CPM = $0.20 total, 55% = $0.11
      expect(event.amount).toBeCloseTo(0.11);
    });
  });

  describe('recordRemixRoyalty', () => {
    it('records a remix royalty event', () => {
      const event = engine.recordRemixRoyalty('original-creator', 'remixer', 'content-1', 2.5);
      expect(event.type).toBe('remix_royalty');
      expect(event.amount).toBe(2.5);
      expect(event.creatorId).toBe('original-creator');
    });
  });

  describe('getEarnings', () => {
    it('returns earnings breakdown for a creator', () => {
      engine.recordTip('user-1', 'creator-1', 5.0);
      engine.recordTip('user-2', 'creator-1', 3.0);
      engine.recordIAP('user-1', 'creator-1', 'item-1', 10.0);
      engine.recordAdRevenue('creator-1', 'ad-1', 1000, 4.0);

      const earnings = engine.getEarnings('creator-1');
      expect(earnings.tips).toBe(8.0);
      expect(earnings.iap).toBe(7.0);
      expect(earnings.adRevenue).toBeCloseTo(2.2);
      expect(earnings.total).toBeCloseTo(17.2);
    });

    it('filters by period', () => {
      engine.recordTip('user-1', 'creator-1', 5.0);

      const future = new Date(Date.now() + 86400000);
      const earnings = engine.getEarnings('creator-1', {
        start: future,
        end: new Date(future.getTime() + 86400000),
      });
      expect(earnings.total).toBe(0);
    });

    it('returns zero earnings for unknown creator', () => {
      const earnings = engine.getEarnings('unknown');
      expect(earnings.total).toBe(0);
    });

    it('separates earnings between creators', () => {
      engine.recordTip('user-1', 'creator-1', 5.0);
      engine.recordTip('user-1', 'creator-2', 10.0);

      const earnings1 = engine.getEarnings('creator-1');
      const earnings2 = engine.getEarnings('creator-2');
      expect(earnings1.tips).toBe(5.0);
      expect(earnings2.tips).toBe(10.0);
    });
  });
});
