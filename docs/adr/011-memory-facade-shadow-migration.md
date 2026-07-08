# ADR-011: Memory Facade & Shadow-Mode Migration (M11c)

## Status

ACCEPTED (with review refinements — see "Design constraints")

## Date

2026-07-08

## Success criterion (charter)

> **M11c succeeds when the new memory system can observe real production traffic
> without influencing production behavior.** If that sentence stays true
> throughout implementation, the PR stays disciplined.

## Context

`REPO_INTEGRATION_AUDIT.md` showed the new memory subsystem is wired to nothing;
production AI still runs the old in-memory `ContextManager`/`AIMemoryStore`.
Replacing the old path directly is high-risk: no way to compare, no fast
rollback, and any regression hits users immediately. We need a migration that
gathers production evidence BEFORE cutover.

## Decision

Insert a **`MemoryFacade`** between `AIEngine` and the two implementations, driven
by an explicit mode. Migrate through modes, never by a big-bang replacement.

```
AIEngine
   │
   ▼
MemoryFacade(mode)
   ├── LegacyMemory  (ContextManager / AIMemoryStore)
   └── NewMemory     (createMemoryService → MemoryService)
```

### Modes (config flag, hot-swappable, rollback in seconds)

| Mode         | Write    | Read (authoritative) | New path                     |
| ------------ | -------- | -------------------- | ---------------------------- |
| `legacy`     | legacy   | legacy               | off                          |
| `dual-write` | **both** | legacy               | written, not read            |
| `shadow`     | both     | legacy               | **read silently + compared** |
| `new`        | new      | new                  | authoritative                |
| (final)      | new      | new                  | legacy removed               |

Progression: `legacy → dual-write → shadow → new → (remove legacy)`. Each step is
a config change, reversible instantly.

### Shadow Mode (the evidence engine — M11c)

In `shadow`, every request serves the LEGACY result to the user, runs NewMemory
silently, and emits a `ShadowReport` (never user-visible):

```
ShadowReport {
  requestId
  legacy: { recalled: string[], latencyMs }
  new:    { recalled: string[], pendingCount, latencyMs }
  divergence: { onlyLegacy: string[], onlyNew: string[], agreementRate }
}
```

Aggregated metrics: recall agreement, new-vs-legacy latency delta, Pending rate,
divergence distribution. This is exactly how large systems migrate safely —
production traffic exercises the new path with zero user risk.

### Safety properties

- **Zero user risk**: users always get the legacy (known) result until `new`.
- **Side-by-side evidence** on real traffic, not synthetic datasets.
- **Instant rollback**: flip the mode flag.
- **Consistency check**: `dual-write` divergences are logged (are both stores
  seeing the same writes?).

## Design constraints (review-tightened)

1. **The facade is DUMB — routing only.** No conflict resolution, policy,
   extraction, caching, retries, or heuristics in `MemoryFacade`. Those live
   inside the respective implementations. Otherwise the facade becomes the next
   monolith.
2. **Dual-write is ASYMMETRIC.** The PRIMARY store determines request success;
   the secondary is best-effort. During migration primary = legacy: a NewMemory
   write failure only emits a metric and is swallowed — it never fails the user
   request. After cutover primary = new (legacy optional).
3. **Shadow compares SEMANTICS, not bytes.** Never `a === b`. Compare: same fact
   recalled? same question answered? Pending decisions matched? ranking differ?
   Metrics: Semantic Recall Agreement, Pending Agreement, Top-k Agreement,
   Contradiction Agreement, Latency Delta.
4. **Divergence has SEVERITY.** Classify each mismatch `LOW | MEDIUM | HIGH |
CRITICAL` (e.g. "blue → dark blue" = LOW; "allergy: peanuts → none" =
   CRITICAL). Only HIGH/CRITICAL block migration.
5. **Cutover is gated QUANTITATIVELY** (not "looks good"). All gates must pass:
   - Semantic agreement > 99%
   - Latency delta < 10%
   - Pending agreement > 98%
   - Critical divergences = 0
   - Infrastructure failures = 0

## Implementation constraints (binding for M11c)

1. **The facade is STATELESS.** No caches, pending queues, metrics state, retry
   state, request history, or mutable config inside `MemoryFacade`. Pure
   `request → route → result`. If it accumulates state, it becomes another
   subsystem to migrate. (Metrics are emitted to an injected sink, not held.)
2. **Every mode transition is REVERSIBLE.** Modes form an FSM
   `LEGACY ⇄ DUAL_WRITE ⇄ SHADOW ⇄ NEW`; every forward step has a rollback step.
   No one-way migrations.
3. **Shadow metrics NEVER affect runtime.** Observational only — they cannot
   change routing, policy thresholds, retrieval, acceptance, or retries. A drop in
   agreement records a metric; a HUMAN changes the mode. No automatic feedback loop.
4. **Every HIGH/CRITICAL divergence is REPRODUCIBLE.** Emit a divergence record
   with enough to replay months later: `{ conversationId, turnId, mode,
legacyOutput, newOutput, recallIds, pendingIds, policyVersion, corpusVersion,
timestamp, commitSha }`. One command replays the exact case (reuses the existing
   replay framework).
5. **"Done" is defined before coding** (see below). Nothing beyond it ships in M11c.

## Definition of done (M11c)

- [ ] `MemoryFacade` implemented (stateless, routing-only)
- [ ] All four modes implemented (LEGACY / DUAL_WRITE / SHADOW / NEW)
- [ ] Dual-write verified (asymmetric: primary determines success)
- [ ] Shadow metrics emitted (semantic agreement, pending, top-k, latency delta)
- [ ] Rollback demonstrated (every transition reversible)
- [ ] ADR-compliance tests passing (constraints 1–4 asserted)
- [ ] No production behavior changed (charter sentence holds)

## M11c scope (laser-focused)

**Deliverables (only these):** `MemoryFacade`, mode flag, dual-write, shadow
execution, shadow metrics, ADR-compliance tests.

**Non-goals (explicitly out):** optimization, refactoring, prompt tuning,
retrieval improvements, GC, importance, forgetting. If a change doesn't serve the
charter sentence, it is out of scope.

## Consequences

- Easier: safe cutover; production evidence before commitment; rollback.
- Harder: a facade + comparator to build and test; dual-write cost during
  migration; a config surface for the mode.
- New constraint: shadow reads must be **side-effect-free** for the user path and
  must never throw into the request (new-path errors are swallowed + counted).

## Complexity assessment (Architecture Guardian)

- **Capability added:** risk-free production migration with measurable evidence.
- **Complexity added:** one facade, one comparator, one mode flag, temporary
  dual-write.
- **Worth it?** Yes — the alternative (direct replacement) risks silent memory
  corruption on real users with no rollback. The facade is temporary scaffolding
  removed after cutover.

## Roadmap placement

`PR #548 merge → M11c (facade + dual-write + shadow + metrics) → confidence check →
M11d (live OpenAI/Qdrant baseline on the wired path) → optimization → M12 → M13`.

## Future note — memory schema versioning

Memory records will gain fields over time (e.g. importance, embeddingVersion).
Plan **explicit schema versioning** (`schemaVersion` on `MemoryRecord.metadata`,
readers tolerant of older versions, controlled migrations) so v1 memories stay
readable years later. Not implemented now; tracked as a roadmap item.

---

_Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO — ACCEPTED with refinements_
