# QuantMail Backend — Thread Data Model

## Authoritative entities

thread:
- id
- mailbox_id
- subject
- created_at
- latest_message_id
- version

message:
- id
- thread_id
- internet_message_id
- direction
- sender
- recipients
- received_at
- provider_headers
- body_ref
- security_classification
- created_at

message_recipients:
- message_id
- identity
- recipient_type

attachment:
- id
- message_id
- object_ref
- filename
- mime_type
- byte_size
- scan_state
- created_at

## Body storage

Body content is stored separately from thread summary/projection data.

The thread API can return metadata first, then retrieve body representation as needed.

This avoids loading every full body before initial paint.

## Security classification

Each message can carry:
- normal
- external_sender
- suspicious
- blocked_content

Classification is a security signal, not a replacement for human judgment.

## Data retention

Message deletion and attachment deletion follow product retention policy, legal hold, provider behavior and audit requirements.
