// ============================================================================
// Social Graph Package - Influence Scorer
// ============================================================================
// PageRank-inspired influence scoring with iterative convergence detection,
// trending account identification, and multi-factor influence components.
// ============================================================================

import { GraphStore } from './graph-store';
import {
  InfluenceScore,
  InfluenceComponents,
  PageRankConfig,
  TrendingAccount,
  NetworkGrowthMetrics,
} from '../types';

// ---------------------------------------------------------------------------
// Influence Scorer Implementation
// ---------------------------------------------------------------------------

export class InfluenceScorer {
  private store: GraphStore;
  private config: PageRankConfig;
  private ranks: Map<string, number> = new Map();
  private previousRanks: Map<string, number> = new Map();
  private influenceCache: Map<string, InfluenceScore> = new Map();
  private growthHistory: Map<string, NetworkGrowthMetrics[]> = new Map();
  private lastComputeTime: number = 0;
  private iterationsUsed: number = 0;

  constructor(store: GraphStore, config?: Partial<PageRankConfig>) {
    this.store = store;
    this.config = {
      dampingFactor: config?.dampingFactor || 0.85,
      maxIterations: config?.maxIterations || 100,
      convergenceThreshold: config?.convergenceThreshold || 1e-6,
      personalizationVector: config?.personalizationVector || null,
    };
  }

  // -------------------------------------------------------------------------
  // PageRank Algorithm
  // -------------------------------------------------------------------------

  /** Run PageRank algorithm on the entire graph */
  computePageRank(): Map<string, number> {
    const nodes = this.store.getAllNodeIds();
    const nodeCount = nodes.length;

    if (nodeCount === 0) {
      return new Map();
    }

    const d = this.config.dampingFactor;
    const initialRank = 1.0 / nodeCount;

    // Initialize ranks
    this.ranks.clear();
    for (const nodeId of nodes) {
      this.ranks.set(nodeId, initialRank);
    }

    // Iterative computation
    let iteration = 0;
    let converged = false;

    while (iteration < this.config.maxIterations && !converged) {
      this.previousRanks = new Map(this.ranks);
      let maxDiff = 0;

      // Identify dangling nodes (no outgoing edges)
      let danglingSum = 0;
      for (const nodeId of nodes) {
        if (this.store.getOutDegree(nodeId) === 0) {
          danglingSum += this.previousRanks.get(nodeId) || 0;
        }
      }
      const danglingContribution = danglingSum / nodeCount;

      for (const nodeId of nodes) {
        let rankSum = 0;

        // Sum contributions from incoming neighbors
        const inNeighbors = this.store.getInNeighbors(nodeId, {
          excludeBlocked: true,
          edgeTypes: ['follow', 'friend'],
        });

        for (const neighbor of inNeighbors) {
          const neighborRank = this.previousRanks.get(neighbor) || 0;
          const neighborOutDegree = this.store.getOutDegree(neighbor);

          if (neighborOutDegree > 0) {
            rankSum += neighborRank / neighborOutDegree;
          }
        }

        // Apply personalization if configured
        let personalization = 1.0 / nodeCount;
        if (this.config.personalizationVector) {
          personalization = this.config.personalizationVector.get(nodeId) || 0;
        }

        // PageRank formula: (1-d) * personalization + d * (sum + dangling)
        const newRank = (1 - d) * personalization + d * (rankSum + danglingContribution);
        this.ranks.set(nodeId, newRank);

        // Track convergence
        const diff = Math.abs(newRank - (this.previousRanks.get(nodeId) || 0));
        maxDiff = Math.max(maxDiff, diff);
      }

      // Check convergence
      converged = maxDiff < this.config.convergenceThreshold;
      iteration++;
    }

    this.iterationsUsed = iteration;
    this.lastComputeTime = Date.now();

    // Normalize ranks to 0-100 scale
    this.normalizeRanks();

    return new Map(this.ranks);
  }

  /** Normalize ranks to a 0-100 scale */
  private normalizeRanks(): void {
    let maxRank = 0;
    let minRank = Infinity;

    for (const rank of this.ranks.values()) {
      maxRank = Math.max(maxRank, rank);
      minRank = Math.min(minRank, rank);
    }

    const range = maxRank - minRank;
    if (range === 0) return;

    for (const [nodeId, rank] of this.ranks) {
      const normalized = ((rank - minRank) / range) * 100;
      this.ranks.set(nodeId, normalized);
    }
  }

  // -------------------------------------------------------------------------
  // Influence Score Computation
  // -------------------------------------------------------------------------

