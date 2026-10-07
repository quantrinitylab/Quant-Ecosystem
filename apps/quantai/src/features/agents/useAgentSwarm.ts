// ============================================================================
// quantai — agent-swarm api-client hooks (Layer 5)
// ============================================================================
//
// Typed react-query hooks over the same-origin Next proxy paths under
// `/api/agents/swarm/*` (never inline fetch — Requirement 1.4).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type { CreateSwarmGoalInput, SwarmGoal, SwarmGoalProgress } from './types';

/** POST /api/agents/swarm/goals — create (and optionally decompose) a goal. */
export function useCreateSwarmGoal() {
  return useApiMutation<CreateSwarmGoalInput, SwarmGoal>('/api/agents/swarm/goals');
}

/** GET /api/agents/swarm/goals/:id — fetch a goal and its sub-goal tree. */
export function useSwarmGoal(id: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<SwarmGoal>(`/api/agents/swarm/goals/${id ?? ''}`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(id),
  });
}

/** GET /api/agents/swarm/goals/:id/progress — completion roll-up for a goal. */
export function useSwarmGoalProgress(id: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<SwarmGoalProgress>(`/api/agents/swarm/goals/${id ?? ''}/progress`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(id),
  });
}
