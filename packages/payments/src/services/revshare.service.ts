// ============================================================================
// Payments - Revenue Share Engine (Creator Economy)
// 90/10 ad revenue split, 95/5 tip split with immutable ledger
// ============================================================================

import { z } from 'zod';
import type { RevShareEntry, RevShareType } from '../types';

export const RecordAdRevenueSchema = z.object({
  creatorId: z.string().min(1),
  adImpressionId: z.string().min(1),
  grossAmount: z.number().positive(),
});

export const RecordTipSchema = z.object({
  creatorId: z.string().min(1),
  tipId: z.string().min(1),
  grossAmount: z.number().positive(),
});

/** Revenue share split ratios */
const AD_REVENUE_CREATOR_SHARE = 0.9;
const TIP_CREATOR_SHARE = 0.95;

/**
 * RevShareService - Creator economy revenue share engine
 *
 * Implements immutable ledger entries for revenue sharing with
 * 90/10 split on ad revenue and 95/5 split on tips.
 * Entries are append-only and cannot be modified or deleted.
 */
export class RevShareService {
  private readonly entries: RevShareEntry[] = [];

  /**
   * Record ad revenue with 90/10 creator/platform split
   */
  recordAdRevenue(params: {
    creatorId: string;
    adImpressionId: string;
    grossAmount: number;
  }): RevShareEntry {
    const validated = RecordAdRevenueSchema.parse(params);

    const creatorShare = Math.round(validated.grossAmount * AD_REVENUE_CREATOR_SHARE * 100) / 100;
    const platformShare = Math.round((validated.grossAmount - creatorShare) * 100) / 100;

    const entry: RevShareEntry = {
      id: `rs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'ad_revenue',
      creatorId: validated.creatorId,
      grossAmount: validated.grossAmount,
      creatorShare,
      platformShare,
      referenceId: validated.adImpressionId,
      createdAt: Date.now(),
    };

    this.entries.push(Object.freeze(entry) as RevShareEntry);
    return entry;
  }

  /**
   * Record tip revenue with 95/5 creator/platform split
   */
  recordTip(params: { creatorId: string; tipId: string; grossAmount: number }): RevShareEntry {
    const validated = RecordTipSchema.parse(params);

    const creatorShare = Math.round(validated.grossAmount * TIP_CREATOR_SHARE * 100) / 100;
    const platformShare = Math.round((validated.grossAmount - creatorShare) * 100) / 100;

    const entry: RevShareEntry = {
      id: `rs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'tip',
      creatorId: validated.creatorId,
      grossAmount: validated.grossAmount,
      creatorShare,
      platformShare,
      referenceId: validated.tipId,
      createdAt: Date.now(),
    };

    this.entries.push(Object.freeze(entry) as RevShareEntry);
    return entry;
  }

  /**
   * Get total creator balance (sum of creator shares)
   */
  getCreatorBalance(creatorId: string): number {
    return this.entries
      .filter((e) => e.creatorId === creatorId)
      .reduce((sum, e) => sum + e.creatorShare, 0);
  }

  /**
   * Get total platform balance (sum of all platform shares)
   */
  getPlatformBalance(): number {
    return this.entries.reduce((sum, e) => sum + e.platformShare, 0);
  }

  /**
   * Get ledger entries for a creator with optional filters
   */
  getLedgerEntries(
    creatorId: string,
    filters?: {
      type?: RevShareType;
      startDate?: number;
      endDate?: number;
    },
  ): RevShareEntry[] {
    let results = this.entries.filter((e) => e.creatorId === creatorId);

    if (filters?.type) {
      results = results.filter((e) => e.type === filters.type);
    }
    if (filters?.startDate) {
      results = results.filter((e) => e.createdAt >= filters.startDate!);
    }
    if (filters?.endDate) {
      results = results.filter((e) => e.createdAt <= filters.endDate!);
    }

    return results;
  }
}
