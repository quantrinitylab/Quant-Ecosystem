---
doc_id: m11d-shadow-canary-wiring-baseline-2026-07-22
doc_type: evidence-baseline
authority: evidence
status: append-only
owner: platform-architecture
captured_at: 2026-07-22
verified_at_commit: 28f2ef50eec492c955a50fc6eb917aa51aa10739
branch: kiro/canonical-project-memory
milestone_id: M11D-SHADOW-CANARY
decision: HOLD
---

# M11d shadow-canary wiring baseline — 2026-07-22

This is the zero-behavior-change baseline for Execution Queue work unit 1. It records code-observed wiring and local executable evidence before fail-closed implementation. Do not rewrite this file; supersede it with a later dated baseline.

## Capture boundary

- Source: commit `28f2ef50eec492c955a50fc6eb917aa51aa10739` plus the uncommitted institutional-memory documentation change only.
- No memory mode, retrieval weight, policy, prompt, adapter, or runtime behavior was changed.
- Evidence method: composition-root tracing, adapter/failure-path inspection, existing artifact comparison, and targeted command attempts.
- Secrets and live model calls were not used.

## Runtime composition roots

| Root                                                             | Mode authority                                    | Legacy path                                            | New path                                                          | Runtime truth                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `AIEngine` in `packages/ai/src/core/engine.ts`                   | Hardcoded `legacy`                                | `LegacyEngineMemory` → process-local `ContextManager`  | Adapter exists but is never constructed                           | Main inference cannot enter dual-write, shadow, or new without code change.                              |
| QuantAI memory routes in `apps/quantai/backend/routes/memory.ts` | `QUANTAI_MEMORY_MODE`; invalid/missing → `legacy` | `QuantaiLegacyBackend` → process-local `AIMemoryStore` | `createMemoryService`; Prisma only when `DATABASE_URL` is present | This is the only configurable runtime facade, and it covers only `/memory/observe` and `/memory/recall`. |

Both facades are immutable after construction; a mode change requires restart/reconstruction. No transition FSM prevents a direct `legacy` → `new` selection.

## Durability and isolation matrix

| Capability            | Observed implementation                                             | Baseline result                                                                                              |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| AIEngine legacy state | Three process-local Maps in `ContextManager`                        | Lost on restart.                                                                                             |
| QuantAI legacy state  | Process-local Map in `@quant/ai-memory`                             | Lost on restart.                                                                                             |
| New memory records    | Prisma-backed only when a real client is injected                   | QuantAI silently substitutes an in-memory DB when `DATABASE_URL` is absent.                                  |
| Conversation log      | `InMemoryConversationLog` in default composition                    | Not restart-safe even with Prisma records.                                                                   |
| Vector retrieval      | Qdrant/OpenAI/Bedrock adapters exist                                | QuantAI composition passes no vector configuration; declared Qdrant/embedding env does not activate vectors. |
| Shadow reports        | Process-local array, maximum 500                                    | Lost on restart and not exportable; status route exposes count only.                                         |
| Owner isolation       | Authenticated `userId` becomes `actor`; SQL and Qdrant filter owner | Owner-scoped paths exist.                                                                                    |
| Tenant isolation      | Tenant is not propagated by QuantAI and reports contain no tenant   | Not implemented or proven.                                                                                   |
| Vector hydration      | SQL hydration accepts IDs returned by vector search                 | Owner/tenant is not reasserted during hydration.                                                             |

## Failure-mode baseline

| Failure/config state                   | Current behavior                                                    | Required canary behavior                                                                         | Gate     |
| -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------- |
| Missing/invalid mode                   | Silently selects `legacy`                                           | Legacy default may remain; invalid explicit values must be rejected.                             | Unproven |
| Non-legacy mode without `DATABASE_URL` | Starts with in-memory new store                                     | Fail startup/readiness with structured configuration error.                                      | **FAIL** |
| Database unavailable                   | Lazy startup may succeed; readiness fails; new operations fail      | Non-legacy canary must remain unready and expose dependency cause.                               | Partial  |
| Missing Qdrant/embedding config        | No effect because QuantAI does not wire vectors                     | Non-legacy canary must require the declared durable vector composition.                          | **FAIL** |
| Vector recall unavailable              | Generic retriever can drop failed backend and continue keyword-only | Degradation must be explicit in report/metrics; migration gate cannot count it as agreement.     | Unproven |
| Vector indexing unavailable            | Indexing failure can propagate                                      | Secondary failure must be observable and must not fail legacy-authoritative traffic.             | Unproven |
| Shadow sink unavailable/throws         | Package facade invokes sink without isolation                       | Metrics/evidence failure must never change served legacy response, but must fail readiness/gate. | **FAIL** |
| Restart                                | Memory/report buffers disappear                                     | Records and evidence must survive restart before any advance decision.                           | **FAIL** |

