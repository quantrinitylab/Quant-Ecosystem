// ============================================================================
// Recommendations Package - A/B Testing for Recommendations
// ============================================================================

import type { ABVariant, TestMetrics } from '../types';

/** A/B test experiment */
interface Experiment {
  id: string;
  name: string;
  variants: ABVariant[];
  startedAt: number;
  endedAt: number | null;
  winner: string | null;
  minSampleSize: number;
}

/** Recommendation A/B testing with statistical significance */
export class RecommendationABTest {
  private experiments: Map<string, Experiment>;
  private variantMetrics: Map<string, Map<string, TestMetrics>>;
  private userAssignments: Map<string, Map<string, string>>;
  private hashSeed: number;

  constructor() {
    this.experiments = new Map();
    this.variantMetrics = new Map();
    this.userAssignments = new Map();
    this.hashSeed = 42;
  }

  /** Create a new experiment */
  createExperiment(id: string, name: string, variants: ABVariant[]): void {
    // Validate traffic percentages sum to 100
    const totalTraffic = variants.reduce((sum, v) => sum + v.trafficPercentage, 0);
    if (Math.abs(totalTraffic - 100) > 0.01) {
      throw new Error(`Traffic percentages must sum to 100, got ${totalTraffic}`);
    }

    const experiment: Experiment = {
      id,
      name,
      variants,
      startedAt: Date.now(),
      endedAt: null,
      winner: null,
      minSampleSize: this.calculateMinSampleSize(0.05, 0.8, 0.02),
    };

    this.experiments.set(id, experiment);

    // Initialize metrics for each variant
    const metrics: Map<string, TestMetrics> = new Map();
    for (const variant of variants) {
      metrics.set(variant.id, {
        variantId: variant.id,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        engagementTime: 0,
        revenue: 0,
        ctr: 0,
        conversionRate: 0,
      });
    }
    this.variantMetrics.set(id, metrics);
  }

