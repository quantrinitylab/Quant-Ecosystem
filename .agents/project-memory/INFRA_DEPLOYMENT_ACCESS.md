# Infrastructure, Deployment, and Access

## GitHub

- Repository: `quantrinitylabsgo/Quant-Ecosystem`.
- The production-hardening merge sequence completed through `main` commit `09a0a22e9aa5fe288d22987b90a6119a70f7c467`; the evening staging sequence extended it through `82a0af5d4311f048179a16c33de6b6e17e35c6ac` (#139–#142, #147).
- The production deploy workflow is manual-only, exact-main-SHA gated, OIDC-authenticated, digest-pinned, and rollback-aware. `ENABLE_QUANTMAIL_PRODUCTION_DEPLOY` remains disabled.
- The staging deploy workflow (#139) validates the exact current main SHA, requires a green CI gate, builds SHA-tagged images, deploys by digest to `quant-staging`, and rolls back automatically on failure. It is currently blocked by the account-level OIDC federation denial, so the first cycle runs through the EC2 instance role as a documented temporary path.

## AWS live truth

- Active account: `266176113726`. Region: `us-east-1`.
- The connected identity for this memory session is a read-only role; items marked as write-verified come from the separate write-capable session and were cross-posted with evidence in #138.
- Five release repositories exist: `quant-admin`, `quant-quantmail`, `quant-quantchat`, `quant-quantai`, and `quant-ws-gateway`. All five use immutable tags, scan on push, and AES256.
- First image: `quant-quantmail` digest `sha256:bf36e8004d914af5594827fd2a23a86a50fd7fccc9cae66e98d62efdb70db575`, tagged `8b254c1947543559a52ce74f661467cc69b2679f`, pushed 2026-08-07T14:37:06Z (593 MB). The other four repositories remain empty.
- The observed secret inventory contains only `quant/staging/redis/credentials`. Staging application secrets and the production Cloudflare paths are absent; provisioning them is the critical path.
- GitHub OIDC provider `token.actions.githubusercontent.com` and role `quant-gha-deploy` exist (write-verified). `sts:AssumeRoleWithWebIdentity` is denied account-wide while AWS account verification is pending; Bedrock and CloudShell share the same block. A support case is filed.
- `quant-staging-eks` is ACTIVE (Kubernetes v1.34, two node groups, endpoint public+private, control-plane logging enabled). `quant-production-eks` is intentionally not created yet.
- The failed `quant-github-oidc-deploy` CloudFormation stack was deleted; the stack name is free.

## Merged infrastructure configuration

- #137 replaced active legacy-account references.
- #131 made the unsafe legacy production root unusable.
- #133 added a single-region production v2 root with account/provider/precondition guards and `bootstrap_root_approved=false` by default.
- #134 added a production v2 Helm profile that rejects stale account/domain/region, wildcard origins, mutable tags, and unapproved deployment.
- #139 added the protected staging deployment workflow; #140 made the production Terraform root single-region safe and closed #129; #141 added the OIDC test workflow; #142 fixed the QuantMail Docker build context; #147 replaced the `staging.quant.dev` drift with `staging.quantrinity.in`.
- The planned production cluster name remains `quant-production-eks`; namespace `quant-production`. The staging cluster is `quant-staging-eks`; namespace `quant-staging`.
- The production EKS endpoint is private, so GitHub-hosted runners need an explicitly designed network path.
- Legacy raw manifests under `infra/k8s/` still carry `*-backend:latest` references and stale hosts; they are not the staging path, and the drift is tracked in #148.

## Cloudflare live truth

- Account ID: `9af698848a5edd00e756c3a2c908ec8d`.
- Active zones: `quantrinity.in` and `quantmail.in`.
- Worker scripts: zero.
- QuantAI uses direct Workers AI REST; no Worker script deployment is required. Account-level inference is verified (REST 200 on `@cf/meta/llama-3.2-1b-instruct`); deployed end-to-end awaits secrets and a running backend (#144).
- Merged model contract: `@cf/meta/llama-3.2-1b-instruct`. The authoritative token env var is `CLOUDFLARE_API_TOKEN`.
- Existing `quantrinity.in` wildcard/`www` DNS targets a proxied AWS ELB; `mcp.quantrinity.in` targets the existing MCP host.
- `quantmail.in` retains Titan mail and Amazon SES DKIM records; DMARC remains monitoring-only; SES is in sandbox until the owner requests production access (#145).
- No application DNS cutover occurred.

## Required secure values

Provision values only through an authorized secure path; never commit or paste real values into repository memory:

- `quant-platform/production/CLOUDFLARE_ACCOUNT_ID`;
- `quant-platform/production/CLOUDFLARE_API_TOKEN`;
- staging application secrets (database URL, JWT, app keys) for the `quant-staging` bootstrap;
- `TF_VAR_db_master_username`;
- `TF_VAR_db_master_password`;
- `TF_VAR_redis_auth_token`.

## Safe deployment order

Staging (current):

1. Provision real staging secrets through the authorized write path; never commit or paste values.
2. Confirm the External Secrets operator and `aws-secrets-manager` ClusterSecretStore on `quant-staging-eks`.
3. One-time `helm install` of `infra/helm/quant-platform` with `values-staging.yaml` into `quant-staging`; the release name must yield `quant-platform-staging-*` workloads.
4. Digest-pinned first rollout with captured previous image and rollback on failed rollout status (manual from the EC2 role until OIDC unblocks).
5. Record health, smoke, and rollback evidence before calling staging real.

Production (unchanged gates):

1. AWS account verification complete; OIDC federation proven.
2. Authorized read verifies actual EKS state and supported Kubernetes version; create the production cluster through a reviewed plan.
3. Review the Terraform plan and cost; keep bootstrap approval false until accepted.
4. Rebuild CSI trust for the actual EKS OIDC provider and establish private-endpoint access.
5. Provision real secrets through an approved path.
6. Build, scan, sign, and push immutable-SHA images.
7. Prove migrations, health, TLS, auth cookies, logs, load, cost, and rollback.
8. Enable production deployment and change application DNS only with explicit final approval.

## Never claim

- deployment when only configuration merged;
- a rollout when only an image was pushed;
- production AI when only runtime code/direct inference exists;
- AWS readiness while secrets, staging proof, and account verification are missing;
- EKS absence when the read request was denied;
- a DNS cutover when application records were not changed.
