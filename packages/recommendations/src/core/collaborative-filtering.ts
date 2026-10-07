// ============================================================================
// Recommendations Package - Collaborative Filtering
// ============================================================================

import type { CollaborativeConfig, Rating, SimilarityScore, RecommendedItem } from '../types';

/** Collaborative filtering recommendation engine using user-user and item-item similarity */
export class CollaborativeFilter {
  private config: CollaborativeConfig;
  private userRatings: Map<string, Map<string, number>>;
  private itemRatings: Map<string, Map<string, number>>;
  private similarityCache: Map<string, number>;
  private userMeans: Map<string, number>;

  constructor(config: CollaborativeConfig) {
    this.config = config;
    this.userRatings = new Map();
    this.itemRatings = new Map();
    this.similarityCache = new Map();
    this.userMeans = new Map();
  }

  /** Add a rating to the system */
  addRating(rating: Rating): void {
    // Update user-item matrix
    if (!this.userRatings.has(rating.userId)) {
      this.userRatings.set(rating.userId, new Map());
    }
    this.userRatings.get(rating.userId)!.set(rating.itemId, rating.value);

    // Update item-user matrix (transpose)
    if (!this.itemRatings.has(rating.itemId)) {
      this.itemRatings.set(rating.itemId, new Map());
    }
    this.itemRatings.get(rating.itemId)!.set(rating.userId, rating.value);

    // Invalidate caches
    this.similarityCache.clear();
    this.userMeans.delete(rating.userId);
  }

  /** Bulk load ratings */
  loadRatings(ratings: Rating[]): void {
    for (const rating of ratings) {
      this.addRating(rating);
    }
  }

  /** Get mean rating for a user */
  private getUserMean(userId: string): number {
    if (this.userMeans.has(userId)) {
      return this.userMeans.get(userId)!;
    }
    const ratings = this.userRatings.get(userId);
    if (!ratings || ratings.size === 0) return 0;

    let sum = 0;
    for (const value of ratings.values()) {
      sum += value;
    }
    const mean = sum / ratings.size;
    this.userMeans.set(userId, mean);
    return mean;
  }

