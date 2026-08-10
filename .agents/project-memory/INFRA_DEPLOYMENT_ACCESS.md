# Infrastructure, Deployment, and Access

## GitHub

- Repository: `quantrinitylabsgo/Quant-Ecosystem`.
- The production-hardening and staging sequence now extends through PR #161, merged as `2e3a3d6b67883156e7cd4991ce0f4b53c3382d4a`.
- The production deploy workflow remains manual-only, exact-main-SHA gated, OIDC-authenticated, digest-pinned, and rollback-aware. `ENABLE_QUANTMAIL_PRODUCTION_DEPLOY` remains disabled.
- GitHub-hosted OIDC is proven by run `31381388221`. The #161 exact-main CI gate passed in run `31400717610`, attempt 2.

## AWS live truth

- Active account: `266176113726`. Region: `us-east-1`.
- The connected identity for this memory session is a read-only role; items marked as write-verified come from the separate write-capable session and were cross-posted with evidence in #138.
- Five release repositories exist: `quant-admin`, `quant-quantmail`, `quant-quantchat`, `quant-quantai`, and `quant-ws-gateway`. All five use immutable tags, scan on push, and AES256.
- The verified QuantMail frontend release is main SHA `2e3a3d6b67883156e7cd4991ce0f4b53c3382d4a`, digest `sha256:b0574a82285f567e04d64f460db3933d847c181a0867f5f2ce372dcef78f0281`.
- GitHub OIDC provider `token.actions.githubusercontent.com` and role `quant-gha-deploy` exist; GitHub-hosted OIDC run `31381388221` passed.
- `quant-staging-eks` is ACTIVE. SSM rollout command `bd0d69a5-c3c9-432d-98a3-f0d607f2a58a` deployed the verified frontend digest to `quant-staging`; internal and external invalid-login smokes returned HTTP 400 JSON. `quant-production-eks` remains intentionally uncreated.
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

1. Treat the #161 digest and login JSON smoke as the established rollback-safe frontend baseline.
2. Merge new feature work only after exact-main CI; build immutable images for every changed runtime.
3. Roll out by digest to `quant-staging`, select the newest Ready pod for smoke, and restore the captured prior digest on failure.
4. Verify authenticated behavior non-destructively before promoting any additional feature-readiness claim.

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
