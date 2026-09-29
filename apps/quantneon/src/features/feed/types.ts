// ============================================================================
// quantneon — feed surface DTOs (Layer 5 request/response contracts)
// ============================================================================
//
// Frontend-facing data shapes for the feed api-client hooks. These mirror the
// JSON the quantneon backend feed routes return (see
// apps/quantneon/backend/routes/feed.ts) — which compose the five real feed
// engines (recommendations → ranking → ml-pipeline → ml-runtime →
// triton-client). They are intentionally decoupled from the engines' internal
// types so a backend refactor never forces a frontend type change. Every hook
// is typed against the `{ success, data }` envelope via `APIResponse<T>`.

/** Ranking algorithm identifiers (mirrors @quant/ranking AlgorithmType). */
export type FeedAlgorithm = 'chrono' | 'ai' | 'community' | 'custom' | 'following';

export interface FeedCandidateInput {
  id: string;
  content?: string;
  authorId: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
  upvotes?: number;
  shares?: number;
  replies?: number;
  replyQuality?: number;
  authorReputation?: number;
}

/** Body for POST /api/feed/candidates. */
export interface SeedCandidatesInput {
  feedId: string;
  items: FeedCandidateInput[];
  replace?: boolean;
}

export interface SeedCandidatesResponse {
  feedId: string;
  poolSize: number;
}

export interface FeedQueryParams {
  feedId: string;
  page?: number;
  pageSize?: number;
}

export interface ComposedFeedItem {
  id: string;
  content: string;
  authorId: string;
  score?: number;
  [key: string]: unknown;
}

export interface ComposedFeedResponse {
  items: ComposedFeedItem[];
  page?: number;
  pageSize?: number;
  total?: number;
  algorithm?: FeedAlgorithm;
  retrievalCount: number;
}

export interface RecommendationCandidate {
  id: string;
  score: number;
  features: number[];
  source: string;
}

export interface RecommendationsResponse {
  candidates: RecommendationCandidate[];
}

/** Body for PUT /api/feed/algorithm. */
export interface SwitchAlgorithmInput {
  feedId: string;
  algorithm: FeedAlgorithm;
  customPluginId?: string;
}

export interface ModelMetadata {
  name: string;
  version: string;
  framework: string;
  metrics: Record<string, number>;
  [key: string]: unknown;
}

export interface ListModelsResponse {
  models: ModelMetadata[];
}

/** Body for POST /api/feed/models. */
export interface RegisterModelInput {
  name: string;
  version: string;
  framework?: 'linear' | 'logistic' | 'tree' | 'ensemble' | 'neural' | 'custom';
  metrics?: Record<string, number>;
}

export interface RegisterModelResponse {
  model: ModelMetadata;
}

/** Body for POST /api/feed/score. */
export interface ScoreInput {
  inputId: string;
  features: number[];
}

export interface ScoreResponse {
  result: {
    inputId: string;
    prediction: number | number[];
    latencyMs: number;
    [key: string]: unknown;
  };
}

export interface RuntimeCacheResponse {
  cache: Record<string, unknown>;
}

export interface RuntimeModelsResponse {
  models: unknown[];
}

export interface TritonModelsResponse {
  models: unknown[];
}

/** Body for POST /api/feed/triton/models. */
export interface RegisterTritonModelInput {
  name: string;
  version: string;
  platform?: string;
  inputs?: unknown[];
  outputs?: unknown[];
}

export interface RegisterTritonModelResponse {
  model: unknown;
}
