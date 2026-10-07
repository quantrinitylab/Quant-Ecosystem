// ============================================================================
// Company OS module — Org Planner port + default heuristic planner (Phase 6)
// quantmail-superhub · Task 18.1 (Requirements 9.3, 9.4)
// ============================================================================
//
// PURPOSE
//   `planOrg` decides WHICH roles to staff and HOW MANY workers of each — sized
//   to the goal (bigger goal => bigger org) — using `@quant/ai` for planning.
//   That decision is isolated behind an injectable `OrgPlanner` PORT so the
//   orchestrator is offline-testable: the production wiring uses the real
//   `@quant/ai` engine, while the default `HeuristicOrgPlanner` is a
//   deterministic, dependency-free planner (the design explicitly allows "a
//   default heuristic planner is fine; production uses the real engine").
//
//   The planner returns only the role/headcount shape (a `RoleAllocation[]`).
//   The orchestrator owns the budget-share + model-resolution math so the
//   `SUM(role budgets) <= budgetCap` invariant (Requirement 9.4) is enforced in
//   ONE place regardless of which planner produced the allocation.

import type { AgentRoleKey } from './role-catalog.service';

// ---------------------------------------------------------------------------
// Planner contract
// ---------------------------------------------------------------------------

/** One role + how many workers of it to staff. `count` MUST be >= 1. */
export interface RoleAllocation {
  roleKey: AgentRoleKey;
  count: number;
}

/** Input to the planner: the goal text and the org's hard budget ceiling. */
export interface OrgPlanRequest {
  orgId: string;
  goalText: string;
  budgetCap: number;
}

/**
 * Org-planning port (design: "decide roles + headcount, sized to the goal …
 * via @quant/ai"). A planner returns a non-empty `RoleAllocation[]`; the
 * orchestrator normalizes/validates it (dedupes roles, drops non-positive
 * counts, guarantees a planner is present).
 */
export interface OrgPlanner {
  plan(request: OrgPlanRequest): RoleAllocation[] | Promise<RoleAllocation[]>;
}

// ---------------------------------------------------------------------------
// Default heuristic planner (offline, deterministic)
// ---------------------------------------------------------------------------

/** Keyword → role hints, so the org composition reflects the goal's intent. */
const ROLE_KEYWORDS: ReadonlyArray<{ role: AgentRoleKey; words: readonly string[] }> = [
  { role: 'tester', words: ['test', 'qa', 'coverage', 'quality'] },
  { role: 'debugger', words: ['bug', 'fix', 'debug', 'crash', 'regression', 'flaky'] },
  { role: 'devops', words: ['deploy', 'release', 'pipeline', 'ci', 'cd', 'infra', 'docker', 'kubernetes'] },
  { role: 'upgrader', words: ['upgrade', 'migrate', 'modernize', 'dependency', 'bump', 'version'] },
];

/**
 * A deterministic planner that sizes the org from the goal text:
 *   - Always staffs a Planner (1) and a Reviewer (1) — the coordination +
 *     advisory-review backbone of every org.
 *   - Staffs Coders scaled by goal "size" (word count), from 1 up to a cap.
 *   - Adds Tester / Debugger / DevOps / Upgrader when the goal's keywords (or
 *     sheer size) call for them.
 * The result is clamped so a tiny goal yields a tiny org and a large, multi-
 * faceted goal yields a larger one (Requirement 9.3 "sized to the goal").
 */
export class HeuristicOrgPlanner implements OrgPlanner {
  /** Upper bound on coder headcount regardless of goal size. */
  private readonly maxCoders: number;

  constructor(options: { maxCoders?: number } = {}) {
    this.maxCoders = options.maxCoders ?? 5;
  }

  plan(request: OrgPlanRequest): RoleAllocation[] {
    const goal = (request.goalText ?? '').toLowerCase();
    const words = goal.split(/\s+/).filter((w) => w.length > 0);
    const size = words.length;

    // Coder headcount grows ~1 per 25 words of goal, clamped to [1, maxCoders].
    const coders = Math.max(1, Math.min(this.maxCoders, Math.ceil(size / 25)));

    const allocations: RoleAllocation[] = [
      { roleKey: 'planner', count: 1 },
      { roleKey: 'coder', count: coders },
      { roleKey: 'reviewer', count: 1 },
    ];

    // Keyword-driven specialist roles.
    const added = new Set<AgentRoleKey>();
    for (const { role, words: kws } of ROLE_KEYWORDS) {
      if (kws.some((w) => goal.includes(w))) {
        allocations.push({ roleKey: role, count: 1 });
        added.add(role);
      }
    }

    // A reasonably large goal always warrants a tester even without the keyword.
    if (size >= 12 && !added.has('tester')) {
      allocations.push({ roleKey: 'tester', count: 1 });
    }

    return allocations;
  }
}

/** A ready-to-use default planner instance. */
export const defaultOrgPlanner: OrgPlanner = new HeuristicOrgPlanner();
