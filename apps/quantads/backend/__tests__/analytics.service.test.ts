import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsService } from '../services/analytics.service';

function createMockPrisma() {
  return {
    campaign: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const mockCampaign = {
    id: 'campaign-1',
    advertiserId: 'adv-1',
    name: 'Test Campaign',
    status: 'ACTIVE',
    totalImpressions: 10000,
    totalClicks: 500,
    totalConversions: 50,
    totalSpend: 1000,
    deletedAt: null,
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AnalyticsService(prisma as never);
  });

  describe('getCampaignMetrics', () => {
    it('returns computed metrics for a campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.getCampaignMetrics('campaign-1');

      expect(result.impressions).toBe(10000);
      expect(result.clicks).toBe(500);
      expect(result.conversions).toBe(50);
      expect(result.ctr).toBe(0.05);
      expect(result.cpc).toBe(2);
      expect(result.conversionRate).toBe(0.1);
    });

    it('throws CAMPAIGN_NOT_FOUND for missing campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.getCampaignMetrics('missing')).rejects.toThrow('Campaign not found');
    });
  });

  describe('getImpressions', () => {
    it('returns impression count', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.getImpressions('campaign-1');

      expect(result.campaignId).toBe('campaign-1');
      expect(result.impressions).toBe(10000);
    });

    it('throws CAMPAIGN_NOT_FOUND for missing campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.getImpressions('missing')).rejects.toThrow('Campaign not found');
    });
  });

  describe('getClicks', () => {
    it('returns click count', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.getClicks('campaign-1');

      expect(result.campaignId).toBe('campaign-1');
      expect(result.clicks).toBe(500);
    });
  });

  describe('getConversions', () => {
    it('returns conversion count', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.getConversions('campaign-1');

      expect(result.campaignId).toBe('campaign-1');
      expect(result.conversions).toBe(50);
    });
  });

  describe('getCostReport', () => {
    it('returns cost metrics', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.getCostReport('campaign-1');

      expect(result.campaignId).toBe('campaign-1');
      expect(result.totalSpend).toBe(1000);
      expect(result.cpc).toBe(2);
      expect(result.cpm).toBe(100);
    });

    it('handles zero impressions and clicks', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        ...mockCampaign,
        totalImpressions: 0,
        totalClicks: 0,
        totalSpend: 0,
      });

      const result = await service.getCostReport('campaign-1');

      expect(result.cpc).toBe(0);
      expect(result.cpm).toBe(0);
    });
  });

  describe('getROI', () => {
    it('calculates ROI', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.getROI('campaign-1');

      expect(result.roi).toBe(0.05);
    });
  });
});
