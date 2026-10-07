// ============================================================================
// QuantAI — Layer 3 Semantic Vector Memory Service
//
// Provides semantic recall across files, emails, documents, and past conversations.
// Features cosine similarity matching over normalized embedding vectors,
// source-scoped cross-app filtering, and resilient deterministic hashing
// embedding generator for zero-mock, offline-first reliability.
// ============================================================================

import { createHash } from 'node:crypto';

export interface VectorChunk {
  id: string;
  userId: string;
  sourceApp: string;
  sourceId: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface VectorSearchResult {
  id: string;
  sourceApp: string;
  sourceId: string;
  content: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

/**
 * Deterministic, offline-first TF/hashing embedding provider.
 * Maps any text to a unit-length normalized 64-dimensional dense vector.
 */
export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  private readonly dimensions: number;

  constructor(dimensions = 64) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const tokens = text.toLowerCase().match(/\b[a-z0-9_.-]+\b/g) ?? [text.toLowerCase()];
    const vec = new Array<number>(this.dimensions).fill(0);

    for (const token of tokens) {
      const hash = createHash('sha256').update(token).digest();
      const index = hash.readUInt16BE(0) % this.dimensions;
      const weight = (hash.readUInt8(2) / 255) * 2 - 1;
      vec[index] = (vec[index] ?? 0) + weight;
    }

    // L2 normalize
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    if (norm === 0) return vec;
    return vec.map((v) => v / norm);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface SemanticVectorMemoryOptions {
  embeddingProvider?: EmbeddingProvider;
}

export class SemanticVectorMemoryService {
  private readonly embedder: EmbeddingProvider;
  private readonly chunks = new Map<string, VectorChunk>();

  constructor(options: SemanticVectorMemoryOptions = {}) {
    this.embedder = options.embeddingProvider ?? new DeterministicEmbeddingProvider();
  }

  async upsertChunk(params: {
    id: string;
    userId: string;
    sourceApp: string;
    sourceId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<VectorChunk> {
    const embedding = await this.embedder.embed(params.content);
    const chunk: VectorChunk = {
      id: params.id,
      userId: params.userId,
      sourceApp: params.sourceApp,
      sourceId: params.sourceId,
      content: params.content,
      embedding,
      metadata: params.metadata,
      createdAt: Date.now(),
    };

    this.chunks.set(params.id, chunk);
    return chunk;
  }

  async search(
    userId: string,
    query: string,
    options: {
      topK?: number;
      minSimilarity?: number;
      sourceApp?: string;
    } = {},
  ): Promise<VectorSearchResult[]> {
    const topK = options.topK ?? 5;
    const minSimilarity = options.minSimilarity ?? 0.0;
    const queryEmbedding = await this.embedder.embed(query);

    const userChunks = Array.from(this.chunks.values()).filter((c) => {
      if (c.userId !== userId) return false;
      if (options.sourceApp && c.sourceApp !== options.sourceApp) return false;
      return true;
    });

    const scored = userChunks.map((chunk) => ({
      id: chunk.id,
      sourceApp: chunk.sourceApp,
      sourceId: chunk.sourceId,
      content: chunk.content,
      similarity: cosineSimilarity(queryEmbedding, chunk.embedding),
      metadata: chunk.metadata,
    }));

    return scored
      .filter((res) => res.similarity >= minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  async deleteBySource(sourceApp: string, sourceId: string): Promise<number> {
    let deletedCount = 0;
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.sourceApp === sourceApp && chunk.sourceId === sourceId) {
        this.chunks.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  async deleteByUserId(userId: string): Promise<number> {
    let deletedCount = 0;
    for (const [id, chunk] of this.chunks.entries()) {
      if (chunk.userId === userId) {
        this.chunks.delete(id);
        deletedCount++;
      }
    }
    return deletedCount;
  }

  count(userId?: string): number {
    if (!userId) return this.chunks.size;
    return Array.from(this.chunks.values()).filter((c) => c.userId === userId).length;
  }
}
