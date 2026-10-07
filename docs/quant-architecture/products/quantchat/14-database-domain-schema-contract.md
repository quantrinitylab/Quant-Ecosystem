# QuantChat — PostgreSQL Domain Schema & Persistence Contract

**Status:** Target-state build contract  
**Scope:** C01–C13 durable state, transactional outbox, idempotency, projections and persistence boundaries.

## 1. Persistence laws

1. PostgreSQL is authoritative for durable QuantChat domain state.
2. Redis is for ephemeral/realtime state, never the source of truth for messages, memberships, permissions or financial balances.
3. Kafka/event spine transports facts; it is not a mutable database.
4. Meilisearch/Qdrant are rebuildable projections.
5. Object storage owns bytes; PostgreSQL owns metadata and authorization references.
6. E2EE plaintext is never stored server-side when the conversation mode forbids server plaintext.
7. Every mutable aggregate has an optimistic version.
8. Every externally retried command has an idempotency boundary.
9. Deletion produces durable tombstone/retention state before projections are cleaned.
10. Cross-product records are referenced, not copied.

## 2. PostgreSQL schema namespaces

chat_conversation
chat_message
chat_community
chat_media
chat_call
chat_meeting
chat_search
chat_notification
chat_settings
chat_device
chat_moderation
chat_admin
chat_bot
chat_resource
chat_outbox
chat_idempotency

Platform schemas remain separate for identity, billing/economy, audit, memory and authorization.

## 3. Common column contract

Domain tables should use:
id UUID
tenant_id UUID where tenant-scoped
created_at timestamptz
updated_at timestamptz
version bigint
created_by UUID/reference where applicable

Do not expose sequential database IDs as public resource identifiers.

Use UTC timestamps and server-generated values.

## 4. Conversation schema

chat_conversation.conversation:
id, tenant_id, type, title, avatar_ref, state, created_by, version, created_at, updated_at.

Types:
direct, group, community_linked.

chat_conversation.member:
conversation_id, subject_ref, role, membership_state, joined_at, left_at, mute_until, notification_policy_ref, version.

Constraints:
- unique active membership per conversation/subject
- tenant ownership consistency
- membership transition authorization
- no hard delete for security/audit-sensitive membership history.

chat_conversation.preference:
conversation_id, subject_ref, archived, pinned, muted_until, notification_mode, last_read_cursor, version.

## 5. Message schema

chat_message.message:
id, tenant_id, conversation_id, sender_ref, client_message_id, sequence_key, state, encryption_mode, body_ref, expires_at, deleted_at, version.

For server-readable conversations, body_ref may reference encrypted-at-rest content metadata.

For E2EE:
server stores ciphertext envelope/attachment references only; cryptographic plaintext remains in authorized clients.

chat_message.revision:
id, message_id, editor_ref, revision_number, ciphertext/body_ref, created_at.

chat_message.reaction:
message_id, actor_ref, reaction_key, created_at.

chat_message.receipt:
message_id, subject_ref, state, occurred_at, device_ref.

chat_message.attachment:
id, message_id, object_ref, encrypted, size_bytes, mime_type, checksum, processing_state.

Indexes:
conversation_id + sequence_key
conversation_id + created_at
sender_ref + created_at
expires_at for expiry workers
client_message_id + sender_ref unique.

## 6. Thread schema

chat_message.thread:
id, root_message_id, channel_id nullable, state, participant_count, last_activity_at, version.

chat_message.thread_member:
thread_id, subject_ref, notification_mode, joined_at.

## 7. Community schema

chat_community.community:
id, tenant_id, owner_ref, name, slug, visibility, state, version.

chat_community.space:
id, community_id, name, position, state, version.

chat_community.channel:
id, community_id, space_id nullable, type, name, slug, visibility, state, retention_policy_ref, version.

chat_community.membership:
community_id, subject_ref, state, joined_at, version.

chat_community.role:
id, community_id, name, system_role, version.

chat_community.permission_binding:
id, community_id, channel_id nullable, role_id, capability, effect, condition_ref, version.

chat_community.invitation:
id, community_id, channel_id nullable, inviter_ref, invitee_ref nullable, token_hash, expires_at, state.

Unique constraints prevent duplicate active slugs and duplicate active memberships.

## 8. Media schema

chat_media.asset:
id, tenant_id, owner_ref, object_ref, media_type, encryption_mode, checksum, byte_size, processing_state, moderation_state, created_at, expires_at.

chat_media.edit_graph:
id, asset_id, graph_version, graph_json_ref, renderer_version.

chat_media.story:
id, owner_ref, audience_policy_ref, state, expires_at, version.

