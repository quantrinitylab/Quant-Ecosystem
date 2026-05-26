// ============================================================================
// Experiment Service - A/B testing with deterministic bucketing and stats
// ============================================================================

export interface ExperimentConfig {
  id: string;
  name: string;
  buckets: string[];
  trafficAllocation: Record<string, number>;
}

export interface ExposureRecord {
  userId: string;
  experimentId: string;
  bucket: string;
  timestamp: number;
}

export interface ConversionRecord {
  userId: string;
  experimentId: string;
  converted: boolean;
}

export interface BucketComparison {
  control: string;
  treatment: string;
  pValue: number;
  lift: number;
  significant: boolean;
}

export interface ExperimentResult {
  experimentId: string;
  pValue: number;
  lift: number;
  significant: boolean;
  bucketStats: Record<string, { exposures: number; conversions: number; rate: number }>;
  comparisons: BucketComparison[];
}

export class ExperimentService {
  private experiments: Map<string, ExperimentConfig> = new Map();
  private exposures: ExposureRecord[] = [];
  private conversions: ConversionRecord[] = [];

  registerExperiment(config: ExperimentConfig): void {
    this.experiments.set(config.id, config);
  }

  assignBucket(userId: string, experimentId: string): string {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Deterministic hash-based bucket assignment
    const hash = this.deterministicHash(userId + ':' + experimentId);
    const normalized = (hash >>> 0) / 0xffffffff; // normalize to [0, 1)

    // Assign based on traffic allocation
    let cumulative = 0;
    for (const bucket of experiment.buckets) {
      cumulative += experiment.trafficAllocation[bucket] ?? 1 / experiment.buckets.length;
      if (normalized < cumulative) {
        return bucket;
      }
    }

    // Fallback to last bucket
    return experiment.buckets[experiment.buckets.length - 1];
  }

  logExposure(userId: string, experimentId: string, bucket: string): void {
    this.exposures.push({
      userId,
      experimentId,
      bucket,
      timestamp: Date.now(),
    });
  }

  logConversion(userId: string, experimentId: string, converted: boolean): void {
    this.conversions.push({
      userId,
      experimentId,
      converted,
    });
  }

  computeResult(experimentId: string): ExperimentResult {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Gather stats per bucket
    const bucketStats: Record<string, { exposures: number; conversions: number; rate: number }> =
      {};

    for (const bucket of experiment.buckets) {
      const bucketExposures = this.exposures.filter(
        (e) => e.experimentId === experimentId && e.bucket === bucket,
      );
      const exposedUsers = new Set(bucketExposures.map((e) => e.userId));

      const bucketConversions = this.conversions.filter(
        (c) => c.experimentId === experimentId && c.converted && exposedUsers.has(c.userId),
      );

      const exposureCount = exposedUsers.size;
      const conversionCount = bucketConversions.length;
      const rate = exposureCount > 0 ? conversionCount / exposureCount : 0;

      bucketStats[bucket] = { exposures: exposureCount, conversions: conversionCount, rate };
    }

    // Compute pairwise comparisons: each treatment vs control
    const buckets = experiment.buckets;
    const control = bucketStats[buckets[0]];
    const comparisons: BucketComparison[] = [];

    for (let i = 1; i < buckets.length; i++) {
      const treatment = bucketStats[buckets[i]];
      const { pValue, lift } = this.zTestForProportions(
        control.conversions,
        control.exposures,
        treatment.conversions,
        treatment.exposures,
      );
      comparisons.push({
        control: buckets[0],
        treatment: buckets[i],
        pValue,
        lift,
        significant: pValue < 0.05,
      });
    }

    // Top-level pValue/lift use first treatment for backward compatibility
    const primaryComparison = comparisons[0] ?? { pValue: 1, lift: 0 };

    return {
      experimentId,
      pValue: primaryComparison.pValue,
      lift: primaryComparison.lift,
      significant: primaryComparison.pValue < 0.05,
      bucketStats,
      comparisons,
    };
  }

  private zTestForProportions(
    successA: number,
    nA: number,
    successB: number,
    nB: number,
  ): { pValue: number; lift: number } {
    if (nA === 0 || nB === 0) {
      return { pValue: 1, lift: 0 };
    }

    const pA = successA / nA;
    const pB = successB / nB;

    // Pooled proportion
    const pPool = (successA + successB) / (nA + nB);

    // Standard error
    const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));

    if (se === 0) {
      return { pValue: 1, lift: 0 };
    }

    // Z-statistic
    const z = (pB - pA) / se;

    // Two-tailed p-value using normal approximation
    const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

    // Lift
    const lift = pA > 0 ? (pB - pA) / pA : 0;

    return { pValue, lift };
  }

  private normalCDF(x: number): number {
    // Approximation of the standard normal CDF
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1.0 / (1.0 + p * absX);
    const y =
      1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp((-absX * absX) / 2);

    return 0.5 * (1.0 + sign * y);
  }

  private deterministicHash(input: string): number {
    // Simple but deterministic hash (FNV-1a inspired)
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash;
  }

  getExperiment(experimentId: string): ExperimentConfig | undefined {
    return this.experiments.get(experimentId);
  }

  getExposureCount(experimentId: string): number {
    return this.exposures.filter((e) => e.experimentId === experimentId).length;
  }
}
