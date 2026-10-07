// ============================================================================
// quantai — agent-runtime api-client hooks (Layer 5)
// ============================================================================
//
// The ONLY sanctioned call path from a quantai UI surface to the agent-runtime
// engine: typed react-query hooks over the same-origin Next proxy paths under
// `/api/agents/runtime/*` (never inline fetch — Requirement 1.4). The proxy
// forwards the bearer + x-request-id to the backend (Layer 4).
import { useApiQuery, useApiMutation } from '@quant/api-client';
import type { UseApiQueryOptions } from '@quant/api-client';
import type { AgentTask, CreateAgentTaskInput, RunningAgentsResponse } from './types';

/** POST /api/agents/runtime/tasks — decompose + execute an agent task. */
export function useExecuteAgentTask() {
  return useApiMutation<CreateAgentTaskInput, AgentTask>('/api/agents/runtime/tasks');
}

/** GET /api/agents/runtime/tasks/:id — poll the status of a started task. */
export function useAgentTask(id: string | undefined, options?: UseApiQueryOptions) {
  return useApiQuery<AgentTask>(`/api/agents/runtime/tasks/${id ?? ''}`, {
    ...options,
    enabled: (options?.enabled ?? true) && Boolean(id),
  });
}

/** GET /api/agents/runtime/agents — list registered runtime worker agents. */
export function useRunningAgents(options?: UseApiQueryOptions) {
  return useApiQuery<RunningAgentsResponse>('/api/agents/runtime/agents', options);
}
