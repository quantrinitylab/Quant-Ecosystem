// ============================================================================
// Recommendations Package - Diversity Injector (MMR)
// ============================================================================

import type { DiversityConfig, RecommendedItem } from '../types';

/** Injects diversity into recommendation lists using MMR and other strategies */
export class DiversityInjector {
  private config: DiversityConfig;
  private itemCategories: Map<string, string>;
  private itemFeatures: Map<string, number[]>;
  private userHistory: Map<string, Set<string>>;
  private globalPopularity: Map<string, number>;

  constructor(config: DiversityConfig) {
    this.config = config;
    this.itemCategories = new Map();
    this.itemFeatures = new Map();
    this.userHistory = new Map();
    this.globalPopularity = new Map();
  }

  /** Register item metadata */
  registerItem(itemId: string, category: string, features: number[]): void {
    this.itemCategories.set(itemId, category);
    this.itemFeatures.set(itemId, features);
    this.globalPopularity.set(itemId, (this.globalPopularity.get(itemId) || 0) + 1);
  }

  /** Record user interaction history */
  recordUserInteraction(userId: string, itemId: string): void {
    if (!this.userHistory.has(userId)) {
      this.userHistory.set(userId, new Set());
    }
    this.userHistory.get(userId)!.add(itemId);
  }

  /** Apply MMR (Maximal Marginal Relevance) to diversify results */
  applyMMR(candidates: RecommendedItem[], topN: number): RecommendedItem[] {
    if (candidates.length <= 1) return candidates.slice(0, topN);

    const lambda = this.config.lambda;
    const selected: RecommendedItem[] = [];
    const remaining = [...candidates];

    // Select the first item (highest relevance)
    remaining.sort((a, b) => b.score - a.score);
    selected.push(remaining.shift()!);

    while (selected.length < topN && remaining.length > 0) {
      let bestMMR = -Infinity;
      let bestIndex = 0;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]!;
        const relevance = candidate.score;

        // Find maximum similarity to already selected items
        let maxSimilarity = 0;
        for (const selectedItem of selected) {
          const similarity = this.computeItemSimilarity(candidate.itemId, selectedItem.itemId);
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        // MMR score: lambda * relevance - (1 - lambda) * max_similarity
        const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

        if (mmrScore > bestMMR) {
          bestMMR = mmrScore;
          bestIndex = i;
        }
      }

      selected.push(remaining[bestIndex]!);
      remaining.splice(bestIndex, 1);
    }

