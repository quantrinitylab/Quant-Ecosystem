// ============================================================================
// Agent module — route agent-session AI inference through the UsageGate
// quantmail-superhub · Task 13.1 (Requirements 18.1, 18.5)
// ============================================================================
//
// PURPOSE
//   Wraps a {@link ToolExecutionLoop} so each agent iteration that runs AI
//   inference passes through the credit-metering choke point (Pillar 5 of the
//   design's Billing/Credits layer): a credit is RESERVED before the inference
//   runs (fail closed if the wallet cannot fund it) and SETTLED against the
//   actual token spend afterward. Projected/actual tokens are read from the
//   `@quant/ai` cost tracker — projected via the engine's token counter, actual
//   from the tool observation (`tokensUsed`/`costDelta`, which the
//   `createAssistantToolExecutionLoop` adapter lifts off the `@quant/ai`
//   `AIToolResult`).
//
//   The wrapper sits in the AGENT module (it needs the loop's `Observation`
//   shape) and depends on the billing module only through its barrel
//   (`../../billing`), preserving the agent -> billing direction with no cycle.
//
//   FAIL CLOSED: if `checkAndReserve` rejects (out of credits / not entitled),
//   the inference does NOT run; the wrapper returns an unsuccessful observation
//   that finalizes the session (`done: true`) so the agent stops cleanly. This
//   honors the design invariant: "NO metered action proceeds without a
//   successful reservation."

import { estimateTokens } from '@quant/ai';
import type {
  ToolExecutionLoop,
  ToolCall,
  Observation,
  AgentStepState,
} from './tool-execution-loop';
import type { UsageGate, MeteredAction, TokenUsage, Reservation } from '../../billing';

export interface UsageMeteringOptions {
  /** The credit gate every metered iteration reserves/settles against. */
  gate: UsageGate;
  /**
   * Resolve the owner billed for a session's spend. Defaults to the session's
   * `userId` (the agent runs on the initiating user's wallet).
   */
  resolveOwnerRef?(state: AgentStepState): string;
  /**
   * Decide whether a given tool call incurs AI-inference cost. Defaults to
   * `true` (every step is treated as a metered inference). Read-only tools that
   * never call the model can be excluded here.
   */
  isMetered?(call: ToolCall, state: AgentStepState): boolean;
  /**
   * Project token usage for the upcoming inference (read from the `@quant/ai`
   * cost tracker / token counter). Defaults to estimating from the instruction
   * plus serialized tool args via `@quant/ai`'s `estimateTokens`.
   */
  projectTokens?(call: ToolCall, state: AgentStepState): TokenUsage;
  /** Build the idempotency key for the iteration's reservation. */
  buildActionKey?(call: ToolCall, state: AgentStepState): string;
  /** Resolve the model id used for rate lookup (optional). */
  resolveModelId?(call: ToolCall, state: AgentStepState): string | undefined;
}

/** Default per-iteration action key: stable within a session+iteration+tool. */
function defaultActionKey(call: ToolCall, state: AgentStepState): string {
  return `agent:${state.sessionId}:${state.iterationCount}:${call.toolName}`;
}

/** Default token projection: estimate from instruction + serialized args. */
function defaultProjectTokens(call: ToolCall, state: AgentStepState): TokenUsage {
  let argText = '';
  try {
    argText = JSON.stringify(call.args ?? {});
  } catch {
    argText = '';
  }
  const input = estimateTokens(`${state.instruction}\n${argText}`);
  // Reserve headroom for a model response of comparable size to the prompt.
  return { input, output: input };
}

/**
 * Derive an actual-cost credit figure for settlement from a completed
 * observation. Prefers a tool-reported `costDelta` (already in credits); else
 * re-prices the actually-used tokens through the gate's PricingEngine.
 */
function actualCostFor(
  gate: UsageGate,
  reservation: Reservation,
  observation: Observation,
  modelId: string | undefined,
): number {
  if (typeof observation.costDelta === 'number' && Number.isFinite(observation.costDelta)) {
    return Math.max(0, observation.costDelta);
  }
  if (typeof observation.tokensUsed === 'number' && observation.tokensUsed > 0) {
    // Re-price the measured tokens via the same PricingEngine (50/50 split).
    const half = observation.tokensUsed / 2;
    const action: MeteredAction = {
      actionKey: reservation.actionKey,
      kind: 'ai_inference',
      modelId,
      projectedTokens: { input: half, output: half },
    };
    return gate.estimateCost(action);
  }
  // No measured usage -> settle at the reserved estimate (no surprise charge).
  return reservation.estimatedCost;
}

/**
 * Wrap a {@link ToolExecutionLoop} so AI-inference iterations are metered
 * through the {@link UsageGate}: reserve before `execute`, settle after.
 *
 * Tool SELECTION is delegated unchanged to the inner loop. Tool EXECUTION is
 * bracketed by the gate's reserve/settle so the agent session's AI spend is
 * accounted for and fails closed when the wallet is empty.
 */
export function withUsageMetering(
  inner: ToolExecutionLoop,
  options: UsageMeteringOptions,
): ToolExecutionLoop {
  const { gate } = options;

  return {
    selectTool: (state) => inner.selectTool(state),

    async execute(call, state) {
      const metered = options.isMetered?.(call, state) ?? true;
      if (!metered) {
        return inner.execute(call, state);
      }

      const ownerRef = options.resolveOwnerRef?.(state) ?? state.userId;
      const modelId = options.resolveModelId?.(call, state);
      const action: MeteredAction = {
        actionKey: options.buildActionKey?.(call, state) ?? defaultActionKey(call, state),
        kind: 'ai_inference',
        ownerRef,
        modelId,
        projectedTokens:
          options.projectTokens?.(call, state) ?? defaultProjectTokens(call, state),
      };

      // 1. RESERVE before the inference runs (fail closed).
      let reservation: Reservation;
      try {
        reservation = await gate.checkAndReserve(ownerRef, action);
      } catch (err) {
        return {
          ok: false,
          error: errorCode(err),
          done: true,
        } satisfies Observation;
      }

      // 2. EXECUTE the inference.
      const observation = await inner.execute(call, state);

      // 3. SETTLE against the actual measured cost (idempotent).
      const actualCost = actualCostFor(gate, reservation, observation, modelId);
      await gate.settle(reservation, actualCost);

      // Surface the settled credit cost so the runtime bookkeeps costSpent.
      return { ...observation, costDelta: actualCost };
    },
  };
}

/** Pull a stable error code from a thrown app error (defaults to OUT_OF_CREDITS). */
function errorCode(err: unknown): string {
  if (err != null && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return 'OUT_OF_CREDITS';
}
