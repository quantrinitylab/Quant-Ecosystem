/**
 * QM-QUANTY-004 — Task graph compiler.
 *
 * Turns raw node descriptors into a validated TaskGraph, failing closed on:
 *  - duplicate node ids / dangling dependencies / dependency cycles
 *  - unknown, preview, deprecated or disabled capabilities
 *  - nodes invoking capabilities outside the task's capabilityGrants
 *  - handoff nodes carrying grants outside the task's capabilityGrants
 *    (scoped handoff: a handoff can only narrow, never widen)
 *  - missing required payloads (question on clarify, handoff on handoff)
 *  - foreground node that is not a `navigate` node
 *
 * Approval forecasting: evaluatePolicy is run at compile time with a
 * no-approval context so the host knows UP FRONT which nodes will pause
 * for user approval. The executor re-evaluates at runtime with the real
 * InvocationContext — compile-time forecasting never substitutes for the
 * runtime fail-closed check.
 */

import { evaluatePolicy } from '@quant/app-registry';
import type { Capability } from '@quant/app-registry';
import type { QuantAppId } from '@quant/ecosystem-contracts';
import {
  MUTATING_NODE_KINDS,
  type CompileResult,
  type ExecutorHost,
  type TaskGraph,
  type TaskNode,
  type TaskNodeKind,
} from './types';

export interface CompileInput {
  taskId: string;
  sessionId: string;
  goal: string;
  priority?: number;
  foregroundNodeId?: string;
  nodes: TaskNode[];
  capabilityGrants: string[];
  deadlineAt?: string;
  provenance: TaskGraph['provenance'];
  /** Registry lookup for capability resolution. */
  capabilities: ExecutorHost['capabilities'];
  /** User id used for the compile-time approval forecast. */
  forecastUserId?: string;
}

const NODE_KINDS: ReadonlySet<TaskNodeKind> = new Set([
  'read',
  'draft',
  'navigate',
  'mutate',
  'wait-for-user',
  'wait-for-event',
  'background-job',
  'verify',
  'compensate',
  'clarify',
  'handoff',
]);

function isUuidLike(id: string): boolean {
  return id.length >= 8 && /^[A-Za-z0-9_-]+$/.test(id);
}

export function compileTaskGraph(input: CompileInput): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const approvalsRequired: string[] = [];

  if (!isUuidLike(input.taskId)) errors.push(`taskId "${input.taskId}" is not a usable id`);
  if (!input.goal.trim()) errors.push('goal must not be empty');
  if (input.nodes.length === 0) errors.push('task must declare at least one node');

  const byId = new Map<string, TaskNode>();
  for (const node of input.nodes) {
    if (!node.id || !isUuidLike(node.id)) {
      errors.push(`node has unusable id "${node.id}"`);
      continue;
    }
    if (byId.has(node.id)) {
      errors.push(`duplicate node id "${node.id}"`);
      continue;
    }
    if (!NODE_KINDS.has(node.kind)) {
      errors.push(`node "${node.id}" has unknown kind "${node.kind}"`);
      continue;
    }
    byId.set(node.id, node);
  }

  // Dependency references + self-dependency.
  for (const node of byId.values()) {
    for (const dep of node.dependsOn ?? []) {
      if (!byId.has(dep)) errors.push(`node "${node.id}" depends on unknown node "${dep}"`);
      if (dep === node.id) errors.push(`node "${node.id}" depends on itself`);
    }
  }

  // Cycle detection (iterative DFS).
  const visitState = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string, stack: string[]): boolean => {
    const state = visitState.get(id);
    if (state === 'done') return false;
    if (state === 'visiting') {
      errors.push(`dependency cycle detected: ${[...stack, id].join(' -> ')}`);
      return true;
    }
    visitState.set(id, 'visiting');
    const node = byId.get(id);
    let cyclic = false;
    for (const dep of node?.dependsOn ?? []) {
      if (visit(dep, [...stack, id])) cyclic = true;
    }
    visitState.set(id, 'done');
    return cyclic;
  };
  for (const id of byId.keys()) visit(id, []);

  // Foreground node must be a navigate node.
  if (input.foregroundNodeId !== undefined) {
    const fg = byId.get(input.foregroundNodeId);
    if (!fg) {
      errors.push(`foregroundNodeId "${input.foregroundNodeId}" does not match any node`);
    } else if (fg.kind !== 'navigate') {
      errors.push(
        `foreground node "${fg.id}" must be kind 'navigate', got '${fg.kind}'`,
      );
    }
  }

  const grantSet = new Set(input.capabilityGrants);

  // Per-node validation: payloads + capability resolution + grant coverage.
  const resolved = new Map<string, Capability>();
  for (const node of byId.values()) {
    if (node.kind === 'clarify' && !node.question) {
      errors.push(`clarify node "${node.id}" must declare a question`);
    }
    if (node.kind === 'handoff') {
      if (!node.handoff) {
        errors.push(`handoff node "${node.id}" must declare a handoff payload`);
      } else {
        if (node.handoff.targetApp === node.appId) {
          warnings.push(
            `handoff node "${node.id}" targets its own app "${node.appId}" — cross-app handoff expected`,
          );
        }
        for (const grant of node.handoff.grants) {
          if (!grantSet.has(grant)) {
            errors.push(
              `handoff node "${node.id}" carries grant "${grant}" outside the task's capabilityGrants (scoped handoff may only narrow)`,
            );
          }
        }
      }
    }
    if (node.kind === 'navigate' && !node.params?.deepLink) {
      warnings.push(`navigate node "${node.id}" has no params.deepLink — navigator will receive an empty link`);
    }

    if (node.capabilityId) {
      if (!grantSet.has(node.capabilityId)) {
        errors.push(
          `node "${node.id}" invokes capability "${node.capabilityId}" outside the task's capabilityGrants`,
        );
        continue;
      }
      const capability = input.capabilities.get(node.capabilityId);
      if (!capability) {
        errors.push(
          `node "${node.id}" references unknown capability "${node.capabilityId}" (fail closed)`,
        );
        continue;
      }
      if (capability.status !== 'active') {
        errors.push(
          `node "${node.id}" references capability "${node.capabilityId}" with status "${capability.status}" — only 'active' capabilities may execute`,
        );
        continue;
      }
      resolved.set(node.id, capability);

      // Approval forecast: run the real policy with a no-approval context.
      const decision = evaluatePolicy(capability, {
        callerType: 'quanty',
        userId: input.forecastUserId ?? input.provenance.actorUserId,
        tenantId: undefined,
        scopes: [],
        approvalGranted: false,
      });
      if (decision.allowed && decision.requiresApproval) {
        approvalsRequired.push(node.id);
        warnings.push(
          `node "${node.id}" will require user approval at runtime (${decision.approvalReason})`,
        );
      } else if (!decision.allowed) {
        warnings.push(
          `node "${node.id}" capability "${node.capabilityId}" is denied by policy at forecast time: ${decision.error} — runtime context may still allow it`,
        );
      }

      if (MUTATING_NODE_KINDS.has(node.kind) && capability.idempotency.required && (node.maxRetries ?? 0) > 0) {
        warnings.push(
          `node "${node.id}" retries a mutating capability — executor will enforce idempotency keys and verify-before-retry`,
        );
      }
    } else if (MUTATING_NODE_KINDS.has(node.kind) || node.kind === 'read' || node.kind === 'draft') {
      warnings.push(
        `node "${node.id}" (${node.kind}) declares no capabilityId — it will run as a no-op lifecycle node`,
      );
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, approvalsRequired: [] };
  }

  const nodes: Record<string, TaskNode> = {};
  for (const [id, node] of byId) nodes[id] = node;

  const graph: TaskGraph = {
    taskId: input.taskId,
    sessionId: input.sessionId,
    goal: input.goal,
    priority: input.priority ?? 0,
    foregroundNodeId: input.foregroundNodeId,
    nodes,
    capabilityGrants: [...grantSet],
    deadlineAt: input.deadlineAt,
    provenance: input.provenance,
  };

  return { ok: true, graph, errors: [], warnings, approvalsRequired };
}

