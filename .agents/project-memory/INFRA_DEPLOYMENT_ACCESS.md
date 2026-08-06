# Infrastructure, Deployment, and Access

## GitHub

- Native connector can read known files, issues, and PRs.
- Write-capable GitHub MCP was reauthenticated successfully on 2026-08-06.
- Dedicated branch `docs/project-memory-continuity-2026-08-06` was created from verified `main`; review and merge remain required.

## AWS

Target direction recorded in current work:

- account `266176113726`;
- region `us-east-1`;
- five release ECR repositories for admin, QuantMail, QuantChat, QuantAI, and ws-gateway.

Current blockers:

- connected identity is restricted/read-only;
- OIDC stack entered rollback;
- named deploy role and deployable EKS are unverified;
- ECR repositories were empty at the audited checkpoint;
- production DNS still targets the old closed-account origin;
- production Terraform root had unsafe always-on multi-region, high-cost, and stale-domain assumptions.

Legacy/stale configuration includes account `650708167640` and `quant.app`; do not deploy it.

## Cloudflare

- `quantrinity.in` and `quantmail.in` are active.
- Direct Workers AI inference returned the expected marker.
- Cloudflare Workers AI is the active provider direction while Bedrock is parked.
- AI Gateway authentication previously failed.
- No application-origin DNS cutover is authorized.

PR #135 isolates the application runtime and fails closed on invalid provider configuration. It remains open/blocked and is not production activation.

## Bedrock

- Model discovery succeeded.
- Invocation returned `AWS_REQUEST_FAILED`.
- Agent state was `NOT_PREPARED` and knowledge base empty.
- Bedrock is not a deployment prerequisite at this checkpoint.

## Figma

- Earlier identity exposed a View seat.
- Full edit-capable execution remains blocked.

## Safe deployment order

1. Land application/security/dependency prerequisites.
2. Confirm target account, region, domains, exact origins, and budget.
3. Provision reviewed single-region OIDC/EKS/platform prerequisites.
4. Store secrets outside Git.
5. Build, scan, sign, and push immutable-SHA images.
6. Deploy staging and run migrations, health, E2E, security, load, and rollback tests.
7. Verify QuantMail cookie behavior through real TLS/origin boundaries.
8. Change application DNS only with explicit owner approval and a tested rollback.

## Never claim

- deployment when only manifests exist;
- production AI when only direct inference succeeds;
- AWS readiness while OIDC/EKS/images are missing;
- a GitHub commit while the write connector returns 401;
- a DNS cutover when application records were not changed.
