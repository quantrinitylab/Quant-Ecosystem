// ============================================================================
// Payments - Revenue Sharing Service
// Creator revenue splits with minimum payout thresholds
// ============================================================================

import type { RevenueShare, Payout, CurrencyCode } from '../types';

interface RevenueShareConfig {
  defaultPlatformShare: number;
  defaultCreatorShare: number;
  minimumPayout: number;
  payoutSchedule: 'weekly' | 'biweekly' | 'monthly';
  holdPeriodDays: number;
  defaultCurrency: CurrencyCode;
}

const DEFAULT_CONFIG: RevenueShareConfig = {
  defaultPlatformShare: 30,
  defaultCreatorShare: 70,
  minimumPayout: 50,
  payoutSchedule: 'monthly',
  holdPeriodDays: 14,
  defaultCurrency: 'USD',
};

interface EarningRecord {
  id: string;
  creatorId: string;
  amount: number;
  platformFee: number;
  creatorEarning: number;
  source: string;
  sourceId: string;
  createdAt: number;
}

/**
 * RevenueSharing - Manages creator earnings and platform revenue splits
 *
 * Handles share ratio configuration, payout calculations, processing,
 * hold management, and reporting for content creator monetization.
 */
export class RevenueSharing {
  private config: RevenueShareConfig;
  private shares: Map<string, RevenueShare>;
  private earnings: Map<string, EarningRecord[]>;
  private payouts: Map<string, Payout[]>;
  private heldPayouts: Map<string, { payoutId: string; reason: string; heldAt: number }[]>;

  constructor(config: Partial<RevenueShareConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.shares = new Map();
    this.earnings = new Map();
    this.payouts = new Map();
    this.heldPayouts = new Map();
  }

  /** Set up revenue sharing for a creator */
  async setShareRatio(
    creatorId: string,
    options?: {
      platformSharePercent?: number;
      creatorSharePercent?: number;
      minimumPayout?: number;
      payoutSchedule?: 'weekly' | 'biweekly' | 'monthly';
    },
  ): Promise<RevenueShare> {
    const platformShare = options?.platformSharePercent ?? this.config.defaultPlatformShare;
    const creatorShare = options?.creatorSharePercent ?? this.config.defaultCreatorShare;

    if (platformShare + creatorShare !== 100) {
      throw new Error('Platform and creator shares must sum to 100%');
    }
    if (platformShare < 0 || creatorShare < 0) {
      throw new Error('Share percentages must be non-negative');
    }

    const existing = this.shares.get(creatorId);
    if (existing) {
      existing.platformSharePercent = platformShare;
      existing.creatorSharePercent = creatorShare;
      if (options?.minimumPayout !== undefined) existing.minimumPayout = options.minimumPayout;
      if (options?.payoutSchedule) existing.payoutSchedule = options.payoutSchedule;
      return existing;
    }

    const share: RevenueShare = {
      id: `rs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      creatorId,
      platformSharePercent: platformShare,
      creatorSharePercent: creatorShare,
      minimumPayout: options?.minimumPayout ?? this.config.minimumPayout,
      payoutSchedule: options?.payoutSchedule ?? this.config.payoutSchedule,
      currency: this.config.defaultCurrency,
      totalEarned: 0,
      totalPaid: 0,
      pendingPayout: 0,
      heldAmount: 0,
      active: true,
      createdAt: Date.now(),
    };

    this.shares.set(creatorId, share);
    this.earnings.set(creatorId, []);
    this.payouts.set(creatorId, []);
    this.heldPayouts.set(creatorId, []);
    return share;
  }

  /** Record revenue and calculate split */
  async recordRevenue(
    creatorId: string,
    amount: number,
    source: string,
    sourceId: string,
  ): Promise<EarningRecord> {
    const share = this.getShareOrThrow(creatorId);
    if (!share.active) throw new Error('Revenue sharing is not active for this creator');
    if (amount <= 0) throw new Error('Revenue amount must be positive');

    const platformFee = Math.round(amount * (share.platformSharePercent / 100) * 100) / 100;
    const creatorEarning = Math.round((amount - platformFee) * 100) / 100;

    const record: EarningRecord = {
      id: `earn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      creatorId,
      amount,
      platformFee,
      creatorEarning,
      source,
      sourceId,
      createdAt: Date.now(),
    };

    const creatorEarnings = this.earnings.get(creatorId) || [];
    creatorEarnings.push(record);
    this.earnings.set(creatorId, creatorEarnings);

    share.totalEarned += creatorEarning;
    share.pendingPayout += creatorEarning;

    return record;
  }

  /** Calculate payout amount for a creator */
  async calculatePayout(
    creatorId: string,
  ): Promise<{ eligible: boolean; amount: number; minimumPayout: number; pendingAmount: number }> {
    const share = this.getShareOrThrow(creatorId);
    const available = share.pendingPayout - share.heldAmount;
    const eligible = available >= share.minimumPayout;

    return {
      eligible,
      amount: eligible ? available : 0,
      minimumPayout: share.minimumPayout,
      pendingAmount: share.pendingPayout,
    };
  }

