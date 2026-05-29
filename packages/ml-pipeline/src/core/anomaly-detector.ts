// ============================================================================
// ML Pipeline - Anomaly Detector (Isolation Forest, Z-Score, Moving Average)
// ============================================================================

import { AnomalyResult, IsolationTree, AnomalyDetectorConfig } from '../types';

interface StreamingState {
  mean: number;
  variance: number;
  count: number;
  ema: number;
  threshold: number;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Pure JS isolation forest/z-score, no scikit-learn or ML framework
 * Production path: Use Python ML pipeline or ONNX model
 */
export class AnomalyDetector {
  private config: AnomalyDetectorConfig;
  private forest: IsolationTree[] = [];
  private trainingData: number[][] = [];
  private featureStats: { mean: number; std: number }[] = [];
  private streamingState: Map<string, StreamingState> = new Map();
  private detectionHistory: AnomalyResult[] = [];
  private maxHistorySize: number = 10000;

  constructor(config: Partial<AnomalyDetectorConfig> = {}) {
    this.config = {
      method: config.method ?? 'isolation_forest',
      contamination: config.contamination ?? 0.1,
      numTrees: config.numTrees ?? 100,
      maxDepth: config.maxDepth ?? 0,
      windowSize: config.windowSize ?? 50,
      threshold: config.threshold ?? 3.0,
    };
    if (this.config.maxDepth === 0) {
      this.config.maxDepth = Math.ceil(Math.log2(256));
    }
  }

  // Train the anomaly detector
  fit(data: number[][]): void {
    this.trainingData = data;
    this.computeFeatureStats(data);
    if (this.config.method === 'isolation_forest') {
      this.buildForest(data);
    }
  }

  private computeFeatureStats(data: number[][]): void {
    if (data.length === 0) return;
    const numFeatures = data[0]!.length;
    this.featureStats = [];
    for (let f = 0; f < numFeatures; f++) {
      const values = data.map((row) => row[f]!);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
      this.featureStats.push({ mean, std: Math.sqrt(variance) });
    }
  }

  // Isolation Forest: build random trees
  private buildForest(data: number[][]): void {
    this.forest = [];
    const sampleSize = Math.min(256, data.length);
    for (let t = 0; t < (this.config.numTrees ?? 100); t++) {
      const sample = this.bootstrapSample(data, sampleSize);
      const tree = this.buildIsolationTree(sample, 0, this.config.maxDepth!);
      this.forest.push(tree);
    }
  }

  private bootstrapSample(data: number[][], size: number): number[][] {
    const sample: number[][] = [];
    for (let i = 0; i < size; i++) {
      const idx = Math.floor(Math.random() * data.length);
      sample.push(data[idx]!);
    }
    return sample;
  }

  private buildIsolationTree(data: number[][], depth: number, maxDepth: number): IsolationTree {
    if (data.length <= 1 || depth >= maxDepth) {
      return {
        splitFeature: -1,
        splitValue: 0,
        left: null,
        right: null,
        size: data.length,
        depth,
      };
    }
    const numFeatures = data[0]!.length;
    const splitFeature = Math.floor(Math.random() * numFeatures);
    const featureValues = data.map((row) => row[splitFeature]!);
    const min = Math.min(...featureValues);
    const max = Math.max(...featureValues);
    if (min === max) {
      return {
        splitFeature: -1,
        splitValue: 0,
        left: null,
        right: null,
        size: data.length,
        depth,
      };
    }
    const splitValue = min + Math.random() * (max - min);
    const leftData = data.filter((row) => row[splitFeature]! < splitValue);
    const rightData = data.filter((row) => row[splitFeature]! >= splitValue);
    return {
      splitFeature,
      splitValue,
      left: this.buildIsolationTree(leftData, depth + 1, maxDepth),
      right: this.buildIsolationTree(rightData, depth + 1, maxDepth),
      size: data.length,
      depth,
    };
  }

  // Compute path length for a point in an isolation tree
  private pathLength(point: number[], tree: IsolationTree | null, depth: number): number {
    if (!tree || tree.splitFeature === -1) {
      // Approximate path length for external node
      const n = tree?.size ?? 1;
      return depth + this.averagePathLength(n);
    }
    if (point[tree.splitFeature]! < tree.splitValue) {
      return this.pathLength(point, tree.left, depth + 1);
    }
    return this.pathLength(point, tree.right, depth + 1);
  }

  // Average path length of unsuccessful search in BST (harmonic number formula)
  private averagePathLength(n: number): number {
    if (n <= 1) return 0;
    if (n === 2) return 1;
    const H = Math.log(n - 1) + 0.5772156649; // Euler-Mascheroni constant
    return 2 * H - (2 * (n - 1)) / n;
  }

  // Compute anomaly score using Isolation Forest
  private isolationForestScore(point: number[]): number {
    if (this.forest.length === 0) return 0.5;
    let totalPathLength = 0;
    for (const tree of this.forest) {
      totalPathLength += this.pathLength(point, tree, 0);
    }
    const avgPath = totalPathLength / this.forest.length;
    const n = Math.min(256, this.trainingData.length);
    const c = this.averagePathLength(n);
    // Anomaly score: closer to 1 means more anomalous
    const score = Math.pow(2, -avgPath / c);
    return score;
  }

