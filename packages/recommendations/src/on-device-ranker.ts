// ============================================================================
// On-Device Ranker - Client-side ONNX inference for local ranking
// ============================================================================

import type { ContentItem } from './ranking/anti-rage';

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

export class OnDeviceRanker {
  private runtime: OnnxRuntime | null = null;
  private modelLoaded: boolean = false;
  private readonly topK: number;

  constructor(runtime?: OnnxRuntime, topK: number = 20) {
    this.runtime = runtime ?? null;
    this.topK = topK;
  }

  setRuntime(runtime: OnnxRuntime): void {
    this.runtime = runtime;
  }

  async loadModel(modelUrl: string): Promise<void> {
    if (!this.runtime) {
      throw new Error('No ONNX runtime configured. Call setRuntime() first.');
    }

    await this.runtime.loadModel(modelUrl);
    this.modelLoaded = true;
  }

  async rankLocally(candidates: ContentItem[], userPrefs: UserPrefs): Promise<RankedCandidate[]> {
    if (!this.runtime || !this.modelLoaded) {
      throw new Error('Model not loaded. Call loadModel() first.');
    }

    // Encode candidates and user preferences into feature vectors
    const scores: Array<{ item: ContentItem; score: number }> = [];

    for (const candidate of candidates) {
      const features = this.encodeFeatures(candidate, userPrefs);
      const result = await this.runtime.run({ input: features });
      const output = result.outputs['score'] ?? result.outputs[Object.keys(result.outputs)[0]];
      const score = output[0];
      scores.push({ item: candidate, score });
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
