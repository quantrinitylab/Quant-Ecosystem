# QuantMail Backend — Inbox Data Model

## Authoritative tables

### mailboxes
- id
- owner_user_id
- address
- state
- created_at
- updated_at

### threads
- id
- mailbox_id
- canonical_subject
- latest_message_id
- latest_activity_at
- version
- created_at
- updated_at

### messages
- id
- thread_id
- internet_message_id
- sender_identity
- received_at
- body_ref
- header_json
- security_json
- created_at

### thread_participants
- thread_id
- contact_or_identity_id
- role
- first_seen_at
- last_seen_at

### thread_states
- thread_id
- user_id
- is_read
- is_starred
- is_archived
- is_deleted
- version
- updated_at

### thread_labels
- thread_id
- user_id
- label_id
- created_at

## Read projection

mail_thread_list_projection:
- thread_id
- mailbox_id
- user_id
- sender_display
- participant_count
- subject
- snippet
- latest_activity_at
- unread
- starred
- important
- attachment_count
- labels
- context_flags
- projection_version

No full message body is required in the list projection.

## Indexes

Required:
- mailbox/user + activity
- user + unread + activity
- user + starred + activity
- thread + participant
- label membership
- internet message id uniqueness

Cursor fields must have supporting indexes.

## Consistency

1. authorize
2. mutate authoritative state
3. append outbox event
4. commit
5. asynchronously update projections/indexes

Optimistic UI is reconciled with server truth.

## Retention

Differentiate:
- user-visible delete
- provider retention
- legal hold
- security/audit retention

Archive is not physical deletion.
