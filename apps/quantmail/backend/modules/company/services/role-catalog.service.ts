// ============================================================================
// Company OS module — Agent Role model + Role Catalog (Phase 6)
// quantmail-superhub · Task 18.1 (Requirements 9.3, 10.5, 10.6)
// ============================================================================
//
// PURPOSE
//   Defines the seven agent ROLES (planner, coder, reviewer, tester, debugger,
//   upgrader, devops) — each a job description with a default tool scope and a
//   default model — and the `RoleCatalog` that lists them and resolves the
//   model for a role.
//
//   `resolveModel(orgId, roleKey, ceoOverrides)` implements the design's
//   precedence + fail-closed routability contract (design §"INTERFACE
//   RoleCatalog"):
//     • a per-WORKER override wins, then a per-ROLE override (CEO choices),
//       else the role's default model;
//     • the resolved model MUST be one `@quant/ai` can route to — otherwise the
//       selection FAILS CLOSED (throws) rather than silently falling back
//       (Requirement 10.6).
//
//   Routability is checked behind an injectable `ModelRoutabilityPort` whose
//   default adapter is backed by the real `@quant/ai` `ModelRouter`'s registered
//   model catalog. Tests can inject a deterministic port (no live engine).
//
// SCOPE
//   Task 18.1 needs `listRoles()` (so `planOrg` can enumerate role defaults +
//   tool scopes) and `resolveModel()` (so each planned role gets a routable
//   default model). Per-worker spawning that consumes overrides lands in Task
//   19.x; the override-precedence + fail-closed logic is implemented here now so
//   spawning is a thin caller.

import { createAppError } from '@quant/server-core';
import { ModelRouter } from '@quant/ai';

// ---------------------------------------------------------------------------
// Role + model contracts
// ---------------------------------------------------------------------------

/** The seven agent role keys (mirrors the Prisma `AgentRoleKey` enum). */
export type AgentRoleKey =
  | 'planner'
  | 'coder'
  | 'reviewer'
  | 'tester'
  | 'debugger'
  | 'upgrader'
  | 'devops';

export const ALL_ROLE_KEYS: readonly AgentRoleKey[] = [
  'planner',
  'coder',
  'reviewer',
  'tester',
  'debugger',
  'upgrader',
  'devops',
];

/** A routable model reference. `id` MUST be an id `@quant/ai` can route to. */
export interface ModelRef {
  id: string;
}

/**
 * An agent role definition (design §"STRUCTURE AgentRole"): a job description,
 * a default tool scope (the tool keys the role may use), a default model, and a
 * concurrency ceiling for how many workers of this role may run at once.
 */
export interface AgentRole {
  key: AgentRoleKey;
  description: string;
  /** Tool keys this role may use (`ToolDescriptor[]` in the design). */
  defaultToolScope: string[];
  defaultModel: ModelRef;
  maxConcurrentWorkers: number;
}

/**
 * CEO model overrides applied at resolve time. A per-worker override (keyed by
 * worker id) wins over a per-role override; both win over the role default.
 */
export interface CeoModelOverrides {
  /** Override the model for an entire role. */
  byRole?: Partial<Record<AgentRoleKey, string>>;
  /** Override the model for a specific worker id (highest precedence). */
  byWorker?: Record<string, string>;
}

/** Resolve-time context so a per-worker override can be matched. */
export interface ResolveModelContext {
  workerId?: string;
}

/**
 * Routability seam (Requirement 10.6). The default adapter is backed by the
 * `@quant/ai` `ModelRouter`'s registered model catalog; tests inject a
 * deterministic set.
 */
export interface ModelRoutabilityPort {
  isRoutable(modelId: string): boolean;
}

// ---------------------------------------------------------------------------
// Default role catalog
// ---------------------------------------------------------------------------

// Default models are chosen from the `@quant/ai` ModelRouter's registered
// catalog so they are routable out of the box (verified by resolveModel's
// fail-closed check). "strong reasoning"/"strong coding" map to gpt-4o /
// claude-sonnet-4; "mid" maps to gpt-4o-mini.
const STRONG_REASONING = 'gpt-4o';
const STRONG_CODING = 'claude-sonnet-4';
const MID = 'gpt-4o-mini';