  /** Compute cosine similarity between two users */
  computeCosineSimilarity(userA: string, userB: string): number {
    const cacheKey = `${userA}:${userB}:cosine`;
    if (this.similarityCache.has(cacheKey)) {
      return this.similarityCache.get(cacheKey)!;
    }

    const ratingsA = this.userRatings.get(userA);
    const ratingsB = this.userRatings.get(userB);

    if (!ratingsA || !ratingsB) return 0;

    // Find common items
    const commonItems: string[] = [];
    for (const itemId of ratingsA.keys()) {
      if (ratingsB.has(itemId)) {
        commonItems.push(itemId);
      }
    }

    if (commonItems.length < this.config.minCommonItems) return 0;

    // Compute dot product and magnitudes
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (const itemId of commonItems) {
      const rA = ratingsA.get(itemId)!;
      const rB = ratingsB.get(itemId)!;
      dotProduct += rA * rB;
      magnitudeA += rA * rA;
      magnitudeB += rB * rB;
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    const similarity = dotProduct / (magnitudeA * magnitudeB);
    this.similarityCache.set(cacheKey, similarity);
    return similarity;
  }

  /** Compute Pearson correlation between two users */
  computePearsonSimilarity(userA: string, userB: string): number {
    const cacheKey = `${userA}:${userB}:pearson`;
    if (this.similarityCache.has(cacheKey)) {
      return this.similarityCache.get(cacheKey)!;
    }

    const ratingsA = this.userRatings.get(userA);
    const ratingsB = this.userRatings.get(userB);

    if (!ratingsA || !ratingsB) return 0;

    // Find common items
    const commonItems: string[] = [];
    for (const itemId of ratingsA.keys()) {
      if (ratingsB.has(itemId)) {
        commonItems.push(itemId);
      }
    }

    if (commonItems.length < this.config.minCommonItems) return 0;

    const meanA = this.getUserMean(userA);
    const meanB = this.getUserMean(userB);

    let numerator = 0;
    let denomA = 0;
    let denomB = 0;

    for (const itemId of commonItems) {
      const diffA = ratingsA.get(itemId)! - meanA;
      const diffB = ratingsB.get(itemId)! - meanB;
      numerator += diffA * diffB;
      denomA += diffA * diffA;
      denomB += diffB * diffB;
    }

    const denominator = Math.sqrt(denomA) * Math.sqrt(denomB);
    if (denominator === 0) return 0;

    const similarity = numerator / denominator;
    this.similarityCache.set(cacheKey, similarity);
    return similarity;
  }

  /** Compute similarity using configured method */
  computeSimilarity(userA: string, userB: string): number {
    switch (this.config.similarityMethod) {
      case 'cosine':
        return this.computeCosineSimilarity(userA, userB);
      case 'pearson':
        return this.computePearsonSimilarity(userA, userB);
      case 'jaccard':
        return this.computeJaccardSimilarity(userA, userB);
      case 'euclidean':
        return this.computeEuclideanSimilarity(userA, userB);
      default:
        return this.computeCosineSimilarity(userA, userB);
    }
  }

  /** Compute Jaccard similarity between two users */
  computeJaccardSimilarity(userA: string, userB: string): number {
    const ratingsA = this.userRatings.get(userA);
    const ratingsB = this.userRatings.get(userB);

    if (!ratingsA || !ratingsB) return 0;

    let intersection = 0;
    for (const itemId of ratingsA.keys()) {
      if (ratingsB.has(itemId)) {
        intersection++;
      }
    }

    const union = ratingsA.size + ratingsB.size - intersection;
    if (union === 0) return 0;

    return intersection / union;
  }

  /** Compute Euclidean distance-based similarity */
  computeEuclideanSimilarity(userA: string, userB: string): number {
    const ratingsA = this.userRatings.get(userA);
    const ratingsB = this.userRatings.get(userB);

    if (!ratingsA || !ratingsB) return 0;

    let sumSquaredDiff = 0;
    let commonCount = 0;

    for (const [itemId, rA] of ratingsA) {
      if (ratingsB.has(itemId)) {
        const rB = ratingsB.get(itemId)!;
        sumSquaredDiff += (rA - rB) * (rA - rB);
        commonCount++;
      }
    }

    if (commonCount < this.config.minCommonItems) return 0;

    // Convert distance to similarity (0-1 range)
    return 1 / (1 + Math.sqrt(sumSquaredDiff));
  }

  /** Find K-nearest neighbors for a user */
  findKNearestNeighbors(userId: string, k?: number): SimilarityScore[] {
    const neighborhoodSize = k || this.config.neighborhoodSize;
    const similarities: SimilarityScore[] = [];

    for (const otherUserId of this.userRatings.keys()) {
      if (otherUserId === userId) continue;

      const score = this.computeSimilarity(userId, otherUserId);
      if (score >= this.config.minSimilarity) {
        similarities.push({
          entityA: userId,
          entityB: otherUserId,
          score,
          method: this.config.similarityMethod,
        });
      }
    }

    // Sort by similarity descending and take top K
    similarities.sort((a, b) => b.score - a.score);
    return similarities.slice(0, neighborhoodSize);
  }

  /** Predict rating for a user-item pair using user-based CF */
  predictRating(userId: string, itemId: string): number {
    const neighbors = this.findKNearestNeighbors(userId);
    const userMean = this.getUserMean(userId);

    let weightedSum = 0;
    let weightTotal = 0;

    for (const neighbor of neighbors) {
      const neighborRatings = this.userRatings.get(neighbor.entityB);
      if (!neighborRatings || !neighborRatings.has(itemId)) continue;

      const neighborRating = neighborRatings.get(itemId)!;
      const neighborMean = this.getUserMean(neighbor.entityB);

      weightedSum += neighbor.score * (neighborRating - neighborMean);
      weightTotal += Math.abs(neighbor.score);
    }

    if (weightTotal === 0) return userMean;

    return userMean + weightedSum / weightTotal;
  }

  /** Compute item-item similarity using co-occurrence */
  computeItemSimilarity(itemA: string, itemB: string): number {
    const usersA = this.itemRatings.get(itemA);
    const usersB = this.itemRatings.get(itemB);

    if (!usersA || !usersB) return 0;

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (const [userId, rA] of usersA) {
      if (usersB.has(userId)) {
        const rB = usersB.get(userId)!;
        dotProduct += rA * rB;
      }
      magnitudeA += rA * rA;
    }

    for (const rB of usersB.values()) {
      magnitudeB += rB * rB;
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /** Generate recommendations for a user using user-based CF */
  recommend(userId: string, topN: number = 10): RecommendedItem[] {
    const userRatings = this.userRatings.get(userId);
    if (!userRatings) return [];

    const candidates: Map<string, number> = new Map();

    // Get all items rated by neighbors that user hasn't rated
    const neighbors = this.findKNearestNeighbors(userId);

    for (const neighbor of neighbors) {
      const neighborRatings = this.userRatings.get(neighbor.entityB);
      if (!neighborRatings) continue;

      for (const [itemId, rating] of neighborRatings) {
        if (userRatings.has(itemId)) continue;
        if (!candidates.has(itemId)) {
          candidates.set(itemId, 0);
        }
        // Weighted by neighbor similarity
        candidates.set(itemId, candidates.get(itemId)! + neighbor.score * rating);
      }
    }

    // Sort and return top N
    const sorted = Array.from(candidates.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    return sorted.map(([itemId, score], index) => ({
      itemId,
      score,
      rank: index + 1,
      source: 'collaborative_filtering',
      reason: `Based on ${neighbors.length} similar users`,
    }));
  }

  /** Generate recommendations using item-based CF */
  recommendItemBased(userId: string, topN: number = 10): RecommendedItem[] {
    const userRatings = this.userRatings.get(userId);
    if (!userRatings) return [];

    const candidates: Map<string, number> = new Map();

    // For each item the user liked, find similar items
    for (const [ratedItemId, ratedValue] of userRatings) {
      if (ratedValue < 3) continue; // Only consider liked items

      for (const candidateItemId of this.itemRatings.keys()) {
        if (userRatings.has(candidateItemId)) continue;

        const similarity = this.computeItemSimilarity(ratedItemId, candidateItemId);
        if (similarity < this.config.minSimilarity) continue;

        const current = candidates.get(candidateItemId) || 0;
        candidates.set(candidateItemId, current + similarity * ratedValue);
      }
    }

    const sorted = Array.from(candidates.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN);

    return sorted.map(([itemId, score], index) => ({
      itemId,
      score,
      rank: index + 1,
      source: 'item_based_cf',
      reason: 'Similar to items you liked',
    }));
  }

  /** Optimize neighborhood size by evaluating prediction accuracy */
  optimizeNeighborhoodSize(testRatings: Rating[], kValues: number[]): number {
    let bestK = this.config.neighborhoodSize;
    let bestRMSE = Infinity;

    for (const k of kValues) {
      let totalError = 0;
      let count = 0;

      for (const testRating of testRatings) {
        const originalK = this.config.neighborhoodSize;
        this.config.neighborhoodSize = k;

        const predicted = this.predictRating(testRating.userId, testRating.itemId);
        const error = predicted - testRating.value;
        totalError += error * error;
        count++;

        this.config.neighborhoodSize = originalK;
      }

      const rmse = Math.sqrt(totalError / Math.max(count, 1));
      if (rmse < bestRMSE) {
        bestRMSE = rmse;
        bestK = k;
      }
    }

    return bestK;
  }

  /** Get statistics about the rating matrix */
  getStatistics(): { users: number; items: number; ratings: number; sparsity: number } {
    const users = this.userRatings.size;
    const items = this.itemRatings.size;
    let ratings = 0;
    for (const userRatings of this.userRatings.values()) {
      ratings += userRatings.size;
    }
    const totalCells = users * items;
    const sparsity = totalCells > 0 ? 1 - ratings / totalCells : 1;

    return { users, items, ratings, sparsity };
  }
}
