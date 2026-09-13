/**
 * Engine wiring inventory (Requirement 6; design.md "Engine Categorization").
 *
 * This is the checked-in reconciliation of the monorepo's orphaned `@quant/*`
 * engine packages against their intended wiring. Each row records the
 * `lane`, `targets`, `stage`, `dependsOn` and `status` the spec requires.
 *
 * Scope / method:
 *   - Foundation substrate (`@quant/common`, `@quant/database`, `@quant/auth`,
 *     `@quant/ai`, `@quant/server`, `@quant/server-core`, `@quant/shared-ui`,
 *     `@quant/storage`, `@quant/queue`, `@quant/realtime`, `@quant/data-plane`,
 *     `@quant/edge-config`, `@quant/health-server`, `@quant/brand`,
 *     `@quant/testing`, `@quant/spatial-ui`), data infra
 *     (`@quant/data-pipeline`, `@quant/data-warehouse`) and ops/test tooling
 *     (`@quant/chaos-testing`, `@quant/launch-beta`, `@quant/launch-public`) are
 *     NOT orphaned product engines and are intentionally excluded.
 *
 *     Note: `@quant/shared-ui`, while excluded as an *engine* row above, IS a
 *     recognized cross-cutting *consumer/importer* for DoD-1. Task 8 wired the
 *     six cross-cutting frontend surfaces (onboarding, command-palette,
 *     contextual-sidekick, universal-timeline, wellbeing, bharat-ai) into
 *     `shared-ui`'s `EcosystemShell`, which every app consumes. The DoD-1
 *     evaluator therefore scans `packages/shared-ui` for importers alongside
 *     `apps/**` and `packages/server-core/**` (see `DOD1_SCAN_ROOTS`).
 *   - The directories `ab-testing`, `cache`, `cdn`, `events`, `ml`, `payment`,
 *     `recommendation` and `scaling` have no `package.json` (no importable
 *     specifier) and are likewise excluded; `payment`/`recommendation` are
 *     empty duplicates of `@quant/payments` / `@quant/recommendations`.
 *   - Cross-cutting rows and per-app rows for engines named in the design's
 *     integration audit are authoritative. Remaining engines are classified by
 *     best-effort reconciliation; `lane`/`stage`/`dependsOn` may be refined as
 *     import-graph evidence accrues (the design anticipates this).
 *
 * `status` is `pending` for not-yet-wired engines and `deferred` for the thin
 * scaffolds / blocked externals. Later wiring tasks advance the status toward
 * `done` once the DoD evidence holds.
 */
import type { EngineWiring } from './types';

