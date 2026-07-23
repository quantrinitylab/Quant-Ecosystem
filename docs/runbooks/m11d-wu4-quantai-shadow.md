# M11d WU4 QuantAI shadow traffic runbook

## Purpose

Run the immutable `real-conv-v1` corpus through one authenticated QuantAI shadow surface, persist exactly 500 PostgreSQL reports, replay every divergence, and emit append-only report/JSONL artifacts. This run never changes retrieval behavior, acceptance policy, or Memory V2 authority.

## Safety boundary

- Use a dedicated synthetic actor whose ID starts with `wu4-` or `wu4_`; never run against a real user.
- The actor must have zero existing memory records and shadow reports.
- `legacy` remains the served result. `new` remains blocked.
- The command performs 500 live recalls and can consume provider quota. It requires `WU4_CONFIRM_500=YES`.
- The runner permits only the selected, newly generated version-freeze file as an untracked change; every other staged, modified, or untracked path fails closed.
- Tokens and actor IDs are not written to artifacts. The actor scope is SHA-256 pseudonymized.
- Pending agreement is not measured in WU4, so output is always `HOLD_PENDING_WU5`.

## Preconditions

1. PostgreSQL migrations, Qdrant, and QuantAI are running.
2. QuantAI starts with `QUANTAI_MEMORY_MODE=shadow`, real DB/vector dependencies, and the same commit/policy/corpus metadata used below.
3. Create a dedicated synthetic identity and short-lived bearer token.
4. Commit the runner first; the version freeze and run both refuse a dirty tree.

## Freeze

```powershell
$env:QUANT_COMMIT_SHA = (git rev-parse HEAD).Trim()
$env:MEMORY_POLICY_VERSION = '<policy-version>'
$env:MEMORY_CORPUS_VERSION = 'real-conv-v1'
node scripts/m11d-version-freeze.mjs
```

Set `WU4_FREEZE_FILE` to the new file under `docs/baselines/`. Do not edit or reuse a freeze from another commit.

## Plan-only smoke check

```powershell
pnpm m11d:wu4 -- --plan
```

This performs no network or database writes. It must report `real-conv-v1`, all representative scenarios, and exactly 500 recalls.

## Execute

```powershell
$env:DATABASE_URL = '<postgres-url>'
$env:WU4_MEMORY_BASE_URL = 'https://<quantai-host>/memory'
$env:WU4_AUTH_TOKEN = '<short-lived-synthetic-actor-token>'
$env:WU4_ACTOR_ID = 'wu4-<unique-run-id>'
$env:WU4_FREEZE_FILE = 'docs/baselines/version-freeze-<timestamp>.json'
$env:WU4_CONFIRM_500 = 'YES'
pnpm m11d:wu4
```

The runner checks full SHA, the single allowed untracked freeze, frozen metadata, HTTPS (localhost HTTP only), shadow mode, empty synthetic scope, exact report count, tenant boundary, denormalized columns, and replay reproducibility.

## Outputs and acceptance

Commit the generated `*.report.v1.json`, `*.replay.v1.jsonl`, and version-freeze JSON together. The report must show 500 requested/persisted/reproducible records, all corpus scenarios, no mixed metadata, and `HOLD_PENDING_WU5`. Never update `MIGRATION_SCOREBOARD.md` or mark WU4 done until final-SHA CI and reviewed evidence exist.
