/**
 * QM-QUANTY-004 — Cross-app Quanty task graph: canonical types.
 *
 * Sources:
 * - docs/quant-architecture/28-quanty-task-graph-background-and-multi-app-execution.md
 *   (task model, node types, cancellation, unknown outcomes, user controls)
 * - packages/ecosystem-contracts (QuantHandoffMode, QuantOperationState, QuantAppId)
 * - packages/app-registry (Capability, InvocationContext, InvocationResult, RiskTier)
 *
 * Design laws enforced here:
 *  1. Every node declares exactly what it needs; nodes never gain capabilities
 *     implicitly from another node (doc 28).
 *  2. Handoff envelopes carry ONLY the grants listed on the handoff node —
 *     scoped, never ambient (QM-QUANTY-004 "scoped handoff capability").
 *  3. Timeout after a mutation produces 'unknown', never silent failure
 *     (doc 28 §Unknown outcomes).
 *  4. Cancellation propagates to cancellable descendants; completed side
 *     effects are never magically undone — compensation is explicit.
 */

import type {
  QuantAppId,
  QuantHandoffMode,
  QuantOperationState,
} from '@quant/ecosystem-contracts';
import type {
  Capability,
  InvocationContext,
} from '@quant/app-registry';

/** Node kinds. The first nine are doc-28 §Node types; `clarify` and `handoff`
 *  are the QM-QUANTY-004 additions (clarification node, scoped handoff). */
export type TaskNodeKind =
  | 'read'
  | 'draft'
  | 'navigate'
  | 'mutate'
  | 'wait-for-user'
  | 'wait-for-event'
  | 'background-job'
  | 'verify'
  | 'compensate'
  | 'clarify'
  | 'handoff';

/** Node kinds that perform side effects and therefore need idempotency keys
 *  and unknown-outcome handling when they time out. */
export const MUTATING_NODE_KINDS: ReadonlySet<TaskNodeKind> = new Set([
  'mutate',
  'compensate',
  'handoff',
]);

/** Node kinds that pause execution until the outside world responds. */
export const WAITING_NODE_KINDS: ReadonlySet<TaskNodeKind> = new Set([
  'wait-for-user',
  'wait-for-event',
  'clarify',
]);

/** Execution state of a single node — the canonical ecosystem operation
 *  states, so task progress is reported in the same vocabulary everywhere. */
export type NodeExecutionState = QuantOperationState;

/** A question the graph asks the user when a `clarify` node runs. */
export interface ClarificationQuestion {
  /** Stable key the answer is filed under (also usable as an output key). */
  key: string;
  /** The question shown to the user. Must be specific, never vague. */
  prompt: string;
  /** Optional multiple-choice options; absent means free text. */
  options?: string[];
  /** Whether the user may skip (graph continues with `defaultValue`). */
  skippable?: boolean;
  defaultValue?: unknown;
}

/** Scoped handoff payload for a `handoff` node. */
export interface ScopedHandoff {
  /** Target product. Must differ from the node owner's app for cross-app. */
  targetApp: QuantAppId;
  /** Handoff mode from the ecosystem contract. */
  mode: QuantHandoffMode;
  /**
   * The ONLY capability grants carried across the boundary. The receiving
   * side must treat any capability not listed here as ungranted — grants
   * are never inherited from the parent task's ambient grants.
   */
  grants: string[];
  /** Opaque, product-typed payload (validated by the receiving app). */
  payload: Record<string, unknown>;
  /** Correlation id linking back to the originating task/node. */
  correlationId: string;
}

/** One node in a Quanty task graph. */
export interface TaskNode {
  /** Unique within the task. */
  id: string;
  kind: TaskNodeKind;
  /** Short human label, shown in the task center. */
  label: string;
  /** Product that owns the capability this node invokes. */
  appId: QuantAppId;
  /**
   * Registry capability this node executes (e.g. 'quantmail.email.send').
   * Must resolve to an `active` capability at compile time — unknown or
   * preview capabilities fail the compile closed.
   */
  capabilityId?: string;
  /** Node ids that must reach a terminal successful state first. */
  dependsOn: string[];
  /**
   * Input for the capability invocation. May reference outputs of
   * dependencies via `{ $output: '<nodeId>.<key>' }` placeholders,
   * resolved by the executor before invocation.
   */
  params?: Record<string, unknown>;
  /** Named outputs this node publishes for downstream `$output` refs. */
  outputs?: string[];
  /** Clarification question — required when kind === 'clarify'. */
  question?: ClarificationQuestion;
  /** Scoped handoff — required when kind === 'handoff'. */
  handoff?: Omit<ScopedHandoff, 'correlationId'>;
  /** Max wall-clock ms before the node is marked timed-out. */
  timeoutMs?: number;
  /**
   * Max attempts for retryable failures. Retries of mutating nodes require
   * idempotency (capability idempotency.required or explicit key) and a
   * verification pass first when the previous attempt ended 'unknown'.
   */
  maxRetries?: number;
  /** Explicit compensation node id run when this node is cancelled mid-flight. */
  compensateWith?: string;
  /** Human note, e.g. why this node exists. */
  note?: string;
}

