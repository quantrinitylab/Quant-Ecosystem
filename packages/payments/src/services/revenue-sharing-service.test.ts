import { describe, it, expect, beforeEach } from 'vitest';
import { RevenueSharing } from './revenue-sharing-service';

describe('RevenueSharing', () => {
  let rs: RevenueSharing;

  beforeEach(() => {
    rs = new RevenueSharing();
  });

  describe('setShareRatio', () => {
    it('creates a share with defaults (70/30)', async () => {
      const share = await rs.setShareRatio('creator_1');
      expect(share.platformSharePercent).toBe(30);
      expect(share.creatorSharePercent).toBe(70);
      expect(share.active).toBe(true);
      expect(share.minimumPayout).toBe(50);
    });

    it('updates an existing creator share in place', async () => {
      await rs.setShareRatio('creator_1');
      const updated = await rs.setShareRatio('creator_1', {
        platformSharePercent: 20,
        creatorSharePercent: 80,
        minimumPayout: 100,
        payoutSchedule: 'weekly',
      });
      expect(updated.platformSharePercent).toBe(20);
      expect(updated.minimumPayout).toBe(100);
      expect(updated.payoutSchedule).toBe('weekly');
    });

    it('rejects shares that do not sum to 100', async () => {
      await expect(
        rs.setShareRatio('c', { platformSharePercent: 40, creatorSharePercent: 40 }),
      ).rejects.toThrow(/sum to 100/);
    });
  });

  describe('recordRevenue', () => {
    beforeEach(async () => {
      await rs.setShareRatio('creator_1'); // 30/70
    });

    it('splits revenue between platform and creator', async () => {
      const rec = await rs.recordRevenue('creator_1', 100, 'ad', 'ad_1');
      expect(rec.platformFee).toBe(30);
      expect(rec.creatorEarning).toBe(70);

      const earnings = await rs.getCreatorEarnings('creator_1');
      expect(earnings.totalEarned).toBe(70);
      expect(earnings.pending).toBe(70);
    });

    it('rejects non-positive amounts and unknown creators', async () => {
      await expect(rs.recordRevenue('creator_1', 0, 's', 'i')).rejects.toThrow(/must be positive/);
      await expect(rs.recordRevenue('ghost', 10, 's', 'i')).rejects.toThrow(/not configured/);
    });
  });

  describe('calculatePayout + processPayouts', () => {
    it('is ineligible below the minimum payout', async () => {
      await rs.setShareRatio('c', { minimumPayout: 100 });
      await rs.recordRevenue('c', 100, 's', 'i'); // creator earns 70 < 100
      const calc = await rs.calculatePayout('c');
      expect(calc.eligible).toBe(false);
      expect(calc.amount).toBe(0);
      expect(calc.pendingAmount).toBe(70);
    });

    it('processes eligible creators and skips ineligible/held ones', async () => {
      await rs.setShareRatio('rich', { minimumPayout: 50 });
      await rs.recordRevenue('rich', 1000, 's', 'i'); // earns 700
      await rs.setShareRatio('poor', { minimumPayout: 50 });
      await rs.recordRevenue('poor', 10, 's', 'i'); // earns 7 < 50

      const { processed, skipped } = await rs.processPayouts();
      expect(processed.map((p) => p.creatorId)).toContain('rich');
      expect(skipped).toContain('poor');
      expect(processed[0]?.status).toBe('completed');

      // pending cleared for processed creator
      const calc = await rs.calculatePayout('rich');
      expect(calc.pendingAmount).toBe(0);
      const history = await rs.getPayoutHistory('rich');
      expect(history).toHaveLength(1);
    });
  });

  describe('hold / release', () => {
    beforeEach(async () => {
      await rs.setShareRatio('c');
      await rs.recordRevenue('c', 1000, 's', 'i'); // pending 700
    });

    it('holds and releases amounts, affecting eligibility', async () => {
      await rs.holdPayout('c', 700, 'review');
      const calc = await rs.calculatePayout('c');
      expect(calc.eligible).toBe(false); // available = 700 - 700 = 0
      expect((await rs.getCreatorEarnings('c')).held).toBe(700);

      await rs.releasePayout('c', 700);
      expect((await rs.calculatePayout('c')).eligible).toBe(true);
    });

    it('rejects over-holding and over-releasing', async () => {
      await expect(rs.holdPayout('c', 99999, 'x')).rejects.toThrow(/exceeds pending/);
      await expect(rs.releasePayout('c', 10)).rejects.toThrow(/exceeds held/);
    });
  });

  describe('getCreatorEarnings filters', () => {
    it('filters records by source and date range', async () => {
      await rs.setShareRatio('c');
      await rs.recordRevenue('c', 100, 'ad', 'a1');
      await rs.recordRevenue('c', 200, 'tip', 't1');

      const ads = await rs.getCreatorEarnings('c', { source: 'ad' });
      expect(ads.records).toHaveLength(1);

      const future = await rs.getCreatorEarnings('c', { startDate: Date.now() + 100000 });
      expect(future.records).toHaveLength(0);
    });
  });

  describe('generateReport', () => {
    it('aggregates revenue, platform/creator earnings, payouts and top creators', async () => {
      await rs.setShareRatio('a');
      await rs.setShareRatio('b');
      await rs.recordRevenue('a', 1000, 'ad', 'a1');
      await rs.recordRevenue('b', 500, 'tip', 'b1');
      await rs.processPayouts();

      const report = await rs.generateReport(0, Date.now() + 1000);
      expect(report.totalRevenue).toBe(1500);
      expect(report.platformEarnings).toBe(450); // 30% of 1500
      expect(report.creatorEarnings).toBe(1050);
      expect(report.creatorCount).toBe(2);
      expect(report.topCreators[0]?.creatorId).toBe('a'); // earned 700
      expect(report.bySource.ad).toBe(1000);
      expect(report.totalPayouts).toBeGreaterThan(0);
    });
  });

  it('throws for unknown creators in read methods', async () => {
    await expect(rs.calculatePayout('ghost')).rejects.toThrow(/not configured/);
    await expect(rs.getPayoutHistory('ghost')).rejects.toThrow(/not configured/);
  });
});
