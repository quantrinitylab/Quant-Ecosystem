# M14 Backend — Trust Data Model

## security_assessments

- id
- message_id
- sender_identity_ref
- domain_ref
- decision
- severity
- model_version
- policy_version
- confidence_bucket
- created_at

## reputation_subjects

- subject_type
- subject_key_hash
- reputation_state
- score_bucket
- evidence_count
- updated_at

## quarantine_items

- id
- message_id
- reason_class
- state
- expires_at
- released_at
- released_by

## security_reports

- id
- reporter_ref
- message_ref
- report_type
- outcome
- created_at

Raw message content is not duplicated into reputation tables.
