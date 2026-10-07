// ============================================================================
// A/B Test Integration - Experiment framework for ranking algorithms
// ============================================================================

import type { FeedService } from './feed-service.js';
import type { ABTestBucket, FeedRequest, FeedResponse } from './types.js';
import { AlgorithmType } from './types.js';

export interface ExperimentConfig {
  id: string;
  name: string;
  buckets: string[];
  trafficAllocation: Record<string, number>;
}

export interface ExperimentResult {
  experimentId: string;
  pValue: number;
  lift: number;
  significant: boolean;
  bucketStats: Record<string, { exposures: number; conversions: number; rate: number }>;
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

export interface RankingExperimentConfig {
  experimentId: string;
  name: string;
  controlAlgorithm: AlgorithmType;
  treatmentAlgorithms: AlgorithmType[];
}

/**
 * Deterministic experiment service compatible with @quant/recommendations ExperimentService.
 */
class ExperimentService {
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

    const hash = this.deterministicHash(userId + ':' + experimentId);
    const normalized = (hash >>> 0) / 0xffffffff;

    let cumulative = 0;
    for (const bucket of experiment.buckets) {
      cumulative += experiment.trafficAllocation[bucket] ?? 1 / experiment.buckets.length;
      if (normalized < cumulative) {
        return bucket;
      }
    }

    return experiment.buckets[experiment.buckets.length - 1] ?? 'control';
  }

  logExposure(userId: string, experimentId: string, bucket: string): void {
    this.exposures.push({ userId, experimentId, bucket, timestamp: Date.now() });
  }

  logConversion(userId: string, experimentId: string, converted: boolean): void {
    this.conversions.push({ userId, experimentId, converted });
  }

  computeResult(experimentId: string): ExperimentResult {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

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

    const buckets = experiment.buckets;
    const control = bucketStats[buckets[0] ?? ''];
    const treatment = bucketStats[buckets[1] ?? ''];

    let pValue = 1;
    let lift = 0;

    if (control && treatment && control.exposures > 0 && treatment.exposures > 0) {
      const pA = control.conversions / control.exposures;
      const pB = treatment.conversions / treatment.exposures;
      const pPool =
        (control.conversions + treatment.conversions) / (control.exposures + treatment.exposures);
      const se = Math.sqrt(pPool * (1 - pPool) * (1 / control.exposures + 1 / treatment.exposures));
      if (se > 0) {
        const z = (pB - pA) / se;
        pValue = 2 * (1 - this.normalCDF(Math.abs(z)));
        lift = pA > 0 ? (pB - pA) / pA : 0;
      }
    }

    return {
      experimentId,
      pValue,
      lift,
      significant: pValue < 0.05,
      bucketStats,
    };
  }

  getExposureCount(experimentId: string): number {
    return this.exposures.filter((e) => e.experimentId === experimentId).length;
  }

  private normalCDF(x: number): number {
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
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash;
  }
}

export class ABTestIntegration {
  private experimentService: ExperimentService;
  private experimentAlgorithms: Map<string, Map<string, AlgorithmType>> = new Map();

  constructor(experimentService?: ExperimentService) {
    this.experimentService = experimentService ?? new ExperimentService();
  }

  createExperiment(config: RankingExperimentConfig): void {
    const buckets = ['control', ...config.treatmentAlgorithms.map((_, i) => `treatment_${i}`)];
    const trafficAllocation: Record<string, number> = {};
    const share = 1 / buckets.length;
    for (const bucket of buckets) {
      trafficAllocation[bucket] = share;
    }

    this.experimentService.registerExperiment({
      id: config.experimentId,
      name: config.name,
      buckets,
      trafficAllocation,
    });

    const algorithmMap = new Map<string, AlgorithmType>();
    algorithmMap.set('control', config.controlAlgorithm);
    config.treatmentAlgorithms.forEach((algo, i) => {
      algorithmMap.set(`treatment_${i}`, algo);
    });
    this.experimentAlgorithms.set(config.experimentId, algorithmMap);
  }

  assignUserBucket(userId: string, experimentId: string): ABTestBucket {
    const bucket = this.experimentService.assignBucket(userId, experimentId);
    const algorithmMap = this.experimentAlgorithms.get(experimentId);
    const algorithm = algorithmMap?.get(bucket) ?? AlgorithmType.Chrono;

    this.experimentService.logExposure(userId, experimentId, bucket);

    return {
      experimentId,
      bucket,
      algorithm,
    };
  }

  getFeedWithExperiment(
    feedService: FeedService,
    request: FeedRequest,
    experimentId: string,
  ): FeedResponse {
    const bucketAssignment = this.assignUserBucket(request.userId, experimentId);
    return feedService.getFeedWithAlgorithm(request, bucketAssignment.algorithm);
  }

  logConversion(userId: string, experimentId: string, converted: boolean): void {
    this.experimentService.logConversion(userId, experimentId, converted);
  }

  computeResult(experimentId: string): ExperimentResult {
    return this.experimentService.computeResult(experimentId);
  }

  getExperimentService(): ExperimentService {
    return this.experimentService;
  }
}
