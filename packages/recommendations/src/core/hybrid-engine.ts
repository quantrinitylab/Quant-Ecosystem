// ============================================================================
// Recommendations Package - Hybrid Recommendation Engine
// ============================================================================

import type { HybridConfig, RecommendedItem } from '../types';

/** Hybrid recommendation engine combining multiple algorithms */
export class HybridEngine {
  private config: HybridConfig;
  private algorithms: Map<string, (userId: string, topN: number) => RecommendedItem[]>;
  private confidenceScores: Map<string, number>;
  private performanceHistory: Map<string, number[]>;

  constructor(config: HybridConfig) {
    this.config = config;
    this.algorithms = new Map();
    this.confidenceScores = new Map();
    this.performanceHistory = new Map();
  }

  /** Register an algorithm */
  registerAlgorithm(name: string, fn: (userId: string, topN: number) => RecommendedItem[]): void {
    this.algorithms.set(name, fn);
    this.confidenceScores.set(name, 0.5);
    this.performanceHistory.set(name, []);
  }

  /** Update confidence score for an algorithm */
  updateConfidence(algorithm: string, score: number): void {
    this.confidenceScores.set(algorithm, Math.max(0, Math.min(1, score)));
    const history = this.performanceHistory.get(algorithm) || [];
    history.push(score);
    if (history.length > 100) history.shift();
    this.performanceHistory.set(algorithm, history);
  }

  /** Generate recommendations using the configured blending strategy */
  recommend(userId: string, topN: number = 10): RecommendedItem[] {
    switch (this.config.blendingStrategy) {
      case 'weighted':
        return this.weightedBlend(userId, topN);
      case 'cascade':
        return this.cascadeRank(userId, topN);
      case 'switching':
        return this.switchingStrategy(userId, topN);
      case 'ensemble':
        return this.ensembleCombine(userId, topN);
      default:
        return this.weightedBlend(userId, topN);
    }
  }

  /** Weighted blend: combine scores from all algorithms */
  private weightedBlend(userId: string, topN: number): RecommendedItem[] {
    const weights: Record<string, number> = {
      collaborative: this.config.collaborativeWeight,
      content: this.config.contentWeight,
      trending: this.config.trendingWeight,
      context: this.config.contextWeight,
    };

    const combinedScores: Map<string, { score: number; sources: string[]; reasons: string[] }> =
      new Map();
    const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0);

    for (const [algoName, algoFn] of this.algorithms) {
      const weight = weights[algoName] || 1 / this.algorithms.size;
      const normalizedWeight = weight / totalWeight;
      const results = algoFn(userId, topN * 2);

      for (const item of results) {
        const existing = combinedScores.get(item.itemId) || { score: 0, sources: [], reasons: [] };
        existing.score += item.score * normalizedWeight;
        existing.sources.push(algoName);
        existing.reasons.push(item.reason);
        combinedScores.set(item.itemId, existing);
      }
    }

