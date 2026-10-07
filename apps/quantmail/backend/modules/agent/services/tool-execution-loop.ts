// ============================================================================
// Agent module — ToolExecutionLoop port (Pillar 3)
// quantmail-superhub · Task 12.2 (Requirements 7.2, 7.3, 7.4)
// ============================================================================
//
// PURPOSE
//   Defines the injectable seam the `AgentRuntime.step` loop drives for ONE
//   iteration of the design's `ToolExecutionLoop` interface
//   (design §"INTERFACE ToolExecutionLoop"):
//
//       FUNCTION selectTool(state, plan) RETURNS ToolCall
//       PROCEDURE execute(ToolCall) RETURNS Observation
//         POSTCONDITION: side effects confined to the QuantCode scoped APIs
//
//   The runtime treats one iteration as: SELECT a tool -> EXECUTE it -> OBSERVE
//   the result -> append an auditable transcript entry. By abstracting tool
//   selection (the `@quant/ai` `UniversalAssistant`/`IntentRouter` planner) and
//   tool execution (the `@quant/ai` `ActionExecutor` over a `ToolRegistry`)
//   behind this port, the bounded loop and its invariants (iteration bound,
//   branch isolation, transcript audit) are fully unit-testable OFFLINE — no
//   live LLM or git side-effect is required to assert the loop's safety
//   properties.
//
//   `createAssistantToolExecutionLoop` is the production adapter that genuinely
//   REUSES `@quant/ai`'s `ToolRegistry` + `ActionExecutor` for the EXECUTE half,
//   while the intelligent SELECT half (which needs the LLM) is supplied through
//   an injectable `planner` seam. Tool scope-confinement and the wiring of the
//   five concrete tools (`read_file`, `edit_file`, `open_pr`, `run_ci`,
//   `search_repo`) to the QuantCode module's scoped APIs is Task 12.4 — this
//   file only fixes the contract and the offline-friendly default.

import type { QuantApp } from '@quant/common';
import type { ToolRegistry, ActionExecutor, AssistantContext } from '@quant/ai';

/**
 * Transcript-entry role (mirrors the Prisma `AgentTranscriptRole` enum).
 * Declared locally because the generated client surfaces the enum only as an
 * input-field union, not as a re-exported named type.
 */
export type AgentTranscriptRole = 'PLAN' | 'TOOL_CALL' | 'OBSERVATION' | 'MESSAGE';

// ---------------------------------------------------------------------------
// Loop contracts
// ---------------------------------------------------------------------------

/**
 * The read-only view of the session a single iteration operates against. The
 * loop uses `branchRef` as the ONLY branch a tool may mutate (Requirement 7.2)
 * and `iterationCount`/`maxIterations` for plan context (Requirement 7.3).
 */
export interface AgentStepState {
  sessionId: string;
  userId: string;
  repoId: string;
  instruction: string;
  /** The isolated agent branch — the only branch a tool is permitted to mutate. */
  branchRef: string;
  iterationCount: number;
  maxIterations: number;
}

/** A tool the loop has decided to invoke this iteration. */
export interface ToolCall {
  /** Tool name as registered in the `@quant/ai` `ToolRegistry`. */
  toolName: string;
  /** Arguments passed to the tool handler. */
  args: Record<string, unknown>;
  /**
   * Transcript role to record for this step. Defaults to `TOOL_CALL`. A planner
   * that produces a plan-only step (no side effect) may set `PLAN`/`MESSAGE`.
   */
  role?: AgentTranscriptRole;
}

/** The result of executing + observing a {@link ToolCall}. */
export interface Observation {
  /** True when the tool completed successfully. */
  ok: boolean;
  /** Structured tool output, recorded into the transcript payload. */
  output?: unknown;
  /** Error message when `ok` is false. */
  error?: string;
  /** Tokens the tool consumed (recorded on the transcript entry). */
  tokensUsed?: number;
  /** Credit cost of this iteration; added to `session.costSpent`. */
  costDelta?: number;
  /** Files the tool mutated (audit trail). */
  mutatedFiles?: string[];
  /**
   * The branch the tool mutated, if any. The runtime FAILS CLOSED when this is
   * present and differs from `session.branchRef` (Requirement 7.2 invariant).
   * A read-only tool leaves this undefined.
   */
  mutatedBranch?: string;
  /**
   * Signals the agent considers the task complete (e.g. a PR was opened and is
   * awaiting human review). The runtime stops the session when set.
   */
  done?: boolean;
}

