import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OnDeviceRanker,
  OnnxRuntime,
  UserPrefs,
  MAX_MODEL_SIZE_BYTES,
  MAX_INFERENCE_LATENCY_MS,
} from '../on-device-ranker';
import { OnDeviceModelSpec } from '../on-device-ranker-model';
import type { ContentItem } from '../ranking/anti-rage';

describe('OnDeviceRanker', () => {
  let mockRuntime: OnnxRuntime;

  beforeEach(() => {
    mockRuntime = {
      loadModel: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation((inputs: Record<string, Float32Array>) => {
        const input = inputs['input']!;
        const featureDim = 16;
        const n = input.length / featureDim;
        // Generate decreasing scores for each candidate in the batch
        const scores = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          scores[i] = 1 / (i + 1);
        }
        return Promise.resolve({ outputs: { score: scores } });
      }),
      isModelLoaded: vi.fn().mockReturnValue(true),
      dispose: vi.fn(),
    };
  });

  function makeItem(text: string): ContentItem {
    return {
      text,
      quoteRetweetRatio: 0.1,
      capsRatio: 0.02,
      exclamationDensity: 0.01,
      angryReplyRatio: 0.05,
      replyLengthAvg: 150,
      replySubstanceScore: 0.7,
    };
  }

  const userPrefs: UserPrefs = {
    topicWeights: { tech: 0.8, sports: 0.3 },
    engagementHistory: [50, 60, 70, 80, 90],
    preferredContentLength: 'medium',
    sensitivityLevel: 0.5,
  };

  it('should load model successfully', async () => {
    const ranker = new OnDeviceRanker(mockRuntime);
    await ranker.loadModel('https://cdn.example.com/model.onnx');

    expect(mockRuntime.loadModel).toHaveBeenCalledWith('https://cdn.example.com/model.onnx');
    expect(ranker.isReady()).toBe(true);
  });

  it('should throw when no runtime configured', async () => {
    const ranker = new OnDeviceRanker();
    await expect(ranker.loadModel('model.onnx')).rejects.toThrow('No ONNX runtime configured');
  });

  it('should throw when model not loaded', async () => {
    const ranker = new OnDeviceRanker(mockRuntime);
    // Don't call loadModel
    const candidates = [makeItem('test')];
    await expect(ranker.rankLocally(candidates, userPrefs)).rejects.toThrow('Model not loaded');
  });

  it('should rank 200 candidates and return top 20', async () => {
    const ranker = new OnDeviceRanker(mockRuntime, 20);
    await ranker.loadModel('model.onnx');

    // Generate 200 candidates
    const candidates: ContentItem[] = [];
    for (let i = 0; i < 200; i++) {
      candidates.push(makeItem(`Content item ${i} with some text`));
    }

    const results = await ranker.rankLocally(candidates, userPrefs);

    expect(results).toHaveLength(20);
    expect(mockRuntime.run).toHaveBeenCalledTimes(1);
    // Results should be ranked
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
    // Rank should start at 1
    expect(results[0]!.rank).toBe(1);
    expect(results[19]!.rank).toBe(20);
  });

  it('should handle fewer than topK candidates', async () => {
    const ranker = new OnDeviceRanker(mockRuntime, 20);
    await ranker.loadModel('model.onnx');

    const candidates = [makeItem('item1'), makeItem('item2')];
    const results = await ranker.rankLocally(candidates, userPrefs);

    expect(results).toHaveLength(2);
  });

  it('should set runtime after construction', async () => {
    const ranker = new OnDeviceRanker();
    ranker.setRuntime(mockRuntime);
    await ranker.loadModel('model.onnx');

    expect(ranker.isReady()).toBe(true);
  });

  it('should dispose resources', async () => {
    const ranker = new OnDeviceRanker(mockRuntime);
    await ranker.loadModel('model.onnx');
    ranker.dispose();

    expect(mockRuntime.dispose).toHaveBeenCalled();
    expect(ranker.isReady()).toBe(false);
  });

  it('should report topK configuration', () => {
    const ranker = new OnDeviceRanker(undefined, 30);
    expect(ranker.getTopK()).toBe(30);
  });

  describe('model size validation', () => {
    it('should reject models exceeding 5MB', async () => {
      const ranker = new OnDeviceRanker(mockRuntime);
      const oversizedBytes = 6 * 1024 * 1024; // 6MB
      await expect(ranker.loadModel('model.onnx', oversizedBytes)).rejects.toThrow(
        'Model exceeds 5MB size limit',
      );
    });

    it('should accept models within 5MB limit', async () => {
      const ranker = new OnDeviceRanker(mockRuntime);
      const validSize = 4 * 1024 * 1024; // 4MB
      await ranker.loadModel('model.onnx', validSize);
      expect(ranker.getModelSizeBytes()).toBe(validSize);
    });

    it('should accept models without size specified', async () => {
      const ranker = new OnDeviceRanker(mockRuntime);
      await ranker.loadModel('model.onnx');
      expect(ranker.getModelSizeBytes()).toBe(0);
    });

    it('should reject at exact boundary above 5MB', async () => {
      const ranker = new OnDeviceRanker(mockRuntime);
      const exactlyOver = MAX_MODEL_SIZE_BYTES + 1;
      await expect(ranker.loadModel('model.onnx', exactlyOver)).rejects.toThrow(
        'Model exceeds 5MB size limit',
      );
    });

    it('should accept at exactly 5MB', async () => {
      const ranker = new OnDeviceRanker(mockRuntime);
      await ranker.loadModel('model.onnx', MAX_MODEL_SIZE_BYTES);
      expect(ranker.getModelSizeBytes()).toBe(MAX_MODEL_SIZE_BYTES);
    });
  });

  describe('benchmarkInference', () => {
    it('should return latency percentiles', async () => {
      const ranker = new OnDeviceRanker(mockRuntime);
      await ranker.loadModel('model.onnx');

      const samples = [makeItem('sample1'), makeItem('sample2')];
      const result = await ranker.benchmarkInference(samples, userPrefs, 5);

      expect(result.p50Ms).toBeGreaterThanOrEqual(0);
      expect(result.p95Ms).toBeGreaterThanOrEqual(0);
      expect(result.p99Ms).toBeGreaterThanOrEqual(0);
      expect(result.meanMs).toBeGreaterThanOrEqual(0);
      expect(result.p95Ms).toBeGreaterThanOrEqual(result.p50Ms);
    });

    it('should throw if model is not loaded', async () => {
      const ranker = new OnDeviceRanker(mockRuntime);
      const samples = [makeItem('sample')];
      await expect(ranker.benchmarkInference(samples, userPrefs)).rejects.toThrow(
        'Model not loaded',
      );
    });
  });

  describe('validatePerformanceBudget', () => {
    it('should pass when inference is fast', async () => {
      const ranker = new OnDeviceRanker(mockRuntime);
      await ranker.loadModel('model.onnx');

      const samples = [makeItem('sample')];
      const result = await ranker.validatePerformanceBudget(samples, userPrefs);

      expect(result.passes).toBe(true);
      expect(result.budget).toBe(MAX_INFERENCE_LATENCY_MS);
      expect(result.p95Ms).toBeLessThan(MAX_INFERENCE_LATENCY_MS);
    });
  });

  describe('runtime detection', () => {
    it('should return wasm in Node.js environment', () => {
      const runtime = OnDeviceRanker.detectRuntime();
      expect(runtime).toBe('wasm');
    });

    it('should return a valid runtime type', () => {
      const runtime = OnDeviceRanker.detectRuntime();
      expect(['webgpu', 'wasm', 'cpu']).toContain(runtime);
    });
  });

  describe('OnDeviceModelSpec', () => {
    it('should return correct model spec', () => {
      const spec = new OnDeviceModelSpec();
      const result = spec.getModelSpec();

      expect(result.inputShape).toEqual([null, 16]);
      expect(result.outputShape).toEqual([null, 1]);
      expect(result.hiddenLayers).toEqual([32]);
      expect(result.activation).toBe('relu');
      expect(result.outputActivation).toBe('sigmoid');
      expect(result.targetSizeBytes).toBe(MAX_MODEL_SIZE_BYTES);
      expect(result.targetLatencyMs).toBe(MAX_INFERENCE_LATENCY_MS);
    });

    it('should validate model sizes correctly', () => {
      const spec = new OnDeviceModelSpec();

      expect(spec.validateModelSize(1000)).toBe(true);
      expect(spec.validateModelSize(MAX_MODEL_SIZE_BYTES)).toBe(true);
      expect(spec.validateModelSize(MAX_MODEL_SIZE_BYTES + 1)).toBe(false);
    });

    it('should estimate model size well under 5MB', () => {
      const spec = new OnDeviceModelSpec();
      const estimated = spec.estimateModelSize();

      expect(estimated).toBeLessThan(MAX_MODEL_SIZE_BYTES);
      expect(estimated).toBeGreaterThan(0);
      // 16*32 + 32 + 32*1 + 1 = 577 params * 4 bytes = 2308 bytes
      expect(estimated).toBe(577 * 4);
    });

    it('should return ONNX export instructions', () => {
      const instructions = OnDeviceModelSpec.getOnnxExportInstructions();

      expect(instructions).toContain('PyTorch');
      expect(instructions).toContain('ONNX');
      expect(instructions).toContain('torch.onnx.export');
    });
  });
});
