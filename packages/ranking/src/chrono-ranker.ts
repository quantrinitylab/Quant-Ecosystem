// ============================================================================
// Chrono Ranker - Ranks items by timestamp descending (newest first)
// ============================================================================

import type { RankingAlgorithm } from './algorithm-registry.js';
import type { FeedItem, RankedItem } from './types.js';
import { AlgorithmType } from './types.js';

export class ChronoRanker implements RankingAlgorithm {
  name = AlgorithmType.Chrono as const;

  rank(items: FeedItem[], _userId: string): RankedItem[] {
    const sorted = [...items].sort((a, b) => b.timestamp - a.timestamp);

    return sorted.map((item, index) => ({
      ...item,
      score: 1 - index / Math.max(sorted.length, 1),
      algorithmUsed: AlgorithmType.Chrono,
    }));
  }
}
