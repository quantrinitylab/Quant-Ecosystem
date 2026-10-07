// ============================================================================
// Performance Package - Cost Dashboard
// Per-user cost aggregation with tier-based allocation
// ============================================================================

/** Time range for cost queries */
export interface TimeRange {
  startMs: number;
  endMs: number;
}

/** Cost category */
export type CostCategory = 'ai' | 'storage' | 'bandwidth' | 'compute';

/** Cost entry for a user */
export interface CostEntry {
  userId: string;
  category: CostCategory;
  amount: number;
  timestamp: number;
  metadata?: Record<string, string>;
}

/** User cost breakdown */
export interface CostBreakdown {
  userId: string;
  ai: number;
  storage: number;
  bandwidth: number;
  compute: number;
  total: number;
  tier: UserTier;
  budgetUsed: number;
  budgetRemaining: number;
}

/** User tier with cost allocation */
export type UserTier = 'free' | 'pro' | 'enterprise';

/** Tier configuration */
export interface TierConfig {
  tier: UserTier;
  monthlyBudget: number;
  aiMultiplier: number;
  storageIncludedGb: number;
  bandwidthIncludedGb: number;
  computeHoursIncluded: number;
}

/** Aggregated cost result */
export interface AggregatedCost {
  userId: string;
  timeRange: TimeRange;
  totalCost: number;
  dailyAverage: number;
  projectedMonthly: number;
  breakdown: CostBreakdown;
}

/**
 * CostDashboard aggregates per-user cost data across AI, storage,
 * bandwidth, and compute. Supports tier-based cost allocation.
 */
export class CostDashboard {
  private readonly entries: CostEntry[];
  private readonly tiers: Map<UserTier, TierConfig>;
  private readonly userTiers: Map<string, UserTier>;
  private readonly maxEntries: number;

  constructor(config: { maxEntries?: number } = {}) {
    this.entries = [];
    this.tiers = new Map();
    this.userTiers = new Map();
    this.maxEntries = config.maxEntries ?? 100000;

    this.registerDefaultTiers();
  }

  /**
   * Record a cost entry for a user.
   */
  recordCost(entry: CostEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  /**
   * Compute aggregated cost for a user within a time range.
   */
  computeCost(userId: string, timeRange: TimeRange): AggregatedCost {
    const userEntries = this.entries.filter(
      (e) =>
        e.userId === userId && e.timestamp >= timeRange.startMs && e.timestamp <= timeRange.endMs,
    );

    const breakdown = this.buildBreakdown(userId, userEntries);
    const durationDays = (timeRange.endMs - timeRange.startMs) / (1000 * 60 * 60 * 24);
    const dailyAverage = durationDays > 0 ? breakdown.total / durationDays : 0;
    const projectedMonthly = dailyAverage * 30;

    return {
      userId,
      timeRange,
      totalCost: breakdown.total,
      dailyAverage,
      projectedMonthly,
      breakdown,
    };
  }

  /**
   * Get cost breakdown for a user (all recorded entries).
   */
  getBreakdown(userId: string): CostBreakdown {
    const userEntries = this.entries.filter((e) => e.userId === userId);
    return this.buildBreakdown(userId, userEntries);
  }

  /**
   * Set the tier for a user.
   */
  setUserTier(userId: string, tier: UserTier): void {
    this.userTiers.set(userId, tier);
  }

  /**
   * Get the tier for a user (defaults to 'free').
   */
  getUserTier(userId: string): UserTier {
    return this.userTiers.get(userId) ?? 'free';
  }

  /**
   * Configure a tier's cost allocation.
   */
  configureTier(config: TierConfig): void {
    this.tiers.set(config.tier, config);
  }

  /**
   * Get top users by cost.
   */
  getTopUsers(limit: number = 10): Array<{ userId: string; totalCost: number }> {
    const userCosts = new Map<string, number>();

    for (const entry of this.entries) {
      const current = userCosts.get(entry.userId) ?? 0;
      userCosts.set(entry.userId, current + entry.amount);
    }

    return [...userCosts.entries()]
      .map(([userId, totalCost]) => ({ userId, totalCost }))
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, limit);
  }

  /**
   * Get total entries count.
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  // ===========================================================================
  // Private methods
  // ===========================================================================

  /** Build a cost breakdown from entries */
  private buildBreakdown(userId: string, userEntries: CostEntry[]): CostBreakdown {
    const tier = this.getUserTier(userId);
    const tierConfig = this.tiers.get(tier)!;

    let ai = 0;
    let storage = 0;
    let bandwidth = 0;
    let compute = 0;

    for (const entry of userEntries) {
      switch (entry.category) {
        case 'ai':
          ai += entry.amount * tierConfig.aiMultiplier;
          break;
        case 'storage':
          storage += entry.amount;
          break;
        case 'bandwidth':
          bandwidth += entry.amount;
          break;
        case 'compute':
          compute += entry.amount;
          break;
      }
    }

    const total = ai + storage + bandwidth + compute;
    const budgetUsed = tierConfig.monthlyBudget > 0 ? total / tierConfig.monthlyBudget : 0;
    const budgetRemaining = Math.max(0, tierConfig.monthlyBudget - total);

    return {
      userId,
      ai,
      storage,
      bandwidth,
      compute,
      total,
      tier,
      budgetUsed,
      budgetRemaining,
    };
  }

  /** Register default tier configurations */
  private registerDefaultTiers(): void {
    this.tiers.set('free', {
      tier: 'free',
      monthlyBudget: 10,
      aiMultiplier: 1.0,
      storageIncludedGb: 5,
      bandwidthIncludedGb: 10,
      computeHoursIncluded: 10,
    });

    this.tiers.set('pro', {
      tier: 'pro',
      monthlyBudget: 100,
      aiMultiplier: 0.8,
      storageIncludedGb: 100,
      bandwidthIncludedGb: 500,
      computeHoursIncluded: 100,
    });

    this.tiers.set('enterprise', {
      tier: 'enterprise',
      monthlyBudget: 10000,
      aiMultiplier: 0.5,
      storageIncludedGb: 10000,
      bandwidthIncludedGb: 50000,
      computeHoursIncluded: 10000,
    });
  }
}
