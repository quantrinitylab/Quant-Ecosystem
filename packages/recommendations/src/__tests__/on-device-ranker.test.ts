import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnDeviceRanker, OnnxRuntime, UserPrefs } from '../on-device-ranker';
import type { ContentItem } from '../ranking/anti-rage';

describe('OnDeviceRanker', () => {
  let mockRuntime: OnnxRuntime;

  beforeEach(() => {
    mockRuntime = {
      loadModel: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockImplementation((inputs: Record<string, Float32Array>) => {
        const input = inputs['input'];
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
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
    // Rank should start at 1
    expect(results[0].rank).toBe(1);
    expect(results[19].rank).toBe(20);
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
});
