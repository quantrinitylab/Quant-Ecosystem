# M19 — Release, Canary & Rollback

## Release stages
Build immutable artifact → test → deploy staging → smoke/contract tests → production canary → progressive rollout → completion verification.

## Canary signals
Monitor latency, errors, saturation, queue age, delivery failures, search errors, realtime disconnects, and security signals.

## Rollback
Rollback application artifacts when behavior regresses. Database changes must use backward-compatible expand/contract migrations so application rollback remains possible.

## Stop conditions
Automated or operator-approved halt on severe error, latency, saturation, data-integrity, security, or delivery regression.

A successful deployment means verified service health, not merely that pods became Ready.
