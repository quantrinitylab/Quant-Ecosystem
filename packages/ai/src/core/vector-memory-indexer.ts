// ============================================================================
// AI Core — VectorMemoryIndexer (PR-M05)
//
// The write-side counterpart of VectorMemoryRetriever. Plugs into
// DefaultMemoryService's post-store `indexer` hook: when a memory is stored, it
// embeds the content, upserts the vector to the backend, and records a
// memory_embeddings row (provider/model/dimension/embeddingVersion) so
// re-embedding on a model upgrade is a background insert, not a migration.
//
// Model-agnostic: the embedder and vector backend are injected ports.
// ============================================================================

import type { MemoryRecord } from './memory-port';
import type { MemoryIndexer } from './default-memory-service';
import type { EmbeddingProvider, VectorBackend } from './vector-memory-retriever';

// ─── Narrow write delegate for memory_embeddings ─────────────────────────────

export interface MemoryEmbeddingCreateData {
  memoryId: string; // MemoryRecord.logicalId
  provider: string;
  model: string;
  dimension: number;
  embeddingVersion: number;
  embeddingRef: string | null;
}

export interface MemoryEmbeddingDelegate {
  create(args: { data: MemoryEmbeddingCreateData }): Promise<unknown>;
}

export interface MemoryEmbeddingPrismaClient {
  memoryEmbedding: MemoryEmbeddingDelegate;
}

export interface VectorMemoryIndexerOptions {
  embedder: EmbeddingProvider;
  vectorBackend: VectorBackend;
  client: MemoryEmbeddingPrismaClient;
  /** Embedding version stamped on new rows (bump when re-embedding). */
  embeddingVersion?: number;
}

// ─── Implementation ───────────────────────────────────────────────────────────

export class VectorMemoryIndexer {
  private readonly embedder: EmbeddingProvider;
  private readonly vectorBackend: VectorBackend;
  private readonly client: MemoryEmbeddingPrismaClient;
  private readonly embeddingVersion: number;

  constructor(opts: VectorMemoryIndexerOptions) {
    this.embedder = opts.embedder;
    this.vectorBackend = opts.vectorBackend;
    this.client = opts.client;
    this.embeddingVersion = opts.embeddingVersion ?? 1;
  }

  /** Bound MemoryIndexer for DefaultMemoryService's `indexer` hook. */
  get index(): MemoryIndexer {
    return (record: MemoryRecord) => this.run(record);
  }

  private async run(record: MemoryRecord): Promise<void> {
    const vector = await this.embedder.embed(record.content);

    // The vector store point id IS the memory's logicalId, so retrieval hits map
    // straight back to the row.
    await this.vectorBackend.upsert({
      id: record.id,
      vector,
      ownerId: record.owner,
      metadata: { kind: record.kind, level: record.level },
    });

    await this.client.memoryEmbedding.create({
      data: {
        memoryId: record.id,
        provider: this.embedder.provider,
        model: this.embedder.model,
        dimension: this.embedder.dimension,
        embeddingVersion: this.embeddingVersion,
        embeddingRef: record.id,
      },
    });
  }
}
