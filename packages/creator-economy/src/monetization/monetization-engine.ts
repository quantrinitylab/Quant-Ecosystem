import { z } from 'zod';
import type { MonetizationEvent, EarningsBreakdown } from '../types.js';

const RecordTipInputSchema = z.object({
  fromUser: z.string().min(1),
  toCreator: z.string().min(1),
  amount: z.number().min(0),
});

const RecordIAPInputSchema = z.object({
  userId: z.string().min(1),
  creatorId: z.string().min(1),
  itemId: z.string().min(1),
  price: z.number().positive(),
});

const RecordAdRevenueInputSchema = z.object({
  creatorId: z.string().min(1),
  adId: z.string().min(1),
  impressions: z.number().nonnegative(),
  cpm: z.number().nonnegative(),
});

const RecordRemixRoyaltyInputSchema = z.object({
  originalCreator: z.string().min(1),
  remixer: z.string().min(1),
  contentId: z.string().min(1),
  amount: z.number().positive(),
});

export class MonetizationEngine {
  private events: MonetizationEvent[] = [];

  recordTip(fromUser: string, toCreator: string, amount: number): MonetizationEvent {
    RecordTipInputSchema.parse({ fromUser, toCreator, amount });
    const event: MonetizationEvent = {
      id: `tip-${crypto.randomUUID()}`,
      type: 'tip',
      amount,
      currency: 'USD',
      creatorId: toCreator,
      sourceId: fromUser,
      timestamp: new Date(),
    };
    this.events.push(event);
    return event;
  }

  recordIAP(userId: string, creatorId: string, itemId: string, price: number): MonetizationEvent {
    RecordIAPInputSchema.parse({ userId, creatorId, itemId, price });
    const platformFee = price * 0.3;
    const creatorAmount = price - platformFee;
    const event: MonetizationEvent = {
      id: `iap-${crypto.randomUUID()}`,
      type: 'iap',
      amount: creatorAmount,
      currency: 'USD',
      creatorId,
      sourceId: `${userId}:${itemId}`,
      timestamp: new Date(),
    };
    this.events.push(event);
    return event;
  }

  recordAdRevenue(
    creatorId: string,
    adId: string,
    impressions: number,
    cpm: number,
  ): MonetizationEvent {
    RecordAdRevenueInputSchema.parse({ creatorId, adId, impressions, cpm });
    const totalRevenue = (impressions / 1000) * cpm;
    const creatorShare = totalRevenue * 0.55;
    const event: MonetizationEvent = {
      id: `ad-${crypto.randomUUID()}`,
      type: 'ad_revenue',
      amount: creatorShare,
      currency: 'USD',
      creatorId,
      sourceId: adId,
      timestamp: new Date(),
    };
    this.events.push(event);
    return event;
  }

  recordRemixRoyalty(
    originalCreator: string,
    remixer: string,
    contentId: string,
    amount: number,
  ): MonetizationEvent {
    RecordRemixRoyaltyInputSchema.parse({ originalCreator, remixer, contentId, amount });
    const event: MonetizationEvent = {
      id: `royalty-${crypto.randomUUID()}`,
      type: 'remix_royalty',
      amount,
      currency: 'USD',
      creatorId: originalCreator,
      sourceId: `${remixer}:${contentId}`,
      timestamp: new Date(),
    };
    this.events.push(event);
    return event;
  }

  getEarnings(creatorId: string, period?: { start: Date; end: Date }): EarningsBreakdown {
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

  getEvents(creatorId: string): MonetizationEvent[] {
    return this.events.filter((e) => e.creatorId === creatorId);
  }
}
