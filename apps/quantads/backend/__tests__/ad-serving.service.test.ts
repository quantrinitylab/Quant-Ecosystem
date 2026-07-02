import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdServingService } from '../services/ad-serving.service';

function createMockPrisma() {
  return {
    ad: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    adSet: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    adCreative: {
      findUnique: vi.fn(),
    },
    campaign: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
}

/** A campaign row with a positive bid + budget, eligible to win the auction. */
function activeCampaign(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'camp-1',
    status: 'ACTIVE',
    deletedAt: null,
    budget: { bidCents: 500, totalCents: 100_000 },
    targeting: {},
    totalSpend: 0,
    ...over,
  };
}

describe('AdServingService', () => {
  let service: AdServingService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AdServingService(prisma as never);
  });

  describe('serveAd (real second-price auction)', () => {
    it('returns null when no active ads exist', async () => {
      prisma.ad.findMany.mockResolvedValue([]);

      const result = await service.serveAd({ userId: 'u1', placement: 'feed' });

      expect(result).toBeNull();
    });

    it('serves the winning campaign creative and charges the second price', async () => {
      prisma.ad.findMany.mockResolvedValue([
        { id: 'ad-1', adSetId: 'as-1', creativeId: 'cr-1', status: 'ACTIVE' },
        { id: 'ad-2', adSetId: 'as-2', creativeId: 'cr-2', status: 'ACTIVE' },
      ]);
      prisma.adSet.findMany.mockResolvedValue([
        { id: 'as-1', campaignId: 'camp-1', status: 'ACTIVE' },
        { id: 'as-2', campaignId: 'camp-2', status: 'ACTIVE' },
      ]);
      prisma.campaign.findMany.mockResolvedValue([
        activeCampaign({ id: 'camp-1', budget: { bidCents: 500, totalCents: 100_000 } }),
        activeCampaign({ id: 'camp-2', budget: { bidCents: 300, totalCents: 100_000 } }),
      ]);
      prisma.adCreative.findUnique.mockResolvedValue({
        id: 'cr-1',
        headline: 'Buy now',
        description: 'Great deal',
        mediaUrl: 'https://cdn/x.png',
        callToAction: 'Shop',
        landingUrl: 'https://shop',
      });

      const result = await service.serveAd({ userId: 'u1', placement: 'feed' });

      expect(result).not.toBeNull();
      // camp-1 has the higher bid (500 > 300) so its ad wins.
      expect(result?.adId).toBe('ad-1');
      expect(result?.headline).toBe('Buy now');
      // Second-price: pays one cent above the next-highest bid (300 + 1).
      expect(result?.clearingPriceCents).toBe(301);
      expect(prisma.adCreative.findUnique).toHaveBeenCalledWith({ where: { id: 'cr-1' } });
    });

    it('excludes an adSet that is not ACTIVE from the auction', async () => {
      prisma.ad.findMany.mockResolvedValue([
        { id: 'ad-1', adSetId: 'as-1', creativeId: 'cr-1', status: 'ACTIVE' },
      ]);
      prisma.adSet.findMany.mockResolvedValue([
        { id: 'as-1', campaignId: 'camp-1', status: 'PAUSED' },
      ]);
      prisma.campaign.findMany.mockResolvedValue([]);

      const result = await service.serveAd({ userId: 'u1', placement: 'feed' });

      expect(result).toBeNull();
    });

    it('excludes a campaign with no positive bid (no-fill, not first-match)', async () => {
      prisma.ad.findMany.mockResolvedValue([
        { id: 'ad-1', adSetId: 'as-1', creativeId: 'cr-1', status: 'ACTIVE' },
      ]);
      prisma.adSet.findMany.mockResolvedValue([
        { id: 'as-1', campaignId: 'camp-1', status: 'ACTIVE' },
      ]);
      // Query already filters status: 'ACTIVE', deletedAt: null -- simulate a
      // campaign that comes back but never bids (bidCents 0).
      prisma.campaign.findMany.mockResolvedValue([
        activeCampaign({ budget: { bidCents: 0, totalCents: 100_000 } }),
      ]);

      const result = await service.serveAd({ userId: 'u1', placement: 'feed' });

      expect(result).toBeNull();
      expect(prisma.adCreative.findUnique).not.toHaveBeenCalled();
    });

    it('returns null when the winning creative is missing', async () => {
      prisma.ad.findMany.mockResolvedValue([
        { id: 'ad-1', adSetId: 'as-1', creativeId: 'cr-x', status: 'ACTIVE' },
      ]);
      prisma.adSet.findMany.mockResolvedValue([
        { id: 'as-1', campaignId: 'camp-1', status: 'ACTIVE' },
      ]);
      prisma.campaign.findMany.mockResolvedValue([activeCampaign()]);
      prisma.adCreative.findUnique.mockResolvedValue(null);

      const result = await service.serveAd({ userId: 'u1', placement: 'feed' });

      expect(result).toBeNull();
    });

    it('respects interest targeting passed via demographics', async () => {
      prisma.ad.findMany.mockResolvedValue([
        { id: 'ad-1', adSetId: 'as-1', creativeId: 'cr-1', status: 'ACTIVE' },
        { id: 'ad-2', adSetId: 'as-2', creativeId: 'cr-2', status: 'ACTIVE' },
      ]);
      prisma.adSet.findMany.mockResolvedValue([
        { id: 'as-1', campaignId: 'camp-1', status: 'ACTIVE' },
        { id: 'as-2', campaignId: 'camp-2', status: 'ACTIVE' },
      ]);
      prisma.campaign.findMany.mockResolvedValue([
        activeCampaign({
          id: 'camp-1',
          budget: { bidCents: 900, totalCents: 100_000 },
          targeting: { interests: ['sports'] },
        }),
        activeCampaign({
          id: 'camp-2',
          budget: { bidCents: 200, totalCents: 100_000 },
          targeting: { interests: ['music'] },
        }),
      ]);
      prisma.adCreative.findUnique.mockResolvedValue({
        id: 'cr-2',
        headline: 'Music fest',
        description: '',
        mediaUrl: 'https://cdn/y.png',
        callToAction: 'Learn More',
        landingUrl: 'https://fest',
      });

      // Viewer is interested in music only -- the higher-bidding sports
      // campaign is ineligible, so the lower bidder wins on targeting match.
      const result = await service.serveAd({
        userId: 'u1',
        placement: 'feed',
        demographics: { interests: ['music'] },
      });

      expect(result?.adId).toBe('ad-2');
    });
  });

  describe('recordImpression', () => {
    it('increments campaign impressions via adSet -> campaign', async () => {
      prisma.ad.findUnique.mockResolvedValue({ id: 'ad-1', adSetId: 'as-1' });
      prisma.adSet.findUnique.mockResolvedValue({ id: 'as-1', campaignId: 'camp-1' });

      await service.recordImpression('ad-1', 'u1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { totalImpressions: { increment: 1 } },
      });
    });

    it('also increments spend by the clearing price so budget genuinely depletes', async () => {
      prisma.ad.findUnique.mockResolvedValue({ id: 'ad-1', adSetId: 'as-1' });
      prisma.adSet.findUnique.mockResolvedValue({ id: 'as-1', campaignId: 'camp-1' });

      await service.recordImpression('ad-1', 'u1', 301);

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { totalImpressions: { increment: 1 }, totalSpend: { increment: 3.01 } },
      });
    });

    it('is a no-op when the ad does not exist', async () => {
      prisma.ad.findUnique.mockResolvedValue(null);

      await service.recordImpression('missing', 'u1');

      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });
  });

  describe('recordClick', () => {
    it('increments campaign clicks via adSet -> campaign', async () => {
      prisma.ad.findUnique.mockResolvedValue({ id: 'ad-1', adSetId: 'as-1' });
      prisma.adSet.findUnique.mockResolvedValue({ id: 'as-1', campaignId: 'camp-1' });

      await service.recordClick('ad-1', 'u1');

      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: 'camp-1' },
        data: { totalClicks: { increment: 1 } },
      });
    });

    it('is a no-op when the adSet is missing', async () => {
      prisma.ad.findUnique.mockResolvedValue({ id: 'ad-1', adSetId: 'as-x' });
      prisma.adSet.findUnique.mockResolvedValue(null);

      await service.recordClick('ad-1', 'u1');

      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });
  });
});
