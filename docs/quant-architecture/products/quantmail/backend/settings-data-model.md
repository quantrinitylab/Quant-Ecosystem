# M10 Backend — Settings Data Model

Settings remain in owning domain tables.

## Platform metadata

settings_registry:
- setting_id
- owner_domain
- scope
- value_type
- sensitivity
- validation_schema
- propagation_mode
- audit_required

## Example domain-owned values

Mail:
- signature
- alias
- send_default
- thread_behavior
- label_preferences

Attention:
- channel preferences
- quiet hours
- batching

Quanty:
- AI assistance level
- memory policy
- approval policy
- model preferences

Identity:
- profile
- authentication policy
- session/device state

No credentials, secrets or raw authentication factors are stored in generic settings records.
