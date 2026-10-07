# Production v2 Terraform root

## Status: validation-only and fail-closed

This is a fresh single-region root for AWS account `266176113726`. It does not modify, import, or destroy resources represented by the legacy production state. `bootstrap_root_approved` defaults to `false`, so Terraform planning and applying fail until a separate reviewed change explicitly approves the root.

This root must not be used for production traffic yet.

## Fixed safety boundaries

- AWS account: `266176113726` only.
- AWS region: `us-east-1` only during bootstrap.
- Canonical domain: `quantrinity.in`.
- Public DNS authority: Cloudflare; this root creates no Route 53 public records or health checks.
- Multi-region: disabled; there is no secondary provider, VPC, RDS replica, or S3 replication destination.
- EKS endpoint: private.
- Browser origins: explicit HTTPS origins only; wildcard origins are rejected.
- State: no backend block is present. The closed account's state backend must never be reused.

## Bootstrap cost profile

The validation root intentionally starts smaller than the legacy design:

- Three availability zones but one shared NAT gateway.
- Two on-demand system nodes and one Spot application node.
- One PostgreSQL instance with 50 GB initial storage and deletion protection.
- One Redis shard with one replica.
- No secondary region, Route 53 failover, CloudFront distribution, synthetic canaries, or cross-region replication.

These are review inputs, not approved production sizing. Availability, load, recovery objectives, and monthly cost must be reviewed before enabling the root. RDS Multi-AZ is deliberately off in the draft profile and must be explicitly decided before public launch.

## Required inputs

`eks_kubernetes_version` intentionally has no default. Confirm the supported EKS minor in the target account immediately before planning; do not reuse the legacy `1.29` value.

Supply database and Redis credentials only through protected `TF_VAR_*` values. Never put secrets in `terraform.tfvars` or commit them.

The only default browser origin is `https://quantrinity.in`. Add a QuantMail origin only after the actual ingress hostname is selected and verified; do not use `https://*.quantrinity.in`.

## Required approval sequence

1. Keep PR #131's legacy root guard fail-closed.
2. Validate this complete root with `terraform init -backend=false` and `terraform validate`.
3. Provision and verify a new target-account state backend through a separately reviewed bootstrap process.
4. Confirm the EKS minor from authoritative target-account evidence.
5. Produce and review a Terraform plan in account `266176113726`.
6. Review estimated monthly cost, state ownership, destructive actions, data migration, rollback, and recovery objectives.
7. Enable `bootstrap_root_approved` only in a separate reviewed PR.
8. Apply only through protected CI after explicit deployment approval.
9. Validate the AWS origin before any Cloudflare application DNS cutover.

## Migration boundary

Do not point this root at the legacy state file and do not remove legacy stateful resources to make a plan look clean. If target-account resources already exist, inventory them first and use reviewed import/moved-block procedures. Any replacement of RDS, Redis, or S3 requires an explicit data migration and rollback plan.

The production Helm values remain a separate blocker until they use `quantrinity.in`, account `266176113726` ECR images, single-region settings, and a verified ingress origin.
