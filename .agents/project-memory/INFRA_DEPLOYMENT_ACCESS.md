# Infrastructure, Deployment, and Access

## GitHub

- Repository: `quantrinitylabsgo/Quant-Ecosystem`.
- The production-hardening merge sequence is complete through `main` commit `09a0a22e9aa5fe288d22987b90a6119a70f7c467`.
- The project-memory refresh is documentation-only and records that merged baseline.
- The deploy workflow is manual-only, exact-main-SHA gated, OIDC-authenticated, digest-pinned, and rollback-aware. `ENABLE_QUANTMAIL_PRODUCTION_DEPLOY` remains disabled.

## AWS live truth

- Active account: `266176113726`.
- Region: `us-east-1`.
- Connected identity is a read-only role.
- Five repositories exist: `quant-admin`, `quant-quantmail`, `quant-quantchat`, `quant-quantai`, and `quant-ws-gateway`.
- All five use immutable tags, scan on push, and AES256; all contain zero images.
- The observed secret inventory contains only `quant/staging/redis/credentials`.
- Required production Cloudflare secret paths are absent.
- GitHub OIDC deploy role `quant-github-oidc-deploy` is absent.
- EKS cluster state is unknown because the connected role cannot call `DescribeCluster`; permission denial does not prove absence.

## Merged infrastructure configuration

- #137 replaced active legacy-account references.
- #131 made the unsafe legacy production root unusable.
- #133 added a single-region production v2 root with account/provider/precondition guards and `bootstrap_root_approved=false` by default.
- #134 added a production v2 Helm profile that rejects stale account/domain/region, wildcard origins, mutable tags, and unapproved deployment.
- The planned cluster name remains `quant-production-eks`; namespace `quant-production`.
- The EKS endpoint is private, so GitHub-hosted runners need an explicitly designed network path.

## Cloudflare live truth

- Account ID: `9af698848a5edd00e756c3a2c908ec8d`.
- Active zones: `quantrinity.in` and `quantmail.in`.
- Worker scripts: zero.
- QuantAI uses direct Workers AI REST; no Worker script deployment is required.
- Merged model contract: `@cf/meta/llama-3.2-1b-instruct`.
- Existing `quantrinity.in` wildcard/`www` DNS targets a proxied AWS ELB; `mcp.quantrinity.in` targets the existing MCP host.
- `quantmail.in` retains Titan mail and Amazon SES DKIM records; DMARC remains monitoring-only.
- No application DNS cutover occurred.

## Required secure values

Provision values only through an authorized secure path; never commit or paste real values into repository memory:

- `quant-platform/production/CLOUDFLARE_ACCOUNT_ID`;
- `quant-platform/production/CLOUDFLARE_API_TOKEN`;
- `TF_VAR_db_master_username`;
- `TF_VAR_db_master_password`;
- `TF_VAR_redis_auth_token`.

## Safe deployment order

1. Administrator deploys the reviewed OIDC template from Issue #127.
2. Authorized read verifies actual EKS state and supported Kubernetes version.
3. Review the Terraform plan and cost; keep bootstrap approval false until accepted.
4. Rebuild CSI trust for the actual EKS OIDC provider and establish private-endpoint access.
5. Provision real secrets through an approved path.
6. Build, scan, sign, and push immutable-SHA images.
7. Deploy staging and prove migrations, health, TLS, auth cookies, logs, load, cost, and rollback.
8. Enable production deployment and change application DNS only with explicit final approval.

## Never claim

- deployment when only configuration merged;
- production AI when only runtime code/direct inference exists;
- AWS readiness while OIDC, authorized EKS proof, images, and secrets are missing;
- EKS absence when the read request was denied;
- a DNS cutover when application records were not changed.
