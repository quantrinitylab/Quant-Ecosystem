// ============================================================================
// Recommendations Package - Trending Detection
// ============================================================================

import type { TrendingItem, VelocityScore } from '../types';

/** Time-windowed interaction data */
interface WindowedInteraction {
  itemId: string;
  timestamp: number;
  weight: number;
  type: string;
}

/** Detects trending items using velocity, acceleration, and viral coefficients */
export class TrendingDetector {
  private interactions: WindowedInteraction[];
  private itemVelocities: Map<string, number[]>;
  private itemCategories: Map<string, string>;
  private shareChains: Map<string, Map<string, number>>;
  private decayRate: number;
  private windowSizes: number[];
  private maxInteractions: number;

  constructor() {
    this.interactions = [];
    this.itemVelocities = new Map();
    this.itemCategories = new Map();
    this.shareChains = new Map();
    this.decayRate = 0.1;
    this.windowSizes = [
      1 * 60 * 60 * 1000, // 1 hour
      6 * 60 * 60 * 1000, // 6 hours
      24 * 60 * 60 * 1000, // 24 hours
      7 * 24 * 60 * 60 * 1000, // 7 days
    ];
    this.maxInteractions = 100000;
  }

  /** Register item category */
  registerItem(itemId: string, category: string): void {
    this.itemCategories.set(itemId, category);
  }

  /** Record an interaction */
  recordInteraction(
    itemId: string,
    timestamp: number,
    type: string = 'view',
    weight: number = 1,
  ): void {
    this.interactions.push({ itemId, timestamp, weight, type });

    // Maintain max size
    if (this.interactions.length > this.maxInteractions) {
      this.interactions = this.interactions.slice(-this.maxInteractions);
    }

    // Update velocity tracking
    if (!this.itemVelocities.has(itemId)) {
      this.itemVelocities.set(itemId, []);
    }
    this.itemVelocities.get(itemId)!.push(timestamp);
  }

  /** Record a share event (for viral coefficient) */
  recordShare(itemId: string, sharerId: string, timestamp: number): void {
    this.recordInteraction(itemId, timestamp, 'share', 3);

    if (!this.shareChains.has(itemId)) {
      this.shareChains.set(itemId, new Map());
    }
    const chain = this.shareChains.get(itemId)!;
    chain.set(sharerId, (chain.get(sharerId) || 0) + 1);
  }

  /** Compute velocity score for an item in a given time window */
  computeVelocity(itemId: string, windowMs: number): VelocityScore {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Count interactions in current window
    let currentCount = 0;
    let weightedCount = 0;

    for (const interaction of this.interactions) {
      if (interaction.itemId !== itemId) continue;
      if (interaction.timestamp < windowStart) continue;

      // Apply exponential decay within window
      const age = (now - interaction.timestamp) / windowMs;
      const decay = Math.exp(-this.decayRate * age);
      currentCount++;
      weightedCount += interaction.weight * decay;
    }

    // Compute velocity (interactions per time unit)
    const velocity = windowMs > 0 ? weightedCount / (windowMs / (60 * 60 * 1000)) : 0;

    // Compute acceleration (change in velocity)
    const prevWindowStart = windowStart - windowMs;
    let prevCount = 0;
    for (const interaction of this.interactions) {
      if (interaction.itemId !== itemId) continue;
      if (interaction.timestamp < prevWindowStart || interaction.timestamp >= windowStart) continue;
      prevCount += interaction.weight;
    }
    const prevVelocity = windowMs > 0 ? prevCount / (windowMs / (60 * 60 * 1000)) : 0;
    const acceleration = velocity - prevVelocity;

    // Detect breakout (sudden spike)
    const isBreakout = acceleration > velocity * 0.5 && currentCount > 10;

    return {
      itemId,
      interactions: currentCount,
      timeWindow: windowMs,
      velocity,
      acceleration,
      isBreakout,
    };
  }

