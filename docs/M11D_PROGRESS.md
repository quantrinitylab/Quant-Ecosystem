# M11d — Progress & Blocker

> Baseline-first. No tuning. This records what is verified on the live stack and
> the one remaining input needed for the full baseline.

## Stack: UP and healthy (verified)

| Service               | Status   | Evidence                                                                        |
| --------------------- | -------- | ------------------------------------------------------------------------------- |
| Docker daemon         | running  | server 29.3.1                                                                   |
| PostgreSQL (pgvector) | healthy  | `pg_isready` accepting connections                                              |
| Qdrant                | healthy  | `GET :6333/healthz` → 200                                                       |
| Migrations            | applied  | `prisma migrate deploy` → all applied incl. `0049_memory_records`               |
| Schema                | verified | `memory_records` + `memory_embeddings` tables exist; `vector` extension present |

Bring-up: `docker compose -f docker-compose.dev.yml up -d postgres qdrant`.

## Real pipeline (storage + retrieval half): PROVEN — no mocks

`scripts/memory-smoke.mts` ran the REAL pipeline against live Postgres (real
`PrismaMemoryStore`, real rule `DefaultMemoryExtractor`, real keyword retriever —
no OpenAI needed):

```
observe: 4 turns in 767ms
recall "what is my name" (9ms): ["name is Kundan"]
recall "where do I live" (7ms): ["lives in Patna"]
recall "where do I work" (7ms): ["works at OpenAI"]
memory hit rate: 100% · avg recall: 7.7ms
```

This confirms the write path (Postgres), rule extraction, and keyword retrieval
work end-to-end on real infrastructure. These are real measurements, not fakes.

## Blocker for the FULL baseline: OPENAI_API_KEY

The OpenAI-dependent half — real embeddings (→ Qdrant vector retrieval) and LLM
extraction (`LlmExtractionModel`) — cannot run: no `OPENAI_API_KEY` is present in
the environment (checked env + `.env.local`; none found). Per M11d rules there is
NO mock fallback and NO fabricated numbers, so the full baseline is not yet
captured. `composeLiveBaselineDeps` fails fast without the key by design.

## Resume: one command to produce the frozen baseline

```bash
docker compose -f docker-compose.dev.yml up -d postgres qdrant   # already up
OPENAI_API_KEY=sk-... \
QDRANT_URL=http://localhost:6333 \
DATABASE_URL=postgresql://quant:quant_secret@localhost:5432/quantdb \
  pnpm memory:baseline
```

This runs the full `runBaseline` (retrieval recall/latency, memory writes/hit
rate, token usage, cost, hallucination, legacy-vs-new shadow divergence + cutover
gates) and archives `docs/baselines/baseline-<ts>.{json,md}` (see
`docs/M11D_BASELINE_PROTOCOL.md`). The harness is built and unit-verified offline
(`baseline-runner.test.ts`, deterministic fakes).

## What remains for M11d completion

- [x] Stack up (Docker/Postgres/Qdrant) + migrations + schema verified
- [x] Real storage + retrieval proven on live Postgres (smoke)
- [x] OpenAI integration wired via configuration (`composeLiveBaselineDeps`)
- [ ] **Provide `OPENAI_API_KEY`** → run `pnpm memory:baseline`
- [ ] Archive the frozen baseline + fill `docs/baselines/README.md`
- [ ] Report: architecture diagram, benchmark numbers, edge cases, risks, M11e recommendation
