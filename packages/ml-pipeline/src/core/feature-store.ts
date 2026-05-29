// ============================================================================
// ML Pipeline - Feature Store
// ============================================================================

import {
  Feature,
  FeatureSet,
  FeatureStoreConfig,
  FeatureStats,
  FeatureSchema,
  FeatureLineage,
  TransformConfig,
} from '../types';

interface StoredFeature {
  feature: Feature;
  expiresAt: number;
  version: number;
}

interface FeatureImportance {
  featureName: string;
  correlation: number;
  mutualInfo: number;
  lastComputed: number;
}

interface WelfordState {
  count: number;
  mean: number;
  m2: number;
  min: number;
  max: number;
  sum: number;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: In-memory feature cache
 * Production path: Use Feast or Tecton feature store
 */
export class FeatureStore {
  private config: FeatureStoreConfig;
  private schemas: Map<string, FeatureSchema> = new Map();
  private storage: Map<string, Map<string, StoredFeature>> = new Map();
  private stats: Map<string, WelfordState> = new Map();
  private histograms: Map<string, number[]> = new Map();
  private lineage: Map<string, FeatureLineage> = new Map();
  private importance: Map<string, FeatureImportance> = new Map();
  private versionHistory: Map<string, FeatureSchema[]> = new Map();

  constructor(config: Partial<FeatureStoreConfig> = {}) {
    this.config = {
      maxFeatures: config.maxFeatures ?? 100000,
      defaultTTL: config.defaultTTL ?? 3600000,
      enableVersioning: config.enableVersioning ?? true,
      enableStatistics: config.enableStatistics ?? true,
      batchSize: config.batchSize ?? 1000,
      storageBackend: config.storageBackend ?? 'memory',
    };
  }

  registerFeature(schema: FeatureSchema): void {
    const existing = this.schemas.get(schema.name);
    if (existing && this.config.enableVersioning) {
      const history = this.versionHistory.get(schema.name) ?? [];
      history.push(existing);
      this.versionHistory.set(schema.name, history);
    }
    this.schemas.set(schema.name, schema);
    if (!this.storage.has(schema.name)) {
      this.storage.set(schema.name, new Map());
    }
    this.lineage.set(schema.name, {
      featureName: schema.name,
      sourceData: [],
      transforms: schema.transforms,
      createdAt: Date.now(),
      version: (this.versionHistory.get(schema.name)?.length ?? 0) + 1,
    });
  }

  computeFeature(
    entityId: string,
    featureName: string,
    rawValue: number | string | boolean | number[],
  ): Feature {
    const schema = this.schemas.get(featureName);
    if (!schema) {
      throw new Error(`Feature schema not found: ${featureName}`);
    }
    let value = rawValue;
    for (const transform of schema.transforms) {
      value = this.applyTransform(value, transform, featureName);
    }
    const feature: Feature = {
      name: featureName,
      dtype: schema.dtype,
      value,
      timestamp: Date.now(),
      entityId,
      version: (this.versionHistory.get(featureName)?.length ?? 0) + 1,
    };
    this.storeFeature(entityId, feature);
    if (this.config.enableStatistics && typeof value === 'number') {
      this.updateStatistics(featureName, value);
    }
    return feature;
  }

  private applyTransform(
    value: number | string | boolean | number[],
    transform: TransformConfig,
    featureName: string,
  ): number | string | boolean | number[] {
    if (typeof value !== 'number' && !Array.isArray(value)) {
      return value;
    }
    switch (transform.type) {
      case 'normalize': {
        const min = (transform.params.min as number) ?? 0;
        const max = (transform.params.max as number) ?? 1;
        const range = max - min;
        if (range === 0) return 0;
        return ((value as number) - min) / range;
      }
      case 'standardize': {
        const state = this.stats.get(featureName);
        if (!state || state.count < 2) return value;
        const std = Math.sqrt(state.m2 / (state.count - 1));
        if (std === 0) return 0;
        return ((value as number) - state.mean) / std;
      }
      case 'log': {
        const offset = (transform.params.offset as number) ?? 1;
        return Math.log((value as number) + offset);
      }
      case 'bucketize': {
        const boundaries = transform.params.boundaries as number[];
        if (!boundaries) return value;
        const numVal = value as number;
        for (let i = 0; i < boundaries.length; i++) {
          if (numVal < boundaries[i]!) return i;
        }
        return boundaries.length;
      }
      case 'one_hot': {
        const numCategories = (transform.params.numCategories as number) ?? 10;
        const idx = Math.floor(value as number) % numCategories;
        const vec = new Array(numCategories).fill(0);
        vec[idx] = 1;
        return vec;
      }
      case 'clip': {
        const lo = (transform.params.min as number) ?? -Infinity;
        const hi = (transform.params.max as number) ?? Infinity;
        return Math.max(lo, Math.min(hi, value as number));
      }
      case 'power': {
        const exp = (transform.params.exponent as number) ?? 2;
        return Math.pow(value as number, exp);
      }
      default:
        return value;
    }
  }

