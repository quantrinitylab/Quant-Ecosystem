/**
 * Engine Integration Wiring — data model and pure invariant predicates.
 *
 * These are *integration-time contracts* (seam metadata) that the DoD checks and
 * the task tracker operate on. They introduce **no** runtime or persistent schema
 * and nothing here is imported by `createApp()`; the module exists purely as the
 * checked-in model + helpers behind the wiring inventory and its property tests.
 *
 * Source of truth: `.kiro/specs/engine-integration-wiring/design.md`
 *   - "Data Models" (the `EngineWiring` / `SeamArtifacts` / `DoDResult` shapes)
 *   - "Correctness Properties" (P1, P3, P4 — encoded as the predicates below)
 *
 * The predicates are deliberately pure (no I/O) so the same functions back both
 * the runtime DoD evaluator and the fast-check property tests.
 */

/**
 * The lane an engine is wired through.
 *
 * - `cross-cutting` — wired **once** in `server-core` and inherited by every app
 *   via `createApp()`. Targets are always `['server-core']`.
 * - `per-app` — wired into one or more target apps' `buildApp()`. Targets list at
 *   least one app directory.
 * - `deferred` — not wired in this feature (a thin scaffold, a duplicate, or a
 *   blocked external). Carries a `reason`.
 *
 * Reconciliation note: `design.md`'s `WiringLane` union is `'cross-cutting' | 'per-app'`
 * and models `deferred` only as a *status*. Requirement 6.1, however, requires the
 * checked-in inventory to record the lane as exactly one of
 * `{cross-cutting, per-app, deferred}`. Because the inventory (task 2.1) is governed
 * by Requirement 6.1, `deferred` is promoted to a first-class lane here, while also
 * remaining available as a {@link WiringStatus} for the wiring state machine.
 */
export type WiringLane = 'cross-cutting' | 'per-app' | 'deferred';

/** The lifecycle state of a single engine wiring (design.md "Data Models"). */
export type WiringStatus = 'deferred' | 'pending' | 'decorated' | 'routed' | 'proxied' | 'done';

/** Sequencing-stage bounds from the design's "Sequencing Strategy" (Stage 0..6). */
export const SEAM_STAGE_MIN = 0;
export const SEAM_STAGE_MAX = 6;

/** The sentinel target for every cross-cutting wiring. */
export const CROSS_CUTTING_TARGET = 'server-core';

/**
 * The five thin scaffolds the design explicitly defers (Requirement 6.4).
 * Listed as package specifiers so they can be compared against `EngineWiring.engine`.
 */
export const DEFERRED_SCAFFOLDS: readonly string[] = [
  '@quant/service-discovery',
  '@quant/co-presence',
  '@quant/universal-capture',
  '@quant/voice-input',
  '@quant/quant-flow',
];

/**
 * One row of the engine wiring inventory (design.md "Data Models").
 * Mirrors the design's `EngineWiring` shape; `reason` is an optional extension
 * used to record why an engine is `deferred` (Requirements 6.6 / 6.7) or to carry
 * a reconciliation note.
 */
export interface EngineWiring {
  /** Package specifier, e.g. `"@quant/notifications"`. */
  engine: string;
  lane: WiringLane;
  /** App dirs, or `['server-core']` for cross-cutting, or `[]` for deferred. */
  targets: string[];
  /** Sequencing stage `0..6`. */
  stage: number;
  /** Other engines/plugins that must be wired first (specifiers or plugin names). */
  dependsOn: string[];
  status: WiringStatus;
  /** Why the engine is deferred, or a reconciliation note. */
  reason?: string;
}

/** The files a complete wiring produces/edits (design.md "Data Models"). */
export interface SeamArtifacts {
  /** server-core plugin path OR the app `buildApp()` edit. */
  pluginOrDecorator: string;
  /** `apps/<app>/backend/routes/<feature>.ts`. */
  routeModule: string;
  /** `apps/<app>/src/app/api/<feature>/route.ts`. */
  proxyRoute: string;
  /** `@quant/api-client` hook path. */
  clientHook: string;
  /** Integration/seam test path. */
  seamTest: string;
}

