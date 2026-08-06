# Risks, Blockers, and Open Questions

## P0 blockers

- Project-memory PR #136 still requires required checks, review, and merge.
- Canonical queue still says M11D WU4 while recent work is concentrated elsewhere.
- PR #130 main gate/full sweep are red and exact failing commands are not available through the current integration.
- PRs #125/#132/#135 inherit the dependency/gate block.
- No review approval is recorded on the open critical PRs.

## Deployment blockers

- OIDC deploy role and EKS are unverified.
- Failed CloudFormation stack requires safe cleanup.
- Images are not verified in target ECR.
- Production Terraform needs single-region/cost/stale-domain remediation.
- Origin health, rollback, TLS, exact CORS origins, and application DNS cutover remain unproven.

## Product blockers

- Real flagship triage/draft/approval/send loop still needs deployed behavioral proof.
- Object-storage upload/download is not fully wired.
- Scheduled delivery is not a durable send contract.
- Session/revoke-all inventory remains unproven.
- Audited issues #108–#122 remain.

## Design blockers

- Edit-capable Figma access.
- Final mastermark review.
- Full responsive/state/high-contrast coverage and visual regression.

## Memory/AI blockers

- Live M11D WU4 traffic artifact.
- Embedding-capable provider access for quality evidence.
- 14.3% semantic agreement and five critical divergences keep migration on HOLD.
- Prompt-injection baseline remains an acknowledged gap.
- Cloudflare PR #135 is not merged or activated.

## Owner decisions needed

1. Keep M11D WU4 active, or formally reprioritize the canonical queue to security/deployment.
2. Confirm target account, single region, domains, exact origin list, and infrastructure budget before apply.
3. Confirm Cloudflare Workers AI as the temporary production provider direction while Bedrock is parked.
4. Decide when to provide edit-capable Figma access.
5. Define the first beta workflow and target cohort.

## Risk controls

| Risk                                      | Impact   | Control                                                     |
| ----------------------------------------- | -------- | ----------------------------------------------------------- |
| Merge security stack with red gates       | Critical | No bypass; current-head checks and approval                 |
| Deploy stale account/domain topology      | Critical | Explicit target confirmation and split PRs                  |
| Leak private context in repository memory | High     | Project-only summaries; no raw transcripts or personal data |
| UI claims exceed capability               | High     | Source-backed capability-truth audits                       |
| Broad agent change regresses repository   | High     | One narrow boundary and review-before-merge                 |
| Wrong memory harms trust                  | Critical | Precision gates, supersession, human cutover                |
| Provider lock-in                          | High     | Adapter contracts, routing, evaluation                      |
| Priority drift                            | High     | Execution Queue remains the only active-milestone owner     |
