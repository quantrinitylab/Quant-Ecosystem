# QuantMail Backend — Compose Data Model

## drafts

- id
- mailbox_id
- owner_user_id
- thread_id
- from_identity
- subject
- body_ref
- state
- version
- created_at
- updated_at
- discarded_at
- sent_at

## draft_recipients

- draft_id
- normalized_address
- display_name
- recipient_type
- contact_id nullable

## draft_attachments

- draft_id
- object_ref
- filename
- mime_type
- byte_size
- scan_state
- upload_state

## send_preparations

- id
- draft_id
- draft_version
- expires_at
- policy_snapshot_ref
- recipient_summary
- confirmation_requirement
- created_at

Preparation is ephemeral authorization material, not the source of truth for the draft.

## Concurrency

Use optimistic versioning.
A stale compose window must not silently overwrite a newer draft.