/** Computed DoD evidence per engine (design.md "Definition of Done"). */
export interface DoDResult {
  /** DoD-1: a non-test importer exists and the engine is in `dependencies`. */
  importerExists: boolean;
  /** DoD-2: route responds 2xx with a valid JWT. */
  routeReachableAuthed: boolean;
  /** DoD-2: route responds 401 without a valid JWT. */
  routeRejectsUnauthed: boolean;
  /** DoD-3: a Next proxy + `api-client` surface consumes the route. */
  frontendConsumes: boolean;
  /** DoD-4: a test traverses proxy/route -> engine. */
  seamTested: boolean;
}

// ---------------------------------------------------------------------------
// Pure invariant predicates (back both the evaluator and the property tests).
// ---------------------------------------------------------------------------

/**
 * An engine is `done` only when all four DoD invariants hold (design.md:
 * "`status: 'done'` requires every `DoDResult` field `true`"). In particular this
 * guarantees `done ⟹ importerExists` (Property P1).
 */
export function isDone(d: DoDResult): boolean {
  return (
    d.importerExists &&
    d.routeReachableAuthed &&
    d.routeRejectsUnauthed &&
    d.frontendConsumes &&
    d.seamTested
  );
}

/** A wiring's `status` is consistent with its evidence: `done` requires `isDone`. */
export function statusConsistentWithDoD(w: EngineWiring, d: DoDResult): boolean {
  return w.status !== 'done' || isDone(d);
}

/** Requirement 6.2: lane/target consistency. */
export function targetsValidForLane(w: EngineWiring): boolean {
  switch (w.lane) {
    case 'cross-cutting':
      return w.targets.length === 1 && w.targets[0] === CROSS_CUTTING_TARGET;
    case 'per-app':
      return w.targets.length >= 1 && w.targets.every((t) => t !== CROSS_CUTTING_TARGET);
    case 'deferred':
      return true;
  }
}

/** A deferred wiring must carry status `deferred` and a recorded reason (Req 6.6/6.7). */
export function deferredIsConsistent(w: EngineWiring): boolean {
  if (w.lane !== 'deferred') return true;
  return w.status === 'deferred' && typeof w.reason === 'string' && w.reason.length > 0;
}

/** Stage is an integer within `[SEAM_STAGE_MIN, SEAM_STAGE_MAX]`. */
export function stageInRange(w: EngineWiring): boolean {
  return Number.isInteger(w.stage) && w.stage >= SEAM_STAGE_MIN && w.stage <= SEAM_STAGE_MAX;
}

/**
 * Property P3 — every cross-cutting engine has exactly one registration site.
 * At the inventory level this means each cross-cutting engine name appears once,
 * with valid `['server-core']` targets, and is not also wired per-app.
 */
export function crossCuttingRegisteredOnce(inventory: readonly EngineWiring[]): boolean {
  const counts = new Map<string, number>();
  for (const w of inventory) {
    if (w.lane === 'cross-cutting') {
      if (!targetsValidForLane(w)) return false;
      counts.set(w.engine, (counts.get(w.engine) ?? 0) + 1);
    }
  }
  for (const [engine, count] of counts) {
    if (count !== 1) return false;
    // The same engine must not be re-registered through the per-app lane.
    if (inventory.some((w) => w.engine === engine && w.lane === 'per-app')) return false;
  }
  return true;
}

/** Number of cross-cutting registration sites recorded for an engine. */
export function registrationSiteCount(inventory: readonly EngineWiring[], engine: string): number {
  return inventory.filter((w) => w.engine === engine && w.lane === 'cross-cutting').length;
}

/**
 * Every in-inventory dependency sits at a stage `<=` its dependent's stage.
 * Dependencies that are not themselves inventory rows (server-core plugins such as
 * `prisma`/`auth`, or substrate packages) are ignored — they are guaranteed to be
 * registered earlier by `createApp()`.
 */
