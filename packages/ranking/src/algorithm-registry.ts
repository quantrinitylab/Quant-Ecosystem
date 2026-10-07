// ============================================================================
// Algorithm Registry - Manages ranking algorithm implementations
// ============================================================================

import type { FeedItem, RankedItem } from './types.js';
import { AlgorithmType } from './types.js';

export interface RankingAlgorithm {
  name: AlgorithmType;
  rank(items: FeedItem[], userId: string): RankedItem[];
}

export class AlgorithmRegistry {
  private algorithms: Map<AlgorithmType, RankingAlgorithm> = new Map();

  register(algorithm: RankingAlgorithm): void {
    this.algorithms.set(algorithm.name, algorithm);
  }

  get(type: AlgorithmType): RankingAlgorithm | undefined {
    return this.algorithms.get(type);
  }

  list(): RankingAlgorithm[] {
    return Array.from(this.algorithms.values());
  }

  has(type: AlgorithmType): boolean {
    return this.algorithms.has(type);
  }

  unregister(type: AlgorithmType): boolean {
    return this.algorithms.delete(type);
  }
}
