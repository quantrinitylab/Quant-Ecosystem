import type { DashboardOverview, EarningsBreakdown, MonetizationEvent } from '../types.js';

interface ContentStats {
  contentId: string;
  earnings: number;
  views: number;
}

interface AudienceStats {
  totalFollowers: number;
  activeViewers: number;
  topRegions: string[];
  growthRate: number;
}

export class CreatorDashboardService {
  private events: MonetizationEvent[] = [];
  private contentStats = new Map<string, ContentStats>();

  getOverview(creatorId: string): DashboardOverview {
    const creatorEvents = this.events.filter((e) => e.creatorId === creatorId);
    const totalEarnings = creatorEvents.reduce((sum, e) => sum + e.amount, 0);

    return {
      creatorId,
      tier: 'free',
      totalEarnings,
      availableBalance: totalEarnings * 0.8,
      pendingPayouts: totalEarnings * 0.2,
      activePartnerships: 0,
    };
  }

  getEarningsBreakdown(creatorId: string, period?: { start: Date; end: Date }): EarningsBreakdown {
    let filtered = this.events.filter((e) => e.creatorId === creatorId);
    if (period) {
      filtered = filtered.filter((e) => e.timestamp >= period.start && e.timestamp <= period.end);
    }

    const breakdown: EarningsBreakdown = {
      tips: 0,
      iap: 0,
      adRevenue: 0,
      subscriptions: 0,
      remixRoyalties: 0,
      total: 0,
    };

    for (const event of filtered) {
      switch (event.type) {
        case 'tip':
          breakdown.tips += event.amount;
          break;
        case 'iap':
          breakdown.iap += event.amount;
          break;
        case 'ad_revenue':
          breakdown.adRevenue += event.amount;
          break;
        case 'subscription':
          breakdown.subscriptions += event.amount;
          break;
        case 'remix_royalty':
          breakdown.remixRoyalties += event.amount;
          break;
      }
    }

    breakdown.total =
      breakdown.tips +
      breakdown.iap +
      breakdown.adRevenue +
      breakdown.subscriptions +
      breakdown.remixRoyalties;

    return breakdown;
  }

  getTopContent(creatorId: string, limit: number): ContentStats[] {
    const stats = Array.from(this.contentStats.values())
      .filter((s) => s.contentId.startsWith(creatorId))
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, limit);
    return stats;
  }

  getAudienceStats(_creatorId: string): AudienceStats {
    return {
      totalFollowers: 0,
      activeViewers: 0,
      topRegions: [],
      growthRate: 0,
    };
  }

  getPayoutHistory(_creatorId: string): { amount: number; date: Date; status: string }[] {
    return [];
  }

  addEvent(event: MonetizationEvent): void {
    this.events.push(event);
  }
}