export function dependencyStagesMonotonic(inventory: readonly EngineWiring[]): boolean {
  const byName = new Map(inventory.map((w) => [w.engine, w]));
  return inventory.every((w) =>
    w.dependsOn.every((d) => {
      const dep = byName.get(d);
      return dep === undefined || dep.stage <= w.stage;
    }),
  );
}

/**
 * Compute a registration order in which every in-inventory dependency precedes its
 * dependent (a stage-biased topological sort). Throws if the `dependsOn` graph
 * (restricted to inventory rows) contains a cycle.
 */
export function computeRegistrationOrder(inventory: readonly EngineWiring[]): EngineWiring[] {
  const byName = new Map(inventory.map((w) => [w.engine, w]));
  const visited = new Set<string>();
  const inProgress = new Set<string>();
  const order: EngineWiring[] = [];

  const visit = (w: EngineWiring): void => {
    if (visited.has(w.engine)) return;
    if (inProgress.has(w.engine)) {
      throw new Error(`Dependency cycle detected at ${w.engine}`);
    }
    inProgress.add(w.engine);
    const deps = w.dependsOn
      .map((d) => byName.get(d))
      .filter((d): d is EngineWiring => d !== undefined)
      .sort((a, b) => a.stage - b.stage);
    for (const dep of deps) visit(dep);
    inProgress.delete(w.engine);
    visited.add(w.engine);
    order.push(w);
  };

  for (const w of [...inventory].sort((a, b) => a.stage - b.stage)) visit(w);
  return order;
}

/** True when the `dependsOn` graph (restricted to inventory rows) is acyclic. */
export function isAcyclic(inventory: readonly EngineWiring[]): boolean {
  try {
    computeRegistrationOrder(inventory);
    return true;
  } catch {
    return false;
  }
}

/**
 * Property P4 — dependency ordering. Valid when the graph is acyclic *and* every
 * in-inventory dependency is at a stage `<=` its dependent, guaranteeing that a
 * registration order exists in which no engine is registered before a dependency.
 */
export function dependencyOrderValid(inventory: readonly EngineWiring[]): boolean {
  return isAcyclic(inventory) && dependencyStagesMonotonic(inventory);
}

/**
 * Validate a whole inventory against every structural invariant. Returns a list of
 * human-readable violations (empty array == valid). Used by the checked-in
 * inventory's unit test and usable as a pre-commit gate.
 */
export function validateInventory(inventory: readonly EngineWiring[]): string[] {
  const violations: string[] = [];

  // Unique engine specifiers.
  const seen = new Set<string>();
  for (const w of inventory) {
    if (seen.has(w.engine)) violations.push(`duplicate engine entry: ${w.engine}`);
    seen.add(w.engine);
  }

  for (const w of inventory) {
    if (!stageInRange(w)) {
      violations.push(
        `${w.engine}: stage ${w.stage} out of range [${SEAM_STAGE_MIN}, ${SEAM_STAGE_MAX}]`,
      );
    }
    if (!targetsValidForLane(w)) {
      violations.push(
        `${w.engine}: targets ${JSON.stringify(w.targets)} invalid for lane '${w.lane}'`,
      );
    }
    if (!deferredIsConsistent(w)) {
      violations.push(`${w.engine}: deferred lane requires status 'deferred' and a reason`);
    }
  }

  if (!crossCuttingRegisteredOnce(inventory)) {
    violations.push('cross-cutting engines must each have exactly one registration site (P3)');
  }
  if (!dependencyOrderValid(inventory)) {
    violations.push('dependency ordering invalid: cycle or dependency in a later stage (P4)');
  }

  // Requirement 6.5: a non-deferred engine must not depend on a deferred engine.
  const deferred = new Set(inventory.filter((w) => w.lane === 'deferred').map((w) => w.engine));
  for (const w of inventory) {
    if (w.lane === 'deferred') continue;
    for (const d of w.dependsOn) {
      if (deferred.has(d)) {
        violations.push(
          `${w.engine}: non-deferred engine depends on deferred scaffold ${d} (Req 6.5)`,
        );
      }
    }
  }

  return violations;
}
