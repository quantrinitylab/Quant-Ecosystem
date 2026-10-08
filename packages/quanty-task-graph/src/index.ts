/**
 * QM-QUANTY-004 — Cross-app Quanty task graph.
 *
 * Typed task graphs for multi-step, multi-app Quanty work:
 * compile (validate) -> run (schedule + execute) -> verify -> handoff.
 *
 * Architecture: docs/quant-architecture/28-quanty-task-graph-background-and-multi-app-execution.md
 * Contracts: @quant/ecosystem-contracts, @quant/app-registry
 */
export type {
  TaskNodeKind,
  TaskNode,
  TaskGraph,
  NodeExecutionState,
  NodeRunRecord,
  ClarificationQuestion,
  ScopedHandoff,
  TaskEvent,
  CapabilityInvoker,
  VerificationAdapter,
  ForegroundNavigator,
  ExecutorHost,
  CompileResult,
} from './types';
export { MUTATING_NODE_KINDS, WAITING_NODE_KINDS } from './types';

export type { CompileInput } from './compiler';
export { compileTaskGraph, topologicalWaves, scopeHandoffGrants, isQuantAppId } from './compiler';

export type { TaskControl, TaskFinalState } from './executor';
export { runTask } from './executor';

export type { UnknownOutcomeResolution } from './verification';
export { resolveUnknownOutcome, mayRetry } from './verification';