  /** Process payouts for all eligible creators */
  async processPayouts(): Promise<{ processed: Payout[]; skipped: string[] }> {
    const processed: Payout[] = [];
    const skipped: string[] = [];

    for (const [creatorId, share] of this.shares) {
      if (!share.active) {
        skipped.push(creatorId);
        continue;
      }

      const available = share.pendingPayout - share.heldAmount;
      if (available < share.minimumPayout) {
        skipped.push(creatorId);
        continue;
      }

      const payout: Payout = {
        id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        creatorId,
        amount: available,
        currency: share.currency,
        status: 'processing',
        paymentMethodId: '',
        period: { start: Date.now() - 2592000000, end: Date.now() },
        itemCount: (this.earnings.get(creatorId) || []).length,
        createdAt: Date.now(),
      };

      // Simulate processing
      payout.status = 'completed';
      payout.processedAt = Date.now();

      share.pendingPayout -= available;
      share.totalPaid += available;

      const creatorPayouts = this.payouts.get(creatorId) || [];
      creatorPayouts.push(payout);
      this.payouts.set(creatorId, creatorPayouts);
      processed.push(payout);
    }

    return { processed, skipped };
  }

  /** Get creator earnings breakdown */
  async getCreatorEarnings(
    creatorId: string,
    options?: { startDate?: number; endDate?: number; source?: string },
  ): Promise<{
    totalEarned: number;
    totalPaid: number;
    pending: number;
    held: number;
    records: EarningRecord[];
  }> {
    const share = this.getShareOrThrow(creatorId);
    let records = this.earnings.get(creatorId) || [];

    if (options?.startDate) records = records.filter((r) => r.createdAt >= options.startDate!);
    if (options?.endDate) records = records.filter((r) => r.createdAt <= options.endDate!);
    if (options?.source) records = records.filter((r) => r.source === options.source);

    return {
      totalEarned: share.totalEarned,
      totalPaid: share.totalPaid,
      pending: share.pendingPayout,
      held: share.heldAmount,
      records,
    };
  }

  /** Get payout history for a creator */
  async getPayoutHistory(creatorId: string, limit: number = 50): Promise<Payout[]> {
    this.getShareOrThrow(creatorId);
    const payouts = this.payouts.get(creatorId) || [];
    return payouts.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  /** Hold a payout (e.g., for compliance review) */
  async holdPayout(creatorId: string, amount: number, reason: string): Promise<void> {
    const share = this.getShareOrThrow(creatorId);
    if (amount > share.pendingPayout) {
      throw new Error('Hold amount exceeds pending payout');
    }
    share.heldAmount += amount;

    const holds = this.heldPayouts.get(creatorId) || [];
    holds.push({
      payoutId: `hold_${Date.now()}`,
      reason,
      heldAt: Date.now(),
    });
    this.heldPayouts.set(creatorId, holds);
  }

  /** Release a held payout */
  async releasePayout(creatorId: string, amount: number): Promise<void> {
    const share = this.getShareOrThrow(creatorId);
    if (amount > share.heldAmount) {
      throw new Error('Release amount exceeds held amount');
    }
    share.heldAmount -= amount;
  }

  /** Generate revenue report for a period */
  async generateReport(
    startDate: number,
    endDate: number,
  ): Promise<{
    totalRevenue: number;
    platformEarnings: number;
    creatorEarnings: number;
    totalPayouts: number;
    creatorCount: number;
    topCreators: { creatorId: string; earned: number }[];
    bySource: Record<string, number>;
  }> {
    let totalRevenue = 0;
    let platformEarnings = 0;
    let creatorEarnings = 0;
    let totalPayouts = 0;
    const creatorTotals: Map<string, number> = new Map();
    const bySource: Record<string, number> = {};

    for (const [creatorId, records] of this.earnings) {
      for (const record of records) {
        if (record.createdAt >= startDate && record.createdAt <= endDate) {
          totalRevenue += record.amount;
          platformEarnings += record.platformFee;
          creatorEarnings += record.creatorEarning;
          creatorTotals.set(creatorId, (creatorTotals.get(creatorId) || 0) + record.creatorEarning);
          bySource[record.source] = (bySource[record.source] || 0) + record.amount;
        }
      }
    }

    for (const [, payouts] of this.payouts) {
      for (const payout of payouts) {
        if (
          payout.processedAt &&
          payout.processedAt >= startDate &&
          payout.processedAt <= endDate
        ) {
          totalPayouts += payout.amount;
        }
      }
    }

    const topCreators = Array.from(creatorTotals.entries())
      .map(([creatorId, earned]) => ({ creatorId, earned }))
      .sort((a, b) => b.earned - a.earned)
      .slice(0, 10);

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      platformEarnings: Math.round(platformEarnings * 100) / 100,
      creatorEarnings: Math.round(creatorEarnings * 100) / 100,
      totalPayouts: Math.round(totalPayouts * 100) / 100,
      creatorCount: creatorTotals.size,
      topCreators,
      bySource,
    };
  }

  // --- Private Helpers ---

  private getShareOrThrow(creatorId: string): RevenueShare {
    const share = this.shares.get(creatorId);
    if (!share) throw new Error(`Revenue sharing not configured for creator: ${creatorId}`);
    return share;
  }
}
