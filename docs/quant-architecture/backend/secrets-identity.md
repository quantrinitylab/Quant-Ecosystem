# M19 — Secrets & Workload Identity

## Rules
- no credentials in Git
- no long-lived provider keys in application containers where avoidable
- workloads receive scoped identities
- secrets are injected at runtime
- rotation is automated or operationally bounded
- access is audited

## Separation
Application identity, database identity, mail-provider identity, object-storage identity, and deployment identity are distinct.

## Emergency
Compromised credentials can be revoked without rebuilding unrelated services.

Secret values must never appear in logs, traces, crash reports, metrics, or client responses.