  /** Assign user to a variant deterministically using hash */
  assignVariant(experimentId: string, userId: string): string | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || experiment.endedAt !== null) return null;

    // Check cached assignment
    const userExps = this.userAssignments.get(userId);
    if (userExps && userExps.has(experimentId)) {
      return userExps.get(experimentId)!;
    }

    // Deterministic hash-based assignment
    const hash = this.deterministicHash(userId, experimentId);
    const bucket = hash % 100;

    let cumulativeTraffic = 0;
    let assignedVariant = experiment.variants[0]!.id;

    for (const variant of experiment.variants) {
      cumulativeTraffic += variant.trafficPercentage;
      if (bucket < cumulativeTraffic) {
        assignedVariant = variant.id;
        break;
      }
    }

    // Cache assignment
    if (!this.userAssignments.has(userId)) {
      this.userAssignments.set(userId, new Map());
    }
    this.userAssignments.get(userId)!.set(experimentId, assignedVariant);

    return assignedVariant;
  }

  /** Deterministic hash for consistent user assignment */
  private deterministicHash(userId: string, experimentId: string): number {
    const str = `${userId}:${experimentId}:${this.hashSeed}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /** Record an impression for a variant */
  recordImpression(experimentId: string, variantId: string): void {
    const metrics = this.variantMetrics.get(experimentId)?.get(variantId);
    if (!metrics) return;
    metrics.impressions++;
    this.updateDerivedMetrics(metrics);
  }

  /** Record a click for a variant */
  recordClick(experimentId: string, variantId: string): void {
    const metrics = this.variantMetrics.get(experimentId)?.get(variantId);
    if (!metrics) return;
    metrics.clicks++;
    this.updateDerivedMetrics(metrics);
  }

  /** Record a conversion for a variant */
  recordConversion(experimentId: string, variantId: string, revenue: number = 0): void {
    const metrics = this.variantMetrics.get(experimentId)?.get(variantId);
    if (!metrics) return;
    metrics.conversions++;
    metrics.revenue += revenue;
    this.updateDerivedMetrics(metrics);
  }

  /** Record engagement time */
  recordEngagement(experimentId: string, variantId: string, timeMs: number): void {
    const metrics = this.variantMetrics.get(experimentId)?.get(variantId);
    if (!metrics) return;
    metrics.engagementTime += timeMs;
    this.updateDerivedMetrics(metrics);
  }

  /** Update derived metrics (CTR, conversion rate) */
  private updateDerivedMetrics(metrics: TestMetrics): void {
    metrics.ctr = metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0;
    metrics.conversionRate = metrics.clicks > 0 ? metrics.conversions / metrics.clicks : 0;
  }

  /** Calculate z-test statistic between two variants */
  computeZScore(experimentId: string, variantA: string, variantB: string): number {
    const metricsMap = this.variantMetrics.get(experimentId);
    if (!metricsMap) return 0;

    const mA = metricsMap.get(variantA);
    const mB = metricsMap.get(variantB);
    if (!mA || !mB) return 0;

    const pA = mA.ctr;
    const pB = mB.ctr;
    const nA = mA.impressions;
    const nB = mB.impressions;

    if (nA === 0 || nB === 0) return 0;

    // Pooled proportion
    const pPooled = (mA.clicks + mB.clicks) / (nA + nB);
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / nA + 1 / nB));

    if (se === 0) return 0;
    return (pB - pA) / se;
  }

  /** Calculate p-value from z-score (two-tailed) */
  computePValue(zScore: number): number {
    // Approximation of the cumulative distribution function
    const absZ = Math.abs(zScore);
    const t = 1 / (1 + 0.2316419 * absZ);
    const d = 0.3989422804014327;
    const p =
      d *
      Math.exp((-absZ * absZ) / 2) *
      (0.3193815 * t +
        -0.3565638 * t * t +
        1.781478 * t * t * t +
        -1.821256 * t * t * t * t +
        1.330274 * t * t * t * t * t);
    return 2 * p; // Two-tailed
  }

  /** Check if result is statistically significant */
  isSignificant(
    experimentId: string,
    variantA: string,
    variantB: string,
    alpha: number = 0.05,
  ): boolean {
    const zScore = this.computeZScore(experimentId, variantA, variantB);
    const pValue = this.computePValue(zScore);
    return pValue < alpha;
  }

  /** Calculate confidence interval for a variant */
  computeConfidenceInterval(
    experimentId: string,
    variantId: string,
    confidenceLevel: number = 0.95,
  ): { lower: number; upper: number; point: number } {
    const metrics = this.variantMetrics.get(experimentId)?.get(variantId);
    if (!metrics || metrics.impressions === 0) {
      return { lower: 0, upper: 0, point: 0 };
    }

    const p = metrics.ctr;
    const n = metrics.impressions;
    // z-value for confidence level (e.g., 1.96 for 95%)
    const zValues: Record<number, number> = { 0.9: 1.645, 0.95: 1.96, 0.99: 2.576 };
    const z = zValues[confidenceLevel] || 1.96;

    const se = Math.sqrt((p * (1 - p)) / n);
    return {
      lower: Math.max(0, p - z * se),
      upper: Math.min(1, p + z * se),
      point: p,
    };
  }

  /** Calculate minimum sample size for desired power */
  calculateMinSampleSize(_alpha: number, power: number, mde: number): number {
    // Using formula: n = (Z_alpha/2 + Z_beta)^2 * 2 * p * (1-p) / MDE^2
    const zAlpha = 1.96; // For alpha = 0.05
    const zBeta = power === 0.8 ? 0.842 : 1.282; // 80% or 90% power
    const p = 0.5; // Conservative estimate

    const numerator = Math.pow(zAlpha + zBeta, 2) * 2 * p * (1 - p);
    const denominator = mde * mde;

    return Math.ceil(numerator / denominator);
  }

  /** Select winner of an experiment */
  selectWinner(experimentId: string): string | null {
    const experiment = this.experiments.get(experimentId);
    const metricsMap = this.variantMetrics.get(experimentId);
    if (!experiment || !metricsMap) return null;

    // Check if we have enough samples
    let hasEnoughSamples = true;
    for (const metrics of metricsMap.values()) {
      if (metrics.impressions < experiment.minSampleSize) {
        hasEnoughSamples = false;
        break;
      }
    }

    if (!hasEnoughSamples) return null;

    // Find best performing variant with significance
    const variants = Array.from(metricsMap.entries());
    variants.sort((a, b) => b[1].ctr - a[1].ctr);
    const best = variants[0]!;
    const control = variants[variants.length - 1]!;

    if (this.isSignificant(experimentId, control[0], best[0])) {
      experiment.winner = best[0];
      experiment.endedAt = Date.now();
      return best[0];
    }

    return null;
  }

  /** Get experiment results summary */
  getResults(experimentId: string): {
    experiment: Experiment | null;
    metrics: Map<string, TestMetrics>;
    significanceMatrix: Map<string, Map<string, boolean>>;
  } {
    const experiment = this.experiments.get(experimentId) || null;
    const metrics = this.variantMetrics.get(experimentId) || new Map();

    // Build significance matrix
    const sigMatrix: Map<string, Map<string, boolean>> = new Map();
    const variantIds = Array.from(metrics.keys());

    for (const vA of variantIds) {
      const row: Map<string, boolean> = new Map();
      for (const vB of variantIds) {
        if (vA === vB) {
          row.set(vB, false);
        } else {
          row.set(vB, this.isSignificant(experimentId, vA, vB));
        }
      }
      sigMatrix.set(vA, row);
    }

    return { experiment, metrics, significanceMatrix: sigMatrix };
  }

  /** Get all active experiments */
  getActiveExperiments(): Experiment[] {
    return Array.from(this.experiments.values()).filter((e) => e.endedAt === null);
  }
}
