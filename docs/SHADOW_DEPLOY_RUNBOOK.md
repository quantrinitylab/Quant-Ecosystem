# Shadow Deploy Runbook — QuantAI Memory Migration (M11d, deployed traffic)

> The in-process shadow pipeline already works and already said HOLD once
> (#18 — that's it doing its job). This runbook turns the deployed version
> into a checklist so the production shadow run is **operations, not
> engineering**. Companion: `M11D_PROTOCOL.md` (law), `M11D_RUNBOOK.md`
> (baseline phases), `MIGRATION_SCOREBOARD.md` (evidence ledger).

## 0. What you need

| Item                                                                         | Why                                 | Have it?         |
| ---------------------------------------------------------------------------- | ----------------------------------- | ---------------- |
| A host with Docker (one VPS is enough)                                       | runs the stack                      | —                |
| `JWT_SECRET` set to a real value                                             | auth                                | —                |
| (Optional) `EXTRACTION_API_KEY` + `EXTRACTION_BASE_URL` + `EXTRACTION_MODEL` | live LLM extraction on the NEW path | —                |
| (Later, for H3) embedding-capable API key                                    | semantic layer                      | blocked upstream |

No embedding key? The shadow run still works — the NEW path uses heuristic
extraction + keyword retrieval, and divergence measurement is still valid
for THAT configuration (record it in the scoreboard row).

## 1. Bring the stack up

```bash
export QUANTAI_MEMORY_MODE=legacy         # start SAFE; shadow comes later
docker compose -f docker-compose.yml -f docker-compose.shadow.yml up -d \
  postgres redis qdrant quantai
pnpm --filter @quant/database exec prisma db push --schema=prisma/schema.prisma
node scripts/m11d-environment-gate.ts     # 6/6 checks must pass (needs DATABASE_URL/QDRANT_URL)
```

## 2. Prove LEGACY is byte-identical in the deployment

Run representative traffic (real users or scripted flows) against
`POST /api/memory/observe` and `GET /api/memory/recall`.
`GET /api/memory/facade/status` must show `{"mode":"legacy","shadowReportCount":0}`.
Nothing about existing behavior may change. Record a scoreboard row (legacy).

## 3. Flip to SHADOW (a human does this)

```bash
export QUANTAI_MEMORY_MODE=shadow
docker compose -f docker-compose.yml -f docker-compose.shadow.yml up -d quantai
```

- Users still get LEGACY answers — shadow never influences responses (ADR-011).
- Every recall now produces a ShadowReport (bounded buffer, visible via
  `GET /api/memory/facade/status`).

## 4. Collect → aggregate → gate

Run traffic for a representative window (enough recalls to be meaningful —
target ≥ 500 reports). Then aggregate with the exact functions the in-process
run used (`aggregateShadowReports` → `evaluateCutoverGates`) and record ONE
row in `MIGRATION_SCOREBOARD.md` with the artifact JSON committed under
`docs/baselines/`.

Gates (ADR-011, ALL must pass): semantic agreement > 99% · latency Δ < 10% ·
pending agreement > 98% · critical divergences = 0 · infra failures = 0.

**Expected reality check:** the in-process run measured 14.3% agreement
because legacy (substring over explicit memories) and new (extraction-based)
have different semantics BY DESIGN. The deployed run will likely HOLD for the
same reason. The decision that follows is a HUMAN one, with two honest options:

1. Seed parity (backfill explicit memories into the new store) and re-run, or
2. Accept the new semantics deliberately via a reviewed decision-log entry.

## 5. Advance / rollback

- Gates pass + human approval → `QUANTAI_MEMORY_MODE=dual_write` → repeat →
  `new`. One step at a time, one scoreboard row per step.
- Anything regresses → flip the env back. Rollback is a container restart;
  reversibility was proven by test in #17 (mode-cycle, zero corruption).

## Non-goals during the shadow window

No prompt changes, no threshold tuning, no ranking work, no new backends.
If tempted: issue, not commit. (M11c order, unchanged.)

---

**Owner:** Kiro · **Version:** 1.0 · **Date:** 2026-07-09
