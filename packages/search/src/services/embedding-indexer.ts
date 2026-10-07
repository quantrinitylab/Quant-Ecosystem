// ============================================================================
// UGC Embedding Indexer - Generates embeddings and upserts to Qdrant
// ============================================================================

import type { VectorClient } from './vector-client';

/** Provider interface for embedding generation (DI) */
export interface EmbeddingProvider {
  embed(texts: string[], language?: string): Promise<number[][]>;
}

/** Content item to be indexed */
export interface IndexableContent {
  id: string;
  text: string;
  language?: string;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingIndexerOptions {
  collection: string;
  batchSize?: number;
}

/**
 * UGCEmbeddingIndexer - Manages embedding generation and vector indexing
 *
 * On content creation or update, generates an embedding via the EmbeddingProvider
 * and upserts the vector + payload to Qdrant via VectorClient.
 */
export class UGCEmbeddingIndexer {
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly vectorClient: VectorClient;
  private readonly collection: string;
  private readonly batchSize: number;

  constructor(
    embeddingProvider: EmbeddingProvider,
    vectorClient: VectorClient,
    options: EmbeddingIndexerOptions,
  ) {
    this.embeddingProvider = embeddingProvider;
    this.vectorClient = vectorClient;
    this.collection = options.collection;
    this.batchSize = options.batchSize ?? 100;
  }

  async indexContent(item: IndexableContent): Promise<void> {
    const [embedding] = await this.embeddingProvider.embed([item.text], item.language);
    if (!embedding) {
      throw new Error(`Failed to generate embedding for item ${item.id}`);
    }

    await this.vectorClient.upsertPoints(this.collection, [
      {
        id: item.id,
        vector: embedding,
        payload: {
          text: item.text,
          language: item.language,
          ...item.metadata,
        },
      },
    ]);
  }

  async indexBatch(items: IndexableContent[]): Promise<void> {
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      const texts = batch.map((item) => item.text);

      // Do not pass explicit language - let embed() detect per-text to handle mixed-language batches
      const embeddings = await this.embeddingProvider.embed(texts);

      const points = batch.map((item, idx) => ({
        id: item.id,
        vector: embeddings[idx]!,
        payload: {
          text: item.text,
          language: item.language,
          ...item.metadata,
        },
      }));

      await this.vectorClient.upsertPoints(this.collection, points);
    }
  }

  async removeContent(id: string): Promise<void> {
    await this.vectorClient.deletePoints(this.collection, [id]);
  }

  async updateContent(item: IndexableContent): Promise<void> {
    // Qdrant upsert is idempotent - same as indexContent
    await this.indexContent(item);
  }
}
