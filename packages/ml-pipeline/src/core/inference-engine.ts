// ============================================================================
// ML Pipeline - Inference Engine
// ============================================================================

import {
  InferenceRequest,
  InferenceResult,
  ABTestConfig,
  ModelRoute,
  LatencyStats,
} from '../types';
import { ModelLoader } from '@quant/ml-runtime';
import * as ort from 'onnxruntime-node';

interface CacheEntry {
  result: InferenceResult;
  expiresAt: number;
  hitCount: number;
}

interface LoadedModel {
  name: string;
  version: string;
  weights: number[][];
  bias: number[];
  isWarm: boolean;
  lastUsed: number;
  inferenceCount: number;
  onnxLoaded: boolean;
}

export class InferenceEngine {
  private models: Map<string, LoadedModel> = new Map();
  private cache: Map<string, CacheEntry> = new Map();
  private cacheMaxSize: number;
  private cacheTTL: number;
  private latencies: number[] = [];
  private maxLatencyHistory: number = 10000;
  private abTests: Map<string, ABTestConfig> = new Map();
  private routes: ModelRoute[] = [];
  private fallbacks: Map<string, string> = new Map();
  private totalInferences: number = 0;
  private errorCount: number = 0;
  private modelLoader: ModelLoader | null = null;

  constructor(options: { cacheMaxSize?: number; cacheTTL?: number } = {}) {
    this.cacheMaxSize = options.cacheMaxSize ?? 1000;
    this.cacheTTL = options.cacheTTL ?? 60000;
  }

  setModelLoader(loader: ModelLoader): void {
    this.modelLoader = loader;
  }

  async loadOnnxModel(
    name: string,
    version: string,
    weights?: number[][],
    bias?: number[],
  ): Promise<void> {
    const key = `${name}@${version}`;

    if (!this.modelLoader) {
      throw new Error('ModelLoader not set. Call setModelLoader() first.');
    }

    try {
      await this.modelLoader.loadSession(name, version);
      this.models.set(key, {
        name,
        version,
        weights: weights ?? [],
        bias: bias ?? [],
        isWarm: true,
        lastUsed: Date.now(),
        inferenceCount: 0,
        onnxLoaded: true,
      });
    } catch (err) {
      if (weights && bias) {
        this.models.set(key, {
          name,
          version,
          weights,
          bias,
          isWarm: false,
          lastUsed: Date.now(),
          inferenceCount: 0,
          onnxLoaded: false,
        });
      } else {
        throw err;
      }
    }
  }

  loadModel(name: string, version: string, weights: number[][], bias: number[]): void {
    const key = `${name}@${version}`;
    this.models.set(key, {
      name,
      version,
      weights,
      bias,
      isWarm: false,
      lastUsed: Date.now(),
      inferenceCount: 0,
      onnxLoaded: false,
    });
  }

  warmUp(name: string, version: string, sampleInputs?: number[][]): void {
    const key = `${name}@${version}`;
    const model = this.models.get(key);
    if (!model) return;
    if (model.onnxLoaded) {
      model.isWarm = true;
      return;
    }
    const samples = sampleInputs ?? [new Array(model.weights[0]?.length ?? 10).fill(0)];
    for (const input of samples) {
      this.forwardPass(model, input);
    }
    model.isWarm = true;
  }

  private forwardPass(model: LoadedModel, input: number[]): number[] {
    const outputs: number[] = [];
    for (let o = 0; o < model.weights.length; o++) {
      let sum = model.bias[o] ?? 0;
      for (let j = 0; j < model.weights[o]!.length; j++) {
        sum += (model.weights[o]![j] ?? 0) * (input[j] ?? 0);
      }
      outputs.push(1 / (1 + Math.exp(-Math.max(-500, Math.min(500, sum)))));
    }
    return outputs;
  }

  private async onnxInference(model: LoadedModel, input: number[]): Promise<number[]> {
    if (!this.modelLoader) {
      return this.forwardPass(model, input);
    }

    try {
      const tensor = new ort.Tensor('float32', Float32Array.from(input), [1, input.length]);
      const feeds: Record<string, ort.Tensor> = { input: tensor };
      const results = await this.modelLoader.runInference(model.name, model.version, feeds as any);
      const outputTensor = (results as any).output ?? (results as any)[Object.keys(results)[0]!];
      if (outputTensor && outputTensor.data) {
        return Array.from(outputTensor.data as Float32Array);
      }
      return this.forwardPass(model, input);
    } catch {
      return this.forwardPass(model, input);
    }
  }

