// ============================================================================
// Payments - Ad Billing Service Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { AdBillingService } from '../ad-billing.service';

describe('AdBillingService', () => {
  let service: AdBillingService;

  beforeEach(() => {
    service = new AdBillingService();
  });

  describe('createCampaign', () => {
    it('should create a campaign with proper defaults', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Summer Sale',
        budget: 1000,
        dailyBudget: 100,
        cpm: 5,
        cpc: 0.5,
        cpa: 10,
      });

      expect(campaign.id).toMatch(/^camp_/);
      expect(campaign.advertiserId).toBe('adv_1');
      expect(campaign.name).toBe('Summer Sale');
      expect(campaign.budget).toBe(1000);
      expect(campaign.dailyBudget).toBe(100);
      expect(campaign.spent).toBe(0);
      expect(campaign.dailySpent).toBe(0);
      expect(campaign.cpm).toBe(5);
      expect(campaign.cpc).toBe(0.5);
      expect(campaign.cpa).toBe(10);
      expect(campaign.status).toBe('active');
      expect(campaign.impressions).toBe(0);
      expect(campaign.clicks).toBe(0);
      expect(campaign.conversions).toBe(0);
    });

    it('should reject invalid campaign params', () => {
      expect(() =>
        service.createCampaign({
          advertiserId: '',
          name: 'Test',
          budget: 1000,
          dailyBudget: 100,
          cpm: 5,
          cpc: 0.5,
          cpa: 10,
        }),
      ).toThrow();

      expect(() =>
        service.createCampaign({
          advertiserId: 'adv_1',
          name: 'Test',
          budget: -100,
          dailyBudget: 100,
          cpm: 5,
          cpc: 0.5,
          cpa: 10,
        }),
      ).toThrow();
    });
  });

  describe('recordImpression', () => {
    it('should record impression and charge CPM/1000', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 1000,
        dailyBudget: 100,
        cpm: 5,
        cpc: 0.5,
        cpa: 10,
      });

      const record = service.recordImpression(campaign.id);

      expect(record).not.toBeNull();
      expect(record!.type).toBe('impression');
      expect(record!.cost).toBe(0.005); // $5 CPM / 1000
      expect(record!.campaignId).toBe(campaign.id);

      const stats = service.getCampaignStats(campaign.id);
      expect(stats.impressions).toBe(1);
      expect(stats.spent).toBeCloseTo(0.005);
    });

    it('should exhaust campaign when total budget reached', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Tiny Budget',
        budget: 0.01,
        dailyBudget: 100,
        cpm: 10, // $0.01 per impression
        cpc: 0.5,
        cpa: 10,
      });

      // First impression should succeed
      const record1 = service.recordImpression(campaign.id);
      expect(record1).not.toBeNull();

      // Second should exhaust
      const record2 = service.recordImpression(campaign.id);
      expect(record2).toBeNull();

      const stats = service.getCampaignStats(campaign.id);
      expect(stats.status).toBe('exhausted');
    });

    it('should exhaust campaign when daily budget reached', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Daily Cap',
        budget: 10000,
        dailyBudget: 0.01,
        cpm: 10, // $0.01 per impression
        cpc: 0.5,
        cpa: 10,
      });

      const record1 = service.recordImpression(campaign.id);
      expect(record1).not.toBeNull();

      const record2 = service.recordImpression(campaign.id);
      expect(record2).toBeNull();

      const stats = service.getCampaignStats(campaign.id);
      expect(stats.status).toBe('exhausted');
    });

    it('should throw for unknown campaign', () => {
      expect(() => service.recordImpression('unknown')).toThrow('Campaign not found');
    });

    it('should throw for non-active campaign', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 1000,
        dailyBudget: 100,
        cpm: 5,
        cpc: 0.5,
        cpa: 10,
      });

      service.pauseCampaign(campaign.id);

      expect(() => service.recordImpression(campaign.id)).toThrow('not active');
    });
  });

  describe('recordClick', () => {
    it('should record click and charge CPC', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 1000,
        dailyBudget: 100,
        cpm: 5,
        cpc: 0.5,
        cpa: 10,
      });

      const record = service.recordClick(campaign.id);

      expect(record).not.toBeNull();
      expect(record!.type).toBe('click');
      expect(record!.cost).toBe(0.5);

      const stats = service.getCampaignStats(campaign.id);
      expect(stats.clicks).toBe(1);
      expect(stats.spent).toBe(0.5);
    });

    it('should exhaust campaign when budget is insufficient for click', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 0.3,
        dailyBudget: 100,
        cpm: 5,
        cpc: 0.5,
        cpa: 10,
      });

      const record = service.recordClick(campaign.id);
      expect(record).toBeNull();

      const stats = service.getCampaignStats(campaign.id);
      expect(stats.status).toBe('exhausted');
    });
  });

  describe('recordConversion', () => {
    it('should record conversion and charge CPA', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 1000,
        dailyBudget: 100,
        cpm: 5,
        cpc: 0.5,
        cpa: 10,
      });

      const record = service.recordConversion(campaign.id);

      expect(record).not.toBeNull();
      expect(record!.type).toBe('conversion');
      expect(record!.cost).toBe(10);

      const stats = service.getCampaignStats(campaign.id);
      expect(stats.conversions).toBe(1);
      expect(stats.spent).toBe(10);
    });
  });

  describe('getCampaignStats', () => {
    it('should return current campaign stats', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 1000,
        dailyBudget: 100,
        cpm: 5,
        cpc: 0.5,
        cpa: 10,
      });

      service.recordImpression(campaign.id);
      service.recordClick(campaign.id);
      service.recordConversion(campaign.id);

      const stats = service.getCampaignStats(campaign.id);
      expect(stats.impressions).toBe(1);
      expect(stats.clicks).toBe(1);
      expect(stats.conversions).toBe(1);
      expect(stats.spent).toBeCloseTo(10.505); // 0.005 + 0.5 + 10
    });

    it('should throw for unknown campaign', () => {
      expect(() => service.getCampaignStats('unknown')).toThrow('Campaign not found');
    });
  });

  describe('pauseCampaign', () => {
    it('should pause an active campaign', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 1000,
        dailyBudget: 100,
        cpm: 5,
        cpc: 0.5,
        cpa: 10,
      });

      const paused = service.pauseCampaign(campaign.id);
      expect(paused.status).toBe('paused');
    });

    it('should throw for unknown campaign', () => {
      expect(() => service.pauseCampaign('unknown')).toThrow('Campaign not found');
    });
  });

  describe('resetDailySpend', () => {
    it('should reset daily spend counters', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 1000,
        dailyBudget: 100,
        cpm: 5,
        cpc: 0.5,
        cpa: 10,
      });

      service.recordClick(campaign.id);
      service.resetDailySpend();

      const stats = service.getCampaignStats(campaign.id);
      expect(stats.dailySpent).toBe(0);
      expect(stats.spent).toBe(0.5); // Total spend preserved
    });

    it('should reactivate exhausted campaigns that have remaining total budget', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 1000,
        dailyBudget: 0.01,
        cpm: 10,
        cpc: 0.5,
        cpa: 10,
      });

      service.recordImpression(campaign.id); // uses daily budget
      service.recordImpression(campaign.id); // exhausts daily

      const statsExhausted = service.getCampaignStats(campaign.id);
      expect(statsExhausted.status).toBe('exhausted');

      service.resetDailySpend();

      const statsAfterReset = service.getCampaignStats(campaign.id);
      expect(statsAfterReset.status).toBe('active');
    });

    it('should not reactivate campaigns that have exhausted total budget', () => {
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Test',
        budget: 0.01,
        dailyBudget: 0.01,
        cpm: 10,
        cpc: 0.5,
        cpa: 10,
      });

      service.recordImpression(campaign.id);
      service.recordImpression(campaign.id); // exhausts

      service.resetDailySpend();

      const stats = service.getCampaignStats(campaign.id);
      expect(stats.status).toBe('exhausted');
    });

    it('should not reactivate campaigns where remaining budget cannot serve one event at cheapest rate', () => {
      // Campaign with cpm=10 -> cost per impression = $0.01, cpc=$0.5, cpa=$10
      // Cheapest rate is $0.01 (cpm/1000)
      // Set budget so that after spending, remaining < $0.01
      const campaign = service.createCampaign({
        advertiserId: 'adv_1',
        name: 'Almost Empty',
        budget: 0.015, // Total budget
        dailyBudget: 0.01, // Daily budget triggers exhaustion first
        cpm: 10, // $0.01 per impression
        cpc: 0.5,
        cpa: 10,
      });

      // First impression costs $0.01, succeeds (dailySpent=0.01, spent=0.01)
      const r1 = service.recordImpression(campaign.id);
      expect(r1).not.toBeNull();

      // Second impression would exceed daily budget, exhausts
      const r2 = service.recordImpression(campaign.id);
      expect(r2).toBeNull();

      const statsExhausted = service.getCampaignStats(campaign.id);
      expect(statsExhausted.status).toBe('exhausted');
      // Remaining: 0.015 - 0.01 = 0.005, cheapest rate = 0.01
      // 0.005 < 0.01, so should NOT reactivate

      service.resetDailySpend();

      const statsAfterReset = service.getCampaignStats(campaign.id);
      expect(statsAfterReset.status).toBe('exhausted');
    });
  });
});
