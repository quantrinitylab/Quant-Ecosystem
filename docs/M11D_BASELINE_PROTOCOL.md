# M11d — Live Baseline Protocol

> Purpose: capture the FIRST honest, scientifically reproducible baseline of the
> wired memory subsystem against real backends (OpenAI + Qdrant + Postgres),
> then FREEZE it. No optimization begins until a baseline is archived.

## Non-negotiable rules (M11d)

1. **No tuning before the baseline is archived.** No prompt edits, no retrieval
   weight changes, no ranking changes, no dataset edits after measurement starts.
2. **No fabricated numbers.** The runner fails fast if `OPENAI_API_KEY` /
   `QDRANT_URL` are missing — there is no silent fake fallback.
3. **Reproducible.** Every run records `commitSha`, models, dataset version, node
   version, and timestamp in the report `meta`. Same inputs → same protocol.
4. **Measure, don't optimize.** The runner reuses the existing metric code
   verbatim (`runExtractionEval`, shadow-replay aggregation). It never changes it.

## What the baseline measures

| Metric                            | Source                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| Retrieval recall / precision      | `runBaseline` retrieval loop over the frozen datasets                                 |
| Latency (recall)                  | per-query wall-clock in the retrieval loop                                            |
| Memory hit rate                   | fraction of recalls returning ≥ 1 memory                                              |
| Token usage / cost                | `runExtractionEval` (LLM extractor metrics)                                           |
| Hallucination rate / ECE / Brier  | `runExtractionEval` on the labeled extraction dataset                                 |
| Shadow divergence (legacy vs new) | `MemoryFacade` shadow mode + `aggregateShadowReports`                                 |
| Cutover gates                     | `evaluateCutoverGates` (agreement > 99%, latency Δ < 10%, 0 critical, 0 infra errors) |

Dataset version: **`m11d-v1`** = `coreScenarios + frontierScenarios` (frozen; see
`packages/ai/src/eval/datasets.ts`). Frontier scenarios are `knownHard` and are
measured honestly, not gated.

## Architecture

```
runBaseline(deps)
  ├── retrieval    → deps.makeService() [PrismaMemoryStore + Qdrant vector + keyword fallback]
  ├── extraction   → deps.extractor    [LlmExtractionModel → OpenAI chat JSON]
  └── shadow       → MemoryFacade(shadow): LegacyMemoryAdapter(ContextManager) vs MemoryService
```

`packages/ai/src/eval/baseline-runner.ts` is dependency-injected:

- **offline/fake** (unit-tested, deterministic, no network): `baseline-runner.test.ts`.
- **live**: `composeLiveBaselineDeps({ prisma, embeddingClient, commitSha })` wires
  the real adapters from env. The `@quant/ai` package does not depend on
  `@quant/database`, so the caller injects the Prisma client
  (`scripts/memory-baseline.mts`).

## Reproduce (one run)

```bash
# 1. Bring up the stack (real Postgres+pgvector and Qdrant).
docker compose -f docker-compose.dev.yml up -d postgres qdrant

# 2. Apply migrations (creates memory_records + memory_embeddings, migration 0049).
DATABASE_URL=postgresql://quant:quant_secret@localhost:5432/quantdb \
  pnpm --filter @quant/database db:migrate

# 3. Run the baseline (real embeddings + extraction). Fails fast if key missing.
OPENAI_API_KEY=sk-...
QDRANT_URL=http://localhost:6333 \
DATABASE_URL=postgresql://quant:quant_secret@localhost:5432/quantdb \
  pnpm tsx scripts/memory-baseline.mts
```

Output is archived to `docs/baselines/baseline-<timestamp>.{json,md}` and printed.

Optional env: `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`),
`MEMORY_EXTRACTION_MODEL` (default `gpt-4o-mini`), `QDRANT_COLLECTION`
(default `quant_memories`), `BASELINE_NOTES`.

## Freeze

1. Commit the generated `docs/baselines/baseline-<timestamp>.{json,md}` unchanged.
2. Record a row in `docs/baselines/README.md`.
3. Only AFTER a frozen baseline exists does optimization (M12) begin. The baseline
   is never overwritten — new runs are new files.

## Status in this environment

The harness is built and verified offline (deterministic fake run, 3 tests green,
typecheck clean). The LIVE numbers are **not yet captured** because this
environment has no running Docker daemon and no `OPENAI_API_KEY`. Run the recipe
above on a machine with the stack + key to produce the first frozen baseline. See
`docs/baselines/README.md` (row: PENDING).
