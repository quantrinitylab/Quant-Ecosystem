# Production Terraform safety boundary

This Terraform root is **fail-closed** while issue #129 is open.

## Why it is blocked

The legacy topology currently contains unconditional secondary-region resources, six NAT gateways across two regions, oversized EKS/RDS/Redis defaults, stale `quant.app` references, and Route53 application failover records even though Cloudflare owns public DNS.

## Non-negotiable production invariants

- AWS account: `266176113726` only.
- Closed account `650708167640` must never be targeted.
- Primary region: `us-east-1`.
- Single-region by default; `enable_multi_region = false`.
- Canonical domain: `quantrinity.in`.
- Cloudflare remains authoritative for public application DNS.
- No application DNS cutover until the new origin, smoke tests, rollback, and security gates pass.
- No production apply before an explicit Terraform plan and cost review.

## Required redesign before unblocking

1. Remove unconditional secondary VPC, cross-region RDS, S3 replication, and Route53 failover resources.
2. Replace stale `quant.app` health checks and synthetic endpoints.
3. Use a currently supported EKS version and cost-controlled initial capacity.
4. Reduce NAT, database, and Redis defaults to the approved launch profile.
5. Add automated validation for the account, domain, DNS boundary, region count, and plan.
6. Review the generated plan and expected monthly cost.

`production_root_redesigned` must remain `false` until all requirements above are implemented and reviewed. Do not override it merely to bypass this guard.