export const ENGINE_INVENTORY: EngineWiring[] = [
  // -------------------------------------------------------------------------
  // Stage 0 — frontend consumption substrate
  // -------------------------------------------------------------------------
  {
    engine: '@quant/api-client',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 0,
    dependsOn: [],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 0/1 cross-cutting). DoD-1 [DONE] via wiring:dod — ' +
      '103 non-test importers across apps/** + packages/shared-ui (frontend consumption ' +
      'substrate, Layer 5) and declared as a dependency. Wired first; every app/UI inherits it.',
  },

  // -------------------------------------------------------------------------
  // Stage 1 — cross-cutting engines (wired once in server-core)
  // -------------------------------------------------------------------------
  {
    engine: '@quant/identity-permissions',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['auth'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 1 gate, Task 5/9). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/server-core (2 importers) + declared dependency; RBAC decorator ' +
      'registered once in createApp() backing requireAuth({ scopes }) scope evaluation.',
  },
  {
    engine: '@quant/teams',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['@quant/identity-permissions'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 1 gate, Task 5/9). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/server-core + declared dependency; multi-actor authz context ' +
      'decorated in createApp() after identity-permissions (dependsOn satisfied).',
  },
  {
    engine: '@quant/observability',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 1 gate, Task 4.1/9). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/server-core + declared dependency; pre-existing plugin now ' +
      'registered in createApp() (OTel import-gated behind OTEL_EXPORTER_OTLP_ENDPOINT).',
  },
  {
    engine: '@quant/feature-flags',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: [],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 1 gate, Task 4.1/9). DoD-1 [DONE] via wiring:dod — ' +
      'imported by apps/admin + packages/server-core (3 importers) + declared dependency; ' +
      'pre-existing plugin now registered in createApp().',
  },
  {
    engine: '@quant/audit',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 1 gate, Task 4.1/9). DoD-1 [DONE] via wiring:dod — ' +
      'imported by apps/admin + packages/server-core + declared dependency; pre-existing ' +
      'plugin now registered in createApp() after prisma (dependsOn satisfied).',
  },
  {
    engine: '@quant/organizations',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 1 gate, Task 4.1/9). DoD-1 [DONE] via wiring:dod — ' +
      'imported by apps/admin + packages/server-core + declared dependency; pre-existing ' +
      'plugin now registered in createApp() after prisma (dependsOn satisfied).',
  },
  {
    engine: '@quant/performance',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: [],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 1 gate, Task 7.1/9). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/server-core + declared dependency; request timing/budget hook ' +
      'modeled on observability.ts, registered once in createApp().',
  },
  {
    engine: '@quant/error-monitoring',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['error-handler'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 1 gate, Task 7.2/9). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/server-core + declared dependency; hooks the error-handler ' +
      'plugin to capture/forward errors correlated via x-request-id, registered in createApp().',
  },
  {
    engine: '@quant/notifications',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Stage 1 gate, Task 6/9). DoD-1 [DONE] via wiring:dod — ' +
      'imported by apps/admin, apps/quantchat, apps/quantmail + packages/server-core ' +
      '(4 importers) + declared dependency; plugins/notifications.ts decorates ' +
      'fastify.notifications in createApp() after prisma (dependsOn satisfied).',
  },
  {
    engine: '@quant/onboarding',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['@quant/api-client'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Task 8 shared-ui surface). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/shared-ui (EcosystemShell layout wrapper every app consumes) + ' +
      'declared dependency; consumed via @quant/api-client (dependsOn satisfied).',
  },
  {
    engine: '@quant/command-palette',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['@quant/api-client'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Task 8 shared-ui surface). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/shared-ui (EcosystemShell layout wrapper every app consumes) + ' +
      'declared dependency; consumed via @quant/api-client (dependsOn satisfied).',
  },
  {
    engine: '@quant/contextual-sidekick',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['@quant/api-client'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Task 8 shared-ui surface). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/shared-ui (EcosystemShell layout wrapper every app consumes) + ' +
      'declared dependency; consumed via @quant/api-client (dependsOn satisfied).',
  },
  {
    engine: '@quant/universal-timeline',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['@quant/api-client'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Task 8 shared-ui surface). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/shared-ui (EcosystemShell layout wrapper every app consumes) + ' +
      'declared dependency; consumed via @quant/api-client (dependsOn satisfied).',
  },
  {
    engine: '@quant/wellbeing',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: [],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Task 8 shared-ui surface). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/shared-ui (EcosystemShell layout wrapper every app consumes) + ' +
      'declared dependency.',
  },
  {
    engine: '@quant/bharat-ai',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: [],
    status: 'done',
    reason:
      'Task 15.1 reconciliation (Task 8 shared-ui surface). DoD-1 [DONE] via wiring:dod — ' +
      'imported by packages/shared-ui (EcosystemShell layout wrapper every app consumes) + ' +
      'declared dependency.',
  },
  {
    engine: '@quant/moderation',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'cross-cutting engine set; no importer (wiring:dod [----]) and no wiring task in this ' +
      'plan. Not yet registered in createApp(). Deferred for a follow-up wiring pass. Lane ' +
      'retained as its intended cross-cutting categorization.',
  },
  {
    engine: '@quant/governance',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'cross-cutting engine set; no importer (wiring:dod [----]) and no wiring task in this ' +
      'plan. Deferred for a follow-up wiring pass. Lane retained as its intended categorization.',
  },
  {
    engine: '@quant/security',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: [],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'cross-cutting engine set; no importer (wiring:dod [----]) and no wiring task in this ' +
      'plan. Deferred for a follow-up wiring pass. Lane retained as its intended categorization.',
  },
  {
    engine: '@quant/security-advanced',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['@quant/security'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'cross-cutting engine set; no importer (wiring:dod [----]) and no wiring task in this ' +
      'plan. dependsOn @quant/security (also deferred). Deferred for a follow-up wiring pass.',
  },
  {
    engine: '@quant/sync-engine',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      "Task 15.1 reconciliation. Beyond the design's authoritative engine set, but DoD-1 " +
      '[DONE] via wiring:dod — imported by apps/quant-mobile (src/offline/offline-sync.ts) + ' +
      'declared dependency. Marked done on real importer evidence per Req 5.1.',
  },
  {
    engine: '@quant/cross-app-workflows',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['@quant/api-client'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'cross-cutting engine set; no importer (wiring:dod [----]) and no wiring task in this ' +
      'plan. Deferred for a follow-up wiring pass. Lane retained as its intended categorization.',
  },
  {
    engine: '@quant/ai-memory',
    lane: 'cross-cutting',
    targets: ['server-core'],
    stage: 1,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      "Task 15.1 reconciliation. Beyond the design's authoritative cross-cutting set, but " +
      'DoD-1 [DONE] via wiring:dod — imported by apps/quantai (1 importer) + declared ' +
      'dependency (wired incidentally as the shared agent-memory substrate). Marked done on ' +
      'real importer evidence per Req 5.1.',
  },

  // -------------------------------------------------------------------------
  // Stage 2 — quantai (deepest agent stack)
  // -------------------------------------------------------------------------
  {
    engine: '@quant/agent-runtime',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      'Task 10.5 quantai DoD gate. DoD-1 — imported by apps/quantai (backend/app.ts, ' +
      'backend/routes/agent-runtime.ts) AND declared in apps/quantai dependencies ' +
      '(wiring:dod [DONE]). DoD-2/4 — agent-surfaces.seam.test.ts asserts auth/scope ' +
      'gating + proxy-forward on the agent surfaces. DoD-3 — Next proxies ' +
      '(src/app/api/agents/runtime/**) + api-client hook (src/features/agents/useAgentRuntime.ts).',
  },
  {
    engine: '@quant/agent-swarm',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['@quant/agent-runtime'],
    status: 'done',
    reason:
      'Task 10.5 quantai DoD gate. DoD-1 — imported by apps/quantai (backend/app.ts, ' +
      'backend/routes/agent-swarm.ts) AND declared in apps/quantai dependencies ' +
      '(wiring:dod [DONE]). DoD-2/4 — agent-surfaces.seam.test.ts asserts auth/scope ' +
      'gating + proxy-forward. DoD-3 — Next proxies (src/app/api/agents/swarm/**) + ' +
      'api-client hook (src/features/agents/useAgentSwarm.ts).',
  },
  {
    engine: '@quant/quant-tools',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['@quant/agent-runtime'],
    status: 'done',
    reason:
      'Task 10.5 quantai DoD gate: all four DoD invariants hold. DoD-1 — imported ' +
      'by apps/quantai (backend/app.ts, routes/quant-tools.ts) AND declared in ' +
      'apps/quantai dependencies (wiring:dod [DONE]). DoD-2/4 — agent-surfaces.seam.test.ts ' +
      'asserts /tools/orchestrator/execute 401 (unauth), 403 (missing agents:execute), ' +
      '201 (authed) + proxy-forward test. DoD-3 — Next proxies (src/app/api/tools/orchestrator/**) ' +
      '+ api-client hook (src/features/agents/useQuantTools.ts) exist.',
  },
  {
    engine: '@quant/browser-agent',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['@quant/agent-runtime'],
    status: 'done',
    reason:
      'Task 10.5 quantai DoD gate. DoD-1 — imported by apps/quantai (backend/app.ts, ' +
      'backend/routes/browser-agent.ts) AND declared in apps/quantai dependencies ' +
      '(wiring:dod [DONE]). DoD-2/4 — agent-surfaces.seam.test.ts asserts auth/scope ' +
      'gating + proxy-forward. DoD-3 — Next proxies (src/app/api/agents/browser/**) + ' +
      'api-client hook (src/features/agents/useBrowserAgent.ts).',
  },
  {
    engine: '@quant/code-agent',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['@quant/agent-runtime'],
    status: 'done',
    reason:
      'Task 10.5 quantai DoD gate. DoD-1 — imported by apps/quantai (backend/app.ts, ' +
      'backend/routes/code-agent.ts) AND declared in apps/quantai dependencies ' +
      '(wiring:dod [DONE]). DoD-2/4 — agent-surfaces.seam.test.ts asserts auth/scope ' +
      'gating + proxy-forward. DoD-3 — Next proxies (src/app/api/agents/code/**) + ' +
      'api-client hook (src/features/agents/useCodeAgent.ts).',
  },
  {
    engine: '@quant/user-owned-ai',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['@quant/agent-runtime'],
    status: 'done',
    reason:
      'Task 10.5 quantai DoD gate. DoD-1 — imported by apps/quantai (backend/app.ts, ' +
      'backend/routes/user-owned-ai.ts) AND declared in apps/quantai dependencies ' +
      '(wiring:dod [DONE]). DoD-2/4 — agent-surfaces.seam.test.ts asserts auth/scope ' +
      'gating + proxy-forward. DoD-3 — Next proxies (src/app/api/agents/owned/**) + ' +
      'api-client hook (src/features/agents/useUserOwnedAi.ts).',
  },
  {
    engine: '@quant/agentic',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['@quant/agent-runtime'],
    status: 'done',
    reason:
      "Task 15.1 reconciliation. Beyond the design's authoritative agent set, but DoD-1 " +
      '[DONE] via wiring:dod — 21 non-test importers across apps/quantneon, apps/quantsync, ' +
      'apps/quanttube + packages/shared-ui + declared dependency. Marked done on real ' +
      'importer evidence per Req 5.1.',
  },
  {
    engine: '@quant/information-agents',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['@quant/agent-runtime'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'agent set; not yet wired into a host app (no importer per wiring:dod [----]). Deferred ' +
      'for a follow-up wiring pass. Lane/targets retained as its intended quantai categorization.',
  },
  {
    engine: '@quant/ai-organization',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['@quant/agent-runtime'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'agent set; not yet wired into a host app (no importer per wiring:dod [----]). Deferred ' +
      'for a follow-up wiring pass. Lane/targets retained as its intended quantai categorization.',
  },
  {
    engine: '@quant/quant-orchestrator',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['@quant/agent-runtime'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'agent set; not yet wired into a host app (no importer per wiring:dod [----]). Deferred ' +
      'for a follow-up wiring pass. Lane/targets retained as its intended quantai categorization.',
  },
  {
    engine: '@quant/ai-daily-brief',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 2,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'agent set; not yet wired into a host app (no importer per wiring:dod [----]). Deferred ' +
      'for a follow-up wiring pass. Lane/targets retained as its intended quantai categorization.',
  },
  {
    engine: '@quant/quant-codex',
    lane: 'per-app',
    targets: ['quantai', 'quantdocs'],
    stage: 2,
    dependsOn: ['@quant/code-agent'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'agent set; not yet wired into a host app (no importer per wiring:dod [----]). dependsOn ' +
      '@quant/code-agent (done) but no host wiring yet. Deferred for a follow-up wiring pass.',
  },

  // -------------------------------------------------------------------------
  // Stage 3 — quantmeet (voice, E2EE, AR)
  // -------------------------------------------------------------------------
  {
    engine: '@quant/quant-live',
    lane: 'per-app',
    targets: ['quantmeet', 'quantai'],
    stage: 3,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      'Wave D/F consolidation: standalone apps/quantmeet was retired into apps/quantchat; ' +
      'quant-live engine deferred pending unified voice pipeline integration into QuantChat/QuantAI.',
  },
  {
    engine: '@quant/webrtc',
    lane: 'per-app',
    targets: ['quantmeet'],
    stage: 3,
    dependsOn: [],
    status: 'deferred',
    reason:
      'Wave D/F consolidation: standalone apps/quantmeet was retired into apps/quantchat ' +
      '(which uses LiveKit SFU natively). Deferred for follow-up wiring pass.',
  },
  {
    engine: '@quant/encryption',
    lane: 'per-app',
    targets: ['quantchat', 'quantmail', 'quantmeet'],
    stage: 3,
    dependsOn: [],
    status: 'done',
    reason:
      'Task 11.3 quantmeet DoD gate (E2EE; seam transports ciphertext only, key material ' +
      'stays client-side — Req 7.5). DoD-1 — imported by apps/quantmeet (backend/app.ts via ' +
      'lib/e2ee-relay.ts, backend/routes/encryption.ts) AND declared in apps/quantmeet ' +
      'dependencies (wiring:dod [DONE], 3 importers). DoD-2/4 — ' +
      'backend/__tests__/engine-surfaces.seam.test.ts traverses /e2ee via buildApp() inject(): ' +
      'POST /e2ee/keys 401/403/201, GET /e2ee/keys/:userId 200, POST /e2ee/messages relay 202, ' +
      'GET /e2ee/messages inbox 200, all unauth→401; PLUS a security test proving the ' +
      '.strict() schemas reject forbidden secret fields (privateKey/plaintext/rootKey) with ' +
      '400 VALIDATION_ERROR (ciphertext-only contract enforced at the boundary, Req 7.5). ' +
      'DoD-3 — Next proxies (src/app/api/e2ee/**) + api-client hook ' +
      '(src/features/encryption/useEncryption.ts), forward asserted in ' +
      'src/__tests__/engine-proxy.forward.test.ts. NOTE: encryption also targets ' +
      'quantchat/quantmail (Stage 6 Task 14.1); this row covers the engine and its quantmeet ' +
      'seam satisfies DoD now — the remaining app targets are tracked separately.',
  },
  {
    engine: '@quant/ar-lenses',
    lane: 'per-app',
    targets: ['quantneon', 'quantchat', 'quantmeet'],
    stage: 3,
    dependsOn: [],
    status: 'done',
    reason:
      'Task 12.3 quantneon DoD gate. DoD-1 (wiring:dod) — imported by apps/quantneon ' +
      '(backend/app.ts, backend/routes/ar-lenses.ts) AND declared in apps/quantneon ' +
      'dependencies ([DONE]). DoD-2/4 — backend/__tests__/engine-surfaces.seam.test.ts ' +
      'traverses POST /ar-lenses/lenses/generate via buildApp() inject(): 401 (unauth), 403 ' +
      '(missing ar-lenses:write), 201 (authed, PromptToLens reached), plus GET ' +
      '/ar-lenses/capabilities 401/200 (CrossAppDistributor reached). DoD-3 — Next proxies ' +
      '(src/app/api/ar-lenses/** via _lib/ar-lenses-proxy.ts) + api-client hook ' +
      '(src/features/ar-lenses/useArLenses.ts), forward asserted in ' +
      'src/__tests__/engine-proxy.forward.test.ts (method/body + Authorization + x-request-id ' +
      'minted-when-absent + status relayed). NOTE: ar-lenses also targets quantchat/quantmeet ' +
      '(SHARED DECORATOR, design Open Question 2) — this row covers the engine and its quantneon ' +
      'seam satisfies DoD now; the remaining app targets are tracked separately.',
  },

  // -------------------------------------------------------------------------
  // Stage 4 — quantneon (federation, feeds, media)
  // -------------------------------------------------------------------------
  {
    engine: '@quant/federation',
    lane: 'per-app',
    targets: ['quantneon', 'quantchat', 'quantmail'],
    stage: 4,
    dependsOn: ['@quant/identity-permissions'],
    status: 'done',
    reason:
      'Task 12.3 quantneon DoD gate (SENSITIVE engine — scoped routes, Req 7.4). DoD-1 ' +
      '(wiring:dod) — imported by apps/quantneon (backend/app.ts, backend/routes/federation.ts) ' +
      'AND declared in apps/quantneon dependencies ([DONE]). DoD-2/4 — ' +
      'backend/__tests__/engine-surfaces.seam.test.ts traverses POST /federation/instances/block ' +
      'via buildApp() inject(): 401 (unauth), 403 (missing federation:write), 201 (authed, ' +
      'FederationModeration reached), plus the read GET /federation/instances/:domain 401/403/200 ' +
      '(federation:read). DoD-3 — Next proxies (src/app/api/federation/** via ' +
      '_lib/federation-proxy.ts) + api-client hook (src/features/federation/useFederation.ts), ' +
      'forward asserted in src/__tests__/engine-proxy.forward.test.ts. NOTE: federation also ' +
      'targets quantchat/quantmail (Stage 6 Task 14.1) — tracked separately.',
  },
  {
    engine: '@quant/social-graph',
    lane: 'per-app',
    targets: ['quantneon', 'quantchat'],
    stage: 4,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). Deferred ' +
      'for a follow-up wiring pass. Lane/targets retained as its intended categorization.',
  },
  {
    engine: '@quant/search',
    lane: 'per-app',
    targets: ['quantmail', 'quantneon', 'quantube'],
    stage: 4,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      'Wave F consolidation: apps/admin was retired. Standalone search engine deferred ' +
      'pending wiring into keeper apps (quantmail/quantneon/quantube).',
  },
  {
    engine: '@quant/recommendations',
    lane: 'per-app',
    targets: ['quantube', 'quantneon', 'quantmax'],
    stage: 4,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      'Task 12.3 quantneon DoD gate (feed stack, composed in backend/lib/feed-engines.ts; ' +
      'recommendations -> ranking). DoD-1 (wiring:dod) — imported by apps/quantneon ' +
      '(backend/lib/feed-engines.ts; routes/feed.ts) AND declared in apps/quantneon dependencies ' +
      '([DONE]). DoD-2/4 — backend/__tests__/engine-surfaces.seam.test.ts drives GET /feed ' +
      '(composed recommendations -> ranking, authed 200 with retrievalCount > 0) and GET ' +
      '/feed/recommendations (RecommendationPipeline reached), all unauth -> 401. DoD-3 — Next ' +
      'proxies (src/app/api/feed/** via _lib/feed-proxy.ts) + api-client hook ' +
      '(src/features/feed/useFeed.ts), forward asserted in ' +
      'src/__tests__/engine-proxy.forward.test.ts. NOTE: also targets quantube/quantmax — ' +
      'tracked separately.',
  },
  {
    engine: '@quant/ranking',
    lane: 'per-app',
    targets: ['quantube', 'quantneon', 'quantmax'],
    stage: 4,
    dependsOn: ['@quant/recommendations'],
    status: 'done',
    reason:
      'Task 12.3 quantneon DoD gate (feed stack; ranking consumes the recommendations retrieval ' +
      'order). DoD-1 (wiring:dod) — imported by apps/quantneon (backend/lib/feed-engines.ts, ' +
      'backend/routes/feed.ts) AND declared in apps/quantneon dependencies ([DONE]). DoD-2/4 — ' +
      'backend/__tests__/engine-surfaces.seam.test.ts: GET /feed returns the ranking ' +
      'algorithmUsed + paginated items (engine reached), PUT /feed/algorithm + POST ' +
      '/feed/candidates gated by feed:write (401/403/2xx). DoD-3 — Next proxies ' +
      '(src/app/api/feed/**) + api-client hook (src/features/feed/useFeed.ts), forward asserted ' +
      'in src/__tests__/engine-proxy.forward.test.ts. NOTE: also targets quantube/quantmax — ' +
      'tracked separately.',
  },
  {
    engine: '@quant/ml-pipeline',
    lane: 'per-app',
    targets: ['quantube', 'quantneon'],
    stage: 4,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      'Task 12.3 quantneon DoD gate (feed stack; model registry + InferenceEngine, wired AS-IS ' +
      'per Req 9.1). DoD-1 (wiring:dod) — imported by apps/quantneon (backend/lib/feed-engines.ts, ' +
      'backend/routes/feed.ts) AND declared in apps/quantneon dependencies ([DONE]). DoD-2/4 — ' +
      'backend/__tests__/engine-surfaces.seam.test.ts: POST /feed/score reaches the InferenceEngine ' +
      'forward pass (feed:write 401/403/200, result returned), GET /feed/models read surface. ' +
      'DoD-3 — Next proxies (src/app/api/feed/score, /feed/models) + api-client hook ' +
      '(src/features/feed/useFeed.ts), forward asserted in ' +
      'src/__tests__/engine-proxy.forward.test.ts. NOTE: also targets quantube — tracked separately.',
  },
  {
    engine: '@quant/ml-runtime',
    lane: 'per-app',
    targets: ['quantube', 'quantneon'],
    stage: 4,
    dependsOn: ['@quant/ml-pipeline'],
    status: 'done',
    reason:
      'Task 12.3 quantneon DoD gate (feed stack; ModelLoader fed INTO ml-pipeline ' +
      'InferenceEngine.setModelLoader — the genuine dependsOn edge). DoD-1 (wiring:dod) — ' +
      'imported by apps/quantneon (backend/lib/feed-engines.ts, backend/routes/feed.ts) AND ' +
      'declared in apps/quantneon dependencies ([DONE]). DoD-2/4 — ' +
      'backend/__tests__/engine-surfaces.seam.test.ts: GET /feed/runtime/cache (ModelLoader cache ' +
      'stats reached, authed 200) + GET /feed/runtime/models, all unauth -> 401. DoD-3 — Next ' +
      'proxies (src/app/api/feed/runtime/**) + api-client hook (src/features/feed/useFeed.ts), ' +
      'forward asserted in src/__tests__/engine-proxy.forward.test.ts. NOTE: also targets ' +
      'quantube — tracked separately.',
  },
  {
    engine: '@quant/triton-client',
    lane: 'per-app',
    targets: ['quantube', 'quantneon'],
    stage: 4,
    dependsOn: ['@quant/ml-runtime'],
    status: 'done',
    reason:
      'Task 12.3 quantneon DoD gate (feed stack; Triton model registry + fetch-based transport, ' +
      'wired AS-IS per Req 9.1). DoD-1 (wiring:dod) — imported by apps/quantneon ' +
      '(backend/lib/feed-engines.ts, backend/routes/feed.ts) AND declared in apps/quantneon ' +
      'dependencies ([DONE]). DoD-2/4 — backend/__tests__/engine-surfaces.seam.test.ts: GET ' +
      '/feed/triton/models (registry reached, authed 200) + POST /feed/triton/models gated by ' +
      'feed:write, all unauth -> 401. DoD-3 — Next proxies (src/app/api/feed/triton/models) + ' +
      'api-client hook (src/features/feed/useFeed.ts), forward asserted in ' +
      'src/__tests__/engine-proxy.forward.test.ts. NOTE: also targets quantube — tracked separately.',
  },
  {
    engine: '@quant/media',
    lane: 'per-app',
    targets: ['quantube', 'quantedits', 'quantneon'],
    stage: 4,
    dependsOn: [],
    status: 'done',
    reason:
      'Task 13.3 quantube DoD gate. DoD-1 (wiring:dod) — imported by apps/quantube ' +
      '(backend/app.ts, backend/routes/media.ts) AND declared in apps/quantube dependencies ' +
      '([DONE]). DoD-2/4 — backend/__tests__/engine-surfaces.seam.test.ts traverses POST ' +
      '/media/library via buildApp() inject(): 401 (unauth), 403 (missing media:write), 201 ' +
      '(SharedMediaPicker reached), plus the read GET /media/library 401/200. DoD-3 — Next ' +
      'proxies (src/app/api/media/** via _lib/engine-proxy.ts) + api-client hook ' +
      '(src/features/media/useMedia.ts), forward asserted in ' +
      'src/__tests__/engine-proxy.forward.test.ts (method/body + Authorization + x-request-id ' +
      'minted-when-absent + status relayed). NOTE: media also targets quantedits/quantneon — ' +
      'its quantube seam satisfies DoD now; the remaining app targets are tracked separately.',
  },

  // -------------------------------------------------------------------------
  // Stage 5 — quantube and creator surfaces
  // -------------------------------------------------------------------------
  {
    engine: '@quant/generative-media',
    lane: 'per-app',
    targets: ['quantube', 'quantedits', 'quantneon'],
    stage: 5,
    dependsOn: ['@quant/media'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). dependsOn ' +
      '@quant/media (done) but no host wiring yet. Deferred for a follow-up wiring pass.',
  },
  {
    engine: '@quant/photos',
    lane: 'per-app',
    targets: ['quantneon', 'quant-mobile'],
    stage: 5,
    dependsOn: ['@quant/media'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). dependsOn ' +
      '@quant/media (done) but no host wiring yet. Deferred for a follow-up wiring pass.',
  },
  {
    engine: '@quant/cross-publish',
    lane: 'per-app',
    targets: ['quantube', 'quantedits', 'quantneon'],
    stage: 5,
    dependsOn: ['@quant/media'],
    status: 'done',
    reason:
      'Task 13.3 quantube DoD gate. DoD-1 (wiring:dod) — imported by apps/quantube ' +
      '(backend/app.ts, backend/routes/cross-publish.ts) AND declared in apps/quantube ' +
      'dependencies ([DONE]). DoD-2/4 — backend/__tests__/engine-surfaces.seam.test.ts ' +
      'traverses POST /cross-publish/intents via buildApp() inject(): 401 (unauth), 403 ' +
      '(missing cross-publish:write), 201 (PublishIntent reached), plus the read GET ' +
      '/cross-publish/intents 401/200. DoD-3 — Next proxies (src/app/api/cross-publish/** via ' +
      '_lib/engine-proxy.ts) + api-client hook (src/features/cross-publish/useCrossPublish.ts), ' +
      'forward asserted in src/__tests__/engine-proxy.forward.test.ts. dependsOn @quant/media ' +
      '(decorated BEFORE cross-publish in buildApp(); done). NOTE: also targets ' +
      'quantedits/quantneon — tracked separately.',
  },
  {
    engine: '@quant/quant-studio',
    lane: 'per-app',
    targets: ['quantedits'],
    stage: 5,
    dependsOn: ['@quant/media'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). dependsOn ' +
      '@quant/media (done) but no host wiring yet. Deferred for a follow-up wiring pass.',
  },
  {
    engine: '@quant/payments',
    lane: 'per-app',
    targets: ['quant-commerce', 'quantube', 'quantmax'],
    stage: 5,
    dependsOn: ['@quant/identity-permissions'],
    status: 'done',
    reason:
      'Task 13.3 quantube DoD gate (SENSITIVE — scoped routes + Stripe webhook signature ' +
      'verification; Stripe keys from secrets, never hardcoded; Req 7.4/7.6). DoD-1 (wiring:dod) ' +
      '— imported by apps/quantube (backend/app.ts, backend/routes/payments.ts) AND declared in ' +
      'apps/quantube dependencies ([DONE]). DoD-2/4 — backend/__tests__/engine-surfaces.seam.test.ts: ' +
      'POST /payments/intents 401 (unauth) / 403 (missing payments:write) / past-auth into the ' +
      'StripeGateway (502 PAYMENT_GATEWAY_ERROR in test mode, NOT 401/403 — engine reached), GET ' +
      '/payments/config (payments:read 401/403/200), and the Stripe webhook POST /payments/webhook ' +
      'with a node:crypto-generated VALID signature -> 200 accepted while BAD/MISSING signature -> ' +
      '400 (verified against the raw body using STRIPE_WEBHOOK_SECRET from env; Stripe TEST MODE ' +
      'per design Open Question 3 — no live key needed). DoD-3 — Next proxies ' +
      '(src/app/api/payments/** via _lib/engine-proxy.ts) + api-client hook ' +
      '(src/features/payments/usePayments.ts), forward asserted in ' +
      'src/__tests__/engine-proxy.forward.test.ts. Task 14.4 ALSO wires payments into quantmax ' +
      '(apps/quantmax/backend/{app.ts,routes/payments.ts} reuse the quantube seam EXACTLY — ' +
      'env-sourced Stripe secrets, scoped routes, signature-verifying raw-body webhook; Next ' +
      'proxies src/app/api/payments/** + hook src/features/payments/usePayments.ts) as the money ' +
      'rail for quant-commerce + quant-economy; DoD-1 now holds for BOTH quantube and quantmax. ' +
      'DoD-2/4 quantmax seam tests are Task 14.5. NOTE: also targets quant-commerce — tracked ' +
      'separately.',
  },
  {
    engine: '@quant/creator-economy',
    lane: 'per-app',
    targets: ['quantube', 'quantneon'],
    stage: 5,
    dependsOn: ['@quant/payments'],
    status: 'done',
    reason:
      'Task 13.3 quantube DoD gate. DoD-1 (wiring:dod) — imported by apps/quantube ' +
      '(backend/routes/creator.ts non-payment surfaces + backend/routes/payouts.ts money rails) ' +
      'AND declared in apps/quantube dependencies ([DONE], 2 importers). DoD-2/4 — ' +
      'backend/__tests__/engine-surfaces.seam.test.ts: GET /creator/dashboard 401/200 ' +
      '(CreatorDashboard reached), POST /creator/credits/earn (creator:write 401/403/201, ' +
      'QuantCredits ledger reached), and the PayoutService money rails POST /payouts/request ' +
      '(payments:write 401/403/201, pending payout issued). DoD-3 — Next proxies ' +
      '(src/app/api/creator/**, src/app/api/payouts/** via _lib/engine-proxy.ts) + api-client ' +
      'hook (src/features/creator/useCreator.ts), forward asserted in ' +
      'src/__tests__/engine-proxy.forward.test.ts. dependsOn @quant/payments (done; payout rails ' +
      'decorated AFTER payments in buildApp()). NOTE: also targets quantneon — tracked separately.',
  },
  {
    engine: '@quant/quant-commerce',
    lane: 'per-app',
    targets: ['quantmax'],
    stage: 5,
    dependsOn: ['@quant/payments'],
    status: 'done',
    reason:
      'Task 14.5 quantmax DoD gate — all four DoD invariants now hold. ' +
      'DoD-1 (wiring:dod [DONE]) — imported by apps/quantmax (backend/app.ts, ' +
      'backend/routes/commerce.ts) AND declared in apps/quantmax dependencies; ' +
      'FlightSearchEngine/TrainSearchEngine/MerchantAggregator/OrderTracker/PriceAlertManager/' +
      'VisualSearchEngine decorated AFTER fastify.payments per dependsOn. DoD-2 — ' +
      'apps/quantmax/backend/__tests__/engine-surfaces.seam.test.ts traverses POST ' +
      '/commerce/orders via buildApp() inject(): 401 (unauth), 403 (missing commerce:write), 201 ' +
      '(authed, OrderTracker reached) + the read GET /commerce/orders 401/200 (no PUBLIC_PATHS ' +
      'bypass). DoD-3 — Next proxies (src/app/api/commerce/** via _lib/engine-proxy.ts) + ' +
      'api-client hook (src/features/commerce/useCommerce.ts), forward asserted in ' +
      'src/__tests__/engine-proxy.forward.test.ts (POST /api/commerce/orders relays method/body + ' +
      'Authorization + x-request-id minted-when-absent + status). DoD-4 — the seam test traverses ' +
      'proxy→route→engine, not the engine in isolation. dependsOn @quant/payments (done; decorated ' +
      'before commerce in buildApp()).',
  },
  {
    engine: '@quant/quant-economy',
    lane: 'per-app',
    targets: ['quantmax'],
    stage: 5,
    dependsOn: ['@quant/payments'],
    status: 'done',
    reason:
      'Task 14.5 quantmax DoD gate — all four DoD invariants now hold. ' +
      'DoD-1 (wiring:dod [DONE]) — imported by apps/quantmax (backend/app.ts, ' +
      'backend/routes/economy.ts) AND declared in apps/quantmax dependencies; ' +
      'CoinWallet/VirtualGoodsCatalog/CrossAppInventory/StorePurchaseService/SubscriptionManager/' +
      'EntitlementService/GiftingService composed honouring internal deps, decorated AFTER ' +
      'fastify.payments per dependsOn. DoD-2 — ' +
      'apps/quantmax/backend/__tests__/engine-surfaces.seam.test.ts traverses POST ' +
      '/economy/subscription via buildApp() inject(): 401 (unauth), 403 (missing economy:write), ' +
      '201 (authed, SubscriptionManager reached) + the read GET /economy/wallet 401/200 (CoinWallet ' +
      'reached, no PUBLIC_PATHS bypass). DoD-3 — Next proxies (src/app/api/economy/** via ' +
      '_lib/engine-proxy.ts) + api-client hook (src/features/economy/useEconomy.ts); the quantmax ' +
      'engine-proxy seam (POST /api/payments/intents, /api/commerce/orders, GET /api/feed) is ' +
      'asserted in src/__tests__/engine-proxy.forward.test.ts (Authorization + x-request-id ' +
      'propagation + status relay via the SAME _lib/engine-proxy.ts helper economy uses). DoD-4 — ' +
      'the seam test traverses proxy→route→engine, not the engine in isolation. dependsOn ' +
      '@quant/payments (done; decorated before economy in buildApp()).',
  },
  {
    engine: '@quant/quant-automate',
    lane: 'per-app',
    targets: ['quantai'],
    stage: 5,
    dependsOn: ['@quant/agent-runtime'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). dependsOn ' +
      '@quant/agent-runtime (done) but no host wiring yet. Deferred for a follow-up wiring pass.',
  },
  {
    engine: '@quant/quant-notebook',
    lane: 'per-app',
    targets: ['quantdocs'],
    stage: 5,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). Deferred ' +
      'for a follow-up wiring pass. Lane/targets retained as its intended categorization.',
  },
  {
    engine: '@quant/cross-app-gaming',
    lane: 'per-app',
    targets: ['quantneon'],
    stage: 5,
    dependsOn: [],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). Deferred ' +
      'for a follow-up wiring pass. Lane/targets retained as its intended categorization.',
  },
  {
    engine: '@quant/privacy-ads',
    lane: 'per-app',
    targets: ['quantads'],
    stage: 5,
    dependsOn: ['prisma'],
    status: 'done',
    reason:
      'Task 15.1 reconciliation. DoD-1 [DONE] via wiring:dod — 2 importers in apps/quantads + ' +
      'declared dependency. Marked done on real importer evidence per Req 5.1.',
  },

  // -------------------------------------------------------------------------
  // Stage 6 — remaining apps (quant-mobile, admin, dev-platform, app-store)
  // -------------------------------------------------------------------------
  {
    engine: '@quant/voice-brain-dump',
    lane: 'per-app',
    targets: ['quant-mobile', 'quantai'],
    stage: 6,
    dependsOn: ['@quant/quant-live'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). dependsOn ' +
      '@quant/quant-live (done in quantmeet/quantai, not in quant-mobile). Deferred for a ' +
      'follow-up wiring pass.',
  },
  {
    engine: '@quant/maps',
    lane: 'per-app',
    targets: ['quant-mobile'],
    stage: 6,
    dependsOn: [],
    status: 'done',
    reason:
      'Task 14.3 quant-mobile wiring. quant-mobile is a pure Vite + React + Capacitor ' +
      'CLIENT SHELL (no Fastify backend, no Next app/api proxy), so the standard 5-layer ' +
      'backend seam does not apply (documented per-app deviation, Req 6.7). The seam the ' +
      'architecture supports is a client-side service consuming the engine directly ' +
      '(mirrors the existing MobileOfflineSync -> @quant/sync-engine pattern). DoD-1 ' +
      '(wiring:dod) — imported by apps/quant-mobile (src/maps/maps-service.ts -> ' +
      'MobileMapsService, exported from src/index.ts) AND declared in apps/quant-mobile ' +
      'dependencies ([DONE]). @quant/maps is WebView-friendly: Photon geocoding + OSRM ' +
      'routing use fetch, LocationService uses navigator.geolocation (available in the ' +
      'Capacitor WebView), PlaceSearch/TripPlanner are pure compute. Client seam test: ' +
      'src/__tests__/maps-service.test.ts traverses MobileMapsService -> @quant/maps ' +
      '(geocode/searchPlaces/route/planTrip) with injected providers. DoD-2/3/4 (backend ' +
      'route / Next proxy / inject() seam test) are N/A in a Capacitor shell with no ' +
      'host backend.',
  },
  {
    engine: '@quant/quant-health',
    lane: 'per-app',
    targets: ['quant-mobile'],
    stage: 6,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      'Task 14.3 — DEFERRED (Req 6.7). Cannot meet DoD in the quant-mobile Capacitor client ' +
      'shell: the only shipped HealthProviderInterface implementation is MockHealthProvider, ' +
      'and real metrics require a native HealthKit / Google Fit bridge. The shell exposes no ' +
      'health plugin (plugins/ has Push/Camera/Contacts/FileSystem/Share/Biometric/' +
      'BackgroundFetch/WebRTC/Haptics/InAppBrowser only) and there is no host backend to ' +
      'route through. Revisit when a native health-data source is added to the shell.',
  },
  {
    engine: '@quant/device-control',
    lane: 'per-app',
    targets: ['quant-mobile'],
    stage: 6,
    dependsOn: [],
    status: 'deferred',
    reason:
      "Task 14.3 — DEFERRED (Req 6.7). The engine's core capabilities (phone/SMS via Twilio, " +
      'Bluetooth, sensors — accelerometer/gyroscope/heart-rate, accessibility) are declared ' +
      'as CapabilityProvider interfaces with no native implementation, and require native ' +
      'device APIs + a Twilio backend. The quant-mobile shell ships no sensors/phone/SMS/' +
      'Bluetooth plugin abstraction and has no host backend to host the SMS webhook / Twilio ' +
      'rails, so DoD cannot be met here. Revisit when native capability providers are bound ' +
      'to the @capacitor/* plugins in the shell.',
  },
  {
    engine: '@quant/iot-control',
    lane: 'per-app',
    targets: ['quant-mobile'],
    stage: 6,
    dependsOn: ['@quant/device-control'],
    status: 'deferred',
    reason:
      'Task 14.3 — DEFERRED (Req 6.7, plus Req 6.5 spirit). The only shipped IProtocolBridge ' +
      'is MockBridge; real IoT control needs protocol transports (Zigbee/Matter/Wi-Fi/BLE) to ' +
      'physical devices, which the Capacitor shell does not provide and which have no host ' +
      'backend here. Also dependsOn @quant/device-control, itself deferred for this app, so ' +
      'its dependency cannot be satisfied. Revisit alongside device-control once native ' +
      'protocol bridges exist.',
  },
  {
    engine: '@quant/wearables',
    lane: 'per-app',
    targets: ['quant-mobile'],
    stage: 6,
    dependsOn: ['@quant/device-control'],
    status: 'deferred',
    reason:
      'Task 14.3 — DEFERRED (Req 6.7, plus Req 6.5 spirit). The watch/glasses/headset adapters ' +
      'are stubs (connect() flips a boolean; getHealthMetrics returns hardcoded values); real ' +
      'use needs native BLE pairing + wearable SDKs the Capacitor shell does not expose, with ' +
      'no host backend. Also dependsOn @quant/device-control, itself deferred for this app. ' +
      'Revisit once native BLE wearable adapters are bound in the shell.',
  },
  {
    engine: '@quant/voice-first-os',
    lane: 'per-app',
    targets: ['quant-mobile'],
    stage: 6,
    dependsOn: ['@quant/quant-live'],
    status: 'deferred',
    reason:
      'Task 14.3 — DEFERRED (Req 6.7). Although sub-components like WakeWordStateMachine are ' +
      'pure logic, the engine as a whole needs native microphone / speech-recognition / ' +
      'wake-word audio capture, which the Capacitor shell does not surface (no speech plugin) ' +
      'and which has no host backend here. It also dependsOn @quant/quant-live, which is wired ' +
      'into quantmeet/quantai but NOT into quant-mobile (no quant-live importer/dependency in ' +
      'the mobile shell), so its dependency is unmet in this app. Revisit when native speech ' +
      'capture and a quant-live host are present in the shell.',
  },
  {
    engine: '@quant/local-first',
    lane: 'per-app',
    targets: ['quant-mobile'],
    stage: 6,
    dependsOn: ['@quant/sync-engine'],
    status: 'done',
    reason:
      'Task 14.3 quant-mobile wiring. Client-shell seam (no Fastify backend / Next proxy ' +
      'in this Capacitor app; documented per-app deviation, Req 6.7). DoD-1 (wiring:dod) — ' +
      'imported by apps/quant-mobile (src/local-first/local-store.ts -> MobileLocalStore, ' +
      'exported from src/index.ts) AND declared in apps/quant-mobile dependencies ([DONE]). ' +
      '@quant/local-first is pure client logic (in-memory CRDT OfflineStore + SyncManager ' +
      'replication log, no native/backend dependency) and is the natural offline substrate ' +
      'for the mega-shell alongside MobileOfflineSync. dependsOn @quant/sync-engine, already ' +
      'a quant-mobile dependency (consumed by src/offline/offline-sync.ts) — dependency ' +
      'present before dependent. Client seam test: src/__tests__/local-store.test.ts ' +
      'traverses MobileLocalStore -> OfflineStore/SyncManager (put/get/delete/flush + ' +
      'offline pending state). DoD-2/3/4 are N/A in a Capacitor shell with no host backend.',
  },
  {
    engine: '@quant/app-store',
    lane: 'per-app',
    targets: ['quantmax', 'admin'],
    stage: 6,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). Deferred ' +
      'for a follow-up wiring pass. Lane/targets retained as its intended categorization.',
  },
  {
    engine: '@quant/developer-platform',
    lane: 'per-app',
    targets: ['admin'],
    stage: 6,
    dependsOn: ['prisma'],
    status: 'deferred',
    reason:
      "Task 15.1 reconciliation — DEFERRED (Req 6.7). Beyond this feature's authoritative " +
      'engine set; not yet wired into a host app (no importer per wiring:dod [----]). Deferred ' +
      'for a follow-up wiring pass. Lane/targets retained as its intended categorization.',
  },

  // -------------------------------------------------------------------------
  // Deferred — thin scaffolds (Req 6.4) and blocked externals (Req 6.6/6.7)
  // -------------------------------------------------------------------------
  {
    engine: '@quant/service-discovery',
    lane: 'deferred',
    targets: [],
    stage: 0,
    dependsOn: [],
    status: 'deferred',
    reason: 'Thin scaffold; not real enough to wire (design "Deferred", Req 6.4).',
  },
  {
    engine: '@quant/co-presence',
    lane: 'deferred',
    targets: [],
    stage: 0,
    dependsOn: [],
    status: 'deferred',
    reason: 'Thin scaffold; not real enough to wire (design "Deferred", Req 6.4).',
  },
  {
    engine: '@quant/universal-capture',
    lane: 'deferred',
    targets: [],
    stage: 0,
    dependsOn: [],
    status: 'deferred',
    reason: 'Thin scaffold; not real enough to wire (design "Deferred", Req 6.4).',
  },
  {
    engine: '@quant/voice-input',
    lane: 'deferred',
    targets: [],
    stage: 0,
    dependsOn: [],
    status: 'deferred',
    reason: 'Thin scaffold; not real enough to wire (design "Deferred", Req 6.4).',
  },
  {
    engine: '@quant/quant-flow',
    lane: 'deferred',
    targets: [],
    stage: 0,
    dependsOn: [],
    status: 'deferred',
    reason: 'Thin scaffold; not real enough to wire (design "Deferred", Req 6.4).',
  },
  {
    engine: '@quant/robotics-bridge',
    lane: 'deferred',
    targets: [],
    stage: 0,
    dependsOn: [],
    status: 'deferred',
    reason: 'Blocked external: depends on unbuilt hardware-bridge externals (Req 6.6/6.7).',
  },
];

/** The five thin scaffolds that must be present-and-deferred (Req 6.4). */
export const DEFERRED_SCAFFOLD_ENGINES = ENGINE_INVENTORY.filter((w) => w.lane === 'deferred').map(
  (w) => w.engine,
);

/** Convenience selectors. */
export const crossCuttingEngines = (): EngineWiring[] =>
  ENGINE_INVENTORY.filter((w) => w.lane === 'cross-cutting');
export const perAppEngines = (): EngineWiring[] =>
  ENGINE_INVENTORY.filter((w) => w.lane === 'per-app');
export const deferredEngines = (): EngineWiring[] =>
  ENGINE_INVENTORY.filter((w) => w.lane === 'deferred');
