import type { PrismaClient } from '../types';

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
}

export class AdServingService {
  constructor(private readonly prisma: PrismaClient) {}

  async serveAd(_context: AdContext): Promise<ServedAd | null> {
    // Find active ads matching placement
    const ads = await this.prisma.ad.findMany({
      where: {
        status: 'ACTIVE',
      },
      take: 10,
    });

    if (ads.length === 0) {
      return null;
    }

    // Select the first matching ad (in production this would use targeting logic)
    const selectedAd = ads[0]!;

    const creative = await this.prisma.adCreative.findUnique({
      where: { id: selectedAd.creativeId },
    });

    if (!creative) {
      return null;
    }

    return {
      adId: selectedAd.id,
      creativeId: creative.id,
      headline: creative.headline,
      description: creative.description ?? '',
      mediaUrl: creative.mediaUrl,
      callToAction: creative.callToAction ?? 'Learn More',
      landingUrl: creative.landingUrl,
    };
  }

  async recordImpression(adId: string, _userId: string): Promise<void> {
    const ad = await this.prisma.ad.findUnique({
      where: { id: adId },
    });

    if (!ad) return;

    // Find the campaign through adSet and increment impressions
    const adSet = await this.prisma.adSet.findUnique({
      where: { id: ad.adSetId },
    });

    if (adSet) {
      await this.prisma.campaign.update({
        where: { id: adSet.campaignId },
        data: { totalImpressions: { increment: 1 } },
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