/** Topological waves: each wave lists nodes whose dependencies are all in
 *  earlier waves. Nodes within a wave may execute in parallel. Throws on
 *  cycles (compileTaskGraph should have caught them first). */
export function topologicalWaves(graph: TaskGraph): string[][] {
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const id of Object.keys(graph.nodes)) {
    indegree.set(id, 0);
    dependents.set(id, []);
  }
  for (const [id, node] of Object.entries(graph.nodes)) {
    for (const dep of node.dependsOn) {
      indegree.set(id, (indegree.get(id) ?? 0) + 1);
      dependents.get(dep)?.push(id);
    }
  }
  const waves: string[][] = [];
  let ready = [...indegree.entries()].filter(([, d]) => d === 0).map(([id]) => id);
  const seen = new Set<string>();
  while (ready.length > 0) {
    waves.push(ready);
    const next: string[] = [];
    for (const id of ready) {
      seen.add(id);
      for (const dependent of dependents.get(id) ?? []) {
        const remaining = (indegree.get(dependent) ?? 1) - 1;
        indegree.set(dependent, remaining);
        if (remaining === 0) next.push(dependent);
      }
    }
    ready = next;
  }
  if (seen.size !== Object.keys(graph.nodes).length) {
    throw new Error('task graph contains a dependency cycle');
  }
  return waves;
}

/** Narrow a task's ambient grants to an explicit scoped set for a handoff.
 *  Throws if any requested grant is outside the ambient set. */
export function scopeHandoffGrants(
  ambientGrants: readonly string[],
  requested: readonly string[],
): string[] {
  const ambient = new Set(ambientGrants);
  const scoped: string[] = [];
  for (const grant of requested) {
    if (!ambient.has(grant)) {
      throw new Error(
        `cannot scope handoff grant "${grant}" — outside the task's capability grants`,
      );
    }
    if (!scoped.includes(grant)) scoped.push(grant);
  }
  return scoped;
}

/** Type guard for app ids carried across trust boundaries. */
export function isQuantAppId(value: unknown): value is QuantAppId {
  return (
    typeof value === 'string' &&
    [
      'quantmail',
      'quantchat',
      'quantai',
      'quantgram',
      'quantwave',
      'quantmax',
      'quantube',
      'quantcooks',
      'quantads',
    ].includes(value)
  );
}