/** A complete, validated Quanty task graph. */
export interface TaskGraph {
  /** Stable task id (uuid). */
  taskId: string;
  /** Owning Quanty session. */
  sessionId: string;
  /** User-visible goal, e.g. "Email Rahul and then open QuantMax." */
  goal: string;
  /** Priority for scheduling: higher runs first when contended. */
  priority: number;
  /** Node id that should take the foreground when reached (a `navigate` node). */
  foregroundNodeId?: string;
  /** All nodes, keyed by id. */
  nodes: Record<string, TaskNode>;
  /**
   * Capability ids the task as a whole may draw on. A node may only invoke
   * capabilities in this set — and handoff nodes carry their own narrower
   * `grants`, never the ambient set.
   */
  capabilityGrants: string[];
  /** Absolute deadline (ISO string); the executor cancels past it. */
  deadlineAt?: string;
  /** Provenance: who asked, from which app/surface. */
  provenance: {
    actorUserId: string;
    sourceApp: QuantAppId;
    correlationId: string;
  };
}

/** Per-node runtime record kept by the executor. */
export interface NodeRunRecord {
  nodeId: string;
  state: NodeExecutionState;
  attempt: number;
  startedAt?: string;
  finishedAt?: string;
  /** Output published under the node's declared output keys. */
  output?: Record<string, unknown>;
  error?: string;
  /** Idempotency key used for mutating invocations. */
  idempotencyKey?: string;
  /**
   * What the node is paused on, if anything. The canonical `state` stays
   * within QuantOperationState; this discriminator tells the task center
   * exactly what the node waits for.
   */
  waitingFor?: 'approval' | 'clarification' | 'event';
  /** Last approval reason surfaced for this node (if any). */
  approvalReason?: string;
}

/** Events the executor emits — the task center UI and realtime sync
 *  consume these; nothing else needs to poll. */
export type TaskEvent =
  | { type: 'task_started'; taskId: string; at: string }
  | { type: 'node_started'; taskId: string; nodeId: string; at: string }
  | {
      type: 'node_completed';
      taskId: string;
      nodeId: string;
      at: string;
      output?: Record<string, unknown>;
    }
  | {
      type: 'node_failed';
      taskId: string;
      nodeId: string;
      at: string;
      error: string;
      terminal: boolean;
    }
  | {
      type: 'node_unknown';
      taskId: string;
      nodeId: string;
      at: string;
      reason: string;
    }
  | {
      type: 'approval_required';
      taskId: string;
      nodeId: string;
      at: string;
      reason: string;
      capabilityId: string;
    }
  | {
      type: 'clarification_requested';
      taskId: string;
      nodeId: string;
      at: string;
      question: ClarificationQuestion;
    }
  | {
      type: 'handoff_emitted';
      taskId: string;
      nodeId: string;
      at: string;
      handoff: ScopedHandoff;
    }
  | {
      type: 'node_cancelled';
      taskId: string;
      nodeId: string;
      at: string;
      reason: string;
    }
  | {
      type: 'task_completed';
      taskId: string;
      at: string;
      state: 'completed' | 'partial' | 'failed' | 'cancelled';
    };

/** Host-provided capability invocation. The executor never calls product
 *  backends directly — the Quanty agent gateway supplies this. */
export interface CapabilityInvoker {
  invoke(
    capability: Capability,
    input: unknown,
    context: InvocationContext,
    signal: AbortSignal,
  ): Promise<{
    ok: boolean;
    data?: unknown;
    error?: string;
    verificationState?: 'verified' | 'unknown' | 'failed';
  }>;
}

/** Host-provided authoritative-state check used after 'unknown' outcomes.
 *  Must query the product's source of truth (never a cache) for whether the
 *  side effect happened, keyed by the idempotency key. */
export interface VerificationAdapter {
  verify(
    capability: Capability,
    idempotencyKey: string,
    signal: AbortSignal,
  ): Promise<'verified' | 'absent' | 'unknown'>;
}

/** Host-provided foreground navigation. Emitted for `navigate` nodes and
 *  when the foreground node is reached. */
export interface ForegroundNavigator {
  navigate(targetApp: QuantAppId, deepLink: string, signal: AbortSignal): Promise<void>;
}

/** Everything the executor needs from its host. */
export interface ExecutorHost {
  invoker: CapabilityInvoker;
  verification: VerificationAdapter;
  navigator: ForegroundNavigator;
  /** Capability lookup — backed by the app-registry CapabilityRegistry. */
  capabilities: {
    get(capabilityId: string): Capability | undefined;
  };
  /** Event sink (task center, realtime sync). */
  emit(event: TaskEvent): void;
  /** Clock (injectable for tests). */
  now(): string;
  /**
   * Build the InvocationContext for a node invocation. The host owns
   * scopes, tenant, durable policy grants and step-up state.
   */
  buildContext(node: TaskNode, graph: TaskGraph): InvocationContext;
  /** Idempotency store. Defaults to an in-memory store when omitted. */
  idempotency?: {
    get(key: string): Promise<unknown | undefined>;
    set(key: string, result: unknown, ttlSeconds: number): Promise<void>;
  };
}

/** Result of compiling raw node descriptors into a TaskGraph. */
export interface CompileResult {
  ok: boolean;
  graph?: TaskGraph;
  /** Fail-closed diagnostics; non-empty when ok === false. */
  errors: string[];
  /** Non-blocking notes, e.g. nodes that will require user approval. */
  warnings: string[];
  /** Node ids that require approval before execution (from risk tiers). */
  approvalsRequired: string[];
}
