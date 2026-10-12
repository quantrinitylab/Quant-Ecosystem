// ============================================================================
// quantai — agent task-graph planning (QM-QUANTY-004 consumer)
// ============================================================================
//
// Turns a decomposed agent-runtime `AgentTask` into a validated Quanty task
// graph: the subtask DAG is compiled with `@quant/quanty-task-graph`
// (cycle + dangling-dependency fail-closed checks) and scheduled into
// topological execution waves. AgentRuntimePanel renders the result as the
// task's execution plan.
//
// Agent subtasks are LLM-driven steps owned by quantai, not registry
// capabilities: they carry no `capabilityId`, so the compiler treats them as
// no-op lifecycle nodes and validates only the DAG structure.

import { compileTaskGraph, topologicalWaves } from '@quant/quanty-task-graph';
import type { CompileInput, TaskNode } from '@quant/quanty-task-graph';
import type { AgentTask } from './types';

export interface AgentTaskPlan {
  /** The subtask DAG compiled clean (no cycles / dangling dependencies). */
  ok: boolean;
  /** Fail-closed diagnostics; non-empty when ok === false. */
  errors: string[];
  /** Non-blocking compiler notes. */
  warnings: string[];
  /** Subtask labels per execution wave, in run order. Empty when !ok. */
  waves: string[][];
}

/** The compiler's id rule: length >= 8, [A-Za-z0-9_-]. */
const UUID_LIKE = /^[A-Za-z0-9_-]{8,}$/;

/** FNV-1a 32-bit hex — deterministic fallback ids for backend ids the compiler rejects. */
function fnv1aHex(seed: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function nodeIdFor(raw: string, index: number): string {
  if (UUID_LIKE.test(raw)) return raw;
  return `n-${fnv1aHex(`${index}:${raw}`)}`;
}

/**
 * Compile the agent task's subtask DAG into a validated task graph and
 * schedule it into execution waves. Pure — safe to call during render.
 */
export function planAgentTask(task: AgentTask): AgentTaskPlan {
  if (task.subtasks.length === 0) {
    return { ok: true, errors: [], warnings: [], waves: [] };
  }
  const normalizedByRaw = new Map<string, string>();
  task.subtasks.forEach((subtask, index) => {
    normalizedByRaw.set(subtask.id, nodeIdFor(subtask.id, index));
  });

  const labelById = new Map<string, string>();
  const nodes: TaskNode[] = task.subtasks.map((subtask, index) => {
    const id = nodeIdFor(subtask.id, index);
    labelById.set(id, subtask.description);
    return {
      id,
      kind: 'background-job',
      label: subtask.description,
      appId: 'quantai',
      dependsOn: (subtask.dependencies ?? []).map((dep) => normalizedByRaw.get(dep) ?? dep),
      params: { requiredPermission: subtask.requiredPermission },
    };
  });

  const input: CompileInput = {
    taskId: nodeIdFor(task.id, 0),
    sessionId: nodeIdFor(task.id, 0),
    goal: task.description.trim() || '(agent task)',
    nodes,
    capabilityGrants: [],
    provenance: {
      actorUserId: 'quantai-agent-ui',
      sourceApp: 'quantai',
      correlationId: task.id,
    },
    capabilities: new Map(),
  };

  const result = compileTaskGraph(input);
  if (!result.ok || !result.graph) {
    return { ok: false, errors: result.errors, warnings: result.warnings, waves: [] };
  }
  const waves = topologicalWaves(result.graph).map((wave) =>
    wave.map((id) => labelById.get(id) ?? id),
  );
  return { ok: true, errors: [], warnings: result.warnings, waves };
}
