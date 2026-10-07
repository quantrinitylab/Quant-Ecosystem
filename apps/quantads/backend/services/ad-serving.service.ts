import type { PrismaClient } from '../types';
import { AdAuctionService, type AdCandidate } from './ad-auction.service';

export interface AdContext {
  userId: string;
  placement: string;
  demographics?: Record<string, unknown>;
}

export interface ServedAd {
  adId: string;
  creativeId: string;
  headline: string;
  description: string;
  mediaUrl: string;
  callToAction: string;
  landingUrl: string;
  /** The price (cents) the winning campaign is charged for this impression. */
  clearingPriceCents: number;
}

/**
 * Bounded pool sizes for the auction candidate lookup. Keeps the request path
 * O(1) round-trips instead of N+1 per ad; real-world inventory should be
 * pre-filtered by placement/targeting at the query layer as it scales.
 */
const MAX_CANDIDATE_ADS = 500;

export class AdServingService {
  private readonly auction = new AdAuctionService();

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Serve an ad for the given context by running a REAL second-price auction
   * over eligible campaigns (active ad -> active adSet -> active, non-deleted
   * campaign), then returning the winning creative. Previously this returned
   * the first active `Ad` row unconditionally, bypassing bidding/targeting/
   * budget eligibility entirely -- no advertiser ever competed for the slot.
   */
  async serveAd(context: AdContext): Promise<ServedAd | null> {
    // 1) Pull the bounded pool of currently-active ad inventory.
    const activeAds = await this.prisma.ad.findMany({
      where: { status: 'ACTIVE' },
      take: MAX_CANDIDATE_ADS,
    });
    if (activeAds.length === 0) {
      return null;
    }

    // 2) Resolve each ad's parent adSet (must be ACTIVE) and campaign (must be
    //    ACTIVE, not deleted) -- batched, not N+1.
    const adSetIds = [...new Set(activeAds.map((a) => a.adSetId))];
    const adSets = await this.prisma.adSet.findMany({ where: { id: { in: adSetIds } } });
    const adSetById = new Map(adSets.map((s) => [s.id, s]));

    const campaignIds = [...new Set(adSets.map((s) => s.campaignId))];
    const campaigns = await this.prisma.campaign.findMany({
      where: { id: { in: campaignIds }, status: 'ACTIVE', deletedAt: null },
    });
    const campaignById = new Map(campaigns.map((c) => [c.id, c]));

    // 3) One candidate per campaign (its first eligible active ad supplies the
    //    creative to serve if that campaign wins the auction).
    const winnerAdByCampaign = new Map<string, (typeof activeAds)[number]>();
    const campaignRows: Record<string, unknown>[] = [];
    for (const ad of activeAds) {
      const adSet = adSetById.get(ad.adSetId);
      if (!adSet || adSet.status !== 'ACTIVE') continue;
      const campaign = campaignById.get(adSet.campaignId);
      if (!campaign) continue;
      if (winnerAdByCampaign.has(campaign.id)) continue;
      winnerAdByCampaign.set(campaign.id, ad);
      campaignRows.push({ ...campaign, defaultCreativeId: ad.creativeId });
    }
    if (campaignRows.length === 0) {
      return null;
    }

    // 4) Run the real second-price (Vickrey) auction over eligible candidates.
    const candidates: AdCandidate[] = this.auction.campaignsToCandidates(campaignRows);
    const { interests, geo } = extractTargetingContext(context.demographics);
    const result = this.auction.runAuction(
      { placementId: context.placement, context: { interests, geo } },
      candidates,
    );
    if (!result.filled) {
      return null;
    }

    // 5) Serve the winning campaign's creative.
    const winningAd = winnerAdByCampaign.get(result.campaignId);
    if (!winningAd) {
      return null;
    }
    const creative = await this.prisma.adCreative.findUnique({
      where: { id: winningAd.creativeId },
    });
    if (!creative) {
      return null;
    }

    return {
      adId: winningAd.id,
      creativeId: creative.id,
      headline: creative.headline,
      description: creative.description ?? '',
      mediaUrl: creative.mediaUrl,
      callToAction: creative.callToAction ?? 'Learn More',
      landingUrl: creative.landingUrl,
      clearingPriceCents: result.clearingPriceCents,
    };
  }

  /**
   * Record a served impression, incrementing the campaign's impression count
   * and -- when the auction's clearing price is supplied -- its spend, so the
   * campaign's remaining budget genuinely depletes (the auction's eligibility
   * check reads `totalSpend`, so without this a campaign could never exhaust
   * its budget no matter how many impressions it won).
   */
  async recordImpression(
    adId: string,
    _userId: string,
    clearingPriceCents?: number,
  ): Promise<void> {
    const ad = await this.prisma.ad.findUnique({
      where: { id: adId },
    });

    if (!ad) return;

    // Find the campaign through adSet and increment impressions
    const adSet = await this.prisma.adSet.findUnique({
      where: { id: ad.adSetId },
    });

    if (adSet) {
      const spendDollars =
        typeof clearingPriceCents === 'number' && clearingPriceCents > 0
          ? clearingPriceCents / 100
          : 0;
      await this.prisma.campaign.update({
        where: { id: adSet.campaignId },
        data: {
          totalImpressions: { increment: 1 },
          ...(spendDollars > 0 ? { totalSpend: { increment: spendDollars } } : {}),
        },
      });
    }
  }

  async recordClick(adId: string, _userId: string): Promise<void> {
    const ad = await this.prisma.ad.findUnique({
      where: { id: adId },
    });

    if (!ad) return;

    const adSet = await this.prisma.adSet.findUnique({
      where: { id: ad.adSetId },
    });

    if (adSet) {
      await this.prisma.campaign.update({
        where: { id: adSet.campaignId },
        data: { totalClicks: { increment: 1 } },
      });
    }
  }
}

/** Best-effort extraction of interest/geo targeting signals from the caller's demographics. */
function extractTargetingContext(demographics: Record<string, unknown> | undefined): {
  interests?: string[];
  geo?: string;
} {
  if (!demographics) return {};
  const interestsRaw = demographics['interests'];
  const interests = Array.isArray(interestsRaw)
    ? interestsRaw.filter((i): i is string => typeof i === 'string')
    : undefined;
  const geoRaw = demographics['geo'];
  const geo = typeof geoRaw === 'string' ? geoRaw : undefined;
  return { ...(interests ? { interests } : {}), ...(geo ? { geo } : {}) };
}
