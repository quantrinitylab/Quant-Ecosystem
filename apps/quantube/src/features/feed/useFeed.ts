// ============================================================================
// quantube — feed api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantube UI surface to the feed stack:
// typed react-query hooks over the same-origin Next proxy paths under
// `/api/feed/*` (never inline fetch — Requirement 1.4). The proxy forwards the
// bearer + x-request-id to the backend (Layer 4), which reaches the decorated
// five-engine feed bundle — recommendations → ranking → ml-pipeline →
// ml-runtime → triton-client (Layer 2/3, wired AS-IS per Req 9.1).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  ComposedFeedResponse,
  FeedQueryParams,
  ListModelsResponse,
  RecommendationsResponse,
  RegisterModelInput,
  RegisterModelResponse,
  RegisterTritonModelInput,
  RegisterTritonModelResponse,
  RuntimeCacheResponse,
  RuntimeModelsResponse,
  ScoreInput,
  ScoreResponse,
  SeedCandidatesInput,
  SeedCandidatesResponse,
  SwitchAlgorithmInput,
  TritonModelsResponse,
} from './types';

/** GET /api/feed — the composed (recommendations → ranking) paginated feed. */
export function useFeed(query: FeedQueryParams | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<ComposedFeedResponse>('/api/feed', {
    ...options,
    params: query
      ? {
          feedId: query.feedId,
          ...(query.page ? { page: String(query.page) } : {}),
          ...(query.pageSize ? { pageSize: String(query.pageSize) } : {}),
        }
      : undefined,
    enabled: (options?.enabled ?? true) && Boolean(query?.feedId),
  });
}

/** GET /api/feed/recommendations — raw recommendation pipeline output. */
export function useFeedRecommendations(
  query: { feedId: string; k?: number } | undefined,
  options?: UseApiQueryOptions,
) {
  return useApiQuery<RecommendationsResponse>('/api/feed/recommendations', {
    ...options,
    params: query
      ? { feedId: query.feedId, ...(query.k ? { k: String(query.k) } : {}) }
      : undefined,
    enabled: (options?.enabled ?? true) && Boolean(query?.feedId),
  });
}

/** POST /api/feed/candidates — seed/extend a feed's candidate pool. */
export function useSeedFeedCandidates() {
  return useApiMutation<SeedCandidatesInput, SeedCandidatesResponse>('/api/feed/candidates');
}

/** PUT /api/feed/algorithm — switch the caller's ranking algorithm for a feed. */
export function useSwitchFeedAlgorithm() {
  return useApiMutation<SwitchAlgorithmInput, SwitchAlgorithmInput>('/api/feed/algorithm', {
    method: 'PUT',
  });
}

/** GET /api/feed/models — list registered ranking models (ml-pipeline). */
export function useFeedModels(options?: UseApiQueryOptions) {
  return useApiQuery<ListModelsResponse>('/api/feed/models', options);
}

/** POST /api/feed/models — register a ranking model. */
export function useRegisterFeedModel() {
  return useApiMutation<RegisterModelInput, RegisterModelResponse>('/api/feed/models');
}

/** POST /api/feed/score — score features through the ml-pipeline inference engine. */
export function useScoreFeatures() {
  return useApiMutation<ScoreInput, ScoreResponse>('/api/feed/score');
}

/** GET /api/feed/runtime/cache — ONNX model cache stats (ml-runtime). */
export function useFeedRuntimeCache(options?: UseApiQueryOptions) {
  return useApiQuery<RuntimeCacheResponse>('/api/feed/runtime/cache', options);
}

/** GET /api/feed/runtime/models — cached ONNX model manifests (ml-runtime). */
export function useFeedRuntimeModels(options?: UseApiQueryOptions) {
  return useApiQuery<RuntimeModelsResponse>('/api/feed/runtime/models', options);
}

/** GET /api/feed/triton/models — models registered with the Triton client. */
export function useTritonModels(options?: UseApiQueryOptions) {
  return useApiQuery<TritonModelsResponse>('/api/feed/triton/models', options);
}

/** POST /api/feed/triton/models — register a Triton-served model. */
export function useRegisterTritonModel() {
  return useApiMutation<RegisterTritonModelInput, RegisterTritonModelResponse>(
    '/api/feed/triton/models',
  );
}