## Shadow evidence schema and gates

Current package reports include request ID, mode, query, recalled contents, latency, divergence, severity, and timestamp. They omit actor, tenant, session/turn, policy version, corpus version, commit SHA, pending IDs, and durable report identity. The engine-specific report includes `userId`, but AIEngine never enters shadow mode.

The replay aggregator measures mean Jaccard agreement, severity counts, backend errors, blocking IDs, and mean latency delta. It does not measure or enforce pending agreement, top-k agreement, contradiction agreement, restart survival, or tenant isolation. No Prometheus shadow metric was found.

Existing [Migration Scoreboard](../MIGRATION_SCOREBOARD.md) evidence remains **HOLD** at 14.3% agreement and five critical divergences. It came from an in-process representative run, not a durable deployed canary.

## Local command evidence

| Command                                                                 | Result                                                                          | Interpretation                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                        | Failed with `ERR_PNPM_ENOSPC` after 1268/1269 packages; C: had about 99 MB free | A clean latest-checkout dependency graph was not established. Partial generated `node_modules` was removed. |
| Focused institutional-memory Vitest suite through existing parent tools | 10/10 passed                                                                    | Git-backed project-memory automation is executable; it does not prove canary runtime behavior.              |
| Package-scoped QuantAI facade test through parent Vitest                | Failed before collection: `@quant/ai-memory` unresolved                         | Parent dependency links cannot substitute for a latest-checkout workspace install.                          |
| Targeted AI memory suite through parent Vitest                          | Timed out without a trustworthy result                                          | No pass claim is made.                                                                                      |
| `pnpm exec tsx scripts/m11d-environment-gate.ts`                        | Not run                                                                         | Requires clean dependency install plus live Postgres/Qdrant; prior artifact does not prove current commit.  |

## Existing tests: what they do and do not prove

Code contains facade routing/error tests, adapter/config unit tests, QuantAI mode-cycle tests, shadow replay tests, and an environment-gate script. The mode-cycle uses fresh in-memory stores and checks legacy survival; it is not durable rollback proof. The environment gate can compose PostgreSQL and Qdrant, but uses deterministic 64-dimensional embeddings and does not prove restart or tenant isolation. Broad shadow-evidence tests write artifacts and were deliberately not run during this read-only baseline.

## Baseline verdict

**HOLD.** Work unit 1 is complete as an inventory and failure baseline, not as a runtime gate pass. Zero ADR-011 promotion gates are newly satisfied by this capture.

## Contract for work unit 2

The next change is wiring/configuration safety only:

1. `legacy` remains the safe default when no mode is explicitly configured.
2. An invalid explicit mode is a startup configuration error, not a silent fallback.
3. `dual_write`, `shadow`, and `new` reject process-local DB substitutes.
4. `shadow` requires a durable report sink and tenant identity before route registration succeeds.
5. The runtime composition must either wire declared vector dependencies or explicitly report a non-vector canary variant; it must not advertise unused Qdrant/embedding configuration.
6. Dependency failures surface through structured startup/readiness diagnostics.
7. Legacy-authoritative responses remain unchanged; no retrieval or acceptance-policy tuning enters this work unit.

## Reproduction commands after disk capacity is restored

```powershell
pnpm install --frozen-lockfile
pnpm --filter @quant/ai exec vitest run src/__tests__/memory-facade.test.ts src/__tests__/engine-memory.test.ts src/__tests__/legacy-adapter-and-shadow-replay.test.ts
pnpm --filter @quant/quantai exec vitest run backend/__tests__/memory-facade.service.test.ts
docker compose -f docker-compose.dev.yml up -d postgres qdrant
$env:DATABASE_URL='postgresql://quant:quant_secret@localhost:5432/quantdb'
$env:QDRANT_URL='http://localhost:6333'
pnpm --filter @quant/database exec prisma db push --schema=prisma/schema.prisma
pnpm exec tsx scripts/m11d-environment-gate.ts
```

The environment-gate command writes evidence by design. Run it only from an intentional clean evidence branch and record the resulting artifact; never add secrets.
