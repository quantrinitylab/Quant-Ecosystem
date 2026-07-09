# M11d Runbook — Live Validation, Step by Step

> Companion to `M11D_PROTOCOL.md` (the law) — this is the operating manual.
> Written so that the day API keys arrive, Baseline v1 is **one session of
> command-following**, not a week of rediscovery.
>
> **Prime rule (from the protocol):** this phase measures, it does not improve.
> No prompt, policy, or memory-engine code change until Baseline v1 is
> completed, archived, and reviewed.

---

## Phase 0 — Prerequisites (the "add at the end" list)

Everything in this repo runs offline EXCEPT the items below. This is the
complete list of external credentials/infra needed — nothing else:

| Item                | Used by                                                            | Env var                                    |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| OpenAI API key      | extraction (`gpt-4o-mini`) + embeddings (`text-embedding-3-small`) | `OPENAI_API_KEY`                           |
| Postgres + pgvector | persistence (`prisma-memory-store`)                                | `DATABASE_URL`                             |
| Qdrant              | vector backend (`qdrant-vector-backend`)                           | `QDRANT_URL` (+ `QDRANT_API_KEY` if cloud) |

Local infra needs no accounts — it is already defined in `docker-compose.dev.yml`:

```bash
docker compose -f docker-compose.dev.yml up -d postgres qdrant
```

Optional overrides: `EXTRACTION_MODEL`, `OPENAI_EMBEDDING_MODEL` (recorded by
the version freeze — set them BEFORE freezing, never after).

## Phase 1 — Environment gate

Exit criterion (protocol): **one end-to-end request succeeds.**

```bash
pnpm install --frozen-lockfile
docker compose -f docker-compose.dev.yml up -d postgres qdrant
pnpm --filter @quant/database db:push        # apply schema (includes memory tables)
pnpm --filter @quant/ai test                 # 517 tests must be green (verified 2026-07-09)
```

## Phase 2 — Version freeze (MANDATORY before any run)

```bash
node scripts/m11d-version-freeze.mjs
```

- Captures: extraction model, embedding model, prompt revision (sha256),
  policy version, corpus version, commit SHA, lockfile hash.
- Refuses a dirty working tree (a dirty tree is not a reproducible baseline).
- Writes `docs/baselines/version-freeze-<timestamp>.json` — **append-only,
  never edited, never deleted** (Law 2).

## Phase 3 — Offline dashboard (already runnable today, no keys)

```bash
pnpm --filter @quant/ai memory:eval
```

Current output (2026-07-09, commit `b71d559`): core scenarios 100% recall /
100% precision; frontier "known-hard" gaps are honest and documented
(hinglish, typos, temporal-complex, multi-current, hallucination) —
**overall 77.3% recall / 95.5% precision / 0% duplicates.** This is the
pre-live reference point.

## Phase 4 — Shadow run (needs Phase 0 keys)

1. Set facade mode to `shadow` for the chosen surface (ONE runtime, ONE
   service, ONE feature path — microscopic blast radius, per M11c order).
2. Run real/representative traffic; collect `ShadowReport`s.
3. Aggregate + gate:
   - `aggregateShadowReports(reports)` → agreement, severity, latency Δ
   - `evaluateCutoverGates(agg, legacyAvgLatencyMs)` → pass/fail + reasons
4. Record ONE row in `docs/MIGRATION_SCOREBOARD.md`. A human decides the mode
   change — the facade never self-migrates.

Gates (ADR-011, all must pass): semantic agreement > 99% · latency Δ < 10% ·
pending agreement > 98% · critical divergences = 0 · infra failures = 0.

## Phase 5 — Baseline v1 (needs Phase 0 keys)

1. Version freeze again if ANYTHING changed since Phase 2 (it shouldn't have).
2. Run the versioned corpus (`CORPUS_VERSION = real-conv-v1`) through the wired
   path with the real extraction + embedding models.
3. Archive together, under `docs/baselines/`:
   - the version-freeze JSON
   - replay records
   - the evaluation report (Phase 3 dashboard rerun against live adapters)
   - the scoreboard row
4. **Baseline v1 is read-only forever.** Improvements create v2, v3, …

## Phase 6 — Failure analysis → Tuning (strictly after Baseline v1)

- Classify every failure with the taxonomy (`eval/failure-taxonomy.ts`) —
  exactly one cause per failure.
- Then, and only then: ONE controlled change per experiment, one rerun,
  one row in `docs/M11D_DECISION_LOG.md`. Keep or Revert — data, not intuition.

## Success definition (copied from the charter, so nobody forgets)

- Lower-than-hoped precision = the experiment successfully measured reality.
- Many Pending memories = possibly conservative safety working as designed.
- High latency = still a success IF measurements are reproducible and attributable.

**The experiment succeeds when it produces trustworthy evidence — regardless
of whether the numbers are flattering.**

---

**Owner:** Kiro · **Approved by:** CEO · **Version:** 1.0 · **Date:** 2026-07-09
