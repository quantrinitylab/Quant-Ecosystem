# M13 Backend — Delivery Data Model

## outbound_messages

- id
- draft_id
- message_id
- thread_id
- sender_identity
- state
- attempt_count
- provider_ref
- prepared_at
- submitted_at
- delivered_at
- failed_at
- last_error_class

## recipients

- id
- outbound_message_id
- normalized_address
- delivery_state
- smtp_code
- provider_ref
- last_attempt_at

## delivery_attempts

- id
- outbound_message_id
- attempt
- provider
- started_at
- completed_at
- outcome
- retryable
- response_class

## inbound_messages

- id
- provider_message_ref
- rfc_message_id
- thread_candidate
- accepted_at
- processing_state

Raw provider responses are retained only according to diagnostics/retention policy.