  /** Compute viral coefficient for an item */
  computeViralCoefficient(itemId: string): number {
    const chain = this.shareChains.get(itemId);
    if (!chain || chain.size === 0) return 0;

    // Viral coefficient = shares / unique viewers
    const totalShares = Array.from(chain.values()).reduce((s, v) => s + v, 0);
    const uniqueSharers = chain.size;

    // How many new views each share generates (simplified)
    const viewCount = this.interactions.filter(
      (i) => i.itemId === itemId && i.type === 'view',
    ).length;
    if (viewCount === 0) return 0;

    // K = (invites per user) * (conversion rate)
    const invitesPerUser = totalShares / uniqueSharers;
    const conversionRate = viewCount > totalShares ? totalShares / viewCount : 1;

    return invitesPerUser * conversionRate;
  }

  /** Detect breakout items (sudden spike vs gradual growth) */
  detectBreakouts(windowMs: number, threshold: number = 2): string[] {
    const breakouts: string[] = [];
    const itemIds = new Set(this.interactions.map((i) => i.itemId));

    for (const itemId of itemIds) {
      const velocityScore = this.computeVelocity(itemId, windowMs);
      // Breakout: acceleration is significantly higher than baseline
      if (velocityScore.isBreakout && velocityScore.acceleration > threshold) {
        breakouts.push(itemId);
      }
    }

    return breakouts;
  }

  /** Get category-relative trending (trending within a category) */
  getCategoryTrending(category: string, windowMs: number, topN: number = 10): TrendingItem[] {
    const categoryItems: string[] = [];
    for (const [itemId, cat] of this.itemCategories) {
      if (cat === category) categoryItems.push(itemId);
    }

    const trending: TrendingItem[] = [];
    for (const itemId of categoryItems) {
      const velocity = this.computeVelocity(itemId, windowMs);
      if (velocity.velocity > 0) {
        trending.push({
          itemId,
          velocity: velocity.velocity,
          acceleration: velocity.acceleration,
          viralCoefficient: this.computeViralCoefficient(itemId),
          category,
          window: this.formatWindow(windowMs),
        });
      }
    }

    trending.sort((a, b) => b.velocity - a.velocity);
    return trending.slice(0, topN);
  }

  /** Get overall trending items across all time windows */
  getTrending(topN: number = 10): TrendingItem[] {
    const itemIds = new Set(this.interactions.map((i) => i.itemId));
    const trendingScores: Map<string, number> = new Map();

    for (const itemId of itemIds) {
      let compositeScore = 0;

      // Multi-window scoring (shorter windows weighted more)
      const windowWeights = [4, 3, 2, 1];
      for (let i = 0; i < this.windowSizes.length; i++) {
        const velocity = this.computeVelocity(itemId, this.windowSizes[i]!);
        compositeScore += velocity.velocity * windowWeights[i]!;

        // Bonus for acceleration
        if (velocity.acceleration > 0) {
          compositeScore += velocity.acceleration * windowWeights[i]! * 0.5;
        }
      }

      // Viral bonus
      const viralCoeff = this.computeViralCoefficient(itemId);
      compositeScore *= 1 + viralCoeff * 0.3;

      trendingScores.set(itemId, compositeScore);
    }

    const sorted = Array.from(trendingScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    return sorted.map(([itemId, _score]) => {
      const velocity = this.computeVelocity(itemId, this.windowSizes[0]!);
      return {
        itemId,
        velocity: velocity.velocity,
        acceleration: velocity.acceleration,
        viralCoefficient: this.computeViralCoefficient(itemId),
        category: this.itemCategories.get(itemId) || 'unknown',
        window: 'composite',
      };
    });
  }

  /** Time-window analysis for an item */
  analyzeTimeWindows(itemId: string): Map<string, VelocityScore> {
    const analysis: Map<string, VelocityScore> = new Map();
    for (const windowMs of this.windowSizes) {
      const label = this.formatWindow(windowMs);
      analysis.set(label, this.computeVelocity(itemId, windowMs));
    }
    return analysis;
  }

  /** Format window size for display */
  private formatWindow(windowMs: number): string {
    const hours = windowMs / (60 * 60 * 1000);
    if (hours < 24) return `${hours}h`;
    return `${hours / 24}d`;
  }

  /** Set decay rate */
  setDecayRate(rate: number): void {
    this.decayRate = Math.max(0, Math.min(1, rate));
  }

  /** Cleanup old interactions beyond max window */
  cleanup(): void {
    const maxWindow = Math.max(...this.windowSizes) * 2;
    const cutoff = Date.now() - maxWindow;
    this.interactions = this.interactions.filter((i) => i.timestamp > cutoff);
  }
}
