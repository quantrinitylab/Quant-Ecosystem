# ADR-009: Memory State Machine and Confidence Semantics (pre-M11)

## Status

ACCEPTED (with review refinements — see "Refinements adopted")

## Date

2026-07-08

## Refinements adopted (review)

1. **Acceptance is a service-level POLICY, not resolver logic.** The
   `MemoryConflictResolver` only classifies (same slot? duplicate? supersede?
   contradict? why?). Whether a candidate is accepted/activated/held is a
   `MemoryAcceptancePolicy` the service consults. Pipeline:
   `Extractor → Candidate(+confidence/trust) → ConflictResolver → ConflictDecision → MemoryAcceptancePolicy → Persistence`.
2. **`Pending` never appears in default recall.** Only `Active`/`Verified` are
   recalled. `Pending` is exposed via a future review API
   (`listPending`/`confirm`/`reject`).
3. **`Rejected` is a distinct state.** `Pending` = "we don't know yet";
   `Rejected` = "we know this is wrong" (e.g. user said no). Rejected memories
   are retained (not recalled) so the model can learn from them.
4. **No hardcoded thresholds.** A `MemoryPolicy` object carries
   `{ activate: 0.70, pending: 0.35 }`; the service depends on the policy, not
   numeric constants. Different extractors (OpenAI/Claude/local) can carry
   different calibration.
5. **Confidence ≠ trust ≠ provenance** (see the new section). Prevents a
   high-confidence LLM extraction from overriding explicit user input.

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
Candidate       not yet stored; awaiting an acceptance decision
   │
   ├── (confidence ≥ policy.activate) ────────────► Active
   │
   └── (policy.pending ≤ confidence < activate) ──► Pending
                                                      │  confirm        reject
                                                      ├──► Verified ──► Active
                                                      └──► Rejected  (retained, never recalled)

(confidence < policy.pending) ─────────────────────► dropped (not stored)

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

| State        | Retrievable?         | Meaning                                           |
| ------------ | -------------------- | ------------------------------------------------- |
| `Observed`   | no                   | raw dialogue turn; not a memory                   |
| `Extracted`  | no                   | a candidate emitted by an extractor               |
| `Candidate`  | no                   | admitted, pending a store decision                |
| `Pending`    | no (or low-priority) | stored but low-confidence; needs confirmation     |
| `Verified`   | yes                  | human- or high-trust-confirmed; confidence 1.0    |
| `Active`     | yes                  | live, retrievable memory                          |
| `Updated`    | yes (new version)    | superseded-in-place by a newer version of itself  |
| `Superseded` | no                   | replaced by a different Active memory             |
| `Retracted`  | no                   | ended, no replacement                             |
| `Archived`   | no                   | soft-hidden, retained for audit                   |
| `Rejected`   | no                   | known-wrong (user said no); retained for learning |
| `Deleted`    | no                   | hard-erased                                       |

`Pending` ("don't know yet") and `Rejected` ("known wrong") are deliberately
distinct: rejected memories are kept (not recalled) so future models can learn
from corrections.

`Superseded`/`Retracted`/`Archived`/`Rejected` are all realized today by `archivedAt`
(recall excludes them); the state label lives in `metadata.state` so the _reason_
is queryable and the eval/audit can distinguish them. `Deleted` = row removed.

### Storage mapping (no migration)

- `metadata.state`: one of the labels above (default `active` for rule extractor).
- `metadata.confidence`: number 0-1 (ADR-008).
- `metadata.provenance`: `'rule' | 'llm:<model>' | 'user' | 'import' | 'web'`.
- `metadata.trust`: number 0-1 (source trust; see below).
- `metadata.observations`: count of times independently observed (for reinforcement).
- `archivedAt` already distinguishes hidden-vs-live; `metadata.state` adds the why.

A first-class `state`/`confidence` column is promoted (additive migration) only
when ranking or gating reads it at query time — likely with M11.

## Decision — confidence vs trust vs provenance

Three DISTINCT concepts. Conflating them causes bugs like a confident LLM
overriding an explicit user statement.

| Concept        | Answers                          | Example                                      |
| -------------- | -------------------------------- | -------------------------------------------- |
| **confidence** | How certain is the EXTRACTION?   | LLM 0.98 sure it parsed "lives in Delhi"     |
| **provenance** | WHERE did it come from?          | `user` \| `llm:<model>` \| `rule` \| `web`   |
| **trust**      | How much do we trust the SOURCE? | `user`=1.0, `rule`=1.0, `llm`=0.8, `web`=0.2 |

Overwrite decisions use **effective weight = f(confidence, trust)** (default
`min(confidence, trust)` — a barely-trusted source caps the outcome regardless of
model confidence). So `confidence 0.98 / trust 0.2` (web) cannot override
`confidence 0.55 / trust 1.0` (user typed it).

| Source               | confidence   | trust              | initial state                     |
| -------------------- | ------------ | ------------------ | --------------------------------- |
| Rule extractor       | 1.0          | 1.0                | Active                            |
| LLM extractor        | model-calib. | 0.8 (configurable) | Active if ≥ activate else Pending |
| Human/user           | 1.0          | 1.0                | Active (Verified on confirm)      |
| Import               | source-dep.  | configurable 0.7   | policy                            |
| Repeated observation | ↑ toward 1.0 | unchanged          | reinforcement                     |

Stored in `metadata.confidence`, `metadata.provenance`, `metadata.trust`.

## Decision — MemoryAcceptancePolicy (service-level, not the resolver)

