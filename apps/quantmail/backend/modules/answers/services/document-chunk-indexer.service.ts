// ============================================================================
// Answers module — DocumentChunk indexer seam (search-indexer write path)
// quantmail-superhub · Task 15.1 (Requirements 8.1, 8.4)
// ============================================================================
//
// PURPOSE
//   The write-side counterpart of the Retriever. A `DocumentChunk` is the unit
//   of retrievable evidence: { id, userId, sourceType, sourceRef, text,
//   embeddingId }. In production the `search-indexer` infra service already
//   consumes Kafka CDC and writes to Qdrant/pgvector + Meilisearch; this thin
//   seam represents that write path so the answers module owns a single,
//   testable place where a chunk is:
//
//     1. EMBEDDED (via the same fail-closed `@quant/ai` engine the Retriever
//        uses) and UPSERTED into the vector store (Qdrant/pgvector), and
//     2. UPSERTED into the keyword store (Meilisearch),
//
//   both keyed by the owning `userId` so the ownership filter the Retriever
//   relies on (Requirement 8.1) is established at index time. The vector and
//   keyword writers are injectable ports, so the real search-indexer adapters
//   drop in without touching this orchestration.
//
//   SCOPE: a minimal, side-effect-confined seam. The full CDC pipeline lives in
//   the `search-indexer` service; this module only models the contract.

import type { EmbeddingPort, RetrievableChunk } from './retriever.service';

/** A chunk to index. `embeddingId` is assigned by the vector writer if absent. */
export interface IndexableChunk extends RetrievableChunk {
  embedding?: number[];
}

/** Upsert into the vector store (Qdrant/pgvector). Returns the point id. */
export interface VectorIndexPort {
  upsert(input: {
    chunk: RetrievableChunk;
    embedding: number[];
  }): Promise<{ embeddingId: string }>;
}

/** Upsert into the keyword store (Meilisearch). */
export interface KeywordIndexPort {
  upsert(input: { chunk: RetrievableChunk }): Promise<void>;
}

export interface DocumentChunkIndexerDeps {
  embedder: EmbeddingPort;
  vectorIndex: VectorIndexPort;
  keywordIndex: KeywordIndexPort;
}

/**
 * Index a chunk into both stores. The chunk's `userId` is carried into each
 * store write so retrieval can filter by owner; the same fail-closed embedder
 * the Retriever uses produces the dense vector (no silent mock in production).
 */
export class DocumentChunkIndexer {
  constructor(private readonly deps: DocumentChunkIndexerDeps) {}

  async index(chunk: IndexableChunk): Promise<RetrievableChunk> {
    const embedding = chunk.embedding ?? (await this.deps.embedder.embedQuery(chunk.text));

    const { embeddingId } = await this.deps.vectorIndex.upsert({
      chunk: toRetrievable(chunk),
      embedding,
    });

    const indexed: RetrievableChunk = { ...toRetrievable(chunk), embeddingId };
    await this.deps.keywordIndex.upsert({ chunk: indexed });
    return indexed;
  }
}

function toRetrievable(chunk: IndexableChunk): RetrievableChunk {
  const { embedding: _embedding, ...rest } = chunk;
  void _embedding;
  return rest;
}
