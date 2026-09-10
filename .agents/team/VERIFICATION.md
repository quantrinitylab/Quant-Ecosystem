# Team-kit verification

## Executed locally

- Runtime: Node v24.14.1.
- Real native Node test cases: **32/32 passed** using the actual coordination module.
- Positive task-validation CLI: passed against the included blocked checkpoint.
- Negative CLI: unknown field rejected with exit 1.
- Plan CLI: produced an inspectable synthetic claim proposal; no GitHub update was sent.
- Internal kit Markdown links, syntax, JSON and formatting checked locally.

Coverage includes claim conflicts, scope checks, read-only work, expiry, handoff generations, stale workers, reconciled heads, meaningful checkpoints, quota/budget holds, malformed identifiers/dates/URLs, JSON persistence and a simulated task-record compare-and-swap conflict.

## Correction verified

A negative CLI check caught a symlinked-entrypoint no-op: malformed input incorrectly exited 0 because the CLI had not started. Realpath-aware entrypoint detection now fixes that case, with positive/negative symlinked CLI regression tests. This was corrected before any GitHub source write.

## Not established

No Node 22 execution, full repository install/build, pnpm memory:validate, installed QuantMail/Vitest run, real concurrent GitHub CAS integration, source-write broker, platform permission isolation, live agent handoff, scheduler or enforced billing budget was tested or deployed. The CAS case is an in-memory transport model. Local unit success is not production or full-repository acceptance. No workflow or dependency was changed to make these tests pass; this new test command is not wired into CI by this change.

The kit adds coordination context; it does not fix #238's unknown test failure or apply the earlier reporter/JSX proposals. Review required before enabling any live runtime.
