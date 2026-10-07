// ============================================================================
// On-Device Ranker - Client-side ONNX inference for local ranking
// ============================================================================

import type { ContentItem } from './ranking/anti-rage';

export const MAX_MODEL_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const MAX_INFERENCE_LATENCY_MS = 50;

export interface UserPrefs {
  topicWeights: Record<string, number>;
  engagementHistory: number[];
  preferredContentLength: 'short' | 'medium' | 'long';
  sensitivityLevel: number;
}

export interface RankedCandidate {
  item: ContentItem;
  score: number;
  rank: number;
}

export interface OnnxRuntime {
  loadModel(modelUrl: string): Promise<void>;
  run(inputs: Record<string, Float32Array>): Promise<{ outputs: Record<string, Float32Array> }>;
  isModelLoaded(): boolean;
  dispose(): void;
}

export interface BenchmarkResult {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
}

export interface PerformanceBudgetResult {
  passes: boolean;
  p95Ms: number;
  budget: number;
}

export class OnDeviceRanker {
  private runtime: OnnxRuntime | null = null;
  private modelLoaded: boolean = false;
  private modelSizeBytes: number = 0;
  private readonly topK: number;

  constructor(runtime?: OnnxRuntime, topK: number = 20) {
    this.runtime = runtime ?? null;
    this.topK = topK;
  }

  setRuntime(runtime: OnnxRuntime): void {
    this.runtime = runtime;
  }

  async loadModel(modelUrl: string, sizeBytes?: number): Promise<void> {
    if (!this.runtime) {
      throw new Error('No ONNX runtime configured. Call setRuntime() first.');
    }

    if (sizeBytes !== undefined && sizeBytes > MAX_MODEL_SIZE_BYTES) {
      throw new Error('Model exceeds 5MB size limit');
    }

    await this.runtime.loadModel(modelUrl);
    this.modelLoaded = true;
    this.modelSizeBytes = sizeBytes ?? 0;
  }

  getModelSizeBytes(): number {
    return this.modelSizeBytes;
  }

  async benchmarkInference(
    samples: ContentItem[],
    userPrefs: UserPrefs,
    iterations: number = 10,
  ): Promise<BenchmarkResult> {
    if (!this.runtime || !this.modelLoaded) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await this.rankLocally(samples, userPrefs);
      const end = performance.now();
      latencies.push(end - start);
    }

    latencies.sort((a, b) => a - b);

    const mean = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;
    const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
    const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
    const p99 = latencies[Math.floor(latencies.length * 0.99)]!;

    return { p50Ms: p50, p95Ms: p95, p99Ms: p99, meanMs: mean };
  }

  async validatePerformanceBudget(
    samples: ContentItem[],
    userPrefs: UserPrefs,
  ): Promise<PerformanceBudgetResult> {
    const benchmark = await this.benchmarkInference(samples, userPrefs);
    return {
      passes: benchmark.p95Ms < MAX_INFERENCE_LATENCY_MS,
      p95Ms: benchmark.p95Ms,
      budget: MAX_INFERENCE_LATENCY_MS,
    };
  }

  static detectRuntime(): 'webgpu' | 'wasm' | 'cpu' {
    // In Node.js environment, WebGPU is not available
    // Check for WebGPU API availability
    if (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as unknown as Record<string, unknown>).navigator === 'object' &&
      (globalThis as unknown as Record<string, unknown>).navigator !== null &&
      'gpu' in
        ((globalThis as unknown as Record<string, unknown>).navigator as Record<string, unknown>)
    ) {
      return 'webgpu';
    }
    // WASM is available in Node.js
    if (typeof WebAssembly !== 'undefined') {
      return 'wasm';
    }
    return 'cpu';
  }

  async rankLocally(candidates: ContentItem[], userPrefs: UserPrefs): Promise<RankedCandidate[]> {
    if (!this.runtime || !this.modelLoaded) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    const featureDim = 16;
    const n = candidates.length;

    // Batch all candidates into a single tensor [N, featureDim]
    const batchedInput = new Float32Array(n * featureDim);
    for (let i = 0; i < n; i++) {
      const features = this.encodeFeatures(candidates[i]!, userPrefs);
      batchedInput.set(features, i * featureDim);
    }

    // Single ONNX inference call for the entire batch
    const result = await this.runtime.run({ input: batchedInput });
    const output = result.outputs['score'] ?? result.outputs[Object.keys(result.outputs)[0]!]!;

    // Extract scores for each candidate
    const scores: Array<{ item: ContentItem; score: number }> = [];
    for (let i = 0; i < n; i++) {
      scores.push({ item: candidates[i]!, score: output[i]! });
    }

    // Sort by score descending and take top-K
    scores.sort((a, b) => b.score - a.score);
    const topResults = scores.slice(0, this.topK);

    return topResults.map((entry, idx) => ({
      item: entry.item,
      score: entry.score,
      rank: idx + 1,
    }));
  }

  private encodeFeatures(item: ContentItem, userPrefs: UserPrefs): Float32Array {
    // Encode item features + user preferences into a flat vector
    const features: number[] = [
      item.quoteRetweetRatio,
      item.capsRatio,
      item.exclamationDensity,
      item.angryReplyRatio,
      item.replyLengthAvg / 1000, // normalize
      item.replySubstanceScore,
      item.text.length / 10000, // text length normalized
      userPrefs.sensitivityLevel,
      userPrefs.preferredContentLength === 'short'
        ? 0
        : userPrefs.preferredContentLength === 'medium'
          ? 0.5
          : 1,
      ...userPrefs.engagementHistory.slice(0, 5).map((v) => v / 100),
    ];

    // Pad to fixed size
    while (features.length < 16) {
      features.push(0);
    }

    return new Float32Array(features.slice(0, 16));
  }

  isReady(): boolean {
    return this.modelLoaded && this.runtime !== null;
  }

  getTopK(): number {
    return this.topK;
  }

  dispose(): void {
    if (this.runtime) {
      this.runtime.dispose();
    }
    this.modelLoaded = false;
  }
}
