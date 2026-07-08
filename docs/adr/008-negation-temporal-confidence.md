# ADR-008: Negation, Temporal Precedence, and Confidence (pre-M09 design)

## Status

ACCEPTED (with review refinements — see "Refinements adopted")

## Date

2026-07-08

## Refinements adopted (review)

1. **Retraction via metadata, extractor frozen.** The extractor emits a normal
   candidate carrying `metadata.operation: "retract"` + `metadata.slot`; the
   service interprets it. No new extractor channel, no port change. The future
   LLM extractor emits the same metadata.
2. **Negative facts are STRUCTURED, not natural-language.** Store
   `content: "dog"`, `metadata: { slot: "pet", polarity: "negative" }` — never
   `"has no dog"`. Prevents an embedder/keyword retriever from matching a
   negative fact as if positive. Presentation ("You have no dog") is a separate
   layer. `negative_fact` is therefore a UNARY candidate property (polarity), not
   a pairwise verdict — the pairwise verdict set is 5, not 6.
3. **Richer conflict decisions.** `ConflictDecision` becomes
   `{ existingId, verdict, confidence, reason }` so rule-based and future
   LLM-based resolvers return the same shape and the eval can inspect reasons.
4. **Slot registry over hardcoded rule classes.** `SlotDefinition`
   (`id`, `recallHint`, `conflictKind`, `match`) in a registry; adding a slot
   (education, spouse, phone, email, allergies, citizenship...) needs no resolver
   change.
5. **Confidence stays in `metadata.confidence`** (default 1.0), promoted to a
   column only when the LLM extractor/ensemble/ranking needs it.

Pairwise verdict set (final): `supersedes | contradicts | duplicate | retracts | unrelated`.
A follow-up **Memory Lifecycle ADR** (post-M09) will formalize the
Created→Updated→Superseded→Retracted→Archived→Deleted state machine.

## Context

PR-M08's frontier eval exposed that messy real-world inputs are unsolved. The
next PR (M09) targets negation. But negation is not one behavior — it is several,
and the M07 conflict resolver currently has only four verdicts
(`supersedes | contradicts | duplicate | unrelated`), all of which either retire
an old memory or do nothing. Before adding rules we must define:

1. What each negation form should DO (they differ).
2. How temporal precedence decides the "current" value.
3. How confidence stays future-compatible for the coming LLM extractor.

This ADR fixes those semantics so M09 implements a designed model, not ad-hoc
rules. No code changes here; the frozen memory-port (ADR-005) is untouched. The
`ConflictVerdict` union lives in `memory-conflict.ts` (a PR-M07 addition, not the
frozen contract), so extending it is additive.

## 1. Negation is not always retraction

| Utterance                       | Meaning                           | Verdict                 | Action                                     |
| ------------------------------- | --------------------------------- | ----------------------- | ------------------------------------------ |
| "I don't live in Patna anymore" | ends a prior fact, no replacement | `retracts`              | archive residence; **store nothing**       |
| "I don't like Rust anymore"     | ends a prior preference           | `retracts`              | archive that preference; store nothing     |
| "I don't have a dog"            | asserts a NEW negative fact       | `negative_fact`         | store "has no dog"; nothing to archive     |
| "I didn't say that"             | conversation-level correction     | `unrelated` (to memory) | no memory op; belongs to ConversationLog   |
| "I never lived in Patna"        | denies a fact ever held           | `contradicts`           | archive the (mistaken) fact; store nothing |
| "I moved to Bangalore"          | replaces a prior fact             | `supersedes`            | archive old; **store new**                 |

### Decision — expand the verdict taxonomy

```
duplicate | supersedes | contradicts | retracts | negative_fact | unrelated
```

New verdicts and their service action:

- **`retracts`** — archive the matched existing memory; do NOT store a new one.
  (This is the key gap: today "no replacement" negations have no path — the
  resolver only knows verdicts that either replace or ignore.)
- **`negative_fact`** — store a new memory whose content encodes the negation
  (e.g. `has no dog`); do not archive anything. A negative fact is still a fact.

`DefaultMemoryService.persist` gains two branches; `supersedes`/`contradicts`
keep today's behavior. `retracts` requires the resolver to identify WHICH
existing memory is ended even though the new candidate is not itself storable —
so the resolver must run against a "retraction intent" extracted from the turn,
not only against a storable candidate.