  private storeFeature(entityId: string, feature: Feature): void {
    const featureMap = this.storage.get(feature.name);
    if (!featureMap) return;
    const ttl = this.config.defaultTTL;
    featureMap.set(entityId, {
      feature,
      expiresAt: Date.now() + ttl,
      version: feature.version ?? 1,
    });
    if (featureMap.size > this.config.maxFeatures) {
      this.evictExpired(feature.name);
    }
  }

  private evictExpired(featureName: string): void {
    const featureMap = this.storage.get(featureName);
    if (!featureMap) return;
    const now = Date.now();
    for (const [key, stored] of featureMap.entries()) {
      if (stored.expiresAt < now) {
        featureMap.delete(key);
      }
    }
  }

  getFeature(entityId: string, featureName: string): Feature | null {
    const featureMap = this.storage.get(featureName);
    if (!featureMap) return null;
    const stored = featureMap.get(entityId);
    if (!stored) return null;
    if (stored.expiresAt < Date.now()) {
      featureMap.delete(entityId);
      return null;
    }
    return stored.feature;
  }

  getFeaturesBatch(entityIds: string[], featureNames: string[]): Map<string, Feature[]> {
    const result = new Map<string, Feature[]>();
    for (const entityId of entityIds) {
      const features: Feature[] = [];
      for (const name of featureNames) {
        const feature = this.getFeature(entityId, name);
        if (feature) features.push(feature);
      }
      result.set(entityId, features);
    }
    return result;
  }

