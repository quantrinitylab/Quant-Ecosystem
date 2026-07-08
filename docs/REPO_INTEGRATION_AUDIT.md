# Repository & Integration Audit (Agent A)

> Execution phase, Milestone 1. Evidence-only; no code changed. Scope: memory/AI
> integration reality, duplicate implementations, dead code, drift.
> Method: grep/read across the repo (node_modules excluded).
>
> Git status of THIS file: uncommitted working-tree artifact. It is NOT part of
> the frozen PR #548 (feat/memory-port-v2). Commit it on the execution/M11d branch.

## Headline

The new production-grade memory subsystem (PR #548) is an **island**: it is
constructed nowhere outside tests/eval. Meanwhile the live apps run on **four
older, mostly in-memory memory paths**. The original `MEMORY_AUDIT.md` problem
("AI operates in amnesia between restarts") is therefore **still true in
production**, because the fix is built but not wired in.

## Memory implementation inventory

| #   | System                   | Location                                                                                                              | Storage                            | Consumed by                                                                                                                                                       | Status                                                     |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | **New memory subsystem** | `packages/ai/src/core/*` (`createMemoryService`, DefaultMemoryService, conflict/acceptance/retrievers) + `adapters/*` | Prisma + Qdrant (durable)          | **only** `__tests__`, `eval/`                                                                                                                                     | **UNWIRED** (integration gap)                              |
| 2   | AI `ContextManager`      | `packages/ai/src/core/context-manager.ts`                                                                             | in-process `Map` (lost on restart) | `AIEngine` (`engine.ts` `enrichPrompt`/`addToHistory`) → used by `apps/quantsync/backend/routes/ai.ts`, `apps/quantneon/backend/routes/ai.ts`, `UnifiedAIService` | **ACTIVE (old path)**                                      |
| 3   | `AIMemoryStore`          | `packages/ai-memory/*`                                                                                                | in-process `Map`                   | `apps/quantai/backend/services/memory.service.ts` → `routes/memory.ts`                                                                                            | **ACTIVE (in-memory)**                                     |
| 4   | QuantChat memories       | `apps/quantchat/backend/services/memory.service.ts`                                                                   | Prisma (`Memory` media model)      | `apps/quantchat/backend/routes/memories.ts`                                                                                                                       | **ACTIVE (separate domain: media memories, not AI facts)** |
| 5   | Identity `MemoryManager` | `packages/identity-permissions/src/core/memory-manager.ts`                                                            | in-process `Map`                   | exported + own tests only; **no app consumer**                                                                                                                    | **LIKELY DEAD**                                            |

Note: two unrelated `ContextManager` classes exist —
`packages/quant-tools/src/orchestrator/context-manager.ts` (tool/app context, NOT
memory) and the AI one above. Not a conflict; flagged to avoid confusion.

## Top integration gaps (ranked by impact)

1. **New subsystem is wired to nothing** (highest impact). `createMemoryService`
   is called only in `packages/ai/src/__tests__/*` and `packages/ai/src/eval/*`.
   No app/service constructs it. The durable, safety-checked memory path does not
   run in production. — Evidence: grep `createMemoryService|new DefaultMemoryService`
   returns only tests + the composition root definition.
2. **Production AI still uses the amnesiac path.** `AIEngine` instantiates the
   in-memory `ContextManager` (`engine.ts:73`) and calls `enrichPrompt`/
   `addToHistory` (lines ~304, ~400, ~429, ~508). Apps use `new AIEngine()`
   directly. So inference memory is still process-local and lost on restart — the
   exact defect `MEMORY_AUDIT.md` set out to fix.
3. **QuantAI facts are in-memory.** `apps/quantai/backend/services/memory.service.ts`
   wraps `@quant/ai-memory`'s `AIMemoryStore` (a `Map`). User AI memories are lost
   on restart in the shipping QuantAI backend.

## Dead / low-value code candidates

- `packages/identity-permissions/src/core/memory-manager.ts` — exported, tested,
  **no app consumer** found. Candidate for removal or a documented internal-only
  status. (Confirm no dynamic/DI usage before deleting.)
- `packages/ai-memory` overlaps conceptually with the new subsystem's user-fact
  storage but uses a different (in-memory, non-conflict-aware) model. Not dead
  (QuantAI uses it) — but a **consolidation candidate** once the new subsystem is
  wired.

## Architectural drift

- **≥4 parallel memory notions** (conversation memory, AI facts, media memories,
  identity app-memory) with **3 different storage strategies** (in-process Map,
  Prisma media model, and the new Prisma+Qdrant subsystem). The new subsystem was
  designed to be the canonical AI-fact/conversation memory but has not displaced
  #2 or #3.
- Two `memory.service.ts` files (quantchat, quantai) serve **different domains**
  (media vs AI facts) — same filename, different purpose. Naming drift, not a bug.

## Repo health (memory/AI scope)

- `packages/ai` typechecks clean and the full suite is green (472 tests) as of the
  frozen branch — verified this session (`tsc --noEmit`, `vitest run`).
- No broken imports referencing deleted files found in `packages/ai`.

## Recommendations (planning only — do NOT implement now; PR #548 is frozen)

These are integration tasks for AFTER #548 merges and AFTER M11d baseline:

1. **Wire the new subsystem behind a real composition root** in one app first
   (smallest blast radius, e.g. QuantAI backend), replacing `AIMemoryStore`, with
   the real `PrismaClient` + Qdrant adapters. This closes gap #1 and #3 together.
2. **Migrate `AIEngine` context enrichment** to call `MemoryService.observe/recall`
   instead of the in-memory `ContextManager` (gap #2). Behind a flag; measure via
   the eval harness before/after.
3. **Decide `identity MemoryManager`'s fate** — delete if truly unused, or document
   as identity-internal.
4. **Consolidation ADR** (future) for the parallel memory systems once the new one
   is proven live.

Each is its own PR, driven by evidence (eval + replay), consistent with the
execution-phase rules. None should be bundled with #548.

---

_Agent A — Repository & Integration Auditor | Execution phase, Milestone 1_