/**
 * One iteration of the agent's plan→act loop, abstracted as an injectable port.
 *
 * - `selectTool` returns the next {@link ToolCall}, or `null` when the plan is
 *   complete and no further tool should run (the runtime then finalizes the
 *   session for human review).
 * - `execute` runs the selected tool and returns an {@link Observation}.
 */
export interface ToolExecutionLoop {
  selectTool(state: AgentStepState): ToolCall | null | Promise<ToolCall | null>;
  execute(call: ToolCall, state: AgentStepState): Observation | Promise<Observation>;
}

// ---------------------------------------------------------------------------
// Offline-friendly default
// ---------------------------------------------------------------------------

/**
 * Default loop used when no real loop is wired. It selects no tool, so a single
 * `step` immediately finalizes the session for human review. This keeps
 * `AgentRuntime` constructible (and its bound/transcript invariants testable)
 * without a live LLM or git transport, and makes "do nothing" the safe default.
 */
export const noopToolExecutionLoop: ToolExecutionLoop = {
  selectTool() {
    return null;
  },
  async execute() {
    return { ok: true, done: true };
  },
};

// ---------------------------------------------------------------------------
// @quant/ai production adapter
// ---------------------------------------------------------------------------

/** Planner seam: chooses the next tool for the iteration (LLM-backed in prod). */
export type ToolPlanner = (
  state: AgentStepState,
  registry: ToolRegistry,
) => ToolCall | null | Promise<ToolCall | null>;

export interface AssistantToolExecutionLoopOptions {
  /** The `@quant/ai` registry whose tools the agent may invoke. */
  registry: ToolRegistry;
  /** The `@quant/ai` executor that validates + runs a tool. */
  executor: ActionExecutor;
  /** Intelligent tool selection (UniversalAssistant/IntentRouter in production). */
  planner: ToolPlanner;
  /** App namespace the agent's tools are registered under. Defaults to `quantmail`. */
  app?: QuantApp;
  /** Optional custom assistant-context builder for tool execution. */
  buildContext?: (state: AgentStepState) => AssistantContext;
}

/** Read an optional field from an unknown tool-result payload, if it is an object. */
function readField(data: unknown, key: string): unknown {
  if (data != null && typeof data === 'object' && key in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)[key];
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
    ? (value as string[])
    : undefined;
}

/**
 * Build a {@link ToolExecutionLoop} that reuses `@quant/ai`'s `ToolRegistry` +
 * `ActionExecutor` to execute the chosen tool, mapping the `AIToolResult` into
 * an {@link Observation}. The intelligent selection step is delegated to the
 * injected `planner` so the costly LLM dependency stays behind a seam.
 *
 * A tool surfaces iteration metadata (tokens, cost, mutated files/branch,
 * completion) by returning it on the `AIToolResult.data` object; this adapter
 * lifts those fields onto the `Observation` so the runtime can enforce the
 * branch-isolation invariant and bookkeep cost/tokens.
 */
export function createAssistantToolExecutionLoop(
  options: AssistantToolExecutionLoopOptions,
): ToolExecutionLoop {
  const app: QuantApp = options.app ?? 'quantmail';

  return {
    selectTool: (state) => options.planner(state, options.registry),

    async execute(call, state) {
      const context: AssistantContext =
        options.buildContext?.(state) ??
        ({
          userId: state.userId,
          currentApp: app,
          conversationHistory: [],
          // Surface the isolated branch + task to the tool layer so scoped
          // QuantCode tools (Task 12.4) write only to the agent branch.
          crossAppState: {
            agentSessionId: state.sessionId,
            repoId: state.repoId,
            branchRef: state.branchRef,
            instruction: state.instruction,
          },
        } satisfies AssistantContext);

      const result = await options.executor.execute(app, call.toolName, call.args, context);

      return {
        ok: result.success,
        output: result.data ?? result.displayMessage,
        error: result.error,
        tokensUsed: asNumber(readField(result.data, 'tokensUsed')),
        costDelta: asNumber(readField(result.data, 'costDelta')),
        mutatedFiles: asStringArray(readField(result.data, 'mutatedFiles')),
        mutatedBranch:
          typeof readField(result.data, 'mutatedBranch') === 'string'
            ? (readField(result.data, 'mutatedBranch') as string)
            : undefined,
        done: readField(result.data, 'done') === true,
      };
    },
  };
}
