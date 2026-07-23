# M11d WU5 rollback and release-gate runbook

## Status and authority

This is candidate WU5 tooling while WU4 remains active and credential-blocked. It does not complete WU5, approve a mode transition, or alter the migration scoreboard. Production remains `legacy`; runtime and deployment policy reject `new`.

## Static preflight

```powershell
pnpm m11d:wu5:release-gate
pnpm test:wu5:policy
pnpm --filter @quant/quantai exec vitest run backend/__tests__/memory-facade.service.test.ts
```

The gate requires:

- exactly one literal `QUANTAI_MEMORY_MODE` in the production QuantAI backend manifest;
- production mode `legacy` while ADR-011 remains HOLD;
- no `valueFrom`, interpolation, YAML anchor, duplicate, blank, or non-canonical value;
- a shadow Compose overlay with explicit operator input and no default;
- the production deploy workflow to finish this preflight before AWS credentials, ECR push, or EKS rollout.

## Canary operation

Set `QUANTAI_MEMORY_MODE=shadow` explicitly only for a reviewed WU4 synthetic-traffic run. Omitting the variable makes the overlay fail before container startup. Never use a real user or production tenant for rollback evidence.

## Operational rollback proof still required

After reviewed WU4 evidence exists, run the ordered cycle against real PostgreSQL and Qdrant:

1. Start `legacy`; record readiness and served-result hash.
2. Restart into `dual_write`; confirm legacy output remains authoritative.
3. Restart into `shadow`; confirm durable tenant-scoped report creation.
4. Inject a new-path dependency failure; confirm legacy output remains unchanged.
5. Restart through `dual_write` to `legacy`; measure recovery time and verify readiness.
6. Confirm `new` is rejected at runtime and deployment preflight.

Archive the commit SHA, image digest, transition timestamps, synthetic actor hash, served-result hashes, report IDs/counts, isolation result, failure-injection result, and rollback duration under `docs/baselines/`. Do not fabricate an approver; protected-environment review supplies human approval.

## Deployment behavior

`.github/workflows/deploy.yml` runs `memory-release-preflight` without cloud credentials. Every production matrix deployment has `needs: memory-release-preflight`; a failure prevents AWS authentication and all image pushes/rollouts. A protected GitHub `production` Environment remains an operator configuration task and is not claimed by this repository change.

## Completion boundary

WU5 can move to active/done only after WU4 is completed in order, the real restart/failure rollback artifact is reviewed, final-SHA CI is green, and the protected production approval path is verified. Until then the decision remains **HOLD**.
