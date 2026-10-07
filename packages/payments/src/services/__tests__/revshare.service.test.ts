// ============================================================================
// Payments - Revenue Share Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { RevShareService } from '../revshare.service';

describe('RevShareService', () => {
  let service: RevShareService;

  beforeEach(() => {
    service = new RevShareService();
  });

  describe('recordAdRevenue', () => {
    it('should split $100 ad revenue as $90 creator / $10 platform', () => {
      const entry = service.recordAdRevenue({
        creatorId: 'creator_1',
        adImpressionId: 'imp_1',
        grossAmount: 100,
      });

      expect(entry.type).toBe('ad_revenue');
      expect(entry.grossAmount).toBe(100);
      expect(entry.creatorShare).toBe(90);
      expect(entry.platformShare).toBe(10);
      expect(entry.creatorId).toBe('creator_1');
      expect(entry.referenceId).toBe('imp_1');
    });

    it('should handle fractional amounts correctly', () => {
      const entry = service.recordAdRevenue({
        creatorId: 'creator_1',
        adImpressionId: 'imp_2',
        grossAmount: 33.33,
      });

      expect(entry.creatorShare).toBe(30); // 33.33 * 0.9 = 29.997 -> 30.00
      expect(entry.platformShare).toBe(3.33); // 33.33 * 0.1 = 3.333 -> 3.33
    });

    it('should reject negative amount', () => {
      expect(() =>
        service.recordAdRevenue({
          creatorId: 'creator_1',
          adImpressionId: 'imp_1',
          grossAmount: -10,
        }),
      ).toThrow();
    });

    it('should reject zero amount', () => {
      expect(() =>
        service.recordAdRevenue({
          creatorId: 'creator_1',
          adImpressionId: 'imp_1',
          grossAmount: 0,
        }),
      ).toThrow();
    });

    it('should reject empty creatorId', () => {
      expect(() =>
        service.recordAdRevenue({
          creatorId: '',
          adImpressionId: 'imp_1',
          grossAmount: 100,
        }),
      ).toThrow();
    });
  });

  describe('recordTip', () => {
    it('should split $5 tip as $4.75 creator / $0.25 platform', () => {
      const entry = service.recordTip({
        creatorId: 'creator_1',
        tipId: 'tip_1',
        grossAmount: 5,
      });

      expect(entry.type).toBe('tip');
      expect(entry.grossAmount).toBe(5);
      expect(entry.creatorShare).toBe(4.75);
      expect(entry.platformShare).toBe(0.25);
      expect(entry.creatorId).toBe('creator_1');
      expect(entry.referenceId).toBe('tip_1');
    });

    it('should split $20 tip as $19 creator / $1 platform', () => {
      const entry = service.recordTip({
        creatorId: 'creator_2',
        tipId: 'tip_2',
        grossAmount: 20,
      });

      expect(entry.creatorShare).toBe(19);
      expect(entry.platformShare).toBe(1);
    });

    it('should reject zero amount', () => {
      expect(() =>
        service.recordTip({
          creatorId: 'creator_1',
          tipId: 'tip_1',
          grossAmount: 0,
        }),
      ).toThrow();
    });

    it('should reject empty tipId', () => {
      expect(() =>
        service.recordTip({
          creatorId: 'creator_1',
          tipId: '',
          grossAmount: 5,
        }),
      ).toThrow();
    });
  });

  describe('getCreatorBalance', () => {
    it('should aggregate all creator shares', () => {
      service.recordAdRevenue({
        creatorId: 'creator_1',
        adImpressionId: 'imp_1',
        grossAmount: 100,
      });
      service.recordTip({ creatorId: 'creator_1', tipId: 'tip_1', grossAmount: 10 });

      const balance = service.getCreatorBalance('creator_1');
      // $100 ad -> $90 creator, $10 tip -> $9.50 creator
      expect(balance).toBe(99.5);
    });

    it('should return 0 for unknown creator', () => {
      expect(service.getCreatorBalance('unknown')).toBe(0);
    });

    it('should not include other creators earnings', () => {
      service.recordAdRevenue({
        creatorId: 'creator_1',
        adImpressionId: 'imp_1',
        grossAmount: 100,
      });
      service.recordAdRevenue({ creatorId: 'creator_2', adImpressionId: 'imp_2', grossAmount: 50 });

      expect(service.getCreatorBalance('creator_1')).toBe(90);
      expect(service.getCreatorBalance('creator_2')).toBe(45);
    });
  });

  describe('getPlatformBalance', () => {
    it('should aggregate all platform shares', () => {
      service.recordAdRevenue({
        creatorId: 'creator_1',
        adImpressionId: 'imp_1',
        grossAmount: 100,
      });
      service.recordTip({ creatorId: 'creator_1', tipId: 'tip_1', grossAmount: 10 });

      const balance = service.getPlatformBalance();
      // $100 ad -> $10 platform, $10 tip -> $0.50 platform
      expect(balance).toBe(10.5);
    });

    it('should return 0 when no entries', () => {
      expect(service.getPlatformBalance()).toBe(0);
    });
  });

  describe('getLedgerEntries', () => {
    it('should return all entries for a creator', () => {
      service.recordAdRevenue({
        creatorId: 'creator_1',
        adImpressionId: 'imp_1',
        grossAmount: 100,
      });
      service.recordTip({ creatorId: 'creator_1', tipId: 'tip_1', grossAmount: 5 });
      service.recordAdRevenue({ creatorId: 'creator_2', adImpressionId: 'imp_2', grossAmount: 50 });

      const entries = service.getLedgerEntries('creator_1');
      expect(entries).toHaveLength(2);
    });

    it('should filter by type', () => {
      service.recordAdRevenue({
        creatorId: 'creator_1',
        adImpressionId: 'imp_1',
        grossAmount: 100,
      });
      service.recordTip({ creatorId: 'creator_1', tipId: 'tip_1', grossAmount: 5 });

      const adEntries = service.getLedgerEntries('creator_1', { type: 'ad_revenue' });
      expect(adEntries).toHaveLength(1);
      expect(adEntries[0]!.type).toBe('ad_revenue');

      const tipEntries = service.getLedgerEntries('creator_1', { type: 'tip' });
      expect(tipEntries).toHaveLength(1);
      expect(tipEntries[0]!.type).toBe('tip');
    });

    it('should return empty array for unknown creator', () => {
      expect(service.getLedgerEntries('unknown')).toHaveLength(0);
    });
  });

  describe('immutability', () => {
    it('should not allow modification of entries', () => {
      const entry = service.recordAdRevenue({
        creatorId: 'creator_1',
        adImpressionId: 'imp_1',
        grossAmount: 100,
      });

      // Attempting to modify a frozen entry should throw in strict mode
      expect(() => {
        (entry as { creatorShare: number }).creatorShare = 999;
      }).toThrow();
    });

    it('should not expose update or delete methods', () => {
      const service2 = new RevShareService();
      expect((service2 as unknown as Record<string, unknown>)['update']).toBeUndefined();
      expect((service2 as unknown as Record<string, unknown>)['delete']).toBeUndefined();
      expect((service2 as unknown as Record<string, unknown>)['remove']).toBeUndefined();
    });
  });
});
