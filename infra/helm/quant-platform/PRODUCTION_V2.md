# Production v2 Helm profile

## Status: render-validated and deployment-blocked

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
- Triton: disabled in this cost-controlled profile; the approved Cloudflare Workers AI application path still requires repository-level provider wiring and acceptance coverage.

## Why the legacy production values remain unusable

The legacy profile points to a closed AWS account, a stale domain, multi-region failover, mutable image tags, and chart-owned DNS behavior. The new production safety template intentionally prevents that profile from rendering as an approved production release.

## Required sequence before deployment

1. Land and review the Terraform safety stack (#131 and #133).
2. Resolve dependency and repository gates without bypassing policy.
3. Select exact product ingress hostnames and exact browser origins.
4. Build, scan, sign, and push immutable-SHA images to target-account ECR.
5. Verify External Secrets and the private-EKS deployment path.
6. Render and review the exact release manifest and rollback diff.
7. Enable ingress and `global.ingressApproved` in a separate reviewed change.
8. Enable `global.deploymentApproved` only in a protected deployment change.
9. Smoke, E2E, security, load, and rollback-test the AWS origin before any Cloudflare DNS cutover.

No Helm install/upgrade, Kubernetes mutation, image push, AWS provisioning, or DNS change is performed by this profile or its validation workflow.
