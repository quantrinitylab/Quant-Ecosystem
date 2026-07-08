# ADR-009: Memory State Machine and Confidence Semantics (pre-M11)

## Status

PROPOSED

## Date

2026-07-08

## Context

M11 introduces the LLM `ExtractionModel` — the first component that produces
**probabilistic** output instead of deterministic rules. Before it exists we must
decide: is an extracted memory trusted enough to overwrite an existing one?
Should uncertain memories be stored, or held pending? Can a user verify/reject a
memory? How does confidence interact with conflict resolution and ranking?

These are cheap to decide now and expensive to change once the extractor writes
to the store. This ADR defines the full memory state machine and confidence
semantics so M11 targets a specification, not invented behavior. No code here;
the frozen memory-port (ADR-005) is untouched — states/confidence ride
`MemoryRecord.metadata` until a column is justified (per ADR-008).

## Decision — the state machine

```
Observed        raw turn (ConversationLog)
   │  extract
   ▼
Extracted       a candidate produced by rules or LLM
   │  admit
   ▼
Candidate       not yet stored; awaiting a store decision
   │
   ├── (confidence ≥ storeThreshold) ─────────────► Active
   │
   └── (confidence < storeThreshold) ─────────────► Pending
                                                      │  verify / confirm
                                                      ▼
                                                    Verified ──► Active

Active (a live, retrievable memory) can transition to:
   ├── Updated      value changed, same slot, new version (immutable append)
   ├── Superseded   replaced by a newer Active memory (ADR-007)
   ├── Retracted    ended with no replacement (ADR-008)
   ├── Archived     soft-hidden from recall, retained for audit
   └── Deleted      hard erase (GDPR)

Verified is terminal-trust: a Verified memory has confidence 1.0 and can only be
changed by another Verified/human action or a Retract/Delete.
```

### State meanings

| State        | Retrievable?         | Meaning                                          |
| ------------ | -------------------- | ------------------------------------------------ |
| `Observed`   | no                   | raw dialogue turn; not a memory                  |
| `Extracted`  | no                   | a candidate emitted by an extractor              |
| `Candidate`  | no                   | admitted, pending a store decision               |
| `Pending`    | no (or low-priority) | stored but low-confidence; needs confirmation    |
| `Verified`   | yes                  | human- or high-trust-confirmed; confidence 1.0   |
| `Active`     | yes                  | live, retrievable memory                         |
| `Updated`    | yes (new version)    | superseded-in-place by a newer version of itself |
| `Superseded` | no                   | replaced by a different Active memory            |
| `Retracted`  | no                   | ended, no replacement                            |
| `Archived`   | no                   | soft-hidden, retained for audit                  |
| `Deleted`    | no                   | hard-erased                                      |

`Superseded`/`Retracted`/`Archived` are all realized today by `archivedAt`
(recall excludes them); the state label lives in `metadata.state` so the _reason_
is queryable and the eval/audit can distinguish them. `Deleted` = row removed.

### Storage mapping (no migration)

- `metadata.state`: one of the labels above (default `active` for rule extractor).
- `metadata.confidence`: number 0-1 (ADR-008).
- `metadata.source`: `'rule' | 'llm:<model>' | 'human' | 'import'`.
- `metadata.observations`: count of times independently observed (for reinforcement).
- `archivedAt` already distinguishes hidden-vs-live; `metadata.state` adds the why.

A first-class `state`/`confidence` column is promoted (additive migration) only
when ranking or gating reads it at query time — likely with M11.

## Decision — confidence semantics

Confidence is the probability the memory is TRUE and CURRENT, in [0,1].

| Source                           | Confidence                              |
| -------------------------------- | --------------------------------------- |
| Rule extractor (deterministic)   | 1.0                                     |
| LLM extractor                    | model-reported / calibrated probability |
| Human confirmation               | 1.0 (→ Verified)                        |
| Imported memories                | configurable (default 0.7)              |
| Repeated independent observation | increases toward 1.0 (reinforcement)    |

### Overwrite / conflict rules (the core safety property)

When a candidate conflicts with an existing memory in the same slot
(ADR-007/008 resolver), the OUTCOME is gated by confidence + recency:

1. A lower-confidence candidate MUST NOT supersede a higher-confidence memory
   unless: `newer timestamp AND same slot AND resolver verdict ∈ {supersedes, contradicts}`
   AND `candidate.confidence ≥ existing.confidence − ε` (ε small, e.g. 0.1).
2. A `Verified` memory (confidence 1.0) can only be changed by another
   `Verified`/human action, or by an explicit `Retract`/`Delete`. An LLM
   candidate never silently overwrites a Verified memory — it goes `Pending`.
3. If the candidate would supersede but fails the confidence guard, it is stored
   as `Pending` (both coexist) and surfaced for confirmation, rather than
   destroying the trusted value.
4. Below `storeThreshold` (default 0.35) a candidate is stored `Pending`, not
   `Active`; it does not pollute normal recall.

These guards are enforced in `DefaultMemoryService.persist` (it already
orchestrates conflict resolution); the resolver stays pure and now returns
`confidence` (ADR-008) which the service compares.

### Retrieval interaction

Confidence becomes a term in the hybrid score (`RetrievalWeights`) — added only
when the eval shows it helps (ADR-007 discipline). `Pending` memories are
excluded from default recall or heavily down-weighted.

## Options Considered

- **A — no state, booleans (`isArchived`, `isDeleted`).** Scattered flags,
  ambiguous combinations, no "why". Rejected.
- **B — explicit state machine + confidence guards.** Clear transitions, safe
  overwrites, auditable reasons, LLM-ready. **Chosen.**
- **C — full event-sourced log of transitions.** Most auditable, but heavier than
  needed now; the immutable-append versioning (ADR-006) already gives history.
  Deferred.

## Consequences

- Easier: LLM extraction has a defined contract; uncertain memories don't corrupt
  trusted ones; user verification has a home; the eval can measure by state.
- Harder: `persist` gains confidence/state logic; more metadata to set correctly.
- New constraints: never overwrite `Verified` with an unverified LLM candidate;
  never `Active`-store below `storeThreshold`.

## Future Impact

- M11 emits candidates with `source='llm:<model>'` + calibrated confidence; the
  guards protect existing trusted memories automatically.
- A later verification UI moves `Pending → Verified`.
- Reinforcement (repeated observation) raises confidence over time.

## Complexity Assessment

REDUCES future complexity. Defining states and overwrite rules before the first
probabilistic writer prevents a class of silent-data-corruption bugs, and keeps
the logic in the service/resolver behind the frozen ports.

---

_Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO — PENDING_
