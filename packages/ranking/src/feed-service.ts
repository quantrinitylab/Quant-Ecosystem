// ============================================================================
// Feed Service - Orchestrates the full ranking pipeline
// ============================================================================

import type { AlgorithmRegistry } from './algorithm-registry.js';
import type { AntiRageFilter } from './anti-rage-integration.js';
import type { UserPreferenceService } from './user-preference.service.js';
import type { FeedItem, FeedRequest, FeedResponse, RankedItem } from './types.js';
import { AlgorithmType } from './types.js';

export type CandidateProvider = (userId: string, feedId: string) => FeedItem[];

export class FeedService {
  private registry: AlgorithmRegistry;
  private preferenceService: UserPreferenceService;
  private antiRageFilter: AntiRageFilter;
  private candidateProvider: CandidateProvider;

  constructor(
    registry: AlgorithmRegistry,
    preferenceService: UserPreferenceService,
    antiRageFilter: AntiRageFilter,
    candidateProvider: CandidateProvider,
  ) {
    this.registry = registry;
    this.preferenceService = preferenceService;
    this.antiRageFilter = antiRageFilter;
    this.candidateProvider = candidateProvider;
  }

  getFeed(request: FeedRequest): FeedResponse {
    // 1) Fetch candidate items
    const candidates = this.candidateProvider(request.userId, request.feedId);

    // 2) Look up user's chosen algorithm
    const preference = this.preferenceService.getPreference(request.userId, request.feedId);
    const algorithmType = preference.algorithm;

    // 3) Apply the algorithm's ranking
    const ranked = this.applyAlgorithm(candidates, algorithmType, request.userId);

    // 4) Apply anti-rage filter
    const filtered = this.antiRageFilter.applyFilter(ranked);

    // 5) Re-sort by score for non-chrono algorithms
    const sorted = this.sortAfterFilter(filtered, algorithmType);

    // 6) Paginate and return
    const start = (request.page - 1) * request.pageSize;
    const paged = sorted.slice(start, start + request.pageSize);

    return {
      items: paged,
      page: request.page,
      pageSize: request.pageSize,
      algorithmUsed: algorithmType,
    };
  }

  getFeedWithAlgorithm(request: FeedRequest, algorithmType: AlgorithmType): FeedResponse {
    const candidates = this.candidateProvider(request.userId, request.feedId);
    const ranked = this.applyAlgorithm(candidates, algorithmType, request.userId);
    const filtered = this.antiRageFilter.applyFilter(ranked);

    // Re-sort by score for non-chrono algorithms
    const sorted = this.sortAfterFilter(filtered, algorithmType);

    const start = (request.page - 1) * request.pageSize;
    const paged = sorted.slice(start, start + request.pageSize);

    return {
      items: paged,
      page: request.page,
      pageSize: request.pageSize,
      algorithmUsed: algorithmType,
    };
  }

  private sortAfterFilter(items: RankedItem[], algorithmType: AlgorithmType): RankedItem[] {
    if (algorithmType === AlgorithmType.Chrono) {
      return items;
    }
    return [...items].sort((a, b) => b.score - a.score);
  }

  private applyAlgorithm(
    items: FeedItem[],
    algorithmType: AlgorithmType,
    userId: string,
  ): RankedItem[] {
    const algorithm = this.registry.get(algorithmType);
    if (!algorithm) {
      // Fallback to chrono if the requested algorithm is not registered
      const fallback = this.registry.get(AlgorithmType.Chrono);
      if (!fallback) {
        // If even chrono is not registered, return items with default scoring
        return items.map((item, index) => ({
          ...item,
          score: 1 - index / Math.max(items.length, 1),
          algorithmUsed: algorithmType,
        }));
      }
      return fallback.rank(items, userId);
    }
    return algorithm.rank(items, userId);
  }
}