    return this.sortAndRank(combinedScores, topN, 'weighted_blend');
  }

  /** Cascade: coarse filter then fine-rank */
  private cascadeRank(userId: string, topN: number): RecommendedItem[] {
    // Stage 1: Coarse filter - get a large candidate set
    const candidateSet: Map<string, { score: number; sources: string[]; reasons: string[] }> =
      new Map();
    const coarseSize = topN * 5;

    for (const [algoName, algoFn] of this.algorithms) {
      const results = algoFn(userId, coarseSize);
      for (const item of results) {
        if (item.score < this.config.cascadeThreshold) continue;
        const existing = candidateSet.get(item.itemId) || { score: 0, sources: [], reasons: [] };
        existing.score = Math.max(existing.score, item.score);
        existing.sources.push(algoName);
        existing.reasons.push(item.reason);
        candidateSet.set(item.itemId, existing);
      }
    }

    // Stage 2: Fine-rank with the most accurate algorithm
    const bestAlgo = this.getMostConfidentAlgorithm();
    if (bestAlgo) {
      const fineResults = bestAlgo(userId, topN * 3);
      for (const item of fineResults) {
        if (candidateSet.has(item.itemId)) {
          const existing = candidateSet.get(item.itemId)!;
          existing.score = (existing.score + item.score * 2) / 3;
        }
      }
    }

    return this.sortAndRank(candidateSet, topN, 'cascade');
  }

  /** Switching: use the best algorithm based on confidence */
  private switchingStrategy(userId: string, topN: number): RecommendedItem[] {
    // Find the algorithm with highest confidence
    let bestAlgoName = '';
    let bestConfidence = 0;

    for (const [name, confidence] of this.confidenceScores) {
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestAlgoName = name;
      }
    }

    // If confidence is above threshold, use single best algorithm
    if (bestConfidence >= this.config.switchingConfidence && this.algorithms.has(bestAlgoName)) {
      const algoFn = this.algorithms.get(bestAlgoName)!;
      const results = algoFn(userId, topN);
      return results.map((item, idx) => ({
        ...item,
        rank: idx + 1,
        source: `switching:${bestAlgoName}`,
      }));
    }

    // Otherwise fall back to weighted blend
    return this.weightedBlend(userId, topN);
  }

  /** Ensemble: vote-based combination */
  private ensembleCombine(userId: string, topN: number): RecommendedItem[] {
    const voteScores: Map<
      string,
      { votes: number; totalScore: number; sources: string[]; reasons: string[] }
    > = new Map();

    for (const [algoName, algoFn] of this.algorithms) {
      const results = algoFn(userId, topN);
      const confidence = this.confidenceScores.get(algoName) || 0.5;

      for (let i = 0; i < results.length; i++) {
        const item = results[i]!;
        const positionWeight = 1 / (i + 1); // Higher weight for top positions
        const existing = voteScores.get(item.itemId) || {
          votes: 0,
          totalScore: 0,
          sources: [],
          reasons: [],
        };
        existing.votes += confidence;
        existing.totalScore += item.score * positionWeight * confidence;
        existing.sources.push(algoName);
        existing.reasons.push(item.reason);
        voteScores.set(item.itemId, existing);
      }
    }

    // Combine votes and scores
    const combined: Map<string, { score: number; sources: string[]; reasons: string[] }> =
      new Map();
    for (const [itemId, data] of voteScores) {
      combined.set(itemId, {
        score: data.totalScore * (1 + Math.log(1 + data.votes)),
        sources: data.sources,
        reasons: data.reasons,
      });
    }

    return this.sortAndRank(combined, topN, 'ensemble');
  }

  /** Sort candidates and assign ranks */
  private sortAndRank(
    candidates: Map<string, { score: number; sources: string[]; reasons: string[] }>,
    topN: number,
    source: string,
  ): RecommendedItem[] {
    const sorted = Array.from(candidates.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topN);

    return sorted.map(([itemId, data], idx) => ({
      itemId,
      score: this.normalizeScore(data.score),
      rank: idx + 1,
      source,
      reason: data.reasons[0] || 'Hybrid recommendation',
    }));
  }

  /** Normalize score to 0-1 range */
  private normalizeScore(score: number): number {
    return Math.max(0, Math.min(1, score));
  }

  /** Get the function of the most confident algorithm */
  private getMostConfidentAlgorithm():
    | ((userId: string, topN: number) => RecommendedItem[])
    | null {
    let bestName = '';
    let bestConfidence = 0;
    for (const [name, conf] of this.confidenceScores) {
      if (conf > bestConfidence && this.algorithms.has(name)) {
        bestConfidence = conf;
        bestName = name;
      }
    }
    return bestName ? this.algorithms.get(bestName)! : null;
  }

  /** Get performance statistics */
  getPerformanceStats(): Map<string, { avgConfidence: number; samples: number }> {
    const stats: Map<string, { avgConfidence: number; samples: number }> = new Map();
    for (const [name, history] of this.performanceHistory) {
      const avg = history.length > 0 ? history.reduce((s, v) => s + v, 0) / history.length : 0;
      stats.set(name, { avgConfidence: avg, samples: history.length });
    }
    return stats;
  }
}
