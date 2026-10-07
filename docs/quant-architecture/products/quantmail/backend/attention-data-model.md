# M09 Backend — Attention Data Model

## attention_items

- id
- user_id
- source_product
- source_type
- source_object_id
- category
- priority
- title
- body
- route_ref
- dedupe_key
- created_at
- read_at
- resolved_at
- dismissed_at
- expires_at

## attention_events

- id
- attention_id
- event_type
- source_event_id
- metadata_hash
- created_at

## notification_preferences

- user_id
- category_policy
- source_policy
- channel_policy
- quiet_hours
- batching_policy
- updated_at

## device_endpoints

- id
- user_id
- platform
- endpoint
- status
- last_seen_at

Sensitive payloads are not stored in device delivery records.
