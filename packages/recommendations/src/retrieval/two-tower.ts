// ============================================================================
// Two-Tower Retrieval - User/Item tower embeddings + ANN retrieval
// ============================================================================

export interface TwoTowerConfig {
  userEmbeddingDim: number;
  itemEmbeddingDim: number;
  outputDim: number;
}

interface IndexedItem {
  id: string;
  embedding: number[];
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Pure JS forward pass with randomly initialized weights, no trained model
 * Production path: Train two-tower model in PyTorch, serve via ONNX/Triton
 */
export class TwoTowerRetrieval {
  private readonly config: TwoTowerConfig;
  private userWeights: number[][];
  private itemWeights: number[][];
  private index: IndexedItem[] = [];

  constructor(config: TwoTowerConfig) {
    this.config = config;
    this.userWeights = this.initWeights(config.userEmbeddingDim, config.outputDim);
    this.itemWeights = this.initWeights(config.itemEmbeddingDim, config.outputDim);
  }

  private initWeights(inputDim: number, outputDim: number): number[][] {
    const weights: number[][] = [];
    for (let i = 0; i < inputDim; i++) {
      const row: number[] = [];
      for (let j = 0; j < outputDim; j++) {
        row.push((Math.random() - 0.5) * 0.1);
      }
      weights.push(row);
    }
    return weights;
  }

  encodeUser(features: number[]): number[] {
    return this.linearForward(features, this.userWeights);
  }

  encodeItem(features: number[]): number[] {
    return this.linearForward(features, this.itemWeights);
  }

  private linearForward(input: number[], weights: number[][]): number[] {
    const outputDim = this.config.outputDim;
    const result = new Array<number>(outputDim).fill(0);
    const inputLen = Math.min(input.length, weights.length);

    for (let j = 0; j < outputDim; j++) {
      for (let i = 0; i < inputLen; i++) {
        result[j]! += input[i]! * weights[i]![j]!;
      }
    }

    // L2 normalize
    const norm = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < result.length; i++) {
        result[i]! /= norm;
      }
    }

    return result;
  }

  buildIndex(items: Array<{ id: string; features: number[] }>): void {
    this.index = items.map((item) => ({
      id: item.id,
      embedding: this.encodeItem(item.features),
    }));
  }

  retrieve(
    _userId: string,
    userFeatures: number[],
    k: number,
  ): Array<{ id: string; score: number }> {
    const userEmbedding = this.encodeUser(userFeatures);
    return this.retrieveByEmbedding(userEmbedding, k);
  }

  retrieveByEmbedding(userEmbedding: number[], k: number): Array<{ id: string; score: number }> {
    if (this.index.length === 0) {
      return [];
    }

    const scores = this.index.map((item) => ({
      id: item.id,
      score: this.cosineSimilarity(userEmbedding, item.embedding),
    }));

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, k);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const len = Math.min(a.length, b.length);

    for (let i = 0; i < len; i++) {
      dot += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dot / denominator;
  }

  getIndexSize(): number {
    return this.index.length;
  }
}
