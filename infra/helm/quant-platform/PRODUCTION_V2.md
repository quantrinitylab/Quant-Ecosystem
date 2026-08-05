# Production v2 Helm profile

## Status: validation-required and deployment-blocked

`values-production-v2.yaml` is the only production profile aligned with the fresh single-region Terraform root. It is not approved for installation or upgrade.

The template guard blocks production rendering unless `global.deploymentApproved=true` is supplied explicitly. The committed value remains `false`; CI overrides it only to validate chart syntax and rendered invariants.

## Fixed boundaries

- AWS account: `266176113726` ECR repositories only.
- Region: `us-east-1` only for the bootstrap profile.
- Domain and issuer: `quantrinity.in` / `https://quantrinity.in`.
- Public DNS: Cloudflare; ExternalDNS annotations are forbidden.
- Multi-region: disabled.
- Browser origins: explicit HTTPS origins only; wildcard origins are rejected.
- Images: every enabled production service requires a 40-character Git SHA tag.
- Ingress: disabled until exact product hostnames, origin health, TLS, and rollback are reviewed.
- AI provider: Cloudflare Workers AI using the reviewed `@cf/meta/llama-3.2-1b-instruct` model and official API endpoint.
- AI behavior: fail closed; no silent provider fallback after Cloudflare is selected.
- Cloudflare credentials: mapped only through External Secrets paths and required before pods may start; no value is committed.
- Triton: disabled in this cost-controlled profile.

## Application dependency

The Workers AI runtime is isolated in draft PR #135. This Helm profile must not be deployed unless that application change is reviewed, green, included in the exact immutable QuantAI image, and validated against the production Secret boundary.

## Why the legacy production values remain unusable

The legacy profile points to a closed AWS account, a stale domain, multi-region failover, mutable image tags, and chart-owned DNS behavior. The new production safety template intentionally prevents that profile from rendering as an approved production release.

## Required sequence before deployment

1. Land and review the Terraform safety stack (#131 and #133).
2. Review and land the dedicated Workers AI application runtime (#135).
3. Resolve dependency and repository gates without bypassing policy.
4. Select exact product ingress hostnames and exact browser origins.
5. Provision the reviewed AWS Secrets Manager paths without committing values.
6. Build, scan, sign, and push immutable-SHA images to target-account ECR.
7. Verify External Secrets and the private-EKS deployment path.
8. Render and review the exact release manifest and rollback diff.
9. Enable ingress and `global.ingressApproved` in a separate reviewed change.
10. Enable `global.deploymentApproved` only in a protected deployment change.
11. Smoke, E2E, security, load, and rollback-test the AWS origin before any Cloudflare DNS cutover.

No Helm install/upgrade, Kubernetes mutation, image push, AWS provisioning, secret value, or DNS change is performed by this profile or its validation workflow.
