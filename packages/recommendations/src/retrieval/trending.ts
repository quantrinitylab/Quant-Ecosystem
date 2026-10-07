// ============================================================================
// Trending Retrieval - Time-decayed popularity scoring
// ============================================================================

export type TrendingInteractionType = 'view' | 'click' | 'like' | 'share' | 'comment' | 'purchase';

interface InteractionRecord {
  timestamp: number;
  type: TrendingInteractionType;
  weight: number;
}

const INTERACTION_WEIGHTS: Record<TrendingInteractionType, number> = {
  view: 1,
  click: 2,
  like: 3,
  share: 5,
  comment: 4,
  purchase: 10,
};

export interface TrendingConfig {
  decayHalfLifeMs: number;
  defaultTimeWindowMs: number;
}

const DEFAULT_CONFIG: TrendingConfig = {
  decayHalfLifeMs: 3600000, // 1 hour
  defaultTimeWindowMs: 86400000, // 24 hours
};

export class TrendingRetrieval {
  private interactions: Map<string, InteractionRecord[]> = new Map();
  private readonly config: TrendingConfig;

  constructor(config?: Partial<TrendingConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  recordInteraction(itemId: string, timestamp: number, type: TrendingInteractionType): void {
    const records = this.interactions.get(itemId) ?? [];
    records.push({
      timestamp,
      type,
      weight: INTERACTION_WEIGHTS[type],
    });
    this.interactions.set(itemId, records);
  }

  getScore(itemId: string, referenceTime?: number): number {
    const records = this.interactions.get(itemId);
    if (!records || records.length === 0) return 0;

    const now = referenceTime ?? Date.now();
    let score = 0;

    for (const record of records) {
      const age = now - record.timestamp;
      const decay = Math.pow(0.5, age / this.config.decayHalfLifeMs);
      score += record.weight * decay;
    }

    return score;
  }

  getTrending(
    k: number,
    timeWindowMs?: number,
    referenceTime?: number,
  ): Array<{ itemId: string; score: number }> {
    const now = referenceTime ?? Date.now();
    const window = timeWindowMs ?? this.config.defaultTimeWindowMs;

    const scores: Array<{ itemId: string; score: number }> = [];

    for (const [itemId, records] of this.interactions) {
      // Only consider items with recent activity
      const hasRecentActivity = records.some((r) => now - r.timestamp <= window);
      if (!hasRecentActivity) continue;

      const score = this.getScore(itemId, now);
      if (score > 0) {
        scores.push({ itemId, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, k);
  }

  getItemCount(): number {
    return this.interactions.size;
  }

  clear(): void {
    this.interactions.clear();
  }
}