The resolver CLASSIFIES; a `MemoryAcceptancePolicy` decides ACCEPTANCE, so
classification and business policy are separate:

```
Extractor → Candidate(+confidence/trust) → ConflictResolver → ConflictDecision
          → MemoryAcceptancePolicy(candidate, decision, existing) → action → Persistence
```

`MemoryPolicy` config (no hardcoded constants; per-extractor calibration):

```
memory:
  activate: 0.70   # effective weight >= this  -> Active
  pending:  0.35   # [pending, activate) -> Pending; below -> drop
  epsilon:  0.10   # supersede tolerance band
```

Policy emits an action: `store_active | store_pending | supersede | retract |
duplicate_skip | reject | drop`, executed by `DefaultMemoryService.persist`. The
resolver stays a pure classifier returning `{ verdict, confidence, reason }`
(ADR-008) and never reads policy.

## Decision — precedence matrix (existing state × candidate source)

Removes ambiguity for future contributors. "Candidate" is the incoming write;
"Existing" is what is already stored in the same slot.

| Existing | Candidate                     | Result                                          |
| -------- | ----------------------------- | ----------------------------------------------- |
| Verified | rule                          | keep Verified (rule cannot override human)      |
| Verified | llm                           | candidate → Pending (never silently overwrite)  |
| Verified | user/human                    | supersede (human overrides human)               |
| Active   | rule                          | supersede                                       |
| Active   | llm (higher effective weight) | supersede (policy)                              |
| Active   | llm (lower effective weight)  | store Pending (coexist, await confirm)          |
| Pending  | Verified/user                 | Verified wins (replace Pending)                 |
| Pending  | rule                          | rule wins (promote to Active)                   |
| Rejected | any (non-user)                | ignore (do not resurrect a known-wrong memory)  |
| Rejected | user correction               | allow (explicit user overrides prior rejection) |
| (none)   | any ≥ activate                | store Active                                    |
| (none)   | any in [pending, activate)    | store Pending                                   |
| (none)   | any < pending                 | drop                                            |

### Retrieval interaction

Only `Active`/`Verified` participate in default recall. `Pending`/`Rejected` are
excluded (exposed later via `listPending`/`confirm`/`reject`). Effective weight
may become a hybrid-score term (ADR-007) only when the eval shows it helps.

## Decision — policy versioning

`MemoryPolicy` carries a `version` so historical evaluations are reproducible and
we know which policy produced which behavior:

```
MemoryPolicy {
  version: "v1"
  activateThreshold: 0.70
  pendingThreshold:  0.35
  epsilon:           0.10
}
```

Every stored memory records `metadata.policyVersion` at write time. Tuning
thresholds bumps the version; the eval can pin a version to reproduce a run.

## Decision — transition reasons

Every state transition records a STRUCTURED reason in `metadata` (not inferred
from timestamps). Enumerated reasons:

| Transition   | reason (examples)                              |
| ------------ | ---------------------------------------------- |
| → Superseded | `newer_same_slot`                              |
| → Retracted  | `explicit_user_negation`, `employer_departure` |
| → Rejected   | `human_feedback`                               |
| → Pending    | `low_confidence`, `verified_conflict`          |
| → Archived   | `ttl_expired`, `superseded_soft`               |
| → Active     | `above_activate`, `promoted_from_pending`      |

Stored as `metadata.transitions: [{ from, to, reason, at, policyVersion }]`
(append-only), giving a per-memory audit trail without a separate event store.

## Decision — idempotency

LLMs and queues retry; `persist()` must be idempotent. Each candidate carries a
deterministic **fingerprint**:

```
fingerprint = sha1(owner + ':' + slot-or-kind + ':' + normalize(content) + ':' + operation)
```

Stored as `metadata.fingerprint`. Before writing, `persist` checks for a live
memory (Active/Verified/Pending) with the same fingerprint:

- exact fingerprint + same value → `duplicate_skip` (no new row, no transition).
- retry of a retraction whose target is already retracted → no-op.

This makes replays safe: the same candidate twice produces one memory and one
transition history.

## System Invariants

Documentation + future property-based-test targets:

1. A memory has exactly ONE current lifecycle state (`metadata.state`).
2. Only `Active` and `Verified` are returned by default recall.
3. A `Superseded` memory can never become `Active` again (only a NEW version is).
4. `Deleted` is terminal (row removed; no transition out).
5. `Rejected` memories never participate in retrieval.
6. Every transition is append-only in `metadata.transitions` (never rewritten).
7. A `Verified` memory is never overwritten by an unverified candidate.
8. `persist(candidate)` is idempotent by fingerprint.
9. Effective weight below `pendingThreshold` never produces a stored memory.

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

- M11 emits candidates with `provenance='llm:<model>'` + calibrated confidence;
  the guards + precedence matrix protect existing trusted memories automatically.
- M11 also expands the eval with EXTRACTION-quality metrics (extraction
  precision/recall, hallucination rate, average confidence/calibration, token
  cost, latency) so rule vs GPT vs local extractors compare on one benchmark.
- A later verification UI moves `Pending → Verified` / `Rejected`.
- Reinforcement (repeated observation) raises confidence over time.
- The invariants become property-based tests (e.g. fast-check) once M11 lands.

## Complexity Assessment

REDUCES future complexity. Defining states and overwrite rules before the first
probabilistic writer prevents a class of silent-data-corruption bugs, and keeps
the logic in the service/resolver behind the frozen ports.

---

_Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO — ACCEPTED with refinements_