  async inferAsync(request: InferenceRequest): Promise<InferenceResult> {
    const startTime = Date.now();
    this.totalInferences++;

    const cacheKey = this.getCacheKey(request);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return { ...cached, cached: true, latencyMs: Date.now() - startTime };
    }

    const route = this.resolveRoute(request);
    const modelKey = `${route.modelName}@${route.modelVersion}`;
    let model = this.models.get(modelKey);

    if (!model) {
      const fallbackKey = this.fallbacks.get(route.modelName);
      if (fallbackKey) {
        model = this.models.get(fallbackKey);
      }
      if (!model) {
        this.errorCount++;
        return {
          inputId: request.inputId,
          prediction: 0,
          probability: [0.5, 0.5],
          latencyMs: Date.now() - startTime,
          modelName: route.modelName,
          modelVersion: route.modelVersion,
          cached: false,
          timestamp: Date.now(),
        };
      }
    }

    const processedInput = this.preprocessInput(request.features, model);

    let outputs: number[];
    if (model.onnxLoaded) {
      outputs = await this.onnxInference(model, processedInput);
    } else {
      outputs = this.forwardPass(model, processedInput);
    }

    const prediction = outputs[0] ?? 0;
    const probability = [1 - prediction, prediction];

    model.lastUsed = Date.now();
    model.inferenceCount++;

    const result: InferenceResult = {
      inputId: request.inputId,
      prediction: prediction >= 0.5 ? 1 : 0,
      probability,
      latencyMs: Date.now() - startTime,
      modelName: model.name,
      modelVersion: model.version,
      cached: false,
      timestamp: Date.now(),
    };

    this.addToCache(cacheKey, result);
    this.trackLatency(result.latencyMs);

