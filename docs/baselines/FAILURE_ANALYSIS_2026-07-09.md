# Failure Analysis — Live LLM-Extraction Baseline (2026-07-09)

> M11D_PROTOCOL "Failure analysis" phase: every failure gets exactly ONE cause.
> This analyzes the `live-memory-eval-llm-2026-07-09T17-39-15-165Z.json` run.
> **No fixes are applied here.** Each candidate fix below is a hypothesis for
> the Tuning phase: one change, one rerun, one decision-log row.

## Run configuration (version-frozen)

| Field            | Value                                               |
| ---------------- | --------------------------------------------------- |
| Extraction model | `deepseek.v3.2` (Bedrock OpenAI-compatible gateway) |
| Prompt revision  | `b5a6df97ec7fc046`                                  |
| Policy version   | `v1`                                                |
| Retrieval        | keyword only (variable under test: extraction)      |
| Commit           | `1a54669`                                           |

## Headline numbers (vs rule-extractor reference)

| Config                             | Recall    | Precision  | Hallucinations e2e |
| ---------------------------------- | --------- | ---------- | ------------------ |
| rule extractor (offline reference) | 77.3%     | 95.5%      | 1                  |
| **LLM extractor (this run)**       | **36.4%** | **100.0%** | **0**              |

The LLM run has PERFECT precision and zero hallucinated recalls — and much
lower recall. This is a true baseline doing its job: exposing the real
bottleneck instead of flattering us.

## The single failure cause

**`canonical-content-lexical-mismatch`** — all 14 missed queries share it.

Evidence (diagnostic probe, same config):

```
User turn:      "I live in Patna"
LLM extraction: slot=residence value=Patna  ✅ CORRECT
Stored content: "Patna"                     ← canonicalized bare value
Query:          "Where do I live?"
Query tokens:   [where, do, i, live] → overlap with "Patna": []   ← ZERO
```

The LLM extractor is MORE correct than the rule extractor (it canonicalizes
"I live in Patna" → `residence: Patna`), but the keyword retriever depends on
lexical overlap between query and stored content. The rule extractor
accidentally preserves the overlap by storing raw-ish sentences; the LLM's
better canonicalization destroys it. Scenarios that recall verbatim phrasing
(noise, isolation, negation, departure, hallucination-probes) stayed at 100%.

**Extraction did not fail. Retrieval's lexical assumption failed.**

## Candidate fixes (hypotheses for Tuning phase — pick ONE per experiment)

| #   | Hypothesis                                                                  | Change                                        | Risk                                                                                                            |
| --- | --------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| H1  | Store `"<slot>: <value>"` as content (e.g. `residence: Patna`)              | `mapFactToCandidate` content format           | Slot vocabulary must overlap query wording ("live" vs "residence" still mismatched — likely insufficient alone) |
| H2  | Keyword retriever also matches `metadata.slot` + synonym table              | retriever scoring                             | Grows a hand-made synonym list — bounded but manual                                                             |
| H3  | Semantic retrieval (real embeddings) bridges the gap                        | wire vector layer with a REAL embedding model | Blocked on embedding API access; deterministic BoW does NOT bridge it (verified: same zero overlap)             |
| H4  | Store both: canonical value in metadata, quote/evidence sentence as content | `mapFactToCandidate`                          | Slightly larger rows; keeps keyword path alive AND canonical value                                              |

**Prediction to test first: H4** (cheapest, reversible, keeps both worlds), then
H3 when embedding access exists — H3 is the architecturally-correct answer and
exactly why the hybrid vector layer was built (ADR-007).

## Discipline note

Per the experiment charter: this baseline is read-only forever. The 36.4% is
not a bug to be ashamed of — it is the measured reason the semantic layer
exists. Every tuning change must cite this document and land as its own row in
`M11D_DECISION_LOG.md`.