  getFeatureSet(entityId: string, featureNames: string[]): FeatureSet {
    const features: Feature[] = [];
    for (const name of featureNames) {
      const feature = this.getFeature(entityId, name);
      if (feature) features.push(feature);
    }
    return {
      name: `entity_${entityId}_features`,
      features,
      entityType: 'default',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private updateStatistics(featureName: string, value: number): void {
    let state = this.stats.get(featureName);
    if (!state) {
      state = { count: 0, mean: 0, m2: 0, min: Infinity, max: -Infinity, sum: 0 };
    }
    // Welford's online algorithm for running mean and variance
    state.count += 1;
    state.sum += value;
    const delta = value - state.mean;
    state.mean += delta / state.count;
    const delta2 = value - state.mean;
    state.m2 += delta * delta2;
    state.min = Math.min(state.min, value);
    state.max = Math.max(state.max, value);
    this.stats.set(featureName, state);
    // Update histogram
    this.updateHistogram(featureName, value);
  }

  private updateHistogram(featureName: string, value: number): void {
    const numBins = 20;
    let bins = this.histograms.get(featureName);
    if (!bins) {
      bins = new Array(numBins).fill(0);
      this.histograms.set(featureName, bins);
    }
    const state = this.stats.get(featureName)!;
    if (state.max === state.min) {
      bins[0]! += 1;
      return;
    }
    const range = state.max - state.min;
    const binWidth = range / numBins;
    const binIdx = Math.min(Math.floor((value - state.min) / binWidth), numBins - 1);
    bins[binIdx]! += 1;
  }

  getStatistics(featureName: string): FeatureStats | null {
    const state = this.stats.get(featureName);
    if (!state || state.count === 0) return null;
    const variance = state.count > 1 ? state.m2 / (state.count - 1) : 0;
    const std = Math.sqrt(variance);
    const bins = this.histograms.get(featureName) ?? [];
    const histogram = bins.map((count, i) => {
      const binWidth = state.max === state.min ? 1 : (state.max - state.min) / bins.length;
      return { bin: state.min + i * binWidth, count };
    });
    // Compute skewness and kurtosis from running statistics
    const skewness =
      state.count > 2 && std > 0
        ? ((state.count * state.m2) / ((state.count - 1) * (state.count - 2) * std * std * std)) *
          (state.sum - state.count * state.mean)
        : 0;
    return {
      mean: state.mean,
      std,
      min: state.min,
      max: state.max,
      count: state.count,
      histogram,
      lastUpdated: Date.now(),
      variance,
      skewness: isFinite(skewness) ? skewness : 0,
      kurtosis: 0,
    };
  }

  computeCorrelation(featureName: string, targetValues: number[]): number {
    const featureMap = this.storage.get(featureName);
    if (!featureMap) return 0;
    const featureValues: number[] = [];
    for (const [, stored] of featureMap.entries()) {
      if (typeof stored.feature.value === 'number') {
        featureValues.push(stored.feature.value);
      }
    }
    const n = Math.min(featureValues.length, targetValues.length);
    if (n < 2) return 0;
    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0,
      sumY2 = 0;
    for (let i = 0; i < n; i++) {
      const x = featureValues[i]!;
      const y = targetValues[i]!;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if (denominator === 0) return 0;
    const correlation = numerator / denominator;
    this.importance.set(featureName, {
      featureName,
      correlation: Math.abs(correlation),
      mutualInfo: this.computeMutualInfo(featureValues.slice(0, n), targetValues.slice(0, n)),
      lastComputed: Date.now(),
    });
    return correlation;
  }

  private computeMutualInfo(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;
    const numBins = Math.max(2, Math.floor(Math.sqrt(n)));
    const xMin = Math.min(...x),
      xMax = Math.max(...x);
    const yMin = Math.min(...y),
      yMax = Math.max(...y);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const joint: number[][] = Array.from({ length: numBins }, () => new Array(numBins).fill(0));
    const xMarginal = new Array(numBins).fill(0);
    const yMarginal = new Array(numBins).fill(0);
    for (let i = 0; i < n; i++) {
      const xi = Math.min(Math.floor(((x[i]! - xMin) / xRange) * numBins), numBins - 1);
      const yi = Math.min(Math.floor(((y[i]! - yMin) / yRange) * numBins), numBins - 1);
      joint[xi]![yi]! += 1;
      xMarginal[xi]! += 1;
      yMarginal[yi]! += 1;
    }
    let mi = 0;
    for (let i = 0; i < numBins; i++) {
      for (let j = 0; j < numBins; j++) {
        const pxy = joint[i]![j]! / n;
        const px = xMarginal[i]! / n;
        const py = yMarginal[j]! / n;
        if (pxy > 0 && px > 0 && py > 0) {
          mi += pxy * Math.log(pxy / (px * py));
        }
      }
    }
    return mi;
  }

  getImportance(featureName: string): FeatureImportance | null {
    return this.importance.get(featureName) ?? null;
  }

  getTopFeatures(targetValues: number[], topK: number = 10): FeatureImportance[] {
    const results: FeatureImportance[] = [];
    for (const name of this.schemas.keys()) {
      this.computeCorrelation(name, targetValues);
      const imp = this.importance.get(name);
      if (imp) results.push(imp);
    }
    results.sort((a, b) => b.correlation - a.correlation);
    return results.slice(0, topK);
  }

  getLineage(featureName: string): FeatureLineage | null {
    return this.lineage.get(featureName) ?? null;
  }

  getVersionHistory(featureName: string): FeatureSchema[] {
    return this.versionHistory.get(featureName) ?? [];
  }

  getSchema(featureName: string): FeatureSchema | null {
    return this.schemas.get(featureName) ?? null;
  }

  listFeatures(): string[] {
    return Array.from(this.schemas.keys());
  }

  getEntityCount(featureName: string): number {
    const featureMap = this.storage.get(featureName);
    return featureMap?.size ?? 0;
  }

  deleteFeature(featureName: string): boolean {
    this.schemas.delete(featureName);
    this.storage.delete(featureName);
    this.stats.delete(featureName);
    this.histograms.delete(featureName);
    this.lineage.delete(featureName);
    this.importance.delete(featureName);
    this.versionHistory.delete(featureName);
    return true;
  }

  clear(): void {
    this.schemas.clear();
    this.storage.clear();
    this.stats.clear();
    this.histograms.clear();
    this.lineage.clear();
    this.importance.clear();
    this.versionHistory.clear();
  }

  getSize(): number {
    let total = 0;
    for (const [, featureMap] of this.storage.entries()) {
      total += featureMap.size;
    }
    return total;
  }

  exportState(): { schemas: [string, FeatureSchema][]; stats: [string, WelfordState][] } {
    return {
      schemas: Array.from(this.schemas.entries()),
      stats: Array.from(this.stats.entries()),
    };
  }
}