    // Re-rank
    return selected.map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }

  /** Compute similarity between two items based on features */
  private computeItemSimilarity(itemA: string, itemB: string): number {
    const featA = this.itemFeatures.get(itemA);
    const featB = this.itemFeatures.get(itemB);

    if (!featA || !featB) {
      // Fall back to category similarity
      const catA = this.itemCategories.get(itemA) || '';
      const catB = this.itemCategories.get(itemB) || '';
      return catA === catB ? 0.8 : 0.2;
    }

    // Cosine similarity on feature vectors
    let dot = 0;
    let magA = 0;
    let magB = 0;
    const minLen = Math.min(featA.length, featB.length);

    for (let i = 0; i < minLen; i++) {
      dot += featA[i]! * featB[i]!;
      magA += featA[i]! * featA[i]!;
      magB += featB[i]! * featB[i]!;
    }

    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Enforce category distribution constraints */
  enforceCategoryDistribution(candidates: RecommendedItem[], topN: number): RecommendedItem[] {
    const maxPerCategory = this.config.maxPerCategory;
    const minCategories = this.config.minCategories;

    const categoryCounts: Map<string, number> = new Map();
    const result: RecommendedItem[] = [];
    const skipped: RecommendedItem[] = [];

    // Sort by score
    const sorted = [...candidates].sort((a, b) => b.score - a.score);

    // First pass: add items respecting category limits
    for (const item of sorted) {
      if (result.length >= topN) break;

      const category = this.itemCategories.get(item.itemId) || 'unknown';
      const count = categoryCounts.get(category) || 0;

      if (count < maxPerCategory) {
        result.push(item);
        categoryCounts.set(category, count + 1);
      } else {
        skipped.push(item);
      }
    }

    // Check minimum categories requirement
    if (categoryCounts.size < minCategories && skipped.length > 0) {
      // Find items from underrepresented categories
      const seenCategories = new Set(categoryCounts.keys());

      for (const item of skipped) {
        if (result.length >= topN) break;
        const category = this.itemCategories.get(item.itemId) || 'unknown';
        if (!seenCategories.has(category)) {
          // Replace lowest scored item
          if (result.length >= topN) {
            result.pop();
          }
          result.push(item);
          seenCategories.add(category);
        }
      }
    }

    return result.map((item, idx) => ({ ...item, rank: idx + 1 }));
  }

  /** Calculate serendipity score for an item */
  computeSerendipityScore(userId: string, itemId: string): number {
    const userHist = this.userHistory.get(userId);
    if (!userHist || userHist.size === 0) return 0.5;

    // Check how different this item is from user's history
    let totalSimilarity = 0;
    let count = 0;

    for (const histItemId of userHist) {
      const similarity = this.computeItemSimilarity(itemId, histItemId);
      totalSimilarity += similarity;
      count++;
    }

    const avgSimilarity = count > 0 ? totalSimilarity / count : 0;

    // Serendipity = unexpectedness * relevance potential
    // Low similarity to history = unexpected
    const unexpectedness = 1 - avgSimilarity;

    // But item should still be somewhat related (not completely random)
    const relevancePotential = avgSimilarity > 0.1 ? 1 : 0.3;

    return unexpectedness * relevancePotential;
  }

  /** Calculate novelty score (how new/unseen an item is) */
  computeNoveltyScore(userId: string, itemId: string): number {
    const userHist = this.userHistory.get(userId);
    if (!userHist) return 1.0;

    // Direct novelty: user hasn't seen it
    if (userHist.has(itemId)) return 0;

    // Popularity-based novelty: less popular = more novel
    const popularity = this.globalPopularity.get(itemId) || 0;
    const maxPop = Math.max(...this.globalPopularity.values(), 1);
    const popularityNovelty = 1 - popularity / maxPop;

    // Feature-based novelty: how different from what user has seen
    let featureNovelty = 1.0;
    const itemFeats = this.itemFeatures.get(itemId);
    if (itemFeats && userHist.size > 0) {
      let maxSim = 0;
      for (const histItem of userHist) {
        const sim = this.computeItemSimilarity(itemId, histItem);
        maxSim = Math.max(maxSim, sim);
      }
      featureNovelty = 1 - maxSim;
    }

    return (popularityNovelty + featureNovelty) / 2;
  }

  /** Break filter bubbles by injecting diverse items */
  breakFilterBubble(
    userId: string,
    recommendations: RecommendedItem[],
    allItems: string[],
    injectionRate: number = 0.2,
  ): RecommendedItem[] {
    const numToInject = Math.ceil(recommendations.length * injectionRate);
    const result = [...recommendations];
    const userHist = this.userHistory.get(userId) || new Set();

    // Find items from categories user rarely engages with
    const userCategories: Map<string, number> = new Map();
    for (const histItem of userHist) {
      const cat = this.itemCategories.get(histItem) || 'unknown';
      userCategories.set(cat, (userCategories.get(cat) || 0) + 1);
    }

    // Find underexplored categories
    const allCategories = new Set(this.itemCategories.values());
    const underexplored: string[] = [];
    for (const cat of allCategories) {
      if (!userCategories.has(cat) || userCategories.get(cat)! < 2) {
        underexplored.push(cat);
      }
    }

    // Find items from underexplored categories
    const bubbleBreakers: string[] = [];
    for (const itemId of allItems) {
      if (userHist.has(itemId)) continue;
      const cat = this.itemCategories.get(itemId) || '';
      if (underexplored.includes(cat)) {
        bubbleBreakers.push(itemId);
      }
    }

    // Inject bubble breakers
    const injected = bubbleBreakers.slice(0, numToInject);
    for (let i = 0; i < injected.length && result.length > i; i++) {
      const insertPos = Math.floor(result.length * 0.3) + i; // Insert in middle-to-end positions
      if (insertPos < result.length) {
        result.splice(insertPos, 0, {
          itemId: injected[i]!,
          score: 0.5,
          rank: insertPos + 1,
          source: 'diversity_bubble_breaker',
          reason: 'Expanding your horizons',
        });
      }
    }

    // Re-rank and trim
    return result.slice(0, recommendations.length).map((item, idx) => ({
      ...item,
      rank: idx + 1,
    }));
  }

  /** Full diversity pipeline: MMR + category enforcement + serendipity */
  diversify(userId: string, candidates: RecommendedItem[], topN: number): RecommendedItem[] {
    // Step 1: Apply MMR for initial diversity
    let diversified = this.applyMMR(candidates, topN * 2);

    // Step 2: Enforce category distribution
    diversified = this.enforceCategoryDistribution(diversified, topN);

    // Step 3: Boost serendipitous items
    if (this.config.serendipityTarget > 0) {
      const numSerendipity = Math.ceil(topN * this.config.serendipityTarget);
      for (let i = diversified.length - numSerendipity; i < diversified.length; i++) {
        if (i >= 0 && i < diversified.length) {
          const serendipity = this.computeSerendipityScore(userId, diversified[i]!.itemId);
          diversified[i] = {
            ...diversified[i]!,
            score: diversified[i]!.score * (1 + serendipity * this.config.noveltyWeight),
          };
        }
      }
      // Re-sort after boosting
      diversified.sort((a, b) => b.score - a.score);
      diversified = diversified.map((item, idx) => ({ ...item, rank: idx + 1 }));
    }

    return diversified.slice(0, topN);
  }
}
