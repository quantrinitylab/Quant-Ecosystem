# Memory Subsystem — Post-v1 Roadmap (review-driven)

> Captures the production-hardening backlog from the pre-merge review. v1
> (PR #548) is architecture-complete and implementation-ready; these items make
> it production-ready under real workloads. Ordered by the agreed priority.
> Discipline held throughout: measure first, optimize second.

## Status of review items

| #   | Item                                                                | State                                  | Milestone      |
| --- | ------------------------------------------------------------------- | -------------------------------------- | -------------- |
| 6   | Catastrophic-overwrite benchmark                                    | **DONE** (memory-safety-bench.test.ts) | v1             |
| —   | Live model + Qdrant validation                                      | planned                                | M11d           |
| 4   | Retrieval ranking (importance/confidence/verified/personalization)  | planned                                | M12            |
| 7   | Memory importance score                                             | planned                                | M12/importance |
| 3   | Active memory budget (cap/importance/frequency/TTL)                 | planned                                | importance     |
| 8   | Forgetting policy (temporary/session/daily/weekly/permanent/pinned) | planned                                | importance     |
| 5   | Long-conversation eval (500–10k turns; latency/growth/degradation)  | planned                                | stress         |
| 1   | Immutable version chain per memory (v1→v2→v3)                       | planned                                | M-versioning   |
| 2   | Periodic confidence recalibration per extractor                     | planned                                | M13            |
| 9   | Multi-agent extractor consistency benchmark                         | planned                                | M-multiagent   |
| 10  | Explainability API (why stored/rejected/pending/superseded)         | planned                                | M13            |

## Milestone detail

### M11d — Real-world validation (next)

Bring up the dev stack (Postgres+pgvector, Qdrant), configure a real
`OPENAI_API_KEY`, run the frontier datasets through the live `LlmExtractionModel`,
and capture baseline metrics (candidate/final precision, recall, hallucination,
ECE/Brier, tokens, cost, latency) via the existing eval + replay framework.
**Document results before any tuning.**

### M12 — Hybrid retrieval + ranking (#4)

Extend the retrieval score beyond vector similarity:
`retrievalScore × importance × confidence × recency × verifiedBoost × personalization`.
Add ranking metrics: **MRR, Recall@k, nDCG**. Reranking stage.

### Importance & forgetting (#3, #7, #8)

- **Importance score** per memory (favorite color ≪ medical allergy ≪ passport).
- **Active budget**: cap Active memories per owner by importance + frequency +
  last-accessed + pinning + TTL; overflow → archived/compacted.
- **Forgetting policy**: temporary / session / daily / weekly / permanent / pinned
  lifetimes; a janitor enforces them (ties into `expiresAt`).
- Likely needs an ADR (importance + retention semantics) before implementation.

### Stress benchmarks (#5)

Synthetic conversations of 500 / 1k / 5k / 10k turns measuring latency, memory
growth, and retrieval degradation at scale (needs live Qdrant for realism).

### M-versioning (#1)

Immutable version chain per logical memory (v1→v2→v3), beyond the current
transition log. The schema already has `logicalId + version` (ADR-006); this
activates true versioned reads/history. ADR update expected.

### M13 — Human feedback + recalibration + explainability (#2, #9, #10)

- **Human feedback loop**: confirm/reject/edit moving Pending → Verified/Rejected;
  feeds calibration and policy tuning.
- **Periodic recalibration**: compare each extractor's stated vs observed accuracy
  (ECE by provenance already computed) and recalibrate confidence.
- **Multi-agent consistency**: benchmark parallel extractors (GPT/local/rule/vision)
  through the conflict resolver + acceptance policy.
- **Explainability API**: per memory — why stored/rejected/pending/superseded, which
  rule/model/confidence/policy. The data already exists in
  `metadata.transitions` + `PolicyDecision`; this exposes it as a queryable API.

### Candidate ADR-011 — Memory Lifecycle & Garbage Collection

Not needed yet; becomes important at million-scale memories. Would cover:

- stale `Pending` cleanup (candidates never confirmed/rejected),
- orphaned subject-scoped memories (`user#subject`) with no live references,
- expired transient memories (TTL sweep beyond query-time filtering),
- vector index compaction (Qdrant points for archived/deleted memories),
- duplicate-cluster merging (near-identical memories collapsed).
  Ties into the existing state machine (archive/pending/rejected/deleted) and the
  forgetting policy. Design-first: write ADR-011 before implementing GC.

## Notes

- Items 1, 3, 7, 8 (and GC/ADR-011) touch persistence/retention semantics → each
  should get an ADR before implementation, consistent with the design-first discipline.
- Items 2, 9, 10 are largely additive on top of existing structured data
  (transitions, PolicyDecision, calibration-by-provenance).
- Production-ready is declared only after M11d + stress benchmarks show the
  architecture delivers under real load.