  /** Compute comprehensive influence score for a node */
  computeInfluenceScore(nodeId: string): InfluenceScore | null {
    if (!this.store.hasNode(nodeId)) return null;

    // Ensure PageRank is computed
    if (this.ranks.size === 0) {
      this.computePageRank();
    }

    const components = this.calculateComponents(nodeId);
    const rawScore = this.computeCompositeScore(components);
    const normalizedScore = Math.min(Math.max(rawScore, 0), 100);

    const allScores = this.getAllScoresSorted();
    const rank = allScores.findIndex(([id]) => id === nodeId) + 1;
    const percentile = ((allScores.length - rank) / allScores.length) * 100;

    const influenceScore: InfluenceScore = {
      nodeId,
      score: normalizedScore,
      rank,
      components,
      percentile,
      calculatedAt: Date.now(),
    };

    this.influenceCache.set(nodeId, influenceScore);
    return influenceScore;
  }

  /** Calculate influence components for a node */
  private calculateComponents(nodeId: string): InfluenceComponents {
    const inDegree = this.store.getInDegree(nodeId);
    const outDegree = this.store.getOutDegree(nodeId);
    const totalNodes = this.store.getNodeCount();

    // Follower weight: ratio of followers to total graph size (log scaled)
    const followerWeight =
      totalNodes > 1 ? Math.min(Math.log2(inDegree + 1) / Math.log2(totalNodes), 1.0) : 0;

    // Engagement weight: ratio of out-degree (activity) scaled
    const engagementWeight =
      totalNodes > 1 ? Math.min(Math.log2(outDegree + 1) / Math.log2(totalNodes), 1.0) : 0;

    // Content quality: based on average edge weight of incoming edges
    let totalInWeight = 0;
    const inNeighbors = this.store.getInNeighbors(nodeId, { excludeBlocked: true });
    for (const neighbor of inNeighbors) {
      const edge = this.store.getEdge(neighbor, nodeId);
      totalInWeight += edge?.weight || 0;
    }
    const contentQuality =
      inNeighbors.length > 0 ? Math.min(totalInWeight / inNeighbors.length, 1.0) : 0;

    // Network centrality: PageRank score normalized
    const pageRankScore = this.ranks.get(nodeId) || 0;
    const networkCentrality = Math.min(pageRankScore / 100, 1.0);

    // Activity consistency: ratio of bidirectional connections
    const outNeighborSet = new Set(this.store.getOutNeighbors(nodeId, { excludeBlocked: true }));
    let bidirectionalCount = 0;
    for (const neighbor of inNeighbors) {
      if (outNeighborSet.has(neighbor)) {
        bidirectionalCount++;
      }
    }
    const activityConsistency =
      inNeighbors.length > 0 ? bidirectionalCount / inNeighbors.length : 0;

    return {
      followerWeight,
      engagementWeight,
      contentQuality,
      networkCentrality,
      activityConsistency,
    };
  }

  /** Compute composite score from components */
  private computeCompositeScore(components: InfluenceComponents): number {
    const weights = {
      followerWeight: 0.3,
      engagementWeight: 0.2,
      contentQuality: 0.2,
      networkCentrality: 0.2,
      activityConsistency: 0.1,
    };

    const score =
      components.followerWeight * weights.followerWeight * 100 +
      components.engagementWeight * weights.engagementWeight * 100 +
      components.contentQuality * weights.contentQuality * 100 +
      components.networkCentrality * weights.networkCentrality * 100 +
      components.activityConsistency * weights.activityConsistency * 100;

    return score;
  }

  // -------------------------------------------------------------------------
  // Top-N and Ranking Queries
  // -------------------------------------------------------------------------

  /** Get top N influential nodes */
  getTopInfluential(n: number = 10): InfluenceScore[] {
    if (this.ranks.size === 0) {
      this.computePageRank();
    }

    const allScores = this.getAllScoresSorted();
    const results: InfluenceScore[] = [];

    for (let i = 0; i < Math.min(n, allScores.length); i++) {
      const entry = allScores[i];
      if (!entry) continue;
      const [nodeId] = entry;
      const score = this.computeInfluenceScore(nodeId);
      if (score) results.push(score);
    }

    return results;
  }

