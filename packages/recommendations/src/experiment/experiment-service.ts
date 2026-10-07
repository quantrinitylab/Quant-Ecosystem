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

export interface GuardrailMetric {
  name: string;
  threshold: number;
  direction: 'above' | 'below';
}

export interface GuardrailCheckResult {
  breached: boolean;
  metric?: string;
  value?: number;
  threshold?: number;
}

export interface BucketStore {
  get(userId: string, experimentId: string): string | null;
  set(userId: string, experimentId: string, bucket: string): void;
}

export class InMemoryBucketStore implements BucketStore {
  private store: Map<string, string> = new Map();

  get(userId: string, experimentId: string): string | null {
    return this.store.get(`${userId}:${experimentId}`) ?? null;
  }

  set(userId: string, experimentId: string, bucket: string): void {
    this.store.set(`${userId}:${experimentId}`, bucket);
  }
}

export class ExperimentService {
  private experiments: Map<string, ExperimentConfig> = new Map();
  private exposures: ExposureRecord[] = [];
  private conversions: ConversionRecord[] = [];
  private bucketStore: BucketStore;
  private guardrails: Map<string, GuardrailMetric[]> = new Map();
  private disabledExperiments: Set<string> = new Set();

  constructor(bucketStore?: BucketStore) {
    this.bucketStore = bucketStore ?? new InMemoryBucketStore();
  }

  registerExperiment(config: ExperimentConfig): void {
    this.experiments.set(config.id, config);
  }

  registerGuardrails(experimentId: string, metrics: GuardrailMetric[]): void {
    this.guardrails.set(experimentId, metrics);
  }

  checkGuardrails(
    experimentId: string,
    currentMetrics: Record<string, number>,
  ): GuardrailCheckResult {
    const guardrailMetrics = this.guardrails.get(experimentId);
    if (!guardrailMetrics) {
      return { breached: false };
    }

    for (const metric of guardrailMetrics) {
      const value = currentMetrics[metric.name];
      if (value === undefined) continue;

      if (metric.direction === 'above' && value > metric.threshold) {
        return { breached: true, metric: metric.name, value, threshold: metric.threshold };
      }
      if (metric.direction === 'below' && value < metric.threshold) {
        return { breached: true, metric: metric.name, value, threshold: metric.threshold };
      }
    }

    return { breached: false };
  }

  rollbackExperiment(experimentId: string): void {
    this.disabledExperiments.add(experimentId);
  }

  isExperimentActive(experimentId: string): boolean {
    return this.experiments.has(experimentId) && !this.disabledExperiments.has(experimentId);
  }

  assignBucket(userId: string, experimentId: string): string {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // If experiment is disabled, always return control (first bucket)
    if (this.disabledExperiments.has(experimentId)) {
      return experiment.buckets[0]!;
    }

    // Check sticky bucket store first
    const persisted = this.bucketStore.get(userId, experimentId);
    if (persisted !== null) {
      return persisted;
    }

    // Deterministic hash-based bucket assignment
    const hash = this.deterministicHash(userId + ':' + experimentId);
    const normalized = (hash >>> 0) / 0xffffffff; // normalize to [0, 1)

    // Assign based on traffic allocation
    let cumulative = 0;
    for (const bucket of experiment.buckets) {
      cumulative += experiment.trafficAllocation[bucket] ?? 1 / experiment.buckets.length;
      if (normalized < cumulative) {
        this.bucketStore.set(userId, experimentId, bucket);
        return bucket;
      }
    }

    // Fallback to last bucket
    const fallback = experiment.buckets[experiment.buckets.length - 1]!;
    this.bucketStore.set(userId, experimentId, fallback);
    return fallback;
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
    const control = bucketStats[buckets[0]!]!;
    const comparisons: BucketComparison[] = [];

    for (let i = 1; i < buckets.length; i++) {
      const treatment = bucketStats[buckets[i]!]!;
      const { pValue, lift } = this.zTestForProportions(
        control.conversions,
        control.exposures,
        treatment.conversions,
        treatment.exposures,
      );
      comparisons.push({
        control: buckets[0]!,
        treatment: buckets[i]!,
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
