// ============================================================================
// Billing module — UsageGate-backed BudgetPort adapter for the Agent Runtime
// quantmail-superhub · Task 13.1 (Requirements 18.1, 18.5)
// ============================================================================
//
// PURPOSE
//   Wires the agent layer's budget precondition to the credit economy. The
//   `AgentRuntime` (Task 12.1) gates `startTask` behind an injectable
//   `BudgetPort.hasAvailableBudget(userId, budget)` whose default
//   (`positiveBudgetOnly`) only checks that the requested iteration/cost budget
//   is positive. This adapter produces a `BudgetPort` that ALSO verifies, via
//   the {@link UsageGate}, that the user's wallet can actually fund the session
//   — so an agent session cannot start unless credits are available (design:
//   "the user has ... an available budget"; the Company OS budget is denominated
//   in credits backed by the user's wallet).
//
//   The adapter is intentionally typed against a LOCAL structural shape rather
//   than importing the agent module, so the dependency direction stays
//   agent -> billing (mirroring agent -> code) with no import cycle. The agent
//   module's `BudgetPort`/`AgentBudget` are structurally identical, so the
//   returned object is accepted by `new AgentRuntime(prisma, { budget })`.

import type { UsageGate } from './usage-gate.service';

/**
 * The session bounds the agent layer passes to its budget check. Structurally
 * identical to the agent module's `AgentBudget` (kept local to avoid a cyclic
 * import).
 */
export interface SessionBudget {
  /** Hard upper bound on tool-execution iterations. MUST be > 0. */
  maxIterations: number;
  /** Credit budget reserved for the session's AI spend. MUST be > 0. */
  costBudget: number;
}

/**
 * Structural mirror of the agent module's `BudgetPort`. An object of this shape
 * is accepted by `AgentRuntime`'s `budget` option.
 */
export interface BudgetCheckPort {
  hasAvailableBudget(userId: string, budget: SessionBudget): boolean | Promise<boolean>;
}

export interface UsageGateBudgetPortOptions {
  /** The credit gate whose available balance funds the session. */
  gate: UsageGate;
  /**
   * Credits the session must be able to fund before it may start. Defaults to
   * the session's `costBudget` (the budget is already denominated in credits).
   * Override to reserve a different amount (e.g. a flat start-up cost).
   */
  requiredCredits?(userId: string, budget: SessionBudget): number;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Build a {@link BudgetCheckPort} backed by the {@link UsageGate}. A session is
 * fundable only when:
 *   1. the requested budget is positive (preserves the original precondition), and
 *   2. the user's available credit balance covers the required credits.
 *
 * This makes the agent runtime FAIL CLOSED on an empty/insufficient wallet —
 * `startTask` rejects with `BUDGET_REQUIRED` — while keeping the full wallet
 * implementation (Phase 7) behind the gate's seams.
 */
export function createUsageGateBudgetPort(options: UsageGateBudgetPortOptions): BudgetCheckPort {
  return {
    async hasAvailableBudget(userId, budget) {
      if (!isPositiveFinite(budget.maxIterations) || !isPositiveFinite(budget.costBudget)) {
        return false;
      }
      const required = options.requiredCredits?.(userId, budget) ?? budget.costBudget;
      const available = await options.gate.getAvailableBalance(userId);
      return available >= required;
    },
  };
}
