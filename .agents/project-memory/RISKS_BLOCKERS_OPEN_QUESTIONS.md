# Risks, Blockers, and Open Questions

## P0 blockers

- Project-memory PR #136 requires current-head memory validation, required CI, secret scanning, review where available, and merge.
- M11D WU4 representative live evidence remains incomplete.
- GitHub OIDC deploy role is absent.
- EKS state/version is unknown to the read identity.
- Production secret paths and immutable images are absent.
- No origin-only staging or rollback proof exists.

## Deployment blockers

- Administrator must deploy the reviewed OIDC template from Issue #127.
- A supported EKS version and actual cluster state must be verified with authorized access.
- The private EKS endpoint needs an approved runner/network path.
- Terraform plan, cost, CSI trust, database/Redis/Cloudflare secrets, images, migrations, health, TLS, security, load, and rollback remain unproven.
- `bootstrap_root_approved` and `ENABLE_QUANTMAIL_PRODUCTION_DEPLOY` must remain false.
- Application DNS cutover remains unauthorized.

## Product blockers

- Real flagship triage/draft/approval/send loop still needs deployed behavioral proof.
- Object-storage upload/download is not fully wired.
- Scheduled delivery is not a durable send contract.
- Session/revoke-all inventory remains unproven.
- Audited issues #108–#122 remain.
- Full QuantMail frontend typecheck debt remains visible.

## Design blockers

- Edit-capable Figma access.
- Final mastermark review.
- Full responsive/state/high-contrast coverage and visual regression.

## Memory/AI blockers

- Live M11D WU4 traffic artifact.
- Embedding-capable provider access for quality evidence.
- 14.3% semantic agreement and five critical divergences keep migration on HOLD.
- Prompt-injection baseline remains an acknowledged gap.
- Workers AI runtime is merged but not production-activated.

## Owner/administrator decisions needed

1. Keep M11D WU4 active, or formally reprioritize the canonical queue.
2. Approve the OIDC deployment path and Terraform plan after account/version/cost verification.
3. Provide real secrets only through a secure authorized channel.
4. Decide the first beta workflow and cohort after staging proof.
5. Decide when to provide edit-capable Figma access.

## Risk controls

| Risk | Impact | Control |
| --- | --- | --- |
| Treat merged config as deployed | Critical | Live cloud reads, deployment run evidence, and explicit state labels |
| Deploy stale account/domain topology | Critical | Fail-closed guards and target-account/origin verification |
| Leak private context or secrets | High | Project-only summaries; no raw transcripts, personal data, or bearer values |
| UI claims exceed capability | High | Source-backed capability-truth audits |
| Broad agent change regresses repository | High | One narrow boundary and current-head CI |
| Wrong memory harms trust | Critical | Precision gates, supersession, human cutover |
| Provider lock-in | High | Adapter contracts, routing, evaluation |
| Priority drift | High | Execution Queue remains the only active-milestone owner |
| Unknown cloud state misreported | High | Preserve `unknown` until authorized verification |
