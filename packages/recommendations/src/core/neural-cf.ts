// ============================================================================
// Recommendations Package - Triton-backed Neural Collaborative Filtering
// ============================================================================

import type { TritonInferenceClient, InferResponse } from '@quant/triton-client';
import type { NCFConfig } from '../types';

// InMemoryNeuralCF type for the lazily-loaded fallback
type InMemoryNeuralCFType = InstanceType<
  typeof import('../__tests__/fixtures/in-memory-ncf').InMemoryNeuralCF
>;

/** Configuration for TritonNCFClient */
export interface TritonNCFConfig {
  modelName: string;
  modelVersion?: string;
  embeddingSize: number;
  fallbackMode?: boolean;
  fallbackConfig?: NCFConfig;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Falls back to pure JS in-memory NCF with random weights when Triton unavailable
 * Production path: Deploy trained NCF model on Triton Inference Server
 */
/** Neural Collaborative Filtering backed by Triton Inference Server */
export class NeuralCF {
  private readonly client: TritonInferenceClient | null;
  private readonly modelName: string;
  private readonly modelVersion?: string;
  private readonly embeddingSize: number;
  private readonly fallbackMode: boolean;
  private readonly fallbackConfig: NCFConfig | undefined;
  private fallback: InMemoryNeuralCFType | null = null;
  private fallbackLoaded = false;

  constructor(client: TritonInferenceClient | null, config: TritonNCFConfig) {
    this.client = client;
    this.modelName = config.modelName;
    this.modelVersion = config.modelVersion;
    this.embeddingSize = config.embeddingSize;
    this.fallbackMode = config.fallbackMode ?? client === null;
    this.fallbackConfig = config.fallbackConfig;
  }

  /** Lazily load the in-memory fallback to avoid pulling test fixtures into production bundle */
  private async loadFallback(): Promise<InMemoryNeuralCFType | null> {
    if (this.fallbackLoaded) return this.fallback;
    this.fallbackLoaded = true;

    if (this.fallbackMode && this.fallbackConfig) {
      const { InMemoryNeuralCF } = await import('../__tests__/fixtures/in-memory-ncf');
      this.fallback = new InMemoryNeuralCF(this.fallbackConfig);
    }
    return this.fallback;
  }

  /** Predict interaction probability for a user-item pair */
  async predict(userId: string, itemId: string): Promise<number> {
    if (this.fallbackMode) {
      const fb = await this.loadFallback();
      if (fb) return fb.predict(userId, itemId);
    }

    if (!this.client) {
      return 0.5;
    }

    const response = await this.client.infer(
      this.modelName,
      {
        inputs: [
          { name: 'user_id', shape: [1, 1], datatype: 'INT64', data: [this.hashId(userId)] },
          { name: 'item_id', shape: [1, 1], datatype: 'INT64', data: [this.hashId(itemId)] },
        ],
        outputs: [{ name: 'score' }],
      },
      this.modelVersion,
    );

    return this.extractScore(response);
  }

  /** Get recommendations for a user from candidate items */
  async recommend(
    userId: string,
    candidateItemIds: string[],
    topN: number = 10,
  ): Promise<Array<{ itemId: string; score: number }>> {
    if (this.fallbackMode) {
      const fb = await this.loadFallback();
      if (fb) return fb.recommend(userId, candidateItemIds, topN);
    }

    if (!this.client) {
      return candidateItemIds.slice(0, topN).map((itemId) => ({ itemId, score: 0.5 }));
    }

    const batchSize = candidateItemIds.length;
    const userIds = new Array(batchSize).fill(this.hashId(userId)) as number[];
    const itemIds = candidateItemIds.map((id) => this.hashId(id));

    const response = await this.client.infer(
      this.modelName,
      {
        inputs: [
          { name: 'user_ids', shape: [batchSize, 1], datatype: 'INT64', data: userIds },
          { name: 'item_ids', shape: [batchSize, 1], datatype: 'INT64', data: itemIds },
        ],
        outputs: [{ name: 'scores' }],
      },
      this.modelVersion,
    );

    const scores = this.extractScores(response);
    const predictions = candidateItemIds.map((itemId, i) => ({
      itemId,
      score: scores[i] ?? 0.5,
    }));

    predictions.sort((a, b) => b.score - a.score);
    return predictions.slice(0, topN);
  }

  /** Get user embedding vector from Triton */
  async getUserEmbedding(userId: string): Promise<number[] | null> {
    if (this.fallbackMode) {
      const fb = await this.loadFallback();
      if (fb) return fb.getUserEmbedding(userId);
    }

    if (!this.client) {
      return null;
    }

    try {
      const response = await this.client.infer(
        this.modelName,
        {
          inputs: [
            { name: 'user_id', shape: [1, 1], datatype: 'INT64', data: [this.hashId(userId)] },
          ],
          outputs: [{ name: 'user_embedding' }],
        },
        this.modelVersion,
      );

      const output = response.outputs.find((o) => o.name === 'user_embedding');
      return output ? (output.data as number[]) : null;
    } catch {
      return null;
    }
  }

  /** Get item embedding vector from Triton */
  async getItemEmbedding(itemId: string): Promise<number[] | null> {
    if (this.fallbackMode) {
      const fb = await this.loadFallback();
      if (fb) return fb.getItemEmbedding(itemId);
    }

    if (!this.client) {
      return null;
    }

    try {
      const response = await this.client.infer(
        this.modelName,
        {
          inputs: [
            { name: 'item_id', shape: [1, 1], datatype: 'INT64', data: [this.hashId(itemId)] },
          ],
          outputs: [{ name: 'item_embedding' }],
        },
        this.modelVersion,
      );

      const output = response.outputs.find((o) => o.name === 'item_embedding');
      return output ? (output.data as number[]) : null;
    } catch {
      return null;
    }
  }

  /** Get model summary */
  getModelSummary(): { layers: number; parameters: number; embeddingSize: number } {
    if (this.fallbackMode && this.fallback) {
      return this.fallback.getModelSummary();
    }

    return {
      layers: 4,
      parameters: 0,
      embeddingSize: this.embeddingSize,
    };
  }

  /** Initialize the in-memory fallback with user/item data (for local dev) */
  async initializeFallback(userIds: string[], itemIds: string[]): Promise<void> {
    const fb = await this.loadFallback();
    if (fb) {
      fb.initializeEmbeddings(userIds, itemIds);
    }
  }

  /** Hash a string ID to a numeric value for tensor input */
  private hashId(id: string): number {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /** Extract a single score from inference response */
  private extractScore(response: InferResponse): number {
    const output = response.outputs.find((o) => o.name === 'score' || o.name === 'scores');
    if (!output || output.data.length === 0) {
      return 0.5;
    }
    return output.data[0] as number;
  }

  /** Extract multiple scores from inference response */
  private extractScores(response: InferResponse): number[] {
    const output = response.outputs.find((o) => o.name === 'scores' || o.name === 'score');
    if (!output) {
      return [];
    }
    return output.data as number[];
  }
}