  // Z-score anomaly detection
  private zScoreDetect(point: number[]): {
    score: number;
    isAnomaly: boolean;
    contributions: { feature: string; contribution: number }[];
  } {
    const threshold = this.config.threshold ?? 3.0;
    const contributions: { feature: string; contribution: number }[] = [];
    let maxZScore = 0;
    for (let f = 0; f < point.length; f++) {
      const stats = this.featureStats[f];
      if (!stats || stats.std === 0) continue;
      const zScore = Math.abs((point[f]! - stats.mean) / stats.std);
      contributions.push({ feature: `feature_${f}`, contribution: zScore });
      maxZScore = Math.max(maxZScore, zScore);
    }
    contributions.sort((a, b) => b.contribution - a.contribution);
    // Normalize score to [0, 1]
    const normalizedScore = 1 - Math.exp(-maxZScore / threshold);
    return {
      score: normalizedScore,
      isAnomaly: maxZScore > threshold,
      contributions: contributions.slice(0, 5),
    };
  }

  // Moving average anomaly detection
  private movingAverageDetect(
    value: number,
    streamId: string = 'default',
  ): { score: number; isAnomaly: boolean } {
    let state = this.streamingState.get(streamId);
    if (!state) {
      state = {
        mean: value,
        variance: 0,
        count: 0,
        ema: value,
        threshold: this.config.threshold ?? 3.0,
      };
      this.streamingState.set(streamId, state);
      return { score: 0, isAnomaly: false };
    }
    // Exponential moving average
    const alpha = 2 / ((this.config.windowSize ?? 50) + 1);
    state.ema = alpha * value + (1 - alpha) * state.ema;
    // Update running variance (Welford)
    state.count++;
    const delta = value - state.mean;
    state.mean += delta / state.count;
    const delta2 = value - state.mean;
    state.variance += (delta * delta2 - state.variance) / state.count;
    const std = Math.sqrt(Math.max(state.variance, 1e-10));
    const deviation = Math.abs(value - state.ema) / std;
    const isAnomaly = deviation > state.threshold;
    // Normalize score
    const score = 1 - Math.exp(-deviation / state.threshold);
    return { score, isAnomaly };
  }

  // Mahalanobis distance (simplified with diagonal covariance)
  private mahalanobisDetect(point: number[]): { score: number; isAnomaly: boolean } {
    let mahalDist = 0;
    for (let f = 0; f < point.length; f++) {
      const stats = this.featureStats[f];
      if (!stats || stats.std === 0) continue;
      const normalized = (point[f]! - stats.mean) / stats.std;
      mahalDist += normalized * normalized;
    }
    mahalDist = Math.sqrt(mahalDist / Math.max(point.length, 1));
    const threshold = this.config.threshold ?? 3.0;
    const score = 1 - Math.exp(-mahalDist / threshold);
    return { score, isAnomaly: mahalDist > threshold };
  }

  // Main detect method
  detect(point: number[]): AnomalyResult {
    let score: number;
    let isAnomaly: boolean;
    let contributions: { feature: string; contribution: number }[] | undefined;
    switch (this.config.method) {
      case 'isolation_forest': {
        score = this.isolationForestScore(point);
        const threshold = 0.5 + this.config.contamination * 0.5;
        isAnomaly = score > threshold;
        break;
      }
      case 'zscore': {
        const result = this.zScoreDetect(point);
        score = result.score;
        isAnomaly = result.isAnomaly;
        contributions = result.contributions;
        break;
      }
      case 'moving_average': {
        const result = this.movingAverageDetect(point[0] ?? 0);
        score = result.score;
        isAnomaly = result.isAnomaly;
        break;
      }
      case 'mahalanobis': {
        const result = this.mahalanobisDetect(point);
        score = result.score;
        isAnomaly = result.isAnomaly;
        break;
      }
      default:
        score = 0;
        isAnomaly = false;
    }
    const result: AnomalyResult = {
      isAnomaly,
      score,
      threshold: this.config.threshold ?? 3.0,
      method: this.config.method,
      timestamp: Date.now(),
      contributingFeatures: contributions,
    };
    this.trackResult(result);
    return result;
  }

  // Streaming anomaly detection (one point at a time)
  detectStreaming(value: number, streamId: string = 'default'): AnomalyResult {
    const { score, isAnomaly } = this.movingAverageDetect(value, streamId);
    const result: AnomalyResult = {
      isAnomaly,
      score,
      threshold: this.config.threshold ?? 3.0,
      method: 'moving_average',
      timestamp: Date.now(),
    };
    this.trackResult(result);
    return result;
  }

  // Batch anomaly detection
  detectBatch(data: number[][]): AnomalyResult[] {
    return data.map((point) => this.detect(point));
  }

  // Adaptive threshold adjustment
  adjustThreshold(targetFPR: number = 0.05): void {
    if (this.detectionHistory.length < 100) return;
    const scores = this.detectionHistory.map((r) => r.score).sort((a, b) => a - b);
    const idx = Math.floor(scores.length * (1 - targetFPR));
    this.config.threshold = scores[idx] ?? this.config.threshold;
  }

  private trackResult(result: AnomalyResult): void {
    this.detectionHistory.push(result);
    if (this.detectionHistory.length > this.maxHistorySize) {
      this.detectionHistory = this.detectionHistory.slice(-this.maxHistorySize);
    }
  }

  // Get anomaly rate
  getAnomalyRate(): number {
    if (this.detectionHistory.length === 0) return 0;
    const anomalies = this.detectionHistory.filter((r) => r.isAnomaly).length;
    return anomalies / this.detectionHistory.length;
  }

  getConfig(): AnomalyDetectorConfig {
    return { ...this.config };
  }

  getForestSize(): number {
    return this.forest.length;
  }

  getStreamingState(streamId: string): StreamingState | null {
    return this.streamingState.get(streamId) ?? null;
  }

  reset(): void {
    this.forest = [];
    this.trainingData = [];
    this.featureStats = [];
    this.streamingState.clear();
    this.detectionHistory = [];
  }
}
