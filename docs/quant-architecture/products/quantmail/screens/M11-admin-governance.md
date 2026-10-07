# M11 — QuantMail Admin & Governance

Status: SPEC_COMPLETE_TARGET
Priority: P0

## Principle

QuantMail Admin is product-owned governance, not a global god-admin.

## Areas

- Overview
- Organization/mailbox management
- Domains
- Aliases
- Groups
- Roles
- Mail policies
- Retention
- Quotas
- Delivery/security
- Abuse & moderation
- Audit
- Integrations
- Data export/compliance
- Service health

## Ownership

Mail Admin owns mail policy and mail-domain operations.
Identity owns authentication and identity lifecycle.
Organization platform owns organization membership and global role assignment.
Security owns platform security policy.
Economy owns billing/credits.
Drive owns storage policy.

Admin UI may aggregate status but must route mutations to the owning domain.

## Role model

- Org Owner
- Org Admin
- Mail Admin
- Mail Security Admin
- Compliance Admin
- Support Operator
- Read-only Auditor

Roles are capability bundles, not arbitrary UI access.

## Safety

Destructive or broad operations require:
- explicit scope
- impact preview
- confirmation
- optional step-up authentication
- audit record

Bulk operations expose affected-object counts before execution.
