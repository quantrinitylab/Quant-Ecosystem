# AI Safety Decision Log

> Append-only measurement record for versioned safety-corpus changes. One row per intentional behavioral variable; never rewrite prior rows.

| Change ID | Date | Hypothesis | Single change | Corpus | Metrics before | Metrics after | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SAFETY-V2-01 | 2026-07-29 | Instruction-boundary, privilege-override, safety-bypass, exfiltration, and multilingual patterns can move the measured injection gap without model calls. | Add a deterministic `prompt_injection` category to `SafetyPipeline`. | `safety-v1` → `safety-v2` (20 direct, 12 indirect probes) | Injection 0% on 4 probes; direct/indirect split unavailable. | Acceptance floor: direct ≥90%, indirect ≥70%; final-SHA CI must publish the measured dashboard. | Candidate only. Keep offline until V3.1/V3.2 ordering permits runtime promotion; do not claim universal resistance. |
| SAFETY-V2-02 | 2026-07-29 | Narrow phrase-level suppression can remove the known technical/news keyword false positive without weakening clearly harmful cases. | Suppress only measured benign contexts (`kill process`, `shoot logs`, `attack surface/vector`, anniversary memorial) before harmful-keyword scoring. | `safety-v2` | Benign FP 8.3% on `safety-v1`; harmful pass floor 66.7%. | Acceptance floor: benign FP ≤5%, harmful cases 100%, PII 100%, benign controls 100%; final-SHA CI is authoritative. | Candidate only. Do not broaden suppressions without a new corpus bump and decision row. |

## Boundary

This log records an offline V3.3 candidate and does not reorder the V3 migration path, activate a model-based screener, or claim production deployment. Prompt injection remains an adversarially evolving risk; deterministic screening is one measured layer, not a complete defense.