### Consequence for extraction

The extractor must emit **retraction intents**, not just facts. A turn like
"I don't live in Patna anymore" produces no storable fact but DOES produce a
signal `{ retract: residence, value?: patna }`. This is a new extractor output
shape. Options for M09:

- (a) A `NegationExtractor` unit that returns a tagged intent in `metadata`
  (e.g. `{ intent: 'retract', slot: 'residence' }`) on an otherwise content-less
  candidate the service interprets, or
- (b) A dedicated `retractions` channel from `MemoryExtractor`.
  Recommendation: **(a)** for M09 (no port change — ride the existing candidate +
  metadata), revisit (b) only if it proves awkward.

## 2. Temporal precedence

Single-valued slots (residence, employer, favourite:X) resolve to ONE current
value. Precedence rules:

1. **Assertion recency wins.** The most recently _asserted_ value is current.
   `Patna → Bangalore` ⇒ Bangalore.
2. **Transient statements do NOT change current state.** Markers like
   "visiting", "this week", "for now", "temporarily", "on a trip to" produce an
   `episodic` memory, NOT a residence update. "I'm visiting Patna this week"
   after living in Bangalore ⇒ residence stays Bangalore.
3. **Departure verbs retract without replacing.** "I left/quit/resigned from
   Google" ⇒ `retracts` employer; it does not assert a new employer. A later
   "I joined OpenAI" then sets it.

### Decision

Add transient-marker detection and departure-verb detection to the slot rules.
A `SlotRule` may classify a match as `current`, `transient`, or `departure`.
Only `current` participates in supersede/duplicate; `transient` routes to
episodic (no conflict); `departure` emits `retracts`.

This keeps precedence in the RULE layer (data-driven), not in the service.

## 3. Confidence (future-proofing, not implemented in M09)

Today rules are deterministic (confidence = 1.0). The coming LLM extractor will
produce hedged facts: "Looks like I might move to Bangalore" (≈0.35). Design so
this slots in without a rewrite:

- **Storage:** carry confidence in `MemoryRecord.metadata.confidence` for now
  (JSONB, no migration). Promote to a first-class `memory_records.confidence`
  column via an ADDITIVE migration only when ranking/gating actually reads it
  (likely alongside the LLM extractor). No column added in M09.
- **Retrieval:** `RetrievedMemory.confidence` already exists (frozen port) — no
  change needed.
- **Conflict rules:** a low-confidence candidate must NOT supersede a
  high-confidence fact. When confidence lands, the resolver gains a guard:
  supersede only if `candidate.confidence ≥ existing.confidence − ε`. Until then,
  everything is 1.0 and the guard is a no-op.
- **Ranking:** confidence becomes a future term in the hybrid score
  (`RetrievalWeights`), added only when the eval shows it helps.

### Decision

Reserve `metadata.confidence` as the agreed location; default 1.0 for
deterministic rules; do not add a column or ranking term in M09. Documented so
the LLM extractor (M11) drops in without touching the frozen port.

## Options Considered (verdict model)

- **A — keep 4 verdicts, force negation into `contradicts`.** Simple, but
  conflates "ended, no replacement" with "replaced", and has no home for
  negative facts. Rejected (bakes in bugs, per the review).
- **B — expand to 6 verdicts with typed retraction intents.** More rules, but
  each negation form maps to correct behavior. **Chosen.**
- **C — defer negation to the LLM extractor entirely.** Punts a common,
  cheaply-ruleable case to an external dependency. Rejected for M09; rules cover
  the frequent forms, LLM handles the long tail later.

## Consequences

- Easier: correct behavior per negation form; temporal correctness for
  transient/departure; a clear confidence path.
- Harder: the extractor must emit retraction intents (new output shape); more
  slot-rule classification.
- New constraint: `retracts` must never store a replacement; `transient` must
  never mutate current state.

## Future Impact

- M09 implements `retracts` + `negative_fact` + transient/departure rules.
- M11 (LLM extractor) produces confidence; the reserved `metadata.confidence`
  and the supersede guard activate then, no migration until a column is justified.

## Complexity Assessment

REDUCES future complexity. Defining the verdict/temporal/confidence model now
prevents a proliferation of special-case negation hacks later, and keeps the
logic in the rule layer behind the existing ports.

---

_Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO — PENDING_
