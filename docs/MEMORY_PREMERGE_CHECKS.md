# Memory v1 — Pre-Merge Review Checks (PR #548)

Results for the four reviewer-requested manual checks. Three are verified by
`memory-premerge-checks.test.ts` (in CI); the fourth is M11d (post-merge).

## 1. Replay determinism — VERIFIED

- Audited the decision path: `MemoryAcceptancePolicy.decide`, `replay`,
  `diffPolicies` contain **no** `Date.now`, `Math.random`, or `Map` iteration.
- `calibrationByProvenance` sorts its output (stable).
- Test: 5 repeated `replay()` runs produce **byte-identical** JSON; a decision is
  independent of `ReplayRecord.at`.
- Conclusion: same input → identical output across runs/machines.

## 2. Policy-version migration (mixed v1/v2) — VERIFIED

- Each stored memory records its `metadata.policyVersion`; each `ReplayRecord`
  keeps the original `decision.policyVersion`.
- `diffPolicies(v1, v2)` recomputes decisions under the new policy and reports the
  per-transition delta (e.g. `store_pending -> store_active : 2` when activate
  drops 0.70→0.50).
- A mixed batch (some v1-decided, some v2-decided records) replays deterministically
  under v2.
- Conclusion: production keeps the version that decided each memory; replay can
  evaluate any batch under any policy version. No implicit rewrite.

## 3. Performance baseline — RECORDED

In-memory (fakes), representative not absolute — the guardrail is regression
detection, not production numbers (those come from M11d with live Postgres/Qdrant).

| Operation                                | Baseline      | CI upper bound |
| ---------------------------------------- | ------------- | -------------- |
| `observe` (extract→resolve→policy→store) | ~0.33 ms/turn | < 50 ms        |
| `recall`                                 | < 1 ms        | < 500 ms       |
| `replay` (1000 decisions)                | < 1 ms        | < 500 ms       |

Loose bounds avoid flakiness while catching catastrophic regressions. Real latency
(network + DB + vector + LLM) is measured in M11d.

## 4. Live service smoke test — DEFERRED to M11d

Requires a real `OPENAI_API_KEY` and a running Qdrant (docker-compose dev stack),
which are not available in CI. Adapters are contract-tested with fake `fetch`;
end-to-end sanity against live services is the first task of the M11d branch.

## Summary

Checks 1–3 pass in CI (`memory-premerge-checks.test.ts`, 5 tests). Check 4 is the
opening task of M11d. No architectural blocker to merging PR #548.