const DEFAULT_ROLES: readonly AgentRole[] = [
  {
    key: 'planner',
    description:
      'Decompose the goal into work items, assign to coders, sequence handoffs.',
    defaultToolScope: ['bus_email', 'read_repo', 'answer_engine'],
    defaultModel: { id: STRONG_REASONING },
    maxConcurrentWorkers: 1,
  },
  {
    key: 'coder',
    description: 'Implement work items on isolated branches and open PRs.',
    defaultToolScope: ['read_file', 'edit_file', 'open_pr', 'run_ci', 'search_repo'],
    defaultModel: { id: STRONG_CODING },
    maxConcurrentWorkers: 8,
  },
  {
    key: 'reviewer',
    description:
      'Review PRs, request changes, approve (advisory; a human still gates merge).',
    defaultToolScope: ['review', 'read_diff', 'bus_email'],
    defaultModel: { id: STRONG_REASONING },
    maxConcurrentWorkers: 2,
  },
  {
    key: 'tester',
    description: 'Write/run tests and file defects as work items.',
    defaultToolScope: ['run_ci', 'issue', 'bus_email'],
    defaultModel: { id: MID },
    maxConcurrentWorkers: 2,
  },
  {
    key: 'debugger',
    description: 'Diagnose CI failures and defects, propose fixes.',
    defaultToolScope: ['read_logs', 'ai_ci_fix', 'bus_email'],
    defaultModel: { id: STRONG_REASONING },
    maxConcurrentWorkers: 2,
  },
  {
    key: 'upgrader',
    description: 'Dependency / version / modernization passes.',
    defaultToolScope: ['read_file', 'edit_file', 'open_pr', 'run_ci'],
    defaultModel: { id: MID },
    maxConcurrentWorkers: 1,
  },
  {
    key: 'devops',
    description: 'Pipelines, environments, release prep.',
    defaultToolScope: ['run_ci', 'branch_protection'],
    defaultModel: { id: MID },
    maxConcurrentWorkers: 1,
  },
];

/**
 * Default routability adapter backed by `@quant/ai`'s `ModelRouter`. A model is
 * routable iff it is registered in the router's model catalog. Instantiating
 * the router is cheap (it just registers the static default model set) and
 * involves no network or provider call, so this stays offline-safe.
 */
export function createModelRouterRoutability(router?: ModelRouter): ModelRoutabilityPort {
  const r = router ?? new ModelRouter();
  const ids = new Set(r.getModels().map((m) => m.id));
  return {
    isRoutable(modelId: string): boolean {
      return ids.has(modelId);
    },
  };
}

// ---------------------------------------------------------------------------
// RoleCatalog
// ---------------------------------------------------------------------------

export interface RoleCatalogOptions {
  /** Override the role set (defaults to the seven built-in roles). */
  roles?: readonly AgentRole[];
  /** Routability policy (defaults to the `@quant/ai` ModelRouter catalog). */
  routability?: ModelRoutabilityPort;
}

/**
 * The catalog of agent roles + the model-resolution policy.
 *
 * `resolveModel` precedence (design §"INTERFACE RoleCatalog"):
 *   per-worker override → per-role override → role default,
 * then a routability check that FAILS CLOSED (Requirement 10.6).
 */
export class RoleCatalog {
  private readonly roles: Map<AgentRoleKey, AgentRole>;
  private readonly routability: ModelRoutabilityPort;

  constructor(options: RoleCatalogOptions = {}) {
    const roleList = options.roles ?? DEFAULT_ROLES;
    this.roles = new Map(roleList.map((r) => [r.key, r]));
    this.routability = options.routability ?? createModelRouterRoutability();
  }

  /** List all role definitions (design §"FUNCTION listRoles"). */
  listRoles(): AgentRole[] {
    return Array.from(this.roles.values());
  }

  /** Look up a single role definition, or throw 400 for an unknown key. */
  getRole(roleKey: AgentRoleKey): AgentRole {
    const role = this.roles.get(roleKey);
    if (!role) {
      throw createAppError(`Unknown agent role '${roleKey}'`, 400, 'UNKNOWN_ROLE');
    }
    return role;
  }

  /**
   * Resolve the model for a role within an org (design §"FUNCTION
   * resolveModel"). The `orgId` is part of the contract surface (so a future
   * per-org policy can hook in) and is recorded on the fail-closed error.
   *
   * @throws 400 UNKNOWN_ROLE          when `roleKey` is not a known role.
   * @throws 422 MODEL_NOT_ROUTABLE    when the resolved model is one `@quant/ai`
   *                                   cannot route to (FAIL CLOSED, Req 10.6).
   */
  resolveModel(
    orgId: string,
    roleKey: AgentRoleKey,
    ceoOverrides: CeoModelOverrides = {},
    context: ResolveModelContext = {},
  ): ModelRef {
    const role = this.getRole(roleKey);

    // Precedence: per-worker override → per-role override → role default.
    const workerOverride =
      context.workerId != null ? ceoOverrides.byWorker?.[context.workerId] : undefined;
    const roleOverride = ceoOverrides.byRole?.[roleKey];
    const chosenId = workerOverride ?? roleOverride ?? role.defaultModel.id;

    // FAIL CLOSED: never assign a model the engine cannot route to.
    if (!this.routability.isRoutable(chosenId)) {
      throw createAppError(
        `Model '${chosenId}' is not routable by the AI engine for role '${roleKey}' (org ${orgId})`,
        422,
        'MODEL_NOT_ROUTABLE',
      );
    }

    return { id: chosenId };
  }
}