    return result;
  }

  infer(request: InferenceRequest): InferenceResult {
    const startTime = Date.now();
    this.totalInferences++;

    const cacheKey = this.getCacheKey(request);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return { ...cached, cached: true, latencyMs: Date.now() - startTime };
    }

    const route = this.resolveRoute(request);
    const modelKey = `${route.modelName}@${route.modelVersion}`;
    let model = this.models.get(modelKey);

    if (!model) {
      const fallbackKey = this.fallbacks.get(route.modelName);
      if (fallbackKey) {
        model = this.models.get(fallbackKey);
      }
      if (!model) {
        this.errorCount++;
        return {
          inputId: request.inputId,
          prediction: 0,
          probability: [0.5, 0.5],
          latencyMs: Date.now() - startTime,
          modelName: route.modelName,
          modelVersion: route.modelVersion,
          cached: false,
          timestamp: Date.now(),
        };
      }
    }

    const processedInput = this.preprocessInput(request.features, model);

    let outputs: number[];
    if (model.onnxLoaded) {
      throw new Error(
        'Model loaded via ONNX. Use inferAsync() for ONNX models, or load with loadModel() for sync inference.',
      );
    } else {
      outputs = this.forwardPass(model, processedInput);
    }

    const prediction = outputs[0] ?? 0;
    const probability = [1 - prediction, prediction];

    model.lastUsed = Date.now();
    model.inferenceCount++;

    const result: InferenceResult = {
      inputId: request.inputId,
      prediction: prediction >= 0.5 ? 1 : 0,
      probability,
      latencyMs: Date.now() - startTime,
      modelName: model.name,
      modelVersion: model.version,
      cached: false,
      timestamp: Date.now(),
    };

    this.addToCache(cacheKey, result);
    this.trackLatency(result.latencyMs);

    return result;
  }

  inferBatch(requests: InferenceRequest[], chunkSize: number = 100): InferenceResult[] {
    const results: InferenceResult[] = [];
    for (let i = 0; i < requests.length; i += chunkSize) {
      const chunk = requests.slice(i, i + chunkSize);
      for (const request of chunk) {
        results.push(this.infer(request));
      }
    }
    return results;
  }

  async inferBatchAsync(
    requests: InferenceRequest[],
    chunkSize: number = 100,
  ): Promise<InferenceResult[]> {
    const results: InferenceResult[] = [];
    for (let i = 0; i < requests.length; i += chunkSize) {
      const chunk = requests.slice(i, i + chunkSize);
      for (const request of chunk) {
        results.push(await this.inferAsync(request));
      }
    }
    return results;
  }

  private preprocessInput(features: number[], model: LoadedModel): number[] {
    const expectedDim = model.weights[0]?.length ?? 0;
    if (features.length === expectedDim) return features;
    const result = new Array(expectedDim).fill(0);
    for (let i = 0; i < Math.min(features.length, expectedDim); i++) {
      result[i] = features[i];
    }
    return result;
  }

  private resolveRoute(request: InferenceRequest): { modelName: string; modelVersion: string } {
    if (request.modelName && request.modelVersion) {
      return { modelName: request.modelName, modelVersion: request.modelVersion };
    }

    for (const [, test] of this.abTests.entries()) {
      if (!test.active) continue;
      const totalWeight = test.modelA.trafficWeight + test.modelB.trafficWeight;
      const rand = Math.random() * totalWeight;
      if (rand < test.modelA.trafficWeight) {
        return { modelName: test.modelA.name, modelVersion: test.modelA.version };
      }
      return { modelName: test.modelB.name, modelVersion: test.modelB.version };
    }

    if (this.routes.length > 0) {
      const totalWeight = this.routes.reduce((sum, r) => sum + r.weight, 0);
      let rand = Math.random() * totalWeight;
      for (const route of this.routes) {
        rand -= route.weight;
        if (rand <= 0) {
          return { modelName: route.modelName, modelVersion: route.modelVersion };
        }
      }
      const last = this.routes[this.routes.length - 1]!;
      return { modelName: last.modelName, modelVersion: last.modelVersion };
    }

    const firstModel = this.models.values().next().value as LoadedModel | undefined;
    if (firstModel) {
      return { modelName: firstModel.name, modelVersion: firstModel.version };
    }
    return { modelName: 'unknown', modelVersion: '0.0.0' };
  }

  setABTest(config: ABTestConfig): void {
    this.abTests.set(config.name, config);
  }

  removeABTest(name: string): void {
    this.abTests.delete(name);
  }

  setRoutes(routes: ModelRoute[]): void {
    this.routes = routes;
  }

  setFallback(primaryModel: string, fallbackModel: string, fallbackVersion: string): void {
    this.fallbacks.set(primaryModel, `${fallbackModel}@${fallbackVersion}`);
  }

  private getCacheKey(request: InferenceRequest): string {
    const modelPart = request.modelName ? `${request.modelName}:${request.modelVersion}:` : '';
    return `${modelPart}${request.features.join(',')}`;
  }

  private getFromCache(key: string): InferenceResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    entry.hitCount++;
    return entry.result;
  }

  private addToCache(key: string, result: InferenceResult): void {
    if (this.cache.size >= this.cacheMaxSize) {
      this.evictLRU();
    }
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.cacheTTL,
      hitCount: 0,
    });
  }

  private evictLRU(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].hitCount - b[1].hitCount);
    const toRemove = Math.floor(this.cacheMaxSize * 0.2);
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.cache.delete(entries[i]![0]);
    }
  }

  private trackLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);
    if (this.latencies.length > this.maxLatencyHistory) {
      this.latencies = this.latencies.slice(-this.maxLatencyHistory);
    }
  }

  getLatencyStats(): LatencyStats {
    if (this.latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0, count: 0, max: 0, min: 0 };
    }
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const n = sorted.length;
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    return {
      p50: sorted[Math.floor(n * 0.5)]!,
      p95: sorted[Math.floor(n * 0.95)]!,
      p99: sorted[Math.floor(n * 0.99)]!,
      mean,
      count: n,
      max: sorted[n - 1]!,
      min: sorted[0]!,
    };
  }

  getModelStats(
    name: string,
    version: string,
  ): { inferenceCount: number; isWarm: boolean; lastUsed: number; onnxLoaded: boolean } | null {
    const model = this.models.get(`${name}@${version}`);
    if (!model) return null;
    return {
      inferenceCount: model.inferenceCount,
      isWarm: model.isWarm,
      lastUsed: model.lastUsed,
      onnxLoaded: model.onnxLoaded,
    };
  }

  getCacheHitRate(): number {
    if (this.totalInferences === 0) return 0;
    let hits = 0;
    for (const [, entry] of this.cache.entries()) {
      hits += entry.hitCount;
    }
    return hits / this.totalInferences;
  }

  getErrorRate(): number {
    if (this.totalInferences === 0) return 0;
    return this.errorCount / this.totalInferences;
  }

  unloadModel(name: string, version: string): void {
    this.models.delete(`${name}@${version}`);
  }

  clearCache(): void {
    this.cache.clear();
  }

  getLoadedModels(): string[] {
    return Array.from(this.models.keys());
  }
}
