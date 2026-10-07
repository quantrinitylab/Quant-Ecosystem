import { z } from 'zod';
import type { CreatorEarningEvent } from './types.js';

export const CreatorEarningEventSchema = z.object({
  creatorId: z.string().min(1),
  userId: z.string().min(1),
  modelUsage: z.string().min(1),
  appId: z.string().min(1),
  earningAmount: z.number().positive(),
  platformFee: z.number().min(0),
  timestamp: z.number().positive(),
});

export interface EarningsSummary {
  creatorId: string;
  totalEarnings: number;
  totalPlatformFees: number;
  eventCount: number;
  periodStart: number;
  periodEnd: number;
}

export interface EarningShare {
  creatorAmount: number;
  platformAmount: number;
}

export class CreatorEarningService {
  private readonly events: CreatorEarningEvent[] = [];
  private static readonly DEFAULT_CREATOR_SHARE = 0.7;

  recordUsage(event: CreatorEarningEvent): void {
    CreatorEarningEventSchema.parse(event);
    this.events.push(event);
  }

  getCreatorEarnings(creatorId: string, period?: { start: number; end: number }): EarningsSummary {
    let filtered = this.events.filter((e) => e.creatorId === creatorId);

    const periodStart = period?.start ?? 0;
    const periodEnd = period?.end ?? Date.now();

    if (period) {
      filtered = filtered.filter((e) => e.timestamp >= period.start && e.timestamp <= period.end);
    }

    const totalEarnings = filtered.reduce((sum, e) => sum + e.earningAmount, 0);
    const totalPlatformFees = filtered.reduce((sum, e) => sum + e.platformFee, 0);

    return {
      creatorId,
      totalEarnings,
      totalPlatformFees,
      eventCount: filtered.length,
      periodStart,
      periodEnd,
    };
  }

  getPlatformRevenue(period?: { start: number; end: number }): number {
    let filtered = this.events;

    if (period) {
      filtered = filtered.filter((e) => e.timestamp >= period.start && e.timestamp <= period.end);
    }

    return filtered.reduce((sum, e) => sum + e.platformFee, 0);
  }

  calculateEarningShare(
    totalCost: number,
    creatorSharePercent: number = CreatorEarningService.DEFAULT_CREATOR_SHARE,
  ): EarningShare {
    const creatorAmount = totalCost * creatorSharePercent;
    const platformAmount = totalCost - creatorAmount;

    return {
      creatorAmount: Math.round(creatorAmount * 100) / 100,
      platformAmount: Math.round(platformAmount * 100) / 100,
    };
  }
}
