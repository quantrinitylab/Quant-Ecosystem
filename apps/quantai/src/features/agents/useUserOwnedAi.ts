// ============================================================================
// quantai — user-owned-ai api-client hooks (Layer 5)
// ============================================================================
//
// Typed react-query hooks over the same-origin Next proxy paths under
// `/api/agents/owned/*` (never inline fetch — Requirement 1.4).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  CompareModelsInput,
  CompareModelsResponse,
  OwnedModel,
  OwnedModelsFilter,
  OwnedModelsResponse,
} from './types';

/** GET /api/agents/owned/models — list models (optional provider/local filter). */
export function useOwnedModels(filter?: OwnedModelsFilter, options?: UseApiQueryOptions) {
  const params: Record<string, string> = {};
  if (filter?.provider) params.provider = filter.provider;
  if (filter?.local !== undefined) params.local = String(filter.local);

  return useApiQuery<OwnedModelsResponse>('/api/agents/owned/models', {
    ...options,
    params: { ...params, ...options?.params },
  });
}

/** GET /api/agents/owned/models/:id — fetch a single model entry. */
export function useOwnedModel(id: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<OwnedModel>(`/api/agents/owned/models/${id ?? ''}`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(id),
  });
}

/** POST /api/agents/owned/models/compare — compare a set of models. */
export function useCompareModels() {
  return useApiMutation<CompareModelsInput, CompareModelsResponse>(
    '/api/agents/owned/models/compare',
  );
}
