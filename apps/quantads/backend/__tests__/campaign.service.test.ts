import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CampaignService } from '../services/campaign.service';

function createMockPrisma() {
  return {
    campaign: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  };
}

describe('CampaignService', () => {
  let service: CampaignService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new CampaignService(prisma as never);
  });

  describe('createCampaign', () => {
    it('creates a draft campaign', async () => {
      const mockCampaign = {
        id: 'camp-1',
        advertiserId: 'adv-1',
        name: 'My Campaign',
        objective: 'AWARENESS',
        status: 'DRAFT',
        budget: {},
        schedule: {},
        targeting: {},
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      prisma.campaign.create.mockResolvedValue(mockCampaign);

      const result = await service.createCampaign({
        advertiserId: 'adv-1',
        name: 'My Campaign',
      });

      expect(result.status).toBe('DRAFT');
      expect(result.name).toBe('My Campaign');
      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: {
          advertiserId: 'adv-1',
          name: 'My Campaign',
          objective: 'AWARENESS',
          status: 'DRAFT',
          budget: {},
          schedule: {},
          targeting: {},
          totalSpend: 0,
          totalImpressions: 0,
          totalClicks: 0,
          totalConversions: 0,
        },
      });
    });
  });

  describe('activateCampaign', () => {
    it('activates a draft campaign with budget', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        status: 'DRAFT',
        budget: { daily: 100, total: 1000 },
        deletedAt: null,
      });
      prisma.campaign.update.mockResolvedValue({
        id: 'camp-1',
        status: 'ACTIVE',
      });

      const result = await service.activateCampaign('camp-1');

      expect(result.status).toBe('ACTIVE');
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { status: 'ACTIVE', updatedAt: expect.any(Date) },
      });
    });

    it('throws NO_BUDGET when campaign has no budget', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        status: 'DRAFT',
        budget: {},
        deletedAt: null,
      });

      await expect(service.activateCampaign('camp-1')).rejects.toThrow(
        'Campaign must have a budget before activation',
      );
    });

    it('throws INVALID_STATUS_TRANSITION for active campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        status: 'ACTIVE',
        budget: { daily: 100 },
        deletedAt: null,
      });

      await expect(service.activateCampaign('camp-1')).rejects.toThrow(
        'Campaign can only be activated from DRAFT or PAUSED status',
      );
    });
  });

  describe('pauseCampaign', () => {
    it('pauses an active campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        status: 'ACTIVE',
        deletedAt: null,
      });
      prisma.campaign.update.mockResolvedValue({
        id: 'camp-1',
        status: 'PAUSED',
      });

      const result = await service.pauseCampaign('camp-1');

      expect(result.status).toBe('PAUSED');
    });

    it('throws INVALID_STATUS_TRANSITION for draft campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        status: 'DRAFT',
        deletedAt: null,
      });

      await expect(service.pauseCampaign('camp-1')).rejects.toThrow(
        'Only active campaigns can be paused',
      );
    });
  });

  describe('getCampaignStats', () => {
    it('returns campaign stats with calculated CTR and CPC', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        totalSpend: 500,
        totalImpressions: 10000,
        totalClicks: 200,
        totalConversions: 20,
        deletedAt: null,
      });

      const stats = await service.getCampaignStats('camp-1');

      expect(stats.totalSpend).toBe(500);
      expect(stats.totalImpressions).toBe(10000);
      expect(stats.totalClicks).toBe(200);
      expect(stats.totalConversions).toBe(20);
      expect(stats.ctr).toBeCloseTo(0.02);
      expect(stats.cpc).toBeCloseTo(2.5);
    });

    it('handles zero impressions', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        deletedAt: null,
      });

      const stats = await service.getCampaignStats('camp-1');

      expect(stats.ctr).toBe(0);
      expect(stats.cpc).toBe(0);
    });
  });

  describe('deleteCampaign', () => {
    it('soft-deletes a campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'camp-1',
        deletedAt: null,
      });
      prisma.campaign.update.mockResolvedValue({
        id: 'camp-1',
        deletedAt: expect.any(Date),
      });

      const result = await service.deleteCampaign('camp-1');

      expect(result.deletedAt).toBeDefined();
    });

    it('throws CAMPAIGN_NOT_FOUND for non-existent campaign', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.deleteCampaign('missing')).rejects.toThrow('Campaign not found');
    });
  });

  describe('listCampaigns', () => {
    it('returns paginated campaigns for an advertiser', async () => {
      prisma.campaign.findMany.mockResolvedValue([{ id: 'camp-1' }, { id: 'camp-2' }]);
      prisma.campaign.count.mockResolvedValue(5);

      const result = await service.listCampaigns('adv-1', { page: 1, pageSize: 2 });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.hasNext).toBe(true);
    });
  });
});