  /** Get all scores sorted by rank */
  private getAllScoresSorted(): Array<[string, number]> {
    const scores: Array<[string, number]> = [];
    for (const nodeId of this.store.getAllNodeIds()) {
      const components = this.calculateComponents(nodeId);
      const score = this.computeCompositeScore(components);
      scores.push([nodeId, score]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    return scores;
  }

  /** Get rank of a specific node */
  getNodeRank(nodeId: string): number {
    const allScores = this.getAllScoresSorted();
    const index = allScores.findIndex(([id]) => id === nodeId);
    return index >= 0 ? index + 1 : -1;
  }

  // -------------------------------------------------------------------------
  // Trending Detection
  // -------------------------------------------------------------------------

  /** Record growth metrics snapshot for a node */
  recordGrowthSnapshot(nodeId: string): void {
    if (!this.store.hasNode(nodeId)) return;

    const followers = this.store.getInDegree(nodeId);
    const following = this.store.getOutDegree(nodeId);
    const ratio = following > 0 ? followers / following : followers;

    const history = this.growthHistory.get(nodeId) || [];
    const previousEntry = history[history.length - 1];
    const velocity = previousEntry ? followers - previousEntry.followers : 0;
    const acceleration = previousEntry ? velocity - previousEntry.velocity : 0;
    const projectedGrowth = followers + velocity * 7; // 7-period projection

    const metrics: NetworkGrowthMetrics = {
      nodeId,
      date: Date.now(),
      followers,
      following,
      ratio,
      velocity,
      acceleration,
      projectedGrowth,
    };

    history.push(metrics);
    // Keep last 90 entries
    if (history.length > 90) {
      history.shift();
    }
    this.growthHistory.set(nodeId, history);
  }

  /** Detect trending accounts based on growth patterns */
  detectTrending(limit: number = 10): TrendingAccount[] {
    const trending: TrendingAccount[] = [];

    for (const [nodeId, history] of this.growthHistory) {
      if (history.length < 2) continue;

      const current = history[history.length - 1]!;
      const previous = history[history.length - 2]!;

      // Calculate growth rate
      const growthRate =
        previous.followers > 0
          ? (current.followers - previous.followers) / previous.followers
          : current.followers > 0
            ? 1.0
            : 0;

      // Calculate engagement spike (acceleration in connections)
      const avgVelocity = history.reduce((sum, h) => sum + h.velocity, 0) / history.length;
      const engagementSpike =
        avgVelocity > 0 ? current.velocity / avgVelocity : current.velocity > 0 ? 2.0 : 0;

      // Minimum threshold for trending
      if (growthRate < 0.05 && engagementSpike < 1.5) continue;

      // Combined trending score
      const score = growthRate * 50 + Math.min(engagementSpike, 5) * 10;

      trending.push({
        nodeId,
        growthRate,
        engagementSpike,
        score,
        trendStarted: this.findTrendStart(history),
        currentFollowers: current.followers,
        previousFollowers: previous.followers,
      });
    }

    trending.sort((a, b) => b.score - a.score);
    return trending.slice(0, limit);
  }

  /** Find when the growth trend started */
  private findTrendStart(history: NetworkGrowthMetrics[]): number {
    if (history.length < 3) return history[0]?.date ?? Date.now();

    // Walk backward to find when velocity became consistently positive
    for (let i = history.length - 2; i >= 0; i--) {
      if (history[i]!.velocity <= 0) {
        return history[i + 1]?.date ?? history[i]!.date;
      }
    }

    return history[0]!.date;
  }

  // -------------------------------------------------------------------------
  // Growth Metrics Queries
  // -------------------------------------------------------------------------

  /** Get growth history for a node */
  getGrowthHistory(nodeId: string): NetworkGrowthMetrics[] {
    return this.growthHistory.get(nodeId) || [];
  }

  /** Get current growth velocity for a node */
  getCurrentVelocity(nodeId: string): number {
    const history = this.growthHistory.get(nodeId);
    if (!history || history.length === 0) return 0;
    return history[history.length - 1]!.velocity;
  }

  /** Get iteration count from last PageRank computation */
  getLastIterationCount(): number {
    return this.iterationsUsed;
  }

  /** Get timestamp of last computation */
  getLastComputeTime(): number {
    return this.lastComputeTime;
  }

  /** Check if cache is stale (older than given ms) */
  isCacheStale(maxAgeMs: number = 300000): boolean {
    return Date.now() - this.lastComputeTime > maxAgeMs;
  }

  /** Clear all cached data */
  clearCache(): void {
    this.ranks.clear();
    this.previousRanks.clear();
    this.influenceCache.clear();
    this.lastComputeTime = 0;
    this.iterationsUsed = 0;
  }

  /** Update configuration */
  updateConfig(config: Partial<PageRankConfig>): void {
    if (config.dampingFactor !== undefined) this.config.dampingFactor = config.dampingFactor;
    if (config.maxIterations !== undefined) this.config.maxIterations = config.maxIterations;
    if (config.convergenceThreshold !== undefined)
      this.config.convergenceThreshold = config.convergenceThreshold;
    if (config.personalizationVector !== undefined)
      this.config.personalizationVector = config.personalizationVector;
    this.clearCache();
  }
}