chat_media.story_item:
id, story_id, asset_id, position, published_at.

chat_media.spotlight:
id, creator_ref, asset_id, visibility, moderation_state, ranking_state, published_at, version.

chat_media.lens:
id, owner_ref, version, runtime_type, asset_ref, safety_state, publication_state, compatibility_policy_ref.

Never store large binary media in PostgreSQL.

## 9. Call schema

chat_call.call:
id, tenant_id, type, initiator_ref, conversation_id nullable, state, region, sfu_session_ref, started_at, ended_at, version.

chat_call.participant:
call_id, subject_ref, role, state, joined_at, left_at, device_ref.

chat_call.track:
id, call_id, participant_ref, kind, direction, state, codec, quality_state.

chat_call.recording:
id, call_id, consent_state, object_ref nullable, processing_state, retention_policy_ref.

Operational media metrics are time-series/observability data, not a growing relational participant table.

## 10. QuantMeet schema

chat_meeting.meeting:
id, tenant_id, owner_ref, source_conversation_id nullable, calendar_resource_ref nullable, state, scheduled_start, scheduled_end, join_policy, security_policy_ref, version.

chat_meeting.participant:
meeting_id, subject_ref, role, admission_state, joined_at, left_at, device_ref.

chat_meeting.breakout_room:
id, meeting_id, name, state, max_participants, version.

chat_meeting.breakout_membership:
breakout_room_id, subject_ref, state.

chat_meeting.recording:
id, meeting_id, consent_state, object_ref, processing_state, drive_resource_ref, retention_policy_ref.

chat_meeting.artifact:
id, meeting_id, type, resource_ref, generated_by_ref, created_at.

Calendar event ownership stays outside this schema.

## 11. Search projection schema

chat_search.document_projection:
resource_ref, tenant_id, document_type, source_version, authorization_epoch, index_state, deleted_at.

This table tracks projection provenance, not the search content itself.

Every indexed result must be re-authorized at retrieval time for sensitive resources.

## 12. Notification schema

chat_notification.preference:
subject_ref, scope, category, channel, policy_value, version.

chat_notification.intent:
id, tenant_id, recipient_ref, event_ref, category, priority, grouping_key, dedupe_key, state, expires_at.

chat_notification.delivery:
id, intent_id, channel, provider_ref, state, attempt_count, last_error, delivered_at.

C11 owns delivery; C12 owns preference intent.

## 13. Settings schema

chat_settings.privacy_policy:
subject_ref, scope, policy_json_ref, policy_version, effective_at, version.

chat_settings.quanty_grant:
id, subject_ref, capability, resource_scope, risk_tier, approval_mode, expires_at, state, last_used_at, grant_version.

chat_settings.memory_policy:
subject_ref, context_scope, write_mode, retention_mode, version.

chat_settings.connected_app_grant:
id, subject_ref, client_ref, scopes, resource_scope, expires_at, state, version.

Never store provider secrets here.

## 14. Device schema

chat_device.device:
id, subject_ref, platform, app_version, device_label, trust_state, verification_state, created_at, last_seen_at, revoked_at, version.

chat_device.session:
id, device_id, auth_session_ref, state, created_at, last_seen_at, expires_at, revoked_at.

chat_device.verification:
id, device_id, verification_method, state, verified_at, verifier_ref.

Private cryptographic keys remain in secure client/platform key stores.

## 15. Moderation schema

chat_moderation.report:
id, tenant_id, reporter_ref, target_ref, category, evidence_refs, state, created_at.

chat_moderation.case:
id, report_id, target_ref, severity, policy_version, assignment_ref, state, resolution_ref, version.

chat_moderation.enforcement:
id, case_id, target_ref, action, scope, starts_at, ends_at, reason_code, actor_ref, state.

chat_moderation.appeal:
id, enforcement_id, appellant_ref, state, decision_ref, decided_at.

Evidence access is separately authorized and audited.

## 16. Admin schema

chat_admin.role:
id, tenant_id, name, version.

chat_admin.capability_grant:
id, subject_ref, tenant_id, capability, scope_ref, risk_ceiling, expires_at, state.

chat_admin.config:
key, tenant_id nullable, environment, value_ref, schema_version, effective_at, expires_at, version.

chat_admin.feature_flag:
id, key, targeting_policy_ref, state, owner_ref, review_at, version.

chat_admin.incident:
id, severity, state, summary_ref, started_at, resolved_at, version.

Admin audit records belong to the platform audit system; this schema keeps only operational references where required.

## 17. Bot schema

chat_bot.bot:
id, owner_ref, tenant_id, name, state, verification_state, version.

chat_bot.capability_grant:
id, bot_id, capability, resource_scope, rate_limit_ref, expires_at, state.

