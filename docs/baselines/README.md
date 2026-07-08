# Memory Baselines (frozen)

> One row per captured baseline. **Never edit or overwrite a baseline file** —
> each run is a new `baseline-<timestamp>.{json,md}`. This ledger is permanent.
> Protocol: `docs/M11D_BASELINE_PROTOCOL.md`.

| Date    | Dataset | Mode | Commit | Embedding              | Extraction  | Retrieval recall | Hit rate | Halluc. | Tokens | Cost | Shadow agreement | Gates | File                                                             |
| ------- | ------- | ---- | ------ | ---------------------- | ----------- | ---------------- | -------- | ------- | ------ | ---- | ---------------- | ----- | ---------------------------------------------------------------- |
| PENDING | m11d-v1 | live | —      | text-embedding-3-small | gpt-4o-mini | —                | —        | —       | —      | —    | —                | —     | _(awaiting a run with OPENAI_API_KEY + running Qdrant/Postgres)_ |

## How rows are produced

1. Run `pnpm tsx scripts/memory-baseline.mts` with the live stack + key (see protocol).
2. The script writes `baseline-<timestamp>.{json,md}` into this directory.
3. Add one row here with the headline numbers and the file name. Commit unchanged.

## Why PENDING

The M11d baseline harness (`packages/ai/src/eval/baseline-runner.ts`) is built and
verified offline with deterministic fakes (see `baseline-runner.test.ts`). The
first LIVE capture requires a running Docker daemon (Postgres+pgvector, Qdrant)
and a real `OPENAI_API_KEY`, which were not available in the build environment.
No numbers are fabricated. Run the protocol recipe to fill this row.
