# Technical Debt Inventory — Memory Subsystem & Adjacent

> Waiting-room artifact while PR #548 is under review. INVENTORY ONLY — no fixes,
> no architecture changes. Evidence sourced from REPO_INTEGRATION_AUDIT.md and
> MEMORY_ARCHITECTURE.md §12. Git status: uncommitted working-tree doc.
>
> Effort: S (<0.5d) · M (0.5–2d) · L (>2d). Risk: Low / Med / High.

## Integration debt (surfaced by the repo audit)

### TD-001 — New memory subsystem is unwired

- **Description:** `createMemoryService` is constructed only in tests/eval; no app/service uses it.
- **Why it exists:** Built design-first behind frozen ports; composition-root wiring was deliberately deferred (ADR-005 note).
- **Risk:** High — the durable/safe memory path does not run in production.
- **Suggested milestone:** M11c (facade wires it in via dual-write/shadow).
- **Effort:** L

### TD-002 — Production AI runs the amnesiac in-memory path

- **Description:** `AIEngine` uses in-memory `ContextManager` (`enrichPrompt`/`addToHistory`); state lost on restart.
- **Why it exists:** Original implementation predates the new subsystem; never migrated.
- **Risk:** High — the exact defect MEMORY_AUDIT.md set out to fix is still live.
- **Suggested milestone:** M11c → M11d cutover.
- **Effort:** L

### TD-003 — QuantAI facts stored in-memory

- **Description:** `apps/quantai/backend/services/memory.service.ts` wraps in-memory `AIMemoryStore` (`@quant/ai-memory`); lost on restart.
- **Why it exists:** Shipped before the durable subsystem existed.
- **Risk:** Med — user AI memories vanish on deploy/restart in QuantAI.
- **Suggested milestone:** M11c (first integration target — smallest blast radius).
- **Effort:** M

### TD-004 — Parallel memory implementations (drift)

- **Description:** ≥4 memory notions coexist (AI ContextManager, ai-memory, quantchat media memories, identity MemoryManager) with 3 storage strategies.
- **Why it exists:** Independent feature timelines; no consolidation pass.
- **Risk:** Med — confusion, duplicated maintenance, inconsistent behavior.
- **Suggested milestone:** ADR-012 consolidation (after new subsystem proven live).
- **Effort:** L

### TD-005 — `identity-permissions` MemoryManager appears dead

- **Description:** Exported + tested, but no app consumer found.
- **Why it exists:** Built for a flow that never shipped, or superseded.
- **Risk:** Low — dead code, maintenance noise.
- **Suggested milestone:** Code-quality pass (confirm no DI usage, then remove).
- **Effort:** S

## Subsystem debt (from MEMORY_ARCHITECTURE.md §12)

### TD-006 — Adapters not live-tested

- **Description:** OpenAI/Qdrant/LLM adapters are contract-tested with fake `fetch`; never run against live services.
- **Why it exists:** No credentials / live infra in CI; deliberate offline discipline.
- **Risk:** Med — real API quirks (rate limits, malformed output, latency) unverified.
- **Suggested milestone:** M11d (live baseline).
- **Effort:** M

### TD-007 — `InMemoryConversationLog` default is ephemeral

- **Description:** Default ConversationLog is in-process; raw dialogue lost on restart (extracted memories are durable).
- **Why it exists:** Dev/test default; durable log deferred.
- **Risk:** Low–Med — transcript loss, not fact loss.
- **Suggested milestone:** M11e or M12 (durable AIMessage-backed log).
- **Effort:** M

### TD-008 — Sentiment retraction / negative-fact extraction deferred

- **Description:** "I don't like X anymore" would over-retract (whole sentiment family); negative facts only partially handled.
- **Why it exists:** Needs object-level extraction; deferred to the LLM extractor.
- **Risk:** Low — narrow correctness gap, documented.
- **Suggested milestone:** M11d+ (LLM extractor via ExtractionModel).
- **Effort:** M

### TD-009 — Minimal transition history on retired memories

- **Description:** Superseded/retracted memories get `archivedAt`; the full transition reason lives on the new memory, not the retired one.
- **Why it exists:** Archiver `updateMany` sets only `archivedAt`; richer update deferred.
- **Risk:** Low — audit granularity, not correctness.
- **Suggested milestone:** ADR-012 (GC/lifecycle) or M11e.
- **Effort:** S

### TD-010 — Fingerprint idempotency not backed by an index

- **Description:** Idempotency relies on recall surfacing the prior memory; no dedicated fingerprint index/unique constraint.
- **Why it exists:** Recall + duplicate verdict was sufficient offline; index deferred.
- **Risk:** Med at scale — replays could double-write if recall misses the prior memory.
- **Suggested milestone:** M11d/M11e (add `memory_records.fingerprint` index).
- **Effort:** M

### TD-011 — `DefaultMemoryService.persist` is growing

- **Description:** persist handles retraction + conflict + policy orchestration + metadata helpers.
- **Why it exists:** Features accreted (M07/M09/M11b) into one method.
- **Risk:** Low — readability/maintainability; behavior is tested.
- **Suggested milestone:** Code-quality pass (extract helpers, no behavior change).
- **Effort:** S

### TD-012 — True store-level archive not implemented

- **Description:** `forget(archive)` uses `maintenance.demote`; a real `MemoryStore.archive/updateMetadata` capability was deferred (ADR-005/006).
- **Why it exists:** Frozen store surface; capability deferred until needed.
- **Risk:** Low — archive semantics partially realized via `archivedAt` in supersession path.
- **Suggested milestone:** ADR-012.
- **Effort:** M

### TD-013 — Qdrant collection provisioning not in adapter

- **Description:** `QdrantVectorBackend` assumes the collection exists (right dimension/distance); no `ensureCollection`.
- **Why it exists:** Provisioning belongs to infra/bootstrap, not the request-path adapter.
- **Risk:** Med — first live run fails without a manual/init step.
- **Suggested milestone:** M11d (env validation / bootstrap script).
- **Effort:** S

## Repo hygiene (not memory-specific)

### TD-014 — Pre-existing unrelated working-tree changes

- **Description:** `apps/quantmail/backend/routes/drive.ts` (modified) + untracked quantmail/postman/vscode files predate this work; left untouched.
- **Why it exists:** Present at session start; outside memory scope.
- **Risk:** Low — unrelated; flagged so they aren't swept into a memory PR.
- **Suggested milestone:** Owner triage (out of memory scope).
- **Effort:** S

### TD-015 — Line-ending (LF/CRLF) churn on commit

- **Description:** Commits warn "LF will be replaced by CRLF"; potential cross-platform diff noise.
- **Why it exists:** Windows checkout without a normalized `.gitattributes` for these paths.
- **Risk:** Low — diff noise.
- **Suggested milestone:** Code-quality pass (`.gitattributes` normalization).
- **Effort:** S

## Summary by risk

- **High:** TD-001, TD-002 (the subsystem isn't the one running — the core reason for M11c).
- **Med:** TD-003, TD-004, TD-006, TD-010, TD-013.
- **Low:** TD-005, TD-007–TD-009, TD-011, TD-012, TD-014, TD-015.

The two High items are exactly what the M11c → M11d migration path resolves. No
fixes here — inventory only.

---

_Waiting-room deliverable | Inventory only | No code or architecture changed_
