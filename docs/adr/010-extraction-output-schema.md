# ADR-010: Extraction Output Schema (pre-M11 contract freeze)

## Status

PROPOSED

## Date

2026-07-08

## Context

M11 introduces LLM extraction. The extraction OUTPUT is the single most important
contract in the memory subsystem: once several extractors exist (rule, GPT,
Claude, local), changing the shape they emit is painful. This ADR freezes that
schema now, before any extraction code is written, so all extractors — present
and future — speak the same language.

The frozen `ExtractionModel` port (ADR-003/M03) is
`extract(input): Promise<MemoryCandidate[]>`, where `MemoryCandidate =
Omit<MemoryRecord,'id'|'createdAt'|'version'>` (a STORABLE record). That stays.
This ADR defines the richer SEMANTIC output an LLM naturally produces and how it
maps onto the storable candidate + metadata (per ADR-008/009).

## Decision — the semantic extraction schema

```
ExtractedFact {
  slot:        string          // 'residence' | 'employer' | 'favourite:language' | ...
  value:       string          // normalized value ('bangalore')
  operation:   'store' | 'retract'
  polarity:    'positive' | 'negative'
  temporal:    'current' | 'transient' | 'past'   // "visiting" | "used to"
  confidence:  number          // 0-1, model-calibrated (ADR-009)
  provenance:  string          // 'llm:<model>' | 'rule' | 'user' | 'import' | 'web'
  subject:     'user' | string // WHO the fact is about — 'user' vs a third party
  evidence:    string          // the source span/quote that justifies the fact
}

ExtractionResult {
  candidates: ExtractedFact[]
  metrics: {
    model:       string
    latencyMs:   number
    tokens:      number
    costUsd:     number
    confidenceCalibration?: number   // filled by eval, not the model
  }
}
```

### `subject` is the anti-hallucination field

The most common LLM memory bug is attributing someone else's / a hypothetical
fact to the user: "My brother lives in Delhi", "I wish I lived in Japan", "My
friend John works at Google". `subject` forces the extractor to state WHO the
fact is about. Only `subject === 'user'` facts become the user's own memories;
others are stored with their subject (or dropped) and NEVER answer first-person
queries. `temporal: 'past'` ("used to be X") and `polarity`/`operation` likewise
prevent stale or negated values from being stored as current.

## Decision — mapping to the storable candidate

An LLM `ExtractedFact` maps to a storable `MemoryCandidate` (frozen port shape)
by folding the semantic fields into `metadata` — the same channel ADR-008/009
already use. No port change:

```
MemoryCandidate {
  content:  value (or a rendered form)      // e.g. 'lives in bangalore'
  kind:     derived from slot family        // fact | preference | ...
  level:    'user' | 'knowledge' | ...
  owner:    subject === 'user' ? userId : (subject-scoped or dropped)
  pinned:   false
  expiresAt:temporal === 'transient' ? soon : null
  metadata: {
    operation, slot, polarity, confidence, provenance, trust,   // ADR-008/009
    subject, evidence, temporal,
    policyVersion, fingerprint                                   // ADR-009
  }
}
```

Rule extractors already emit a subset of this (operation/slot via metadata); they
simply set `confidence=1, provenance='rule', subject='user', temporal='current'`.

## Decision — metrics via an instrumented model (frozen port preserved)

The frozen `ExtractionModel.extract` returns `MemoryCandidate[]`. To carry the
`ExtractionResult.metrics` for the eval WITHOUT changing that port, an optional
extension:

```
InstrumentedExtractionModel extends ExtractionModel {
  extractDetailed(input): Promise<ExtractionResult>
}
```

The plain `extract` remains for the pipeline; `extractDetailed` feeds the eval
(token cost, latency, per-fact confidence). Mirrors how `RetrievalTrace` adds
observability without touching the frozen retriever port.

## Decision — eval additions (implemented in M11)

1. **Hallucination-resistance dataset** — third-person, hypothetical, and
   past-wish statements that must NOT become the user's memory:
   - "My brother lives in Delhi" → not user's residence
   - "I wish I lived in Japan" → not user's residence
   - "My friend John works at Google" → not user's employer
   - "My favorite movie used to be Interstellar" → not a current favorite
     Measures FALSE-POSITIVE extraction — the biggest LLM-memory production risk.
     (Added to the frontier tier now; graduates to core when M11 passes it.)

2. **Three-tier precision** — pinpoints WHERE failures happen:
   - `candidatePrecision` = correct extracted / all extracted (is the LLM noisy?)
   - `acceptancePrecision` = correct accepted / all accepted (is the policy too permissive?)
   - `finalMemoryPrecision` = correct stored / all stored (end-to-end)
     Example readout `91% → 98% → 99.7%` shows the LLM is noisy but the policy
     filters it. Requires the acceptance pipeline (M11), so implemented then.

## Options Considered

- **A — let each extractor define its own output.** Fastest per-extractor, but
  the resolver/service must special-case each. Rejected (contract drift).
- **B — one frozen semantic schema, mapped to the storable candidate.** All
  extractors interchangeable behind the port. **Chosen.**
- **C — change the ExtractionModel port to return ExtractedFact[].** Cleaner
  types but breaks the frozen port and the rule extractors. Rejected — metadata
  mapping achieves the same without a port change.

## Consequences

- Easier: swap/compare extractors; anti-hallucination via `subject`/`temporal`;
  eval measures extraction quality and cost.
- Harder: extractors must populate more fields; a mapping step from ExtractedFact
  to MemoryCandidate.
- New constraint: only `subject === 'user'` facts become the user's own memories.

## Future Impact

- M11 implements an `InstrumentedExtractionModel` (one provider) + the mapping +
  the two eval additions, then runs the frontier.
- Multiple providers later slot in behind the same schema; the eval compares them
  on candidate/acceptance/final precision, hallucination rate, cost, latency.

## Complexity Assessment

REDUCES future complexity. Freezing the extraction contract before multiple
extractors exist prevents the most expensive kind of late refactor, and the
`subject`/`temporal` fields address hallucination structurally rather than with
post-hoc filters.

---

_Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO — PENDING_
