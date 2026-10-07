# M11 Backend — Admin Data Model

Mail Admin references platform identity records instead of duplicating them.

## mail_domains
- id
- organization_id
- domain
- verification_state
- routing_state
- policy_version
- created_at
- updated_at

## mail_aliases
- id
- organization_id
- mailbox_ref
- alias
- state
- created_at
- updated_at

## mail_groups
- id
- organization_id
- address
- delivery_policy
- state

## mail_policies
- organization_id
- version
- outbound_policy
- inbound_policy
- attachment_policy
- retention_policy_ref
- security_policy_ref
- updated_at

## mail_quotas
- organization_id
- mailbox_ref
- storage_limit
- send_limit
- receive_limit
- updated_at

## admin_audit_refs
- id
- organization_id
- actor_ref
- action
- target_type
- target_ref
- reason
- result
- created_at

Secrets such as DKIM private keys are managed by the security/secret infrastructure, not ordinary admin records.
