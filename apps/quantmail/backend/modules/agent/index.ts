// ============================================================================
// Agent module — autonomous coding agent runtime (Pillar 3)
// quantmail-superhub · Task 12.1 (Requirements 7.1, 7.2)
// ============================================================================
//
// PURPOSE
//   Groups the bounded, branch-isolated Agent Runtime (the plan → edit → open
//   PR → run CI → iterate loop) into a single cohesive module, mirroring the
//   QuantCode module structure (`modules/code/`). The Agent Runtime is a
//   *consumer* of the QuantCode module's public surface (repo write-scope, and
//   later the scoped tool APIs for edits/PR/CI) — it imports QuantCode only via
//   that module's barrel (`../code`), never by reaching into
//   `modules/code/services/*`, so the SRP boundary (design AD-2) is preserved.
//
// SCOPE GUARD
//   This module owns the agent runtime only. It does NOT import the mail domain
//   and does NOT touch QuantChat.
//
// CURRENT SURFACE (Tasks 12.1–12.4)
//   `AgentRuntime.startTask` — write-scope + budget preconditions, then creates
//   an `AgentSession` in `planning` status on an isolated agent branch.
//   `AgentRuntime.step` — one bounded iteration of the tool-execution loop
//   (select → execute → observe → append transcript), enforcing the iteration
//   bound and branch-isolation invariants.
//   `createQuantCodeAgentTools` / `buildQuantCodeAgentToolRegistry` (Task 12.4)
//   — the five agent tools (`read_file`, `edit_file`, `open_pr`, `run_ci`,
//   `search_repo`) whose side-effects are confined to the QuantCode module's
//   scoped APIs. Edits/pushes/CI target only the isolated agent branch, and
//   `open_pr` lands changes via an OPEN PR that requires explicit human
//   approval to merge (the agent never merges). Pair the registry with an
//   `ActionExecutor` + `createAssistantToolExecutionLoop` to drive `step`.

export {
  AgentRuntime,
  positiveBudgetOnly,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_COST_BUDGET,
} from './services/agent-runtime.service';
export type {
  AgentBudget,
  BudgetPort,
  ResourceOwnershipPort,
  StartTaskOptions,
  AgentRuntimeOptions,
  StepOutcome,
  StepResult,
} from './services/agent-runtime.service';

export {
  noopToolExecutionLoop,
  createAssistantToolExecutionLoop,
} from './services/tool-execution-loop';

// Task 13.1 — route agent-session AI inference through the credit-metering
// choke point: a UsageGate-backed loop wrapper (reserve before inference,
// settle after) so an agent session is metered and fails closed on an empty
// wallet. Depends on the billing module via its barrel only.
export { withUsageMetering } from './services/usage-metering-loop';
export type { UsageMeteringOptions } from './services/usage-metering-loop';
export type {
  ToolExecutionLoop,
  ToolCall,
  Observation,
  AgentStepState,
  ToolPlanner,
  AssistantToolExecutionLoopOptions,
  AgentTranscriptRole,
} from './services/tool-execution-loop';

// Task 12.4 — the five QuantCode-scoped agent tools + human-gated PR landing.
export {
  createQuantCodeAgentTools,
  buildQuantCodeAgentToolRegistry,
  registerQuantCodeAgentTools,
  noopRepoReader,
  AGENT_TOOLS_APP,
} from './services/quantcode-agent-tools';
export type {
  QuantCodeAgentToolDeps,
  CiFixPort,
  CiFixSuggestion,
  RepoReadPort,
} from './services/quantcode-agent-tools';

// Task 22.1 — human-approval gating + AgentActionAudit for sensitive actions.
// Keeps merges and sensitive Gmail actions PENDING until a human (CEO/owner)
// approves; records every sensitive action in the audit trail with
// `approvedByHuman` true ONLY when a human approved (Req 14.1–14.3, 23.1, 23.3).
export { AgentApprovalGate } from './services/approval-gating.service';
export type {
  AgentActionType,
  AgentActionSensitivity,
  AgentActionStatus,
  RequestApprovalInput,
  MergeApprovalPort,
} from './services/approval-gating.service';
