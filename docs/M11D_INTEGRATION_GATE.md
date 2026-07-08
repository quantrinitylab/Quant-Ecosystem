# M11d Integration Gate — Decision

> Execution phase. Records the hard checkpoint surfaced by REPO_INTEGRATION_AUDIT.md.
> Git status: uncommitted working-tree artifact; commit on the execution branch.

## Decision

**M11d live validation is GATED on wiring the new memory subsystem into at least
one real runtime path.** No live baseline is run against the isolated subsystem.

## Why (evidence)

`REPO_INTEGRATION_AUDIT.md` proved `createMemoryService` is constructed only in
tests/eval. Production AI runs the old in-memory `ContextManager` (via `AIEngine`)
and QuantAI facts use the in-memory `AIMemoryStore`. Running an M11d baseline now
would measure a subsystem that is **architecturally complete but operationally
irrelevant to production** — a lab baseline, not a production validation.

## Rule

- ❌ No M11d live baseline until ≥1 app path constructs `createMemoryService(...)`
  with the real `PrismaClient` + `QdrantVectorBackend` + `OpenAIEmbeddingProvider`
  - `LlmExtractionModel` and serves real `observe`/`recall`.
- ✅ Offline prep (evaluation corpus, failure taxonomy, replay tooling) proceeds
  in parallel — it is never wasted.

## Corrected sequence (supersedes the earlier M11d-first plan)

1. Offline prep — versioned corpus + failure taxonomy (this turn). ← DONE
2. **Integration** — wire `createMemoryService` into one real app path (smallest
   blast radius: QuantAI backend, replacing `AIMemoryStore`). Its own PR, after
   #548 merges.
3. Environment validation — bring up docker-compose dev stack (Postgres+pgvector,
   Qdrant), real `OPENAI_API_KEY`, one successful end-to-end request.
4. **Baseline v1** — run the versioned corpus through the _wired_ path; archive,
   no tuning.
5. Failure attribution → review evidence → controlled optimization.

## Consequence

The biggest value now is not more design — it is making the new subsystem the one
that actually runs. The integration PR (step 2) becomes the true next milestone,
gating the live baseline.

---

_Execution phase | Gate decision | backed by REPO_INTEGRATION_AUDIT.md_
