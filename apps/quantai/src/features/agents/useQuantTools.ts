// ============================================================================
// quantai — quant-tools api-client hooks (Layer 5)
// ============================================================================
//
// Typed react-query hooks over the same-origin Next proxy paths under
// `/api/tools/orchestrator/*` (never inline fetch — Requirement 1.4).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type {
  ToolCatalogResponse,
  ToolPlan,
  ToolPlanInput,
  ToolExecuteInput,
  ToolExecuteResponse,
} from './types';

/** GET /api/tools/orchestrator/catalog — the cross-app tool catalog. */
export function useToolCatalog(options?: UseApiQueryOptions) {
  return useApiQuery<ToolCatalogResponse>('/api/tools/orchestrator/catalog', options);
}

/** POST /api/tools/orchestrator/plan — build (but do not run) a tool plan. */
export function useCreateToolPlan() {
  return useApiMutation<ToolPlanInput, ToolPlan>('/api/tools/orchestrator/plan');
}

/** POST /api/tools/orchestrator/execute — plan + execute a tool workflow. */
export function useExecuteTools() {
  return useApiMutation<ToolExecuteInput, ToolExecuteResponse>('/api/tools/orchestrator/execute');
}
