import { randomUUID } from 'crypto';
import { logger } from '@quant/common';

export interface MemoryItem {
  id: string;
  type: string;
  content: any;
  embedding?: number[];
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface EmbeddingProvider {
  generateEmbedding(text: string): Promise<number[]>;
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

export class MemoryStore {
  private memories: Map<string, MemoryItem> = new Map();
  private maxSize: number = 10000;
  private embeddingProvider: EmbeddingProvider | null = null;

  constructor(_agentId: string, embeddingProvider?: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider ?? null;
  }

  /**
   * Set or replace the embedding provider at runtime.
   */
  setEmbeddingProvider(provider: EmbeddingProvider): void {
    this.embeddingProvider = provider;
  }

  async store(item: Omit<MemoryItem, 'id' | 'timestamp'>): Promise<string> {
    const id = randomUUID();
    const memoryItem: MemoryItem = {
      ...item,
      id,
      timestamp: new Date(),
    };

    // Generate embedding if provider is available and no embedding provided
    if (this.embeddingProvider && !memoryItem.embedding) {
      try {
        const text = typeof item.content === 'string' ? item.content : JSON.stringify(item.content);
        memoryItem.embedding = await this.embeddingProvider.generateEmbedding(text);
      } catch (err) {
        // Log warning but still store the memory (available for keyword search)
        logger.warn(
          `[memory-store] Failed to generate embedding for memory ${id}: ${(err as Error).message}; storing without embedding (keyword search only)`,
        );
      }
    }

    this.memories.set(id, memoryItem);

    // Simple eviction if too many memories
    if (this.memories.size > this.maxSize) {
      const oldestKey = Array.from(this.memories.keys())[0];
      if (oldestKey) {
        this.memories.delete(oldestKey);
      }
    }

    return id;
  }

  async retrieve(id: string): Promise<MemoryItem | null> {
    return this.memories.get(id) || null;
  }

  async retrieveRelevant(query: string, limit: number = 10): Promise<MemoryItem[]> {
    // If embedding provider is available and memories have embeddings, use vector search
    if (this.embeddingProvider) {
      try {
        const queryEmbedding = await this.embeddingProvider.generateEmbedding(query);
        return this.vectorSearch(queryEmbedding, limit);
      } catch (err) {
        logger.warn(
          `[memory-store] Failed to generate query embedding for vector search, falling back to keyword search: ${(err as Error).message}`,
        );
        // Fall through to keyword matching
      }
    }

    // Fallback: simple keyword matching
    return this.keywordSearch(query, limit);
  }

  /**
   * Vector similarity search over stored memories.
   */
  private vectorSearch(queryEmbedding: number[], limit: number): MemoryItem[] {
    const scored: Array<{ item: MemoryItem; score: number }> = [];

    for (const memory of this.memories.values()) {
      if (memory.embedding && memory.embedding.length > 0) {
        const score = cosineSimilarity(queryEmbedding, memory.embedding);
        scored.push({ item: memory, score });
      }
    }

    // Sort by similarity descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.item);
  }

  /**
   * Fallback keyword-based search for when no embedding provider is configured.
   */
  private keywordSearch(query: string, limit: number): MemoryItem[] {
    const results: MemoryItem[] = [];
    const queryLower = query.toLowerCase();

    for (const memory of this.memories.values()) {
      const contentStr = JSON.stringify(memory.content).toLowerCase();
      if (contentStr.includes(queryLower)) {
        results.push(memory);
      }
      if (results.length >= limit) break;
    }

    return results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async getRecent(limit: number = 20): Promise<MemoryItem[]> {
    return Array.from(this.memories.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async clear(): Promise<void> {
    this.memories.clear();
  }

  getSize(): number {
    return this.memories.size;
  }
}
