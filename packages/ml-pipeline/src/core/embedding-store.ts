// ============================================================================
// ML Pipeline - Embedding Store with LSH
// ============================================================================

import { Embedding, VectorIndex, LSHConfig, SimilarityResult } from '../types';

interface LSHTable {
  hashFunctions: number[][];
  buckets: Map<string, string[]>;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: In-memory vector storage
 * Production path: Use Pinecone, Qdrant, or pgvector
 */
export class EmbeddingStore {
  private vectors: Map<string, Embedding> = new Map();
  private dimension: number;
  private lshTables: LSHTable[] = [];
  private indexBuilt: boolean = false;

  constructor(dimension: number) {
    this.dimension = dimension;
  }

  insert(id: string, vector: number[], metadata?: Record<string, string>): void {
    if (vector.length !== this.dimension) {
      throw new Error(`Expected dimension ${this.dimension}, got ${vector.length}`);
    }
    this.vectors.set(id, {
      id,
      vector,
      metadata,
      timestamp: Date.now(),
    });
    // Update LSH index if built
    if (this.indexBuilt) {
      this.insertIntoLSH(id, vector);
    }
  }

  batchInsert(
    embeddings: { id: string; vector: number[]; metadata?: Record<string, string> }[],
  ): void {
    for (const emb of embeddings) {
      this.vectors.set(emb.id, {
        id: emb.id,
        vector: emb.vector,
        metadata: emb.metadata,
        timestamp: Date.now(),
      });
    }
    if (this.indexBuilt) {
      for (const emb of embeddings) {
        this.insertIntoLSH(emb.id, emb.vector);
      }
    }
  }

  get(id: string): Embedding | null {
    return this.vectors.get(id) ?? null;
  }

  delete(id: string): boolean {
    return this.vectors.delete(id);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;
    return dotProduct / denom;
  }

  euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i]! - b[i]!;
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  dotProduct(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += a[i]! * b[i]!;
    }
    return sum;
  }

  // Exact K-Nearest Neighbors
  knnExact(
    query: number[],
    k: number,
    metric: 'cosine' | 'euclidean' = 'cosine',
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];
    for (const [id, embedding] of this.vectors.entries()) {
      let score: number;
      if (metric === 'cosine') {
        score = this.cosineSimilarity(query, embedding.vector);
      } else {
        score = -this.euclideanDistance(query, embedding.vector); // Negate so higher is better
      }
      results.push({ id, score, vector: embedding.vector, metadata: embedding.metadata });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  // LSH Index Building
  buildLSHIndex(config: LSHConfig): void {
    this.lshTables = [];
    for (let t = 0; t < config.numHashTables; t++) {
      const hashFunctions: number[][] = [];
      for (let h = 0; h < config.numHashFunctions; h++) {
        // Random hyperplane: generate random normal vector
        const hyperplane = this.generateRandomHyperplane(
          config.dimension,
          config.seed ? config.seed + t * 100 + h : undefined,
        );
        hashFunctions.push(hyperplane);
      }
      const table: LSHTable = { hashFunctions, buckets: new Map() };
      this.lshTables.push(table);
    }
    // Index all existing vectors
    for (const [id, embedding] of this.vectors.entries()) {
      this.insertIntoLSH(id, embedding.vector);
    }
    this.indexBuilt = true;
  }

  private generateRandomHyperplane(dim: number, seed?: number): number[] {
    const plane: number[] = [];
    let state = seed ?? Math.floor(Math.random() * 2147483647);
    for (let i = 0; i < dim; i++) {
      // Simple LCG PRNG for reproducibility
      state = (state * 1664525 + 1013904223) & 0x7fffffff;
      // Box-Muller transform for normal distribution
      const u1 = (state & 0xffff) / 65536;
      state = (state * 1664525 + 1013904223) & 0x7fffffff;
      const u2 = (state & 0xffff) / 65536;
      const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
      plane.push(z);
    }
    return plane;
  }

  private hashVector(vector: number[], table: LSHTable): string {
    const bits: string[] = [];
    for (const hyperplane of table.hashFunctions) {
      let dot = 0;
      for (let i = 0; i < vector.length; i++) {
        dot += vector[i]! * hyperplane[i]!;
      }
      bits.push(dot >= 0 ? '1' : '0');
    }
    return bits.join('');
  }

  private insertIntoLSH(id: string, vector: number[]): void {
    for (const table of this.lshTables) {
      const hash = this.hashVector(vector, table);
      if (!table.buckets.has(hash)) {
        table.buckets.set(hash, []);
      }
      const bucket = table.buckets.get(hash)!;
      if (!bucket.includes(id)) {
        bucket.push(id);
      }
    }
  }

  // Approximate Nearest Neighbors via LSH
  knnApproximate(query: number[], k: number, numProbes: number = 1): SimilarityResult[] {
    if (!this.indexBuilt || this.lshTables.length === 0) {
      return this.knnExact(query, k);
    }
    const candidateIds = new Set<string>();
    for (const table of this.lshTables) {
      const hash = this.hashVector(query, table);
      // Primary bucket
      const bucket = table.buckets.get(hash);
      if (bucket) {
        for (const id of bucket) candidateIds.add(id);
      }
      // Multi-probe: flip bits for nearby buckets
      if (numProbes > 1) {
        for (let p = 0; p < Math.min(numProbes - 1, hash.length); p++) {
          const flipped =
            hash.substring(0, p) + (hash[p] === '0' ? '1' : '0') + hash.substring(p + 1);
          const nearBucket = table.buckets.get(flipped);
          if (nearBucket) {
            for (const id of nearBucket) candidateIds.add(id);
          }
        }
      }
    }
    // Compute exact distances for candidates
    const results: SimilarityResult[] = [];
    for (const id of candidateIds) {
      const embedding = this.vectors.get(id);
      if (!embedding) continue;
      const score = this.cosineSimilarity(query, embedding.vector);
      results.push({ id, score, metadata: embedding.metadata });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, k);
  }

  // Search with threshold
  searchByThreshold(
    query: number[],
    threshold: number,
    metric: 'cosine' | 'euclidean' = 'cosine',
  ): SimilarityResult[] {
    const results: SimilarityResult[] = [];
    for (const [id, embedding] of this.vectors.entries()) {
      let score: number;
      if (metric === 'cosine') {
        score = this.cosineSimilarity(query, embedding.vector);
        if (score >= threshold) {
          results.push({ id, score, metadata: embedding.metadata });
        }
      } else {
        score = this.euclideanDistance(query, embedding.vector);
        if (score <= threshold) {
          results.push({ id, score: -score, metadata: embedding.metadata });
        }
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }

  // Random projection for dimensionality reduction
  randomProjection(vector: number[], targetDim: number, seed: number = 42): number[] {
    const projectionMatrix = this.generateProjectionMatrix(vector.length, targetDim, seed);
    const result: number[] = new Array(targetDim).fill(0);
    const scale = Math.sqrt(targetDim);
    for (let i = 0; i < targetDim; i++) {
      for (let j = 0; j < vector.length; j++) {
        result[i]! += projectionMatrix[i]![j]! * vector[j]!;
      }
      result[i]! /= scale;
    }
    return result;
  }

  private generateProjectionMatrix(fromDim: number, toDim: number, seed: number): number[][] {
    const matrix: number[][] = [];
    let state = seed;
    for (let i = 0; i < toDim; i++) {
      const row: number[] = [];
      for (let j = 0; j < fromDim; j++) {
        state = (state * 1664525 + 1013904223) & 0x7fffffff;
        const r = (state & 0xffff) / 65536;
        // Sparse random projection: +1, 0, -1 with probabilities 1/6, 4/6, 1/6
        if (r < 1 / 6) row.push(1);
        else if (r > 5 / 6) row.push(-1);
        else row.push(0);
      }
      matrix.push(row);
    }
    return matrix;
  }

  // Normalize a vector to unit length
  normalize(vector: number[]): number[] {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i]! * vector[i]!;
    }
    norm = Math.sqrt(norm);
    if (norm === 0) return vector;
    return vector.map((v) => v / norm);
  }

  getIndexInfo(): VectorIndex {
    return {
      name: 'default',
      dimension: this.dimension,
      size: this.vectors.size,
      indexType: this.indexBuilt ? 'lsh' : 'flat',
      createdAt: Date.now(),
    };
  }

  size(): number {
    return this.vectors.size;
  }

  clear(): void {
    this.vectors.clear();
    this.lshTables = [];
    this.indexBuilt = false;
  }

  getAllIds(): string[] {
    return Array.from(this.vectors.keys());
  }

  // Compute centroid of all vectors
  computeCentroid(): number[] {
    const centroid = new Array(this.dimension).fill(0);
    for (const [, embedding] of this.vectors.entries()) {
      for (let i = 0; i < this.dimension; i++) {
        centroid[i] += embedding.vector[i]!;
      }
    }
    const n = this.vectors.size;
    if (n > 0) {
      for (let i = 0; i < this.dimension; i++) {
        centroid[i] /= n;
      }
    }
    return centroid;
  }
}