chat_bot.mini_app:
id, owner_ref, manifest_ref, state, version.

Bots never inherit the owner's administrator token.

## 18. Resource references

chat_resource.reference:
id, resource_type, resource_id, owner_product, tenant_id nullable, authorization_epoch, state, created_at.

Cross-app resources use the canonical QuantResourceRef contract.

A reference becoming revoked must invalidate dependent projections/actions.

## 19. Outbox

chat_outbox.event:
id UUID
tenant_id
aggregate_type
aggregate_id
aggregate_version
event_type
event_version
payload
occurred_at
published_at nullable
attempt_count
next_attempt_at
state.

Transactional rule:
domain mutation and outbox insertion commit in the same PostgreSQL transaction.

Publishers are at-least-once. Consumers must be idempotent.

## 20. Idempotency

chat_idempotency.request:
scope_key
idempotency_key
command_type
request_hash
response_ref
state
created_at
expires_at.

Same key with a different request hash is rejected.

Expired keys must not permit accidental replay of destructive commands.

## 21. Optimistic concurrency

Every aggregate mutation compares expected version.

If mismatch:
return VERSION_CONFLICT and refetch current state.

Never solve concurrent edits by last-write-wins for security, membership, moderation or destructive actions.

## 22. Redis boundaries

Redis may hold:
- presence TTLs
- typing TTLs
- websocket session maps
- rate-limit counters
- short-lived call/meeting coordination
- distributed locks with bounded TTL
- hot read caches.

Redis must not be the only copy of:
messages, membership, permissions, device trust, moderation decisions, credits or deletion state.

## 23. Kafka/event spine boundaries

Topics should be partitioned by aggregate key where ordering matters.

Representative topics:
quantchat.conversation
quantchat.message
quantchat.community
quantchat.media
quantchat.call
quantchat.meeting
quantchat.notification
quantchat.settings
quantchat.device
quantchat.moderation
quantchat.admin

Consumers maintain checkpoints and dedupe by event_id.

Poison events go to bounded retry/DLQ flows. Replay must be scoped and observable.

## 24. Deletion and retention

Deletion pipeline:
request → authenticate → policy evaluation → source deletion/tombstone → outbox fact → projections/index cleanup → cache cleanup → derived artifact cleanup → verification.

Retention jobs must be idempotent and resumable.

Ephemeral content expiry is a policy transition, not merely a frontend timer.

## 25. Migration strategy

Schema changes:
expand → deploy readers → backfill → deploy writers → verify → contract/cleanup.

Breaking event changes require new event version and migration period.

Never drop a column or event version while an active consumer still depends on it.

## 26. Indexing baseline

High-volume indexes:
messages by conversation and sequence
receipts by message and subject
memberships by subject and community
channels by community and slug
presence by subject
meeting participants by meeting
moderation queue by state/severity
notifications by recipient/state
device sessions by subject/state
outbox by state/next_attempt_at
idempotency by scope/key.

Use partial indexes for active/non-deleted states where appropriate.

## 27. Data protection

Encryption at rest is mandatory for durable sensitive data.

Secrets use dedicated secret-management infrastructure.

Logs must redact authentication material, private keys, session tokens and sensitive message content.

Backups are encrypted, access-controlled and retention-bound.

## 28. Test contract

Migration tests:
forward migration, rollback strategy where supported, backfill correctness and mixed-version compatibility.

Persistence tests:
constraints, tenant isolation, optimistic concurrency, idempotency, deletion, retention and recovery.

Event tests:
outbox atomicity, duplicate delivery, ordering, schema compatibility and replay.

Security tests:
IDOR, cross-tenant access, privilege escalation, stale grants, revoked-device access and admin bypass.

Performance tests:
message write/read, inbox projection, membership checks, search freshness, outbox throughput and high-cardinality realtime.

## 29. Muse execution sequence

DB-01 schemas and migrations.
DB-02 command/idempotency infrastructure.
DB-03 conversation/message persistence.
DB-04 community/channel persistence.
DB-05 media/story/Spotlight metadata.
DB-06 call/QuantMeet persistence.
DB-07 settings/device persistence.
DB-08 moderation/admin persistence.
DB-09 outbox/event publication.
DB-10 projections/search/notification persistence.
DB-11 retention/deletion workers.
DB-12 load/security/migration hardening.

Muse must inspect existing schema/migrations before creating tables and must not duplicate an existing platform-owned entity.

## Architectural invariant

**PostgreSQL owns durable truth, Redis coordinates ephemeral state, Kafka transports facts, search systems project data, object storage owns bytes, and cross-product references preserve ownership boundaries.**
