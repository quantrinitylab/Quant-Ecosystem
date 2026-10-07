// ============================================================================
// Answers module — RAG-grounded answer engine (Pillar 4: Perplexity)
// quantmail-superhub · Task 15.1 (Requirements 8.1, 8.4)
// ============================================================================
//
// PURPOSE
//   Groups the Perplexity-style answer-engine concern (retrieval over the
//   user's own data → grounded generation with citations) into a single
//   cohesive module, mirroring the QuantCode (`modules/code`), Agent
//   (`modules/agent`), and Billing (`modules/billing`) module structure.
//
// CURRENT SURFACE (Task 15.1)
//   `Retriever.retrieve(userId, query, sources, k)` — the authz-scoped
//   retriever. It restricts retrieval to the asking user's OWN documents
//   (Requirement 8.1, defence-in-depth: filter pushed into the store query AND
//   re-checked on results) and attaches source provenance — emailId / repo+path
//   (+commit) / url — to every returned `RankedChunk` (Requirement 8.4).
//
//   Ports/adapters: an `@quant/ai`-backed (fail-closed) query embedder, plus
//   injectable Vector (Qdrant/pgvector) and Keyword (Meilisearch) search ports
//   with in-memory defaults for offline testing and thin store-backed adapters
//   for the real `search-indexer`-populated indexes. The `DocumentChunkIndexer`
//   models the search-indexer write path.
//
// FUSION + RERANK (Task 15.2, Requirement 8.5)
//   The Retriever fuses the vector (Qdrant/pgvector) and keyword (Meilisearch)
//   ranked lists with Reciprocal Rank Fusion (RRF) before grounded generation,
//   so a chunk surfaced highly by BOTH stores outranks one surfaced by a single
//   store — robust to the two stores' incomparable score scales. The RRF
//   constant + per-store weights are configurable (`fusion` dep / per-call
//   override) and an optional cross-encoder `RerankPort` is an injectable seam;
//   when none is injected, the RRF ordering is the final order, keeping the
//   Retriever offline-testable with no live reranker model.
//
// GROUNDED ANSWER ENGINE (Task 16.1, Requirements 8.2, 8.3, 18.1)
//   `AnswerEngine.ask(userId, question, sources?)` consumes the Retriever's
//   authz-scoped, attributable chunks and produces a `GroundedAnswer` where
//   EVERY claim maps to >=1 `Citation` referencing an actually-retrieved chunk.
//   It refuses to fabricate: empty retrieval (or no claim surviving citation
//   validation) yields a "no answer found" answer (Req 8.3). Generation is
//   routed through `@quant/ai` and metered as a `rag_query` through the billing
//   `UsageGate` (reserve -> generate -> settle), so RAG queries are measurable
//   and fail closed when out of credits (Req 18.1). The Retriever, generator,
//   and gate are injectable ports for offline testing.
//
// NEXT (not in this task)
//   Task 16.2 adds the grounded-answer property test.
//
// MODULE BOUNDARY
//   This module imports only neutral packages (`@quant/server-core`,
//   `@quant/ai`). It does NOT import the mail-domain services or QuantCode
//   services directly, and it does NOT touch QuantChat. Consumers import it
//   only via this barrel.

export {
  Retriever,
  deriveProvenance,
  ALL_SOURCE_TYPES,
  DEFAULT_RETRIEVAL_K,
  DEFAULT_RRF_K,
  DEFAULT_STORE_WEIGHTS,
} from './services/retriever.service';
export type {
  SourceType,
  SourceRef,
  ChunkProvenance,
  RetrievableChunk,
  RetrievedBy,
  RankedChunk,
  StoreSearchParams,
  StoreHit,
  EmbeddingPort,
  VectorSearchPort,
  KeywordSearchPort,
  FusionConfig,
  RerankPort,
  RetrieveOptions,
  RetrieverDeps,
} from './services/retriever.service';

export {
  createUnifiedEmbeddingPort,
  cosineSimilarity,
  lexicalScore,
  InMemoryVectorSearchPort,
  InMemoryKeywordSearchPort,
  createVectorStoreSearchPort,
  createKeywordStoreSearchPort,
} from './services/retriever-adapters';
export type {
  QueryEmbeddingEngine,
  InMemoryChunk,
  VectorStoreClient,
  KeywordStoreClient,
} from './services/retriever-adapters';

export { DocumentChunkIndexer } from './services/document-chunk-indexer.service';
export type {
  IndexableChunk,
  VectorIndexPort,
  KeywordIndexPort,
  DocumentChunkIndexerDeps,
} from './services/document-chunk-indexer.service';

export {
  AnswerEngine,
  noAnswerFound,
  NO_ANSWER_FOUND_TEXT,
  GROUNDED_SYSTEM_PROMPT,
  DEFAULT_ANSWER_K,
} from './services/answer-engine.service';
export type {
  Citation,
  GroundedAnswer,
  RetrievePort,
  GroundedGenerationOptions,
  GenerationResult,
  GroundedGenerationPort,
  MeteringPort,
  AnswerEngineDeps,
  AskOptions,
} from './services/answer-engine.service';
