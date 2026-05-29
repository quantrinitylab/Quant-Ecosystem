import { AppListing, RankingFactors, UserContext } from '../types.js';

export class QualityRanker {
  private metrics: Map<string, RankingFactors> = new Map();

  calculateScore(appId: string): number {
    const factors = this.metrics.get(appId);
    if (!factors) return 0;

    // Quality+trust weighted heavily over engagement metrics
    // This is intentionally NOT engagement-maximizing
    const score =
      factors.qualityScore * 0.35 +
      factors.trustScore * 0.3 +
      factors.userRating * 20 * 0.2 +
      factors.freshness * 100 * 0.05 +
      factors.relevance * 100 * 0.1;

    return Math.min(100, Math.max(0, score));
  }

  rankResults(listings: AppListing[], _userContext?: UserContext): AppListing[] {
    return [...listings].sort((a, b) => {
      const scoreA = this.calculateScore(a.id);
      const scoreB = this.calculateScore(b.id);
      return scoreB - scoreA;
    });
  }

  getFactors(appId: string): RankingFactors | null {
    return this.metrics.get(appId) ?? null;
  }

  updateMetrics(appId: string, event: Partial<RankingFactors>): void {
    const existing = this.metrics.get(appId) ?? {
      qualityScore: 50,
      trustScore: 50,
      userRating: 0,
      freshness: 1,
      relevance: 0.5,
    };

    this.metrics.set(appId, { ...existing, ...event });
  }
}
