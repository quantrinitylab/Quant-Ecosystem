// ============================================================================
// Community Ranker - Ranks by community votes weighted by author reputation
// ============================================================================

import type { RankingAlgorithm } from './algorithm-registry.js';
import type { FeedItem, RankedItem } from './types.js';
import { AlgorithmType } from './types.js';

export class CommunityRanker implements RankingAlgorithm {
  name = AlgorithmType.Community as const;

  rank(items: FeedItem[], _userId: string): RankedItem[] {
    const scored = items.map((item) => {
      const score = this.computeCommunityScore(item);
      return {
        ...item,
        score,
        algorithmUsed: AlgorithmType.Community as const,
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  private computeCommunityScore(item: FeedItem): number {
    // Upvotes weighted heavily
    const upvoteScore = Math.min(item.upvotes / 100, 1) * 0.35;

    // Shares indicate broader appeal
    const shareScore = Math.min(item.shares / 50, 1) * 0.2;

    // Reply quality indicates substantive discussion
    const replyScore = item.replyQuality * 0.2;

    // Author reputation as a trust multiplier
    const reputationMultiplier = 0.5 + item.authorReputation * 0.5;

    // Composite score with reputation weighting
    const rawScore = upvoteScore + shareScore + replyScore;
    return Math.min(rawScore * reputationMultiplier, 1);
  }
}
